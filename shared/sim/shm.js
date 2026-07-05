/* shared/sim/shm.js — มวลติดสปริงสั่นแบบ SHM + วงกลมอ้างอิง + กราฟ x-t / v-t / a-t วาดสด แกนเวลาร่วมกัน
   ใช้ผ่าน window.SimPatterns.shm.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ k / m / A จาก control ภายนอก ไม่ผูกกับเรื่องเดียว. เฟสต้น φ = 0 (ปล่อยจากปลายสุด x = A)
   จุดสอน: ลูกศร v ยาวสุดตอนผ่านจุดสมดุล (x=0), ลูกศร a ยาวสุดที่ปลายสุด (x=±A) — เห็นคู่กับกราฟ
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary|secondary|tertiary)/var(--grid)) ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function padDomain(dom, frac) {
    var range = dom.max - dom.min;
    if (range < 1e-6) range = 1;
    var pad = range * (frac == null ? 0.14 : frac);
    return { min: dom.min - pad, max: dom.max + pad };
  }

  /* ---- geometry (viewBox 0 0 700 760) ---- */
  var CX = 310, CY = 96;          // reference-circle center
  var R_MAX = 72;                 // px radius at max amplitude
  var WALL_X = 62, TY = 220;      // spring wall + mass track baseline
  var MASS_W = 54, MASS_H = 40;
  var V_ARROW_Y = TY - 52, A_ARROW_Y = TY + 52;
  var ARROW_MAX = 66;             // px length of a full-magnitude v/a arrow

  var PLOT_LEFT = 70, PLOT_RIGHT = 660;
  var G_H = 118, G_GAP = 26;
  var G1_TOP = 300;
  var G2_TOP = G1_TOP + G_H + G_GAP;
  var G3_TOP = G2_TOP + G_H + G_GAP;
  var AXIS_LABEL_Y = G3_TOP + G_H + 24;

  function create(container, options) {
    options = options || {};
    var kRange = options.kRange || [5, 50];
    var mRange = options.mRange || [0.5, 5];
    var ARange = options.ARange || [0.1, 0.5];
    var A_ABS_MAX = ARange[1];
    var onUpdate = options.onUpdate || function () {};

    var state = {
      k: clamp(options.k != null ? options.k : 20, kRange[0], kRange[1]),
      m: clamp(options.m != null ? options.m : 1, mRange[0], mRange[1]),
      A: clamp(options.A != null ? options.A : 0.3, ARange[0], ARange[1]),
      t: 0,
      playing: false
    };
    var raf = null, lastTs = 0;

    container.innerHTML = '';

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 760');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'มวลติดสปริง · วงกลมอ้างอิง · กราฟ x-t / v-t / a-t';
    container.appendChild(legend);

    function omega() { return Math.sqrt(state.k / state.m); }
    function period() { return (2 * Math.PI) / omega(); }

    function xAt(t) { return state.A * Math.cos(omega() * t); }
    function vAt(t) { return -state.A * omega() * Math.sin(omega() * t); }
    function aAt(t) { return -state.A * omega() * omega() * Math.cos(omega() * t); }

    function tPx(t, tMax) { return PLOT_LEFT + (t / tMax) * (PLOT_RIGHT - PLOT_LEFT); }
    function valuePy(val, top, dom) {
      var frac = (val - dom.min) / (dom.max - dom.min);
      return (top + G_H) - frac * G_H;
    }

    function arrowSvg(x0, y, len, colorVar, label) {
      if (Math.abs(len) < 0.6) {
        // near zero: a small hollow marker so the "= 0" moment reads clearly
        return '<circle cx="' + x0.toFixed(1) + '" cy="' + y + '" r="4" fill="none" stroke="' + colorVar + '" stroke-width="2.5"/>' +
               '<text x="' + x0.toFixed(1) + '" y="' + (y - 9) + '" fill="' + colorVar + '" font-family="var(--font)" font-weight="800" font-size="12" text-anchor="middle">' + label + '=0</text>';
      }
      var x1 = x0 + len;
      var dir = len >= 0 ? 1 : -1;
      var head = 9;
      var out = '';
      out += '<line x1="' + x0.toFixed(1) + '" y1="' + y + '" x2="' + (x1 - dir * head).toFixed(1) + '" y2="' + y + '" stroke="' + colorVar + '" stroke-width="6" stroke-linecap="round"/>';
      out += '<polygon points="' + x1.toFixed(1) + ',' + y + ' ' + (x1 - dir * head).toFixed(1) + ',' + (y - head) + ' ' + (x1 - dir * head).toFixed(1) + ',' + (y + head) + '" fill="' + colorVar + '"/>';
      out += '<text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (y - 11) + '" fill="' + colorVar + '" font-family="var(--font)" font-weight="800" font-size="13" text-anchor="middle">' + label + '</text>';
      return out;
    }

    function graphSvg(top, colorVar, dom, fn, tMax, label, curT, curVal) {
      var bottom = top + G_H;
      var out = '';
      out += '<rect x="' + PLOT_LEFT + '" y="' + top + '" width="' + (PLOT_RIGHT - PLOT_LEFT) + '" height="' + G_H + '" fill="none" stroke="var(--ink)" stroke-width="2" rx="8"/>';

      for (var g = 0; g <= 4; g++) {
        var gx = tPx((tMax * g) / 4, tMax).toFixed(1);
        out += '<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + bottom + '" stroke="var(--grid)" stroke-width="1.5"/>';
      }
      // zero baseline
      var y0 = valuePy(0, top, dom).toFixed(1);
      out += '<line x1="' + PLOT_LEFT + '" y1="' + y0 + '" x2="' + PLOT_RIGHT + '" y2="' + y0 + '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 6" opacity="0.55"/>';

      var d = '', N = 120;
      for (var i = 0; i <= N; i++) {
        var t = (tMax * i) / N;
        var x = tPx(t, tMax).toFixed(1);
        var yv = valuePy(fn(t), top, dom).toFixed(1);
        d += (i === 0 ? 'M ' : 'L ') + x + ',' + yv + ' ';
      }
      out += '<path d="' + d + '" fill="none" stroke="' + colorVar + '" stroke-width="4.5" stroke-linecap="round"/>';

      var px = tPx(curT, tMax).toFixed(1);
      out += '<line x1="' + px + '" y1="' + top + '" x2="' + px + '" y2="' + bottom + '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 5" opacity="0.5"/>';
      var py = valuePy(curVal, top, dom).toFixed(1);
      out += '<circle cx="' + px + '" cy="' + py + '" r="7" fill="' + colorVar + '" stroke="var(--ink)" stroke-width="2"/>';

      out += '<text x="' + (PLOT_LEFT + 10) + '" y="' + (top + 20) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="14">' + label + '</text>';
      out += '<text x="' + (PLOT_LEFT + 10) + '" y="' + (top + 38) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.65">+' + dom.max.toFixed(2) + '</text>';
      out += '<text x="' + (PLOT_LEFT + 10) + '" y="' + (bottom - 8) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.65">' + dom.min.toFixed(2) + '</text>';
      return out;
    }

    function render() {
      var w = omega(), T = period(), A = state.A;
      var t = state.t;
      var tMax = 2 * T; // แสดง 2 คาบเสมอ ไม่ว่าปรับ k/m/A อย่างไร
      if (t > tMax) t = state.t = t % tMax;

      var curX = xAt(t), curV = vAt(t), curA = aAt(t);
      var vMax = A * w, aMax = A * w * w;
      var Rpx = (A / A_ABS_MAX) * R_MAX;

      /* ---- reference circle + rotating point ---- */
      var theta = w * t; // point angle; x-projection = A cos(theta) = curX
      var ptX = CX + Rpx * Math.cos(theta);
      var ptY = CY - Rpx * Math.sin(theta);
      var massX = CX + Rpx * Math.cos(theta); // เงาในแนวราบ = ตำแหน่งมวล

      var circle = '';
      circle += '<circle cx="' + CX + '" cy="' + CY + '" r="' + Rpx.toFixed(1) + '" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 5" opacity="0.6"/>';
      // radius line + rotating point
      circle += '<line x1="' + CX + '" y1="' + CY + '" x2="' + ptX.toFixed(1) + '" y2="' + ptY.toFixed(1) + '" stroke="var(--accent-primary)" stroke-width="2.5" opacity="0.8"/>';
      circle += '<circle cx="' + ptX.toFixed(1) + '" cy="' + ptY.toFixed(1) + '" r="7" fill="var(--accent-primary)" stroke="var(--ink)" stroke-width="2"/>';
      // projection line down onto the mass
      circle += '<line x1="' + ptX.toFixed(1) + '" y1="' + ptY.toFixed(1) + '" x2="' + massX.toFixed(1) + '" y2="' + TY + '" stroke="var(--accent-primary)" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.55"/>';
      circle += '<text x="' + (CX + R_MAX + 10) + '" y="' + (CY - R_MAX + 6) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="12" opacity="0.7">วงกลมอ้างอิง</text>';

      /* ---- equilibrium + extreme markers on the track ---- */
      var markers = '';
      markers += '<line x1="' + CX + '" y1="' + (TY - 76) + '" x2="' + CX + '" y2="' + (TY + 30) + '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 5" opacity="0.5"/>';
      markers += '<text x="' + CX + '" y="' + (TY + 46) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="11" text-anchor="middle" opacity="0.6">x = 0</text>';
      var exL = (CX - Rpx).toFixed(1), exR = (CX + Rpx).toFixed(1);
      markers += '<line x1="' + exL + '" y1="' + (TY - 14) + '" x2="' + exL + '" y2="' + (TY + 16) + '" stroke="var(--ink)" stroke-width="1.5" opacity="0.4"/>';
      markers += '<line x1="' + exR + '" y1="' + (TY - 14) + '" x2="' + exR + '" y2="' + (TY + 16) + '" stroke="var(--ink)" stroke-width="1.5" opacity="0.4"/>';
      markers += '<text x="' + exR + '" y="' + (TY + 30) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="10" text-anchor="middle" opacity="0.5">+A</text>';
      markers += '<text x="' + exL + '" y="' + (TY + 30) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="10" text-anchor="middle" opacity="0.5">−A</text>';

      /* ---- wall + spring (zigzag) + mass ---- */
      var wall = '<line x1="' + WALL_X + '" y1="' + (TY - 34) + '" x2="' + WALL_X + '" y2="' + (TY + 34) + '" stroke="var(--ink)" stroke-width="4"/>';
      for (var h = 0; h < 6; h++) {
        var hy = (TY - 34) + h * 12;
        wall += '<line x1="' + (WALL_X - 12) + '" y1="' + (hy + 12) + '" x2="' + WALL_X + '" y2="' + hy + '" stroke="var(--ink)" stroke-width="2" opacity="0.7"/>';
      }
      var springStart = WALL_X, springEnd = massX - MASS_W / 2;
      var coils = 12, sd = 'M ' + springStart + ',' + TY + ' ';
      for (var c = 1; c < coils; c++) {
        var sx = springStart + ((springEnd - springStart) * c) / coils;
        var sy = TY + (c % 2 === 0 ? -11 : 11);
        sd += 'L ' + sx.toFixed(1) + ',' + sy + ' ';
      }
      sd += 'L ' + springEnd.toFixed(1) + ',' + TY;
      var spring = '<path d="' + sd + '" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>';

      var mass = '<g transform="translate(' + massX.toFixed(1) + ',' + TY + ')">' +
        '<rect x="' + (-MASS_W / 2) + '" y="' + (-MASS_H / 2) + '" width="' + MASS_W + '" height="' + MASS_H + '" rx="7" fill="var(--accent-primary)" stroke="var(--ink)" stroke-width="3"/>' +
        '<text x="0" y="5" fill="var(--ink)" font-family="var(--font)" font-weight="900" font-size="15" text-anchor="middle">m</text>' +
        '</g>';

      /* ---- v & a arrows on the mass (scaled to their own max so length shows fraction) ---- */
      var vLen = vMax > 1e-9 ? (curV / vMax) * ARROW_MAX : 0;
      var aLen = aMax > 1e-9 ? (curA / aMax) * ARROW_MAX : 0;
      var vArrow = arrowSvg(massX, V_ARROW_Y, vLen, 'var(--accent-secondary)', 'v');
      var aArrow = arrowSvg(massX, A_ARROW_Y, aLen, 'var(--accent-tertiary)', 'a');

      /* ---- graphs ---- */
      var xDom = padDomain({ min: -A, max: A });
      var vDom = padDomain({ min: -vMax, max: vMax });
      var aDom = padDomain({ min: -aMax, max: aMax });

      var g1 = graphSvg(G1_TOP, 'var(--accent-primary)', xDom, xAt, tMax, 'กราฟ x-t (m)', t, curX);
      var g2 = graphSvg(G2_TOP, 'var(--accent-secondary)', vDom, vAt, tMax, 'กราฟ v-t (m/s)', t, curV);
      var g3 = graphSvg(G3_TOP, 'var(--accent-tertiary)', aDom, aAt, tMax, 'กราฟ a-t (m/s²)', t, curA);

      var ticks = '';
      for (var gg = 0; gg <= 4; gg++) {
        var gt = (tMax * gg) / 4;
        var gxx = tPx(gt, tMax).toFixed(1);
        ticks += '<text x="' + gxx + '" y="' + AXIS_LABEL_Y + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" text-anchor="middle" opacity="0.65">' + gt.toFixed(1) + '</text>';
      }
      ticks += '<text x="' + PLOT_RIGHT + '" y="' + (AXIS_LABEL_Y + 16) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="11" text-anchor="end" opacity="0.7">t (s)</text>';

      svg.innerHTML = circle + markers + wall + spring + mass + vArrow + aArrow + g1 + g2 + g3 + ticks;

      onUpdate({
        k: state.k, m: state.m, A: state.A,
        omega: w, T: T, x: curX, v: curV, a: curA,
        playing: state.playing
      });
    }

    function frame(ts) {
      if (!state.playing) return;
      if (!lastTs) lastTs = ts;
      var dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (dt > 0.05) dt = 0.05; // กัน tab หลุด/กระตุก
      state.t += dt;
      render();
      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (state.playing) { pause(); return; }
      state.playing = true;
      lastTs = 0;
      render();
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      state.playing = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      render();
    }
    function reset() {
      state.playing = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      state.t = 0;
      render();
    }

    function setK(v) { state.k = clamp(v, kRange[0], kRange[1]); if (!state.playing) state.t = 0; render(); }
    function setM(v) { state.m = clamp(v, mRange[0], mRange[1]); if (!state.playing) state.t = 0; render(); }
    function setA(v) { state.A = clamp(v, ARange[0], ARange[1]); if (!state.playing) state.t = 0; render(); }

    render();

    return {
      setK: setK, setM: setM, setA: setA,
      play: play, pause: pause, reset: reset,
      isPlaying: function () { return state.playing; },
      destroy: function () { if (raf) cancelAnimationFrame(raf); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.shm = { create: create };
})();
