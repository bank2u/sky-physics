/* sw.js — service worker: ทำให้เว็บใช้งานแบบ offline ได้ (live sync ใช้ไม่ได้ตอน offline — ต้องมีเน็ตไปหา relay)
   ต้องอยู่ที่ root ของเว็บเพื่อให้ scope ครอบทุกหน้า. ลงทะเบียนโดย shared/layout.js
   กลยุทธ์:
   - same-origin GET: network-first (ออนไลน์ได้ของใหม่เสมอ ตรงกับ Cache-Control must-revalidate) → ล้มเหลว/ช้าเกิน = ใช้ cache
   - ฟอนต์ภายนอกของ skin (fontsUrl ใน config.js): cache-first
   - precache: เปลือกเว็บ + ทุกเรื่องที่ active ใน _system/topics.json + asset ที่แต่ละหน้าอ้าง (แกะจาก src/href)
     ทำตอน install และทุกครั้งที่หน้าเว็บส่ง {type:'refresh'} มา (throttle) — เพิ่มเรื่องใหม่ใน topics.json แล้วไม่ต้องแก้ไฟล์นี้
   ไม่ยุ่งกับ WebSocket / POST ของ relay (service worker ไม่ดัก WebSocket และเราข้าม non-GET) */
var CACHE = 'sky-physic-v1';
var FONT_CACHE = 'sky-physic-fonts-v1';
var NETWORK_TIMEOUT_MS = 4000;
var REFRESH_EVERY_MS = 10 * 60 * 1000;

var SHELL = [
  '/',
  '/_system/topics.json',
  '/shared/config.js',
  '/shared/styles.css',
  '/shared/layout.js',
  '/shared/favicon.svg',
  '/shared/manifest.webmanifest',
  '/shared/icons/icon.svg',
  '/shared/icons/icon-192.png',
  '/shared/icons/icon-512.png',
  '/shared/icons/apple-touch-icon.png',
  '/shared/sync-core.js',
  '/shared/sync.js',
  '/shared/vendor/qrcode.js'
];

/* แกะ URL ของ asset (src/href) จาก HTML แล้ว resolve เทียบกับ URL ของหน้า — เก็บเฉพาะ same-origin, ตัด #hash
   pure function: ทดสอบได้ใน node (tests/sw.test.js) */
