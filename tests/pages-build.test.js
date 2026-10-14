import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildPages } from '../scripts/build-pages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = ['index.html', 'styles.css', 'art.js', 'app.js', 'static-api.js', 'reading-guide.js', 'deployment.js'];

async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), `${relative}/`));
    else result.push(relative);
  }
  return result.sort();
}

test('Pages 发布包只包含静态页面、完整78牌与公开来源，适配根域名及仓库子路径', async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'lunaria-pages-test-'));
  t.after(async () => {
    assert.ok(path.resolve(fixture).startsWith(path.join(os.tmpdir(), 'lunaria-pages-test-')));
    await fs.rm(fixture, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(fixture, 'public/assets/decks/rws'), { recursive: true });
  await fs.mkdir(path.join(fixture, 'data'), { recursive: true });
  for (const filename of FILES) await fs.copyFile(path.join(ROOT, 'public', filename), path.join(fixture, 'public', filename));
  for (const filename of ['cards.json', 'deck-sources.json']) await fs.copyFile(path.join(ROOT, 'data', filename), path.join(fixture, 'data', filename));
  const originalCatalog = JSON.parse(await fs.readFile(path.join(fixture, 'data/cards.json'), 'utf8'));
  for (const card of originalCatalog.cards) await fs.copyFile(path.join(ROOT, 'public', `.${card.image}`), path.join(fixture, 'public', `.${card.image}`));

  // Plausible local-only files must never become part of the allowlisted output.
  const sentinel = 'PRIVATE_BUILD_SENTINEL_DO_NOT_PUBLISH';
  for (const relative of ['.env', '.runtime/settings.json', '.runtime/readings.json', '.models/model.gguf', 'research/copied.html', 'server.js', 'lib/providers.js', 'public/accidental-settings.json', 'public/assets/decks/rws/major-00.jpg']) {
    const target = path.join(fixture, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, sentinel);
  }
  const build = await buildPages({ projectRoot: fixture });
  const output = build.output;
  assert.equal(build.cardCount, 78);
  const actualFiles = await listFiles(output);
  const expectedFiles = [
    ...FILES, 'attribution.html', 'data/catalog.json', 'data/deck-sources.json',
    ...originalCatalog.cards.map(card => `assets/decks/rws/${card.id}.webp`),
  ].sort();
  assert.deepEqual(actualFiles, expectedFiles);
  assert.ok(!actualFiles.includes('CNAME'));
  assert.match(await fs.readFile(path.join(output, 'deployment.js'), 'utf8'), /mode:\s*"pages"/);
  assert.match(await fs.readFile(path.join(fixture, 'public/deployment.js'), 'utf8'), /mode:\s*"local"/);
  for (const filename of actualFiles.filter(name => !name.endsWith('.webp'))) {
    assert.ok(!(await fs.readFile(path.join(output, filename), 'utf8')).includes(sentinel), filename);
  }

  const catalog = JSON.parse(await fs.readFile(path.join(output, 'data/catalog.json'), 'utf8'));
  const sources = JSON.parse(await fs.readFile(path.join(output, 'data/deck-sources.json'), 'utf8'));
  assert.equal(catalog.deck.cardCount, 78);
  assert.equal(new Set(catalog.cards.map(card => card.id)).size, 78);
  assert.deepEqual(catalog.spreads.map(spread => spread.positions.length), [1, 3, 3, 5, 5, 5]);
  assert.equal(sources.cards.length, 78);
  const hashes = new Set();
  for (const card of catalog.cards) {
    assert.equal(card.image, `./assets/decks/rws/${card.id}.webp`);
    const bytes = await fs.readFile(path.join(output, card.image));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const source = sources.cards.find(item => item.cardId === card.id);
    assert.equal(hash, source.displayAsset.sha256, card.id);
    assert.equal(source.license, 'Public domain');
    hashes.add(hash);
  }
  assert.equal(hashes.size, 78);

  const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src &#39;self&#39;/);
  const assetRefs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]).filter(value => !value.startsWith('#') && !/^[a-z][a-z\d+.-]*:/i.test(value));
  const staticModule = await fs.readFile(path.join(output, 'static-api.js'), 'utf8');
  assert.match(staticModule, /(?:\.\/)?data\/catalog\.json/);
  const bases = ['https://example.github.io/', 'https://example.github.io/tarot-atelier/', 'https://mytarotonline.xyz/'];
  for (const base of bases) {
    for (const ref of [...assetRefs, './static-api.js', './reading-guide.js', './data/catalog.json', './attribution.html', ...catalog.cards.map(card => card.image)]) {
      assert.ok(!ref.startsWith('/'), `Root-relative path would escape a project site: ${ref}`);
      const resolved = new URL(ref, base);
      assert.ok(resolved.href.startsWith(base), `${resolved.href} escaped ${base}`);
      const file = decodeURIComponent(resolved.pathname.slice(new URL(base).pathname.length));
      assert.ok(actualFiles.includes(file), `${ref} does not resolve to a published file`);
    }
  }

  // A broken replacement build must not remove the last valid output.
  const missingCard = { ...originalCatalog, cards: originalCatalog.cards.slice(1) };
  await fs.writeFile(path.join(fixture, 'data/cards.json'), JSON.stringify(missingCard));
  await assert.rejects(buildPages({ projectRoot: fixture }), /78 unique cards/);
  assert.deepEqual(await listFiles(output), expectedFiles);
});
