/* GitHub Pages adapter. All reading and artwork data stays in this browser. */
const BASE = new URL('./', import.meta.url);
const DATABASE_NAME = `lunaria-pages-v1:${BASE.pathname}`;
const ASSET_PREFIX = 'lunaria-asset:';
const MODEL = 'browser-reference-v1';
let databasePromise;
let catalogPromise;
const imageURLs = new Map();

function fail(message, code = 'INVALID_INPUT') { const error = new Error(message); error.code = code; throw error; }
function requireValue(condition, message, code) { if (!condition) fail(message, code); }
function databaseError(error) { return new Error(error?.name === 'QuotaExceededError' ? '浏览器存储空间不足。请先备份自己的作品，再清理其他站点的数据后重试。' : '无法保存到此浏览器。请允许网站存储，或退出限制存储的浏览模式后再试。'); }
function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(databaseError());
    const opening = indexedDB.open(DATABASE_NAME, 1);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      db.createObjectStore('readings', { keyPath: 'id' });
      db.createObjectStore('overrides', { keyPath: 'cardId' });
      db.createObjectStore('assets', { keyPath: 'id' });
      db.createObjectStore('preferences', { keyPath: 'key' });
    };
    opening.onsuccess = () => { opening.result.onversionchange = () => opening.result.close(); resolve(opening.result); };
    opening.onerror = () => reject(databaseError(opening.error));
    opening.onblocked = () => reject(new Error('浏览器记录正在升级，请关闭这个网站的其他标签页后重新打开。'));
  });
  return databasePromise;
}
async function readStore(name, key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, 'readonly');
    const reading = key === undefined ? transaction.objectStore(name).getAll() : transaction.objectStore(name).get(key);
    reading.onsuccess = () => resolve(reading.result);
    reading.onerror = () => reject(databaseError(reading.error));
  });
}
async function writeStores(names, write) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, 'readwrite');
    let result, failure;
    const stores = Object.fromEntries(names.map(name => [name, transaction.objectStore(name)]));
    try { result = write(stores, transaction); }
    catch (error) { failure = error; transaction.abort(); }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || databaseError(transaction.error));
  });
}
export async function getPreferences() { return Object.fromEntries((await readStore('preferences')).map(item => [item.key, item.value])); }
export async function setPreference(key, value) { await writeStores(['preferences'], stores => stores.preferences.put({ key, value: String(value) })); }
export async function removePreference(key) { await writeStores(['preferences'], stores => stores.preferences.delete(key)); }

