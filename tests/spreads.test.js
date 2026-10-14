import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SPREADS, createReading, selectCard, publicReading, referenceInterpretation as serverReference, validateInterpretation } from '../lib/engine.js';
import { createReadingRecord, selectRecord, referenceInterpretation as browserReference } from '../public/static-api.js';

const catalog = JSON.parse(await fs.readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const browserCatalog = { deck: { id: catalog.deckId, version: catalog.version }, cards: catalog.cards, spreads: SPREADS };
const adapters = [
  { name: 'Node', create: input => createReading(input, catalog), select: selectCard, reference: serverReference, invalidSlot: 'INVALID_SLOT', expose: publicReading },
  { name: 'Pages', create: input => createReadingRecord(input, browserCatalog), select: selectRecord, reference: browserReference, invalidSlot: 'INVALID_INPUT' },
];
const selectedIndices = [12, 32, 70, 5, 59];
const inputFor = spreadId => ({ question: '我该怎样为创作安排时间，又照顾好目前的生活？', theme: 'lunar', spreadId, allowReversed: true });
const poolIdentity = reading => reading.pool.map(slot => ({ token: slot.token, cardId: slot.card.id, orientation: slot.orientation }));

test('六种牌阵提供唯一牌位和可独立阅读的位置说明', () => {
  assert.deepEqual(SPREADS.map(spread => spread.id), ['one', 'three', 'timeline', 'decision', 'relationship', 'cross']);
  for (const spread of SPREADS) {
    assert.ok([1, 3, 5].includes(spread.positions.length));
    assert.equal(new Set(spread.positions.map(position => position.id)).size, spread.positions.length);
    assert.ok(spread.name && spread.description && spread.layout && spread.questionHint);
    for (const position of spread.positions) assert.ok(position.label && position.description);
  }
});

for (const adapter of adapters) {
  for (const spread of SPREADS) {
    test(`${adapter.name} · ${spread.name}：一次洗牌后按原位置连续抽取，恢复中途记录也保持原牌`, () => {
      const reading = adapter.create(inputFor(spread.id));
      assert.equal(reading.requiredCount, spread.positions.length);
      assert.equal(reading.spreadId, spread.id);
      assert.equal(reading.spreadName, spread.name);
      assert.equal(reading.layout, spread.layout);
      assert.deepEqual(reading.positions, spread.positions);
      assert.notEqual(reading.positions, spread.positions, '会话必须保留自己的牌位快照');

      const originalPool = poolIdentity(reading);
      assert.equal(originalPool.length, 78);
      assert.equal(new Set(originalPool.map(slot => slot.token)).size, 78);
      assert.equal(new Set(originalPool.map(slot => slot.cardId)).size, 78);
      assert.ok(originalPool.every(slot => ['upright', 'reversed'].includes(slot.orientation)));
      const beforeInvalid = structuredClone(reading);
      assert.throws(() => adapter.select(reading, 'forged-slot'), error => error.code === adapter.invalidSlot);
      assert.deepEqual(reading, beforeInvalid, '无效选择不能改变抽牌状态');

      let restored;
      for (let drawIndex = 0; drawIndex < reading.requiredCount; drawIndex++) {
        const source = originalPool[selectedIndices[drawIndex]];
        adapter.select(reading, source.token);
        assert.deepEqual(poolIdentity(reading), originalPool, '抽一张不能重新洗牌、删除位置或重置正逆位');
        const drawn = reading.drawn[drawIndex];
        assert.deepEqual(
          [drawn.token, drawn.cardId, drawn.orientation, drawn.positionId, drawn.positionLabel],
          [source.token, source.cardId, source.orientation, spread.positions[drawIndex].id, spread.positions[drawIndex].label],
        );
        assert.equal(reading.drawn.length, drawIndex + 1);
        assert.equal(reading.status, drawIndex + 1 === reading.requiredCount ? 'drawn' : 'selecting');
        const afterSelection = structuredClone(reading);
        adapter.select(reading, source.token);
        assert.deepEqual(reading, afterSelection, '重放同一次选择必须完全幂等');

        if (restored) {
          adapter.select(restored, source.token);
          assert.deepEqual(restored.drawn, reading.drawn, '序列化恢复后，相同位置必须得到相同牌与方向');
          assert.deepEqual(poolIdentity(restored), originalPool);
        } else {
          restored = JSON.parse(JSON.stringify(reading));
          assert.deepEqual(restored.drawn, reading.drawn);
          assert.deepEqual(poolIdentity(restored), originalPool);
        }

        if (adapter.expose) {
          const visible = adapter.expose(reading);
          assert.equal(visible.pool, undefined);
          assert.equal(visible.slots.length, 78, '已抽位置要保留，邻近牌不能向前补位');
          assert.deepEqual(visible.slots.map(slot => slot.token), originalPool.map(slot => slot.token));
          assert.equal(visible.slots.filter(slot => slot.selected).length, drawIndex + 1);
          assert.equal(visible.slots[selectedIndices[drawIndex]].selected, true);
          assert.ok(visible.slots.every(slot => Object.keys(slot).sort().join(',') === 'selected,token'), '未抽牌身份不可通过 API 泄露');
          assert.equal(visible.selectedCount, drawIndex + 1);
        }
      }

      assert.equal(new Set(reading.drawn.map(draw => draw.cardId)).size, reading.requiredCount);
      const completed = structuredClone(reading);
      assert.throws(() => adapter.select(reading, originalPool[0].token), error => error.code === 'DRAW_COMPLETE');
      assert.deepEqual(reading, completed, '超额抽牌不能覆盖已经选好的结果');
    });
  }

  test(`${adapter.name}：关闭逆位后整副牌与最终结果都保持正位`, () => {
    const reading = adapter.create({ ...inputFor('decision'), allowReversed: false });
    assert.ok(reading.pool.every(slot => slot.orientation === 'upright'));
    for (const index of selectedIndices) adapter.select(reading, reading.pool[index].token);
    assert.ok(reading.drawn.every(draw => draw.orientation === 'upright'));
  });

  test(`${adapter.name}：扩展牌义按方向和具体牌位解释，旧快照缺少新字段仍可展示`, () => {
    const reading = adapter.create(inputFor('relationship'));
    for (const index of selectedIndices) adapter.select(reading, reading.pool[index].token);
    for (const [index, draw] of reading.drawn.entries()) {
      draw.orientation = index % 2 ? 'reversed' : 'upright';
      draw.card.symbolism = `画面象征标记 ${index}`;
      for (const direction of ['upright', 'reversed']) {
        draw.card[direction] = {
          keywords: [`关键词 ${index} ${direction}`], meaning: `核心牌义标记 ${index} ${direction}`,
          everyday: `日常表现标记 ${index} ${direction}`, relationships: `关系观察标记 ${index} ${direction}`,
          work: `工作观察标记 ${index} ${direction}`, advice: `可选行动标记 ${index} ${direction}`, reflection: `反思问题标记 ${index} ${direction}`,
        };
      }
    }
    const result = adapter.reference(reading);
    assert.deepEqual(validateInterpretation(result, reading), result);
    for (const [index, card] of result.cards.entries()) {
      const draw = reading.drawn[index];
      const direction = draw.orientation;
      const other = direction === 'upright' ? 'reversed' : 'upright';
      assert.deepEqual([card.cardId, card.positionId, card.orientation], [draw.cardId, draw.positionId, direction]);
      for (const text of [draw.card.symbolism, draw.card[direction].meaning, draw.positionLabel, reading.positions[index].description,
        draw.card[direction].relationships, draw.card[direction].advice]) assert.ok(card.interpretation.includes(text));
      assert.equal(card.reflectionQuestion, draw.card[direction].reflection);
      assert.ok(!card.interpretation.includes(draw.card[other].meaning));
      assert.ok(!card.interpretation.includes(draw.card[direction].everyday), '关系牌阵优先使用关系示例');
    }
    assert.equal(result.actions[0], reading.drawn.at(-1).card[reading.drawn.at(-1).orientation].advice);

    const legacy = JSON.parse(JSON.stringify(reading));
    for (const position of legacy.positions) delete position.description;
    for (const draw of legacy.drawn) {
      delete draw.card.symbolism;
      for (const direction of ['upright', 'reversed']) {
        const { keywords, meaning } = draw.card[direction];
        draw.card[direction] = { keywords, meaning };
      }
    }
    const fallback = adapter.reference(legacy);
    assert.deepEqual(validateInterpretation(fallback, legacy), fallback);
    assert.ok(!JSON.stringify(fallback).includes('undefined'));
    for (const [index, card] of fallback.cards.entries()) {
      const draw = legacy.drawn[index];
      assert.ok(card.interpretation.includes(draw.card[draw.orientation].meaning));
      assert.ok(card.interpretation.includes(draw.positionLabel));
      assert.ok(card.reflectionQuestion.includes(draw.positionLabel));
    }
  });
}
