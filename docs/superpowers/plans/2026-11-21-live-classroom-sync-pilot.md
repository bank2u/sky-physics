# Live Classroom Sync (Pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ครูเปิดห้อง (รหัส 4 หลัก + QR) แล้วนักเรียนเห็น param/การเล่น/มุมกล้องตามครูแบบ realtime — pilot 3 เรื่อง: `projectile-motion`, `emfield`, `right-hand-rule`

**Architecture:** relay ทึบบน Cloudflare Worker + Durable Object (1 DO ต่อห้อง) เก็บ room state ล่าสุดแล้ว broadcast;
client `shared/sync.js` (โหลดอัตโนมัติจาก `layout.js`) ให้แต่ละหน้าประกาศ `Sync.param/player/camera` แบบ declarative;
logic ที่ไม่ผูก I/O แยกเป็น pure module (`_relay/src/room.mjs`, `shared/sync-core.js`) เพื่อ test ด้วย `node --test`

**Tech Stack:** Vanilla JS (browser, no build), Cloudflare Workers + Durable Objects (WebSocket Hibernation API), `npx wrangler@4` (dev/deploy เท่านั้น ไม่มี `package.json`), `node --test` (Node ≥ 22), vendored `qrcode-generator` 1.4.4 (MIT)

**Spec:** `docs/superpowers/specs/2026-11-21-live-classroom-sync-design.md`

## Global Constraints

- ไม่มี framework/bundler/`package.json` ที่ commit — **รวม `_relay/` ด้วย** (ใช้ `npx wrangler@4` ตรงๆ; ต่างจาก spec ที่เผื่อไว้ว่า `_relay/package.json` เป็นข้อยกเว้น — ไม่จำเป็นแล้ว)
- ห้าม CDN/external script ตอน runtime — QR lib vendor ลง `shared/vendor/`, ฝั่ง client ใช้ `WebSocket`/`fetch` native
- CSS ใหม่ใช้ design tokens จาก `shared/styles.css` เท่านั้น (ห้าม hex/ขนาด/ฟอนต์ใหม่) — ต้องดูได้ทั้ง skin `dot-matrix` และ `comic`
- ห้ามแก้ไฟล์ `shared/skins/*.css` (งาน skin ต้องผ่าน agent `skin-smith`)
- ห้ามแก้ `index.html` หน้าแรกตรงๆ — ช่องเข้าห้องถูก inject โดย `sync.js`
- `shared/config.js` → `syncUrl: ''` = ปิดฟีเจอร์ทั้งเว็บ: ไม่มีปุ่ม ไม่มี WebSocket ไม่มี UI ใดๆ เพิ่ม
- รหัสห้อง = ตัวเลข 4 หลัก zero-padded (`'0000'`–`'9999'`); ห้องหมดอายุเมื่อไม่มี activity 3 ชม. (`10_800_000` ms)
- Throttle: patch ครู 50 ms (20 Hz) + ส่งค่าสุดท้ายเสมอ; camera 66 ms (≈15 Hz)
- Reconnect backoff: 1000 → 2000 → 5000 → 10000 ms (ค้างที่ 10000)
- Relay ทิ้งข้อความ > 16 KB และข้อความที่ไม่ใช่ JSON เงียบๆ
- ข้อความ UI (ภาษาไทย, ตาม spec): `📡 เปิดห้อง`, `ห้อง 4821 · ปิดห้อง`, `👀 ตามครู · ห้อง 4821 · [ทดลองเอง]`, `🔓 ทดลองเอง · [กลับไปตามครู]`,
  `กำลังเชื่อมต่อใหม่…`, `ครูปิดห้องแล้ว`, `ไม่พบห้อง 1234`, `เรื่องนี้ยังไม่รองรับการดูตามครู`, `รอครูเปิดเรื่อง…`, `ครูไปเรื่อง <title> แล้ว · [ไปด้วย]`
- Commit ตรง `main`, Conventional Commits, ลงท้าย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **มือถือนักเรียนหลับ/หลุด Wi-Fi กลางการเล่นแล้วต่อใหม่** → ต้องกระโดดไปเวลาปัจจุบันของครู ไม่ใช่เริ่ม 0 — Task 3 (`elapsedMs`) + Task 2 e2e (reconnect ได้ state เดิม) + Task 5 smoke ข้อ 7
2. **ครู reload หน้า/เปลี่ยนเรื่อง** → ยังเป็นครูห้องเดิม รหัสไม่เปลี่ยน ไม่สร้างห้องซ้อน — Task 4 (teacher resume จาก `localStorage`) + Task 5 smoke ข้อ 6
3. **URL หลายรูป (`/topics/x`, `/topics/x/`, `/topics/x/index.html`)** → นักเรียนต้องไม่ redirect วน — Task 3 (`topicIdFromPath`)
4. **พิมพ์รหัสผิด/ห้องหมดอายุ** → เห็น `ไม่พบห้อง 1234` ทันที ไม่ค้าง "กำลังเชื่อมต่อ" — Task 2 e2e + Task 4
5. **นักเรียนส่ง patch เอง (devtools)** → relay ทิ้ง ไม่ broadcast — Task 1 test

