# Architecture & Tech Requirements

เอกสารนี้เก็บ "ทำไม" เบื้องหลังโครงสร้าง/เทคโนโลยี/กระบวนการของ project — `AGENTS.md` เป็นจุดเริ่มอ่าน (workflow + กฎห้ามฝ่าฝืน), เอกสารนี้ขยายรายละเอียดเชิงเทคนิคที่ไม่ต้องโหลดทุก session

## 1. Project Structure

```
physics-sim/
├── index.html              # สารบัญ — render จาก _system/topics.json ห้ามแก้ตรงๆ
├── shared/
│   ├── config.js            # เลือก skin ระดับ deploy + ทะเบียน skin/modes/fontsUrl (ดู §7)
│   ├── styles.css          # design tokens เดียว — ทุกเรื่องอ้างผ่านตรงนี้เท่านั้น (= dot-matrix skin)
│   ├── skins/<name>.css     # skin อื่นนอกจาก dot-matrix — CSS ล้วน scope ใต้ [data-skin] (ดู §7)
│   ├── layout.js            # โครง 5 ส่วน + dark/light toggle + stamp data-skin + dispatch themechange
│   └── sim/<pattern>.js     # คลัง simulation ใช้ซ้ำข้ามเรื่อง — ต้อง resolve สีจาก token + ฟัง themechange
├── topics/<id>/
│   ├── index.html           # 1 เรื่อง = 1 หน้า = 1 ระดับชั้น
│   └── spec.md              # content spec เก็บคู่ไว้ regenerate หน้าใหม่ได้เสมอ
├── _system/
│   ├── topics.json          # แหล่งความจริงเดียวขับสารบัญ + active/soft-delete flag
│   ├── spec-format.md        # ฟอร์มมาตรฐานของ spec.md
│   └── ARCHITECTURE.md       # เอกสารนี้
├── .claude/skills/           # workflow + knowledge skills (อ่านได้ทั้ง Claude Code และ opencode)
├── AGENTS.md / CLAUDE.md
└── vercel.json
```

หลักการ: **1 เรื่อง = 1 โฟลเดอร์ปิดตัวเอง** (page + spec อยู่ด้วยกัน) เพื่อให้เพิ่ม/ลบเรื่องกระทบไฟล์อื่นน้อยที่สุด — สิ่งเดียวที่เชื่อมเรื่องเข้ากับเว็บคือ 1 entry ใน `topics.json`

## 2. Tech Stack

- **Vanilla HTML/CSS/JS เท่านั้น** — ไม่มี framework, ไม่มี build step, ไม่มี bundler, ไม่มี `package.json`/`node_modules` ที่ commit
- Dev server: `npx serve .`
- Deploy: push → Vercel auto-deploy (static hosting ตรงๆ)
- Dev-time tooling ที่อนุญาต (ไม่ commit ผลลัพธ์, เรียกผ่าน `npx` เฉยๆ): Prettier (format), HTML/JS linter พื้นฐาน — ใช้ตอน dev เท่านั้น ไม่กระทบ "zero build step" ตอน deploy
- ไม่มี backend, ไม่มี database, ไม่มี login — ทุกอย่าง static

## 3. Tech Direction

**Minimal / เพิ่ม-ลบเนื้อหาง่าย / fast response** — สามข้อนี้คือกรอบตัดสินใจสำหรับทุก choice ในอนาคต

- **Minimal**: ไม่เพิ่ม dependency, ไม่เพิ่ม abstraction, ไม่เพิ่ม config จนกว่าจะจำเป็นจริง
- **เพิ่ม-ลบเนื้อหาง่าย**: เพิ่มเรื่อง = สร้างโฟลเดอร์ใหม่ + 1 entry ใน topics.json (ไม่แตะไฟล์อื่น); ลบเรื่อง = soft-delete เท่านั้น (`active: false`) — ไม่ลบโฟลเดอร์เป็นส่วนหนึ่งของ workflow ปกติ เพราะ `spec.md` มีไว้ regenerate ทีหลัง การลบไฟล์จริงต้องเป็นคำสั่งแยกที่ชัดเจนจากครู ไม่ใช่ default behavior ของ skill ไหน
- **Fast response**: **ห้ามผูก external font/CDN/analytics script เด็ดขาด** — ทุกอย่างต้อง self-contained ในไฟล์ static ของ project เพราะเพิ่ม dependency ภายนอกแค่ตัวเดียวก็ขัดกับเป้าหมายนี้ทันที และ agent มักเผลอเพิ่ม Google Fonts/CDN link โดยไม่รู้ตัวว่าผิดกฎ — นี่คือกฎที่ต้อง enforce ตอน verify (ดู §5)

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
| ไม่มี `package.json`/build step ที่ commit | ทั้ง repo |

