/* shared/sim/wave-interference.js — การซ้อนทับ (superposition) + การแทรกสอดสองแหล่งกำเนิดอาพันธ์ (Young's double slit)
   ใช้ผ่าน window.SimPatterns.waveInterference.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--cyan)/var(--magenta)/var(--yellow)) ห้ามฝัง hex ตรงๆ

   โครง 2 แผงในผืนเดียว:
   - แผงบน (superposition): คลื่นสองขบวนวิ่งสวนทางกัน (เฟสตรงข้ามทิศ) ให้เห็นเส้นผลรวม y = y1+y2
     เมื่อยอดซ้อนยอด (เสริม, กว้างเป็น 2 เท่า) และยอดซ้อนท้อง (หักล้าง, แบนราบ) สลับกันตามเวลา
   - แผงล่าง (double slit): สองแหล่งกำเนิดอาพันธ์ห่างกัน d ปล่อยคลื่นวงกลม, จอทางขวาแสดงลวดลายแถบสว่าง-มืด
     คำนวณจากผลต่างระยะทาง Δ = r2 - r1 จริง (ไม่ประมาณมุมเล็ก) แต่ตำแหน่งปฏิบัพ/บัพใช้สูตรมุมเล็กมาตรฐาน (Δ = nλ)

   หมายเหตุมาตราส่วน (สำคัญสำหรับครู): แผงบนใช้ "หน่วยจำลอง" (พิกเซล) ไม่ผูกกับ mm จริง เพื่อให้เห็นคลื่นได้ชัดบนจอ
   แผงล่างคำนวณด้วยหน่วย mm จริงตามที่ปรับ (d) และระยะจอ L คงที่ 8 mm (ค่าออกแบบ ไม่ใช่ตัวแปรที่ปรับได้) —
   คล้ายการทดลอง "ถังคลื่น" (ripple tank) มากกว่าแสงจริง เพราะความถี่ 1–10 Hz และ d หน่วย mm ไม่ใช่สเกลของแสงที่มองเห็น
   ใช้ velocity คลื่นสมมติ V2 = 1.5 mm/s เพื่อให้ λ อยู่ในสเกลใกล้เคียง d แล้วเห็นแถบแทรกสอดได้ชัดตลอดช่วงค่าที่ปรับได้ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function create(container, options) {
    options = options || {};
    var fRange = options.fRange || [1, 10];
    var aRange = options.aRange || [0.5, 2];
    var dRange = options.dRange || [0.5, 5];
    var onUpdate = options.onUpdate || function () {};

    /* ---- ค่าคงที่ของภาพ (ออกแบบเพื่อความชัดเจนบนจอ ไม่ใช่ตัวแปรที่ปรับได้) ---- */
    var V1_PXPS = 260;      // ความเร็วคลื่น "หน่วยจำลอง" แผงบน (px/s)
    var PX_PER_CM = 40;     // มาตราส่วนแอมพลิจูดแผงบน
    var V2_MMPS = 1.5;      // ความเร็วคลื่น (mm/s) แผงล่าง — เลือกให้ λ ใกล้เคียงสเกล d
    var L_MM = 8;           // ระยะจากแหล่งกำเนิดถึงจอ (mm) คงที่
    var K_PXPMM = 20;       // px ต่อ mm แผงล่าง
    var NRINGS = 9;         // จำนวนวงคลื่นวงกลมต่อแหล่งกำเนิด (ของตกแต่ง แสดงคลื่นวงกลมอาพันธ์)
    var Y_RANGE_MM = 4;     // ครึ่งความสูงของจอ (mm)
    var Y_MARKER_MM = 1.5;  // จุดสังเกตคงที่บนจอ สำหรับอ่านค่า Δ แบบ realtime

    /* พิกัดแผงบน (superposition) */
    var P1_X0 = 40, P1_W = 620, P1_BASE = 120;
    var P1_OBS_X = P1_W / 2; // จุดสังเกตอยู่กึ่งกลางแผงบน

    /* พิกัดแผงล่าง (double slit) */
    var P2_SRC_X = 110, P2_MID_Y = 430;
    var P2_SCREEN_X = P2_SRC_X + L_MM * K_PXPMM;
    var P2_BAR_MAX = 130;

    var state = {
      f: clamp(options.f != null ? options.f : 4, fRange[0], fRange[1]),
      A: clamp(options.A != null ? options.A : 1, aRange[0], aRange[1]),
      d: clamp(options.d != null ? options.d : 2, dRange[0], dRange[1]),
      t: 0,
      playing: true
    };
    var timer = null;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 620');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--yellow';
    legend.textContent = 'คลื่น 1 · คลื่น 2 · ผลรวม (superposition)';
    container.appendChild(legend);

    function computeValues() {
      var lambda1Px = V1_PXPS / state.f;
      var k1 = (2 * Math.PI) / lambda1Px;
      var w = 2 * Math.PI * state.f;
      var pxAmp = state.A * PX_PER_CM;

      var lambda2Mm = V2_MMPS / state.f;
      var yAntinode1 = (lambda2Mm * L_MM) / state.d;
      var yNode1 = ((lambda2Mm / 2) * L_MM) / state.d;

      var half = state.d / 2;
      var r1m = Math.sqrt(L_MM * L_MM + Math.pow(Y_MARKER_MM - half, 2));
      var r2m = Math.sqrt(L_MM * L_MM + Math.pow(Y_MARKER_MM + half, 2));
      var deltaMm = r2m - r1m;

      var y1Obs = pxAmp * Math.sin(k1 * P1_OBS_X - w * state.t);
      var y2Obs = pxAmp * Math.sin(k1 * P1_OBS_X + w * state.t);
      var ySumObs = y1Obs + y2Obs;

      return {
        k1: k1, w: w, pxAmp: pxAmp,
        lambda2Mm: lambda2Mm, yAntinode1: yAntinode1, yNode1: yNode1,
        deltaMm: deltaMm, ySumObsCm: ySumObs / PX_PER_CM
      };
    }

    function wavePath(offsetSign, vals) {
      var N = 140;
      var d = '';
      for (var i = 0; i <= N; i++) {
        var x = (i / N) * P1_W;
        var y = vals.pxAmp * Math.sin(vals.k1 * x + offsetSign * vals.w * state.t);
        var X = P1_X0 + x, Y = P1_BASE - y;
        d += (i === 0 ? 'M ' : 'L ') + X.toFixed(1) + ',' + Y.toFixed(1) + ' ';
      }
      return d;
    }

    function sumPath(vals) {
      var N = 140;
      var d = '';
      for (var i = 0; i <= N; i++) {
        var x = (i / N) * P1_W;
        var y1 = vals.pxAmp * Math.sin(vals.k1 * x - vals.w * state.t);
        var y2 = vals.pxAmp * Math.sin(vals.k1 * x + vals.w * state.t);
        var X = P1_X0 + x, Y = P1_BASE - (y1 + y2);
        d += (i === 0 ? 'M ' : 'L ') + X.toFixed(1) + ',' + Y.toFixed(1) + ' ';
      }
      return d;
    }

    function ringsSvg(cx, cy, colorVar, lambdaMm) {
      var phase = (state.t * V2_MMPS) % lambdaMm;
      var out = '';
      for (var k = 0; k < NRINGS; k++) {
        var rMm = phase + k * lambdaMm;
        var rPx = rMm * K_PXPMM;
        var op = (1 - (k / NRINGS) * 0.85).toFixed(2);
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rPx.toFixed(1) +
          '" fill="none" stroke="' + colorVar + '" stroke-width="2" opacity="' + op + '"/>';
      }
      return out;
    }

    function screenBars(vals) {
      var out = '';
      var step = 6;
      for (var py = -Y_RANGE_MM * K_PXPMM; py <= Y_RANGE_MM * K_PXPMM; py += step) {
        var Ymm = py / K_PXPMM;
        var half = state.d / 2;
        var r1 = Math.sqrt(L_MM * L_MM + Math.pow(Ymm - half, 2));
        var r2 = Math.sqrt(L_MM * L_MM + Math.pow(Ymm + half, 2));
        var delta = r2 - r1;
        var I = Math.pow(Math.cos((Math.PI * delta) / vals.lambda2Mm), 2);
        var barLen = I * P2_BAR_MAX * (state.A / aRange[1]);
        var op = (0.32 + 0.68 * I).toFixed(2);
        out += '<rect x="' + P2_SCREEN_X + '" y="' + (P2_MID_Y + py - step / 2).toFixed(1) +
          '" width="' + barLen.toFixed(1) + '" height="' + (step - 1) + '" fill="var(--yellow)" opacity="' + op + '"/>';
      }
      return out;
    }

    function markerDot(yMm, filled, colorVar) {
      if (Math.abs(yMm) > Y_RANGE_MM) return '';
      var cy = P2_MID_Y + yMm * K_PXPMM;
      var fill = filled ? colorVar : 'none';
      var dash = filled ? '' : ' stroke-dasharray="2 2"';
      return '<circle cx="' + P2_SCREEN_X + '" cy="' + cy.toFixed(1) + '" r="7" fill="' + fill +
        '" stroke="var(--ink)" stroke-width="2"' + dash + '/>';
    }

    function render() {
      var vals = computeValues();

      var svgContent = '';

      /* ---- แผงบน: superposition ---- */
      svgContent +=
        '<text x="' + P1_X0 + '" y="24" style="font:800 var(--fs-label) var(--font);fill:var(--ink);opacity:.6">การซ้อนทับ (SUPERPOSITION) — คลื่นสวนทาง</text>' +
        '<line x1="' + P1_X0 + '" y1="' + P1_BASE + '" x2="' + (P1_X0 + P1_W) + '" y2="' + P1_BASE + '" stroke="var(--ink)" stroke-width="2" opacity="0.35"/>' +
        '<line x1="' + (P1_X0 + P1_OBS_X) + '" y1="30" x2="' + (P1_X0 + P1_OBS_X) + '" y2="220" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 5" opacity="0.5"/>' +
        '<path d="' + wavePath(-1, vals) + '" fill="none" stroke="var(--cyan)" stroke-width="3" stroke-dasharray="1 9" stroke-linecap="round"/>' +
        '<path d="' + wavePath(1, vals) + '" fill="none" stroke="var(--magenta)" stroke-width="3" stroke-dasharray="1 9" stroke-linecap="round"/>' +
        '<path d="' + sumPath(vals) + '" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>' +
        '<circle cx="' + (P1_X0 + P1_OBS_X) + '" cy="' + P1_BASE + '" r="6" fill="var(--yellow)" stroke="var(--ink)" stroke-width="2"/>';

      /* ---- เส้นแบ่งแผง ---- */
      svgContent += '<line x1="20" y1="245" x2="680" y2="245" stroke="var(--ink)" stroke-width="2" stroke-dasharray="2 6" opacity="0.4"/>';

      /* ---- แผงล่าง: double slit ---- */
      var half = state.d / 2;
      var s1y = P2_MID_Y - half * K_PXPMM;
      var s2y = P2_MID_Y + half * K_PXPMM;
      var markerCy = P2_MID_Y + Y_MARKER_MM * K_PXPMM;

      svgContent +=
        '<text x="' + P2_SRC_X + '" y="272" style="font:800 var(--fs-label) var(--font);fill:var(--ink);opacity:.6">การแทรกสอดสองแหล่งกำเนิด (DOUBLE SLIT) — L = ' + L_MM + ' mm (คงที่)</text>' +
        ringsSvg(P2_SRC_X, s1y, 'var(--cyan)', vals.lambda2Mm) +
        ringsSvg(P2_SRC_X, s2y, 'var(--magenta)', vals.lambda2Mm) +
        '<line x1="' + P2_SRC_X + '" y1="' + s1y.toFixed(1) + '" x2="' + P2_SCREEN_X + '" y2="' + markerCy.toFixed(1) + '" stroke="var(--cyan)" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.7"/>' +
        '<line x1="' + P2_SRC_X + '" y1="' + s2y.toFixed(1) + '" x2="' + P2_SCREEN_X + '" y2="' + markerCy.toFixed(1) + '" stroke="var(--magenta)" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.7"/>' +
        '<circle cx="' + P2_SRC_X + '" cy="' + s1y.toFixed(1) + '" r="7" fill="var(--cyan)" stroke="var(--ink)" stroke-width="2"/>' +
        '<circle cx="' + P2_SRC_X + '" cy="' + s2y.toFixed(1) + '" r="7" fill="var(--magenta)" stroke="var(--ink)" stroke-width="2"/>' +
        '<line x1="' + P2_SCREEN_X + '" y1="' + (P2_MID_Y - Y_RANGE_MM * K_PXPMM) + '" x2="' + P2_SCREEN_X + '" y2="' + (P2_MID_Y + Y_RANGE_MM * K_PXPMM) + '" stroke="var(--ink)" stroke-width="4"/>' +
        screenBars(vals) +
        markerDot(vals.yAntinode1, true, 'var(--yellow)') +
        markerDot(-vals.yAntinode1, true, 'var(--yellow)') +
        markerDot(vals.yNode1, false, 'var(--ink)') +
        markerDot(-vals.yNode1, false, 'var(--ink)') +
        '<circle cx="' + P2_SCREEN_X + '" cy="' + markerCy.toFixed(1) + '" r="6" fill="var(--yellow)" stroke="var(--ink)" stroke-width="2"/>';

      svg.innerHTML = svgContent;

      onUpdate({
        f: state.f, A: state.A, d: state.d,
        delta: vals.deltaMm, yObs: vals.ySumObsCm,
        yAntinode1: vals.yAntinode1, yNode1: vals.yNode1,
        playing: state.playing
      });
    }

    function tick() {
      state.t += 0.016;
      render();
    }

    function play() {
      state.playing = true;
      if (timer) return;
      timer = setInterval(tick, 16);
      render();
    }

    function pause() {
      state.playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      render();
    }

    function toggle() {
      if (state.playing) pause(); else play();
    }

    function reset() {
      state.t = 0;
      render();
    }

    function setF(v) { state.f = clamp(v, fRange[0], fRange[1]); render(); }
    function setA(v) { state.A = clamp(v, aRange[0], aRange[1]); render(); }
    function setD(v) { state.d = clamp(v, dRange[0], dRange[1]); render(); }

    render();
    if (state.playing) { timer = setInterval(tick, 16); }

    return {
      setF: setF,
      setA: setA,
      setD: setD,
      play: play,
      pause: pause,
      toggle: toggle,
      reset: reset,
      isPlaying: function () { return state.playing; },
      destroy: function () { if (timer) clearInterval(timer); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.waveInterference = { create: create };
})();