---

## File Structure

```
_relay/                         ← ใหม่ (deploy แยกขึ้น Cloudflare, ไม่ขึ้น Vercel)
  wrangler.toml                 config Worker + DO binding + vars ALLOWED_ORIGINS
  src/room.mjs                  pure: room record, patch merge, role, message handling, expiry, code gen
  src/worker.mjs                glue: fetch router + Durable Object class `Room`
  test/room.test.mjs            node --test ของ room.mjs
  test/e2e.mjs                  สคริปต์ยิง relay จริง (wrangler dev) ด้วย WebSocket ของ Node
shared/
  config.js                     + syncUrl / syncUrlDev
  layout.js                     + Sync stub (queue) + โหลด sync.js อัตโนมัติ
  sync-core.js                  ใหม่ — pure: clock, elapsed, throttle, role, topicIdFromPath (UMD: browser + require)
  sync.js                       ใหม่ — browser: connection, registry, apply, UI (ปุ่ม/overlay/badge/bar/join/lock)
  styles.css                    + component rules `.sync-*` (token เท่านั้น)
  vendor/qrcode.js              ใหม่ — qrcode-generator 1.4.4 (lazy-load)
  sim/projectile.js             + wall-clock time, getters, getPlayState/applyPlayState
  sim/electric-field.js         + wall-clock fixed-step, getters/setters, onParamChange, play state
  sim/vector3d.js               + getView/setView, onViewChange
topics/{projectile-motion,emfield,right-hand-rule}/index.html   + ลงทะเบียน Sync
tests/sync-core.test.js         ใหม่ — node --test ของ sync-core.js
.vercelignore                   ใหม่ — _relay/, tests/, docs/
AGENTS.md, README.md, _system/ARCHITECTURE.md, .claude/skills/{page-template,simulation-patterns,build-workflow}/SKILL.md
```

## Shared contracts (ทุก task อ้างตรงนี้)

**Room state** (relay เก็บทึบ, client ตีความ):
```js
{ topicId: 'projectile-motion' | null,
  supported: true,                              // หน้าครูประกาศ Sync.param อย่างน้อย 1 ตัว
  params:  { angle: 42, v0: 22 },               // name → JSON value
  play:    { playing: true, t: 0, serverT0: 1732170000000 },   // t = หน่วยเวลาของ sim เอง
  camera:  { theta: 0.61, phi: 1.08 } }
```
Patch merge: ถ้า patch มี `topicId` ต่างจากเดิม → ล้าง `params`/`play`/`camera`/`supported` ก่อน;
`params` merge ราย key; `topicId`/`supported`/`play`/`camera` แทนทั้งก้อน.
(ต่างจาก spec: ไม่มี `seed` ใน pilot เพราะ 3 sim นี้ไม่สุ่ม — เพิ่มตอนทำ `gas-particles`/`heat-transfer`;
`simT0` → `t`)

**Wire protocol:**
```
client→relay  {type:'patch', state:{...}}      (ครูเท่านั้น)
client→relay  {type:'close'}                   (ครูเท่านั้น)
client→relay  {type:'ping', id}
relay→client  {type:'welcome', role:'teacher'|'viewer', state, serverNow}
relay→all     {type:'state', state, serverNow}
relay→client  {type:'pong', id, serverNow}
relay→all     {type:'closed', reason:'teacher'|'expired'|'not-found'}  แล้วปิด socket
```
**HTTP:** `POST /rooms` → `201 {code, teacherToken}`; `GET /rooms/:code/ws?t=<token>` → WebSocket upgrade
(token ตรง = teacher, อื่นๆ = viewer; ห้องไม่มี/หมดอายุ → accept แล้วส่ง `closed:not-found`).
ทุก route ตรวจ `Origin` กับ `ALLOWED_ORIGINS`; `POST`/`OPTIONS` ตอบ CORS headers.

---

### Task 1: Relay room logic (pure)

**Files:**
- Create: `_relay/src/room.mjs`
- Test: `_relay/test/room.test.mjs`

**Interfaces:**
- Produces (ESM exports):
  - `TTL_MS = 10_800_000`, `MAX_MSG_BYTES = 16_384`
  - `randomCode(rand = Math.random): string` — 4 หลัก zero-padded
  - `createRecord(token: string, now: number): Record` — `{token, state: {topicId:null, params:{}}, lastActivity: now, closed:false}`
  - `roleFor(record: Record, token: string|null): 'teacher'|'viewer'`
  - `applyPatch(state, patch): state` — ตาม merge rule ใน Shared contracts, ไม่ mutate input
  - `handleMessage(record, role, raw: string, now): {record, broadcast: object|null, reply: object|null}`
  - `isExpired(record, now): boolean` — `closed || now - lastActivity >= TTL_MS`