function extractAssets(html, pageUrl) {
  var page = new URL(pageUrl);
  var out = [];
  var re = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  var m;
  while ((m = re.exec(html))) {
    var raw = m[1].trim();
    if (!raw || /^(?:#|data:|mailto:|javascript:|tel:)/i.test(raw)) continue;
    var u;
    try { u = new URL(raw, page); } catch (e) { continue; }
    if (u.origin !== page.origin) continue;
    u.hash = '';
    if (out.indexOf(u.href) === -1) out.push(u.href);
  }
  return out;
}

/* แกะ url(...) ของไฟล์ฟอนต์ออกจาก CSS ของ Google Fonts */
function extractCssUrls(css, cssUrl) {
  var out = [];
  var re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  var m;
  while ((m = re.exec(css))) {
    try {
      var href = new URL(m[1], cssUrl).href;
      if (out.indexOf(href) === -1) out.push(href);
    } catch (e) { /* ignore */ }
  }
  return out;
}

/* URL ของ @import ใน CSS (เช่น Google Fonts ใน shared/styles.css) */
function extractImports(css) {
  var out = [];
  var re = /@import\s+(?:url\(\s*["']?([^"')]+?)["']?\s*\)|["']([^"']+)["'])/gi;
  var m;
  while ((m = re.exec(css))) out.push((m[1] || m[2]).trim());
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractAssets: extractAssets, extractCssUrls: extractCssUrls, extractImports: extractImports };
} else {
  // config.js เขียนลง window.PhysicsSimConfig — ใน worker ไม่มี window จึงชี้ไปที่ self ก่อน import
  // (browser เช็คการเปลี่ยนแปลงของไฟล์ที่ importScripts ด้วย: แก้ config.js แล้ว SW อัปเดตเอง)
  self.window = self;
  try { importScripts('/shared/config.js'); } catch (e) { /* ไม่มี config = ไม่ precache ฟอนต์ */ }
  installWorker();
}

function installWorker() {
  var lastRefresh = 0;
  var refreshing = null;

  // ฟอนต์ภายนอก = fontsUrl ของ skin ที่ active + @import ใน shared/styles.css (ฟอนต์ฐาน Montserrat/Noto Sans Thai)
  function fontCssUrls() {
    var c = self.PhysicsSimConfig;
    var def = c && c.skins && c.skins[c.skin];
    var urls = def && def.fontsUrl ? [def.fontsUrl] : [];
    return caches.match(new URL('/shared/styles.css', self.location).href)
      .then(function (r) { return r ? r.text() : ''; })
      .then(function (css) {
        extractImports(css).forEach(function (u) { if (urls.indexOf(u) === -1) urls.push(u); });
        return urls.filter(function (u) { return isFontRequest(new URL(u)); });
      });
  }

  function isFontRequest(url) {
    return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  }

  // cache ทีละไฟล์ — ไฟล์ไหนพัง (เช่น 404) ข้ามไป ไม่ทำให้ทั้งชุดล้ม
  function put(cache, url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (r.ok) return cache.put(url, r.clone()).then(function () { return r; });
      return null;
    }).catch(function () { return null; });
  }

  function precacheFonts() {
    return Promise.all([fontCssUrls(), caches.open(FONT_CACHE)]).then(function (a) {
      var cache = a[1];
      return Promise.all(a[0].map(function (url) {
        return put(cache, url).then(function (r) {
          if (!r) return;
          return r.text().then(function (css) {
            return Promise.all(extractCssUrls(css, url).map(function (u) {
              return cache.match(u).then(function (hit) { return hit || put(cache, u); });
            }));
          });
        });
      }));
    });
  }

  function precache() {
    return caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (p) { return put(cache, new URL(p, self.location).href); }))
        .then(function () { return put(cache, new URL('/_system/topics.json', self.location).href); })
        .then(function (r) { return r ? r.json() : { topics: [] }; })
        .then(function (data) {
          var pages = (data.topics || []).filter(function (t) { return t.active !== false && t.path; })
            .map(function (t) { return new URL('/' + t.path.replace(/^\/+/, ''), self.location).href; });
          return Promise.all(pages.map(function (pageUrl) {
            return put(cache, pageUrl).then(function (r) {
              if (!r) return;
              return r.text().then(function (html) {
                return Promise.all(extractAssets(html, pageUrl).map(function (u) { return put(cache, u); }));
              });
            });
          }));
        });
    }).then(precacheFonts);
  }

  function refresh() {
    if (refreshing || Date.now() - lastRefresh < REFRESH_EVERY_MS) return refreshing || Promise.resolve();
    lastRefresh = Date.now();
    refreshing = precache().catch(function () {}).then(function () { refreshing = null; });
    return refreshing;
  }

  self.addEventListener('install', function (e) {
    lastRefresh = Date.now();
    e.waitUntil(precache().catch(function () {}).then(function () { return self.skipWaiting(); }));
  });

  self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== FONT_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
  });

  self.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'refresh') e.waitUntil(refresh());
  });

  function networkFirst(req) {
    var isNav = req.mode === 'navigate';
    return caches.open(CACHE).then(function (cache) {
      var fromCache = function () {
        return cache.match(req, { ignoreSearch: isNav }).then(function (hit) {
          if (hit) return hit;
          if (isNav) return cache.match(new URL('/', self.location).href);
          return Response.error();
        });
      };
      var net = fetch(req).then(function (r) {
        if (r.ok && r.type === 'basic') cache.put(req, r.clone());
        return r;
      });
      // เน็ตช้า/หลุดในห้องเรียน: รอไม่เกิน NETWORK_TIMEOUT_MS แล้วใช้ cache (ถ้ามี) — ไม่มี cache ก็รอเน็ตต่อ
      var timeout = new Promise(function (resolve) {
        setTimeout(function () {
          cache.match(req, { ignoreSearch: isNav }).then(function (hit) { if (hit) resolve(hit); });
        }, NETWORK_TIMEOUT_MS);
      });
      return Promise.race([net.catch(fromCache), timeout]);
    });
  }

  function cacheFirst(req) {
    return caches.open(FONT_CACHE).then(function (cache) {
      // Google Fonts ส่ง Vary (เช่น Sec-Fetch-Dest) — ของที่ precache จาก SW ต้องใช้กับ request จาก <link>/@import ได้
      return cache.match(req, { ignoreVary: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (r) {
          if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
          return r;
        });
      });
    });
  }

  self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
    else if (isFontRequest(url)) e.respondWith(cacheFirst(req));
    // อื่นๆ (เช่น relay) ปล่อยผ่านตามปกติ
  });
}
