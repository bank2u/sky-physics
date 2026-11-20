# Live Classroom Sync Design — ครูเลื่อน param นักเรียนเห็นตาม

วันที่: 2026-11-21
สถานะ: design อนุมัติแล้ว (grilling 10 ข้อ) — รอ implementation plan สำหรับ pilot

## เป้าหมาย

ครูสาธิต simulation บนเครื่องตัวเอง นักเรียนเปิดบนมือถือ/แท็บเล็ตตัวเองแล้วเห็น **ค่าเดียวกัน จังหวะเดียวกัน**
แบบ realtime — default คือ "ตามครู" และนักเรียนกดออกไป "ทดลองเอง" ได้ (เริ่มจากค่าที่ครูตั้งไว้)

**นอก scope (v1):** sync นักเรียน→ครู, ตัวตน/รายชื่อนักเรียน, dashboard ครู, ตัวนับผู้ชม,
ปุ่ม "เรียกทุกคนกลับ", login

## การตัดสินใจหลัก

| # | เรื่อง | ข้อตกลง |
|---|---|---|
| 1 | Use case | ครูสาธิต → นักเรียนดูเครื่องตัวเอง, default ตามครู, sync ทางเดียว ครู→นักเรียน |
| 2 | Transport | Cloudflare Worker + Durable Object (relay เขียนเอง), client ใช้ `WebSocket` native ไม่มี SDK |
| 3 | ห้อง/สิทธิ์ | รหัสห้องตัวเลข 4 หลัก + teacher token ลับ (`localStorage` ครู), ไม่มี login |
| 4 | ขอบเขตห้อง | 1 ห้อง = 1 คาบ — ครูเปลี่ยนเรื่อง นักเรียนโหมดตามครูถูกพาไปด้วย |
| 5 | Fidelity | sync param + play/pause/reset + เวลาเริ่ม (นาฬิกา relay) + seed, แต่ละเครื่องคำนวณเอง |
| 6 | Integration | `shared/sync.js` + แต่ละหน้าประกาศ `Sync.param(name, {get, set})` แบบ declarative |
| 7 | อะไร sync | ฟิสิกส์ sync / ความชอบการแสดงผลส่วนตัวไม่ sync (ตารางด้านล่าง) |
| 8 | UX นักเรียน | ตามครู = control ล็อก, ต้องกด "ทดลองเอง" ก่อน, กด "กลับไปตามครู" → snap ค่าครู |
| 9 | เปิด/เข้าห้อง | ปุ่ม "📡 เปิดห้อง" ใน topbar (`layout.js`) → overlay รหัส 4 หลัก + QR; นักเรียนสแกน QR หรือพิมพ์รหัส |
| 10 | Rollout | pilot 3 เรื่อง (`projectile-motion`, `emfield`, `right-hand-rule`) → ใช้ในห้องจริง → ทำอีก 13 เรื่อง |

### เหตุผลเลือก Cloudflare DO แทน Supabase/Ably
- Supabase free **pause โปรเจกต์หลังไม่มี activity 7 วัน** — ปิดเทอมแล้วกลับมาใช้ไม่ได้ทันที
- ครูลาก slider ≈ 20 msg/s × 40 คน — DO + WebSocket Hibernation นับข้อความแบบ 20:1 อยู่ใน free tier สบาย;
  บริการ broadcast ส่วนใหญ่นับต่อผู้รับ เสี่ยงโควตาเดือนหมด
- ไม่ต้อง vendor SDK (กฎ no-CDN), relay เป็นโค้ดเราเอง < 100 บรรทัด ย้ายเจ้าได้

## สิ่งที่ sync / ไม่ sync