- [ ] **Step 1: Write failing tests** `_relay/test/room.test.mjs` (`node:test` + `node:assert/strict`):
  - `randomCode(() => 0)` → `'0000'`; `randomCode(() => 0.99999)` → `'9999'`; `randomCode(() => 0.0421)` → `'0421'`
  - `roleFor(createRecord('abc', 0), 'abc')` → `'teacher'`; with `'x'` / `null` → `'viewer'`
  - `applyPatch({topicId:'a', params:{x:1}, play:{playing:true,t:0,serverT0:5}}, {topicId:'b'})` → `{topicId:'b', params:{}}` (ไม่มี play/camera/supported)
  - `applyPatch({topicId:'a', params:{x:1,y:2}}, {params:{y:3}})` → params `{x:1,y:3}`; input เดิมไม่ถูก mutate
  - `applyPatch(s, {topicId:'a', params:{z:1}})` เมื่อ `s.topicId==='a'` → params ยังมี key เดิม (topic เดิมไม่ล้าง)
  - viewer ส่ง `{"type":"patch","state":{"topicId":"evil"}}` → `broadcast===null`, `record.state` ไม่เปลี่ยน **(Review Focus 5)**
  - teacher patch → `broadcast` = `{type:'state', state:<merged>, serverNow: now}`, `record.lastActivity === now`
  - `{type:'ping', id:7}` จาก viewer → `reply` = `{type:'pong', id:7, serverNow: now}`, broadcast null
  - teacher `{type:'close'}` → `broadcast` = `{type:'closed', reason:'teacher'}`, `record.closed === true`
  - raw `'not json'` และ raw ยาว 16_385 ตัว → ทั้ง broadcast และ reply เป็น null
  - `isExpired(createRecord('t', 0), TTL_MS - 1)` → false; `(…, TTL_MS)` → true

- [ ] **Step 2:** Run `node --test _relay/test/` → FAIL (module not found)
- [ ] **Step 3:** Implement `_relay/src/room.mjs` ตาม Interfaces (ไม่มี dependency, ไม่แตะ I/O)
- [ ] **Step 4:** Run `node --test _relay/test/` → ทุก test PASS
- [ ] **Step 5:** Commit `feat(relay): add pure room state logic`

---

### Task 2: Relay Worker + Durable Object

**Files:**
- Create: `_relay/src/worker.mjs`, `_relay/wrangler.toml`, `_relay/test/e2e.mjs`
- Create: `.vercelignore` (บรรทัด: `_relay/`, `tests/`, `docs/`)
- Modify: `.gitignore` — เพิ่ม `.wrangler/` (state ของ `wrangler dev`)

**Interfaces:**
- Consumes: ทุก export ของ Task 1
- Produces: HTTP/WS API ตาม Shared contracts ที่ `http://localhost:8787` (dev)

`wrangler.toml`: `name = "sky-physic-relay"`, `main = "src/worker.mjs"`, `compatibility_date = "2026-11-01"`,
DO binding `ROOMS` → class `Room` พร้อม `[[migrations]] tag="v1" new_sqlite_classes=["Room"]` (ใช้ได้บน free plan),
`[vars] ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:5000"` (prod ตั้งตอน Task 9).

Worker: `POST /rooms` วนสุ่ม `randomCode()` สูงสุด 20 ครั้ง → `env.ROOMS.get(env.ROOMS.idFromName(code))` →
`stub.fetch('https://room/claim', {method:'POST', body: JSON.stringify({token})})` → 201 = ได้, 409 = มีห้องที่ยังไม่หมดอายุ.
token = `crypto.randomUUID()`. ครบ 20 ครั้ง → 503.

`Room` DO: เก็บ record ใน `ctx.storage` key `'record'` (+ cache ในหน่วยความจำ);
WS ใช้ `ctx.acceptWebSocket(server, [role])`, `webSocketMessage` อ่าน role จาก `ctx.getTags(ws)[0]` แล้วเรียก `handleMessage`;
broadcast ส่งทุก socket จาก `ctx.getWebSockets()`; หลัง `closed` → `ws.close(1000)` ทุกตัว + `storage.deleteAll()`;
ทุก activity ตั้ง `ctx.storage.setAlarm(lastActivity + TTL_MS)`; `alarm()` → ถ้า `isExpired` ส่ง `closed:expired` + ปิด + ลบ.

