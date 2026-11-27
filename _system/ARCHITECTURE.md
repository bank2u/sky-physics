# Architecture & Tech Requirements

เอกสารนี้เก็บ "ทำไม" เบื้องหลังโครงสร้าง/เทคโนโลยี/กระบวนการของ project — `AGENTS.md` เป็นจุดเริ่มอ่าน (workflow + กฎห้ามฝ่าฝืน), เอกสารนี้ขยายรายละเอียดเชิงเทคนิคที่ไม่ต้องโหลดทุก session

## 1. Project Structure

```
physics-sim/
├── index.html              # สารบัญ — render จาก _system/topics.json ห้ามแก้ตรงๆ
├── sw.js                   # service worker ของโหมด offline — ต้องอยู่ root (scope ทั้งเว็บ) ดู §9
├── shared/
│   ├── config.js            # เลือก skin ระดับ deploy + ทะเบียน skin/modes/fontsUrl (ดู §7)
│   ├── styles.css          # design tokens เดียว — ทุกเรื่องอ้างผ่านตรงนี้เท่านั้น (= dot-matrix skin)
│   ├── skins/<name>.css     # skin อื่นนอกจาก dot-matrix — CSS ล้วน scope ใต้ [data-skin] (ดู §7)
│   ├── layout.js            # โครง 5 ส่วน + dark/light toggle + stamp data-skin + dispatch themechange + โหลด sync (ถ้ามี syncUrl)
│   ├── sync-core.js         # logic ล้วนของ live sync (merge state, clock, topicIdFromPath) — มี unit test ใน tests/
│   ├── sync.js              # UI + WebSocket ของ live sync, expose window.Sync (ดู §8)
│   ├── manifest.webmanifest # PWA manifest (layout.js แทรก <link rel="manifest"> + apple-touch-icon/theme-color ให้ทุกหน้า)
│   ├── icons/               # ไอคอนแอป: icon.svg (ต้นฉบับ) → icon-192/512.png, apple-touch-icon.png (render จาก svg)
│   ├── vendor/qrcode.js     # qrcode-generator 1.4.4 (MIT) — lazy-load เฉพาะตอนครูเปิด overlay
│   └── sim/<pattern>.js     # คลัง simulation ใช้ซ้ำข้ามเรื่อง — ต้อง resolve สีจาก token + ฟัง themechange
├── topics/<id>/
│   ├── index.html           # 1 เรื่อง = 1 หน้า = 1 ระดับชั้น
│   └── spec.md              # content spec เก็บคู่ไว้ regenerate หน้าใหม่ได้เสมอ
├── _system/
│   ├── topics.json          # แหล่งความจริงเดียวขับสารบัญ + active/soft-delete flag
│   ├── spec-format.md        # ฟอร์มมาตรฐานของ spec.md
│   └── ARCHITECTURE.md       # เอกสารนี้
├── _relay/                  # relay ของ live sync (Cloudflare Worker + Durable Object) — ไม่ขึ้น Vercel (ดู §8)
│   ├── src/ · test/ · wrangler.toml
├── tests/                   # unit test ของ client (node --test)
├── .vercelignore            # ยกเว้น _relay/ tests/ docs/ ออกจาก deploy
├── .claude/skills/           # workflow + knowledge skills (อ่านได้ทั้ง Claude Code และ opencode)
├── AGENTS.md / CLAUDE.md
└── vercel.json
```

หลักการ: **1 เรื่อง = 1 โฟลเดอร์ปิดตัวเอง** (page + spec อยู่ด้วยกัน) เพื่อให้เพิ่ม/ลบเรื่องกระทบไฟล์อื่นน้อยที่สุด — สิ่งเดียวที่เชื่อมเรื่องเข้ากับเว็บคือ 1 entry ใน `topics.json`

## 2. Tech Stack

