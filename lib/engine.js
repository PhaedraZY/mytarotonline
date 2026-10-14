import { randomInt, randomUUID } from 'node:crypto';

export const SPREADS = [
  { id: 'one', name: '一束星光', positions: [{ id: 'focus', label: '此刻的关注' }] },
  { id: 'three', name: '三重回响', positions: [
    { id: 'present', label: '当下' },
    { id: 'unseen', label: '未见之处' },
    { id: 'guidance', label: '前行的指引' },
  ] },
];

export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function assert(condition, status, code, message) {
  if (!condition) throw new AppError(status, code, message);
}
export function cleanText(value, max = 800) {
  assert(typeof value === 'string', 400, 'INVALID_INPUT', '请输入有效文字。');
  assert(value.length <= max, 400, 'INPUT_TOO_LONG', `文字不能超过 ${max} 个字符。`);
  return value.trim();
}
export function shuffled(items, int = randomInt) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createReading(input, catalog) {
  const spread = SPREADS.find(s => s.id === input.spreadId);
  assert(spread, 400, 'INVALID_SPREAD', '请选择单张或三张牌阵。');
  assert(typeof input.allowReversed === 'boolean', 400, 'INVALID_ORIENTATION', '请明确是否启用逆位。');
  const question = cleanText(input.question ?? '', 800) || '此刻，我可以从什么角度理解自己的状态？';
  const theme = ['lunar', 'ember', 'forest'].includes(input.theme) ? input.theme : 'lunar';
  const now = new Date().toISOString();
  return {
    id: randomUUID(), question, theme, spreadId: spread.id,
    positions: structuredClone(spread.positions), requiredCount: spread.positions.length,
    allowReversed: input.allowReversed, deckId: catalog.deckId, deckVersion: catalog.version,
    createdAt: now, updatedAt: now, status: 'selecting', drawn: [], followups: [],
    // Only opaque tokens cross the API. The unselected card sequence stays private.
    pool: shuffled(catalog.cards).map(card => ({
      token: randomUUID(), card: structuredClone(card),
      orientation: input.allowReversed && randomInt(2) ? 'reversed' : 'upright',
    })),
    interpretation: null, interpretationMeta: null, lastError: null,
  };
}

export function selectCard(reading, token) {
  assert(typeof token === 'string' && token.length <= 80, 400, 'INVALID_SLOT', '这张牌不属于本次牌阵。');
  if (reading.drawn.some(d => d.token === token)) return; // Replay is idempotent.
  assert(reading.drawn.length < reading.requiredCount, 409, 'DRAW_COMPLETE', '本次牌阵已选完，不能更换抽牌结果。');
  const slot = reading.pool.find(s => s.token === token);
  assert(slot, 400, 'INVALID_SLOT', '这张牌不属于本次牌阵。');
  const position = reading.positions[reading.drawn.length];
  reading.drawn.push({
    token, cardId: slot.card.id, positionId: position.id, positionLabel: position.label,
    orientation: slot.orientation, card: structuredClone(slot.card),
  });
  reading.updatedAt = new Date().toISOString();
  reading.status = reading.drawn.length === reading.requiredCount ? 'drawn' : 'selecting';
}

export function publicReading(reading) {
  return {
    id: reading.id, question: reading.question, theme: reading.theme,
    spreadId: reading.spreadId, positions: reading.positions,
    requiredCount: reading.requiredCount, selectedCount: reading.drawn.length,
    allowReversed: reading.allowReversed, status: reading.status,
    createdAt: reading.createdAt, updatedAt: reading.updatedAt,
    slots: reading.pool.filter(s => !reading.drawn.some(d => d.token === s.token)).map(s => ({ token: s.token })),
    drawn: reading.drawn.map(({ token, ...d }) => ({ ...d, token })),
    interpretation: reading.interpretation,
    interpretationMeta: reading.interpretationMeta,
    mode: reading.interpretationMeta?.mode ?? null,
    provider: reading.interpretationMeta?.provider ?? null,
    model: reading.interpretationMeta?.model ?? null,
    followups: reading.followups, lastError: reading.lastError,
  };
}