- [ ] **Step 1: Write e2e script** `_relay/test/e2e.mjs <baseUrl>` (Node global `WebSocket`/`fetch`, ส่ง header `Origin: http://localhost:3000`) — assert ตามลำดับ แล้วพิมพ์ `E2E OK`:
  1. `POST /rooms` → 201, `code` ตรง `/^\d{4}$/`, มี `teacherToken`
  2. teacher WS → `welcome.role==='teacher'`; viewer WS (ไม่มี t) → `welcome.role==='viewer'`
  3. teacher ส่ง patch `{topicId:'projectile-motion', supported:true, params:{angle:60}}` → viewer ได้ `state.params.angle===60`
  4. viewer ส่ง patch `{params:{angle:1}}` → viewer2 ที่เพิ่งต่อใหม่ได้ `welcome.state.params.angle===60` (late join + ignore viewer)
  5. ปิด viewer แล้วต่อใหม่ → `welcome.state` เท่าเดิม (reconnect, Review Focus 1)
  6. WS ไป `/rooms/0000/ws` ถ้า 0000 ไม่ใช่รหัสที่ได้ (หรือรหัสสุ่มที่ไม่ได้ claim) → ได้ `{type:'closed', reason:'not-found'}` **(Review Focus 4)**
  7. `POST /rooms` ด้วย `Origin: https://evil.example` → 403
  8. teacher ส่ง `{type:'close'}` → viewer ได้ `closed:teacher` และ socket ปิด
- [ ] **Step 2:** `cd _relay && npx wrangler@4 dev --port 8787` (background) แล้ว `node _relay/test/e2e.mjs http://localhost:8787` → FAIL
- [ ] **Step 3:** Implement `worker.mjs` + `wrangler.toml` ตาม Interfaces
- [ ] **Step 4:** Re-run e2e → `E2E OK`; `node --test _relay/test/` ยัง PASS
- [ ] **Step 5:** Commit `feat(relay): add Cloudflare worker and room durable object`

---

### Task 3: Client sync core (pure)

**Files:**
- Create: `shared/sync-core.js` (UMD: `module.exports` ถ้ามี, ไม่งั้น `window.SyncCore`)
- Test: `tests/sync-core.test.js` (CommonJS, `require('../shared/sync-core.js')`)

**Interfaces:**
- Produces `SyncCore`:
  - `createClock(): { addSample(sentAt, serverNow, receivedAt): void, now(): number }` — offset = median ของ `serverNow - (sentAt + receivedAt) / 2` จาก 5 sample ล่าสุด; ไม่มี sample → offset 0; `now()` = `Date.now() + offset`
  - `elapsedMs(play, serverNow): number` — `play && play.playing ? Math.max(0, serverNow - play.serverT0) : 0`
  - `createThrottle(fn, intervalMs): { call(...args), flush() }` — leading + trailing (ค่าสุดท้ายถูกส่งเสมอ)
  - `nextRole(role, event): role` — `student-follow` + `'explore'` → `student-explore`; `student-explore` + `'follow'` → `student-follow`; ทุก role + `'closed'` → `none`; นอกนั้นคืน role เดิม
  - `topicIdFromPath(pathname): string|null`
  - `BACKOFF_MS = [1000, 2000, 5000, 10000]`, `backoffFor(attempt): number` (เกินท้าย = 10000)

- [ ] **Step 1: Write failing tests** `tests/sync-core.test.js`:
  - clock: sample `(1000, 5100, 1200)` → `now()` ≈ `Date.now() + 4000` (±5); เพิ่ม sample outlier `(0, 999999, 0)` อีก 1 จาก 5 → median ไม่เปลี่ยน
  - `elapsedMs({playing:true, t:0, serverT0:1000}, 4000)` → 3000; `serverNow < serverT0` → 0; `{playing:false…}` → 0; `undefined` → 0
  - throttle (`node:test` mock timers): `call(1); call(2); call(3)` ภายใน 50 ms → fn ถูกเรียกด้วย 1 ทันที และ 3 หลัง 50 ms (ไม่มี 2); `flush()` ส่งค่าค้างทันที
  - `nextRole` ครบ 4 กรณีข้างบน + `nextRole('teacher','explore')` → `'teacher'`
  - `topicIdFromPath`: `'/topics/emfield/'`, `'/topics/emfield'`, `'/topics/emfield/index.html'` → `'emfield'`; `'/'`, `'/index.html'`, `''` → `null` **(Review Focus 3)**
  - `backoffFor(0)` → 1000, `backoffFor(3)` → 10000, `backoffFor(99)` → 10000
- [ ] **Step 2:** Run `node --test tests/` → FAIL
- [ ] **Step 3:** Implement `shared/sync-core.js`
- [ ] **Step 4:** Run `node --test tests/` → PASS
- [ ] **Step 5:** Commit `feat(sync): add pure client sync core`

