import { randomInt, randomUUID } from 'node:crypto';
export { referenceInterpretation } from '../public/reading-guide.js';

export const SPREADS = [
  { id: 'one', name: '一束微光', layout: 'single', description: '一个问题，一个观察角度。适合每日抽牌或整理此刻的感受。', questionHint: '今天面对这件事，我可以先留意什么？', positions: [
    { id: 'focus', label: '此刻的关注', description: '把这张牌看作今天值得留意的一个角度，而不是对整件事的定论。' },
  ] },
  { id: 'three', name: '内心的回响', layout: 'row', description: '从当下、盲点与行动三个角度，整理一件具体的心事。', questionHint: '面对新的机会，我有哪些期待、顾虑和可以尝试的行动？', positions: [
    { id: 'present', label: '当下', description: '先辨认目前最影响你的感受、做法或现实条件，并用一件具体事情核对。' },
    { id: 'unseen', label: '未见之处', description: '看看是否遗漏了某种需要、资源或限制；这是待核实的线索，不是被揭露的秘密。' },
    { id: 'guidance', label: '前行的指引', description: '把牌义转成一个可以尝试的小调整，不要求你立刻作出重大决定。' },
  ] },
  { id: 'timeline', name: '时间之河', layout: 'row', description: '过去、现在与接下来的倾向。适合看清一个阶段如何走到今天。', questionHint: '这段停滞是怎样形成的？如果继续目前的做法，我需要留意什么？', positions: [
    { id: 'past', label: '过去的影响', description: '回看哪些经历或习惯仍在影响这件事；不要仅凭牌面认定曾经发生过什么。' },
    { id: 'present', label: '现在的处境', description: '关注现在最直接的矛盾或资源，分清仍在起作用的旧习惯与新的选择。' },
    { id: 'direction', label: '接下来的倾向', description: '探索延续当前做法时可能发展的方向；这是可调整的趋势，不是注定会发生的结果。' },
  ] },
  { id: 'decision', name: '岔路之间', layout: 'decision', description: '对照两个选项的帮助与代价。先写清 A 和 B，再考虑自己的取舍。', questionHint: 'A 是留在现有工作，B 是接受新机会。我最看重什么，各自需要承担什么？', positions: [
    { id: 'criterion', label: '我的选择标准', description: '先明确这次选择中真正重要的需要与底线，再比较两个选项。' },
    { id: 'a-support', label: 'A · 可能的帮助', description: '把选项 A 具体写出来，探索它可能满足的需要、资源或机会。困难的牌也可能提示有价值的学习。' },
    { id: 'a-cost', label: 'A · 需要的付出', description: '看看选择 A 可能需要哪些投入、适应或让步；正位也可能提醒一种需要持续维护的条件。' },
    { id: 'b-support', label: 'B · 可能的帮助', description: '把选项 B 具体写出来，探索它可能满足的需要、资源或机会，并与 A 使用同样的标准。' },
    { id: 'b-cost', label: 'B · 需要的付出', description: '看看选择 B 的投入、适应或限制是否可承受。不要只凭一张牌替自己作决定。' },
  ] },
  { id: 'relationship', name: '关系之桥', layout: 'relationship', description: '看见自己的需要、互动和沟通方向。适合伴侣、朋友或合作关系。', questionHint: '最近我们常因沟通节奏不同而不安，我需要什么，又能怎样把话说清楚？', positions: [
    { id: 'needs', label: '我的需要', description: '先辨认自己希望得到的回应与边界，区分真实需要和对理想关系的设想。' },
    { id: 'interaction', label: '可观察的互动', description: '对照双方实际说过的话、做过的事和互动频率；这张牌不能读取对方的真实想法。' },
    { id: 'connection', label: '我们的连接点', description: '留意关系里仍可依靠的共识、投入或共同经历，看看它们能否成为沟通的起点。' },
    { id: 'friction', label: '卡住的地方', description: '探索期待、节奏或表达中的差异，不把问题简单归咎于某一方，也不推断隐瞒或背叛。' },
    { id: 'conversation', label: '沟通的下一步', description: '尝试把牌义转成一句具体、可回应的表达：我观察到什么、我的感受是什么、我希望商量什么。' },
  ] },
  { id: 'cross', name: '五芒探索', layout: 'cross', description: '用五个位置梳理复杂处境：现状、阻力、支持、盲点与下一步。', questionHint: '我很想推进这个创作，却一直卡住。真正的阻力和可用的支持是什么？', positions: [
    { id: 'situation', label: '核心处境', description: '找出这件事目前最需要处理的部分，把抽象的烦恼缩小到一个具体问题。' },
    { id: 'obstacle', label: '当前阻力', description: '辨认可能受阻、过度使用或尚未协调的部分，也检查是否存在客观限制。' },
    { id: 'support', label: '已有支持', description: '看看自己已有的能力、帮助或经验；较困难的牌也可能指向你已经学到的应对方法。' },
    { id: 'perspective', label: '需要看清的事', description: '尝试换一个观察角度，列出需要补充的信息，避免把尚未确认的推测当作事实。' },
    { id: 'next-step', label: '可行的下一步', description: '选择一件在现有时间与精力范围内能完成的行动，并给它安排一个回看结果的时间。' },
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
  assert(spread, 400, 'INVALID_SPREAD', '请选择列表中的有效牌阵。');
  assert(typeof input.allowReversed === 'boolean', 400, 'INVALID_ORIENTATION', '请明确是否启用逆位。');
  const question = cleanText(input.question ?? '', 800) || '此刻，我可以从什么角度理解自己的状态？';
  const theme = ['lunar', 'ember', 'forest'].includes(input.theme) ? input.theme : 'lunar';
  const now = new Date().toISOString();
  return {
    id: randomUUID(), question, theme, spreadId: spread.id,
    spreadName: spread.name, spreadDescription: spread.description, layout: spread.layout,
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
    spreadName: reading.spreadName, spreadDescription: reading.spreadDescription, layout: reading.layout,
    requiredCount: reading.requiredCount, selectedCount: reading.drawn.length,
    allowReversed: reading.allowReversed, status: reading.status,
    createdAt: reading.createdAt, updatedAt: reading.updatedAt,
    // Keep the original slots so picking a card never moves or replaces its neighbours.
    slots: reading.pool.map(s => ({ token: s.token, selected: reading.drawn.some(d => d.token === s.token) })),
    drawn: reading.drawn.map(({ token, ...d }) => ({ ...d, token })),
    interpretation: reading.interpretation,
    interpretationMeta: reading.interpretationMeta,
    mode: reading.interpretationMeta?.mode ?? null,
    provider: reading.interpretationMeta?.provider ?? null,
    model: reading.interpretationMeta?.model ?? null,
    followups: reading.followups, lastError: reading.lastError,
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
