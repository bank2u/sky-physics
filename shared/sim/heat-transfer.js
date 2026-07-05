/* shared/sim/heat-transfer.js — การถ่ายโอนความร้อน 2 กลไก: การนำ (conduction) และ การพา (convection)
   ใช้ผ่าน window.SimPatterns.heatTransfer.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)/var(--accent-tertiary)/var(--surface)/var(--font))
   ห้ามฝัง hex ตรงๆ — ใช้ color-mix(in oklab, ...) ผสมสีร้อน/เย็นจาก token เดิม

   โมเดลฟิสิกส์ (ม.ต้น เน้นภาพกลไก ไม่เน้นสูตรคำนวณ):
   - การนำ (conduction): แท่งโลหะจำลองเป็นแลตทิซอนุภาค 1 มิติ (N จุด) จุดปลายร้อน (sourceTemp) และปลายเย็น (targetTemp)
     ถูกตรึงเป็น "แหล่งพลังงาน/แหล่งรับพลังงาน" คงที่ ส่วนภายในกระจายพลังงานแบบ neighbor-to-neighbor ทุก frame
     ด้วยสมการแพร่ความร้อนไม่ต่อเนื่อง (explicit finite difference: dT/dt ∝ T[i-1] - 2T[i] + T[i+1]) ทำให้เห็นอุณหภูมิ
     ไล่ระดับจากปลายร้อนไปปลายเย็นทีละน้อยจนเข้าใกล้ steady state (เส้นตรง) — อุณหภูมิของแต่ละจุดกำหนดแอมพลิจูด/ความเร็ว
     การสั่นของอนุภาคที่จุดนั้น (สั่นแรง=ร้อน, สั่นแผ่ว=เย็น) และสีของอนุภาค
   - การพา (convection): ภาชนะของไหลจำลองด้วยอนุภาคอิสระจำนวนมาก แหล่งความร้อนอยู่ล่าง (sourceTemp) จุดเย็น/ผนังบน
     อยู่บน (targetTemp) อนุภาคที่อยู่ใกล้แหล่งความร้อนจะร้อนขึ้น (ความหนาแน่นลด) เกิดแรงลอยตัว (buoyancy) ∝ ผลต่าง
     อุณหภูมิ ดันขึ้น ส่วนที่อยู่ใกล้ผนังบนจะเย็นลงและจมลง แรงลอยตัวรวมกับการไหลเข้า-ออกทางแนวราบทำให้เกิดวงหมุนเวียน
     (convection current) 2 วงซ้าย-ขวา ตามแบบฉบับการสอน */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---- geometry คงที่ (viewBox 700x570 เหมือน pattern อื่นในคลัง) ---- */
  var VB_W = 700, VB_H = 570;
  var ROD_X0 = 60, ROD_X1 = 640, ROD_Y = 285, ROD_H = 140;
  var N_NODES = 14;      // จำนวนจุดแลตทิซตามความยาวแท่ง (การนำ)
  var N_ROWS = 4;        // จำนวนแถวอนุภาคต่อจุด (การนำ)
  var DIFFUSE_K = 3.2;   // สัมประสิทธิ์การแพร่ความร้อนจำลอง (ปรับให้เห็นการไล่ระดับใน scale เวลาสมจริงบนจอ)

  var BOX_X0 = 110, BOX_X1 = 590, BOX_Y0 = 70, BOX_Y1 = 500;
  var N_PARTICLES = 90;  // จำนวนอนุภาคของไหล (การพา)
  var SRC_BAND_H = 46;   // แถบแหล่งความร้อนที่ก้นภาชนะ
  var SINK_BAND_H = 46;  // แถบเย็นที่ผิวบนภาชนะ

  function tempColor(t, tMin, tMax) {
    // เย็น -> var(--accent-primary) (cyan) , ร้อน -> var(--accent-secondary) (magenta)
    var frac = clamp((t - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
    var pct = (frac * 100).toFixed(0);
    return 'color-mix(in oklab, var(--accent-secondary) ' + pct + '%, var(--accent-primary))';
  }

  function rateLabel(deltaT) {
    var d = Math.abs(deltaT);
    if (d >= 45) return 'เร็วมาก';
    if (d >= 22) return 'ปานกลาง';
    return 'ช้า';
  }

  function create(container, options) {
    options = options || {};
    var sourceRange = options.sourceRange || [20, 100];
    var targetRange = options.targetRange || [0, 40];
    var onUpdate = options.onUpdate || function () {};

    var state = {
      mode: options.mode === 'convection' ? 'convection' : 'conduction',
      sourceTemp: clamp(options.sourceTemp != null ? options.sourceTemp : 80, sourceRange[0], sourceRange[1]),
      targetTemp: clamp(options.targetTemp != null ? options.targetTemp : 20, targetRange[0], targetRange[1])
    };

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VB_W + ' ' + VB_H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--secondary';
    container.appendChild(legend);

    /* ---- สถานะการนำ: อุณหภูมิของ N_NODES จุดตามแนวแท่ง ---- */
    var rodTemps = new Array(N_NODES);
    var rodPhase = new Array(N_NODES);
    (function initRod() {
      for (var i = 0; i < N_NODES; i++) {
        var frac = i / (N_NODES - 1);
        rodTemps[i] = lerp(state.sourceTemp, state.targetTemp, frac);
        rodPhase[i] = Math.random() * Math.PI * 2;
      }
    })();

    function stepRodDiffusion(dt) {
      rodTemps[0] = state.sourceTemp;
      rodTemps[N_NODES - 1] = state.targetTemp;
      var next = rodTemps.slice();
      for (var i = 1; i < N_NODES - 1; i++) {
        var lap = rodTemps[i - 1] - 2 * rodTemps[i] + rodTemps[i + 1];
        next[i] = rodTemps[i] + DIFFUSE_K * lap * dt;
      }
      rodTemps = next;
    }

    /* ---- สถานะการพา: อนุภาคของไหลอิสระ ---- */
    var fluid = [];
    (function initFluid() {
      for (var i = 0; i < N_PARTICLES; i++) {
        fluid.push({
          x: lerp(BOX_X0 + 20, BOX_X1 - 20, Math.random()),
          y: lerp(BOX_Y0 + 20, BOX_Y1 - 20, Math.random()),
          vx: 0, vy: 0,
          temp: lerp(state.targetTemp, state.sourceTemp, Math.random())
        });
      }
    })();

    function stepFluid(dt) {
      var midX = (BOX_X0 + BOX_X1) / 2;
      var ambient = (state.sourceTemp + state.targetTemp) / 2;
      var buoyancyK = 34;
      for (var i = 0; i < fluid.length; i++) {
        var p = fluid[i];

        // ใกล้แหล่งความร้อนที่ก้นภาชนะ -> อุ่นขึ้นเข้าหา sourceTemp
        if (p.y > BOX_Y1 - SRC_BAND_H) {
          p.temp = lerp(p.temp, state.sourceTemp, clamp(dt * 2.2, 0, 1));
        }
        // ใกล้ผิวเย็นด้านบน -> เย็นลงเข้าหา targetTemp
        if (p.y < BOX_Y0 + SINK_BAND_H) {
          p.temp = lerp(p.temp, state.targetTemp, clamp(dt * 2.2, 0, 1));
        }

        // แรงลอยตัว: ร้อนกว่าค่าเฉลี่ย -> ลอยขึ้น (y ลด), เย็นกว่า -> จมลง (y เพิ่ม)
        var buoy = -(p.temp - ambient) * buoyancyK;
        p.vy += buoy * dt;

        // การไหลวน: ล่างดึงเข้ากลาง, บนดันออกขอบ -> เกิด 2 วงหมุนซ้าย-ขวา
        var vertFrac = clamp((p.y - BOX_Y0) / (BOX_Y1 - BOX_Y0), 0, 1); // 0 บน .. 1 ล่าง
        var side = p.x < midX ? -1 : 1;
        var circulate = lerp(18, -18, vertFrac) * side * -1;
        p.vx += circulate * dt;

        // แรงหน่วง กันความเร็วพุ่งไม่จำกัด
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.vx = clamp(p.vx, -70, 70);
        p.vy = clamp(p.vy, -70, 70);

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // ผนังภาชนะ: สะท้อนกลับ
        if (p.x < BOX_X0 + 12) { p.x = BOX_X0 + 12; p.vx *= -0.5; }
        if (p.x > BOX_X1 - 12) { p.x = BOX_X1 - 12; p.vx *= -0.5; }
        if (p.y < BOX_Y0 + 12) { p.y = BOX_Y0 + 12; p.vy *= -0.5; }
        if (p.y > BOX_Y1 - 12) { p.y = BOX_Y1 - 12; p.vy *= -0.5; }
      }
    }

    function computeValues() {
      var deltaT = state.sourceTemp - state.targetTemp;
      var midTemp;
      if (state.mode === 'conduction') {
        midTemp = rodTemps[Math.floor(N_NODES / 2)];
      } else {
        var sum = 0;
        for (var i = 0; i < fluid.length; i++) sum += fluid[i].temp;
        midTemp = sum / fluid.length;
      }
      return {
        mode: state.mode,
        sourceTemp: state.sourceTemp,
        targetTemp: state.targetTemp,
        deltaT: deltaT,
        midTemp: midTemp,
        rateLabel: rateLabel(deltaT)
      };
    }

    function renderConduction() {
      var tMin = Math.min(sourceRange[0], targetRange[0]);
      var tMax = Math.max(sourceRange[1], targetRange[1]);
      var parts = [];
      parts.push(
        '<rect x="' + (ROD_X0 - 18) + '" y="' + (ROD_Y - ROD_H / 2 - 18) + '" width="' + (ROD_X1 - ROD_X0 + 36) +
        '" height="' + (ROD_H + 36) + '" rx="18" fill="var(--surface)" stroke="var(--ink)" stroke-width="5"/>'
      );
      parts.push(
        '<text x="' + ROD_X0 + '" y="' + (ROD_Y - ROD_H / 2 - 32) + '" style="font:800 var(--fs-label) var(--font);fill:var(--ink);opacity:.6">แท่งโลหะ — จุดสี = โมเลกุล ยิ่งสั่นแรง = ยิ่งร้อน</text>'
      );

      for (var i = 0; i < N_NODES; i++) {
        var frac = i / (N_NODES - 1);
        var cx = lerp(ROD_X0, ROD_X1, frac);
        var t = rodTemps[i];
        var tNorm = clamp((t - tMin) / (tMax - tMin), 0, 1);
        var amp = 2 + tNorm * 12;
        var color = tempColor(t, tMin, tMax);
        for (var r = 0; r < N_ROWS; r++) {
          var rowFrac = N_ROWS === 1 ? 0.5 : r / (N_ROWS - 1);
          var cy = lerp(ROD_Y - ROD_H / 2 + 14, ROD_Y + ROD_H / 2 - 14, rowFrac);
          var ph = rodPhase[i] + r * 1.7;
          var dx = Math.sin(ph) * amp;
          var dy = Math.cos(ph * 1.3) * amp * 0.6;
          parts.push(
            '<circle cx="' + (cx + dx).toFixed(1) + '" cy="' + (cy + dy).toFixed(1) + '" r="12" fill="' + color +
            '" stroke="var(--ink)" stroke-width="2.5"/>'
          );
        }
      }

      parts.push(
        '<text x="' + ROD_X0 + '" y="' + (ROD_Y - ROD_H / 2 - 8) + '" style="font:900 15px var(--font);fill:var(--ink)">ร้อน</text>' +
        '<text x="' + (ROD_X1 - 34) + '" y="' + (ROD_Y - ROD_H / 2 - 8) + '" style="font:900 15px var(--font);fill:var(--ink)">เย็น</text>'
      );

      svg.innerHTML = parts.join('');
    }

    function renderConvection() {
      var tMin = Math.min(sourceRange[0], targetRange[0]);
      var tMax = Math.max(sourceRange[1], targetRange[1]);
      var parts = [];
      parts.push(
        '<rect x="' + BOX_X0 + '" y="' + BOX_Y0 + '" width="' + (BOX_X1 - BOX_X0) + '" height="' + (BOX_Y1 - BOX_Y0) +
        '" rx="14" fill="var(--surface)" stroke="var(--ink)" stroke-width="5"/>'
      );
      parts.push(
        '<rect x="' + (BOX_X0 + 3) + '" y="' + (BOX_Y0 + 3) + '" width="' + (BOX_X1 - BOX_X0 - 6) + '" height="' + SINK_BAND_H +
        '" fill="var(--accent-primary)" opacity="0.16"/>'
      );
      parts.push(
        '<rect x="' + (BOX_X0 + 3) + '" y="' + (BOX_Y1 - SRC_BAND_H - 3) + '" width="' + (BOX_X1 - BOX_X0 - 6) + '" height="' + SRC_BAND_H +
        '" fill="var(--accent-secondary)" opacity="0.22"/>'
      );
      parts.push(
        '<text x="' + (BOX_X0 + 14) + '" y="' + (BOX_Y0 + 26) + '" style="font:800 13px var(--font);fill:var(--ink);opacity:.65">เย็น (ผิวบน)</text>' +
        '<text x="' + (BOX_X0 + 14) + '" y="' + (BOX_Y1 - 16) + '" style="font:800 13px var(--font);fill:var(--ink);opacity:.7">แหล่งความร้อน (ก้นภาชนะ)</text>'
      );

      for (var i = 0; i < fluid.length; i++) {
        var p = fluid[i];
        var color = tempColor(p.temp, tMin, tMax);
        var r = 6 + clamp((p.temp - tMin) / (tMax - tMin), 0, 1) * 4;
        parts.push(
          '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + color +
          '" stroke="var(--ink)" stroke-width="1.5" opacity="0.92"/>'
        );
      }

      svg.innerHTML = parts.join('');
    }

    function render() {
      legend.textContent = state.mode === 'conduction'
        ? 'สีจุด: น้ำเงิน = เย็น · ชมพู = ร้อน · แอมพลิจูดการสั่น ∝ อุณหภูมิ'
        : 'สีจุด: น้ำเงิน = เย็น · ชมพู = ร้อน · ลูกศรวงกลม = กระแสพาความร้อน';
      if (state.mode === 'conduction') renderConduction(); else renderConvection();
    }

    var lastTs = null;
    var rafId = null;
    function tick(ts) {
      if (lastTs == null) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      for (var i = 0; i < N_NODES; i++) rodPhase[i] += (2 + rodTemps[i] / 12) * dt;
      if (state.mode === 'conduction') {
        stepRodDiffusion(dt);
      } else {
        stepFluid(dt);
      }
      render();
      onUpdate(computeValues());
      rafId = requestAnimationFrame(tick);
    }

    function notify() { onUpdate(computeValues()); }

    function setSourceTemp(v) { state.sourceTemp = clamp(v, sourceRange[0], sourceRange[1]); notify(); }
    function setTargetTemp(v) { state.targetTemp = clamp(v, targetRange[0], targetRange[1]); notify(); }
    function setMode(m) {
      state.mode = m === 'convection' ? 'convection' : 'conduction';
      render();
      notify();
    }

    render();
    notify();
    rafId = requestAnimationFrame(tick);

    return {
      setSourceTemp: setSourceTemp,
      setTargetTemp: setTargetTemp,
      setMode: setMode,
      getMode: function () { return state.mode; },
      destroy: function () { if (rafId) cancelAnimationFrame(rafId); }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.heatTransfer = { create: create };
})();