---

### Task 4: Client `sync.js` — connection, registry, UI

**Files:**
- Create: `shared/sync.js`
- Create: `shared/vendor/qrcode.js` — `curl -L https://unpkg.com/qrcode-generator@1.4.4/qrcode.js -o shared/vendor/qrcode.js` (ตรวจว่าหัวไฟล์มี MIT license ของ Kazuhiko Arase)
- Modify: `shared/config.js` — เพิ่ม `syncUrl: ''` และ `syncUrlDev: 'http://localhost:8787'` (ใช้เมื่อ `location.hostname` เป็น `localhost`/`127.0.0.1`)
- Modify: `shared/layout.js` — (ก) stub `window.Sync` ที่ queue การเรียก `param/player/camera/changed` ไว้; (ข) ถ้ามี sync URL ที่ใช้ได้ แทรก `<script defer>` ของ `sync-core.js` แล้ว `sync.js` (resolve path จาก `document.currentScript.src` ของ layout.js)
- Modify: `shared/styles.css` — component rules `.sync-open-btn`, `.sync-overlay`, `.sync-badge`, `.sync-bar`, `.sync-join`, `.is-sync-locked` (token เท่านั้น)

**Interfaces:**
- Consumes: `SyncCore` (Task 3), protocol (Task 2)
- Produces `window.Sync` (แทน stub แล้ว drain queue):
  - `param(name: string, {get(): any, set(v): void, local?: boolean})`
  - `player({get(): {playing: boolean, t: number}, apply({playing, t, elapsedMs}): void})`
  - `camera({get(): {theta, phi}, set({theta, phi}): void})`
  - `changed(name: string)` — name = ชื่อ param | `'play'` | `'camera'`; มีผลเฉพาะ role `teacher` (ไม่งั้น no-op)
  - `role(): 'none'|'teacher'|'student-follow'|'student-explore'`

พฤติกรรมที่ต้องตรง:
- **Storage:** ครู `localStorage['sky-physic-room'] = {code, token}`; นักเรียน `sessionStorage['sky-physic-student'] = {code, mode:'follow'|'explore'}`. `?room=1234` ใน URL → เขียน student storage แล้วลบ query ออกด้วย `history.replaceState`
- **ครู:** ปุ่ม `📡 เปิดห้อง` ใน `.topbar` เฉพาะหน้าที่มี `Sync.param` ≥ 1 ตัวและไม่มีห้องค้าง → `POST /rooms` → overlay (รหัสตัวโต + QR SVG ของ `<origin>/?room=<code>` จาก `qrcode(0,'M')` + URL สั้น + ปุ่ม `เริ่มสอน`); `shared/vendor/qrcode.js` ถูกแทรกเป็น `<script>` **ตอนเปิด overlay ครั้งแรกเท่านั้น** (ไม่โหลดในหน้าปกติ) → badge `ห้อง 4821 · ปิดห้อง` (กดรหัสเปิด overlay อีก). เปิดหน้าใหม่/รีโหลดขณะมีห้อง → ต่อห้องเดิม **(Review Focus 2)**. หลัง `welcome` ส่ง patch เต็ม `{topicId, supported, params:<ทุก param ที่ไม่ local>, play?, camera?}`; หลังจากนั้น `changed()` ส่ง patch ผ่าน throttle (50 ms; camera 66 ms). `ปิดห้อง` → ส่ง `close` + ลบ localStorage. ได้ `closed:not-found|expired` → ลบ localStorage, กลับเป็น `none`
- **นักเรียน (apply state):** ตามลำดับ params (`set` ทุกตัวที่ไม่ local) → `player.apply({...play, elapsedMs: SyncCore.elapsedMs(play, clock.now())})` → `camera.set`. โหมด follow: ถ้า `state.topicId` ไม่ null และ ≠ `topicIdFromPath(location.pathname)` → `location.href = '/topics/<id>/'`; `topicId === null` → bar `รอครูเปิดเรื่อง…`; `supported === false` → bar `เรื่องนี้ยังไม่รองรับการดูตามครู`. โหมด explore: เก็บ state ล่าสุดใน buffer ไม่ apply; topic เปลี่ยน → bar `ครูไปเรื่อง <title> แล้ว · [ไปด้วย]` (title จาก `_system/topics.json`)
- **Lock:** follow → `inert` + `.is-sync-locked` บน `.controls` และ `.sim-zone`; explore/none → เอาออก. `กลับไปตามครู` → apply buffer ทันที
- **หน้าแรก:** (`topicIdFromPath` = null และมี `#directory`) inject ฟอร์ม `.sync-join` (input `inputmode="numeric" maxlength="4"` + ปุ่ม `เข้าห้อง`) ไว้บนสุดของ `main` → เขียน student storage แล้วต่อ WS
- **Connection:** reconnect ตาม `backoffFor`; ระหว่างนั้น bar/badge `กำลังเชื่อมต่อใหม่…`; ping 3 ครั้งห่าง 500 ms ตอนต่อ แล้วทุก 20 s เพื่อป้อน `clock.addSample`. `closed:not-found` สำหรับนักเรียน → bar `ไม่พบห้อง 1234` แล้วล้าง storage **(Review Focus 4)**; `closed:teacher|expired` → `ครูปิดห้องแล้ว`, role `none`, ปลดล็อก
- `syncUrl` ว่าง (และไม่ใช่ localhost) → `layout.js` ไม่โหลด sync.js เลย, stub เป็น no-op