- **Vanilla HTML/CSS/JS เท่านั้น** — ไม่มี framework, ไม่มี build step, ไม่มี bundler, ไม่มี `package.json`/`node_modules` ที่ commit
- Dev server: `npx serve .`
- Deploy: push → Vercel auto-deploy (static hosting ตรงๆ); relay deploy แยกด้วย `npx wrangler@4 deploy` จาก `_relay/`
- Dev-time tooling ที่อนุญาต (ไม่ commit ผลลัพธ์, เรียกผ่าน `npx` เฉยๆ): Prettier (format), HTML/JS linter พื้นฐาน — ใช้ตอน dev เท่านั้น ไม่กระทบ "zero build step" ตอน deploy
- ไม่มี database, ไม่มี login — เว็บทั้งหมดเป็น static **ข้อยกเว้นเดียว**: relay ของ live sync ใน `_relay/` (ดู §8) — เป็น backend ทึบ ไม่มี logic ฟิสิกส์ ไม่เก็บข้อมูลส่วนตัว deploy แยกจากเว็บ ถ้าไม่ตั้ง `syncUrl` เว็บก็ยัง static ล้วนเหมือนเดิม
- ไม่มี `package.json` ที่ commit **รวม `_relay/`** — เรียก wrangler ผ่าน `npx wrangler@4` ตรงๆ

## 3. Tech Direction

**Minimal / เพิ่ม-ลบเนื้อหาง่าย / fast response** — สามข้อนี้คือกรอบตัดสินใจสำหรับทุก choice ในอนาคต

- **Minimal**: ไม่เพิ่ม dependency, ไม่เพิ่ม abstraction, ไม่เพิ่ม config จนกว่าจะจำเป็นจริง
- **เพิ่ม-ลบเนื้อหาง่าย**: เพิ่มเรื่อง = สร้างโฟลเดอร์ใหม่ + 1 entry ใน topics.json (ไม่แตะไฟล์อื่น); ลบเรื่อง = soft-delete เท่านั้น (`active: false`) — ไม่ลบโฟลเดอร์เป็นส่วนหนึ่งของ workflow ปกติ เพราะ `spec.md` มีไว้ regenerate ทีหลัง การลบไฟล์จริงต้องเป็นคำสั่งแยกที่ชัดเจนจากครู ไม่ใช่ default behavior ของ skill ไหน
- **Fast response**: **ห้ามผูก external font/CDN/analytics script เด็ดขาด** — ทุกอย่างต้อง self-contained ในไฟล์ static ของ project (ยกเว้น relay ของ live sync ใน `_relay/` ซึ่งเป็น backend ที่ deploy แยก ดู §8 — client ฝั่งเว็บยังห้าม CDN/external script เหมือนเดิม) เพราะเพิ่ม dependency ภายนอกแค่ตัวเดียวก็ขัดกับเป้าหมายนี้ทันที และ agent มักเผลอเพิ่ม Google Fonts/CDN link โดยไม่รู้ตัวว่าผิดกฎ — นี่คือกฎที่ต้อง enforce ตอน verify (ดู §5)

## 4. Git Strategy

- **Solo maintainer** — ไม่มี PR review gate, ไม่มี long-lived feature branch
- Local git ก่อน, push ไป GitHub (public repo) ทีหลัง; Vercel ผูกกับ repo เพื่อ auto-deploy จาก `main`
- **Trunk-based**: commit ตรงเข้า `main` เป็นค่า default ทั้งหมด — checkpoint ตามธรรมชาติของ workflow คือ "ก่อน publish-workflow" (ครู approve ก่อนขึ้นเว็บอยู่แล้ว ไม่ต้องมี PR ซ้อน)
- ใช้ short-lived branch เฉพาะตอนเปลี่ยนอะไรที่เสี่ยงและกระทบทุกเรื่อง (เช่น refactor `shared/`) — เพื่อมี escape hatch ง่ายๆ ไม่ใช่ ceremony ปกติ
- **Commit message = Conventional Commits prefix (อังกฤษ) + description ไทยหรืออังกฤษก็ได้**:
  - `feat(topics): เพิ่มเรื่อง projectile-motion`
  - `fix(sim): แก้สมการ pendulum`
  - `chore(shared): update design tokens`
  - `docs: ...`
  - scope ผูกกับ `topics/<id>`, `shared/`, หรือ `_system/`
- **ไม่มี CHANGELOG แยก** — อ่าน history จาก `git log` (อ่านง่ายเพราะ commit convention ข้างบน) พอสำหรับ solo maintainer ที่ไม่มี release cycle

## 5. Agent & Skill: Dev/Test

Workflow เพิ่มเรื่องยังเป็น 3 ขั้นเหมือนเดิม แต่ build-workflow เพิ่ม verify step บังคับ:

```
spec-workflow → build-workflow (สร้าง page + verify บังคับ) → ครู review → publish-workflow
```

