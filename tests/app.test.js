import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server.js';
import { createReading, referenceInterpretation, validateInterpretation } from '../lib/engine.js';
import { generateJson, validateEndpoint, providerConfig, publicSettings } from '../lib/providers.js';

const catalog = JSON.parse(await fs.readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const input = { question: '我可以如何开始新的创作？', spreadId: 'three', allowReversed: true, theme: 'lunar' };

async function fixture(t, extra = {}) {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'lunaria-test-'));
  const app = await createApp({ runtime, catalog, env: { TAROT_PROVIDER: 'reference' }, ...extra });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    assert.ok(path.resolve(runtime).startsWith(path.join(os.tmpdir(), 'lunaria-test-')));
    await fs.rm(runtime, { recursive: true, force: true });
  });
  const request = async (url, body, headers = {}) => {
    const response = await fetch(`${base}${url}`, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { ...app, runtime, base, request };
}

test('真实78牌目录含完整22/56与四花色，正逆位内容和图片路径完整', () => {
  assert.equal(catalog.cards.length, 78);
  assert.equal(new Set(catalog.cards.map(c => c.id)).size, 78);
  assert.equal(catalog.cards.filter(c => c.arcana === 'major').length, 22);
  for (const suit of ['wands', 'cups', 'swords', 'pentacles']) assert.equal(catalog.cards.filter(c => c.suit === suit).length, 14);
  for (const c of catalog.cards) {
    assert.match(c.image, /^\/assets\/decks\/rws\//);
    for (const direction of ['upright', 'reversed']) {
      assert.ok(c[direction].meaning.length >= 30);
      assert.ok(c[direction].keywords.length >= 2);
    }
  }
});

test('选牌幂等、无重复、隐藏未选牌、禁止换牌，失败和恢复均保留快照', async t => {
  const { request, store, runtime } = await fixture(t);
  let response = await request('/api/readings', { ...input, clientRequestId: 'stable-request-123' });
  assert.equal(response.status, 201);
  const first = response.body;
  assert.equal(first.slots.length, 78);
  assert.ok(first.slots.every(s => Object.keys(s).join() === 'token'));
  assert.equal(first.pool, undefined);
  assert.equal((await request('/api/readings', { ...input, clientRequestId: 'stable-request-123' })).body.id, first.id);
  assert.equal((await request(`/api/readings/${first.id}/interpret`, {})).status, 409);
  assert.equal((await request(`/api/readings/${first.id}/select`, { token: 'forged' })).status, 400);
  const route = `/api/readings/${first.id}/select`;
  const [a, b] = await Promise.all([request(route, { token: first.slots[0].token }), request(route, { token: first.slots[0].token })]);
  assert.equal(a.body.selectedCount, 1);
  assert.equal(b.body.selectedCount, 1);
  await request(route, { token: first.slots[1].token });
  response = await request(route, { token: first.slots[2].token });
  const drawn = response.body.drawn;
  assert.equal(new Set(drawn.map(d => d.cardId)).size, 3);
  assert.equal(response.body.slots.length, 75);
  assert.equal((await request(route, { token: first.slots[3].token })).status, 409);
  const completed = await request(`/api/readings/${first.id}/interpret`, { provider: 'reference' });
  assert.equal(completed.body.mode, 'reference');
  assert.equal(completed.body.interpretation.cards.length, 3);
  const missingCloudKey = await request(`/api/readings/${first.id}/interpret`, { provider: 'qwen' });
  assert.equal(missingCloudKey.body.error, 'MISSING_API_KEY');
  assert.deepEqual((await request(`/api/readings/${first.id}`)).body.drawn, drawn);
  await store.queue;
  const saved = JSON.parse(await fs.readFile(path.join(runtime, 'readings.json'), 'utf8'));
  assert.deepEqual(saved[0].drawn.map(d => d.cardId), drawn.map(d => d.cardId));
  const restored = await createApp({ runtime, catalog, env: {} });
  assert.deepEqual(restored.store.readings[0].drawn, store.readings[0].drawn);
});

test('并发解读合并成一次模型请求', async t => {
  let calls = 0;
  const app = await fixture(t, { interpret: async (reading, config) => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 50));
    return { result: referenceInterpretation(reading), provider: config.id, model: config.model, mode: 'ai', latencyMs: 50 };
  } });
  const r = (await app.request('/api/readings', { ...input, spreadId: 'one', allowReversed: false })).body;
  await app.request(`/api/readings/${r.id}/select`, { token: r.slots[0].token });
  const answers = await Promise.all([app.request(`/api/readings/${r.id}/interpret`, { provider: 'local' }), app.request(`/api/readings/${r.id}/interpret`, { provider: 'local' })]);
  assert.equal(calls, 1);
  assert.equal(answers[0].body.interpretation.cards[0].orientation, 'upright');
  assert.deepEqual(answers[0].body, answers[1].body);
});

