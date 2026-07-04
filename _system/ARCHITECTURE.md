# Architecture & Tech Requirements

เอกสารนี้เก็บ "ทำไม" เบื้องหลังโครงสร้าง/เทคโนโลยี/กระบวนการของ project — `AGENTS.md` เป็นจุดเริ่มอ่าน (workflow + กฎห้ามฝ่าฝืน), เอกสารนี้ขยายรายละเอียดเชิงเทคนิคที่ไม่ต้องโหลดทุก session

## 1. Project Structure

```
physics-sim/
├── index.html              # สารบัญ — render จาก _system/topics.json ห้ามแก้ตรงๆ
├── shared/
│   ├── styles.css          # design tokens เดียว — ทุกเรื่องอ้างผ่านตรงนี้เท่านั้น
│   ├── layout.js            # โครง 5 ส่วน + dark/light toggle
│   └── sim/<pattern>.js     # คลัง simulation ใช้ซ้ำข้ามเรื่อง
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
| ห้าม external font/CDN/analytics | build-workflow verify |
| `topics.json` schema ต้องถูก (level/category/id) | publish-workflow |
| ลบเรื่อง = soft-delete (`active:false`) เท่านั้น | publish-workflow |
| commit ตรง `main`, Conventional Commits prefix | ทุก commit |
| ไม่มี `package.json`/build step ที่ commit | ทั้ง repo |
