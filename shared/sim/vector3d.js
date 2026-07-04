/* shared/sim/vector3d.js — เวกเตอร์ 3 มิติ หมุนดูได้ ด้วยโมเดลมือขวา 3D (Three.js)
   ใช้ผ่าน window.SimPatterns.vector3d.create(container, options)
   container ต้องมี class "sim-zone" อยู่แล้ว (โครงหน้าเป็นคนใส่) — module นี้เติมแค่ <canvas> + legend/reset ข้างใน
   generic: ไม่รู้เรื่องฟิสิกส์/สูตร — หน้าเรื่อง (topic page) เป็นคนคำนวณ cross product/สูตร แล้วสั่ง orient/label ผ่าน API นี้
   ใช้ design token เท่านั้น (สี resolve จาก CSS custom property ตอน runtime) ห้ามฝัง hex ตรงๆ
   ต้องโหลด shared/vendor/three.min.js ก่อนไฟล์นี้ */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    throw new Error('vector3d.js ต้องโหลด shared/vendor/three.min.js ก่อน');
  }

  var UP = new THREE.Vector3(0, 1, 0);

  /* ---------- resolve CSS custom property (รองรับ oklch/color-mix ผ่าน canvas 2D) ---------- */
  var resolveCanvas = document.createElement('canvas');
  resolveCanvas.width = 1;
  resolveCanvas.height = 1;
  var resolveCtx = resolveCanvas.getContext('2d');
  var resolveCache = {};

  function resolveVarToHex(varName, fallbackHex) {
    if (resolveCache[varName] != null) return resolveCache[varName];
    var raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    var hex = fallbackHex;
    if (raw) {
      try {
        resolveCtx.fillStyle = '#000';
        resolveCtx.fillStyle = raw;
        resolveCtx.fillRect(0, 0, 1, 1);
        var d = resolveCtx.getImageData(0, 0, 1, 1).data;
        hex = (d[0] << 16) | (d[1] << 8) | d[2];
      } catch (e) { /* fall back */ }
    }
    resolveCache[varName] = hex;
    return hex;
  }

  function hexToRgba(hex, alpha) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ---------- geometry helpers ---------- */
  function boxWithEdges(handMat, edgeMat, w, h, d) {
    var g = new THREE.Group();
    var geo = new THREE.BoxGeometry(w, h, d);
    var mesh = new THREE.Mesh(geo, handMat);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    g.add(mesh, edges);
    return g;
  }

  function buildLoop(radius, cx, full, colorHex) {
    var group = new THREE.Group();
    var segs = full ? 56 : 28;
    var aMax = full ? Math.PI * 2 : Math.PI / 2;
    var pts = [];
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * aMax;
      pts.push(new THREE.Vector3(cx, radius * Math.cos(a), radius * Math.sin(a)));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: colorHex });
    group.add(new THREE.Line(geo, mat));
    var headMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    var angles = full ? [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2] : [aMax];
    angles.forEach(function (a) {
      var pos = new THREE.Vector3(cx, radius * Math.cos(a), radius * Math.sin(a));
      var tangent = new THREE.Vector3(0, -Math.sin(a), Math.cos(a)).normalize();
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.17, 10), headMat);
      cone.position.copy(pos);
      cone.quaternion.setFromUnitVectors(UP, tangent);
      group.add(cone);
    });
    return group;
  }

  function makeArrow(colorHex) {
    var group = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.12 });
    var shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
    shaftGeo.translate(0, 0.5, 0);
    var shaft = new THREE.Mesh(shaftGeo, mat);
    var head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 12), mat);
    group.add(shaft, head);
    group.userData.setLength = function (len) {
      var shaftLen = Math.max(len - 0.22, 0.001);
      shaft.scale.y = shaftLen;
      head.position.y = shaftLen;
    };
    group.userData.setLength(1);
    return group;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeTextSprite(bgRgba) {
    var canvasEl = document.createElement('canvas');
    canvasEl.width = 220;
    canvasEl.height = 110;
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    sprite.userData.canvas = canvasEl;
    sprite.userData.bg = bgRgba;
    sprite.scale.set(0.85, 0.42, 1);
    return sprite;
  }

  function updateTextSprite(sprite, text, colorHex) {
    var c = sprite.userData.canvas;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = sprite.userData.bg;
    roundRect(ctx, 6, 18, c.width - 12, c.height - 36, 16);
    ctx.fill();
    ctx.font = '900 58px "Montserrat", sans-serif';
    ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    sprite.material.map = tex;
    sprite.material.needsUpdate = true;
  }

  /* ===================== FACTORY ===================== */
  function create(container, options) {
    options = options || {};
    var reducedMotion = options.reducedMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var COLORS = {
      thumb: resolveVarToHex('--magenta', 0xF0665B),
      fingers: resolveVarToHex('--cyan', 0x4FC3C3),
      palm: resolveVarToHex('--yellow', 0xE8A33D),
      hand: resolveVarToHex('--surface', 0xDCEDF7),
      edge: resolveVarToHex('--ink', 0x0B2545),
      grid: resolveVarToHex('--ink', 0x1E4A72)
    };
    var labelBg = hexToRgba(resolveVarToHex('--surface', 0x0B2545), 0.82);

    container.innerHTML = '';
    var canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    var legend = document.createElement('div');
    legend.className = 'sim-legend';
    legend.style.right = 'var(--space-3)';
    legend.style.left = 'auto';
    legend.textContent = 'ลากเพื่อหมุน · เลื่อนล้อเพื่อซูม';
    container.appendChild(legend);

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'sim-legend';
    resetBtn.textContent = 'รีเซ็ตมุมมอง';
    resetBtn.style.left = 'var(--space-3)';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.border = 'var(--border-w-sm) solid var(--ink)';
    container.appendChild(resetBtn);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    var target = new THREE.Vector3(0, 0.7, 0);
    var DEFAULT_SPHERICAL = { radius: 6.2, theta: THREE.MathUtils.degToRad(35), phi: THREE.MathUtils.degToRad(62) };
    var spherical = { radius: DEFAULT_SPHERICAL.radius, theta: DEFAULT_SPHERICAL.theta, phi: DEFAULT_SPHERICAL.phi };

    function updateCamera() {
      var s = spherical;
      s.phi = Math.max(0.35, Math.min(Math.PI - 0.35, s.phi));
      s.radius = Math.max(3.2, Math.min(9.5, s.radius));
      var x = s.radius * Math.sin(s.phi) * Math.sin(s.theta);
      var y = s.radius * Math.cos(s.phi);
      var z = s.radius * Math.sin(s.phi) * Math.cos(s.theta);
      camera.position.set(x + target.x, y + target.y, z + target.z);
      camera.lookAt(target);
    }
    updateCamera();

    function resize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (w < 10 || h < 10) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    var dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      spherical.theta -= dx * 0.0065;
      spherical.phi -= dy * 0.0065;
      updateCamera();
    });
    window.addEventListener('pointerup', function () { dragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      spherical.radius += e.deltaY * 0.0022 * spherical.radius;
      updateCamera();
    }, { passive: false });

    resetBtn.addEventListener('click', function () {
      spherical.radius = DEFAULT_SPHERICAL.radius;
      spherical.theta = DEFAULT_SPHERICAL.theta;
      spherical.phi = DEFAULT_SPHERICAL.phi;
      updateCamera();
    });

    scene.add(new THREE.AmbientLight(0xbfe0f2, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(3.2, 4.5, 3.6);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x8fd2ff, 0.35);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    var grid = new THREE.GridHelper(10, 20, COLORS.grid, COLORS.grid);
    grid.position.y = -0.98;
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    scene.add(grid);

    /* ---------- hand geometry ---------- */
    var handMat = new THREE.MeshStandardMaterial({ color: COLORS.hand, roughness: 0.55, metalness: 0.06 });
    var edgeMat = new THREE.LineBasicMaterial({ color: COLORS.edge });

    var handRoot = new THREE.Group();
    handRoot.position.set(0, 0.35, 0);
    scene.add(handRoot);

    var palm = boxWithEdges(handMat, edgeMat, 1.05, 1.3, 0.26);
    handRoot.add(palm);

    var FINGER_XS = [-0.42, -0.15, 0.14, 0.42];
    var fingerParts = FINGER_XS.map(function (x) {
      var base = new THREE.Group();
      base.position.set(x, 0.65, 0.0);
      var len1 = 0.42, len2 = 0.30, w = 0.16;
      var seg1 = boxWithEdges(handMat, edgeMat, w, len1, w);
      seg1.position.y = len1 / 2;
      base.add(seg1);
      var joint2 = new THREE.Group();
      joint2.position.y = len1;
      base.add(joint2);
      var seg2 = boxWithEdges(handMat, edgeMat, w * 0.82, len2, w * 0.82);
      seg2.position.y = len2 / 2;
      joint2.add(seg2);
      handRoot.add(base);
      return { base: base, joint2: joint2 };
    });

    var thumbGroup = new THREE.Group();
    thumbGroup.position.set(0.5, -0.38, 0.15);
    var thumbBox = boxWithEdges(handMat, edgeMat, 0.58, 0.22, 0.22);
    thumbBox.position.x = 0.29;
    thumbGroup.add(thumbBox);
    handRoot.add(thumbGroup);

    var currentCurl = 0, targetCurl = 0;
    function applyCurl(t) {
      var a1 = THREE.MathUtils.degToRad(78) * t;
      var a2 = THREE.MathUtils.degToRad(96) * t;
      fingerParts.forEach(function (f) { f.base.rotation.x = a1; f.joint2.rotation.x = a2; });
    }
    applyCurl(0);

    var arrowThumb = makeArrow(COLORS.thumb);
    arrowThumb.quaternion.setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0));
    arrowThumb.position.set(0.5, -0.38, 0.15);
    arrowThumb.userData.setLength(1.2);
    handRoot.add(arrowThumb);
    var labelThumb = makeTextSprite(labelBg);
    labelThumb.position.set(1.85, -0.38, 0.15);
    handRoot.add(labelThumb);

    var arrowFingers = makeArrow(COLORS.fingers);
    arrowFingers.position.set(0, 0.65, 0);
    arrowFingers.userData.setLength(1.55);
    handRoot.add(arrowFingers);
    var labelFingers = makeTextSprite(labelBg);
    labelFingers.position.set(0, 2.35, 0);
    handRoot.add(labelFingers);

    var arrowPalm = makeArrow(COLORS.palm);
    var palmBaseQuat = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0, 0, 1));
    var palmFlipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    arrowPalm.quaternion.copy(palmBaseQuat);
    arrowPalm.position.set(0, 0.05, 0.15);
    arrowPalm.userData.setLength(1.1);
    handRoot.add(arrowPalm);
    var labelPalm = makeTextSprite(labelBg);
    labelPalm.position.set(0, 0.05, 1.4);
    handRoot.add(labelPalm);

    var circleLoop = buildLoop(0.62, 0.55, true, COLORS.fingers);
    handRoot.add(circleLoop);
    var labelCircle = makeTextSprite(labelBg);
    labelCircle.position.set(0.55, 0.62, 0.7);
    handRoot.add(labelCircle);

    var arc = buildLoop(0.5, 0.0, false, COLORS.thumb);
    handRoot.add(arc);

    var targetQuaternion = new THREE.Quaternion();

    /* ---------- public API ---------- */
    function setBasis(X, Y, Z) {
      var basis = new THREE.Matrix4().makeBasis(X, Y, Z);
      targetQuaternion.setFromRotationMatrix(basis);
    }

    function setCurl(t) { targetCurl = t; }

    var LABEL_MAP = { thumb: labelThumb, fingers: labelFingers, palm: labelPalm, circle: labelCircle };
    var COLOR_MAP = { thumb: COLORS.thumb, fingers: COLORS.fingers, palm: COLORS.palm, circle: COLORS.fingers };
    function setLabel(part, text) {
      var sprite = LABEL_MAP[part];
      if (sprite) updateTextSprite(sprite, text, COLOR_MAP[part]);
    }

    var VISIBLE_MAP = { palm: [arrowPalm, labelPalm], fingers: [arrowFingers, labelFingers], circle: [circleLoop, labelCircle], arc: [arc] };
    function setVisible(part, visible) {
      var objs = VISIBLE_MAP[part];
      if (objs) objs.forEach(function (o) { o.visible = visible; });
    }

    function setPalmFlip(flip) {
      arrowPalm.quaternion.copy(palmBaseQuat);
      labelPalm.position.set(0, 0.05, 1.4);
      if (flip) {
        arrowPalm.quaternion.multiply(palmFlipQuat);
        labelPalm.position.set(0, 0.05, -1.4);
      }
    }

    function resetView() {
      spherical.radius = DEFAULT_SPHERICAL.radius;
      spherical.theta = DEFAULT_SPHERICAL.theta;
      spherical.phi = DEFAULT_SPHERICAL.phi;
      updateCamera();
    }

    var rafId = null;
    function animate() {
      rafId = requestAnimationFrame(animate);
      var rs = reducedMotion ? 1 : 0.11;
      handRoot.quaternion.slerp(targetQuaternion, rs);
      currentCurl += (targetCurl - currentCurl) * 0.16;
      applyCurl(currentCurl);
      renderer.render(scene, camera);
    }

    function onWindowResize() { resize(); }
    window.addEventListener('resize', onWindowResize);
    resize();
    setTimeout(resize, 60);
    animate();

    return {
      setBasis: setBasis,
      setCurl: setCurl,
      setLabel: setLabel,
      setVisible: setVisible,
      setPalmFlip: setPalmFlip,
      resetView: resetView,
      resize: resize,
      destroy: function () {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onWindowResize);
        renderer.dispose();
      }
    };
  }

  window.SimPatterns = window.SimPatterns || {};
  window.SimPatterns.vector3d = { create: create };
})();
