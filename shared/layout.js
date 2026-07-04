/* shared/layout.js — โครง 5 ส่วนของ page: top bar ร่วม (โลโก้ Φ + toggle มืด/สว่าง)
   ใช้ผ่าน window.PhysicsSimLayout — โหลดใน <head> (ไม่ defer) เพื่อกันจอกระพริบตอนสลับ dark mode */
(function () {
  var STORAGE_KEY = 'physics-sim-theme';

  function storedTheme() {
    var v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  }

  function isDark() {
    var stored = storedTheme();
    if (stored) return stored === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function setTheme(dark) {
    var value = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', value);
    localStorage.setItem(STORAGE_KEY, value);
    document.querySelectorAll('.toggle').forEach(function (t) {
      t.setAttribute('aria-pressed', String(dark));
    });
  }

  // Apply immediately (script runs synchronously in <head>) to avoid a light-mode flash.
  var stored = storedTheme();
  if (stored) document.documentElement.setAttribute('data-theme', stored);

  function mountTopbar(root, homeHref) {
    root.innerHTML =
      '<div class="topbar">' +
      '<a class="topbar__brand" href="' + homeHref + '">' +
      '<span class="topbar__logo">Φ</span>' +
      '<span class="topbar__name">PHYSICS-SIM</span>' +
      '</a>' +
      '<button type="button" class="toggle" aria-label="สลับโหมดมืด/สว่าง" aria-pressed="' + isDark() + '">' +
      '<span class="toggle__thumb"></span>' +
      '</button>' +
      '</div>';
    root.querySelector('.toggle').addEventListener('click', function () {
      setTheme(!isDark());
    });
  }

  window.PhysicsSimLayout = { mountTopbar: mountTopbar, isDark: isDark, setTheme: setTheme };
})();
