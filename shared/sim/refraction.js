/* shared/sim/refraction.js — การหักเหของแสง (กฎของสเนลล์) + มุมวิกฤต/สะท้อนกลับหมดภายใน
   ใช้ผ่าน window.SimPatterns.refraction.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   generic: รับ n1 (ตัวกลางต้นทาง), n2 (ตัวกลางปลายทาง), angle (มุมตกกระทบ) แล้ววาดรังสีตกกระทบ/หักเห/สะท้อนกลับหมด
   วาดด้วย design token เท่านั้น (var(--ink)/var(--cyan)/var(--magenta)/var(--yellow)) ห้ามฝัง hex ตรงๆ */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DEG = Math.PI / 180;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function normalizeAngleDeg(a) {
    while (a > 180) a -= 360;
    while (a < -180) a += 360;
    return a;
  }

  // สร้าง path ของส่วนโค้ง (มุม) ระหว่างสองทิศทาง โดย sampling เป็นเส้นตรงย่อยๆ
  // ang วัดแบบ atan2 มาตรฐาน (0deg = แกน +x, 90deg = แกน +y เพราะ SVG y ชี้ลง)
  function arcPath(cx, cy, r, fromDeg, toDeg, segments) {
    segments = segments || 18;
    var diff = normalizeAngleDeg(toDeg - fromDeg);
    var d = '';
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var ang = (fromDeg + diff * t) * DEG;
      var x = cx + r * Math.cos(ang);
      var y = cy + r * Math.sin(ang);
      d += (i === 0 ? 'M ' : 'L ') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    return { d: d, midDeg: fromDeg + diff * 0.5 };
  }

  function arrowHead(tipX, tipY, dirX, dirY, size) {
    size = size || 16;
    var nx = -dirY, ny = dirX;
    var backX = tipX - dirX * size, backY = tipY - dirY * size;
    var leftX = backX + nx * size * 0.5, leftY = backY + ny * size * 0.5;
    var rightX = backX - nx * size * 0.5, rightY = backY - ny * size * 0.5;
    return tipX.toFixed(2) + ',' + tipY.toFixed(2) + ' ' +
      leftX.toFixed(2) + ',' + leftY.toFixed(2) + ' ' +
      rightX.toFixed(2) + ',' + rightY.toFixed(2);
  }

  function create(container, options) {
    options = options || {};
    var angleRange = options.angleRange || [0, 90];

    var state = {
      angle: clamp(options.angle != null ? options.angle : 30, angleRange[0], angleRange[1]),
      n1: options.n1 != null ? options.n1 : 1.50,
      n2: options.n2 != null ? options.n2 : 1.00
    };
    var defaults = { angle: state.angle, n1: state.n1, n2: state.n2 };
    var onUpdate = options.onUpdate || function () {};

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 570');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--magenta';
    legend.textContent = 'รังสีตกกระทบ · รังสีหักเห · สะท้อนกลับหมด (TIR)';
    container.appendChild(legend);

    var hitX = 350, hitY = 285, rayLen = 205, arcR = 52;

    function compute() {
      var theta1 = state.angle;
      var theta1Rad = theta1 * DEG;
      var ratio = state.n1 / state.n2;
      var sinTheta2 = ratio * Math.sin(theta1Rad);
      var thetaC = null;
      if (state.n1 > state.n2) {
        thetaC = Math.asin(clamp(state.n2 / state.n1, -1, 1)) / DEG;
      }
      var tir = sinTheta2 > 1 + 1e-9;
      var theta2 = null;
      if (!tir) {
        theta2 = Math.asin(clamp(sinTheta2, -1, 1)) / DEG;
      }
      return { theta1: theta1, theta2: theta2, thetaC: thetaC, tir: tir, n1: state.n1, n2: state.n2 };
    }

    function render() {
      var vals = compute();
      var theta1Rad = vals.theta1 * DEG;
      var sinT1 = Math.sin(theta1Rad), cosT1 = Math.cos(theta1Rad);

      var srcX = hitX - rayLen * sinT1, srcY = hitY - rayLen * cosT1;
      var incidentD = 'M ' + srcX.toFixed(2) + ',' + srcY.toFixed(2) + ' L ' + hitX + ',' + hitY;
      var incidentArrow = arrowHead(hitX, hitY, sinT1, cosT1, 16);

      var secondRayD = '', secondArrow = '', secondColorVar = 'var(--magenta)';
      var tirLabel = '';

      if (!vals.tir) {
        var theta2Rad = vals.theta2 * DEG;
        var sinT2 = Math.sin(theta2Rad), cosT2 = Math.cos(theta2Rad);
        var endX = hitX + rayLen * sinT2, endY = hitY + rayLen * cosT2;
        secondRayD = 'M ' + hitX + ',' + hitY + ' L ' + endX.toFixed(2) + ',' + endY.toFixed(2);
        secondArrow = arrowHead(endX, endY, sinT2, cosT2, 16);
      } else {
        var rEndX = hitX + rayLen * sinT1, rEndY = hitY - rayLen * cosT1;
        secondRayD = 'M ' + hitX + ',' + hitY + ' L ' + rEndX.toFixed(2) + ',' + rEndY.toFixed(2);
        secondArrow = arrowHead(rEndX, rEndY, sinT1, -cosT1, 16);
        secondColorVar = 'var(--yellow)';
        tirLabel = '<text x="' + (rEndX - 40).toFixed(2) + '" y="' + (rEndY - 14).toFixed(2) +
          '" fill="var(--yellow-fg)" font-family="var(--font)" font-weight="900" font-size="16">สะท้อนกลับหมดภายใน</text>';
      }

      // มุม arc: θ1 อยู่ฝั่งซ้าย (ระหว่างเส้นแนวฉากด้านบน กับทิศไปยังจุดกำเนิดรังสีตกกระทบ)
      var upAngle = -90;
      var towardSourceAngle = Math.atan2(-cosT1, -sinT1) / DEG;
      var arc1 = arcPath(hitX, hitY, arcR, upAngle, towardSourceAngle);

      var arc2HTML = '';
      if (!vals.tir) {
        var downAngle = 90;
        var theta2Rad2 = vals.theta2 * DEG;
        var transDirAngle = Math.atan2(Math.cos(theta2Rad2), Math.sin(theta2Rad2)) / DEG;
        var arc2 = arcPath(hitX, hitY, arcR, downAngle, transDirAngle);
        arc2HTML =
          '<path d="' + arc2.d + '" fill="none" stroke="var(--magenta)" stroke-width="2.5"/>' +
          '<text x="' + (hitX + (arcR + 26) * Math.cos(arc2.midDeg * DEG)).toFixed(2) + '" y="' +
          (hitY + (arcR + 26) * Math.sin(arc2.midDeg * DEG)).toFixed(2) +
          '" fill="var(--magenta-fg)" font-family="var(--font)" font-weight="800" font-size="15" text-anchor="middle">θ₂</text>';
      } else {
        var reflAngle = Math.atan2(-cosT1, sinT1) / DEG;
        var arc2r = arcPath(hitX, hitY, arcR, upAngle, reflAngle);
        arc2HTML =
          '<path d="' + arc2r.d + '" fill="none" stroke="var(--yellow)" stroke-width="2.5"/>' +
          '<text x="' + (hitX + (arcR + 26) * Math.cos(arc2r.midDeg * DEG)).toFixed(2) + '" y="' +
          (hitY + (arcR + 26) * Math.sin(arc2r.midDeg * DEG)).toFixed(2) +
          '" fill="var(--yellow-fg)" font-family="var(--font)" font-weight="800" font-size="15" text-anchor="middle">θ₁</text>';
      }

      svg.innerHTML =
        // interface (เส้นแบ่งตัวกลาง)
        '<line x1="40" y1="' + hitY + '" x2="660" y2="' + hitY + '" stroke="var(--ink)" stroke-width="3"/>' +
        // normal (เส้นแนวฉาก ปะ)
        '<line x1="' + hitX + '" y1="40" x2="' + hitX + '" y2="530" stroke="var(--ink)" stroke-width="2.5" stroke-dasharray="9 8" opacity="0.55"/>' +
        // media labels
        '<text x="66" y="76" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="16" opacity="0.75">ตัวกลาง 1 · n₁ = ' + vals.n1.toFixed(2) + '</text>' +
        '<text x="66" y="512" fill="var(--ink)" font-family="var(--font)" font-weight="800" font-size="16" opacity="0.75">ตัวกลาง 2 · n₂ = ' + vals.n2.toFixed(2) + '</text>' +
        // incident ray
        '<path d="' + incidentD + '" fill="none" stroke="var(--cyan)" stroke-width="5" stroke-linecap="round"/>' +
        '<polygon points="' + incidentArrow + '" fill="var(--cyan)"/>' +
        // second ray (refracted or reflected)
        '<path d="' + secondRayD + '" fill="none" stroke="' + secondColorVar + '" stroke-width="5" stroke-linecap="round"/>' +
        '<polygon points="' + secondArrow + '" fill="' + secondColorVar + '"/>' +
        // hit point marker
        '<circle cx="' + hitX + '" cy="' + hitY + '" r="6" fill="var(--ink)"/>' +
        // angle arcs
        '<path d="' + arc1.d + '" fill="none" stroke="var(--cyan)" stroke-width="2.5"/>' +
        '<text x="' + (hitX + (arcR + 26) * Math.cos(arc1.midDeg * DEG)).toFixed(2) + '" y="' +
        (hitY + (arcR + 26) * Math.sin(arc1.midDeg * DEG)).toFixed(2) +
        '" fill="var(--cyan-fg)" font-family="var(--font)" font-weight="800" font-size="15" text-anchor="middle">θ₁</text>' +
        arc2HTML +
        tirLabel;

      onUpdate(vals);
    }

    function setAngle(a) {
      state.angle = clamp(a, angleRange[0], angleRange[1]);
      render();
    }

    function setN1(n) {
      state.n1 = n;
      render();
    }

    function setN2(n) {
      state.n2 = n;
      render();
    }

    function reset() {
      state.angle = defaults.angle;
      state.n1 = defaults.n1;
      state.n2 = defaults.n2;
      render();
    }

    render();

    return {
      setAngle: setAngle,
      setN1: setN1,
      setN2: setN2,
      reset: reset,
      destroy: function () {}
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.refraction = { create: create };
})();
