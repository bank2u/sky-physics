# physics-sim

เว็บ static สื่อการสอนฟิสิกส์ ม.ต้น–ม.ปลาย เน้น simulation ปรับค่าได้
ครูใช้แชร์จอประกอบการสอน. ไม่มี backend / ไม่มี login. host บน Vercel.

## หลักการที่ห้ามฝ่าฝืน
- Layout 5 ส่วนของทุก page เหมือนกันเสมอ: หัวเรื่อง → simulation → แผงควบคุม → ค่า realtime → คำอธิบาย/สมการ
- ใช้ design tokens จาก `shared/styles.css` เท่านั้น ห้ามฝัง hex/ขนาด/ฟอนต์ใหม่ในไฟล์เรื่อง
- 1 เรื่อง = 1 ระดับชั้น (ม.ต้น และ ม.ปลาย แยกเป็นคนละ content)
- `_system/topics.json` คือแหล่งความจริงเดียวที่ขับสารบัญ — อย่าแก้ `index.html` ตรงๆ
- skin (`shared/skins/<name>.css`) ต้องเป็น CSS ล้วน scope ใต้ `[data-skin="<name>"]` เท่านั้น ห้ามแตะโครง DOM และ override ได้เฉพาะ token ที่ `shared/styles.css` ประกาศไว้แล้ว — เปลี่ยน skin ทั้งเว็บแก้ที่ `shared/config.js` จุดเดียว (ดู README.md หัวข้อ "เปลี่ยน skin")

## โครงสร้าง
- `topics/<id>/` — 1 เรื่อง: `index.html` (page) + `spec.md` (content spec, เก็บคู่ไว้เพื่อ regenerate)
- `shared/styles.css` — design system | `shared/layout.js` — โครง 5 ส่วน | `shared/sim/*.js` — คลัง simulation ใช้ซ้ำ
- `shared/config.js` — เลือก skin ระดับ deploy | `shared/skins/<name>.css` — skin เป็น CSS ล้วน scope ใต้ `[data-skin]` ต้องใช้ token contract เดิม ห้ามแตะ DOM
- `_system/spec-format.md` — ฟอร์มมาตรฐาน | `_system/topics.json` — ทะเบียนเรื่อง
- `.claude/skills/` — workflow + knowledge skills (อ่านได้ทั้ง Claude Code และ opencode)
- `_system/ARCHITECTURE.md` — tech stack, git strategy, verify/test flow, guardrails (รายละเอียดเบื้องหลังไฟล์นี้)

## Workflow เพิ่มเรื่องใหม่ (ทำตามลำดับ)
1. คุยกับครู → ใช้ skill `spec-workflow` ร่าง `topics/<id>/spec.md`
2. ใช้ skill `build-workflow` สร้าง `topics/<id>/index.html` จาก spec
3. ครู review ความถูกต้องฟิสิกส์ + การแสดงผล (แก้วนได้)
4. หลังครูอนุมัติ → ใช้ skill `publish-workflow` เติม `topics.json` + commit/push

## Skills
Workflow: `spec-workflow`, `build-workflow`, `publish-workflow`
Knowledge: `physics-content`, `page-template`, `simulation-patterns`, `navigation`
โหลดรายละเอียดจาก `.claude/skills/<name>/SKILL.md` เมื่อต้องใช้

## คำสั่ง
- dev: เปิด `index.html` ด้วย static server (เช่น `npx serve`)
- deploy: push เข้า repo → Vercel deploy อัตโนมัติ
