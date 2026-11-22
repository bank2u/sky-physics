/* shared/sim/circular-motion.js — การเคลื่อนที่แบบวงกลม: วัตถุหมุนพร้อมเวกเตอร์ v (แนวสัมผัส) และ a (สู่ศูนย์กลาง)
   มี event "ตัดเชือก" (cut) ที่ปล่อยวัตถุพุ่งไปตามแนวสัมผัส (เส้นตรง) พร้อมเทียบกับแนวรัศมี (เส้นประ ✗)
   ใช้ผ่าน window.SimPatterns.circularMotion.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary/secondary/tertiary)) — SVG อ้าง var() ตรงๆ
   จึงเปลี่ยนสีตามธีมได้เองโดยไม่ต้อง re-resolve. ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function create(container, options) {
    options = options || {};
    var rRange = options.rRange || [0.5, 3.0];
    var vRange = options.vRange || [1, 12];
    var massRange = options.massRange || [0.5, 5.0];
    var onUpdate = options.onUpdate || function () {};

    // เรขาคณิตของ SVG (หน่วยพิกัด SVG ไม่ใช่ CSS px)
    var VBW = 700, VBH = 580, CX = 350, CY = 290;
    var R_MIN_PX = 95, R_MAX_PX = 205;
    // เดิม θ += ω·0.02 ต่อเฟรม (60 fps) = 1.2·ω rad ต่อ 1 s จริง → TIME_SCALE = 0.02 × 60 = 1.2 (ความเร็วภาพเท่าเดิม)
    // เฟสใช้ wall-clock ไม่สะสมต่อเฟรม: phase = phaseStart + ω·TIME_SCALE·(now − wallStart)/1000
    var TIME_SCALE = 1.2;
    var BALL = 16;

    var state = {
      r: clamp(options.r != null ? options.r : 1.5, rRange[0], rRange[1]),
      v: clamp(options.v != null ? options.v : 6, vRange[0], vRange[1]),
      mass: clamp(options.mass != null ? options.mass : 2.0, massRange[0], massRange[1]),
      phase: 0,             // เฟสสะสม (rad) = ค่า t ของ player: ก่อนตัด = ตำแหน่งเชิงมุม θ, หลังตัดเดินต่อด้วยอัตราเดิม
      playing: false,       // กำลังหมุน หรือ (หลังตัด) วัตถุกำลังพุ่งอยู่ในจอ
      cut: false,
      cutAngle: 0           // θ ขณะตัด (rad) — จุดตัด/ทิศพุ่งคำนวณจากค่านี้ทั้งหมด ระยะพุ่ง = R·(phase − cutAngle)
    };
    var rafId = null;
    var phaseStart = 0, wallStart = 0;
    var onEnd = options.onEnd || function () {}; // เรียกเมื่อวัตถุที่ถูกตัดพุ่งพ้นจอเอง

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VBW + ' ' + VBH);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'v = ความเร็ว (สัมผัส) · a = ความเร่งสู่ศูนย์กลาง';
    container.appendChild(legend);

    function radiusPx() {
      var frac = (state.r - rRange[0]) / (rRange[1] - rRange[0]);
      return R_MIN_PX + frac * (R_MAX_PX - R_MIN_PX);
    }
    function omega() { return state.v / state.r; }              // rad/s
    function accel() { return (state.v * state.v) / state.r; }   // m/s²
    function force() { return state.mass * accel(); }            // N
    function period() { return (2 * Math.PI * state.r) / state.v; } // s

    // สร้างลูกศร: ก้าน + หัว จากจุด (x,y) ไปตามทิศหน่วย (ux,uy) ยาว len
    function arrow(x, y, ux, uy, len, colorVar, w) {
      var x2 = x + ux * len, y2 = y + uy * len;
      var px = -uy, py = ux;                 // แนวตั้งฉาก (หัวลูกศร)
      var hl = w * 2.4 + 7, hw = w * 1.5 + 4;
      var bx = x2 - ux * hl, by = y2 - uy * hl;
      var p1 = (bx + px * hw).toFixed(1) + ',' + (by + py * hw).toFixed(1);
      var p2 = (bx - px * hw).toFixed(1) + ',' + (by - py * hw).toFixed(1);
      var tip = x2.toFixed(1) + ',' + y2.toFixed(1);
      return '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) +
             '" stroke="' + colorVar + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
             '<polygon points="' + p1 + ' ' + p2 + ' ' + tip + '" fill="' + colorVar + '"/>';
    }

    function label(x, y, text, colorVar) {
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="' + colorVar +
             '" font-size="24" font-weight="800" text-anchor="middle" dominant-baseline="middle">' + text + '</text>';
    }

    function livePhase() { return phaseStart + omega() * TIME_SCALE * ((performance.now() - wallStart) / 1000); }
    function anchor() { phaseStart = state.phase; wallStart = performance.now(); }
    // ก่อนเปลี่ยน r/v ขณะหมุน: เก็บเฟสปัจจุบัน แล้วยึดจุดเวลาใหม่หลังเปลี่ยน (θ ต่อเนื่องเหมือนเดิม)
    function settle() { if (state.playing) state.phase = livePhase(); }

    // ตำแหน่งวัตถุหลังตัด (คำนวณแบบ closed-form จากเฟส)
    function flightGeom() {
      var Rpx = radiusPx(), c = state.cutAngle;
      var cp = { x: CX + Rpx * Math.cos(c), y: CY + Rpx * Math.sin(c) };
      var dir = { x: -Math.sin(c), y: Math.cos(c) };
      var rad = { x: Math.cos(c), y: Math.sin(c) };
      var dist = Rpx * Math.max(0, state.phase - c);
      return { cp: cp, dir: dir, rad: rad, fp: { x: cp.x + dir.x * dist, y: cp.y + dir.y * dist } };
    }
    function flightOut(fp) {
      return fp.x < -60 || fp.x > VBW + 60 || fp.y < -60 || fp.y > VBH + 60;
    }

    function render() {
      var Rpx = radiusPx();
      var parts = [];

      // วงโคจร (เส้นทางการหมุน) — จุดประจางๆ
      parts.push('<circle cx="' + CX + '" cy="' + CY + '" r="' + Rpx.toFixed(1) +
        '" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-dasharray="2 12" opacity="0.45"/>');
      // จุดหมุน (ศูนย์กลาง)
      parts.push('<circle cx="' + CX + '" cy="' + CY + '" r="7" fill="var(--ink)"/>');

      if (!state.cut) {
        // ---- ขณะหมุน ----
        var th = state.phase;
        var bx = CX + Rpx * Math.cos(th), by = CY + Rpx * Math.sin(th);
        var tang = { x: -Math.sin(th), y: Math.cos(th) };   // ทิศสัมผัส (ทิศ v)
        var cent = { x: -Math.cos(th), y: -Math.sin(th) };  // ทิศเข้าศูนย์กลาง (ทิศ a)

        // เชือก (รัศมี) จากศูนย์กลางถึงวัตถุ
        parts.push('<line x1="' + CX + '" y1="' + CY + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) +
          '" stroke="var(--ink)" stroke-width="4"/>');

        var aLen = clamp(accel() * 2.0, 30, 122);
        var vLen = clamp(state.v * 9, 34, 128);
        // เวกเตอร์ a (สู่ศูนย์กลาง) — magenta
        parts.push(arrow(bx, by, cent.x, cent.y, aLen, 'var(--accent-secondary)', 6));
        parts.push(label(bx + cent.x * (aLen + 16), by + cent.y * (aLen + 16), 'a', 'var(--accent-secondary)'));
        // เวกเตอร์ v (สัมผัส) — cyan
        parts.push(arrow(bx, by, tang.x, tang.y, vLen, 'var(--accent-primary)', 6));
        parts.push(label(bx + tang.x * (vLen + 16), by + tang.y * (vLen + 16), 'v', 'var(--accent-primary)'));
        // วัตถุ
        parts.push('<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="' + BALL +
          '" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="4"/>');
      } else {
        // ---- หลังตัดเชือก ----
        var fg = flightGeom();
        var cp = fg.cp, dir = fg.dir, rad = fg.rad, fp = fg.fp;
        // แนวรัศมี (คำตอบที่ผิด) — เส้นประ muted + ✗
        var radLen = 120;
        var rex = cp.x + rad.x * radLen, rey = cp.y + rad.y * radLen;
        parts.push('<line x1="' + cp.x.toFixed(1) + '" y1="' + cp.y.toFixed(1) + '" x2="' + rex.toFixed(1) + '" y2="' + rey.toFixed(1) +
          '" stroke="var(--ink)" stroke-width="4" stroke-dasharray="8 8" opacity="0.5"/>');
        parts.push(label(rex + rad.x * 22, rey + rad.y * 22, '✗', 'var(--ink)'));
        parts.push('<text x="' + (rex + rad.x * 20).toFixed(1) + '" y="' + (rey + rad.y * 20 + 22).toFixed(1) +
          '" fill="var(--ink)" font-size="16" font-weight="700" text-anchor="middle" opacity="0.6">แนวรัศมี</text>');

        // เส้นทางจริง (แนวสัมผัส) จากจุดตัดถึงตำแหน่งปัจจุบัน — cyan ทึบ
        parts.push('<line x1="' + cp.x.toFixed(1) + '" y1="' + cp.y.toFixed(1) + '" x2="' + fp.x.toFixed(1) + '" y2="' + fp.y.toFixed(1) +
          '" stroke="var(--accent-primary)" stroke-width="5" stroke-linecap="round"/>');
        // จุดตัด (เดิม)
        parts.push('<circle cx="' + cp.x.toFixed(1) + '" cy="' + cp.y.toFixed(1) + '" r="6" fill="var(--ink)"/>');
        // เวกเตอร์ v ติดตัววัตถุ (ยังคงเดิม พิสูจน์ว่าความเร็วคงที่)
        var vLen2 = clamp(state.v * 9, 34, 128);
        parts.push(arrow(fp.x, fp.y, dir.x, dir.y, vLen2, 'var(--accent-primary)', 6));
        parts.push(label(fp.x + dir.x * (vLen2 + 16), fp.y + dir.y * (vLen2 + 16), 'v', 'var(--accent-primary)'));
        // วัตถุ
        parts.push('<circle cx="' + fp.x.toFixed(1) + '" cy="' + fp.y.toFixed(1) + '" r="' + BALL +
          '" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="4"/>');
        // ป้าย "แนวสัมผัส (จริง)" กลางเส้นทาง
        var mx = (cp.x + fp.x) / 2, my = (cp.y + fp.y) / 2;
        parts.push('<text x="' + mx.toFixed(1) + '" y="' + (my - 14).toFixed(1) +
          '" fill="var(--accent-primary)" font-size="16" font-weight="800" text-anchor="middle">แนวสัมผัส ✓</text>');
      }

      svg.innerHTML = parts.join('');

      onUpdate({
        r: state.r, v: state.v, mass: state.mass,
        a: accel(), F: force(), T: period(), omega: omega(),
        playing: state.playing, cut: state.cut
      });
    }

    function tick() {
      rafId = requestAnimationFrame(tick);
      if (!state.playing) return;
      state.phase = livePhase();
      if (state.cut) {
        var out = flightOut(flightGeom().fp);
        if (out) {
          // พุ่งพ้นจอแล้ว → หยุด (เฟสค้างที่ค่านี้) แล้วแจ้งหน้าให้ publish สถานะจบ
          state.playing = false;
          stopRaf();
          render();
          onEnd();
          return;
        }
      }
      render();
    }
    function startRaf() { if (!rafId) rafId = requestAnimationFrame(tick); }
    function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function play() {
      if (state.cut) return;          // ต้อง reset ก่อนหมุนใหม่
      if (state.playing) {
        state.phase = livePhase();
        state.playing = false;
        stopRaf();
        render();
      } else {
        state.playing = true;
        anchor();
        startRaf();
        render();
      }
    }

    function cut() {
      if (state.cut) return;
      if (state.playing) state.phase = livePhase();
      state.cut = true;
      state.cutAngle = state.phase;     // ตัดที่ θ ปัจจุบัน
      state.playing = true;             // วัตถุเริ่มพุ่ง (แม้ตัดตอนหยุดอยู่ก็พุ่ง เหมือนเดิม)
      anchor();
      startRaf();
      render();
    }

    function reset() {
      stopRaf();
      state.phase = 0;
      state.playing = false;
      state.cut = false;
      state.cutAngle = 0;
      render();
    }

    // cut เป็น state สัมบูรณ์: false = ยังไม่ตัด, ตัวเลข = ตัดที่ θ นั้น (rad). ไม่แตะ playing/เฟส — ให้ applyPlayState จัดการ
    function getCut() { return state.cut ? state.cutAngle : false; }
    function setCut(v) {
      if (typeof v === 'number' && isFinite(v)) { state.cut = true; state.cutAngle = v; }
      else { state.cut = false; state.cutAngle = 0; }
      render();
    }

    function getPlayState() {
      return { playing: state.playing, t: state.playing ? livePhase() : state.phase };
    }
    // ps = {playing, t, elapsedMs}; t = เฟสสะสม (rad); หยุดอยู่ → ไม่สนใจ elapsedMs
    function applyPlayState(ps) {
      stopRaf();
      if (ps.playing) {
        state.phase = ps.t + omega() * TIME_SCALE * ((ps.elapsedMs || 0) / 1000);
        state.playing = true;
        anchor();
        startRaf();
      } else {
        state.playing = false;
        state.phase = ps.t;
      }
      render();
    }

    // opts.keepCut = true (ทางรับ sync จากครู): อัปเดตค่าโดยไม่ reset แม้ตัดเชือกแล้ว — ให้ param 'cut' และ player
    // ที่ถูก apply ทีหลังตัดสินสถานะสุดท้าย (ไม่ผูกกับลำดับการ register). ผู้ใช้ลาก slider เอง (ไม่ส่ง opts) ยัง reset เหมือนเดิม
    function setR(r, opts) {
      settle();
      state.r = clamp(r, rRange[0], rRange[1]);
      if (state.cut && !(opts && opts.keepCut)) reset(); else { anchor(); render(); }
    }
    function setV(v, opts) {
      settle();
      state.v = clamp(v, vRange[0], vRange[1]);
      if (state.cut && !(opts && opts.keepCut)) reset(); else { anchor(); render(); }
    }
    function setMass(m) {
      state.mass = clamp(m, massRange[0], massRange[1]);
      render();
    }

    render();

    return {
      setR: setR, setV: setV, setMass: setMass,
      getR: function () { return state.r; },
      getV: function () { return state.v; },
      getMass: function () { return state.mass; },
      getCut: getCut, setCut: setCut,
      getPlayState: getPlayState, applyPlayState: applyPlayState,
      play: play, cut: cut, reset: reset,
      isPlaying: function () { return state.playing; },
      isCut: function () { return state.cut; },
      destroy: function () { stopRaf(); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.circularMotion = { create: create };
})();