## 7. Skin System (Theme)

เพิ่มเข้ามา 2026-07 (ดู `docs/superpowers/plans/2026-07-04-theme-system.md`) — คนละ workflow กับการเพิ่ม/แก้เรื่อง
ข้างบน: skin เป็น **การตัดสินใจระดับ deploy** ไม่ใช่เนื้อหา จึงไม่ผ่าน spec-workflow/build-workflow/publish-workflow

**สองแกนที่แยกกัน:**
- **Skin** = visual identity เต็มรูปแบบ (สี ฟอนต์ เงา ลวดลาย) — deployer เลือกครั้งเดียวทั้งเว็บผ่าน `shared/config.js`
- **Mode** = light/dark ภายใน skin — ผู้ใช้กดปุ่ม toggle เอง, จำใน `localStorage`; skin ที่รองรับโหมดเดียวจะถูกบังคับโหมดนั้นและซ่อนปุ่ม toggle อัตโนมัติ

**สถาปัตยกรรม (ไล่ตามลำดับโหลด):**
1. `shared/config.js` — data ล้วน โหลด sync ก่อนทุกอย่าง: `{ skin, skins: { <name>: { modes, fontsUrl? } } }`
2. `shared/layout.js` — อ่าน config แล้ว sync ก่อน paint: แสตมป์ `data-skin` บน `<html>`, บังคับ `data-theme` ถ้า skin รองรับโหมดเดียว, แทรก `<link rel="stylesheet">` จาก `fontsUrl` ถ้า skin นั้นประกาศไว้, และ dispatch `physics-sim:themechange` ทุกครั้งที่ skin/mode เปลี่ยน
3. `shared/skins/<name>.css` — CSS ล้วน scope ใต้ `:root[data-skin="<name>"]` เท่านั้น override ได้เฉพาะ token ที่ `:root` ใน `shared/styles.css` ประกาศไว้แล้ว (token contract) ห้ามเพิ่มชื่อ token ใหม่ ห้ามแตะโครง DOM
4. sim ที่วาดลง canvas (เช่น `shared/sim/vector3d.js`) resolve สีจาก CSS token ตอนสร้าง แล้วต้องฟัง `physics-sim:themechange` เพื่อล้าง cache + re-resolve สีใหม่ (ไม่งั้นสีจะค้างตอนสลับ skin/mode — เคยเป็นบั๊กจริงมาก่อน)
5. ไม่ระบุ `data-skin` เลย (เช่น JS พัง) = ยัง fallback เป็น dot-matrix ได้จาก `:root` ของ `shared/styles.css` ตรงๆ โดยไม่พึ่ง JS

**เปลี่ยน skin ที่ deploy อยู่:** แก้บรรทัด `skin: 'dot-matrix'` ใน `shared/config.js` เป็นชื่อ skin ที่ต้องการ แล้ว commit/push — ดูขั้นตอนเต็มใน `README.md` หัวข้อ "เปลี่ยน skin"

**เพิ่ม skin ใหม่:** สร้าง `shared/skins/<name>.css` ตามกฎ token contract ข้างบน, ลิงก์ไฟล์นั้นในทุกหน้า (ต่อจาก `styles.css` ใน `<head>`), ลงทะเบียนใน `skins` ของ `config.js` (พร้อม `fontsUrl` ถ้าต้องใช้ฟอนต์ภายนอก) — รายละเอียดกฎเต็มอยู่ใน skill `page-template` ส่วน "Skin system"
