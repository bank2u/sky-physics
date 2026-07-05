/* shared/sim/friction.js — ผลักกล่องบนพื้น เห็นแรงเสียดทานต้านการเคลื่อนที่ + กฎข้อ 1–2 ของนิวตัน
   ใช้ผ่าน window.SimPatterns.friction.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ fPush/mu/mass + ช่วงค่า จาก control ภายนอก, ปุ่ม "ผลัก" สั่งผ่าน setPushing()
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)/var(--grid))
   ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function create(container, options) {
    options = options || {};
    var fRange    = options.fRange    || [0, 50];
    var muRange   = options.muRange   || [0, 0.6];
    var massRange = options.massRange || [1, 8];
    var g = options.g || 10;
    var onUpdate = options.onUpdate || function () {};

    var state = {
      fPush: clamp(options.fPush != null ? options.fPush : 25, fRange[0], fRange[1]),
      mu:    clamp(options.mu    != null ? options.mu    : 0.3, muRange[0], muRange[1]),
      mass:  clamp(options.mass  != null ? options.mass  : 2, massRange[0], massRange[1]),
      pushing: false,
      x: 0,   // ตำแหน่ง (เมตร) — ใช้เลื่อนพื้นแบบสายพาน
      v: 0,   // ความเร็ว (m/s), + = ทิศผลัก (ขวา)
      net: 0, friction: 0, a: 0
    };
    var timer = null;
    var lastT = 0;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 470');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--secondary';
    legend.textContent = 'แรงผลัก (ฟ้า) · แรงเสียดทาน (ชมพู) ต้านการเคลื่อนที่เสมอ';
    container.appendChild(legend);

    /* ---- physics ---- */
    function stepPhysics(dt) {
      var fricMax = state.mu * state.mass * g;
      var applied = state.pushing ? state.fPush : 0; // ทิศ +x เสมอ
      var friction, net;

      if (Math.abs(state.v) < 1e-4 && !state.pushing) {
        state.v = 0; friction = 0; net = 0;
      } else if (Math.abs(state.v) < 1e-4 && state.pushing) {
        // หยุดนิ่ง + กำลังผลัก → แรงเสียดทานสถิตต้านไว้จนกว่าแรงผลักจะชนะ
        if (applied > fricMax) { friction = fricMax; net = applied - fricMax; }
        else { friction = applied; net = 0; }
      } else {
        // กำลังเคลื่อนที่ → แรงเสียดทานจลน์ต้านทิศความเร็ว
        var dir = state.v > 0 ? 1 : -1;
        friction = fricMax;
        net = applied - dir * fricMax;
      }

      state.a = net / state.mass;
      var vNew = state.v + state.a * dt;
      // ถ้าไม่ได้ผลัก (หรือผลักไม่ชนะแรงเสียดทาน) แล้วความเร็วกำลังจะข้ามศูนย์ → หยุดพอดี ไม่ถอยหลัง
      if (state.v !== 0 && vNew * state.v < 0 && applied <= fricMax) {
        vNew = 0; state.a = 0; net = 0;
      }
      state.v = vNew;
      state.x += state.v * dt;
      state.net = net;
      state.friction = friction;
    }

    /* ---- render ---- */
    var GROUND_Y = 360, LEFT = 40, RIGHT = 660, PLOT_W = RIGHT - LEFT;
    var PX_PER_M = 90;           // สเกลเลื่อนพื้น
    var TICK_GAP = 60;           // ระยะห่างขีดพื้น (px)
    var BOX_CX = 350;            // กล่องอยู่กลางจอ (สายพาน: พื้นเลื่อน กล่องอยู่กับที่)

    function mod(n, m) { return ((n % m) + m) % m; }

    function render() {
      var moving = Math.abs(state.v) > 1e-3;
      var boxW = 96 + state.mass * 9;   // กล่องหนักดูใหญ่ขึ้น
      var boxH = boxW * 0.72;
      var boxTop = GROUND_Y - boxH;

      var parts = [];

      // เส้นพื้น
      parts.push('<line x1="' + LEFT + '" y1="' + GROUND_Y + '" x2="' + RIGHT + '" y2="' + GROUND_Y + '" stroke="var(--ink)" stroke-width="4"/>');

      // ขีดพื้นเลื่อน (สายพาน) — เห็นการเคลื่อนที่ต่อเนื่องแม้กล่องอยู่กลางจอ
      var offset = mod(state.x * PX_PER_M, TICK_GAP);
      for (var tx = LEFT - TICK_GAP; tx <= RIGHT + TICK_GAP; tx += TICK_GAP) {
        var gx = tx - offset;
        if (gx < LEFT || gx > RIGHT) continue;
        parts.push('<line x1="' + gx.toFixed(1) + '" y1="' + GROUND_Y + '" x2="' + (gx - 16).toFixed(1) + '" y2="' + (GROUND_Y + 20) + '" stroke="var(--ink)" stroke-width="2.5" opacity="0.55"/>');
      }

      // กล่อง
      var bx = BOX_CX - boxW / 2;
      parts.push('<rect x="' + bx.toFixed(1) + '" y="' + boxTop.toFixed(1) + '" width="' + boxW.toFixed(1) + '" height="' + boxH.toFixed(1) + '" rx="10" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="4"/>');
      parts.push('<text x="' + BOX_CX + '" y="' + (boxTop + boxH / 2 + 8).toFixed(1) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--font)" font-weight="900" font-size="26">' + state.mass + ' kg</text>');

      // เส้นความเร็ว (speed lines) ด้านหลังกล่องเมื่อเคลื่อนที่
      if (moving) {
        var sdir = state.v > 0 ? -1 : 1; // ลากเส้นไปด้านหลังการเคลื่อนที่
        var speedN = Math.min(4, 1 + Math.floor(Math.abs(state.v) / 1.5));
        for (var s = 0; s < speedN; s++) {
          var ly = boxTop + 16 + s * (boxH - 28) / Math.max(1, speedN - 1);
          var lx0 = (state.v > 0 ? bx : bx + boxW);
          var len = 18 + Math.min(46, Math.abs(state.v) * 8);
          parts.push('<line x1="' + lx0.toFixed(1) + '" y1="' + ly.toFixed(1) + '" x2="' + (lx0 + sdir * len).toFixed(1) + '" y2="' + ly.toFixed(1) + '" stroke="var(--accent-tertiary)" stroke-width="4" stroke-linecap="round" opacity="0.7"/>');
        }
      }

      // ---- ลูกศรแรง ----
      var arrowY = boxTop - 4;
      function forceArrow(mag, dir, colorVar, labelText) {
        if (mag < 0.05) return '';
        var len = 26 + Math.min(150, mag * 3.2);
        var startX = (dir > 0) ? (bx + boxW) : bx;
        var endX = startX + dir * len;
        var head = endX + ',' + arrowY + ' ' + (endX - dir * 18) + ',' + (arrowY - 11) + ' ' + (endX - dir * 18) + ',' + (arrowY + 11);
        var lblX = (startX + endX) / 2;
        return '<line x1="' + startX.toFixed(1) + '" y1="' + arrowY + '" x2="' + (endX - dir * 14).toFixed(1) + '" y2="' + arrowY + '" stroke="' + colorVar + '" stroke-width="8" stroke-linecap="round"/>' +
               '<polygon points="' + head + '" fill="' + colorVar + '"/>' +
               '<text x="' + lblX.toFixed(1) + '" y="' + (arrowY - 20) + '" text-anchor="middle" fill="' + colorVar + '" font-family="var(--font)" font-weight="900" font-size="16">' + labelText + '</text>';
      }

      // แรงผลัก (ทิศ +x) จากด้านซ้ายของกล่อง ชี้เข้า → วาดออกทางขวาของกล่อง
      var applied = state.pushing ? state.fPush : 0;
      // แรงเสียดทานต้านการเคลื่อนที่: ถ้าเคลื่อนที่ → สวนทาง v; ถ้าหยุดแต่ผลัก → สวนทางแรงผลัก
      var fricDir;
      if (moving) fricDir = state.v > 0 ? -1 : 1;
      else fricDir = -1; // ผลักไปทางขวา แรงเสียดทานสถิตชี้ซ้าย
      parts.push(forceArrow(applied, 1, 'var(--accent-primary)', 'แรงผลัก ' + Math.round(applied) + ' N'));
      parts.push(forceArrow(state.friction, fricDir, 'var(--accent-secondary)', 'แรงเสียดทาน ' + state.friction.toFixed(0) + ' N'));

      svg.innerHTML = parts.join('');

      onUpdate({
        fPush: state.fPush, mu: state.mu, mass: state.mass,
        applied: applied, friction: state.friction, net: state.net,
        a: state.a, v: state.v, moving: moving, pushing: state.pushing
      });
    }

    /* ---- loop (เดินตลอด เพื่อให้แรงเสียดทานหน่วงแบบเรียลไทม์) ---- */
    function loop() {
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var dt = (now - lastT) / 1000;
      lastT = now;
      if (dt > 0.05) dt = 0.05; // กัน spike ตอนสลับแท็บ
      stepPhysics(dt);
      render();
    }

    function start() {
      if (timer) return;
      lastT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      timer = setInterval(loop, 16);
    }

    function setPushing(p) { state.pushing = !!p; }
    function setFPush(f) { state.fPush = clamp(f, fRange[0], fRange[1]); if (!Math.abs(state.v)) render(); }
    function setMu(m) { state.mu = clamp(m, muRange[0], muRange[1]); }
    function setMass(m) { state.mass = clamp(m, massRange[0], massRange[1]); render(); }

    function reset() {
      state.x = 0; state.v = 0; state.a = 0; state.net = 0; state.friction = 0;
      state.pushing = false;
      render();
    }

    start();
    render();

    return {
      setFPush: setFPush,
      setMu: setMu,
      setMass: setMass,
      setPushing: setPushing,
      reset: reset,
      destroy: function () { if (timer) { clearInterval(timer); timer = null; } }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.friction = { create: create };
})();