test('进行中的解读拒绝不同供应商或模型，包括已经缓存的旧解读', async t => {
  let markStarted, release;
  const started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let localCalls = 0;
  const app = await fixture(t, { interpret: async (reading, config) => {
    if (config.id === 'local') { localCalls++; markStarted(); await gate; }
    return { result: referenceInterpretation(reading), provider: config.id, model: config.model, mode: config.id === 'reference' ? 'reference' : 'ai', latencyMs: 0 };
  } });
  const reading = (await app.request('/api/readings', { ...input, spreadId: 'one' })).body;
  await app.request(`/api/readings/${reading.id}/select`, { token: reading.slots[0].token });
  const route = `/api/readings/${reading.id}/interpret`;
  assert.equal((await app.request(route, { provider: 'reference' })).status, 200);
  const originalModel = providerConfig(app.store, 'local', {}).model;
  const first = app.request(route, { provider: 'local' });
  await started;
  try {
    const differentProvider = await app.request(route, { provider: 'reference' });
    assert.equal(differentProvider.status, 409);
    assert.equal(differentProvider.body.error, 'READING_BUSY');
    app.store.settings.providers.local = { model: 'different-local-model:9b' };
    const differentModel = await app.request(route, { provider: 'local' });
    assert.equal(differentModel.status, 409);
    assert.equal(differentModel.body.error, 'READING_BUSY');
    assert.equal(localCalls, 1);
    assert.equal(app.store.getReading(reading.id).interpretationMeta.provider, 'reference');
  } finally { release(); }
  const completed = await first;
  assert.equal(completed.status, 200);
  assert.equal(completed.body.provider, 'local');
  assert.equal(completed.body.model, originalModel);
  assert.equal(app.store.getReading(reading.id).interpretationMeta.model, originalModel);
});

test('追问锁阻止并发追问和解读，完成后释放且只保存一条回答', async t => {
  let markStarted, release;
  const started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const app = await fixture(t, {
    interpret: async (reading, config) => ({ result: referenceInterpretation(reading), provider: config.id, model: config.model, mode: 'ai', latencyMs: 0 }),
    followup: async (_reading, _question, config) => {
      calls++; markStarted(); await gate;
      return { answer: '继续观察自己的创作节奏。', provider: config.id, model: config.model };
    },
  });
  const reading = (await app.request('/api/readings', { ...input, spreadId: 'one' })).body;
  await app.request(`/api/readings/${reading.id}/select`, { token: reading.slots[0].token });
  const route = `/api/readings/${reading.id}`;
  await app.request(`${route}/interpret`, { provider: 'local' });
  const first = app.request(`${route}/followups`, { provider: 'local', question: '我可以如何迈出第一步？' });
  await started;
  try {
    assert.equal((await app.request(`${route}/interpret`, { provider: 'local' })).status, 409);
    assert.equal((await app.request(`${route}/interpret`, { provider: 'reference' })).status, 409);
    assert.equal((await app.request(`${route}/followups`, { provider: 'local', question: '另一个问题' })).status, 409);
    assert.equal(calls, 1);
  } finally { release(); }
  assert.equal((await first).status, 200);
  assert.equal(app.store.getReading(reading.id).followups.length, 1);
  assert.equal((await app.request(`${route}/interpret`, { provider: 'local' })).status, 200);
});