| สิ่ง | sync? | หมายเหตุ |
|---|---|---|
| `topicId` (เรื่องที่เปิดอยู่) | ✅ | นักเรียนโหมดทดลองเอง: แค่ banner "ครูไปเรื่อง X แล้ว" ไม่ navigate เอง |
| param จาก slider/สวิตช์ | ✅ | ส่งค่า absolute เสมอ — ห้ามส่ง "toggle" |
| play/pause/reset + เวลา + seed | ✅ | ดู "Time model" |
| ลากบน canvas (ตำแหน่งประจุ, วัตถุหน้าเลนส์) | ✅ | ประกาศเป็น param ปกติ |
| มุมกล้อง 3D (theta/phi) | ✅ | throttle ≤ 15 Hz; ระยะซูม (radius) ไม่ sync เพราะขึ้นกับขนาดจอ |
| เสียง (`soundwave`) | ❌ | `local: true` — มือถือ 40 เครื่องดังพร้อมกัน + autoplay policy บล็อกอยู่แล้ว |
| light/dark, scroll, zoom หน้า | ❌ | ความชอบส่วนตัว / จอต่างขนาด |

## สถาปัตยกรรม

```
┌── Vercel (static, เหมือนเดิม) ──┐          ┌── Cloudflare ─────────────────────┐
│ topics/<id>/index.html          │   wss    │ _relay/ Worker                    │
│   Sync.param(...)  ─────────────┼─────────▶│   POST /rooms → {code, token}     │
│ shared/sync.js  (client)        │◀─────────┼─  GET  /rooms/:code/ws (upgrade)  │
│ shared/layout.js (ปุ่ม/overlay) │          │   Durable Object 1 ตัว / ห้อง      │
│ shared/vendor/qrcode.min.js     │          │   เก็บ state ล่าสุด + broadcast     │
└─────────────────────────────────┘          └───────────────────────────────────┘
```

### Relay (`_relay/`)
- **ไม่รู้เรื่องฟิสิกส์** — เก็บ room state เป็น JSON ทึบ, merge patch, broadcast
- `POST /rooms` → สุ่มรหัส 4 หลักที่ว่าง (registry DO หรือ lookup DO by name แล้วเช็คว่ามี owner หรือยัง),
  คืน `{ code, teacherToken }`
- `GET /rooms/:code/ws?token=...` → ถ้า token ตรง = connection ครู (เขียนได้), ไม่มี/ไม่ตรง = viewer (อ่านอย่างเดียว)
- ข้อความจาก viewer ถูกทิ้งทั้งหมด ยกเว้น `ping`
- ห้องหมดอายุเมื่อไม่มี connection ครู/ข้อความ 3 ชั่วโมง (DO alarm) → รหัสว่างให้ใช้ใหม่
- ใช้ WebSocket Hibernation API (`state.acceptWebSocket`) ลดค่าใช้จ่าย
- ให้ `serverNow` ใน welcome/ping เพื่อ client คำนวณ clock offset
- CORS/Origin allowlist: โดเมน Vercel ของเว็บ + `localhost`

### Wire protocol (JSON)
```
ครู → relay   { type: 'patch', state: { params?: {...}, play?: {...}, topicId?: '...' } }
relay → ทุกคน { type: 'state', state: <full merged state>, serverNow }
ทุกคน ↔ relay { type: 'ping' } / { type: 'pong', serverNow }
relay → ทุกคน { type: 'closed' }   // ครูกดปิดห้อง / หมดอายุ
```
เข้าห้องทีหลัง = ได้ `state` เต็มก้อนแรกทันที (late-join ไม่ต้อง replay log)

### Room state
```js
{
  topicId: 'projectile-motion',
  params:  { angle: 42, v0: 22 },                       // ของ topic ปัจจุบันเท่านั้น
  play:    { playing: true, simT0: 0, serverT0: 1732170000000, seed: 12345 },
  camera:  { theta: 0.61, phi: 1.08 }                    // เฉพาะ sim 3D
}
```
เปลี่ยน `topicId` → `params`/`play` ถูกล้าง แล้วหน้าใหม่ของครู publish ค่าเริ่มต้นของตัวเอง