export function referenceInterpretation(reading) {
  return {
    summary: '以下是本次牌面的基础释义，供你自行对照问题。这段内容来自本地牌义库，没有调用 AI。',
    cards: reading.drawn.map(d => ({
      cardId: d.cardId, positionId: d.positionId, orientation: d.orientation,
      symbolAnchor: d.card[d.orientation].keywords.join(' · '),
      interpretation: `在「${d.positionLabel}」的位置，${d.card.name}${d.orientation === 'reversed' ? '逆位' : '正位'}的基础含义是：${d.card[d.orientation].meaning}`,
      reflectionQuestion: `这些象征中，哪一点最贴近你在「${d.positionLabel}」上的真实感受？`,
    })),
    synthesis: '将各张牌对应到自己的处境，比较它们之间的呼应与矛盾。基础释义不会自动推断你的个人经历。',
    actions: ['写下一个你已经知道的事实，以及一个仍需要验证的假设。'],
    closing: '牌是一个提问的入口，下一步的选择仍在你手中。',
  };
}

export function interpretationSchema(reading) {
  const string = { type: 'string' };
  const item = {
    type: 'object', additionalProperties: false,
    properties: {
      cardId: { type: 'string', enum: reading.drawn.map(d => d.cardId) },
      positionId: { type: 'string', enum: reading.positions.map(p => p.id) },
      orientation: { type: 'string', enum: ['upright', 'reversed'] },
      symbolAnchor: string, interpretation: string, reflectionQuestion: string,
    },
    required: ['cardId', 'positionId', 'orientation', 'symbolAnchor', 'interpretation', 'reflectionQuestion'],
  };
  return {
    type: 'object', additionalProperties: false,
    properties: {
      summary: string, cards: { type: 'array', items: item, minItems: reading.requiredCount, maxItems: reading.requiredCount },
      synthesis: string, actions: { type: 'array', items: string, minItems: 1, maxItems: 3 }, closing: string,
    },
    required: ['summary', 'cards', 'synthesis', 'actions', 'closing'],
  };
}

export function validateInterpretation(result, reading) {
  assert(result && typeof result === 'object' && !Array.isArray(result), 502, 'INVALID_AI_RESULT', '模型没有返回有效解读，请重试。');
  for (const key of ['summary', 'synthesis', 'closing'])
    assert(typeof result[key] === 'string' && result[key].trim() && result[key].length <= 5000, 502, 'INVALID_AI_RESULT', '模型返回的段落不完整，请重试。');
  assert(Array.isArray(result.cards) && result.cards.length === reading.drawn.length, 502, 'CARD_MISMATCH', '模型遗漏了牌面，已阻止展示，请重试解读。');
  result.cards.forEach((card, index) => {
    assert(card && typeof card === 'object' && !Array.isArray(card),
      502, 'INVALID_AI_RESULT', '模型返回的逐牌解释格式无效，请重试。');
    const expected = reading.drawn[index];
    assert(card.cardId === expected.cardId && card.positionId === expected.positionId && card.orientation === expected.orientation,
      502, 'CARD_MISMATCH', '模型改变了牌名、牌位或正逆位，已阻止展示；原抽牌结果保留。');
    for (const key of ['symbolAnchor', 'interpretation', 'reflectionQuestion'])
      assert(typeof card[key] === 'string' && card[key].trim() && card[key].length <= 5000, 502, 'INVALID_AI_RESULT', '模型返回的逐牌解释不完整。');
  });
  assert(Array.isArray(result.actions) && result.actions.length >= 1 && result.actions.length <= 3 && result.actions.every(s => typeof s === 'string' && s.trim() && s.length <= 2000),
    502, 'INVALID_AI_RESULT', '模型没有返回有效的行动建议。');
  // Reconstruct allowed fields so unexpected model output never becomes app state.
  return {
    summary: result.summary,
    cards: result.cards.map(c => Object.fromEntries(['cardId', 'positionId', 'orientation', 'symbolAnchor', 'interpretation', 'reflectionQuestion'].map(k => [k, c[k]]))),
    synthesis: result.synthesis, actions: result.actions, closing: result.closing,
  };
}