- [ ] **Step 1: Verify (browser, ก่อน implement)** — `npx serve . -l 3000` + relay ของ Task 2 → หน้าแรกยังไม่มีช่องเข้าห้อง (baseline)
- [ ] **Step 2:** Implement ไฟล์ทั้งหมดใน Files
- [ ] **Step 3: Verify ด้วย claude-in-chrome** (ยังไม่มีหน้าไหนประกาศ param):
  - หน้าแรกมีฟอร์มเข้าห้อง; พิมพ์ `9998` (ไม่มีห้อง) → `ไม่พบห้อง 9998` ภายใน 2 s
  - หน้า topic ใดๆ ไม่มีปุ่ม `📡 เปิดห้อง` (ยังไม่มี param) และไม่มี console error
  - ตั้งทั้ง `syncUrl: ''` และ `syncUrlDev: ''` ชั่วคราว → Network ไม่มี `sync.js`/`qrcode.js`/WebSocket ใดๆ และหน้าแรกไม่มีฟอร์ม แล้วคืนค่าเดิม
  - เปิดหน้า topic ปกติ (ไม่ได้อยู่ในห้อง) → Network ไม่มี `qrcode.js`
  - สลับ skin เป็น `dot-matrix` (light+dark) และ `comic` ชั่วคราว → ฟอร์มอ่านได้ทุกแบบ แล้วคืน `config.js`
- [ ] **Step 4:** `node --test tests/ _relay/test/` ยัง PASS
- [ ] **Step 5:** Commit `feat(sync): add client sync runtime, room UI and QR`

---

### Task 5: Pilot — `projectile-motion` (time/seek)

**Files:**
- Modify: `shared/sim/projectile.js`
- Modify: `topics/projectile-motion/index.html` (inline script ท้ายไฟล์)

**Interfaces:**
- Consumes: `Sync.param/player/changed` (Task 4)
- Produces (sim API เพิ่ม): `getAngle(): number`, `getV0(): number`, `getPlayState(): {playing, t}`, `applyPlayState({playing, t, elapsedMs}): void`; ค่าคงที่ `TIME_SCALE = 1.875` (= 0.03 s ต่อ 16 ms เดิม — ความเร็วภาพเท่าเดิม)

- [ ] **Step 1:** เปลี่ยน loop ใน `play()` จาก `state.t += 0.03` เป็นเวลาจริง: `t = tStart + (performance.now() - wallStart) / 1000 * TIME_SCALE` (clamp ที่ `T`, หยุดเองเมื่อถึง)
- [ ] **Step 2:** เพิ่ม getters + `applyPlayState`: `t' = min(T, t + elapsedMs/1000*TIME_SCALE)`; `playing && t' < T` → เล่นต่อจาก `t'`; ไม่งั้นหยุดที่ `t'` และ render
- [ ] **Step 3:** ในหน้า: `Sync.param('angle', {get: sim.getAngle, set: sim.setAngle})`, `Sync.param('v0', …)`, `Sync.player({get: sim.getPlayState, apply: sim.applyPlayState})`; handler slider เรียก `Sync.changed('angle'|'v0')` หลัง set; ปุ่มเล่น/รีเซ็ตเรียก `Sync.changed('play')`
- [ ] **Step 4: 2-tab smoke (claude-in-chrome)** — แท็บ A ครู, แท็บ B นักเรียนเข้าด้วยรหัส:
  1. B ถูกพาไป `/topics/projectile-motion/`, bar `👀 ตามครู`, slider ใน B กดไม่ได้
  2. ลาก angle/v0 ใน A → tile ทุกตัว + ตำแหน่ง knob ใน B ตรงกับ A
  3. กดปล่อยใน A → B เล่นด้วย; อ่าน tile เวลา `t` ทั้งสองแท็บพร้อมกันผ่าน javascript_tool ต่างกัน < 0.1 s
  4. เปิดแท็บ C เข้าห้องกลางการบิน → ลูกอยู่ตำแหน่งเดียวกับ A ไม่เริ่มจาก 0
  5. B กด `ทดลองเอง` → ปรับเองได้; A เปลี่ยนค่า → B ไม่ขยับ; B กด `กลับไปตามครู` → snap ค่า A
  6. รีโหลด A → ยังเป็นครูห้องเดิม (รหัสเดิม) **(Review Focus 2)**
  7. ระหว่างลูกกำลังบิน หยุด `wrangler dev` 5 s แล้วเปิดใหม่ (state ของ DO ถูกเก็บใน `.wrangler/` จึงอยู่ครบ) → A และ B ขึ้น `กำลังเชื่อมต่อใหม่…` แล้วต่อได้เอง, B อยู่เวลาปัจจุบันของ A ไม่เริ่ม 0 **(Review Focus 1)**
  8. ไม่มี console error ทุกแท็บ; แท็บที่ไม่ได้เข้าห้องไม่มี WebSocket
