/* shared/layout.js — โครง 5 ส่วนของ page: top bar ร่วม (โลโก้ Φ + toggle มืด/สว่าง)
   ใช้ผ่าน window.PhysicsSimLayout — โหลดใน <head> (ไม่ defer) เพื่อกันจอกระพริบตอนสลับ dark mode
   อ่าน skin จาก shared/config.js (ต้องโหลดมาก่อน) แล้วแสตมป์ data-skin ก่อน paint
   skin ที่รองรับโหมดเดียวจะถูกบังคับโหมดนั้นและไม่แสดงปุ่ม toggle */
(function () {
  var STORAGE_KEY = 'physics-sim-theme';

  var config = window.PhysicsSimConfig || {
    skin: 'dot-matrix',
    skins: { 'dot-matrix': { modes: ['light', 'dark'] } }
  };
  var skinName = config.skin;
  var skinDef = (config.skins && config.skins[skinName]) || { modes: ['light', 'dark'] };
  var modes = skinDef.modes || ['light', 'dark'];

  // แสตมป์ skin ทันที (script นี้รัน sync ใน head) กัน flash ของ skin default
  document.documentElement.setAttribute('data-skin', skinName);

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
    document.dispatchEvent(new CustomEvent('physics-sim:themechange'));
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
      '<span class="topbar__logo">Φ</span>' +
      '<span class="topbar__name">PHYSICS-SIM</span>' +
      '</a>' + toggleHtml + '</div>';
    var toggle = root.querySelector('.toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        setTheme(!isDark());
      });
    }
  }

  window.PhysicsSimLayout = { mountTopbar: mountTopbar, isDark: isDark, setTheme: setTheme };
})();
