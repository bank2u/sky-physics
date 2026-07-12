/* shared/sim/pendulum.js — ลูกตุ้มอย่างง่ายแกว่งเป็นส่วนโค้ง (small-angle approximation)
   ใช้ผ่าน window.SimPatterns.pendulum.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   จุดสอน: เปลี่ยนมวล (mass) แล้วคาบ T ไม่เปลี่ยน — มีแต่ L และ g เท่านั้นที่มีผล
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary|secondary|tertiary)) — SVG อ้าง var() ตรงๆ
   จึงเปลี่ยนสีตามธีมได้เองโดยไม่ต้อง re-resolve. ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function create(container, options) {
    options = options || {};
    var LRange = options.LRange || [0.2, 2.0];
    var theta0Range = options.theta0Range || [5, 45];
    var massRange = options.massRange || [0.1, 2.0];
    var onUpdate = options.onUpdate || function () {};

    var VBW = 700, VBH = 620;
    var PIVOT = { x: 350, y: 70 };
    var L_MIN_PX = 120, L_MAX_PX = 460;
    var BALL_MIN = 14, BALL_MAX = 34;

    var state = {
      L: clamp(options.L != null ? options.L : 1.0, LRange[0], LRange[1]),
      theta0: clamp(options.theta0 != null ? options.theta0 : 20, theta0Range[0], theta0Range[1]),
      mass: clamp(options.mass != null ? options.mass : 0.5, massRange[0], massRange[1]),
      g: options.g != null ? options.g : 9.8,
      gLabel: options.gLabel || 'Earth',
      t: 0,
      playing: false
    };
    var rafId = null, lastTs = 0;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VBW + ' ' + VBH);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'เชือกยาว L · มุมเริ่มต้น θ · เปลี่ยนมวลแล้วดูว่าคาบเปลี่ยนไหม';
    container.appendChild(legend);

    function ropePx() {
      var frac = (state.L - LRange[0]) / (LRange[1] - LRange[0]);
      return L_MIN_PX + frac * (L_MAX_PX - L_MIN_PX);
    }
    function ballR() {
      var frac = (state.mass - massRange[0]) / (massRange[1] - massRange[0]);
      return BALL_MIN + frac * (BALL_MAX - BALL_MIN);
    }
    function omega() { return Math.sqrt(state.g / state.L); }        // rad/s
    function period() { return 2 * Math.PI / omega(); }              // s
    function freq() { return 1 / period(); }                         // Hz
    function theta0Rad() { return state.theta0 * Math.PI / 180; }
    function thetaNow() { return theta0Rad() * Math.cos(omega() * state.t); } // rad

    function label(x, y, text, colorVar, size) {
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="' + colorVar +
             '" font-size="' + (size || 18) + '" font-weight="800" text-anchor="middle" dominant-baseline="middle">' + text + '</text>';
    }

    function render() {
      var Lpx = ropePx(), r = ballR();
      var th = thetaNow();
      var bx = PIVOT.x + Lpx * Math.sin(th);
      var by = PIVOT.y + Lpx * Math.cos(th);

      var parts = [];

      // แนวดิ่งอ้างอิง (จุดสมดุล) — จางๆ
      parts.push('<line x1="' + PIVOT.x + '" y1="' + PIVOT.y + '" x2="' + PIVOT.x + '" y2="' + (PIVOT.y + L_MAX_PX + 20) +
        '" stroke="var(--ink)" stroke-width="2" stroke-dasharray="2 10" opacity="0.35"/>');

      // ส่วนโค้งแสดงช่วงแกว่งสุด ±theta0 — เส้นประ
      var t0 = theta0Rad();
      var exLx = PIVOT.x - Lpx * Math.sin(t0), exLy = PIVOT.y + Lpx * Math.cos(t0);
      var exRx = PIVOT.x + Lpx * Math.sin(t0), exRy = PIVOT.y + Lpx * Math.cos(t0);
      parts.push('<line x1="' + PIVOT.x + '" y1="' + PIVOT.y + '" x2="' + exLx.toFixed(1) + '" y2="' + exLy.toFixed(1) +
        '" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 8" opacity="0.3"/>');
      parts.push('<line x1="' + PIVOT.x + '" y1="' + PIVOT.y + '" x2="' + exRx.toFixed(1) + '" y2="' + exRy.toFixed(1) +
        '" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 8" opacity="0.3"/>');

      // จุดยึด (pivot)
      parts.push('<circle cx="' + PIVOT.x + '" cy="' + PIVOT.y + '" r="8" fill="var(--ink)"/>');
      parts.push('<line x1="' + (PIVOT.x - 26) + '" y1="' + (PIVOT.y - 14) + '" x2="' + (PIVOT.x + 26) + '" y2="' + (PIVOT.y - 14) +
        '" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>');

      // เชือก
      parts.push('<line x1="' + PIVOT.x + '" y1="' + PIVOT.y + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) +
        '" stroke="var(--ink)" stroke-width="4"/>');

      // ลูกตุ้ม
      parts.push('<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="' + r.toFixed(1) +
        '" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="4"/>');

      // ป้าย g
      parts.push(label(PIVOT.x, PIVOT.y - 40, 'g = ' + state.g.toFixed(1) + ' m/s² (' + state.gLabel + ')', 'var(--accent-secondary)', 20));

      svg.innerHTML = parts.join('');

      onUpdate({
        L: state.L, theta0: state.theta0, mass: state.mass, g: state.g, gLabel: state.gLabel,
        T: period(), f: freq(), angle: thetaNow() * 180 / Math.PI,
        playing: state.playing
      });
    }

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      if (!state.playing) { lastTs = ts; return; }
      var dt = lastTs ? (ts - lastTs) / 1000 : 0;
      dt = Math.min(dt, 0.05);
      lastTs = ts;
      state.t += dt;
      render();
    }
    function startRaf() { if (!rafId) { lastTs = 0; rafId = requestAnimationFrame(tick); } }
    function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function play() {
      state.playing = !state.playing;
      if (state.playing) startRaf(); else render();
    }
    function pause() {
      state.playing = false;
      render();
    }
    function reset() {
      state.playing = false;
      state.t = 0;
      render();
    }

    function setL(v) { state.L = clamp(v, LRange[0], LRange[1]); if (!state.playing) state.t = 0; render(); }
    function setTheta0(v) { state.theta0 = clamp(v, theta0Range[0], theta0Range[1]); if (!state.playing) state.t = 0; render(); }
    function setMass(v) { state.mass = clamp(v, massRange[0], massRange[1]); render(); }
    function setG(g, label) { state.g = g; state.gLabel = label; if (!state.playing) state.t = 0; render(); }

    startRaf();
    render();

    return {
      setL: setL, setTheta0: setTheta0, setMass: setMass, setG: setG,
      play: play, pause: pause, reset: reset,
      isPlaying: function () { return state.playing; },
      destroy: function () { stopRaf(); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.pendulum = { create: create };
})();