**Verify step (อยู่ใน `build-workflow` ไม่ใช่ skill แยก — เพราะต้องรันทุกครั้งไม่มีข้อยกเว้น):**
1. Structural lint: spec ครบ field, ไม่มี hex/px ฝังตรง, ลำดับ 5 ส่วนถูก, topics.json entry ชี้ไปโฟลเดอร์จริง
2. Browser smoke check (`claude-in-chrome` tool): เปิดหน้า → ไม่มี console error → ลองปรับทุก control ดูค่า realtime เปลี่ยนจริง

**Schema validation (อยู่ใน `publish-workflow`):** `id` kebab-case ตรงชื่อโฟลเดอร์, `level` ∈ {ม.ต้น, ม.ปลาย}, `category` ∈ 6 ค่าคงที่ — ผิดแล้วหยุดถามแทนเดา

สิ่งที่ **ไม่** ทำ: ไม่มี unit test อัตโนมัติสำหรับความถูกต้องเชิงฟิสิกส์/pedagogy ของ simulation — ส่วนนั้นเป็น "ครู review" (มนุษย์) ต่อไป เพราะ physics ที่ "ถูก" ในเชิงสอนเป็นเรื่อง judgment ไม่ใช่สิ่งที่ assert เป็นตัวเลขได้ตรงไปตรงมา

Skill map ปัจจุบัน:
- Workflow: `spec-workflow`, `build-workflow` (รวม verify), `publish-workflow`
- Knowledge: `physics-content`, `page-template`, `simulation-patterns`, `navigation`

## 6. Guardrails สรุป

| กฎ | บังคับใช้ที่ |
|----|--------------|
| ห้ามฝัง hex/px ตรงๆ | build-workflow verify |
| ห้าม external font/CDN/analytics — **ยกเว้น** font ที่ skin ประกาศผ่าน `fontsUrl` ใน `shared/config.js` (โหลดแบบมีเงื่อนไขโดย `layout.js` เฉพาะตอน skin นั้น active เท่านั้น — ห้าม `@import` ตรงในไฟล์ skin css เพราะไม่ถูก scope ด้วย `[data-skin]`, ดู §7) | build-workflow verify + skin review |
| `topics.json` schema ต้องถูก (level/category/id) | publish-workflow |
| ลบเรื่อง = soft-delete (`active:false`) เท่านั้น | publish-workflow |
| commit ตรง `main`, Conventional Commits prefix | ทุก commit |
| ไม่มี `package.json`/build step ที่ commit (รวม `_relay/`) | ทั้ง repo |
| backend มีได้ตัวเดียว = `_relay/` ห้ามใส่ logic ฟิสิกส์/ข้อมูลส่วนตัวใน relay; ห้ามตั้ง `ROOM_TTL_MS` ใน production | code review |
| ห้าม CDN/external script ตอน runtime ของ sync — QR lib ต้อง vendor ใน `shared/vendor/` | build-workflow verify |
| หน้าที่รองรับ sync ต้องผ่าน 2-tab smoke (ดู §8) | build-workflow verify |

## 7. Skin System (Theme)

เพิ่มเข้ามา 2026-07 (ดู `docs/superpowers/plans/2026-07-04-theme-system.md`) — คนละ workflow กับการเพิ่ม/แก้เรื่อง
ข้างบน: skin เป็น **การตัดสินใจระดับ deploy** ไม่ใช่เนื้อหา จึงไม่ผ่าน spec-workflow/build-workflow/publish-workflow

**สองแกนที่แยกกัน:**
- **Skin** = visual identity เต็มรูปแบบ (สี ฟอนต์ เงา ลวดลาย) — deployer เลือกครั้งเดียวทั้งเว็บผ่าน `shared/config.js`
- **Mode** = light/dark ภายใน skin — ผู้ใช้กดปุ่ม toggle เอง, จำใน `localStorage`; skin ที่รองรับโหมดเดียวจะถูกบังคับโหมดนั้นและซ่อนปุ่ม toggle อัตโนมัติ

