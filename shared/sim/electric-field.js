/* shared/sim/electric-field.js — สนามไฟฟ้าจากประจุจุด 2 ตัว + เส้นสนาม + ประจุทดสอบลากได้/ปล่อยได้
   ใช้ผ่าน window.SimPatterns.electricField.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend/ปุ่มข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)) ห้ามฝัง hex ตรงๆ

   ฟิสิกส์ที่ใช้เป็นค่าจริงทั้งหมด (ไม่ย่อสเกล):
   - k = 8.99e9 N·m²/C² (ค่าคงที่คูลอมบ์)
   - ประจุปรับได้เป็นหน่วย µC (แปลงเป็น C คูณ 1e-6 ก่อนคำนวณ)
   - ตำแหน่งในโลกจำลองเป็นหน่วย ซม. (แปลงเป็น ม. หารด้วย 100 ก่อนคำนวณ E/F)
   - ตัวเลข E/F/แรงคูลอมบ์ที่ onUpdate ส่งออกไป คือค่าจริงตามกฎของคูลอมบ์ ไม่ได้ปรับแต่งเพื่อความสวยงาม

   ส่วนที่ "ออกแบบเพื่อการมองเห็น" (ไม่ใช่ฟิสิกส์จริง) มีจุดเดียวคือความเร็วของประจุทดสอบตอนถูกปล่อย:
   ACCEL_SCALE แปลงแรงจริง (N) เป็นความเร่งบนจอ (ซม./วิ²) แบบ slow-motion เพราะถ้าใช้มวลจริงของอนุภาคเล็กๆ
   ประจุจะพุ่งเร็วเกินสังเกตได้ในกรอบจำลอง 40×28 ซม. — นี่คือค่าคงที่การแสดงผลเท่านั้น ไม่กระทบตัวเลข E/F ที่แสดง

   เส้นสนาม (field lines): ลากจากรอบประจุแต่ละตัว จำนวนเส้นแปรผันตามขนาด|q| (ธรรมเนียม "ความหนาแน่นเส้น ∝ ขนาดประจุ")
   ประจุบวก: เดินตามทิศ +E (พุ่งออก) | ประจุลบ: เดินตามทิศ -E (เสมือนเส้นที่ไหลเข้า) — หยุดเมื่อเข้าใกล้ประจุอีกตัว
   หรือออกนอกกรอบโลกจำลอง หรือครบจำนวนสเต็ปสูงสุด
   เส้นเหล่านี้คำนวณคนละส่วนกับ "วิถีจริง" ของประจุทดสอบที่ถูกปล่อย (ซึ่งบันทึกเป็น trail จาก F=ma สะสมจริง)
   เพื่อให้เห็นชัดว่าเส้นสนาม (ธรรมเนียมวาด) กับวิถีจริง (มีความเฉื่อย) เป็นคนละเส้นกัน */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var K = 8.99e9;        // ค่าคงที่คูลอมบ์ (SI)
  var UC = 1e-6;         // 1 microcoulomb เป็นคูลอมบ์
  var CM = 0.01;         // 1 ซม. เป็นเมตร

  var WORLD_W = 40, WORLD_H = 28;  // กรอบโลกจำลอง (ซม.)
  var SCALE = 20;                  // px ต่อ ซม. -> viewBox 800x560
  var VB_W = WORLD_W * SCALE, VB_H = WORLD_H * SCALE;

  var MARGIN = 2.2;          // เว้นขอบไม่ให้ลากประจุ/ทดสอบชิดขอบเกินไป (ซม.)
  var MIN_SEP_SRC = 3.5;     // ระยะห่างขั้นต่ำระหว่างประจุแหล่งกำเนิดสองตัว (ซม.) กันสนามพุ่งเป็นอนันต์
  var MIN_SEP_TEST = 1.6;    // ระยะห่างขั้นต่ำเมื่อลากประจุทดสอบเข้าใกล้ประจุแหล่งกำเนิด (ซม.)
  var CAPTURE_R_TEST = 1.1;  // ระยะที่ถือว่าประจุทดสอบ "ถูกจับ/ชน" ประจุแหล่งกำเนิดระหว่างเคลื่อนที่ (ซม.)
  var CAPTURE_R_LINE = 1.1;  // ระยะที่เส้นสนามหยุดวาดเมื่อเข้าใกล้ประจุ (ซม.)

  var LINE_STEP = 0.4;       // ความยาวก้าวของการลากเส้นสนามแต่ละสเต็ป (ซม.)
  var LINE_MAX_STEPS = 340;

  var ACCEL_SCALE = 16;      // ค่าคงที่แสดงผล: N ของแรงจริง -> ซม./วิ² บนจอ (slow-motion, ดูหมายเหตุด้านบน)
  var MAX_SPEED = 90;        // จำกัดอัตราเร็วสูงสุดของประจุทดสอบตอนเคลื่อนที่ (ซม./วิ) กันวิ่งหลุดจอกะทันหันใกล้จุดจับ
  var DT = 1 / 60;
  var TRAIL_MAX = 400;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  /* ---------- superscript formatting: ตัวเลขวิทยาศาสตร์ (a.bc×10ⁿ) แบบตำราฟิสิกส์ ---------- */
  var SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻' };
  function toSup(str) {
    return String(str).split('').map(function (ch) { return SUP[ch] != null ? SUP[ch] : ch; }).join('');
  }
  function formatSci(value) {
    if (!isFinite(value)) return '—';
    if (Math.abs(value) < 1e-9) return '0';
    var abs = Math.abs(value);
    if (abs >= 1000 || abs < 0.01) {
      var exp = Math.floor(Math.log10(abs));
      var mant = value / Math.pow(10, exp);
      // ปัดแล้วเช็คว่ามันตีสาสารกลิ้งเกิน 10 ไหม (เช่น 9.996 -> 10.0)
      mant = Math.round(mant * 100) / 100;
      if (Math.abs(mant) >= 10) { mant /= 10; exp += 1; }
      return mant.toFixed(2) + '×10' + toSup(exp);
    }
    return value.toFixed(abs < 1 ? 3 : 2);
  }

  function arrowHead(tipX, tipY, dirX, dirY, size) {
    size = size || 10;
    var len = Math.hypot(dirX, dirY) || 1;
    var ux = dirX / len, uy = dirY / len;
    var nx = -uy, ny = ux;
    var backX = tipX - ux * size, backY = tipY - uy * size;
    var leftX = backX + nx * size * 0.55, leftY = backY + ny * size * 0.55;
    var rightX = backX - nx * size * 0.55, rightY = backY - ny * size * 0.55;
    return tipX.toFixed(2) + ',' + tipY.toFixed(2) + ' ' + leftX.toFixed(2) + ',' + leftY.toFixed(2) + ' ' + rightX.toFixed(2) + ',' + rightY.toFixed(2);
  }

  function create(container, options) {
    options = options || {};
    var chargeRange = options.chargeRange || [-6, 6];
    var onUpdate = options.onUpdate || function () {};

    var defaults = {
      q1: { x: 13, y: 20, q: options.q1 != null ? options.q1 : 4 },
      q2: { x: 27, y: 20, q: options.q2 != null ? options.q2 : -3 },
      test: { x: 13, y: 8, q: 1 } // ประจุทดสอบ: ขนาดคงที่ +1 µC ปรับไม่ได้ (ตามธรรมเนียม "ประจุทดสอบ")
    };

    var state = {
      q1: { x: defaults.q1.x, y: defaults.q1.y, q: defaults.q1.q },
      q2: { x: defaults.q2.x, y: defaults.q2.y, q: defaults.q2.q },
      test: { x: defaults.test.x, y: defaults.test.y, q: defaults.test.q, vx: 0, vy: 0 },
      releasing: false,
      trail: [],
      captured: false
    };

    var fieldLinesCache = null; // string HTML — recompute เฉพาะตอนประจุแหล่งกำเนิดเปลี่ยน (ตำแหน่ง/ขนาด)
    var timer = null;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VB_W + ' ' + VB_H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'ลากประจุ/ประจุทดสอบได้ · เส้นสนามคือธรรมเนียมวาด ไม่ใช่รางที่ประจุวิ่งตามจริง';
    container.appendChild(legend);

    /* ---------- world <-> svg (world: y ขึ้นบวกแบบฟิสิกส์ปกติ, svg: y ลงบวกแบบจอภาพ) ---------- */
    function toSvgX(xCm) { return xCm * SCALE; }
    function toSvgY(yCm) { return VB_H - yCm * SCALE; }
    function fromSvg(sx, sy) { return { x: sx / SCALE, y: (VB_H - sy) / SCALE }; }

    function clampWorld(x, y) {
      return { x: clamp(x, MARGIN, WORLD_W - MARGIN), y: clamp(y, MARGIN, WORLD_H - MARGIN) };
    }

    /* ---------- ฟิสิกส์: สนามไฟฟ้าสุทธิจาก q1, q2 ที่จุด (x,y) หน่วย ซม. -> คืนค่า Ex,Ey หน่วย N/C ---------- */
    function fieldAt(x, y, excludeBoth) {
      var Ex = 0, Ey = 0;
      if (!excludeBoth) {
        [state.q1, state.q2].forEach(function (src) {
          var dx = x - src.x, dy = y - src.y;
          var rCm = Math.max(Math.hypot(dx, dy), 0.05);
          var rM = rCm * CM;
          var qC = src.q * UC;
          var mag = K * qC / (rM * rM); // เครื่องหมายตามประจุ (ลบ = สนามพุ่งเข้า)
          Ex += mag * (dx / rCm);
          Ey += mag * (dy / rCm);
        });
      }
      return { Ex: Ex, Ey: Ey };
    }

    function chargeRadiusPx(q) {
      return clamp(13 + Math.sqrt(Math.abs(q)) * 7, 13, 32);
    }

    /* ---------- เส้นสนาม: ลากจากรอบประจุแต่ละตัว จำนวนเส้น ∝ |q| ---------- */
    function traceFieldLines() {
      var out = '';
      [state.q1, state.q2].forEach(function (src, idx) {
        var colorVar = idx === 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)';
        var n = Math.round(clamp(3 + Math.abs(src.q) * 1.5, 4, 14));
        var dirMul = src.q >= 0 ? 1 : -1; // ทิศการ "เดินสร้างเส้น" เท่านั้น — ทิศลูกศรที่วาดจริงต้องอ้างสนาม E ตรงจุดนั้นเสมอ (ดูด้านล่าง)
        for (var i = 0; i < n; i++) {
          var a0 = (i / n) * Math.PI * 2 + 0.15;
          var x = src.x + Math.cos(a0) * (CAPTURE_R_LINE + 0.05);
          var y = src.y + Math.sin(a0) * (CAPTURE_R_LINE + 0.05);
          var pts = [{ x: x, y: y }];
          for (var step = 0; step < LINE_MAX_STEPS; step++) {
            var f = fieldAt(x, y);
            var mag = Math.hypot(f.Ex, f.Ey) || 1e-9;
            var ux = (f.Ex / mag) * dirMul, uy = (f.Ey / mag) * dirMul;
            x += ux * LINE_STEP;
            y += uy * LINE_STEP;
            pts.push({ x: x, y: y });
            if (x < -1 || x > WORLD_W + 1 || y < -1 || y > WORLD_H + 1) break;
            if (dist(x, y, state.q1.x, state.q1.y) < CAPTURE_R_LINE || dist(x, y, state.q2.x, state.q2.y) < CAPTURE_R_LINE) break;
          }
          var d = pts.map(function (p, k) { return (k === 0 ? 'M ' : 'L ') + toSvgX(p.x).toFixed(1) + ',' + toSvgY(p.y).toFixed(1); }).join(' ');
          out += '<path d="' + d + '" fill="none" stroke="' + colorVar + '" stroke-width="2" opacity="0.55" stroke-linecap="round"/>';
          // หัวลูกศรกลางเส้นบอกทิศทาง E จริง ณ จุดนั้น (ไม่ใช่ทิศที่ใช้เดินสร้างเส้น) — ประจุลบต้องเห็นลูกศรชี้เข้าหาประจุเสมอ
          var midIdx = Math.max(1, Math.floor(pts.length * 0.55));
          var mp = pts[midIdx];
          if (mp) {
            var fMid = fieldAt(mp.x, mp.y);
            var fMag = Math.hypot(fMid.Ex, fMid.Ey) || 1e-9;
            var fdx = fMid.Ex / fMag, fdy = fMid.Ey / fMag;
            out += '<polygon points="' + arrowHead(toSvgX(mp.x), toSvgY(mp.y), fdx * SCALE, -fdy * SCALE, 9) + '" fill="' + colorVar + '" opacity="0.7"/>';
          }
        }
      });
      return out;
    }

    function markLinesDirty() { fieldLinesCache = null; }

    /* ---------- ค่าที่ต้องรายงานออก ---------- */
    function computeReport() {
      var f = fieldAt(state.test.x, state.test.y);
      var Emag = Math.hypot(f.Ex, f.Ey);
      var Fx = state.test.q * UC * f.Ex, Fy = state.test.q * UC * f.Ey;
      var Fmag = Math.hypot(Fx, Fy);
      var angleDeg = (Math.atan2(Fy, Fx) * 180 / Math.PI + 360) % 360;

      var dx = state.q2.x - state.q1.x, dy = state.q2.y - state.q1.y;
      var r12Cm = Math.max(Math.hypot(dx, dy), 0.1);
      var r12M = r12Cm * CM;
      var coulombF = K * Math.abs(state.q1.q * UC * state.q2.q * UC) / (r12M * r12M);
      var attract = (state.q1.q >= 0) !== (state.q2.q >= 0) && state.q1.q !== 0 && state.q2.q !== 0;

      return {
        q1: { x: state.q1.x, y: state.q1.y, q: state.q1.q },
        q2: { x: state.q2.x, y: state.q2.y, q: state.q2.q },
        test: { x: state.test.x, y: state.test.y, q: state.test.q },
        Emag: Emag, Fmag: Fmag, angleDeg: angleDeg,
        coulombF: coulombF, attract: attract,
        releasing: state.releasing, captured: state.captured,
        formatSci: formatSci
      };
    }

    /* ---------- render ---------- */
    function chargeGlyph(cx, cy, q, colorVar, handleId) {
      var r = chargeRadiusPx(q);
      var sign = q >= 0 ? '+' : '−';
      return '<g>' +
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + colorVar + '" stroke="var(--ink)" stroke-width="3"/>' +
        '<text x="' + cx.toFixed(1) + '" y="' + (cy + r * 0.32).toFixed(1) + '" text-anchor="middle" font-family="var(--font)" font-weight="900" font-size="' + (r * 1.15).toFixed(0) + '" fill="var(--ink)">' + sign + '</text>' +
        '<circle id="' + handleId + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (r + 10).toFixed(1) + '" fill="var(--ink)" opacity="0.001" cursor="grab"/>' +
        '</g>';
    }

    function render() {
      if (fieldLinesCache == null) fieldLinesCache = traceFieldLines();

      var rep = computeReport();

      var svgContent = '';
      // กรอบโลกจำลอง
      svgContent += '<rect x="1" y="1" width="' + (VB_W - 2) + '" height="' + (VB_H - 2) + '" fill="none" stroke="var(--ink)" stroke-width="2" opacity="0.15"/>';
      svgContent += fieldLinesCache;

      // trail ของประจุทดสอบ (วิถีจริง) — สีต่างจากเส้นสนามชัดเจน + ทึบกว่า เพื่อให้เทียบกันได้ตรงๆ
      if (state.trail.length > 1) {
        var td = state.trail.map(function (p, k) { return (k === 0 ? 'M ' : 'L ') + toSvgX(p.x).toFixed(1) + ',' + toSvgY(p.y).toFixed(1); }).join(' ');
        svgContent += '<path d="' + td + '" fill="none" stroke="var(--accent-tertiary)" stroke-width="4" stroke-linecap="round" opacity="0.9"/>';
      }

      // ประจุแหล่งกำเนิด
      svgContent += chargeGlyph(toSvgX(state.q1.x), toSvgY(state.q1.y), state.q1.q, 'var(--accent-primary)', 'efQ1Handle');
      svgContent += chargeGlyph(toSvgX(state.q2.x), toSvgY(state.q2.y), state.q2.q, 'var(--accent-secondary)', 'efQ2Handle');

      // เวกเตอร์แรงบนประจุทดสอบ (สีเข้ม เด่นกว่าเส้นสนามบางๆ โดยตั้งใจ — นี่คือ "ของจริง" ที่ต้องดู)
      var f = fieldAt(state.test.x, state.test.y);
      var Fx = state.test.q * UC * f.Ex, Fy = state.test.q * UC * f.Ey;
      var Fmag2 = Math.hypot(Fx, Fy) || 1e-9;
      var arrowLenPx = clamp(24 + Math.log10(1 + Fmag2) * 22, 24, 90);
      var ux = Fx / Fmag2, uy = Fy / Fmag2;
      var tx = toSvgX(state.test.x), ty = toSvgY(state.test.y);
      var hx = tx + ux * arrowLenPx, hy = ty - uy * arrowLenPx;
      svgContent += '<line x1="' + tx.toFixed(1) + '" y1="' + ty.toFixed(1) + '" x2="' + hx.toFixed(1) + '" y2="' + hy.toFixed(1) + '" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>';
      svgContent += '<polygon points="' + arrowHead(hx, hy, ux * SCALE, -uy * SCALE, 13) + '" fill="var(--ink)"/>';

      // ประจุทดสอบ (เพชร แยกจากวงกลมของประจุแหล่งกำเนิดชัดเจน)
      var tr = 12;
      var diamond = (tx) + ',' + (ty - tr) + ' ' + (tx + tr) + ',' + ty + ' ' + tx + ',' + (ty + tr) + ' ' + (tx - tr) + ',' + ty;
      svgContent += '<polygon points="' + diamond + '" fill="var(--accent-tertiary)" stroke="var(--ink)" stroke-width="3"/>';
      svgContent += '<circle id="efTestHandle" cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="' + (tr + 12).toFixed(1) + '" fill="var(--ink)" opacity="0.001" cursor="grab"/>';

      if (state.captured) {
        svgContent += '<text x="' + (VB_W / 2) + '" y="26" text-anchor="middle" font-family="var(--font)" font-weight="900" font-size="15" fill="var(--accent-secondary-fg)">ประจุทดสอบเข้าใกล้ประจุแหล่งกำเนิดมากเกินไป — หยุดที่นี่ (กด รีเซ็ต เพื่อเริ่มใหม่)</text>';
      }

      svg.innerHTML = svgContent;
      attachDrag();
      onUpdate(rep);
    }

    /* ---------- drag ---------- */
    function pointerToWorld(e, rect) {
      var vb = svg.viewBox.baseVal;
      var fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      var sx = vb.x + fx * vb.width, sy = vb.y + fy * vb.height;
      return fromSvg(sx, sy);
    }

    function attachDrag() {
      var h1 = svg.querySelector('#efQ1Handle');
      var h2 = svg.querySelector('#efQ2Handle');
      var ht = svg.querySelector('#efTestHandle');
      if (h1) bindChargeDrag(h1, state.q1, state.q2, MIN_SEP_SRC);
      if (h2) bindChargeDrag(h2, state.q2, state.q1, MIN_SEP_SRC);
      if (ht) bindTestDrag(ht);
    }

    function bindChargeDrag(handle, self, other, minSep) {
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        var rect = svg.getBoundingClientRect();
        handle.style.cursor = 'grabbing';
        function onMove(ev) {
          var w = pointerToWorld(ev, rect);
          var c = clampWorld(w.x, w.y);
          var d = dist(c.x, c.y, other.x, other.y);
          if (d < minSep) {
            var ang = Math.atan2(c.y - other.y, c.x - other.x);
            c.x = other.x + Math.cos(ang) * minSep;
            c.y = other.y + Math.sin(ang) * minSep;
          }
          self.x = c.x; self.y = c.y;
          markLinesDirty();
          render();
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }

    function bindTestDrag(handle) {
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        stopRelease();
        state.trail = [];
        state.captured = false;
        var rect = svg.getBoundingClientRect();
        function onMove(ev) {
          var w = pointerToWorld(ev, rect);
          var c = clampWorld(w.x, w.y);
          [state.q1, state.q2].forEach(function (src) {
            var d = dist(c.x, c.y, src.x, src.y);
            if (d < MIN_SEP_TEST) {
              var ang = Math.atan2(c.y - src.y, c.x - src.x);
              c.x = src.x + Math.cos(ang) * MIN_SEP_TEST;
              c.y = src.y + Math.sin(ang) * MIN_SEP_TEST;
            }
          });
          state.test.x = c.x; state.test.y = c.y;
          render();
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }

    /* ---------- ปล่อยประจุทดสอบ: เคลื่อนที่จริงภายใต้ F = qE (มีความเฉื่อย) ---------- */
    function tick() {
      var f = fieldAt(state.test.x, state.test.y);
      var Fx = state.test.q * UC * f.Ex, Fy = state.test.q * UC * f.Ey;
      var Fmag = Math.hypot(Fx, Fy);
      var ax = (Fx / (Fmag || 1)) * Fmag * ACCEL_SCALE;
      var ay = (Fy / (Fmag || 1)) * Fmag * ACCEL_SCALE;

      state.test.vx += ax * DT;
      state.test.vy += ay * DT;
      var speed = Math.hypot(state.test.vx, state.test.vy);
      if (speed > MAX_SPEED) {
        state.test.vx = (state.test.vx / speed) * MAX_SPEED;
        state.test.vy = (state.test.vy / speed) * MAX_SPEED;
      }
      state.test.x += state.test.vx * DT;
      state.test.y += state.test.vy * DT;

      state.trail.push({ x: state.test.x, y: state.test.y });
      if (state.trail.length > TRAIL_MAX) state.trail.shift();

      var hitEdge = state.test.x < 0 || state.test.x > WORLD_W || state.test.y < 0 || state.test.y > WORLD_H;
      var hitCharge = dist(state.test.x, state.test.y, state.q1.x, state.q1.y) < CAPTURE_R_TEST ||
                      dist(state.test.x, state.test.y, state.q2.x, state.q2.y) < CAPTURE_R_TEST;
      if (hitEdge || hitCharge) {
        state.captured = hitCharge;
        stopRelease();
      }
      render();
    }

    function startRelease() {
      if (state.releasing) return;
      state.releasing = true;
      state.captured = false;
      state.test.vx = 0; state.test.vy = 0;
      state.trail = [{ x: state.test.x, y: state.test.y }];
      timer = setInterval(tick, 16);
    }

    function stopRelease() {
      state.releasing = false;
      if (timer) { clearInterval(timer); timer = null; }
    }

    function toggleRelease() {
      if (state.releasing) stopRelease(); else startRelease();
      render();
    }

    function setCharge(id, qMicroC) {
      var v = clamp(qMicroC, chargeRange[0], chargeRange[1]);
      if (id === 'q1') state.q1.q = v; else if (id === 'q2') state.q2.q = v;
      markLinesDirty();
      render();
    }

    function reset() {
      stopRelease();
      state.q1.x = defaults.q1.x; state.q1.y = defaults.q1.y; state.q1.q = defaults.q1.q;
      state.q2.x = defaults.q2.x; state.q2.y = defaults.q2.y; state.q2.q = defaults.q2.q;
      state.test.x = defaults.test.x; state.test.y = defaults.test.y;
      state.test.vx = 0; state.test.vy = 0;
      state.trail = [];
      state.captured = false;
      markLinesDirty();
      render();
    }

    render();

    return {
      setCharge: setCharge,
      toggleRelease: toggleRelease,
      isReleasing: function () { return state.releasing; },
      reset: reset,
      destroy: function () { if (timer) clearInterval(timer); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.electricField = { create: create };
})();
