/* shared/sim/collision.js — รถ 2 คันบนรางตรง 1 มิติ ชนกันแบบ slow-motion (โมเมนตัม + สัมประสิทธิ์การคืนตัว)
   ใช้ผ่าน window.SimPatterns.collision.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ m1/m2/u1/u2/e(สัมประสิทธิ์การคืนตัว)/timeScale จาก control ภายนอก ไม่ผูกกับเรื่องเดียว
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)/var(--grid)/var(--surface)) ห้ามฝัง hex ตรงๆ
   ใช้ SVG (เหมือน gas-particles.js/motion-graphs.js) — var() ใน attribute ถูก resolve ผ่าน CSS cascade ตอน paint ทุกเฟรม
   จึงไม่ต้องฟัง sky-physic:themechange แยก

   ฟิสิกส์ (การชน 1 มิติ ที่มีสัมประสิทธิ์การคืนตัว e):
     อนุรักษ์โมเมนตัม  : m1·u1 + m2·u2 = m1·v1 + m2·v2
     นิยาม e           : v2 − v1 = e·(u1 − u2)
     แก้ได้            : v1 = (P − m2·e·(u1−u2)) / M ,  v2 = (P + m1·e·(u1−u2)) / M   โดย P = m1u1+m2u2, M = m1+m2
     e=1 ⇒ ยืดหยุ่น (KE อนุรักษ์) , e=0 ⇒ ไม่ยืดหยุ่นสมบูรณ์ (รถติดกันไปด้วยกัน)
     แรงดล (impulse)   : J1 = m1(v1−u1) = −m2(v2−u2) = −J2  ⇒ ขนาดเท่ากันเสมอแม้มวลต่างกัน (กฎข้อ 3 นิวตัน) */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  /* ---- geometry คงที่ (viewBox 700x860)
     สูงกว่าปกติเพราะเรื่องนี้มี slider 6 ตัว (มากกว่า pattern อื่นที่ 2-3 ตัว) sim-row เป็น grid ที่ stretch
     ความสูง sim-zone ให้เท่ากับความสูงแผงควบคุม — เลยเพิ่มแผงกราฟแท่งเปรียบเทียบ p/KE ก่อน-หลังชนไว้ใต้ฉากรถ
     เพื่อใช้พื้นที่แนวตั้งที่เพิ่มมาอย่างมีความหมาย (แบบเดียวกับ gas-particles.js ที่ต่อกราฟ P-V ใต้กล่องอนุภาค) ---- */
  var TRACK_Y = 430;          // เส้นราง (ขอบล่างของตัวรถวางบนเส้นนี้)
  var CART_H = 86;
  var CART_TOP = TRACK_Y - CART_H;
  var LEFT_BOUND = 20, RIGHT_BOUND = 680;
  var START1 = 165, START2 = 535;   // ตำแหน่งจุดศูนย์กลางตั้งต้นของรถ 2 คัน
  var VSCALE = 34;            // px ต่อ (m/s) ในการเคลื่อนที่จริงบนจอ
  var IMPULSE_DISPLAY = 0.75; // วินาที(สเกลซิม) ที่ลูกศรแรงดลค้างให้ดู
  var IMPULSE_LEN = 66;       // ความยาวลูกศรแรงดล — เท่ากันทั้งสองอันเสมอเพื่อชูว่า "แรงเท่ากัน"
  var IMPULSE_Y = 170;        // ตำแหน่งแนวตั้งของลูกศรแรงดล (สูงจากรถพอมีที่ว่างสำหรับลูกศรความเร็ว)

  /* ---- แผงกราฟแท่งเปรียบเทียบ (ใต้ฉากรถ) ---- */
  var BAR_LEFT = 150, BAR_RIGHT = 680;
  var BAR_H = 34;
  var BAR_ROW_Y = [560, 630, 700, 770]; // p-before, p-after, ke-before, ke-after
  var BAR_CENTER_X = (BAR_LEFT + BAR_RIGHT) / 2; // จุดศูนย์ (โมเมนตัม 0) ของแท่ง p

  function cartWidth(m) { return 46 + m * 16; } // m 1–5 kg → 62–126 px (สื่อมวลด้วยขนาด)

  function arrow(x1, y1, x2, y2, color, w) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var h = 12;
    var bx = x2 - h * Math.cos(ang), by = y2 - h * Math.sin(ang);
    var lx = bx - h * 0.7 * Math.cos(ang - Math.PI / 2), ly = by - h * 0.7 * Math.sin(ang - Math.PI / 2);
    var rx = bx - h * 0.7 * Math.cos(ang + Math.PI / 2), ry = by - h * 0.7 * Math.sin(ang + Math.PI / 2);
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) +
      '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
      '<polygon points="' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' ' + lx.toFixed(1) + ',' + ly.toFixed(1) + ' ' +
      rx.toFixed(1) + ',' + ry.toFixed(1) + '" fill="' + color + '"/>';
  }

  function create(container, options) {
    options = options || {};
    var massRange = options.massRange || [1, 5];
    var velRange = options.velRange || [-6, 6];
    var eRange = options.eRange || [0, 1];
    var timeScaleRange = options.timeScaleRange || [0.1, 1.0];
    var onUpdate = options.onUpdate || function () {};

    var state = {
      m1: clamp(options.m1 != null ? options.m1 : 4, massRange[0], massRange[1]),
      m2: clamp(options.m2 != null ? options.m2 : 2, massRange[0], massRange[1]),
      u1: clamp(options.u1 != null ? options.u1 : 3, velRange[0], velRange[1]),
      u2: clamp(options.u2 != null ? options.u2 : 0, velRange[0], velRange[1]),
      e: clamp(options.e != null ? options.e : 1, eRange[0], eRange[1]),
      timeScale: clamp(options.timeScale != null ? options.timeScale : 0.4, timeScaleRange[0], timeScaleRange[1]),
      pos1: START1, pos2: START2,
      vel1: 0, vel2: 0,
      collided: false,
      impulseTimer: 0,
      contactX: 0,
      dir1: -1,
      impulseMag: 0,
      playing: false
    };
    var rafId = null, lastTs = null;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 860');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'รถ 2 คันชนกัน — โมเมนตัมรวมอนุรักษ์เสมอ · แรงดลตอนกระทบเท่ากันแม้มวลต่างกัน';
    container.appendChild(legend);

    /* คำนวณความเร็วหลังชนจากพารามิเตอร์ปัจจุบัน (deterministic) */
    function finalVels() {
      var P = state.m1 * state.u1 + state.m2 * state.u2;
      var M = state.m1 + state.m2;
      var rel = state.u1 - state.u2;
      return {
        v1: (P - state.m2 * state.e * rel) / M,
        v2: (P + state.m1 * state.e * rel) / M
      };
    }

    function computeValues() {
      var fv = finalVels();
      var pBefore = state.m1 * state.u1 + state.m2 * state.u2;
      var pAfter = state.m1 * fv.v1 + state.m2 * fv.v2;
      var keBefore = 0.5 * state.m1 * state.u1 * state.u1 + 0.5 * state.m2 * state.u2 * state.u2;
      var keAfter = 0.5 * state.m1 * fv.v1 * fv.v1 + 0.5 * state.m2 * fv.v2 * fv.v2;
      return {
        m1: state.m1, m2: state.m2, u1: state.u1, u2: state.u2,
        v1: fv.v1, v2: fv.v2, e: state.e, timeScale: state.timeScale,
        pBefore: pBefore, pAfter: pAfter,
        keBefore: keBefore, keAfter: keAfter,
        keLost: keBefore - keAfter,
        phase: state.collided ? 'after' : 'before',
        playing: state.playing
      };
    }

    /* ---- geometry ปัจจุบันของแต่ละคัน ---- */
    function cart1Rect() { var w = cartWidth(state.m1); return { cx: state.pos1, x: state.pos1 - w / 2, w: w }; }
    function cart2Rect() { var w = cartWidth(state.m2); return { cx: state.pos2, x: state.pos2 - w / 2, w: w }; }

    function resetPositions() {
      state.pos1 = START1; state.pos2 = START2;
      state.vel1 = state.u1; state.vel2 = state.u2;
      state.collided = false;
      state.impulseTimer = 0;
    }

    function cartMarkup(rect, mass, vel, accent, accentFg, label) {
      var x = rect.x, w = rect.w, y = CART_TOP;
      var wheelR = 11;
      var wy = TRACK_Y + wheelR - 4;
      var out = '';
      // ตัวรถ
      out += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + CART_H +
        '" rx="10" fill="' + accent + '" stroke="var(--ink)" stroke-width="3.5"/>';
      // ล้อ
      out += '<circle cx="' + (x + w * 0.24).toFixed(1) + '" cy="' + wy + '" r="' + wheelR + '" fill="var(--ink)"/>';
      out += '<circle cx="' + (x + w * 0.76).toFixed(1) + '" cy="' + wy + '" r="' + wheelR + '" fill="var(--ink)"/>';
      // ป้ายมวลบนตัวรถ
      out += '<text x="' + rect.cx.toFixed(1) + '" y="' + (y + CART_H / 2 - 4) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--font)" font-weight="900" font-size="19">' + label + '</text>';
      out += '<text x="' + rect.cx.toFixed(1) + '" y="' + (y + CART_H / 2 + 16) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="13">' + mass.toFixed(1) + ' kg</text>';
      // ลูกศรความเร็ว (ยาวตาม |v| ทิศตามเครื่องหมาย) เหนือรถ
      var arrowY = y - 26;
      if (Math.abs(vel) > 0.05) {
        var len = clamp(Math.abs(vel) * 9, 14, 120);
        var dir = vel > 0 ? 1 : -1;
        out += arrow(rect.cx, arrowY, rect.cx + dir * len, arrowY, accent === 'var(--accent-primary)' ? 'var(--accent-primary)' : 'var(--accent-secondary)', 6);
      }
      // ป้าย v และ p (โมเมนตัม) ใต้ราง
      out += '<text x="' + rect.cx.toFixed(1) + '" y="' + (TRACK_Y + 34) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="12">v=' + vel.toFixed(1) + ' m/s</text>';
      out += '<text x="' + rect.cx.toFixed(1) + '" y="' + (TRACK_Y + 52) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="12" opacity="0.7">p=' + (mass * vel).toFixed(1) + '</text>';
      return out;
    }

    /* ---- แถบเปรียบเทียบ p/KE ก่อน-หลังชน (diverging bar สำหรับ p ที่มีเครื่องหมาย, unsigned bar สำหรับ KE) ---- */
    var velAbsMax = Math.max(Math.abs(velRange[0]), Math.abs(velRange[1]));
    var maxAbsP = 2 * massRange[1] * velAbsMax;             // p รวมสูงสุดที่เป็นไปได้ (สองคันรวมกัน)
    var maxKE = massRange[1] * velAbsMax * velAbsMax;        // KE รวมสูงสุดที่เป็นไปได้ (สองคันรวมกัน)
    var pHalfW = (BAR_RIGHT - BAR_LEFT) / 2;
    var keW = BAR_RIGHT - BAR_LEFT;

    function pBarMarkup(y, value, label, color) {
      var frac = clamp(value / maxAbsP, -1, 1);
      var endX = BAR_CENTER_X + frac * pHalfW;
      var x0 = Math.min(BAR_CENTER_X, endX), w = Math.abs(endX - BAR_CENTER_X);
      var out = '';
      out += '<text x="' + BAR_LEFT + '" y="' + (y - 8) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="13">' + label + '</text>';
      out += '<rect x="' + x0.toFixed(1) + '" y="' + y + '" width="' + Math.max(w, 2).toFixed(1) + '" height="' + BAR_H + '" rx="6" fill="' + color + '" stroke="var(--ink)" stroke-width="2.5"/>';
      out += '<text x="' + (endX + (frac >= 0 ? 10 : -10)).toFixed(1) + '" y="' + (y + BAR_H / 2 + 5) + '" text-anchor="' + (frac >= 0 ? 'start' : 'end') + '" fill="var(--ink)" font-family="var(--mono)" font-weight="800" font-size="13">' + value.toFixed(1) + '</text>';
      return out;
    }

    function keBarMarkup(y, value, label, color) {
      var frac = clamp(value / maxKE, 0, 1);
      var w = frac * keW;
      var out = '';
      out += '<text x="' + BAR_LEFT + '" y="' + (y - 8) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="13">' + label + '</text>';
      out += '<rect x="' + BAR_LEFT + '" y="' + y + '" width="' + Math.max(w, 2).toFixed(1) + '" height="' + BAR_H + '" rx="6" fill="' + color + '" stroke="var(--ink)" stroke-width="2.5"/>';
      out += '<text x="' + (BAR_LEFT + w + 10).toFixed(1) + '" y="' + (y + BAR_H / 2 + 5) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="800" font-size="13">' + value.toFixed(1) + '</text>';
      return out;
    }

    function barsMarkup(vals) {
      var out = '';
      out += '<text x="' + BAR_LEFT + '" y="' + (BAR_ROW_Y[0] - 32) + '" fill="var(--ink)" font-family="var(--font)" font-weight="900" font-size="16">เปรียบเทียบก่อน-หลังชน · โมเมนตัมเท่ากันเสมอ</text>';
      // เส้นศูนย์อ้างอิงของแท่งโมเมนตัม (ลากตลอดสองแถวบนของ p)
      out += '<line x1="' + BAR_CENTER_X + '" y1="' + (BAR_ROW_Y[0] - 20) + '" x2="' + BAR_CENTER_X + '" y2="' + (BAR_ROW_Y[1] + BAR_H + 6) + '" stroke="var(--grid)" stroke-width="2" stroke-dasharray="4 5"/>';
      out += pBarMarkup(BAR_ROW_Y[0], vals.pBefore, 'p ก่อนชน · P BEFORE', 'var(--accent-primary)');
      out += pBarMarkup(BAR_ROW_Y[1], vals.pAfter, 'p หลังชน · P AFTER', 'var(--accent-primary)');
      out += keBarMarkup(BAR_ROW_Y[2], vals.keBefore, 'KE ก่อนชน · KE BEFORE', 'var(--accent-secondary)');
      out += keBarMarkup(BAR_ROW_Y[3], vals.keAfter, 'KE หลังชน · KE AFTER', 'var(--accent-secondary)');
      return out;
    }

    function render() {
      var vals = computeValues();
      var r1 = cart1Rect(), r2 = cart2Rect();
      // ความเร็วที่แสดง: ก่อน play ใช้ u, ระหว่าง/หลัง ใช้ vel ปัจจุบัน
      var showV1 = state.playing || state.collided ? state.vel1 : state.u1;
      var showV2 = state.playing || state.collided ? state.vel2 : state.u2;

      var parts = [];
      // ราง
      parts.push('<line x1="' + LEFT_BOUND + '" y1="' + TRACK_Y + '" x2="' + RIGHT_BOUND + '" y2="' + TRACK_Y + '" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>');
      // ขีดบอกระยะบนราง
      for (var gx = 60; gx <= 640; gx += 58) {
        parts.push('<line x1="' + gx + '" y1="' + TRACK_Y + '" x2="' + gx + '" y2="' + (TRACK_Y + 9) + '" stroke="var(--grid)" stroke-width="2"/>');
      }
      // รถสองคัน (คัน 1 = accent-primary, คัน 2 = accent-secondary)
      parts.push(cartMarkup(r1, state.m1, showV1, 'var(--accent-primary)', 'var(--accent-primary-fg)', 'รถ 1'));
      parts.push(cartMarkup(r2, state.m2, showV2, 'var(--accent-secondary)', 'var(--accent-secondary-fg)', 'รถ 2'));

      // ลูกศรแรงดล (แสดงช่วงกระทบ) — ยาวเท่ากันสองอัน ทิศตรงข้าม ชูกฎข้อ 3
      if (state.impulseTimer > 0) {
        var cx = state.contactX, ay = IMPULSE_Y;
        var d1 = state.dir1, d2 = -state.dir1;
        parts.push(arrow(cx, ay, cx + d1 * IMPULSE_LEN, ay, 'var(--ink)', 7));
        parts.push(arrow(cx, ay, cx + d2 * IMPULSE_LEN, ay, 'var(--ink)', 7));
        parts.push('<rect x="' + (cx - 88) + '" y="' + (ay - 44) + '" width="176" height="30" rx="15" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="2.5"/>');
        parts.push('<text x="' + cx.toFixed(1) + '" y="' + (ay - 24) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--font)" font-weight="900" font-size="14">แรงเท่ากัน J=' + state.impulseMag.toFixed(1) + '</text>');
      }

      parts.push(barsMarkup(vals));

      svg.innerHTML = parts.join('');
      onUpdate(vals);
    }

    function step(dt) {
      // เคลื่อนที่
      state.pos1 += state.vel1 * VSCALE * dt;
      state.pos2 += state.vel2 * VSCALE * dt;

      // ตรวจการชน (ยังไม่ชน + เข้าใกล้กัน + ระยะซ้อน)
      if (!state.collided) {
        var half = (cartWidth(state.m1) + cartWidth(state.m2)) / 2;
        var gap = state.pos2 - state.pos1;
        if (gap <= half && (state.vel1 - state.vel2) > 0) {
          var fv = finalVels();
          state.contactX = state.pos1 + cartWidth(state.m1) / 2;
          state.impulseMag = Math.abs(state.m1 * (fv.v1 - state.u1));
          state.dir1 = (fv.v1 - state.u1) >= 0 ? 1 : -1;
          state.vel1 = fv.v1; state.vel2 = fv.v2;
          state.collided = true;
          state.impulseTimer = IMPULSE_DISPLAY;
          // แยกไม่ให้ทับกันต่อ ณ จุดสัมผัส
          state.pos1 = state.contactX - cartWidth(state.m1) / 2;
          state.pos2 = state.contactX + cartWidth(state.m2) / 2;
        }
      }
      if (state.impulseTimer > 0) state.impulseTimer -= dt;

      // หยุดเมื่อรถออกนอกจอ
      if (state.pos1 < LEFT_BOUND || state.pos1 > RIGHT_BOUND || state.pos2 < LEFT_BOUND || state.pos2 > RIGHT_BOUND) {
        pause();
      }
    }

    function tick(ts) {
      if (lastTs == null) lastTs = ts;
      var dtReal = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      step(dtReal * state.timeScale);
      render();
      if (state.playing) rafId = requestAnimationFrame(tick);
    }

    function play() {
      if (state.playing) { pause(); return; }
      // ถ้าจบรอบแล้ว (ชนและออกนอกจอ) เริ่มใหม่
      if (state.collided || state.pos1 <= LEFT_BOUND || state.pos2 >= RIGHT_BOUND) resetPositions();
      state.vel1 = state.collided ? state.vel1 : state.u1;
      state.vel2 = state.collided ? state.vel2 : state.u2;
      state.playing = true;
      lastTs = null;
      rafId = requestAnimationFrame(tick);
    }

    function pause() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      state.playing = false;
      render();
    }

    function reset() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      state.playing = false;
      resetPositions();
      render();
    }

    function applyChange() {
      if (!state.playing) { resetPositions(); }
      render();
    }

    function setM1(v) { state.m1 = clamp(v, massRange[0], massRange[1]); applyChange(); }
    function setM2(v) { state.m2 = clamp(v, massRange[0], massRange[1]); applyChange(); }
    function setU1(v) { state.u1 = clamp(v, velRange[0], velRange[1]); applyChange(); }
    function setU2(v) { state.u2 = clamp(v, velRange[0], velRange[1]); applyChange(); }
    function setE(v) { state.e = clamp(v, eRange[0], eRange[1]); applyChange(); }
    function setTimeScale(v) { state.timeScale = clamp(v, timeScaleRange[0], timeScaleRange[1]); render(); }

    resetPositions();
    render();

    return {
      setM1: setM1, setM2: setM2, setU1: setU1, setU2: setU2, setE: setE, setTimeScale: setTimeScale,
      play: play, pause: pause, reset: reset,
      isPlaying: function () { return state.playing; },
      destroy: function () { if (rafId) cancelAnimationFrame(rafId); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.collision = { create: create };
})();