- [ ] **Step 5:** Commit `feat(topics): enable live sync on projectile-motion`

---

### Task 6: Pilot — `emfield` (canvas drag + toggle→absolute + fixed-step)

**Files:**
- Modify: `shared/sim/electric-field.js`
- Modify: `topics/emfield/index.html`

**Interfaces:**
- Produces (sim API เพิ่ม):
  - option `onParamChange(name: 'q1'|'q2'|'test')` — เรียกใน `onMove` ของ drag
  - `getCharge(id): {x, y, q}`, `setChargeState(id, {x, y, q})`
  - `getTest(): {x, y}` — ระหว่างปล่อยคืน **ตำแหน่งเริ่มปล่อย**, นอกนั้นคืนตำแหน่งปัจจุบัน; `setTest({x, y})` — หยุดปล่อย ล้าง trail
  - `getPlayState(): {playing: releasing, t: tickCount}`; `applyPlayState({playing, t, elapsedMs})`
  - `setReleasing(on: boolean)` — แทนที่การใช้ `toggleRelease()` ในหน้า (เก็บ `toggleRelease` ไว้ได้)

- [ ] **Step 1:** loop ปล่อยประจุเป็น fixed-step ตามเวลาจริง: `ticksDue = baseTicks + floor((performance.now() - wallStart) / 16)`; วน `tick()` จน `tickCount === ticksDue` (ไม่ render ระหว่างวน, render ครั้งเดียวท้าย) → ผลลัพธ์ deterministic
- [ ] **Step 2:** `applyPlayState`: ไม่ playing → หยุดที่ตำแหน่งปัจจุบัน; playing → `startRelease()` จากตำแหน่งทดสอบปัจจุบันแล้ว fast-forward `min(4000, t + floor(elapsedMs / 16))` ticks (หยุดเร็วกว่านั้นถ้าชนขอบ/ประจุ)
- [ ] **Step 3:** ในหน้า: `Sync.param('q1'|'q2', {get: () => sim.getCharge(id), set: v => sim.setChargeState(id, v)})`, `Sync.param('test', {get: sim.getTest, set: sim.setTest})`, `Sync.player(...)`; `onParamChange: Sync.changed`; ปุ่มปล่อย → `sim.setReleasing(!sim.isReleasing())` แล้ว `Sync.changed('test'); Sync.changed('play')`; รีเซ็ต → changed ทั้ง `q1`,`q2`,`test`,`play`
- [ ] **Step 4: 2-tab smoke** — ข้อ 1, 2, 5, 8 ของ Task 5 และ:
  - ลากประจุ q1 และเพชรทดสอบใน A → ตำแหน่งใน B ตามระหว่างลาก
  - กดปล่อยใน A → B ปล่อยด้วย; หลังจบ (ชนขอบ/ถูกจับ) ตำแหน่งสุดท้ายใน A และ B ต่างกัน < 1 หน่วย (อ่านผ่าน `sim.getTest()`)
  - แท็บ C เข้ากลางการปล่อย → trail ต่อจากตำแหน่งปัจจุบันของ A
  - กดหยุดใน A กลางทาง → B หยุดที่ตำแหน่งเดียวกัน
- [ ] **Step 5:** Commit `feat(topics): enable live sync on emfield`

---

### Task 7: Pilot — `right-hand-rule` (camera 3D)

**Files:**
- Modify: `shared/sim/vector3d.js`
- Modify: `topics/right-hand-rule/index.html`

**Interfaces:**
- Produces (sim API เพิ่ม): `getView(): {theta, phi}`, `setView({theta, phi})` (radius ไม่แตะ — ซูมเป็นของแต่ละเครื่อง), option `onViewChange()` เรียกใน pointermove ตอนลาก และใน reset view

