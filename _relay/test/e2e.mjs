// End-to-end check against a running relay: node _relay/test/e2e.mjs http://localhost:8787
import assert from 'node:assert/strict';

const base = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '');
const wsBase = base.replace(/^http/, 'ws');
const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:3000';

function connect(code, token) {
  const url = `${wsBase}/rooms/${code}/ws${token ? `?t=${encodeURIComponent(token)}` : ''}`;
  const ws = new WebSocket(url, { headers: { Origin: ORIGIN } });
  const queue = [];
  const waiters = [];
  let closed = false;
  const flush = () => {
    for (const w of [...waiters]) {
      const i = queue.findIndex(w.pred);
      if (i >= 0) { waiters.splice(waiters.indexOf(w), 1); w.resolve(queue.splice(i, 1)[0]); }
      else if (closed) { waiters.splice(waiters.indexOf(w), 1); w.reject(new Error('socket closed before expected message')); }
    }
  };
  ws.addEventListener('message', (e) => { queue.push(JSON.parse(e.data)); flush(); });
  ws.addEventListener('close', () => { closed = true; flush(); });
  const opened = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('ws error ' + url)));
  });
  return {
    ws,
    opened,
    next(pred = () => true, ms = 4000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); }, reject: (e) => { clearTimeout(t); reject(e); } });
        flush();
      });
    },
    send(obj) { ws.send(JSON.stringify(obj)); },
    closedP: new Promise((res) => ws.addEventListener('close', res)),
  };
}

const type = (t) => (m) => m.type === t;

// 1. create room
const res = await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: ORIGIN } });
assert.equal(res.status, 201);
const { code, teacherToken } = await res.json();
assert.match(code, /^\d{4}$/);
assert.ok(teacherToken);

// 2. roles
const teacher = connect(code, teacherToken);
await teacher.opened;
assert.equal((await teacher.next(type('welcome'))).role, 'teacher');
const viewer = connect(code);
await viewer.opened;
assert.equal((await viewer.next(type('welcome'))).role, 'viewer');

// 3. teacher patch reaches viewer
teacher.send({ type: 'patch', state: { topicId: 'projectile-motion', supported: true, params: { angle: 60 } } });
const st = await viewer.next((m) => m.type === 'state' && m.state.params.angle === 60);
assert.equal(st.state.params.angle, 60);

// 4. viewer patch ignored; late joiner sees teacher state
viewer.send({ type: 'patch', state: { params: { angle: 1 } } });
await new Promise((r) => setTimeout(r, 300));
const viewer2 = connect(code);
await viewer2.opened;
const w2 = await viewer2.next(type('welcome'));
assert.equal(w2.state.params.angle, 60);

// 5. reconnect keeps state
viewer.ws.close();
await viewer.closedP;
const viewer3 = connect(code);
await viewer3.opened;
const w3 = await viewer3.next(type('welcome'));
assert.deepEqual(w3.state, w2.state);

// 6. unknown room -> closed:not-found
const other = code === '0000' ? '0001' : '0000';
const ghost = connect(other);
await ghost.opened;
const nf = await ghost.next(type('closed'));
assert.equal(nf.reason, 'not-found');

// 7. bad origin rejected
const evil = await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
assert.equal(evil.status, 403);

// 8. teacher closes room
teacher.send({ type: 'close' });
const c = await viewer3.next(type('closed'));
assert.equal(c.reason, 'teacher');
await viewer3.closedP;

// 9. closed room's storage is gone
const after = connect(code);
await after.opened;
assert.equal((await after.next(type('closed'))).reason, 'not-found');

// 10. expiry (needs relay started with --var ROOM_TTL_MS:<E2E_TTL_MS>)
const ttl = Number(process.env.E2E_TTL_MS);
if (ttl > 0) {
  const r2 = await (await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: ORIGIN } })).json();
  const idle = connect(r2.code);
  await idle.opened;
  await idle.next(type('welcome'));
  const exp = await idle.next(type('closed'), ttl + 2000);
  assert.equal(exp.reason, 'expired');
  // Hibernated sockets closed from alarm() are not reliably surfaced as a client
  // close event by local `wrangler dev` (they are with live sockets); the closed
  // message is the contract clients act on, so a missing close is only a warning.
  const sockClosed = await Promise.race([idle.closedP.then(() => true), new Promise((r) => setTimeout(() => r(false), 2000))]);
  if (!sockClosed) console.warn('WARN: socket close event not observed after expiry (wrangler dev quirk)');
  const gone = connect(r2.code);
  await gone.opened;
  assert.equal((await gone.next(type('closed'))).reason, 'not-found');
}

console.log('E2E OK');
process.exit(0);
