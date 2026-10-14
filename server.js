import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Store } from './lib/store.js';
import { AppError, assert, cleanText, createReading, selectCard, publicReading, SPREADS } from './lib/engine.js';
import { activeProvider, providerConfig, publicSettings, saveProviderSettings, interpret, followup, testProvider } from './lib/providers.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

async function bodyJson(request) {
  assert((request.headers['content-type'] || '').startsWith('application/json'), 415, 'JSON_REQUIRED', '请求需要使用 JSON 格式。');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    assert(size <= 12 * 1024 * 1024, 413, 'BODY_TOO_LARGE', '图片或请求过大，单张图片请小于 8MB。');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new AppError(400, 'INVALID_JSON', '请求内容不是有效 JSON。'); }
  assert(value && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_JSON', '请求内容必须是对象。');
  return value;
}

function send(response, status, value) {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export async function createApp(options = {}) {
  const root = options.root || ROOT;
  const runtime = options.runtime || path.join(root, '.runtime');
  const env = options.env || process.env;
  const baseCatalog = options.catalog || JSON.parse(await fs.readFile(path.join(root, 'data/cards.json'), 'utf8'));
  assert(baseCatalog.cards.length === 78 && new Set(baseCatalog.cards.map(c => c.id)).size === 78, 500, 'INVALID_CATALOG', '牌库必须包含 78 张唯一牌。');
  const store = await new Store(runtime).init();
  const inFlight = new Map();
  const followupBusy = new Set();
  const requestIds = new Map(store.readings.filter(r => r.clientRequestId).map(r => [r.clientRequestId, r.id]));
  const invoke = options.interpret || interpret;
  const followupInvoke = options.followup || followup;
  const testInvoke = options.testProvider || testProvider;
  const providerOptions = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
  let activeGenerations = 0;
  const usageWindow = [];

  const catalog = () => ({
    ...baseCatalog,
    version: `${baseCatalog.version}+${Object.values(store.overrides).map(v => v.updatedAt).sort().at(-1) || 'classic'}`,
    cards: baseCatalog.cards.map(c => ({ ...c, image: store.overrides[c.id]?.image || c.image, custom: Boolean(store.overrides[c.id]) })),
  });
  const findReading = id => {
    const reading = store.getReading(id);
    assert(reading, 404, 'READING_NOT_FOUND', '找不到这次记录。');
    return reading;
  };
  async function limitedGeneration(action) {
    const now = Date.now();
    while (usageWindow.length && usageWindow[0] < now - 3600000) usageWindow.shift();
    assert(usageWindow.length < (Number(env.TAROT_HOURLY_LIMIT) || 100), 429, 'HOURLY_LIMIT', '已达到本小时的 AI 请求上限，请稍后再试。');
    assert(activeGenerations < 2, 429, 'MODEL_BUSY', '模型正在处理其他请求，请稍后再试。');
    usageWindow.push(now);
    activeGenerations++;
    try { return await action(); } finally { activeGenerations--; }
  }

  async function staticFile(request, response, pathname) {
    let file;
    if (pathname.startsWith('/uploads/')) {
      const filename = pathname.slice('/uploads/'.length);
      assert(/^[a-f0-9-]{36}\.webp$/.test(filename), 404, 'NOT_FOUND', '文件不存在。');
      file = path.join(runtime, 'uploads', filename);
    } else {
      const publicRoot = path.join(root, 'public');
      file = path.resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      assert(file.startsWith(`${publicRoot}${path.sep}`) && !pathname.split('/').some(p => p.startsWith('.')), 404, 'NOT_FOUND', '文件不存在。');
    }
    let data;
    try { data = await fs.readFile(file); }
    catch (error) { if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) throw new AppError(404, 'NOT_FOUND', '文件不存在。'); throw error; }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') || pathname.startsWith('/uploads/') ? 'public, max-age=86400' : 'no-cache',
      'Content-Length': data.length,
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  }

  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    try {
      const host = request.headers.host || '';
      assert(/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host), 403, 'LOCAL_ONLY', '此版本仅接受本机访问。');
      if (request.headers.origin) {
        assert(request.headers.origin === `http://${host}`, 403, 'CROSS_ORIGIN', '不接受来自其他网站的请求。');
      }
      assert(!request.headers['sec-fetch-site'] || request.headers['sec-fetch-site'] !== 'cross-site', 403, 'CROSS_ORIGIN', '不接受跨站请求。');
      const url = new URL(request.url, `http://${host}`);
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { throw new AppError(400, 'INVALID_PATH', '路径无效。'); }
      assert(!pathname.includes('\0') && !pathname.includes('\\'), 400, 'INVALID_PATH', '路径无效。');
      if (!pathname.startsWith('/api/')) {
        assert(['GET', 'HEAD'].includes(request.method), 405, 'METHOD_NOT_ALLOWED', '不支持这个请求方式。');
        return await staticFile(request, response, pathname);
      }
      if (request.method === 'GET' && pathname === '/api/catalog') {
        const current = catalog();
        return send(response, 200, { deck: { id: current.deckId, name: '韦特经典 · 原版扫描', version: current.version, cardCount: current.cards.length }, cards: current.cards, spreads: SPREADS });
      }
      if (request.method === 'GET' && ['/api/settings', '/api/health'].includes(pathname)) {
        const settings = await publicSettings(store, env, options.fetchImpl);
        return send(response, 200, pathname === '/api/health' ? { ok: true, version: '0.2.0', ...settings } : settings);
      }
      if (request.method === 'GET' && pathname === '/api/history') {
        return send(response, 200, { readings: [...store.readings].reverse().slice(0, 80).map(r => ({ id: r.id, question: r.question, createdAt: r.createdAt, status: r.status, cardNames: r.drawn.map(d => d.card.name), theme: r.theme })) });
      }
      const readingMatch = pathname.match(/^\/api\/readings\/([a-f0-9-]{36})(?:\/(select|interpret|followups))?$/);
      if (request.method === 'GET' && readingMatch && !readingMatch[2]) return send(response, 200, publicReading(findReading(readingMatch[1])));
      assert(request.method === 'POST', 405, 'METHOD_NOT_ALLOWED', '此接口需要 POST 请求。');
      const input = await bodyJson(request);
      if (pathname === '/api/settings') {
        await saveProviderSettings(store, input);
        return send(response, 200, await publicSettings(store, env, options.fetchImpl));
      }
      if (pathname === '/api/models/test') {
        const config = providerConfig(store, input.provider || activeProvider(store, env), env);
        return send(response, 200, await limitedGeneration(() => testInvoke(config, providerOptions)));
      }
      if (pathname === '/api/readings') {
        const requestId = input.clientRequestId;
        if (requestId !== undefined) assert(typeof requestId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(requestId), 400, 'INVALID_REQUEST_ID', '请求标识无效。');
        if (requestId && requestIds.has(requestId)) return send(response, 200, publicReading(findReading(requestIds.get(requestId))));
        assert(store.readings.length < 5000, 409, 'HISTORY_FULL', '本地记录已达到 5000 条，请先备份整理。');
        const reading = createReading(input, catalog());
        if (requestId) { reading.clientRequestId = requestId; requestIds.set(requestId, reading.id); }
        store.readings.push(reading);
        await store.saveReadings();
        return send(response, 201, publicReading(reading));
      }
      if (readingMatch) {
        const reading = findReading(readingMatch[1]);
        const action = readingMatch[2];
        if (action === 'select') {
          selectCard(reading, input.token);
          await store.saveReadings();
          return send(response, 200, publicReading(reading));
        }
        if (action === 'interpret') {
          assert(!followupBusy.has(reading.id), 409, 'READING_BUSY', '这次牌阵的追问正在处理，请稍后再试。');
          assert(reading.drawn.length === reading.requiredCount, 409, 'DRAW_INCOMPLETE', '请先完成本次选牌。');
          const id = input.provider || activeProvider(store, env);
          const config = providerConfig(store, id, env);
          const pending = inFlight.get(reading.id);
          if (pending) {
            assert(pending.kind === 'interpret' && pending.provider === id && pending.model === config.model,
              409, 'READING_BUSY', '这次牌阵正在使用另一个解读服务或模型，请等当前解读结束后再切换。');
            return send(response, 200, await pending.task);
          }
          const previous = reading.interpretationMeta;
          if (reading.interpretation && previous?.provider === id && previous?.model === config.model)
            return send(response, 200, { readingId: reading.id, status: 'complete', interpretation: reading.interpretation, ...previous });
          if (!inFlight.has(reading.id)) {
            const task = (async () => {
              reading.status = 'interpreting';
              reading.lastError = null;
              await store.saveReadings();
              try {
                const generated = id === 'reference' ? await invoke(reading, config, providerOptions) : await limitedGeneration(() => invoke(reading, config, providerOptions));
                reading.interpretation = generated.result;
                reading.interpretationMeta = { mode: generated.mode, provider: generated.provider, model: generated.model, latencyMs: generated.latencyMs, usage: generated.usage, promptVersion: 'lunaria-v1' };
                reading.status = 'complete';
                reading.updatedAt = new Date().toISOString();
                await store.saveReadings();
                return { readingId: reading.id, status: 'complete', interpretation: reading.interpretation, ...reading.interpretationMeta };
              } catch (error) {
                reading.status = reading.interpretation ? 'complete' : 'drawn';
                reading.lastError = error instanceof AppError ? error.message : '解读暂时失败，牌面已保留。';
                await store.saveReadings();
                throw error;
              } finally { inFlight.delete(reading.id); }
            })();
            inFlight.set(reading.id, { kind: 'interpret', provider: id, model: config.model, task });
          }
          return send(response, 200, await inFlight.get(reading.id).task);
        }
        if (action === 'followups') {
          assert(reading.interpretation, 409, 'INTERPRET_FIRST', '请先完成本次解读。');
          assert(reading.followups.length < 10, 429, 'FOLLOWUP_LIMIT', '本次牌阵已完成 10 次追问，可以回看手记或开启新问题。');
          const question = cleanText(input.question, 800);
          assert(question, 400, 'EMPTY_QUESTION', '请写下你想追问的内容。');
          const config = providerConfig(store, input.provider || activeProvider(store, env), env);
          assert(!inFlight.has(reading.id), 409, 'READING_BUSY', '这次牌阵还有一个解读请求正在处理。');
          const task = limitedGeneration(() => followupInvoke(reading, question, config, providerOptions));
          inFlight.set(reading.id, { kind: 'followup', provider: config.id, model: config.model, task });
          followupBusy.add(reading.id);
          try {
            const result = await task;
            reading.followups.push({ question, ...result, createdAt: new Date().toISOString() });
            await store.saveReadings();
            return send(response, 200, result);
          } finally { inFlight.delete(reading.id); followupBusy.delete(reading.id); }
        }
      }
      if (pathname === '/api/assets/upload') {
        assert(baseCatalog.cards.some(c => c.id === input.cardId), 400, 'INVALID_CARD', '请选择有效的标准牌 ID。');
        assert(typeof input.imageDataUrl === 'string', 400, 'INVALID_IMAGE', '请选择图片文件。');
        const match = input.imageDataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
        assert(match, 400, 'INVALID_IMAGE', '支持 JPG、PNG、WebP 图片，不支持 SVG 或动画。');
        const buffer = Buffer.from(match[2], 'base64');
        assert(buffer.length > 0 && buffer.length <= 8 * 1024 * 1024, 413, 'IMAGE_TOO_LARGE', '单张图片请小于 8MB。');
        let output;
        try {
          const metadata = await sharp(buffer, { limitInputPixels: 32000000 }).metadata();
          assert(['jpeg', 'png', 'webp'].includes(metadata.format) && (metadata.pages || 1) === 1, 400, 'INVALID_IMAGE', '请上传静态 JPG、PNG 或 WebP 图片。');
          assert(metadata.width >= 200 && metadata.height >= 300, 400, 'IMAGE_TOO_SMALL', '牌面至少需要 200×300 像素。');
          output = await sharp(buffer, { limitInputPixels: 32000000 }).rotate().resize({ width: 1400, height: 2100, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
        } catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, 'INVALID_IMAGE', '图片无法解码或尺寸过大，请换一张静态图片。'); }
        const filename = `${randomUUID()}.webp`;
        const uploads = path.join(runtime, 'uploads');
        await fs.mkdir(uploads, { recursive: true });
        await fs.writeFile(path.join(uploads, filename), output);
        store.overrides[input.cardId] = { image: `/uploads/${filename}`, updatedAt: new Date().toISOString(), originalName: typeof input.filename === 'string' ? path.basename(input.filename).slice(0, 180) : '' };
        await store.saveOverrides();
        return send(response, 200, { cardId: input.cardId, image: `/uploads/${filename}`, customCardCount: Object.keys(store.overrides).length });
      }
      if (pathname === '/api/deck/reset') {
        store.overrides = {};
        await store.saveOverrides(); // Historical image files and reading snapshots are intentionally retained.
        return send(response, 200, { ok: true });
      }
      throw new AppError(404, 'NOT_FOUND', '接口不存在。');
    } catch (error) {
      if (!(error instanceof AppError)) console.error('[lunaria]', error.code || error.name || 'InternalError');
      send(response, error.status || 500, { error: error.code || 'INTERNAL_ERROR', message: error instanceof AppError ? error.message : '服务暂时遇到问题，请重试。' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, store, catalog };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  const { server } = await createApp();
  server.listen(port, '127.0.0.1', () => console.log(`LUNARIA is ready at http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(`Server could not start: ${error.code || error.name}`); process.exitCode = 1; });
}
