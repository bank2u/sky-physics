/* shared/sim/motion-graphs.js — รถวิ่งบนถนนตรง + กราฟ x-t / v-t / a-t วาดสดตามเวลาจริง ใช้แกนเวลาร่วมกัน
   ใช้ผ่าน window.SimPatterns.motionGraphs.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ v0/a จาก control ภายนอก ไม่ผูกกับเรื่องเดียว (x0 = 0 เสมอ)
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)/var(--grid)) ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function computeMaxInterestingTime(v0Range, aRange) {
    var maxT = 6; // baseline minimum
    var scenarios = [
      { v0: v0Range[0], a: aRange[0] },
      { v0: v0Range[0], a: aRange[1] },
      { v0: v0Range[1], a: aRange[0] },
      { v0: v0Range[1], a: aRange[1] }
    ];
    scenarios.forEach(function(s) {
      if (Math.abs(s.a) > 1e-9) {
        var t_stop = Math.abs(-s.v0 / s.a);
        if (t_stop > maxT) maxT = t_stop;
      }
    });
    return maxT + 1;
  }

  var T_MAX = 6; // will be overridden in create()

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function computeX(t, v0, a) { return v0 * t + 0.5 * a * t * t; }
  function computeV(t, v0, a) { return v0 + a * t; }

  function sampleExtent(fn, v0, a, n) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i <= n; i++) {
      var t = (T_MAX * i) / n;
      var val = fn(t, v0, a);
      if (val < lo) lo = val;
      if (val > hi) hi = val;
    }
    return { min: lo, max: hi };
  }

  function padDomain(dom, frac) {
    var range = dom.max - dom.min;
    if (range < 1e-6) range = 1;
    var pad = range * (frac == null ? 0.12 : frac);
    return { min: dom.min - pad, max: dom.max + pad };
  }

  /* โดเมนคงที่ของ x-t/v-t คำนวณครั้งเดียวจากช่วงสุดขั้วของ v0Range/aRange ทั้งหมด (เหมือนวิธีที่ aDom
     ใช้ aRange ตรงๆ อยู่แล้ว) แทนการ auto-scale ต่อเฟรมจากค่า v0/a ปัจจุบัน — ถ้า auto-scale ทุกกราฟจะถูก
     ยืด/หดให้เต็มกรอบเสมอ ทำให้ปรับ v0/a แค่ไหนก็ดูเหมือนเดิม (ต่างแค่ตัวเลขบนแกน) โดเมนคงที่ทำให้ค่ามาก
     ทำให้เส้นชันขึ้น/รถวิ่งไกลขึ้นจริงในกรอบเดียวกัน ค่าน้อยทำให้ดูขยับน้อยจริง ตรงกับความหมายทางฟิสิกส์ */
  function computeFixedDomains(v0Range, aRange, tMax) {
    /* ใช้ค่าสุดขั้วทีละตัวแปร (อีกตัวเป็น 0) แทนสุดขั้วสองตัวพร้อมกัน — ถ้าคูณสุดขั้วทั้งคู่พร้อมกัน
       โดเมนจะกว้างเกินไปจนค่ากลางๆ (เช่นค่าเริ่มต้น) ดูแบนราบเกือบเหมือนเดิม กรณีปรับสุดขั้วทั้งสองตัว
       พร้อมกันจริงๆ (พบยาก) จะถูก clamp ให้ชิดขอบกราฟแทนล้นออกนอกกรอบ (ดู valuePy/xToRoadPx) */
    var corners = [
      { v0: v0Range[0], a: 0 },
      { v0: v0Range[1], a: 0 },
      { v0: 0, a: aRange[0] },
      { v0: 0, a: aRange[1] }
    ];
    var xLo = 0, xHi = 0, vLo = 0, vHi = 0;
    T_MAX = tMax; // sampleExtent reads module-level T_MAX; create() always passes its own T_MAX here
    corners.forEach(function (c) {
      var xE = sampleExtent(computeX, c.v0, c.a, 60);
      var vE = sampleExtent(computeV, c.v0, c.a, 60);
      if (xE.min < xLo) xLo = xE.min;
      if (xE.max > xHi) xHi = xE.max;
      if (vE.min < vLo) vLo = vE.min;
      if (vE.max > vHi) vHi = vE.max;
    });
    return {
      x: padDomain({ min: xLo, max: xHi }),
      v: padDomain({ min: vLo, max: vHi })
    };
  }

  function create(container, options) {
    options = options || {};
    var v0Range = options.v0Range || [-20, 20];
    var aRange = options.aRange || [-10, 10];
    var onUpdate = options.onUpdate || function () {};

    T_MAX = options.T_MAX || computeMaxInterestingTime(v0Range, aRange);
    var fixedDomains = computeFixedDomains(v0Range, aRange, T_MAX);

    var state = {
      v0: clamp(options.v0 != null ? options.v0 : 5, v0Range[0], v0Range[1]),
      a: clamp(options.a != null ? options.a : 2, aRange[0], aRange[1]),
      t: 0,
      playing: false
    };
    var timer = null;

    container.innerHTML = '';

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 620');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'x-t (ตำแหน่ง) · v-t (ความเร็ว) · a-t (ความเร่ง)';
    container.appendChild(legend);

    /* ---- shared geometry (แกนเวลาร่วมกันของทั้ง 3 กราฟ) ---- */
    var PLOT_LEFT = 64, PLOT_RIGHT = 660;
    var ROAD_TOP = 14, ROAD_BASELINE = 100;
    var G_H = 128, G_GAP = 24;
    var G1_TOP = 140;                  // x-t
    var G2_TOP = G1_TOP + G_H + G_GAP; // v-t
    var G3_TOP = G2_TOP + G_H + G_GAP; // a-t
    var AXIS_LABEL_Y = G3_TOP + G_H + 22;

    function tPx(t) { return PLOT_LEFT + (t / T_MAX) * (PLOT_RIGHT - PLOT_LEFT); }

    function valuePy(val, top, dom) {
      var frac = clamp((val - dom.min) / (dom.max - dom.min), 0, 1);
      return (top + G_H) - frac * G_H;
    }

    function graphSvg(top, colorVar, dom, fn, label, curVal) {
      var bottom = top + G_H;
      var out = '';
      out += '<rect x="' + PLOT_LEFT + '" y="' + top + '" width="' + (PLOT_RIGHT - PLOT_LEFT) + '" height="' + G_H + '" fill="none" stroke="var(--ink)" stroke-width="2" rx="8"/>';

      for (var g = 0; g <= 4; g++) {
        var gt = (T_MAX * g) / 4;
        var gx = tPx(gt).toFixed(1);
        out += '<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + bottom + '" stroke="var(--grid)" stroke-width="1.5"/>';
      }

      if (dom.min < 0 && dom.max > 0) {
        var y0 = valuePy(0, top, dom).toFixed(1);
        out += '<line x1="' + PLOT_LEFT + '" y1="' + y0 + '" x2="' + PLOT_RIGHT + '" y2="' + y0 + '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 6" opacity="0.55"/>';
      }

      var d = '';
      var N = 60;
      for (var i = 0; i <= N; i++) {
        var t = (T_MAX * i) / N;
        var x = tPx(t).toFixed(1);
        var y = valuePy(fn(t), top, dom).toFixed(1);
        d += (i === 0 ? 'M ' : 'L ') + x + ',' + y + ' ';
      }
      out += '<path d="' + d + '" fill="none" stroke="' + colorVar + '" stroke-width="4.5" stroke-linecap="round"/>';

      var px = tPx(state.t).toFixed(1);
      out += '<line x1="' + px + '" y1="' + top + '" x2="' + px + '" y2="' + bottom + '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 5" opacity="0.5"/>';
      var py = valuePy(curVal, top, dom).toFixed(1);
      out += '<circle cx="' + px + '" cy="' + py + '" r="7" fill="' + colorVar + '" stroke="var(--ink)" stroke-width="2"/>';

      out += '<text x="' + (PLOT_LEFT + 10) + '" y="' + (top + 20) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="14">' + label + '</text>';
      out += '<text x="' + (PLOT_LEFT + 10) + '" y="' + (top + 38) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.65">' + dom.max.toFixed(1) + '</text>';
      out += '<text x="' + (PLOT_LEFT + 10) + '" y="' + (bottom - 8) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.65">' + dom.min.toFixed(1) + '</text>';

      return out;
    }

    function render() {
      var v0 = state.v0, a = state.a, t = state.t;

      function xFn(tt) { return computeX(tt, v0, a); }
      function vFn(tt) { return computeV(tt, v0, a); }

      var xDom = fixedDomains.x;
      var vDom = fixedDomains.v;

      var aDom = padDomain({ min: aRange[0], max: aRange[1] }, 0.15);

      var curX = xFn(t), curV = vFn(t);

      /* ---- ถนน + รถ ---- */
      function xToRoadPx(xv) {
        var frac = clamp((xv - xDom.min) / (xDom.max - xDom.min), 0, 1);
        return PLOT_LEFT + frac * (PLOT_RIGHT - PLOT_LEFT);
      }
      var carPx = xToRoadPx(curX).toFixed(1);
      var startPx = xToRoadPx(0).toFixed(1);
      var dir = curV >= 0 ? 1 : -1;

      var road =
        '<line x1="' + PLOT_LEFT + '" y1="' + ROAD_BASELINE + '" x2="' + PLOT_RIGHT + '" y2="' + ROAD_BASELINE + '" stroke="var(--ink)" stroke-width="3"/>' +
        '<line x1="' + startPx + '" y1="' + ROAD_TOP + '" x2="' + startPx + '" y2="' + ROAD_BASELINE + '" stroke="var(--ink)" stroke-width="2" stroke-dasharray="3 5" opacity="0.55"/>' +
        '<text x="' + startPx + '" y="' + (ROAD_TOP + 10) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="11" text-anchor="middle" opacity="0.7">START</text>' +
        '<g transform="translate(' + carPx + ',' + ROAD_BASELINE + ') scale(' + dir + ',1)">' +
          '<rect x="-27" y="-38" width="54" height="20" rx="6" fill="var(--accent-primary)" stroke="var(--ink)" stroke-width="2.5"/>' +
          '<rect x="-14" y="-52" width="30" height="15" rx="5" fill="var(--accent-primary)" stroke="var(--ink)" stroke-width="2.5"/>' +
          '<circle cx="-15" cy="-9" r="9" fill="var(--ink)"/>' +
          '<circle cx="15" cy="-9" r="9" fill="var(--ink)"/>' +
        '</g>';

      /* ---- พื้นที่ใต้กราฟ v-t = ระยะทางที่เคลื่อนที่ได้ ---- */
      var areaPts = [
        tPx(0).toFixed(1) + ',' + valuePy(0, G2_TOP, vDom).toFixed(1),
        tPx(0).toFixed(1) + ',' + valuePy(vFn(0), G2_TOP, vDom).toFixed(1),
        tPx(t).toFixed(1) + ',' + valuePy(curV, G2_TOP, vDom).toFixed(1),
        tPx(t).toFixed(1) + ',' + valuePy(0, G2_TOP, vDom).toFixed(1)
      ];
      var area = '<polygon points="' + areaPts.join(' ') + '" fill="var(--accent-secondary)" fill-opacity="0.22"/>';

      var g1 = graphSvg(G1_TOP, 'var(--accent-primary)', xDom, xFn, 'กราฟ x-t (m)', curX);
      var g2 = area + graphSvg(G2_TOP, 'var(--accent-secondary)', vDom, vFn, 'กราฟ v-t (m/s)', curV);
      var g3 = graphSvg(G3_TOP, 'var(--accent-tertiary)', aDom, function () { return a; }, 'กราฟ a-t (m/s²)', a);

      var ticks = '';
      for (var g = 0; g <= 4; g++) {
        var gt = (T_MAX * g) / 4;
        var gx = tPx(gt).toFixed(1);
        ticks += '<text x="' + gx + '" y="' + AXIS_LABEL_Y + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" text-anchor="middle" opacity="0.65">' + gt.toFixed(1) + '</text>';
      }
      ticks += '<text x="' + PLOT_RIGHT + '" y="' + (AXIS_LABEL_Y + 16) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="11" text-anchor="end" opacity="0.7">t (s)</text>';

      svg.innerHTML = road + g1 + g2 + g3 + ticks;

      onUpdate({
        v0: v0, a: a, x: curX, v: curV, t: t, playing: state.playing
      });
    }

    function play() {
      if (state.playing) { pause(); return; }
      if (state.t >= T_MAX - 0.001) state.t = 0;
      state.playing = true;
      render();
      timer = setInterval(function () {
        state.t += 0.03;
        if (state.t >= T_MAX) {
          state.t = T_MAX;
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

    function setV0(v) {
      state.v0 = clamp(v, v0Range[0], v0Range[1]);
      if (!state.playing) state.t = 0;
      render();
    }

    function setA(a) {
      state.a = clamp(a, aRange[0], aRange[1]);
      if (!state.playing) state.t = 0;
      render();
    }

    render();

    return {
      setV0: setV0,
      setA: setA,
      play: play,
      pause: pause,
      reset: reset,
      isPlaying: function () { return state.playing; },
      destroy: function () { if (timer) clearInterval(timer); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.motionGraphs = { create: create };
})();
