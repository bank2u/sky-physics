/* shared/sim/circuit-ohm.js — วงจรไฟฟ้าอย่างง่าย (แบตเตอรี่ + หลอดไฟ 2 ดวง) แบบอนุกรม/ขนาน
   ใช้ผ่าน window.SimPatterns.circuitOhm.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--cyan)/var(--magenta)/var(--yellow)/var(--surface)/var(--font)) ห้ามฝัง hex ตรงๆ

   โมเดลฟิสิกส์: หลอดไฟ 2 ดวงเหมือนกัน (ความต้านทาน R เท่ากันทั้งคู่)
     - อนุกรม:  R_total = 2R,  I = V / R_total  เท่ากันทุกจุดในวงจร (ผ่านหลอดทั้งสองเท่ากัน — สอนว่ากระแสไม่ได้ "ถูกใช้หมด")
     - ขนาน:   แต่ละกิ่งมี I_branch = V / R อิสระต่อกัน, กระแสรวม I_total = I1 + I2
   Animation ใช้เทคนิค mesh-current superposition: วาด "ห่วง" (loop) หนึ่งห่วงต่อกิ่ง แล้วปล่อยจุดประจุวิ่งวนในห่วงนั้น
   ด้วยอัตราเร็ว ∝ กระแสของห่วงนั้น — ช่วงลวดที่ห่วงซ้อนทับกัน (สายหลักใกล้แบตเตอรี่) จะเห็นจุดจากทั้งสองห่วงรวมกัน
   ซึ่งสื่อความหมายว่ากระแสตรงนั้นคือผลรวมของทั้งสองกิ่งพอดี */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var instanceSeq = 0;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  // ฟังก์ชันอิ่มตัวแบบ Michaelis-Menten — กัน I ที่ต่าง scale กันมาก (~0.005A ถึง ~24A ตามช่วงตัวแปร)
  // ให้ animation/ความสว่างยังดูสมเหตุผลไม่ว่า I จะเล็กหรือใหญ่แค่ไหน (ไม่ใช้ clamp แข็งๆ ที่ทำให้ค่าปลายช่วงดูเหมือนกันหมด)
  function saturate(current, k) { return current / (current + k); }

  function loopLength(points) {
    var total = 0;
    for (var i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  function pointAtDistance(points, dist, total) {
    var d = ((dist % total) + total) % total;
    for (var i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      var segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= segLen || i === points.length - 1) {
        var frac = segLen === 0 ? 0 : d / segLen;
        return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
      }
      d -= segLen;
    }
    return points[0];
  }

  function wireLine(a, b) {
    return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
      '" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>';
  }

  /* ---- geometry คงที่ (viewBox 700x570 เหมือน pattern อื่นในคลัง) ---- */
  var BATTERY = { x: 350, y: 460 };
  var GAP = 34; // ครึ่งความกว้างช่องว่างสายไฟตรงสัญลักษณ์แบตเตอรี่
  var BULB_R = 26;

  // อนุกรม: วงสี่เหลี่ยมเดียว หลอด 2 ดวงอยู่บนขอบบน
  var S_TL = { x: 150, y: 140 }, S_TR = { x: 550, y: 140 };
  var S_BL = { x: 150, y: 460 }, S_BR = { x: 550, y: 460 };
  var S_BULB1 = { x: 280, y: 140 }, S_BULB2 = { x: 420, y: 140 };

  // ขนาน: บันได — บัส 2 เส้นซ้าย/ขวา + รุ่ง (rung) 2 เส้นแต่ละเส้นมีหลอด
  var P_LEFT_X = 180, P_RIGHT_X = 520;
  var P_BOT_Y = 460, P_MID_Y = 340, P_TOP_Y = 220;
  var P_BULB_A = { x: 350, y: P_TOP_Y }; // รุ่งบน (ห่วงใหญ่)
  var P_BULB_B = { x: 350, y: P_MID_Y }; // รุ่งกลาง (ห่วงเล็ก)

  function create(container, options) {
    options = options || {};
    var vRange = options.vRange || [1, 12];
    var rRange = options.rRange || [1, 100];
    var onUpdate = options.onUpdate || function () {};
    var seq = instanceSeq++;

    var state = {
      voltage: clamp(options.voltage != null ? options.voltage : 6, vRange[0], vRange[1]),
      resistance: clamp(options.resistance != null ? options.resistance : 20, rRange[0], rRange[1]),
      mode: options.mode === 'parallel' ? 'parallel' : 'series'
    };
    var phase = { series: 0, loopA: 0, loopB: 0 };
    var rafId = null;
    var lastTs = null;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 570');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--magenta';
    legend.textContent = 'จุด = ประจุไฟฟ้า · ความเร็วจุด ∝ กระแส I';
    container.appendChild(legend);

    function computeValues() {
      var V = state.voltage, R = state.resistance;
      if (state.mode === 'series') {
        var rTotalS = 2 * R;
        var iS = V / rTotalS;
        return { mode: 'series', voltage: V, resistance: R, current: iS, rTotal: rTotalS, branch: [iS, iS] };
      }
      var ib = V / R;
      var rTotalP = R / 2;
      return { mode: 'parallel', voltage: V, resistance: R, current: 2 * ib, rTotal: rTotalP, branch: [ib, ib] };
    }

    function currentSpeed(i) {
      var SPEED_MIN = 20, SPEED_MAX = 320, K = 1.2;
      return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * saturate(i, K);
    }

    function bulbMarkup(cx, cy, current) {
      var bright = saturate(current, 1.5);
      var glowR = 26 + bright * 30;
      var glowOpacity = (0.12 + bright * 0.55).toFixed(2);
      var fillOpacity = (0.15 + bright * 0.7).toFixed(2);
      return (
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + glowR.toFixed(1) + '" fill="var(--yellow)" opacity="' + glowOpacity +
        '" filter="url(#ohm-glow-' + seq + ')"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + BULB_R + '" fill="var(--yellow)" fill-opacity="' + fillOpacity +
        '" stroke="var(--ink)" stroke-width="4"/>' +
        '<path d="M ' + (cx - 13) + ' ' + (cy - 13) + ' L ' + (cx + 13) + ' ' + (cy + 13) +
        ' M ' + (cx + 13) + ' ' + (cy - 13) + ' L ' + (cx - 13) + ' ' + (cy + 13) +
        '" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>'
      );
    }

    function batteryMarkup(cx, cy) {
      return (
        '<line x1="' + (cx - 10) + '" y1="' + (cy - 26) + '" x2="' + (cx - 10) + '" y2="' + (cy + 26) +
        '" stroke="var(--ink)" stroke-width="5"/>' +
        '<line x1="' + (cx + 10) + '" y1="' + (cy - 15) + '" x2="' + (cx + 10) + '" y2="' + (cy + 15) +
        '" stroke="var(--ink)" stroke-width="10"/>' +
        '<text x="' + (cx - 26) + '" y="' + (cy - 34) + '" font-size="22" font-weight="900" fill="var(--ink)" style="font-family:var(--font)">+</text>' +
        '<text x="' + (cx + 6) + '" y="' + (cy - 34) + '" font-size="22" font-weight="900" fill="var(--ink)" style="font-family:var(--font)">&#8722;</text>'
      );
    }

    function dotsAlong(points, current, phaseVal, colorVar) {
      var total = loopLength(points);
      var count = Math.max(4, Math.round(total / 60));
      var out = '';
      for (var i = 0; i < count; i++) {
        var dist = phaseVal + (total / count) * i;
        var p = pointAtDistance(points, dist, total);
        out += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="8" fill="' + colorVar +
          '" stroke="var(--ink)" stroke-width="2"/>';
      }
      return out;
    }

    function frameRender() {
      var vals = computeValues();
      var parts = [];
      parts.push(
        '<defs><filter id="ohm-glow-' + seq + '" x="-100%" y="-100%" width="300%" height="300%">' +
        '<feGaussianBlur stdDeviation="8"/></filter></defs>'
      );

      if (state.mode === 'series') {
        parts.push(wireLine(S_BL, { x: BATTERY.x - GAP, y: BATTERY.y }));
        parts.push(wireLine({ x: BATTERY.x + GAP, y: BATTERY.y }, S_BR));
        parts.push(wireLine(S_BR, S_TR));
        parts.push(wireLine(S_TR, { x: S_BULB2.x + BULB_R, y: S_BULB2.y }));
        parts.push(wireLine({ x: S_BULB2.x - BULB_R, y: S_BULB2.y }, { x: S_BULB1.x + BULB_R, y: S_BULB1.y }));
        parts.push(wireLine({ x: S_BULB1.x - BULB_R, y: S_BULB1.y }, S_TL));
        parts.push(wireLine(S_TL, S_BL));
        parts.push(batteryMarkup(BATTERY.x, BATTERY.y));
        parts.push(bulbMarkup(S_BULB1.x, S_BULB1.y, vals.current));
        parts.push(bulbMarkup(S_BULB2.x, S_BULB2.y, vals.current));

        var loopPts = [BATTERY, S_BR, S_TR, S_BULB2, S_BULB1, S_TL, S_BL];
        parts.push(dotsAlong(loopPts, vals.current, phase.series, 'var(--cyan)'));
      } else {
        var leftBot = { x: P_LEFT_X, y: P_BOT_Y }, leftMid = { x: P_LEFT_X, y: P_MID_Y }, leftTop = { x: P_LEFT_X, y: P_TOP_Y };
        var rightBot = { x: P_RIGHT_X, y: P_BOT_Y }, rightMid = { x: P_RIGHT_X, y: P_MID_Y }, rightTop = { x: P_RIGHT_X, y: P_TOP_Y };

        parts.push(wireLine(leftBot, { x: BATTERY.x - GAP, y: BATTERY.y }));
        parts.push(wireLine({ x: BATTERY.x + GAP, y: BATTERY.y }, rightBot));
        parts.push(wireLine(leftBot, leftMid));
        parts.push(wireLine(leftMid, leftTop));
        parts.push(wireLine(rightTop, rightMid));
        parts.push(wireLine(rightMid, rightBot));
        parts.push(wireLine(leftMid, { x: P_BULB_B.x - BULB_R, y: P_BULB_B.y }));
        parts.push(wireLine({ x: P_BULB_B.x + BULB_R, y: P_BULB_B.y }, rightMid));
        parts.push(wireLine(leftTop, { x: P_BULB_A.x - BULB_R, y: P_BULB_A.y }));
        parts.push(wireLine({ x: P_BULB_A.x + BULB_R, y: P_BULB_A.y }, rightTop));
        parts.push(batteryMarkup(BATTERY.x, BATTERY.y));
        parts.push(bulbMarkup(P_BULB_A.x, P_BULB_A.y, vals.branch[0]));
        parts.push(bulbMarkup(P_BULB_B.x, P_BULB_B.y, vals.branch[1]));

        var loopAPts = [leftBot, leftMid, leftTop, P_BULB_A, rightTop, rightMid, rightBot, BATTERY];
        var loopBPts = [leftBot, leftMid, P_BULB_B, rightMid, rightBot, BATTERY];
        parts.push(dotsAlong(loopAPts, vals.branch[0], phase.loopA, 'var(--cyan)'));
        parts.push(dotsAlong(loopBPts, vals.branch[1], phase.loopB, 'var(--magenta)'));
      }

      svg.innerHTML = parts.join('');
    }

    function tick(ts) {
      if (lastTs == null) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      var vals = computeValues();
      if (state.mode === 'series') {
        phase.series += currentSpeed(vals.current) * dt;
      } else {
        phase.loopA += currentSpeed(vals.branch[0]) * dt;
        phase.loopB += currentSpeed(vals.branch[1]) * dt;
      }
      frameRender();
      rafId = requestAnimationFrame(tick);
    }

    function notify() { onUpdate(computeValues()); }

    function setVoltage(v) { state.voltage = clamp(v, vRange[0], vRange[1]); notify(); }
    function setResistance(r) { state.resistance = clamp(r, rRange[0], rRange[1]); notify(); }
    function setMode(m) { state.mode = m === 'parallel' ? 'parallel' : 'series'; notify(); }

    notify();
    frameRender();
    rafId = requestAnimationFrame(tick);

    return {
      setVoltage: setVoltage,
      setResistance: setResistance,
      setMode: setMode,
      getMode: function () { return state.mode; },
      destroy: function () { if (rafId) cancelAnimationFrame(rafId); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.circuitOhm = { create: create };
})();