**สถาปัตยกรรม (ไล่ตามลำดับโหลด):**
1. `shared/config.js` — data ล้วน โหลด sync ก่อนทุกอย่าง: `{ skin, skins: { <name>: { modes, fontsUrl? } } }`
2. `shared/layout.js` — อ่าน config แล้ว sync ก่อน paint: แสตมป์ `data-skin` บน `<html>`, บังคับ `data-theme` ถ้า skin รองรับโหมดเดียว, แทรก `<link rel="stylesheet">` จาก `fontsUrl` ถ้า skin นั้นประกาศไว้, และ dispatch `sky-physic:themechange` ทุกครั้งที่ skin/mode เปลี่ยน
3. `shared/skins/<name>.css` — CSS ล้วน scope ใต้ `:root[data-skin="<name>"]` เท่านั้น override ได้เฉพาะ token ที่ `:root` ใน `shared/styles.css` ประกาศไว้แล้ว (token contract) ห้ามเพิ่มชื่อ token ใหม่ ห้ามแตะโครง DOM
4. sim ที่วาดลง canvas (เช่น `shared/sim/vector3d.js`) resolve สีจาก CSS token ตอนสร้าง แล้วต้องฟัง `sky-physic:themechange` เพื่อล้าง cache + re-resolve สีใหม่ (ไม่งั้นสีจะค้างตอนสลับ skin/mode — เคยเป็นบั๊กจริงมาก่อน)
5. ไม่ระบุ `data-skin` เลย (เช่น JS พัง) = ยัง fallback เป็น dot-matrix ได้จาก `:root` ของ `shared/styles.css` ตรงๆ โดยไม่พึ่ง JS

**เปลี่ยน skin ที่ deploy อยู่:** แก้บรรทัด `skin: 'dot-matrix'` ใน `shared/config.js` เป็นชื่อ skin ที่ต้องการ แล้ว commit/push — ดูขั้นตอนเต็มใน `README.md` หัวข้อ "เปลี่ยน skin"

**เพิ่ม skin ใหม่:** สร้าง `shared/skins/<name>.css` ตามกฎ token contract ข้างบน, ลิงก์ไฟล์นั้นในทุกหน้า (ต่อจาก `styles.css` ใน `<head>`), ลงทะเบียนใน `skins` ของ `config.js` (พร้อม `fontsUrl` ถ้าต้องใช้ฟอนต์ภายนอก) — รายละเอียดกฎเต็มอยู่ใน skill `page-template` ส่วน "Skin system"

## 8. Live Sync (ห้องเรียน)

เพิ่มเข้ามา 2026-11 (ดู `docs/superpowers/specs/2026-11-21-live-classroom-sync-design.md`) — ครูเปิดห้อง นักเรียนใส่รหัส 4 หลักแล้วตามค่า/เวลา/กล้องของครู
เป็นฟีเจอร์เสริมที่ปิดได้ทั้งเว็บ: `syncUrl: ''` ใน `shared/config.js` = ไม่มีปุ่ม ไม่มี WebSocket ไม่โหลด `sync*.js` (เปิดจาก `localhost` จะใช้ `syncUrlDev` แทน)

**ส่วนประกอบ**
- `_relay/` — Cloudflare Worker + Durable Object 1 ตัวต่อห้อง เก็บ state ทึบ แล้ว broadcast ไม่ตีความฟิสิกส์ ไม่เก็บข้อมูลส่วนตัว; รหัสห้อง = ตัวเลข 4 หลัก, หมดอายุเมื่อไม่มี activity 3 ชม.; ตรวจ `Origin` กับ `ALLOWED_ORIGINS` ใน `wrangler.toml`; ทิ้งข้อความ > 16 KB / ที่ไม่ใช่ JSON / patch จากนักเรียนเงียบๆ
- `shared/sync-core.js` (logic ล้วน, test ได้) + `shared/sync.js` (UI + socket) โหลดโดย `layout.js` — หน้าเรื่องเรียก `Sync.*` ก่อน sync.js พร้อมได้ (layout.js เก็บคิวไว้แล้ว drain ให้)
- `shared/vendor/qrcode.js` = qrcode-generator 1.4.4 (MIT) lazy-load ตอนครูเปิด overlay เท่านั้น
- ช่องเข้าห้องที่หน้าแรกถูก inject โดย `sync.js` — ไม่แก้ `index.html` ตรงๆ