// Rejection sampling avoids the modulo bias of random % upperBound.
export function randomBelow(upperBound, cryptoSource = globalThis.crypto) {
  requireValue(Number.isSafeInteger(upperBound) && upperBound > 0 && upperBound <= 0x100000000, '随机范围无效。');
  const limit = Math.floor(0x100000000 / upperBound) * upperBound;
  const word = new Uint32Array(1);
  do { cryptoSource.getRandomValues(word); } while (word[0] >= limit);
  return word[0] % upperBound;
}
export function shuffled(items, cryptoSource = globalThis.crypto) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) { const other = randomBelow(index + 1, cryptoSource); [result[index], result[other]] = [result[other], result[index]]; }
  return result;
}
function uuid() { return crypto.randomUUID(); }
async function baseCatalog() {
  if (!catalogPromise) catalogPromise = fetch(new URL('data/catalog.json', BASE), { credentials: 'omit' }).then(async response => {
    if (!response.ok) fail('牌组暂时没有展开，请刷新页面重试。', 'CATALOG_UNAVAILABLE');
    const catalog = await response.json();
    requireValue(catalog.cards?.length === 78 && new Set(catalog.cards.map(card => card.id)).size === 78, '牌库不完整，请刷新页面或联系站点作者。');
    requireValue(catalog.spreads?.some(spread => spread.id === 'one') && catalog.spreads?.some(spread => spread.id === 'three'), '牌阵资料不完整。');
    return catalog;
  });
  return catalogPromise;
}
async function rawCatalog() {
  const base = await baseCatalog(); const overrides = await readStore('overrides');
  const byId = new Map(overrides.map(item => [item.cardId, item]));
  return { ...structuredClone(base), deck: { ...base.deck, version: `${base.deck.version}+${overrides.map(item => item.updatedAt).sort().at(-1) || 'classic'}` }, cards: base.cards.map(card => ({ ...structuredClone(card), image: byId.get(card.id)?.image || card.image, custom: byId.has(card.id) })) };
}
async function hydrateCard(card) {
  let image;
  if (card.image.startsWith(ASSET_PREFIX)) {
    const id = card.image.slice(ASSET_PREFIX.length);
    if (!imageURLs.has(id)) { const asset = await readStore('assets', id); requireValue(asset?.blob, '这张原创牌图已无法读取，请重新上传作品。', 'ASSET_MISSING'); imageURLs.set(id, URL.createObjectURL(asset.blob)); }
    image = imageURLs.get(id);
  } else {
    const url = new URL(card.image.replace(/^\/+/, ''), BASE);
    requireValue(url.origin === BASE.origin && url.pathname.startsWith(`${BASE.pathname}assets/`), '牌图路径无效。');
    image = url.href;
  }
  return { ...structuredClone(card), image };
}
async function publicReading(record) {
  const { pool, ...reading } = record;
  reading.drawn = await Promise.all(record.drawn.map(async draw => ({ ...structuredClone(draw), card: await hydrateCard(draw.card) })));
  reading.slots = pool.filter(slot => !record.drawn.some(draw => draw.token === slot.token)).map(slot => ({ token: slot.token }));
  reading.selectedCount = reading.drawn.length;
  reading.mode = record.interpretation ? 'reference' : null;
  reading.provider = record.interpretation ? 'reference' : null;
  reading.model = record.interpretation ? MODEL : null;
  return reading;
}
export function createReadingRecord(input, catalog) {
  const spread = catalog.spreads.find(item => item.id === input.spreadId);
  requireValue(spread && ['one', 'three'].includes(spread.id), '请选择单张或三张牌阵。');
  requireValue(typeof input.allowReversed === 'boolean', '请明确是否启用逆位。');
  requireValue(typeof input.question === 'string' && input.question.length <= 800, '问题文字不能超过 800 字。');
  const now = new Date().toISOString();
  return { id: uuid(), question: input.question.trim() || '此刻，我可以从什么角度理解自己的状态？', theme: ['lunar', 'ember', 'forest'].includes(input.theme) ? input.theme : 'lunar', spreadId: spread.id, positions: structuredClone(spread.positions), requiredCount: spread.positions.length, allowReversed: input.allowReversed, createdAt: now, updatedAt: now, deckVersion: catalog.deck.version, status: 'selecting', clientRequestId: input.clientRequestId || null, drawn: [], followups: [], interpretation: null, pool: shuffled(catalog.cards).map(card => ({ token: uuid(), card: structuredClone(card), orientation: input.allowReversed && randomBelow(2) ? 'reversed' : 'upright' })) };
}
export function selectRecord(reading, token) {
  requireValue(typeof token === 'string', '请选择本次牌阵中的牌。');
  if (reading.drawn.some(draw => draw.token === token)) return reading;
  requireValue(reading.drawn.length < reading.requiredCount, '本次牌阵已选完，不能更换抽牌结果。', 'DRAW_COMPLETE');
  const slot = reading.pool.find(item => item.token === token);
  requireValue(slot, '这张牌不属于本次牌阵。');
  const position = reading.positions[reading.drawn.length];
  reading.drawn.push({ token, cardId: slot.card.id, positionId: position.id, positionLabel: position.label, orientation: slot.orientation, card: structuredClone(slot.card) });
  reading.status = reading.drawn.length === reading.requiredCount ? 'drawn' : 'selecting';
  reading.updatedAt = new Date().toISOString();
  return reading;
}
export function referenceInterpretation(reading) {
  return {
    summary: '以下是本次牌面的基础释义，供你自行对照问题。这段内容来自牌义资料库，没有调用 AI，也不会推断你的个人经历。',
    cards: reading.drawn.map(draw => ({ cardId: draw.cardId, positionId: draw.positionId, orientation: draw.orientation, symbolAnchor: draw.card[draw.orientation].keywords.join(' · '), interpretation: `在「${draw.positionLabel}」的位置，${draw.card.name}${draw.orientation === 'reversed' ? '逆位' : '正位'}的基础含义是：${draw.card[draw.orientation].meaning}`, reflectionQuestion: `这些象征中，哪一点最贴近你在「${draw.positionLabel}」上的真实感受？` })),
    synthesis: '将各张牌对应到自己的处境，比较它们之间的呼应与矛盾。基础释义提供象征视角，留给你自行联想与判断的空间。', actions: ['写下一个你已经知道的事实，以及一个仍需要验证的假设。'], closing: '牌是一个提问的入口，下一步的选择仍在你手中。',
  };
}
async function mutateReading(id, update) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['readings', 'preferences'], 'readwrite');
    let result, failure;
    const store = transaction.objectStore('readings'); const finding = store.get(id);
    finding.onsuccess = () => {
      try {
        const reading = finding.result; requireValue(reading, '这个浏览器里没有找到这次记录。', 'READING_NOT_FOUND');
        update(reading); store.put(reading); transaction.objectStore('preferences').put({ key: 'reading', value: id }); result = reading;
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || databaseError(transaction.error));
  });
}
async function createAndSave(input) {
  const catalog = await rawCatalog(); const reading = createReadingRecord(input, catalog); const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['readings', 'preferences'], 'readwrite'); const store = transaction.objectStore('readings');
    let result, failure; const finding = store.getAll();
    finding.onsuccess = () => {
      try {
        const existing = input.clientRequestId && finding.result.find(item => item.clientRequestId === input.clientRequestId);
        requireValue(existing || finding.result.length < 5000, '这个浏览器已保存很多记录，请先备份后再开启新牌阵。');
        result = existing || reading; if (!existing) store.put(reading);
        transaction.objectStore('preferences').put({ key: 'reading', value: result.id });
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result); transaction.onabort = transaction.onerror = () => reject(failure || databaseError(transaction.error));
  });
}

