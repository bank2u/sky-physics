const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractAssets, extractCssUrls, extractImports } = require('../sw.js');

const ORIGIN = 'https://example.test';

test('extractAssets resolves relative src/href against the page, same-origin only', () => {
  const html = `<link rel="stylesheet" href="../../shared/styles.css">
    <script src='../../shared/sim/pendulum.js'></script>
    <a href="../../">home</a><a href="#x">hash</a>
    <link href="https://fonts.googleapis.com/css2?family=X">
    <img src="data:image/png;base64,AAAA"><script src="../../shared/styles.css#dup"></script>`;
  assert.deepStrictEqual(extractAssets(html, ORIGIN + '/topics/pendulum/'), [
    ORIGIN + '/shared/styles.css',
    ORIGIN + '/shared/sim/pendulum.js',
    ORIGIN + '/'
  ]);
});

test('every active topic page has all its same-origin assets on disk', () => {
  const root = path.join(__dirname, '..');
  const { topics } = JSON.parse(fs.readFileSync(path.join(root, '_system/topics.json'), 'utf8'));
  for (const t of topics.filter((x) => x.active !== false)) {
    const pageUrl = ORIGIN + '/' + t.path;
    const html = fs.readFileSync(path.join(root, t.path, 'index.html'), 'utf8');
    const assets = extractAssets(html, pageUrl).filter((u) => /\.(js|css|svg)$/.test(u));
    assert.ok(assets.some((u) => u.endsWith('/shared/layout.js')), t.id + ' loads layout.js');
    for (const u of assets) {
      const p = path.join(root, new URL(u).pathname);
      // favicon ของหน้าเรื่องชี้ผิดอยู่แล้ว (404 ที่รู้กัน) — SW ข้ามไฟล์ที่ fetch ไม่ได้
      if (u.endsWith('/topics/shared/favicon.svg')) continue;
      assert.ok(fs.existsSync(p), `${t.id}: missing ${u}`);
    }
  }
});

test('extractCssUrls pulls font files out of Google Fonts CSS', () => {
  const css = `@font-face{src:url(https://fonts.gstatic.com/s/kanit/v1/a.woff2) format('woff2');}
    @font-face{src:url("https://fonts.gstatic.com/s/bungee/v1/b.woff2")}`;
  assert.deepStrictEqual(extractCssUrls(css, 'https://fonts.googleapis.com/css2'), [
    'https://fonts.gstatic.com/s/kanit/v1/a.woff2',
    'https://fonts.gstatic.com/s/bungee/v1/b.woff2'
  ]);
});

test('extractImports finds the base font @import in shared/styles.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'shared/styles.css'), 'utf8');
  const urls = extractImports(css);
  assert.ok(urls.some((u) => u.startsWith('https://fonts.googleapis.com/css2?family=Montserrat') && u.endsWith('display=swap')), urls.join());
  assert.deepStrictEqual(extractImports(`@import "a.css"; @import url('b.css');`), ['a.css', 'b.css']);
  assert.deepStrictEqual(extractImports(`@import url('https://f.test/css2?family=A:wght@6;7&x=1');`), ['https://f.test/css2?family=A:wght@6;7&x=1']);
});
