/* shared/sim/mirrors-lenses.js — ray diagram กระจกเว้า/นูน และเลนส์นูน/เว้า
   ใช้ผ่าน window.SimPatterns.mirrorsLenses.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ device ('concave-mirror' | 'convex-mirror' | 'convex-lens' | 'concave-lens'), u (ระยะวัตถุ), f (ความยาวโฟกัส)
   ใช้ระบบเครื่องหมาย "จริงเป็นบวก" (real-is-positive): u > 0 เสมอ (วัตถุจริงอยู่หน้าอุปกรณ์เสมอ),
   f เป็นบวกสำหรับอุปกรณ์ลู่เข้า (กระจกเว้า/เลนส์นูน), ลบสำหรับอุปกรณ์ลู่ออก (กระจกนูน/เลนส์เว้า)
   สมการ: 1/f = 1/v + 1/u, m = -v/u — v > 0 คือภาพจริง, v < 0 คือภาพเสมือน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)) ห้ามฝัง hex ตรงๆ
   วัตถุลากได้: pointerdown/move ที่จุดปลายลูกศรวัตถุจะปรับ u แล้วเรียก onUpdate ให้หน้าเรื่อง sync กับ slider */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  // หาจุดที่เส้นตรงผ่าน (x0,y0)-(x1,y1) ตัดกับระนาบ x = atX — คืน null ถ้าเส้นขนานแกน x (แนวราบ ไม่ตัด atX ที่จุดเดียว)
  function lineAtX(x0, y0, x1, y1, atX) {
    if (Math.abs(x1 - x0) < 1e-4) return null;
    var t = (atX - x0) / (x1 - x0);
    return { x: atX, y: y0 + t * (y1 - y0) };
  }

  function arrowHead(tipX, tipY, dirX, dirY, size) {
    size = size || 12;
    var len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    var ux = dirX / len, uy = dirY / len;
    var nx = -uy, ny = ux;
    var backX = tipX - ux * size, backY = tipY - uy * size;
    var leftX = backX + nx * size * 0.5, leftY = backY + ny * size * 0.5;
    var rightX = backX - nx * size * 0.5, rightY = backY - ny * size * 0.5;
    return tipX.toFixed(2) + ',' + tipY.toFixed(2) + ' ' +
      leftX.toFixed(2) + ',' + leftY.toFixed(2) + ' ' +
      rightX.toFixed(2) + ',' + rightY.toFixed(2);
  }

  function create(container, options) {
    options = options || {};
    var uRange = options.uRange || [5, 100];
    var fRange = options.fRange || [10, 50];

    var state = {
      device: options.device || 'concave-mirror',
      u: clamp(options.u != null ? options.u : 30, uRange[0], uRange[1]),
      f: clamp(options.f != null ? options.f : 20, fRange[0], fRange[1])
    };
    var defaults = { device: state.device, u: state.u, f: state.f };
    var onUpdate = options.onUpdate || function () {};

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 800 480');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--secondary';
    legend.textContent = 'รังสีขนานแกน · รังสีผ่านศูนย์กลาง/C · รังสีผ่านโฟกัส F — ลากลูกศรวัตถุได้';
    container.appendChild(legend);

    var cx = 400, cy = 240;
    var SCALE = 3;          // px ต่อ cm
    var MAX_DRAW_CM = 110;   // จำกัดระยะวาดภาพไม่ให้ทะลุขอบ canvas เมื่อ v มีค่ามาก (ใกล้จุดโฟกัสพอดี)
    var H0 = 70;             // ความสูงลูกศรวัตถุ (px)
    var MAX_HI = 190, MIN_HI = 14;
    var STUB = 60;           // ความยาวรังสีจริงที่ลากสั้นๆ ก่อนต่อแนวประเมื่อภาพเป็นภาพเสมือน

    function isMirrorDevice(d) { return d === 'concave-mirror' || d === 'convex-mirror'; }
    function isConverging(d) { return d === 'concave-mirror' || d === 'convex-lens'; }

    function compute() {
      var isMirror = isMirrorDevice(state.device);
      var converging = isConverging(state.device);
      var fSigned = converging ? state.f : -state.f;
      var u = state.u;
      var denom = (1 / fSigned) - (1 / u);
      var singular = Math.abs(denom) < 1e-4;
      if (singular) denom = (denom < 0 ? -1 : 1) * 1e-4;
      var v = 1 / denom;
      var m = -v / u;
      var real = v > 0;
      var upright = m > 0;
      var magRatio = Math.abs(m);
      return {
        device: state.device, isMirror: isMirror, converging: converging,
        u: u, f: state.f, fSigned: fSigned, v: v, m: m,
        real: real, upright: upright, magRatio: magRatio, singular: singular
      };
    }

    function render() {
      var vals = compute();

      var xObj = cx - vals.u * SCALE;
      var yObj = cy - H0;

      var vDraw = clamp(vals.v, -MAX_DRAW_CM, MAX_DRAW_CM);
      var xImg = vals.isMirror ? (cx - vDraw * SCALE) : (cx + vDraw * SCALE);
      var hiMag = clamp(vals.magRatio * H0, MIN_HI, MAX_HI);
      var hi = (vals.m < 0 ? -1 : 1) * hiMag;
      var yImg = cy - hi;

      var ARM = 150, BULGE = 34; // ขนาดไอคอนอุปกรณ์ (ใช้ตัดสินขอบเขตที่รังสีตกกระทบได้ด้วย)

      // จุดโฟกัส/ศูนย์กลางความโค้ง — วางตามเครื่องหมายจริง (ฝั่งซ้าย=จริง มองเห็นได้, ฝั่งขวา=เสมือน อยู่หลังอุปกรณ์)
      var xF1 = cx - vals.fSigned * SCALE;                          // F (ฝั่งวัตถุ)
      var xF2 = vals.isMirror ? (cx - 2 * vals.fSigned * SCALE) : (cx + vals.fSigned * SCALE); // C (กระจก) หรือ F' (เลนส์)
      var focalDashed = vals.fSigned < 0; // อุปกรณ์ลู่ออก -> โฟกัสเป็นจุดเสมือน (เส้นประ)

      // --- รังสีหลัก 3 เส้น: หา "จุดตกกระทบ" บนระนาบอุปกรณ์ (x = cx) ของแต่ละเส้น ---
      // ถ้าจุดตกกระทบอยู่นอกช่วงที่วาดอุปกรณ์ (เช่น รังสีผ่าน C ตอนวัตถุอยู่ระหว่าง F กับ C ทำให้ต้องยิงออกนอกกรอบ)
      // ให้ข้ามการวาดเส้นนั้นไปเฉยๆ แทนที่จะปล่อยให้พุ่งออกนอก canvas ดูรกและสับสน
      function onDevice(hit) {
        if (!hit) return null;
        return Math.abs(hit.y - cy) <= ARM - 6 ? hit : null;
      }

      var hit1 = { x: cx, y: yObj }; // รังสีขนานแกน (อยู่ในกรอบเสมอเพราะ H0 < ARM)

      var aim2x = vals.isMirror ? xF2 : cx; // ผ่าน C (กระจก) หรือ ศูนย์กลางเลนส์
      var hit2 = onDevice(vals.isMirror ? lineAtX(xObj, yObj, aim2x, cy, cx) : { x: cx, y: cy });

      var hit3 = onDevice(lineAtX(xObj, yObj, xF1, cy, cx)); // รังสีผ่าน/มุ่งสู่ F ฝั่งวัตถุ

      function rayPaths(hit) {
        if (!hit) return null;
        var inD = 'M ' + xObj.toFixed(2) + ',' + yObj.toFixed(2) + ' L ' + hit.x.toFixed(2) + ',' + hit.y.toFixed(2);
        var outD, dashD = '', arrowPts;
        if (vals.real) {
          outD = 'M ' + hit.x.toFixed(2) + ',' + hit.y.toFixed(2) + ' L ' + xImg.toFixed(2) + ',' + yImg.toFixed(2);
          arrowPts = arrowHead(xImg, yImg, xImg - hit.x, yImg - hit.y, 13);
        } else {
          var dx = hit.x - xImg, dy = hit.y - yImg;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var stubX = hit.x + (dx / len) * STUB, stubY = hit.y + (dy / len) * STUB;
          outD = 'M ' + hit.x.toFixed(2) + ',' + hit.y.toFixed(2) + ' L ' + stubX.toFixed(2) + ',' + stubY.toFixed(2);
          arrowPts = arrowHead(stubX, stubY, dx, dy, 13);
          dashD = 'M ' + hit.x.toFixed(2) + ',' + hit.y.toFixed(2) + ' L ' + xImg.toFixed(2) + ',' + yImg.toFixed(2);
        }
        return { inD: inD, outD: outD, dashD: dashD, arrowPts: arrowPts };
      }

      var r1 = rayPaths(hit1);
      var r2 = rayPaths(hit2);
      var r3 = rayPaths(hit3);

      function rayHTML(r, colorVar) {
        if (!r) return '';
        var html =
          '<path d="' + r.inD + '" fill="none" stroke="' + colorVar + '" stroke-width="3" stroke-linecap="round"/>' +
          '<path d="' + r.outD + '" fill="none" stroke="' + colorVar + '" stroke-width="3" stroke-linecap="round"/>' +
          '<polygon points="' + r.arrowPts + '" fill="' + colorVar + '"/>';
        if (r.dashD) {
          html += '<path d="' + r.dashD + '" fill="none" stroke="' + colorVar + '" stroke-width="2" stroke-dasharray="7 6" opacity="0.75"/>';
        }
        return html;
      }

      // --- ไอคอนอุปกรณ์ ---
      var deviceHTML = '';
      if (vals.device === 'concave-mirror' || vals.device === 'convex-mirror') {
        var bulgeDir = vals.device === 'concave-mirror' ? 1 : -1; // เว้า: โป่งออกจากวัตถุ (ขวา) | นูน: โป่งเข้าหาวัตถุ (ซ้าย)
        var bx = cx + bulgeDir * BULGE;
        var mirrorPath = 'M ' + cx + ',' + (cy - ARM) + ' Q ' + bx + ',' + cy + ' ' + cx + ',' + (cy + ARM);
        var hatchX = cx - bulgeDir * 10; // ขีดหลังฝั่งตรงข้ามผิวสะท้อน
        var hatches = '';
        for (var hy = cy - ARM + 14; hy <= cy + ARM - 14; hy += 24) {
          hatches += '<line x1="' + hatchX + '" y1="' + hy + '" x2="' + (hatchX - bulgeDir * 14) + '" y2="' + (hy + 14) + '" stroke="var(--ink)" stroke-width="2" opacity="0.5"/>';
        }
        deviceHTML = '<path d="' + mirrorPath + '" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>' + hatches;
      } else if (vals.device === 'convex-lens') {
        var lensPath = 'M ' + cx + ',' + (cy - ARM) + ' Q ' + (cx - BULGE) + ',' + cy + ' ' + cx + ',' + (cy + ARM) +
          ' Q ' + (cx + BULGE) + ',' + cy + ' ' + cx + ',' + (cy - ARM) + ' Z';
        deviceHTML = '<path d="' + lensPath + '" fill="var(--ink)" opacity="0.09" stroke="var(--ink)" stroke-width="4"/>';
      } else { // concave-lens
        var waist = 14;
        var glensPath = 'M ' + cx + ',' + (cy - ARM) + ' Q ' + (cx + BULGE) + ',' + cy + ' ' + cx + ',' + (cy + ARM) +
          ' M ' + cx + ',' + (cy - ARM) + ' Q ' + (cx - BULGE) + ',' + cy + ' ' + cx + ',' + (cy + ARM);
        deviceHTML = '<path d="' + glensPath + '" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>' +
          '<line x1="' + cx + '" y1="' + (cy - waist) + '" x2="' + cx + '" y2="' + (cy + waist) + '" stroke="var(--ink)" stroke-width="4"/>';
      }

      // --- แกนหลัก + จุด F/C ---
      var focalStroke = focalDashed ? 'stroke-dasharray="6 6"' : '';
      var focalOpacity = focalDashed ? '0.55' : '0.9';
      var f2Label = vals.isMirror ? 'C' : "F'";

      var axisHTML =
        '<line x1="20" y1="' + cy + '" x2="780" y2="' + cy + '" stroke="var(--ink)" stroke-width="2" opacity="0.35"/>' +
        '<line x1="' + xF1.toFixed(2) + '" y1="' + (cy - 10) + '" x2="' + xF1.toFixed(2) + '" y2="' + (cy + 10) + '" stroke="var(--ink)" stroke-width="2.5" opacity="' + focalOpacity + '" ' + focalStroke + '/>' +
        '<text x="' + xF1.toFixed(2) + '" y="' + (cy + 26) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="14" text-anchor="middle" opacity="' + focalOpacity + '">F</text>' +
        '<line x1="' + xF2.toFixed(2) + '" y1="' + (cy - 10) + '" x2="' + xF2.toFixed(2) + '" y2="' + (cy + 10) + '" stroke="var(--ink)" stroke-width="2.5" opacity="' + focalOpacity + '" ' + focalStroke + '/>' +
        '<text x="' + xF2.toFixed(2) + '" y="' + (cy + 26) + '" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="14" text-anchor="middle" opacity="' + focalOpacity + '">' + f2Label + '</text>';

      // --- วัตถุ + ภาพ ---
      var objArrow =
        '<line x1="' + xObj.toFixed(2) + '" y1="' + cy + '" x2="' + xObj.toFixed(2) + '" y2="' + yObj.toFixed(2) + '" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>' +
        '<polygon points="' + arrowHead(xObj, yObj, 0, -1, 16) + '" fill="var(--ink)"/>' +
        '<circle id="mlObjHandle" cx="' + xObj.toFixed(2) + '" cy="' + yObj.toFixed(2) + '" r="13" fill="var(--ink)" opacity="0.001" cursor="ew-resize"/>';

      var imgColor = 'var(--ink)';
      var imgDash = vals.real ? '' : 'stroke-dasharray="8 6"';
      var imgArrow =
        '<line x1="' + xImg.toFixed(2) + '" y1="' + cy + '" x2="' + xImg.toFixed(2) + '" y2="' + yImg.toFixed(2) + '" stroke="' + imgColor + '" stroke-width="4" stroke-linecap="round" opacity="0.85" ' + imgDash + '/>' +
        '<polygon points="' + arrowHead(xImg, yImg, 0, (yImg < cy ? -1 : 1), 16) + '" fill="' + imgColor + '" opacity="0.85"/>';

      var singularNote = '';
      if (vals.singular) {
        singularNote = '<text x="' + cx + '" y="30" fill="var(--accent-secondary-fg)" font-family="var(--font)" font-weight="900" font-size="16" text-anchor="middle">วัตถุอยู่ที่จุดโฟกัสพอดี — ภาพที่ระยะอนันต์ (ไม่เกิดภาพชัด)</text>';
      }

      svg.innerHTML =
        axisHTML +
        rayHTML(r1, 'var(--accent-primary)') +
        rayHTML(r2, 'var(--accent-secondary)') +
        rayHTML(r3, 'var(--accent-tertiary)') +
        deviceHTML +
        imgArrow +
        objArrow +
        singularNote;

      // ลากวัตถุ
      var handle = svg.querySelector('#mlObjHandle');
      if (handle) {
        handle.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          var rect = svg.getBoundingClientRect();
          var vb = svg.viewBox.baseVal;
          function toU(clientX) {
            var frac = (clientX - rect.left) / rect.width;
            var xSvg = vb.x + frac * vb.width;
            var uVal = clamp((cx - xSvg) / SCALE, uRange[0], uRange[1]);
            return uVal;
          }
          function onMove(ev) {
            setU(Math.round(toU(ev.clientX)));
          }
          function onUp() {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          }
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
      }

      onUpdate(vals);
    }

    function setDevice(d) {
      state.device = d;
      render();
    }

    function setU(u) {
      state.u = clamp(u, uRange[0], uRange[1]);
      render();
    }

    function setF(f) {
      state.f = clamp(f, fRange[0], fRange[1]);
      render();
    }

    function reset() {
      state.device = defaults.device;
      state.u = defaults.u;
      state.f = defaults.f;
      render();
    }

    render();

    return {
      setDevice: setDevice,
      setU: setU,
      setF: setF,
      reset: reset,
      destroy: function () {}
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.mirrorsLenses = { create: create };
})();