// Check dimensions before asking the browser to decode potentially huge bitmaps.
export function imageDimensions(bytes, mime) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start, count) => String.fromCharCode(...bytes.slice(start, start + count));
  if (mime === 'image/png' && bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    for (let offset = 8; offset + 12 <= bytes.length;) { const size = view.getUint32(offset); requireValue(ascii(offset + 4, 4) !== 'acTL', '请上传静态 PNG，不支持动画牌图。'); if (offset + size + 12 > bytes.length) break; offset += size + 12; }
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    const frames = [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207];
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset++] !== 255) continue;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++]; if (marker === 218 || marker === 217) break;
      if ([216, 1].includes(marker)) continue;
      const size = view.getUint16(offset); requireValue(size >= 2 && offset + size <= bytes.length, '图片文件不完整。');
      if (frames.includes(marker)) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      offset += size;
    }
  }
  if (mime === 'image/webp' && bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const type = ascii(12, 4);
    if (type === 'VP8X') { requireValue(!(bytes[20] & 2), '请上传静态 WebP，不支持动画牌图。'); return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }; }
    if (type === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return { width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
    if (type === 'VP8L' && bytes[20] === 47) { const packed = view.getUint32(21, true); return { width: (packed & 16383) + 1, height: ((packed >>> 14) & 16383) + 1 }; }
  }
  fail('图片无法识别，请选择完整的 JPG、PNG 或 WebP 文件。', 'INVALID_IMAGE');
}
async function normalizedImage(dataURL) {
  requireValue(typeof dataURL === 'string' && dataURL.length < 12 * 1024 * 1024, '图片过大，单张请小于 8 MB。');
  const match = dataURL.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  requireValue(match, '仅支持 JPG、PNG 和 WebP 图片。');
  let bytes; try { bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0)); } catch { fail('图片数据不完整。'); }
  requireValue(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024, '单张图片请小于 8 MB。');
  const dimensions = imageDimensions(bytes, match[1]);
  requireValue(dimensions.width >= 200 && dimensions.height >= 300, '牌面至少需要 200 × 300 像素。');
  requireValue(dimensions.width * dimensions.height <= 32000000, '图片像素过大，请缩小到 3200 万像素以内。');
  let bitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type: match[1] })); } catch { fail('浏览器无法解码这张图片，请转换为标准 JPG 或 PNG 后重试。'); }
  try {
    const scale = Math.min(1, 1400 / bitmap.width, 2100 / bitmap.height); const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); requireValue(context, '此浏览器无法处理图片，请更换现代浏览器。'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.88)); requireValue(blob, '图片转换失败，请换一张图片。'); return blob;
  } finally { bitmap.close(); }
}
async function settings() {
  return { provider: 'reference', providers: [{ id: 'reference', name: '基础牌义 · 免费静态版', model: MODEL, configured: true }], local: { available: false, models: [] }, customCardCount: (await readStore('overrides')).length, mode: 'pages' };
}
export async function request(path, body) {
  if (path === '/api/catalog' && body === undefined) { const catalog = await rawCatalog(); return { ...catalog, cards: await Promise.all(catalog.cards.map(hydrateCard)) }; }
  if (path === '/api/settings' && body === undefined) return settings();
  if (path === '/api/history' && body === undefined) {
    const readings = await readStore('readings'); return { readings: readings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 80).map(reading => ({ id: reading.id, question: reading.question, createdAt: reading.createdAt, status: reading.status, cardNames: reading.drawn.map(draw => draw.card.name), theme: reading.theme })) };
  }
  if (path === '/api/readings' && body) return publicReading(await createAndSave(body));
  const readingRoute = path.match(/^\/api\/readings\/([a-f0-9-]{36})(?:\/(select|interpret|followups))?$/);
  if (readingRoute) {
    const [, id, action] = readingRoute;
    if (!action && body === undefined) { const reading = await readStore('readings', id); requireValue(reading, '这个浏览器里没有找到这次记录。', 'READING_NOT_FOUND'); return publicReading(reading); }
    if (action === 'select' && body) return publicReading(await mutateReading(id, reading => selectRecord(reading, body.token)));
    if (action === 'interpret' && body) {
      requireValue(!body.provider || body.provider === 'reference', '当前是基础牌义版，尚未接入 AI。', 'STATIC_ONLY');
      const reading = await mutateReading(id, record => { requireValue(record.drawn.length === record.requiredCount, '请先完成选牌。'); record.interpretation = referenceInterpretation(record); record.status = 'complete'; record.updatedAt = new Date().toISOString(); });
      return { readingId: id, status: 'complete', mode: 'reference', interpretation: reading.interpretation, provider: 'reference', model: MODEL };
    }
  }
  if (path === '/api/assets/upload' && body) {
    const catalog = await baseCatalog(); requireValue(catalog.cards.some(card => card.id === body.cardId), '请选择有效的牌名。');
    const blob = await normalizedImage(body.imageDataUrl); const id = uuid(); const updatedAt = new Date().toISOString();
    await writeStores(['assets', 'overrides'], stores => { stores.assets.put({ id, blob, createdAt: updatedAt }); stores.overrides.put({ cardId: body.cardId, image: `${ASSET_PREFIX}${id}`, updatedAt }); });
    imageURLs.set(id, URL.createObjectURL(blob)); return { cardId: body.cardId, image: imageURLs.get(id), customCardCount: (await readStore('overrides')).length };
  }
  if (path === '/api/deck/reset' && body) { await writeStores(['overrides'], stores => stores.overrides.clear()); return { ok: true }; }
  if (path === '/api/settings' || path === '/api/models/test' || readingRoute?.[2] === 'followups') fail('当前提供免费抽牌与基础牌义，AI 服务将在后续版本接入。这里不收集 API Key。', 'STATIC_ONLY');
  fail('当前静态版本暂不支持这个操作。', 'NOT_FOUND');
}