- [ ] **Step 1:** เพิ่ม API ใน `vector3d.js`
- [ ] **Step 2:** ในหน้า: แยกฟังก์ชัน `applyState()` ที่ sync class `is-active` ของ `#modeTabs` + `renderPanel()` + `computeAndApply()` แล้วใช้ทั้งใน handler เดิมและ Sync; `Sync.param('state', {get: () => JSON.parse(JSON.stringify(state)), set: v => { state = JSON.parse(JSON.stringify(v)); applyState(); }})`; ทุก handler ที่แก้ `state` (mode tab, ปุ่มทิศ, segmented, number input) เรียก `Sync.changed('state')`; `Sync.camera({get: sim.getView, set: sim.setView})`, `onViewChange: () => Sync.changed('camera')`
- [ ] **Step 3: 2-tab smoke** — ข้อ 1, 5, 8 ของ Task 5 และ:
  - เปลี่ยน mode/ทิศ/ตัวเลขใน A → panel, tile, มือ 3D ใน B ตรงกัน
  - หมุนกล้องใน A → B หมุนตาม (`getView()` ต่างกัน < 0.01 rad หลังหยุดลาก); scroll-zoom ใน A → B **ไม่** ซูมตาม
  - B (follow) ลากบน canvas ไม่ได้
- [ ] **Step 4:** Commit `feat(topics): enable live sync on right-hand-rule`

---

### Task 8: Rules, docs, skills

**Files:**
- Modify: `AGENTS.md` (หลักการ + คำสั่ง), `_system/ARCHITECTURE.md` (§1 โครงสร้าง, §2/§3 backend exception, §6 guardrails, เพิ่ม §8 Live Sync), `README.md` (หัวข้อ "ห้องเรียน live sync": วิธีใช้สำหรับครู + dev `npx wrangler@4 dev`)
- Modify: `.claude/skills/page-template/SKILL.md`, `.claude/skills/simulation-patterns/SKILL.md`, `.claude/skills/build-workflow/SKILL.md`

- [ ] **Step 1:** แก้กฎ "ไม่มี backend" → "มี backend ได้ตัวเดียว = `_relay/` (relay ทึบ ไม่มี logic ฟิสิกส์ ไม่เก็บข้อมูลส่วนตัว, deploy แยกด้วย `npx wrangler@4 deploy`)"; ระบุ `syncUrl: ''` = ปิดฟีเจอร์
- [ ] **Step 2:** `page-template`: หน้าเรื่องต้องประกาศ `Sync.param` ครบทุก control, `Sync.player` ถ้ามีเล่น/หยุด, `Sync.camera` ถ้า 3D, เรียก `Sync.changed` ในทุก handler; เสียง = `local: true`. `simulation-patterns`: sim ใหม่ต้องมี getter ทุก param, setter แบบ absolute (ห้ามมีแค่ toggle), เวลาอิงนาฬิกาจริง, `getPlayState/applyPlayState`, สุ่มต้องใช้ seeded PRNG. `build-workflow` verify: เพิ่ม 2-tab smoke (ข้อ 1, 2, 3, 5, 8 ของ Task 5)
- [ ] **Step 3:** `grep -n "ไม่มี backend" AGENTS.md README.md _system/ARCHITECTURE.md` → ไม่เหลือข้อความที่ขัดกับข้อยกเว้นใหม่
- [ ] **Step 4:** Commit `docs: document live sync relay and page contract`

---

### Task 9: Deploy relay + เปิดใช้บน production (ต้องมีผู้ใช้ร่วม)

- [ ] **Step 1 (ผู้ใช้):** สมัคร Cloudflare (free) แล้วรัน `! cd _relay && npx wrangler@4 login`
- [ ] **Step 2:** ตั้ง `ALLOWED_ORIGINS` ใน `wrangler.toml` เป็นโดเมน Vercel production (ถามผู้ใช้ถ้าไม่รู้) + localhost; `npx wrangler@4 deploy` → ได้ URL `https://sky-physic-relay.<account>.workers.dev`
- [ ] **Step 3:** `node _relay/test/e2e.mjs https://sky-physic-relay.<account>.workers.dev` — แก้สคริปต์ให้รับ `Origin` จาก env `E2E_ORIGIN` → `E2E OK`
- [ ] **Step 4:** ตั้ง `syncUrl` ใน `shared/config.js` เป็น URL นั้น; commit `feat(sync): enable live sync relay in production`
- [ ] **Step 5 (ผู้ใช้อนุมัติก่อน push):** push → Vercel deploy → smoke บน production: คอมเปิดห้อง + มือถือจริงสแกน QR → ตามได้
- [ ] **Step 6:** บันทึกใน spec ว่า pilot เสร็จ + ส่วนที่ต่างจาก design (ไม่มี seed, ไม่มี `_relay/package.json`, `simT0`→`t`) แล้วรอครูทดลองในห้องจริง 1–2 คาบ ก่อนวางแผนอีก 13 เรื่อง
