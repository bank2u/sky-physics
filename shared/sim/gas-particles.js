/* shared/sim/gas-particles.js — กล่องโมเลกุลแก๊สชนผนังแบบยืดหยุ่น (2D particle-in-a-box) + ลูกสูบปรับปริมาตร + กราฟ P-V สด
   ใช้ผ่าน window.SimPatterns.gasParticles.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ volumeFraction (0.2–1.0) และ moleculeCount จาก control ภายนอก ไม่ผูกกับเรื่องเดียว
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)/var(--grid)/var(--surface)) ห้ามฝัง hex ตรงๆ
   ใช้ SVG (เหมือน circuit-ohm.js/motion-graphs.js) — var() ใน attribute ถูก resolve ผ่าน CSS cascade ตอน paint
   ทุกเฟรมอยู่แล้ว จึงไม่ต้องฟัง sky-physic:themechange แยก (SVG ไม่เหมือน canvas 2D ที่ต้อง resolve สีเป็น string เอง)

   ที่มาของค่าความดัน P (อธิบายเพราะไม่มีการ calibrate กับหน่วยจริง):
   ทฤษฎีจลน์ของแก๊สให้ P·A = N·m·⟨v²⟩ (2D) กล่าวคือความดันคือฟลักซ์โมเมนตัมที่โมเลกุลถ่ายให้ผนังต่อหน่วยเวลาต่อหน่วยความยาวผนัง
   ซึ่งเท่ากับพลังงานจลน์รวมของอนุภาคหารด้วยพื้นที่กล่อง (คูณค่าคงที่) — แทนที่จะนับความถี่การชนผนังจริงเฟรมต่อเฟรม (นับ evolveจะสั่นสูงมากเมื่อ N น้อย
   เพราะ sample เวลาสั้น) เราคำนวณ P จาก sum(v_i²) ของอนุภาคจริงในซิมทุกเฟรม ซึ่งเป็นปริมาณเทียบเท่ากันทางฟิสิกส์ (time-average ของโมเมนตัมที่ผนังได้รับ
   เท่ากับพลังงานจลน์เฉลี่ยของอนุภาคพอดีในแบบจำลอง hard-sphere elastic) — ได้ค่า P ที่นิ่ง ไม่มี noise เฟรมต่อเฟรม แต่ยังคง "สด" จริง เพราะคำนวณจาก
   ความเร็วอนุภาคที่ชนกันจริงในแต่ละเฟรม ไม่ใช่สูตรสำเร็จรูปที่ผูกกับ N คงที่
   การชนแบบยืดหยุ่นทั้งหมด (ผนัง+อนุภาคต่ออนุภาค) อนุรักษ์ sum(v_i²) เป๊ะ ⇒ "อุณหภูมิ" (∝ พลังงานจลน์เฉลี่ย) คงที่โดยอัตโนมัติตราบใดที่ไม่มีการเพิ่ม/ลด
   จำนวนโมเลกุล (เปลี่ยน N ใหม่ = respawn ด้วยอัตราเร็วตั้งต้นเท่าเดิมเสมอ) */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  /* ---- geometry คงที่ (viewBox 700x640) ---- */
  var BOX_LEFT = 70, BOX_TOP = 30, BOX_H = 230, BOX_W_MAX = 380;
  var BOX_BOTTOM = BOX_TOP + BOX_H; // 260
  var PARTICLE_R = 7;
  var SPEED0 = 165; // px/s ต่ออนุภาคตอน spawn — คงอุณหภูมิ (∝ ⟨v²⟩) ให้เท่าเดิมทุกครั้งที่ respawn

  var GRAPH_LEFT = 90, GRAPH_RIGHT = 660;
  var GRAPH_TOP = 340, GRAPH_H = 230;
  var GRAPH_BOTTOM = GRAPH_TOP + GRAPH_H;
  var V_DOM = [20, 100]; // แกน V ตรงกับช่วง slider ปริมาตร (%)
  var TRACE_MAX = 240;

  // ค่าคงที่ปรับสเกลการแสดงผลของ P ให้เป็นเลขกลมๆ ราวๆ 100 ที่ค่าตั้งต้น (V=60%, N=25) — ไม่ใช่การ calibrate ทางฟิสิกส์จริง
  var P_CAL = 6.25;

  function create(container, options) {
    options = options || {};
    var volumeRange = options.volumeRange || [0.2, 1.0]; // เศษส่วนของปริมาตรเต็ม (20%–100%)
    var countRange = options.countRange || [10, 50];
    var onUpdate = options.onUpdate || function () {};

    var state = {
      volumeFraction: clamp(options.volumeFraction != null ? options.volumeFraction : 0.6, volumeRange[0], volumeRange[1]),
      moleculeCount: clamp(options.moleculeCount != null ? options.moleculeCount : 25, countRange[0], countRange[1]),
      particles: []
    };
    var trace = []; // ประวัติ (V, P) ที่วาดตามการลากจริง
    var rafId = null;
    var lastTs = null;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 640');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'จุด = โมเลกุลแก๊ส · ลากปริมาตรเพื่อดูกราฟ P-V วาดสด';
    container.appendChild(legend);

    function boxRect() {
      var w = BOX_W_MAX * state.volumeFraction;
      return { left: BOX_LEFT, top: BOX_TOP, right: BOX_LEFT + w, bottom: BOX_BOTTOM, width: w, height: BOX_H };
    }

    function randomAngle() { return Math.random() * Math.PI * 2; }

    function spawnParticles(n) {
      var rect = boxRect();
      var list = [];
      for (var i = 0; i < n; i++) {
        var pos = null;
        for (var attempt = 0; attempt < 24; attempt++) {
          var cand = {
            x: rect.left + PARTICLE_R + Math.random() * (rect.width - 2 * PARTICLE_R),
            y: rect.top + PARTICLE_R + Math.random() * (rect.height - 2 * PARTICLE_R)
          };
          var ok = true;
          for (var j = 0; j < list.length; j++) {
            var dx = cand.x - list[j].x, dy = cand.y - list[j].y;
            if (Math.hypot(dx, dy) < 2 * PARTICLE_R + 2) { ok = false; break; }
          }
          if (ok) { pos = cand; break; }
        }
        if (!pos) {
          pos = {
            x: rect.left + PARTICLE_R + Math.random() * Math.max(1, rect.width - 2 * PARTICLE_R),
            y: rect.top + PARTICLE_R + Math.random() * Math.max(1, rect.height - 2 * PARTICLE_R)
          };
        }
        var angle = randomAngle();
        list.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(angle) * SPEED0,
          vy: Math.sin(angle) * SPEED0
        });
      }
      state.particles = list;
    }

    spawnParticles(state.moleculeCount);

    function clampParticlesToBox() {
      var rect = boxRect();
      for (var i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        p.x = clamp(p.x, rect.left + PARTICLE_R, rect.right - PARTICLE_R);
        p.y = clamp(p.y, rect.top + PARTICLE_R, rect.bottom - PARTICLE_R);
      }
    }

    function resolveWallCollisions(rect) {
      for (var i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        if (p.x - PARTICLE_R < rect.left) { p.x = rect.left + PARTICLE_R; p.vx = Math.abs(p.vx); }
        if (p.x + PARTICLE_R > rect.right) { p.x = rect.right - PARTICLE_R; p.vx = -Math.abs(p.vx); }
        if (p.y - PARTICLE_R < rect.top) { p.y = rect.top + PARTICLE_R; p.vy = Math.abs(p.vy); }
        if (p.y + PARTICLE_R > rect.bottom) { p.y = rect.bottom - PARTICLE_R; p.vy = -Math.abs(p.vy); }
      }
    }

    // ชนกันแบบยืดหยุ่นมวลเท่ากัน: สลับองค์ประกอบความเร็วตามแนวเส้นศูนย์กลาง (แนวสัมผัสไม่เปลี่ยน)
    function resolveParticleCollisions() {
      var list = state.particles;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var dist = Math.hypot(dx, dy);
          var minDist = 2 * PARTICLE_R;
          if (dist > 0 && dist < minDist) {
            var nx = dx / dist, ny = dy / dist;
            // แยกตำแหน่งไม่ให้ทับกันต่อ
            var overlap = (minDist - dist) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;

            var avx = a.vx, avy = a.vy, bvx = b.vx, bvy = b.vy;
            var aN = avx * nx + avy * ny, bN = bvx * nx + bvy * ny;
            if (bN - aN < 0) { // เข้าใกล้กันอยู่เท่านั้นถึงชน
              // มวลเท่ากัน: สลับองค์ประกอบตามแนวปกติ (normal) เก็บองค์ประกอบสัมผัส (tangent) ไว้เดิม
              var aTx = avx - aN * nx, aTy = avy - aN * ny;
              var bTx = bvx - bN * nx, bTy = bvy - bN * ny;
              a.vx = aTx + bN * nx; a.vy = aTy + bN * ny;
              b.vx = bTx + aN * nx; b.vy = bTy + aN * ny;
            }
          }
        }
      }
    }

    function sumSpeedSquared() {
      var total = 0;
      for (var i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        total += p.vx * p.vx + p.vy * p.vy;
      }
      return total;
    }

    function computeValues() {
      var rect = boxRect();
      var area = rect.width * rect.height;
      var pressure = area > 0 ? P_CAL * sumSpeedSquared() / area : 0;
      var volume = state.volumeFraction * 100; // หน่วยสัมพัทธ์ ตรงกับ % ปริมาตร
      return {
        pressure: pressure,
        volume: volume,
        pv: pressure * volume,
        moleculeCount: state.moleculeCount,
        volumeFraction: state.volumeFraction
      };
    }

    function pistonMarkup(rect) {
      var px = rect.right;
      return (
        '<rect x="' + (px - 6) + '" y="' + (rect.top - 10) + '" width="12" height="' + (rect.height + 20) +
        '" fill="var(--accent-secondary)" stroke="var(--ink)" stroke-width="3" rx="3"/>' +
        '<rect x="' + px + '" y="' + (rect.top + rect.height / 2 - 16) + '" width="34" height="32" rx="6"' +
        ' fill="var(--accent-secondary)" stroke="var(--ink)" stroke-width="3"/>' +
        '<text x="' + (px + 17) + '" y="' + (rect.top + rect.height / 2 + 46) +
        '" text-anchor="middle" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="13">ลูกสูบ</text>'
      );
    }

    function boxMarkup(rect) {
      return (
        '<rect x="' + rect.left + '" y="' + rect.top + '" width="' + BOX_W_MAX + '" height="' + rect.height +
        '" fill="none" stroke="var(--grid)" stroke-width="2" stroke-dasharray="4 8" rx="6"/>' +
        '<line x1="' + rect.left + '" y1="' + rect.top + '" x2="' + rect.left + '" y2="' + rect.bottom + '" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>' +
        '<line x1="' + rect.left + '" y1="' + rect.top + '" x2="' + rect.right + '" y2="' + rect.top + '" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>' +
        '<line x1="' + rect.left + '" y1="' + rect.bottom + '" x2="' + rect.right + '" y2="' + rect.bottom + '" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>'
      );
    }

    function particlesMarkup() {
      var out = '';
      for (var i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        out += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + PARTICLE_R +
          '" fill="var(--accent-primary)" stroke="var(--ink)" stroke-width="1.5"/>';
      }
      return out;
    }

    /* ---- กราฟ P-V ---- */
    function vPx(v) { return GRAPH_LEFT + ((v - V_DOM[0]) / (V_DOM[1] - V_DOM[0])) * (GRAPH_RIGHT - GRAPH_LEFT); }
    function pPx(p, pDom) {
      var frac = (p - pDom.min) / (pDom.max - pDom.min);
      return (GRAPH_TOP + GRAPH_H) - frac * GRAPH_H;
    }

    function graphMarkup(vals) {
      var k = Math.max(1e-6, vals.pv); // PV ~ คงที่ (ที่ N, T ปัจจุบัน) ใช้สร้างเส้นโค้งทฤษฎี
      var pAtMin = k / V_DOM[0], pAtMax = k / V_DOM[1];
      var pDom = { min: pAtMax * 0.85, max: pAtMin * 1.15 };
      if (pDom.max - pDom.min < 1e-6) pDom.max = pDom.min + 1;

      var out = '';
      out += '<rect x="' + GRAPH_LEFT + '" y="' + GRAPH_TOP + '" width="' + (GRAPH_RIGHT - GRAPH_LEFT) + '" height="' + GRAPH_H +
        '" fill="none" stroke="var(--ink)" stroke-width="2" rx="8"/>';

      for (var g = 0; g <= 4; g++) {
        var gv = V_DOM[0] + ((V_DOM[1] - V_DOM[0]) * g) / 4;
        var gx = vPx(gv).toFixed(1);
        out += '<line x1="' + gx + '" y1="' + GRAPH_TOP + '" x2="' + gx + '" y2="' + GRAPH_BOTTOM + '" stroke="var(--grid)" stroke-width="1.5"/>';
        out += '<text x="' + gx + '" y="' + (GRAPH_BOTTOM + 18) + '" text-anchor="middle" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.65">' + gv.toFixed(0) + '</text>';
      }

      // เส้นโค้งทฤษฎี P = k / V (ไฮเพอร์โบลา)
      var curve = '';
      var N = 60;
      for (var i = 0; i <= N; i++) {
        var v = V_DOM[0] + ((V_DOM[1] - V_DOM[0]) * i) / N;
        var pv = k / v;
        var x = vPx(v).toFixed(1);
        var y = pPx(pv, pDom).toFixed(1);
        curve += (i === 0 ? 'M ' : 'L ') + x + ',' + y + ' ';
      }
      out += '<path d="' + curve + '" fill="none" stroke="var(--accent-tertiary)" stroke-width="3" stroke-dasharray="6 5" opacity="0.85"/>';

      // ประวัติจุดที่ลากผ่านจริง (trace)
      var traceD = '';
      for (var t = 0; t < trace.length; t++) {
        var tp = trace[t];
        var tx = vPx(tp.v).toFixed(1);
        var ty = pPx(clamp(tp.p, pDom.min, pDom.max), pDom).toFixed(1);
        traceD += (t === 0 ? 'M ' : 'L ') + tx + ',' + ty + ' ';
      }
      if (trace.length > 1) {
        out += '<path d="' + traceD + '" fill="none" stroke="var(--accent-primary)" stroke-width="3" stroke-linecap="round" opacity="0.55"/>';
      }

      // จุดปัจจุบัน
      var curPx = vPx(vals.volume).toFixed(1);
      var curPy = pPx(clamp(vals.pressure, pDom.min, pDom.max), pDom).toFixed(1);
      out += '<circle cx="' + curPx + '" cy="' + curPy + '" r="8" fill="var(--accent-primary)" stroke="var(--ink)" stroke-width="2.5"/>';

      out += '<text x="' + (GRAPH_LEFT + 10) + '" y="' + (GRAPH_TOP + 20) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="14">กราฟ P-V</text>';
      out += '<text x="' + (GRAPH_RIGHT) + '" y="' + (GRAPH_BOTTOM + 34) + '" text-anchor="end" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="11" opacity="0.7">V (หน่วยสัมพัทธ์)</text>';
      out += '<text x="' + (GRAPH_LEFT - 6) + '" y="' + (GRAPH_TOP - 8) + '" text-anchor="start" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="11" opacity="0.7">P (kPa)</text>';

      return out;
    }

    function frameRender(vals) {
      var rect = boxRect();
      var parts = [];
      parts.push(boxMarkup(rect));
      parts.push(particlesMarkup());
      parts.push(pistonMarkup(rect));
      parts.push(graphMarkup(vals));
      svg.innerHTML = parts.join('');
    }

    function notify(vals) {
      trace.push({ v: vals.volume, p: vals.pressure });
      if (trace.length > TRACE_MAX) trace.shift();
      frameRender(vals);
      onUpdate(vals);
    }

    function tick(ts) {
      if (lastTs == null) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      var rect = boxRect();

      for (var i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      resolveWallCollisions(rect);
      resolveParticleCollisions();

      notify(computeValues());
      rafId = requestAnimationFrame(tick);
    }

    function setVolumeFraction(frac) {
      state.volumeFraction = clamp(frac, volumeRange[0], volumeRange[1]);
      clampParticlesToBox();
      notify(computeValues());
    }

    function setMoleculeCount(n) {
      state.moleculeCount = Math.round(clamp(n, countRange[0], countRange[1]));
      spawnParticles(state.moleculeCount);
      trace.length = 0;
      notify(computeValues());
    }

    notify(computeValues());
    rafId = requestAnimationFrame(tick);

    return {
      setVolumeFraction: setVolumeFraction,
      setMoleculeCount: setMoleculeCount,
      getVolumeFraction: function () { return state.volumeFraction; },
      getMoleculeCount: function () { return state.moleculeCount; },
      destroy: function () { if (rafId) cancelAnimationFrame(rafId); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.gasParticles = { create: create };
})();
