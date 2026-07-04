---
name: publish-workflow
description: ใช้เมื่อครู review และอนุมัติ page แล้ว และต้องนำขึ้นเว็บ + อัปเดตสารบัญ. Trigger เมื่อผู้ใช้พูดว่า "อนุมัติแล้ว", "publish", "เอาขึ้นเว็บ", "deploy เรื่องนี้". เป็นขั้นที่ 3 (สุดท้าย) ของ workflow เพิ่มเรื่อง. ห้ามรันก่อนครูอนุมัติ.
---

# Publish Workflow

นำเรื่องที่ครูอนุมัติแล้วขึ้นเว็บ + เติมเข้าสารบัญ ทำงานหลัง review ผ่านเท่านั้น

## ขั้นตอน
1. ตรวจว่ามีครบ: `topics/<id>/index.html` และ `topics/<id>/spec.md`
2. อ่าน frontmatter จาก `spec.md` (id, title, level, category)
3. **Validate schema** ก่อนเขียน: `id` เป็น kebab-case และตรงกับชื่อโฟลเดอร์จริง, `level` ต้องเป็น `ม.ต้น` หรือ `ม.ปลาย` เท่านั้น, `category` ต้องเป็นหนึ่งใน 6 ค่าคงที่ (กลศาสตร์ | ไฟฟ้า-แม่เหล็ก | คลื่น-เสียง | ความร้อน | แสง | อื่นๆ) — ถ้าไม่ตรง หยุดและถามก่อน อย่าเดา
4. โหลด skill `navigation` แล้วเติม entry ใหม่เข้า `_system/topics.json`:
   `{ "id", "title", "level", "category", "path": "topics/<id>/", "active": true }`
   - ถ้า id ซ้ำ → อัปเดต entry เดิม ไม่สร้างซ้ำ
   - จัดเรียงตาม category แล้ว title
5. commit (Conventional Commits: `feat(topics): ...` หรือ `feat: add <id> topic`) + push เข้า repo (Vercel deploy อัตโนมัติ)

## กฎ
- ห้าม push ถ้าครูยังไม่อนุมัติ
- ห้ามแก้ `index.html` หน้าสารบัญโดยตรง (มัน render จาก topics.json)
- ห้ามแตะไฟล์เรื่องอื่น
- การ "ลบ" เรื่องที่เคย publish แล้ว = soft-delete เท่านั้น (`active: false`) ห้ามลบโฟลเดอร์ `topics/<id>/` เป็นส่วนหนึ่งของ workflow ปกติ — การลบไฟล์จริงต้องเป็นคำสั่งแยกที่ชัดเจนจากครู

## Output
`_system/topics.json` อัปเดต + commit/push สำเร็จ → เรื่องขึ้นเว็บ + อยู่ในสารบัญ
