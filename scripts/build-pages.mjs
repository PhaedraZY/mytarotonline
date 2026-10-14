import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SPREADS } from '../lib/engine.js';

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC_FILES = ['index.html', 'styles.css', 'art.js', 'app.js', 'static-api.js', 'reading-guide.js'];
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function staticHTML(html) {
  const relative = html.replace(/\b(src|href)=(['"])\/(?!\/)/g, '$1=$2./');
  if (!relative.includes('deployment.js') || !relative.includes('app.js')) {
    throw new Error('The static entry must load deployment.js before app.js.');
  }
  if (relative.indexOf('deployment.js') > relative.indexOf('app.js')) {
    throw new Error('deployment.js must load before app.js.');
  }
  return relative.replace(/<head>/i, `<head>\n  <meta http-equiv="Content-Security-Policy" content="${escapeHTML(CSP)}">`);
}

function attributionHTML(sources) {
  const rows = sources.cards.map(card => `<li><a href="${escapeHTML(card.source)}" rel="noreferrer">${escapeHTML(card.name)} · ${escapeHTML(card.nameEn)}</a> <small>${escapeHTML(card.cardId)}</small></li>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHTML(CSP)}"><title>经典牌面来源 · 月隐之庭</title>
<style>body{margin:0;background:#10141f;color:#e9e2d4;font:16px/1.9 system-ui,sans-serif}main{max-width:800px;margin:auto;padding:48px 24px}a{color:#d8c297}h1{font-family:serif}small{color:#a6a7b4}ul{columns:2;padding-left:24px}li{break-inside:avoid}@media(max-width:560px){ul{columns:1}}</style></head><body><main>
<a href="./index.html">← 返回月隐之庭</a><h1>经典牌面与来源</h1>
<p>经典牌面由 Pamela Colman Smith 绘制，Rider–Waite–Smith 体系，1910。图源 Wikimedia Commons，来源标注为公有领域（Public domain）。网页使用原尺寸 WebP 压缩版本，未裁切、重新上色或重绘。</p>
<p>156 段中文正逆位牌义为本项目原创初稿，供娱乐、创作与自我反思。下列链接可逐张核查原始来源及权利说明；<a href="./data/deck-sources.json">下载来源与校验记录</a>。</p>
<ul>${rows}</ul><p><small>后续上传的原创牌面仅保存在上传者当前浏览器中，不改变此处经典牌的来源说明。</small></p>
</main></body></html>\n`;
}

/** Build an explicit allowlist, never a recursive copy of the working directory. */
export async function buildPages({ projectRoot = PROJECT_ROOT } = {}) {
  const root = await fs.realpath(projectRoot);
  const output = path.join(root, 'dist');
  const staging = path.join(root, `.pages-build-${randomUUID()}`);
  // Only this fixed child directory is ever replaced. Reject links to other trees.
  const existing = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('dist must be a normal project directory.');
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'data/cards.json'), 'utf8'));
  const sources = JSON.parse(await fs.readFile(path.join(root, 'data/deck-sources.json'), 'utf8'));
  if (catalog.cards?.length !== 78 || new Set(catalog.cards.map(card => card.id)).size !== 78) throw new Error('Pages requires exactly 78 unique cards.');
  const sourceMap = new Map(sources.cards.map(card => [card.cardId, card]));
  const publicCatalog = {
    deck: { id: catalog.deckId, name: '韦特经典 · 原版扫描', version: catalog.version, cardCount: 78 },
    cards: catalog.cards.map(card => {
      if (!/^(major-\d{2}|(?:wands|cups|swords|pentacles)-(?:ace|\d{2}|page|knight|queen|king))$/.test(card.id)) throw new Error(`Invalid card ID: ${card.id}`);
      if (card.image !== `/assets/decks/rws/${card.id}.webp`) throw new Error(`Unexpected display path for ${card.id}`);
      if (!sourceMap.has(card.id)) throw new Error(`Missing attribution for ${card.id}`);
      return { ...card, image: `./assets/decks/rws/${card.id}.webp`, custom: false };
    }),
    spreads: SPREADS,
  };
  const publicSources = {
    deckId: sources.deckId, version: sources.version, checkedOn: sources.checkedOn,
    sourceCollection: sources.sourceCollection, artist: sources.artist, system: sources.system,
    licenseSummary: 'Wikimedia Commons marks these original Rider–Waite–Smith scans Public domain. This site serves WebP display copies; original JPEGs are available from their source links.',
    territoryNote: sources.territoryNote,
    cards: publicCatalog.cards.map(card => {
      const source = sourceMap.get(card.id);
      return Object.fromEntries([
        ['cardId', source.cardId], ['name', source.name], ['nameEn', source.nameEn], ['image', card.image],
        ...['source', 'sourceFile', 'sourceTitle', 'artist', 'artworkDate', 'license', 'licenseCode', 'licenseUrl', 'sourceLicenseCategories', 'sha256', 'displayAsset'].map(key => [key, source[key]]),
      ]);
    }),
  };
  await fs.mkdir(path.join(staging, 'assets/decks/rws'), { recursive: true });
  await fs.mkdir(path.join(staging, 'data'), { recursive: true });
  try {
    for (const filename of PUBLIC_FILES) {
      const input = await fs.readFile(path.join(root, 'public', filename), 'utf8');
      const content = filename === 'index.html' ? staticHTML(input)
        : filename.endsWith('.css') ? input.replace(/url\((['"]?)\/(?!\/)/g, 'url($1./') : input;
      await fs.writeFile(path.join(staging, filename), content);
    }
    await fs.writeFile(path.join(staging, 'deployment.js'), '"use strict";\nwindow.LUNARIA_DEPLOYMENT = Object.freeze({ mode: "pages" });\n');
    await Promise.all(publicCatalog.cards.map(card => fs.copyFile(path.join(root, 'public', card.image), path.join(staging, card.image))));
    await fs.writeFile(path.join(staging, 'data/catalog.json'), `${JSON.stringify(publicCatalog, null, 2)}\n`);
    await fs.writeFile(path.join(staging, 'data/deck-sources.json'), `${JSON.stringify(publicSources, null, 2)}\n`);
    await fs.writeFile(path.join(staging, 'attribution.html'), attributionHTML(publicSources));
    // No CNAME is generated: custom-domain activation belongs to verified DNS setup.
    if (existing) await fs.rm(output, { recursive: true });
    await fs.rename(staging, output);
    return { output, cardCount: publicCatalog.cards.length, mode: 'pages' };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPages();
  console.log(`Pages build ready: ${result.cardCount} cards, browser-only storage, ${result.output}`);
}