**บทบาท:** `none` → `teacher` | `student-follow` ⇄ `student-explore`; teacher resume จาก `localStorage` (reload/เปลี่ยนเรื่องแล้วยังเป็นครูห้องเดิม — ครูกับนักเรียนจึงต้องใช้คนละ browser profile ตอนทดสอบ); นักเรียนโหมด follow ถูก `inert` ที่ `.controls` และ `.sim-zone` โดย `sync.js` — หน้าเรื่อง**ไม่ต้อง**ล็อกอะไรเอง

**Room state:** `{ topicId, supported, params: {name: value}, play: {playing, t, serverT0}, camera }` — patch merge: `topicId` เปลี่ยน → ล้างที่เหลือ, `params` merge ราย key, ที่เหลือแทนทั้งก้อน
Wire: client→relay `patch|close|ping`, relay→client `welcome|state|pong|closed`; HTTP `POST /rooms` → `{code, teacherToken}`, `GET /rooms/:code/ws?t=<token>`
Throttle: patch ครู 50 ms + ส่งค่าสุดท้ายเสมอ, camera 66 ms; reconnect backoff 1000→2000→5000→10000 ms
ไม่มี `seed` ใน state (ตัดสินใจแล้ว: sim ที่สุ่มใช้ seeded PRNG แบบ seed คงที่ฝังใน sim แทน — ฟิลด์เวลาของ play คือ `t` ไม่ใช่ `simT0`)

**สัญญาของหน้าเรื่อง (Sync API):**
- `Sync.param(name, {get, set, local?})` — ประกาศครบทุก control; `local: true` = ไม่ sync (เช่น เสียง)
- `Sync.player({get, apply})` — ถ้ามีเล่น/หยุด; `get` = `sim.getPlayState()`, `apply` = `sim.applyPlayState()`
- `Sync.camera({get, set})` — ถ้าเป็น 3D (`sim.getView`/`sim.setView`)
- `Sync.changed(name)` — เรียกใน handler ทุกตัวที่เปลี่ยนค่า (`'play'` และ `'camera'` เป็นชื่อพิเศษ); no-op ถ้าไม่ใช่ครู
- ตัวอย่างอ้างอิง: `topics/projectile-motion/index.html` (param + player), `topics/right-hand-rule/index.html` (camera)

**สัญญาของ sim (ที่เรียนรู้จาก pilot 3 เรื่องแรก แล้วใช้กับทุกเรื่อง):**
- มี getter ของทุก param และ setter แบบ absolute (ห้ามมีแค่ toggle)
- เวลาอิงนาฬิกาจริง (wall-clock) ไม่ใช่นับ frame
- `getPlayState(): {playing, t}` และ `applyPlayState({playing, t, elapsedMs})` — `elapsedMs` ทำให้นักเรียนที่เข้าทีหลัง/ต่อใหม่กระโดดไปเวลาปัจจุบันของครู ไม่ใช่เริ่ม 0
- sim ที่ integrate ทีละ step: ใช้ DT คงที่, จำกัด catch-up ต่อ callback (ไม่ re-anchor เวลา) และใช้ค่า max-ticks ร่วมกันทั้ง live loop กับ fast-forward (ดู `shared/sim/electric-field.js` หลัง fix `0845252`)
- drag บน canvas รายงานผ่าน option `onParamChange(name)` ให้หน้าเรียก `Sync.changed`
- sim 3 มิติ: `getView`/`setView` + option `onViewChange`; `setView` ต้องไม่ยิง `onViewChange` และไม่ sync ระยะซูม (zoom radius)
- sim ที่สุ่ม (`gas-particles`, `heat-transfer`) ใช้ seeded PRNG (mulberry32) ด้วย seed คงที่ที่สร้างใหม่ทุกครั้งที่ init/reset — ทุกจอได้ layout เริ่มต้นเหมือนกัน แต่ microstate หลังจากนั้นอาจต่างกันได้ (ค่ามหภาคใน tile ต้องตรงกัน) ไม่ส่ง seed ผ่าน protocol

