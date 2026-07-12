/* shared/sim/sound-wave.js — คลื่นเสียง (longitudinal wave): โมเลกุลอากาศอัด-ขยายตัว + กราฟความดันเทียบตำแหน่ง + เสียงจริงผ่าน Web Audio API
   ใช้ผ่าน window.SimPatterns.soundWave.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ SVG + legend ข้างใน
   วาดด้วย design token เท่านั้น (var(--ink)/var(--accent-primary)/var(--accent-secondary)) ห้ามฝัง hex ตรงๆ

   โครง 2 แผงในผืนเดียว (เหมือน wave-interference.js):
   - แผงบน: จุด (โมเลกุลอากาศ) เรียงเป็นตาราง สั่น "ซ้าย-ขวา" ตามแนวแกน x เท่านั้น (longitudinal ไม่ใช่ transverse)
     ทำให้เกิดบริเวณจุดชิดกัน (compression) และห่างกัน (rarefaction) สลับกันเอง จากรูปทรงเรขาคณิตล้วนๆ (ไม่ต้องคำนวณ density แยก)
   - แผงล่าง: กราฟความดันสัมพัทธ์เทียบตำแหน่ง (sine-style) ที่ x ตรงกับแผงบนเป๊ะ (ใช้แกน x ร่วมกัน) เพื่อให้เห็นว่า
     กราฟ sine ในหนังสือ = ความดัน ไม่ใช่ตำแหน่งของอากาศ — คำนวณจาก p(x,t) = -cos(kx - wt) (derivative ของ displacement sin)

   หมายเหตุมาตราส่วน (สำคัญสำหรับครู): ความถี่จริงที่ปรับ (Hz) ถูก scale ลงเป็น "ความถี่ภาพเคลื่อนไหว" (VFREQ_SCALE)
   เพื่อให้ตาเห็นการสั่นได้ (440 Hz จริงเร็วเกินจะเห็นด้วยตา) แต่ความสัมพันธ์ผกผัน f-λ ยังคงถูกต้อง (ยิ่งความถี่สูง แถบอัดตัวยิ่งถี่)
   เสียงจริงที่ได้ยินใช้ความถี่จริงตรงๆ ผ่าน OscillatorNode ไม่ผ่านการ scale นี้

   หมายเหตุ theme: ใช้ var(--token) ตรงในแอตทริบิวต์ SVG (ไม่ resolve เป็น hex ใน JS เหมือน vector3d.js) จึงไม่ต้องฟัง
   sky-physic:themechange — browser recompute custom property ให้เองทุกครั้งที่ re-render (redraw ทุกเฟรมอยู่แล้ว) */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function create(container, options) {
    options = options || {};
    var freqRange = options.freqRange || [100, 1000];
    var ampRange = options.ampRange || [0, 100];
    var onUpdate = options.onUpdate || function () {};

    var state = {
      freq: clamp(options.freq != null ? options.freq : 440, freqRange[0], freqRange[1]),
      amp: clamp(options.amp != null ? options.amp : 50, ampRange[0], ampRange[1]),
      t: 0,
      soundOn: false
    };
    var REF_FREQ = state.freq; // baseline สำหรับ "ความยาวคลื่นสัมพัทธ์" (เทียบกับความถี่เริ่มต้น)

    /* ---- ค่าคงที่ของภาพ (ออกแบบเพื่อความชัดเจนบนจอ ไม่ใช่ตัวแปรที่ปรับได้) ---- */
    var TUBE_X0 = 40, TUBE_W = 620, TUBE_Y0 = 58, TUBE_H = 210;
    var COLS = 70, ROWS = 9;
    var COL_SPACING = TUBE_W / COLS;
    var ROW_SPACING = TUBE_H / ROWS;
    var MAX_DISPLACE_PX = COL_SPACING * 1.3; // ระยะสั่นสูงสุด (px) ที่ amp = 100%
    var V_VIS_PXPS = 200;    // ความเร็วคลื่น "หน่วยจำลอง" (px/s) ของภาพเคลื่อนไหว
    var VFREQ_SCALE = 1 / 220; // scale ความถี่จริง(Hz) -> ความถี่ภาพเคลื่อนไหว(Hz) ให้ตาเห็นการสั่นได้

    var GRAPH_Y0 = 378, GRAPH_H = 140;

    var DOT_R = 4;

    container.innerHTML = '';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 700 560');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'sim-legend sim-legend--primary';
    legend.textContent = 'จุด = โมเลกุลอากาศ (สั่นซ้าย-ขวา) · เส้น = ความดันเทียบตำแหน่ง';
    container.appendChild(legend);

    /* ================= Web Audio ================= */
    var audioCtx = null, oscNode = null, gainNode = null;
    var GAIN_MAX = 0.22; // จำกัดความดังสูงสุดไว้ไม่ให้ดังเกินไปในห้องเรียน

    function ampFrac() {
      return (state.amp - ampRange[0]) / (ampRange[1] - ampRange[0]);
    }

    function targetGain() {
      return ampFrac() * GAIN_MAX;
    }

    function ensureAudio() {
      if (audioCtx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      oscNode = audioCtx.createOscillator();
      oscNode.type = 'sine';
      oscNode.frequency.value = state.freq;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      oscNode.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscNode.start();
    }

    function applyAudioFreq() {
      if (!audioCtx) return;
      oscNode.frequency.setValueAtTime(state.freq, audioCtx.currentTime);
    }

    function applyAudioGainIfOn() {
      if (!audioCtx || !state.soundOn) return;
      var now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(targetGain(), now + 0.05);
    }

    function playSound() {
      ensureAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      state.soundOn = true;
      applyAudioFreq();
      var now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(targetGain(), now + 0.05);
      render();
    }

    function stopSound() {
      state.soundOn = false;
      if (audioCtx) {
        var now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
      }
      render();
    }

    function toggleSound() {
      if (state.soundOn) stopSound(); else playSound();
    }

    /* ================= ภาพเคลื่อนไหว ================= */
    function computeVisual() {
      var visualFreq = state.freq * VFREQ_SCALE;
      var lambdaPx = V_VIS_PXPS / visualFreq;
      var k = (2 * Math.PI) / lambdaPx;
      var w = 2 * Math.PI * visualFreq;
      var ampPx = ampFrac() * MAX_DISPLACE_PX;
      return { k: k, w: w, ampPx: ampPx };
    }

    function moleculesSvg(vals) {
      var out = '';
      for (var r = 0; r < ROWS; r++) {
        var y = TUBE_Y0 + (r + 0.5) * ROW_SPACING;
        for (var c = 0; c < COLS; c++) {
          var xRel = (c + 0.5) * COL_SPACING;
          var dx = vals.ampPx * Math.sin(vals.k * xRel - vals.w * state.t);
          var x = TUBE_X0 + xRel + dx;
          out += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + DOT_R +
            '" fill="var(--accent-primary)"/>';
        }
      }
      return out;
    }

    function pressurePathD(vals) {
      var N = 140;
      var d = '';
      var graphAmp = (GRAPH_H / 2 - 12) * ampFrac();
      var midY = GRAPH_Y0 + GRAPH_H / 2;
      for (var i = 0; i <= N; i++) {
        var xRel = (i / N) * TUBE_W;
        var p = -Math.cos(vals.k * xRel - vals.w * state.t);
        var X = TUBE_X0 + xRel;
        var Y = midY - p * graphAmp;
        d += (i === 0 ? 'M ' : 'L ') + X.toFixed(1) + ',' + Y.toFixed(1) + ' ';
      }
      return d;
    }

    function render() {
      var vals = computeVisual();
      var svgContent = '';

      /* ---- แผงบน: โมเลกุลอากาศ ---- */
      svgContent +=
        '<text x="' + TUBE_X0 + '" y="30" style="font:800 var(--fs-label) var(--font);fill:var(--ink);opacity:.6">โมเลกุลอากาศ (LONGITUDINAL WAVE) — สั่นตามแนวคลื่น</text>' +
        '<rect x="' + TUBE_X0 + '" y="' + TUBE_Y0 + '" width="' + TUBE_W + '" height="' + TUBE_H +
        '" fill="none" stroke="var(--ink)" stroke-width="2" opacity="0.35" rx="10"/>' +
        moleculesSvg(vals);

      /* ---- เส้นแบ่งแผง ---- */
      svgContent += '<line x1="20" y1="344" x2="680" y2="344" stroke="var(--ink)" stroke-width="2" stroke-dasharray="2 6" opacity="0.4"/>';

      /* ---- แผงล่าง: กราฟความดัน ---- */
      svgContent +=
        '<text x="' + TUBE_X0 + '" y="370" style="font:800 var(--fs-label) var(--font);fill:var(--ink);opacity:.6">ความดันเทียบตำแหน่ง (PRESSURE vs POSITION)</text>' +
        '<rect x="' + TUBE_X0 + '" y="' + GRAPH_Y0 + '" width="' + TUBE_W + '" height="' + GRAPH_H +
        '" fill="none" stroke="var(--ink)" stroke-width="2" rx="8"/>' +
        '<line x1="' + TUBE_X0 + '" y1="' + (GRAPH_Y0 + GRAPH_H / 2) + '" x2="' + (TUBE_X0 + TUBE_W) + '" y2="' + (GRAPH_Y0 + GRAPH_H / 2) +
        '" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 6" opacity="0.5"/>' +
        '<path d="' + pressurePathD(vals) + '" fill="none" stroke="var(--accent-secondary)" stroke-width="3.5" stroke-linecap="round"/>' +
        '<text x="' + TUBE_X0 + '" y="' + (GRAPH_Y0 + 16) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.6">อัด (P สูง)</text>' +
        '<text x="' + TUBE_X0 + '" y="' + (GRAPH_Y0 + GRAPH_H - 6) + '" fill="var(--ink)" font-family="var(--mono)" font-weight="700" font-size="11" opacity="0.6">ขยาย (P ต่ำ)</text>';

      svg.innerHTML = svgContent;

      onUpdate({
        freq: state.freq,
        amp: state.amp,
        period: 1 / state.freq,
        relLambda: REF_FREQ / state.freq,
        soundOn: state.soundOn
      });
    }

    var timer = null;
    function tick() {
      state.t += 0.016;
      render();
    }

    function setFreq(f) {
      state.freq = clamp(f, freqRange[0], freqRange[1]);
      applyAudioFreq();
      render();
    }

    function setAmp(a) {
      state.amp = clamp(a, ampRange[0], ampRange[1]);
      applyAudioGainIfOn();
      render();
    }

    render();
    timer = setInterval(tick, 16);

    return {
      setFreq: setFreq,
      setAmp: setAmp,
      playSound: playSound,
      stopSound: stopSound,
      toggleSound: toggleSound,
      isSoundOn: function () { return state.soundOn; },
      destroy: function () {
        if (timer) { clearInterval(timer); timer = null; }
        if (audioCtx) {
          try { oscNode.stop(); } catch (e) { /* already stopped */ }
          audioCtx.close();
          audioCtx = null;
        }
      }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.soundWave = { create: create };
})();
