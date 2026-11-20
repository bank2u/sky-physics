/* shared/layout.js — โครง 5 ส่วนของ page: top bar ร่วม (โลโก้ S + toggle มืด/สว่าง)
   ใช้ผ่าน window.PhysicsSimLayout — โหลดใน <head> (ไม่ defer) เพื่อกันจอกระพริบตอนสลับ dark mode
   อ่าน skin จาก shared/config.js (ต้องโหลดมาก่อน) แล้วแสตมป์ data-skin ก่อน paint
   skin ที่รองรับโหมดเดียวจะถูกบังคับโหมดนั้นและไม่แสดงปุ่ม toggle */
(function () {
  var layoutScript = document.currentScript;
  var STORAGE_KEY = 'sky-physic-theme';

  var config = window.PhysicsSimConfig || {
    skin: 'dot-matrix',
    skins: { 'dot-matrix': { modes: ['light', 'dark'] } }
  };
  var skinName = config.skin;
  var skinDef = (config.skins && config.skins[skinName]) || { modes: ['light', 'dark'] };
  var modes = skinDef.modes || ['light', 'dark'];

  // แสตมป์ skin ทันที (script นี้รัน sync ใน head) กัน flash ของ skin default
  document.documentElement.setAttribute('data-skin', skinName);

  // โหลดฟอนต์ภายนอกเฉพาะ skin ที่ active (ไม่ใช้ @import ใน skin css เพราะจะโหลดทุกหน้าไม่ว่า skin ไหนทำงานอยู่)
  if (skinDef.fontsUrl) {
    var fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = skinDef.fontsUrl;
    document.head.appendChild(fontLink);
  }

  function storedTheme() {
    var v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  }

  function isDark() {
    if (modes.length === 1) return modes[0] === 'dark';
    var stored = storedTheme();
    if (stored) return stored === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function setTheme(dark) {
    if (modes.length === 1) dark = modes[0] === 'dark'; // skin โหมดเดียว: ค่าถูกบังคับ
    var value = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', value);
    localStorage.setItem(STORAGE_KEY, value);
    document.querySelectorAll('.toggle').forEach(function (t) {
      t.setAttribute('aria-pressed', String(dark));
    });
    document.dispatchEvent(new CustomEvent('sky-physic:themechange'));
  }

  // Apply ทันทีกัน flash: skin โหมดเดียวบังคับเลย, นอกนั้นตามค่าที่จำไว้
  if (modes.length === 1) {
    document.documentElement.setAttribute('data-theme', modes[0]);
  } else {
    var stored = storedTheme();
    if (stored) document.documentElement.setAttribute('data-theme', stored);
  }

  function mountTopbar(root, homeHref) {
    var toggleHtml = modes.length > 1
      ? '<button type="button" class="toggle" aria-label="สลับโหมดมืด/สว่าง" aria-pressed="' + isDark() + '">' +
        '<span class="toggle__thumb"></span></button>'
      : '';
    root.innerHTML =
      '<div class="topbar">' +
      '<a class="topbar__brand" href="' + homeHref + '">' +
      '<span class="topbar__logo">☁️</span>' +
      '<span class="topbar__name">SKY-PHYSICS</span>' +
      '</a>' + toggleHtml + '</div>';
    var toggle = root.querySelector('.toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        setTheme(!isDark());
      });
    }
  }

  // ---- live sync (ห้องเรียน) ----
  // syncUrl ว่าง (และไม่ใช่ localhost) = ปิดฟีเจอร์: stub เป็น no-op ไม่โหลด script ใดๆ
  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var syncUrl = (isLocal ? config.syncUrlDev : config.syncUrl) || '';
  var syncQueue = [];
  function stubMethod(name) {
    return function () {
      if (syncUrl) syncQueue.push([name, Array.prototype.slice.call(arguments)]);
    };
  }
  // หน้าเรื่องเรียก Sync.* ใน inline script ก่อน sync.js (โหลดทีหลัง) พร้อม — sync.js แทน window.Sync แล้ว drain _queue
  window.Sync = {
    param: stubMethod('param'), player: stubMethod('player'),
    camera: stubMethod('camera'), changed: stubMethod('changed'),
    role: function () { return 'none'; },
    _queue: syncQueue
  };
  if (syncUrl && layoutScript && layoutScript.src) {
    var base = layoutScript.src.replace(/layout\.js(\?.*)?$/, '');
    ['sync-core.js', 'sync.js'].forEach(function (f) {
      var el = document.createElement('script');
      el.src = base + f;
      el.async = false; // รันตามลำดับ sync-core → sync
      document.head.appendChild(el);
    });
  }

  window.PhysicsSimLayout = {
    mountTopbar: mountTopbar, isDark: isDark, setTheme: setTheme, syncUrl: syncUrl, assetBase: layoutScript && layoutScript.src ? layoutScript.src.replace(/layout\.js(\?.*)?$/, '') : ''
  };
})();