**Dev/Verify**
- relay: `cd _relay && npx wrangler@4 dev --port 8787` / deploy: `npx wrangler@4 deploy`
- unit: `node --test "_relay/test/*.test.mjs"` และ `node --test "tests/*.test.js"` (ใช้ glob ใน quote; ชื่อโฟลเดอร์เปล่าๆ fail บน Node 24)
- relay e2e: `node _relay/test/e2e.mjs http://localhost:8787`; ทดสอบหมดอายุ (ไม่บังคับ): รัน `wrangler dev --var ROOM_TTL_MS:3000` แล้ว `E2E_TTL_MS=3000 node _relay/test/e2e.mjs ...` — **ห้ามตั้ง `ROOM_TTL_MS` ใน production**
- 2-tab smoke: ครูแท็บ A / นักเรียนแท็บ B (ต้องคนละ browser profile เพราะ role ครูอยู่ใน `localStorage`) ทำด้วย claude-in-chrome หรือ headless Chrome ผ่าน CDP ก็ได้ — เช็ค: นักเรียนถูกพาไปเรื่องนั้น + control กดไม่ได้, ค่าตรงกันหลังครูปรับ, play แล้วเวลาตรงกัน/คนเข้าทีหลังไม่เริ่ม 0, `ทดลองเอง`/`กลับไปตามครู`, ครู reload แล้วรหัสเดิม, ไม่มี console error (ยกเว้น favicon 404 ที่รู้อยู่แล้ว) และแท็บที่ไม่อยู่ในห้องต้องไม่เปิด WebSocket
- `.vercelignore` ยกเว้น `_relay/`, `tests/`, `docs/`

**ปัญหาเดิมที่รู้แล้ว (ไม่เกี่ยวกับ sync):** หน้าเรื่องขอ `/topics/shared/favicon.svg` (404) เพราะ `<link>` ใช้ `../shared/` แทน `../../shared/` — ยังไม่แก้

## 9. Offline (Service Worker)

`/sw.js` ทำให้เว็บใช้งานได้ตอนไม่มีเน็ต หลังเปิดเว็บออนไลน์ครั้งแรกหนึ่งครั้ง — ลงทะเบียนโดย `shared/layout.js` (ข้ามบน localhost กัน cache ค้างตอน dev, เปิดทดสอบด้วย `?sw=1`)

- **precache อัตโนมัติ**: เปลือกเว็บ + ทุกเรื่อง `active` ใน `topics.json` + asset ที่แต่ละหน้าอ้างด้วย `src`/`href` (แกะจาก HTML) + ฟอนต์ Google (`fontsUrl` ของ skin ที่ active และ `@import` ใน `styles.css`) — **เพิ่มเรื่อง/ไฟล์ใหม่ไม่ต้องแก้ `sw.js`** ยกเว้น asset ที่โหลดแบบ dynamic นอก `src`/`href` ของหน้า (ต้องเติมใน `SHELL`)
- เปิดหน้าเว็บตอนออนไลน์ = ส่ง `{type:'refresh'}` ให้ SW เติม cache ใหม่ (throttle 10 นาที)
- same-origin: network-first (timeout 4 วิ แล้วใช้ cache) → ออนไลน์ได้ของใหม่เสมอ | ฟอนต์ภายนอก: cache-first (`ignoreVary` เพราะ Google ส่ง `Vary`)
- **offline = live sync ใช้ไม่ได้**: `sync.js` เช็ค `navigator.onLine` + ฟัง `online`/`offline` → ปุ่ม `📡 เปิดห้อง` กลายเป็น `📡 ออฟไลน์` (disabled) และช่องเข้าห้องในสารบัญ disabled; ห้องที่เปิดอยู่แล้วใช้ reconnect เดิม
- เปลี่ยนกลยุทธ์ cache แบบไม่เข้ากันของเดิม → เปลี่ยนชื่อ `CACHE`/`FONT_CACHE` ใน `sw.js` (activate จะลบ cache เก่าทิ้ง)
- unit test: `tests/sw.test.js` (แกะ asset + เช็คว่าทุก asset ของทุกเรื่องมีไฟล์จริง)
- **ติดตั้งเป็นแอป (PWA)**: Chrome/Edge/Android → ปุ่ม `⬇ ติดตั้งแอป` ใน topbar (โชว์เมื่อได้ `beforeinstallprompt`) หรือไอคอนติดตั้งใน address bar | iOS Safari → Share → Add to Home Screen. แอปที่ติดตั้งใช้ cache เดียวกับเว็บ จึงทำงาน offline ได้เหมือนกัน
- แก้ไอคอน: แก้ `shared/icons/icon.svg` แล้ว render PNG ใหม่ทั้ง 3 ขนาด (192, 512, 180) — เนื้อหาต้องอยู่ใน safe zone วงกลม 80% กลางภาพ เพราะ 512 ใช้เป็น `maskable` ด้วย
