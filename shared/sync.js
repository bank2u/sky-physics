/* shared/sync.js — live classroom sync (browser runtime)
   โหลดโดย layout.js เฉพาะเมื่อ config มี syncUrl: แทน stub window.Sync แล้ว drain คิวที่หน้าเรื่องเรียกไว้ก่อน
   บทบาท: none | teacher | student-follow | student-explore — logic ล้วนอยู่ใน sync-core.js */
(function () {
  var Core = window.SyncCore;
  var layout = window.PhysicsSimLayout || {};
  var baseUrl = (layout.syncUrl || '').replace(/\/+$/, '');
  if (!Core || !baseUrl) return;

  var TEACHER_KEY = 'sky-physic-room';
  var STUDENT_KEY = 'sky-physic-student';
  var CLOSING_KEY = 'sky-physic-room-closing';
  var stub = window.Sync || {};
  var queue = stub._queue || [];

  var params = [];          // [{name, get, set, local}] ตามลำดับที่ประกาศ
  var player = null;
  var cam = null;
  var role = 'none';
  var room = null;          // {code, token?, mode?}
  var ws = null;
  var gen = 0;              // ตัวนับ connection กัน event ของ socket เก่า
  var attempt = 0;
  var reconnectTimer = null;
  var pingTimers = [];
  var pings = {};
  var pingSeq = 0;
  var clock = Core.createClock();
  var latest = null;        // state ล่าสุดจากครู (buffer ของโหมด explore)
  var lastApplied = {};
  var reconnecting = false;
  var notice = null;        // ข้อความสถานะบน bar ของนักเรียน
  var hint = null;          // {id, title} ครูไปเรื่องอื่น (explore)
  var throttles = {};
  var els = {};
  var qrRequested = false;
  var titles = null;

  function readJson(store, key) {
    try { return JSON.parse(store.getItem(key)); } catch (e) { return null; }
  }
  function writeJson(store, key, v) {
    try { store.setItem(key, JSON.stringify(v)); } catch (e) { /* storage ถูกบล็อก */ }
  }
  function drop(store, key) {
    try { store.removeItem(key); } catch (e) { /* ignore */ }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(cls, text, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function pageTopic() { return Core.topicIdFromPath(location.pathname); }
  function findParam(name) {
    for (var i = 0; i < params.length; i++) if (params[i].name === name) return params[i];
    return null;
  }

  /* ---------- public API ---------- */
  var api = {
    param: function (name, def) {
      var p = findParam(name);
      var rec = { name: name, get: def.get, set: def.set, local: !!def.local };
      if (p) params[params.indexOf(p)] = rec; else params.push(rec);
      renderTopbar();
    },
    player: function (def) { player = def; },
    camera: function (def) { cam = def; },
    changed: function (name) {
      if (role !== 'teacher') return;
      if (name === 'play' || name === 'camera') {
        throttled(name, name === 'camera' ? 66 : 50, function () {
          var s = name === 'play' ? { play: readPlay() } : { camera: cam && cam.get() };
          if (s[name]) send({ type: 'patch', state: s });
        });
        return;
      }
      var p = findParam(name);
      if (!p || p.local) return;
      throttled('p:' + name, 50, function () {
        var o = {}; o[name] = p.get();
        send({ type: 'patch', state: { params: o } });
      });
    },
    role: function () { return role; }
  };

  function throttled(key, ms, fn) {
    if (!throttles[key]) {
      var holder = { fn: fn };
      holder.t = Core.createThrottle(function () { holder.fn(); }, ms);
      throttles[key] = holder;
    }
    throttles[key].fn = fn;
    throttles[key].t.call();
  }

  function readPlay() {
    if (!player) return null;
    var p = player.get();
    return { playing: !!p.playing, t: p.t, serverT0: clock.now() };
  }

  /* ---------- connection ---------- */
  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function wsUrl() {
    var u = baseUrl.replace(/^http/, 'ws') + '/rooms/' + room.code + '/ws';
    return room.token ? u + '?t=' + encodeURIComponent(room.token) : u;
  }

  function clearPings() {
    pingTimers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    pingTimers = [];
  }

  function sendPing() {
    var id = ++pingSeq;
    pings[id] = Date.now();
    send({ type: 'ping', id: id });
  }

  function disconnect() {
    gen++;
    clearTimeout(reconnectTimer);
    clearPings();
    reconnecting = false;
    pings = {};
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } ws = null; }
  }

  function connect() {
    disconnect();
    if (!room) return;
    var my = gen;
    var sock;
    try { sock = new WebSocket(wsUrl()); } catch (e) { scheduleReconnect(my); return; }
    ws = sock;
    sock.onopen = function () {
      if (my !== gen) return;
      sendPing();
      pingTimers.push(setTimeout(sendPing, 500), setTimeout(sendPing, 1000));
      pingTimers.push(setInterval(sendPing, 20000));
    };
    sock.onmessage = function (ev) {
      if (my !== gen) return;
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      onMessage(m);
    };
    sock.onclose = function () { if (my === gen) scheduleReconnect(my); };
    sock.onerror = function () { /* onclose ตามมาเสมอ */ };
  }

  function scheduleReconnect(my) {
    if (my !== gen || !room) return;
    clearPings();
    ws = null;
    reconnecting = true;
    renderAll();
    reconnectTimer = setTimeout(connect2, Core.backoffFor(attempt++));
    function connect2() { if (my === gen) { var keep = reconnecting; connect(); reconnecting = keep; } }
  }

  function onMessage(m) {
    if (m.type === 'pong') {
      if (pings[m.id] != null) { clock.addSample(pings[m.id], m.serverNow, Date.now()); delete pings[m.id]; }
    } else if (m.type === 'welcome') {
      attempt = 0;
      reconnecting = false;
      clock.addSample(Date.now(), m.serverNow, Date.now());
      onWelcome(m);
    } else if (m.type === 'state') {
      latest = m.state;
      if (role !== 'teacher') evaluate(false);
    } else if (m.type === 'closed') {
      onClosed(m.reason); // R7: ถือเป็นที่สุด ไม่ต่อใหม่ ไม่รอ server ปิด socket
    }
  }

  function onClosed(reason) {
    var code = room && room.code;
    var wasTeacher = role === 'teacher';
    disconnect();
    room = null;
    latest = null;
    hint = null;
    drop(localStorage, TEACHER_KEY);
    drop(sessionStorage, STUDENT_KEY);
    setRole('none');
    if (!wasTeacher) {
      notice = reason === 'not-found' ? 'ไม่พบห้อง ' + code : 'ครูปิดห้องแล้ว';
    }
    renderAll();
  }

  /* ---------- teacher ---------- */
  function onWelcome(m) {
    if (role === 'teacher') {
      if (m.role !== 'teacher') { onClosed('not-found'); return; } // token ใช้ไม่ได้แล้ว
      var state = {
        topicId: pageTopic(),
        supported: params.length > 0,
        params: {}
      };
      params.forEach(function (p) { if (!p.local) state.params[p.name] = p.get(); });
      var play = readPlay(); if (play) state.play = play;
      if (cam) state.camera = cam.get();
      send({ type: 'patch', state: state });
    } else {
      latest = m.state;
      evaluate(true);
    }
    renderAll();
  }

  function openRoom() {
    els.open.disabled = true;
    fetch(baseUrl + '/rooms', { method: 'POST' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        room = { code: d.code, token: d.teacherToken };
        writeJson(localStorage, TEACHER_KEY, { code: d.code, token: d.teacherToken });
        setRole('teacher');
        notice = null;
        connect();
        renderAll();
        showOverlay();
      })
      .catch(function () {
        els.open.disabled = false;
        notice = 'เปิดห้องไม่สำเร็จ ลองใหม่อีกครั้ง';
        renderAll();
      });
  }

  function closeRoom() {
    if (!room || !room.token) return;
    var rec = { code: room.code, token: room.token };
    disconnect();
    room = null;
    // เก็บ pending close แยกจากห้องที่ active จนกว่า close จะถึง relay จริง
    var list = readClosing().filter(function (x) { return x.code !== rec.code; });
    list.push(rec);
    writeJson(localStorage, CLOSING_KEY, list);
    drop(localStorage, TEACHER_KEY);
    setRole('none');
    hideOverlay();
    renderAll();
    deliverClose(rec, 0);
  }

  function readClosing() {
    var l = readJson(localStorage, CLOSING_KEY);
    return Array.isArray(l) ? l.filter(function (x) { return x && x.code && x.token; }) : [];
  }

  // ส่ง close ผ่าน socket อายุสั้นของตัวเองต่อห้อง; รอ welcome ไม่เกิน 5 วิ; ลองซ้ำตาม backoff
  // สูงสุด 10 ครั้งต่อการโหลดหน้า แล้วทิ้ง entry ไว้ให้หน้าถัดไปลองใหม่
  var closers = {};
  function deliverClose(rec, n) {
    if (closers[rec.code] && n === 0) return;
    if (n >= 10) { delete closers[rec.code]; return; }
    var done = false;
    var sock = null;
    var timer = null;
    closers[rec.code] = true;
    function finish() {
      done = true;
      clearTimeout(timer);
      delete closers[rec.code];
      writeJson(localStorage, CLOSING_KEY, readClosing().filter(function (x) { return x.code !== rec.code; }));
      if (!readClosing().length) drop(localStorage, CLOSING_KEY);
    }
    function shut() { try { sock.close(); } catch (e) { /* ignore */ } }
    function retry() {
      if (done) return;
      clearTimeout(timer);
      done = true; // กัน onclose/timeout ซ้ำ
      shut();
      timer = setTimeout(function () { deliverClose(rec, n + 1); }, Core.backoffFor(n));
    }
    try {
      sock = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/rooms/' + rec.code + '/ws?t=' + encodeURIComponent(rec.token));
    } catch (e) { return retry(); }
    timer = setTimeout(retry, 5000);
    sock.onmessage = function (ev) {
      if (done) return;
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'welcome') {
        if (m.role === 'teacher') sock.send(JSON.stringify({ type: 'close' }));
        finish();
        setTimeout(shut, 300);
      } else if (m.type === 'closed') {
        finish();
        shut();
      }
    };
    sock.onclose = retry;
    sock.onerror = function () { /* onclose ตามมา */ };
  }

  /* ---------- student ---------- */
  function joinRoom(code, mode) {
    room = { code: code, mode: mode || 'follow' };
    writeJson(sessionStorage, STUDENT_KEY, { code: code, mode: room.mode });
    notice = null;
    latest = null;
    lastApplied = {};
    setRole(room.mode === 'explore' ? 'student-explore' : 'student-follow');
    connect();
    renderAll();
  }

  function setMode(mode) {
    room.mode = mode;
    writeJson(sessionStorage, STUDENT_KEY, { code: room.code, mode: mode });
    setRole(Core.nextRole(role, mode));
    evaluate(true);
    renderAll();
  }

  function setRole(r) { role = r; applyLock(); }

  function applyLock() {
    var locked = role === 'student-follow';
    ['.controls', '.sim-zone'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) {
        n.classList.toggle('is-sync-locked', locked);
        if (locked) n.setAttribute('inert', ''); else n.removeAttribute('inert');
      });
    });
  }

  function evaluate(force) {
    var st = latest;
    notice = null;
    hint = null;
    if (!st) return;
    var here = pageTopic();
    if (role === 'student-follow') {
      if (st.topicId && st.topicId !== here) { location.href = '/topics/' + st.topicId + '/'; return; }
      if (st.topicId === null || st.topicId === undefined) notice = 'รอครูเปิดเรื่อง…';
      else if (st.supported === false) notice = 'เรื่องนี้ยังไม่รองรับการดูตามครู';
      else applyState(st, force);
    } else if (role === 'student-explore' && st.topicId && st.topicId !== here) {
      hint = { id: st.topicId, title: st.topicId };
      loadTitle(st.topicId);
    }
    renderAll();
  }

  function applyState(st, force) {
    if (force) lastApplied = {};
    function changed(key, v) {
      var s = JSON.stringify(v);
      if (lastApplied[key] === s) return false;
      lastApplied[key] = s;
      return true;
    }
    var vals = st.params || {};
    params.forEach(function (p) {
      if (!p.local && p.name in vals && changed('p:' + p.name, vals[p.name])) p.set(vals[p.name]);
    });
    if (player && st.play && changed('play', st.play)) {
      player.apply({
        playing: st.play.playing, t: st.play.t,
        elapsedMs: Core.elapsedMs(st.play, clock.now())
      });
    }
    if (cam && st.camera && changed('camera', st.camera)) cam.set(st.camera);
  }

  function loadTitle(id) {
    function done() {
      if (hint && hint.id === id) {
        var t = (titles || []).filter(function (x) { return x.id === id; })[0];
        if (t) { hint.title = t.title; renderBar(); }
      }
    }
    if (titles) return done();
    fetch('/_system/topics.json').then(function (r) { return r.json(); })
      .then(function (d) { titles = d.topics || []; done(); })
      .catch(function () { titles = []; });
  }

  /* ---------- UI: topbar (teacher) ---------- */
  function renderAll() { renderTopbar(); renderBar(); renderJoin(); }

  function renderTopbar() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    if (!els.open) {
      els.open = button('sync-open-btn', '📡 เปิดห้อง', openRoom);
      els.badge = el('span', 'sync-badge');
    }
    var toggle = bar.querySelector('.toggle');
    [els.open, els.badge].forEach(function (n) {
      if (n.parentNode !== bar) bar.insertBefore(n, toggle);
    });
    els.open.hidden = !(params.length > 0 && role === 'none');
    els.open.disabled = false;
    els.badge.hidden = role !== 'teacher';
    els.badge.textContent = '';
    if (role === 'teacher') {
      els.badge.appendChild(button('sync-badge__code', 'ห้อง ' + room.code, showOverlay));
      els.badge.appendChild(document.createTextNode(' · '));
      els.badge.appendChild(button('sync-badge__close', 'ปิดห้อง', closeRoom));
      if (reconnecting) els.badge.appendChild(el('span', 'sync-badge__note', ' กำลังเชื่อมต่อใหม่…'));
    }
  }

  /* ---------- UI: overlay + QR (teacher) ---------- */
  function showOverlay() {
    if (!room) return;
    if (!els.overlay) buildOverlay();
    els.code.textContent = room.code;
    var url = location.origin + '/?room=' + room.code;
    els.url.textContent = url.replace(/^https?:\/\//, '');
    els.overlay.hidden = false;
    els.start.focus();
    drawQr(url);
  }
  function hideOverlay() { if (els.overlay) els.overlay.hidden = true; }

  function buildOverlay() {
    var o = el('div', 'sync-overlay');
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    var box = el('div', 'sync-overlay__box');
    els.code = el('div', 'sync-overlay__code');
    els.qr = el('div', 'sync-overlay__qr');
    els.url = el('div', 'sync-overlay__url');
    els.start = button('sync-overlay__start', 'เริ่มสอน', hideOverlay);
    [els.code, els.qr, els.url, els.start].forEach(function (n) { box.appendChild(n); });
    o.appendChild(box);
    o.addEventListener('click', function (e) { if (e.target === o) hideOverlay(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideOverlay(); });
    document.body.appendChild(o);
    els.overlay = o;
  }

  // qrcode.js ถูกแทรกตอนเปิด overlay ครั้งแรกเท่านั้น
  function drawQr(url) {
    function render() {
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      els.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }
    if (window.qrcode) return render();
    if (qrRequested) return;
    qrRequested = true;
    var s = document.createElement('script');
    s.src = (layout.assetBase || '/shared/') + 'vendor/qrcode.js';
    s.onload = function () { if (room) render(); };
    document.head.appendChild(s);
  }

  /* ---------- UI: student bar + join form ---------- */
  function renderBar() {
    var show = role === 'student-follow' || role === 'student-explore' || notice;
    if (!show) { if (els.bar) els.bar.hidden = true; return; }
    if (!els.bar) {
      els.bar = el('div', 'sync-bar');
      els.bar.setAttribute('role', 'status');
      document.body.appendChild(els.bar);
    }
    var b = els.bar;
    b.hidden = false;
    b.textContent = '';
    if (role === 'none') {
      b.appendChild(el('span', 'sync-bar__text', notice));
      b.appendChild(button('sync-bar__btn', '×', function () { notice = null; renderBar(); }));
      b.lastChild.setAttribute('aria-label', 'ปิด');
      return;
    }
    var follow = role === 'student-follow';
    b.appendChild(el('span', 'sync-bar__text', follow
      ? '👀 ตามครู · ห้อง ' + room.code + ' · '
      : '🔓 ทดลองเอง · '));
    b.appendChild(follow
      ? button('sync-bar__btn', 'ทดลองเอง', function () { setMode('explore'); })
      : button('sync-bar__btn', 'กลับไปตามครู', function () { setMode('follow'); }));
    var extra = reconnecting ? 'กำลังเชื่อมต่อใหม่…' : notice;
    if (extra) b.appendChild(el('span', 'sync-bar__note', extra));
    if (hint) {
      b.appendChild(el('span', 'sync-bar__note', 'ครูไปเรื่อง ' + hint.title + ' แล้ว · '));
      b.appendChild(button('sync-bar__btn', 'ไปด้วย', function () {
        var id = hint.id;
        writeJson(sessionStorage, STUDENT_KEY, { code: room.code, mode: 'follow' });
        location.href = '/topics/' + id + '/';
      }));
    }
  }

  function renderJoin() {
    if (els.join) els.join.hidden = role !== 'none';
  }

  function mountJoin() {
    var main = document.getElementById('directory');
    if (pageTopic() !== null || !main) return;
    var form = el('form', 'sync-join');
    var input = el('input', 'sync-join__input');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('maxlength', '4');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', 'รหัสห้อง');
    input.placeholder = 'รหัสห้อง 4 หลัก';
    var go = el('button', 'sync-join__btn', 'เข้าห้อง');
    go.type = 'submit';
    form.appendChild(input);
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = input.value.trim();
      if (!/^\d{4}$/.test(code)) { input.focus(); return; }
      input.value = '';
      joinRoom(code, 'follow');
    });
    main.insertBefore(form, main.firstChild);
    els.join = form;
  }

  /* ---------- init ---------- */
  function init() {
    var q = new URLSearchParams(location.search);
    var qRoom = q.get('room');
    if (qRoom && /^\d{4}$/.test(qRoom)) {
      writeJson(sessionStorage, STUDENT_KEY, { code: qRoom, mode: 'follow' });
      q.delete('room');
      var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
    mountJoin();
    var t = readJson(localStorage, TEACHER_KEY);
    var s = readJson(sessionStorage, STUDENT_KEY);
    readClosing().forEach(function (x) { deliverClose(x, 0); });
    if (!(qRoom && s) && t && t.code && t.token) {
      room = { code: t.code, token: t.token };
      setRole('teacher');
    } else if (s && /^\d{4}$/.test(s.code)) {
      room = { code: s.code, mode: s.mode === 'explore' ? 'explore' : 'follow' };
      setRole(room.mode === 'explore' ? 'student-explore' : 'student-follow');
    }
    renderAll();
    if (room) connect();
  }

  window.Sync = api;
  queue.forEach(function (c) { if (api[c[0]]) api[c[0]].apply(null, c[1]); });
  queue.length = 0;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