### Time model (ข้อ 5)
- client วัด `offset = serverNow - Date.now()` (เฉลี่ยจาก ping หลายครั้ง)
- `simT ปัจจุบัน = simT0 + (Date.now() + offset - serverT0) / 1000 × timeScale` เมื่อ `playing`
- sim ต้องเปิด API `seek(simT)` — ไม่พึ่ง tick count:
  - sim ที่เป็นสมการปิดของเวลา (projectile, pendulum, shm, circular) → คำนวณตรง
  - sim ที่ integrate ทีละ step (emfield release, collision, gas) → fixed timestep จาก state เริ่มต้น
    แล้ว fast-forward ถึง `simT` — deterministic ถ้าใช้ seed + fixed dt
  - **projectile ตอนนี้ผูก `state.t += 0.03` กับ `setInterval(16)`** → ต้องแปลงเป็น `t` จากเวลาจริง × timeScale
- sim ที่สุ่ม (`gas-particles`, `heat-transfer`) → เปลี่ยน `Math.random` เป็น seeded PRNG (mulberry32) รับ seed จาก play
- ยอมรับคลาดกันระดับไม่กี่ ms — "เห็นสิ่งเดียวกัน" ไม่ใช่ pixel-perfect

### Client API (`shared/sync.js`)
```js
// ในหน้าเรื่อง หลังสร้าง sim
Sync.param('angle', { get: () => sim.getAngle(), set: v => sim.setAngle(v) });
Sync.param('v0',    { get: () => sim.getV0(),    set: v => sim.setV0(v) });
Sync.player({ play: t => sim.play(t), pause: t => sim.pause(t), reset: () => sim.reset(),
              seek: t => sim.seek(t), seed: s => sim.setSeed(s) });
Sync.param('sound', { local: true, ... });   // ไม่ส่ง
Sync.camera({ get, set });                    // 3D เท่านั้น, throttle ในตัว
// UI ที่ผู้ใช้แตะ → เรียก Sync.changed('angle') หลังเปลี่ยนค่า (ครู = ส่ง patch)
```
- **`set` ต้องอัปเดตทั้ง sim และ UI** — ส่วนใหญ่ได้ฟรีเพราะหน้าปัจจุบัน render knob/ค่าจาก `onUpdate` ของ sim
  (เช่น projectile) แต่ต้องตรวจทุกหน้าว่าไม่มี UI state นอก sim
- role ของหน้า: `none` (ปกติ ไม่ต่อ relay เลย), `teacher`, `student-follow`, `student-explore`
- ถ้าหน้าไม่ได้เรียก `Sync.param` เลย → ถือว่า "ยังไม่รองรับ sync": ครูไม่เห็นปุ่มเปิดห้อง,
  นักเรียนที่ถูกพามาเห็นข้อความ "เรื่องนี้ยังไม่รองรับการดูตามครู"
- role/รหัสห้องข้ามหน้าด้วย `sessionStorage` (+ `?room=` ใน URL สำหรับนักเรียนเข้าครั้งแรก)
- reconnect อัตโนมัติ (backoff 1→2→5→10 s) แล้วรับ state เต็มใหม่; แถบสถานะแสดง "กำลังเชื่อมต่อใหม่…"
- ครูส่ง patch แบบ throttle (≈ 20 Hz ระหว่างลาก + ส่งค่าสุดท้ายเสมอตอนปล่อย)

### UX
**ครู:** ปุ่ม "📡 เปิดห้อง" ใน topbar (เฉพาะหน้าที่รองรับ sync) → overlay เต็มจอ: รหัส 4 หลักตัวโต + QR
(`https://<site>/?room=4821`) + URL สั้น → ย่อเป็น badge "ห้อง 4821 · ปิดห้อง" มุมจอ
**นักเรียน:** หน้าแรกมีช่อง "เข้าห้อง" (4 หลัก) — หรือสแกน QR → redirect ไปเรื่องที่ครูเปิดอยู่
- โหมดตามครู: control ทั้งหมด disabled (มองเห็นค่าได้), แถบบน "👀 ตามครู · ห้อง 4821 · [ทดลองเอง]"
- โหมดทดลองเอง: control ใช้ได้, แถบ "🔓 ทดลองเอง · [กลับไปตามครู]", ค่าครูยังรับเข้า buffer เงียบๆ
- กลับไปตามครู → apply state ล่าสุดจาก buffer ทันที
- ห้องปิด → แถบ "ครูปิดห้องแล้ว" + กลับเป็น role `none` (หน้าใช้งานได้ปกติ)
- สไตล์ของปุ่ม/overlay/แถบ ใช้ token จาก `shared/styles.css` เท่านั้น (ทำงานได้ทุก skin)