test('图片上传校验、历史牌面快照保留、恢复经典不删除历史资产', async t => {
  const { request, base } = await fixture(t);
  const cardId = catalog.cards[0].id;
  assert.equal((await request('/api/assets/upload', { cardId, imageDataUrl: 'data:image/png;base64,bm90LWFuLWltYWdl' })).status, 400);
  assert.equal((await request('/api/assets/upload', { cardId: 'not-a-card', imageDataUrl: '' })).status, 400);
  const png = await sharp({ create: { width: 300, height: 450, channels: 3, background: '#cab68b' } }).png().toBuffer();
  const uploaded = await request('/api/assets/upload', { cardId, filename: '../../card.png', imageDataUrl: `data:image/png;base64,${png.toString('base64')}` });
  assert.equal(uploaded.status, 200);
  assert.match(uploaded.body.image, /^\/uploads\/[a-f0-9-]+\.webp$/);
  assert.equal((await request('/api/catalog')).body.cards[0].image, uploaded.body.image);
  assert.equal((await fetch(`${base}${uploaded.body.image}`)).headers.get('content-type'), 'image/webp');
  const reading = (await request('/api/readings', input)).body;
  await request('/api/deck/reset', {});
  assert.equal((await request('/api/catalog')).body.cards[0].image, catalog.cards[0].image);
  assert.equal((await fetch(`${base}${uploaded.body.image}`)).status, 200);
  assert.equal((await request(`/api/readings/${reading.id}`)).body.slots.length, 78);
});

test('跨站请求、内部文件和外部模型地址被拒绝，设置不泄露密钥', async t => {
  const { request, base, store } = await fixture(t);
  assert.equal((await request('/api/readings', input, { Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await fetch(`${base}/.runtime/settings.json`)).status, 404);
  assert.equal((await request('/api/settings', { provider: 'qwen', baseUrl: 'https://unrelated.example/v1', apiKey: 'sk-test-not-real' })).status, 400);
  store.settings.providers.qwen = { apiKey: 'sk-test-secret-not-real' };
  const settings = await publicSettings(store, {}, async () => new Response(JSON.stringify({ models: [] })));
  assert.ok(!JSON.stringify(settings).includes('sk-test'));
  assert.ok(settings.providers.find(p => p.id === 'qwen').configured);
  assert.throws(() => validateEndpoint('local', 'http://192.168.1.2:11434'));
  assert.throws(() => validateEndpoint('qwen', 'https://dashscope.aliyuncs.com.evil.example/v1'));
});

test('模型牌名/牌位/正逆位错误不能进入结果', () => {
  const reading = createReading(input, catalog);
  reading.drawn = reading.pool.slice(0, 3).map((s, i) => ({ cardId: s.card.id, card: s.card, orientation: s.orientation, positionId: reading.positions[i].id, positionLabel: reading.positions[i].label }));
  const good = referenceInterpretation(reading);
  assert.deepEqual(validateInterpretation(good, reading), good);
  for (const field of ['cardId', 'positionId', 'orientation']) {
    const wrong = structuredClone(good); wrong.cards[0][field] = 'wrong';
    assert.throws(() => validateInterpretation(wrong, reading), error => error.code === 'CARD_MISMATCH');
  }
  for (const malformed of [null, undefined, [], 'not-a-card', 42]) {
    const wrong = structuredClone(good); wrong.cards[0] = malformed;
    assert.throws(() => validateInterpretation(wrong, reading), error => error.status === 502 && error.code === 'INVALID_AI_RESULT');
  }
  assert.throws(() => validateInterpretation({ ...good, cards: [] }, reading));
});

test('云端与本地适配器的请求格式通过模拟契约检查（不调用付费服务）', async () => {
  const schema = { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false };
  for (const id of ['local', 'qwen', 'deepseek', 'openai']) {
    const config = providerConfig({ settings: { providers: {} } }, id, { DASHSCOPE_API_KEY: 'fake-qwen', DEEPSEEK_API_KEY: 'fake-deepseek', OPENAI_API_KEY: 'fake-openai' });
    const result = await generateJson(config, [{ role: 'user', content: '仅JSON' }], schema, { fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(options.redirect, 'error');
      if (id === 'local') { assert.equal(body.think, false); assert.deepEqual(body.format, schema); }
      if (id === 'qwen') { assert.equal(body.enable_thinking, false); assert.equal(body.response_format.json_schema.strict, true); }
      if (id === 'deepseek') assert.equal(body.response_format.type, 'json_object');
      if (id === 'openai') assert.equal(body.reasoning_effort, 'none');
      return new Response(JSON.stringify(id === 'local' ? { message: { content: '{"message":"已连接"}' } } : { choices: [{ message: { content: '{"message":"已连接"}' }, finish_reason: 'stop' }] }));
    } });
    assert.equal(result.result.message, '已连接');
  }
});
