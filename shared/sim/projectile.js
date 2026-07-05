/* shared/sim/projectile.js — วิถีการเคลื่อนที่แบบโพรเจกไทล์ (ปรับมุม/ความเร็วต้น)
   ใช้ผ่าน window.SimPatterns.projectile.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)) ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function create(container, options) {
    options = options || {};
    var angleRange = options.angleRange || [10, 80];
    var v0Range = options.v0Range || [5, 30];
    var g = options.g || 9.8;
    var onUpdate = options.onUpdate || function () {};

    var state = {
      angle: clamp(options.angle != null ? options.angle : 42, angleRange[0], angleRange[1]),
      v0: clamp(options.v0 != null ? options.v0 : 22, v0Range[0], v0Range[1]),
      t: 0,
      playing: false
    };
    var timer = null;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 570');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'ความเร็วต้น (v₀) · ความเร่งจากแรงโน้มถ่วง (g)';
    container.appendChild(legend);

    function computeValues() {
      var theta = (state.angle * Math.PI) / 180;
      var R = (state.v0 * state.v0 * Math.sin(2 * theta)) / g;
      var H = (state.v0 * state.v0 * Math.sin(theta) * Math.sin(theta)) / (2 * g);
      var T = (2 * state.v0 * Math.sin(theta)) / g;
      return { theta: theta, R: R, H: H, T: T };
    }

    function render() {
      var vals = computeValues();
      var theta = vals.theta, R = vals.R, H = vals.H, T = vals.T;

      var groundY = 480, leftX = 60, plotW = 590, plotH = 380;
      var scale = Math.min(plotW / Math.max(R, 0.01), plotH / Math.max(H, 0.01)) * 0.82;
      var px = function (x) { return leftX + x * scale; };
      var py = function (y) { return groundY - y * scale; };

      var d = '';
      var N = 28;
      for (var i = 0; i <= N; i++) {
        var x = (R * i) / N;
        var y = x * Math.tan(theta) - (g * x * x) / (2 * state.v0 * state.v0 * Math.cos(theta) * Math.cos(theta));
        d += (i === 0 ? 'M ' : 'L ') + px(x).toFixed(1) + ',' + py(Math.max(y, 0)).toFixed(1) + ' ';
      }

      var t = state.t;
      var xt = state.v0 * Math.cos(theta) * t;
      var yt = Math.max(0, state.v0 * Math.sin(theta) * t - 0.5 * g * t * t);
      var particlePx = px(xt).toFixed(1);
      var particlePy = py(yt).toFixed(1);

      var apexX = R / 2, apexY = H;
      var apexPx = px(apexX), apexPy = py(apexY);
      var vxEndX = apexPx + 75, vxEndY = apexPy;
      var vyEndX = apexPx, vyEndY = apexPy - 55 * Math.sin(theta);
      var gEndX = apexPx, gEndY = apexPy + 65;
      var gArrowHead = gEndX + ',' + gEndY + ' ' + (gEndX - 12) + ',' + (gEndY - 20) + ' ' + (gEndX + 12) + ',' + (gEndY - 20);

      svg.innerHTML =
        '<line x1="40" y1="' + groundY + '" x2="670" y2="' + groundY + '" stroke="var(--ink)" stroke-width="3"/>' +
        '<polygon points="40,' + groundY + ' 74,' + (groundY - 20) + ' 74,' + (groundY + 20) + '" fill="var(--ink)"/>' +
        '<path d="' + d + '" fill="none" stroke="var(--accent-primary)" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 15"/>' +
        '<line x1="' + apexPx + '" y1="' + apexPy + '" x2="' + vxEndX + '" y2="' + vxEndY + '" stroke="var(--accent-primary)" stroke-width="6" stroke-linecap="round"/>' +
        '<line x1="' + apexPx + '" y1="' + apexPy + '" x2="' + vyEndX + '" y2="' + vyEndY + '" stroke="var(--accent-primary)" stroke-width="6" stroke-linecap="round" opacity="0.6"/>' +
        '<line x1="' + apexPx + '" y1="' + apexPy + '" x2="' + gEndX + '" y2="' + gEndY + '" stroke="var(--accent-secondary)" stroke-width="6" stroke-linecap="round"/>' +
        '<polygon points="' + gArrowHead + '" fill="var(--accent-secondary)"/>' +
        '<circle cx="' + particlePx + '" cy="' + particlePy + '" r="15" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="4"/>';

      onUpdate({
        angle: state.angle,
        v0: state.v0,
        R: R,
        H: H,
        T: T,
        t: state.playing ? state.t : T,
        playing: state.playing
      });
    }

    function play() {
      if (state.playing) { pause(); return; }
      var T = computeValues().T;
      if (T <= 0) return;
      state.t = state.t >= T - 0.001 ? 0 : state.t;
      state.playing = true;
      render();
      timer = setInterval(function () {
        state.t += 0.03;
        var currT = computeValues().T;
        if (state.t >= currT) {
          state.t = currT;
          state.playing = false;
          clearInterval(timer);
          timer = null;
        }
        render();
      }, 16);
    }

    function pause() {
      if (timer) { clearInterval(timer); timer = null; }
      state.playing = false;
      render();
    }

    function reset() {
      if (timer) { clearInterval(timer); timer = null; }
      state.t = 0;
      state.playing = false;
      render();
    }

    function setAngle(a) {
      state.angle = clamp(a, angleRange[0], angleRange[1]);
      if (!state.playing) state.t = 0;
      render();
    }

    function setV0(v) {
      state.v0 = clamp(v, v0Range[0], v0Range[1]);
      if (!state.playing) state.t = 0;
      render();
    }

    render();

    return {
      setAngle: setAngle,
      setV0: setV0,
      play: play,
      pause: pause,
      reset: reset,
      isPlaying: function () { return state.playing; },
      destroy: function () { if (timer) clearInterval(timer); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.projectile = { create: create };
})();