### QR
vendor library QR ขนาดเล็ก (no-dependency, MIT, ≈ 10–20 KB min) ลง `shared/vendor/` —
**lazy-load เฉพาะตอนครูกดเปิดห้อง** ไม่กระทบความเร็วหน้าปกติ

## กฎ/เอกสารที่ต้องแก้
- `AGENTS.md`, `_system/ARCHITECTURE.md` §2/§3/§6: "ไม่มี backend" → "มี backend ได้ตัวเดียว = `_relay/`
  (Cloudflare Worker, relay ทึบ ไม่มี logic ฟิสิกส์ ไม่เก็บข้อมูลส่วนตัว) deploy แยกด้วย `wrangler deploy`"
- `_system/ARCHITECTURE.md` เพิ่ม §8 Live Sync
- `README.md`: วิธี deploy relay + วิธีใช้ห้องเรียน
- skill `page-template`: หน้าเรื่องต้องประกาศ `Sync.param` ครบทุก control + `Sync.player` ถ้ามี play
- skill `simulation-patterns`: sim ใหม่ต้องมี getter ทุก param, `seek(t)`, seeded random, ไม่มี toggle-only API
- skill `build-workflow` verify step: เพิ่ม 2-tab test (ดูด้านล่าง)
- `shared/config.js`: เพิ่ม `syncUrl` (URL ของ relay) — ว่าง = ปิดฟีเจอร์ทั้งเว็บ

## Testing
- **Relay:** unit test ด้วย `wrangler dev` / vitest-pool-workers (dev-time เท่านั้น ไม่ commit `node_modules`;
  `_relay/package.json` เป็นข้อยกเว้นเฉพาะโฟลเดอร์นี้)
- **2-tab smoke (claude-in-chrome)** ต่อ relay local:
  1. แท็บ A เปิดห้อง, แท็บ B เข้าด้วยรหัส → B ไปหน้าเรื่องเดียวกัน
  2. ลากทุก control ใน A → ค่าใน tile และตำแหน่ง knob ใน B ตรงกัน
  3. กดเล่นใน A → B เล่นด้วย, `t` ต่างกัน < 100 ms
  4. เปิดแท็บ C ระหว่างเล่น (late join) → ได้ค่า + เวลาปัจจุบัน
  5. B กดทดลองเอง → เปลี่ยนค่าได้, A เปลี่ยนค่า → B ไม่ขยับ; กดกลับ → snap ค่า A
  6. A เปลี่ยนเรื่อง → B ตามไป
  7. ตัด relay แล้วเปิดใหม่ → reconnect + state ครบ
  8. ไม่มี console error ทุกแท็บ; หน้าที่ไม่ได้เข้าห้องไม่เปิด WebSocket เลย

## Rollout
1. relay + `shared/sync.js` + UI ใน `layout.js` + หน้าแรกช่องเข้าห้อง + QR
2. pilot: `projectile-motion` (time/seek), `emfield` (canvas drag + toggle→absolute + integrate), `right-hand-rule` (camera 3D)
3. ครูใช้ในห้องจริง 1–2 คาบ → ปรับ contract ถ้าจำเป็น
4. ทยอยอีก 13 เรื่อง (subagent ขนานได้) + อัปเดต skills

## ความเสี่ยงที่รู้อยู่
- Wi-Fi โรงเรียนบางที่บล็อก WebSocket/โดเมน `workers.dev` → ใช้ custom domain ได้ภายหลัง; หน้ายังใช้ได้ปกติแบบ offline
- sim ที่ integrate ทีละ step + fast-forward อาจหนักบนมือถือเก่าถ้า `simT` ยาว → cap ระยะ fast-forward
- `emfield` drag handle ถูกสร้างใหม่ทุก render (`attachDrag`) — ต้องดู interaction กับการล็อก control ฝั่งนักเรียน
