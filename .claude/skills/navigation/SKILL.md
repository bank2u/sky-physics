---
name: navigation
description: กฎการเพิ่มเรื่องเข้าทะเบียน topics.json และการจัดหมวดสารบัญ. ใช้โดย publish-workflow เมื่อเติมเรื่องใหม่เข้าเว็บ. topics.json เป็นแหล่งความจริงเดียวที่ขับสารบัญ.
---

# Navigation

`_system/topics.json` คือแหล่งความจริงเดียว — `index.html` อ่านไฟล์นี้แล้ว render สารบัญเอง

## โครง topics.json
```json
{
  "topics": [
    {
      "id": "projectile-motion",
      "title": "การเคลื่อนที่แบบโพรเจกไทล์",
      "titleEn": "Projectile Motion",
      "level": "ม.ปลาย",
      "category": "กลศาสตร์",
      "path": "topics/projectile-motion/",
      "active": true
    }
  ]
}
```

`titleEn` แสดงเป็น subtitle ภาษาอังกฤษใต้ชื่อเรื่องในการ์ด (ตามดีไซน์ Dot-Matrix Lab)
`active` = `false` (หรือไม่ใส่ `path`) สำหรับเรื่องที่อยู่ใน roadmap แต่ยังไม่ได้ build — การ์ดจะแสดงจาง 55% พร้อม label
"เร็วๆ นี้" และกดไม่ได้ ค่าเริ่มต้นถ้าไม่ใส่ field `active` ถือว่า `true` (ต้องมี `path` จริง)

## กฎเพิ่มเรื่อง
- เพิ่ม entry ใหม่ใน array `topics`
- ถ้า `id` ซ้ำ → อัปเดต entry เดิม ไม่สร้างซ้ำ
- จัดเรียงตาม `category` แล้ว `title`
- `path` ชี้ไปโฟลเดอร์เรื่อง (ลงท้าย /) — ใส่เฉพาะเรื่องที่ `active: true` เท่านั้น

## หมวด (category) ที่ใช้
กลศาสตร์, ไฟฟ้า-แม่เหล็ก, คลื่น-เสียง, ความร้อน, แสง, อื่นๆ
(เพิ่มหมวดใหม่ได้ถ้าจำเป็น — index.html จะ group ตาม category อัตโนมัติ)

## กฎ
- ห้ามแก้ index.html ของสารบัญโดยตรง — แก้แค่ topics.json
- ระดับชั้น (level) แสดงเป็น tag ในสารบัญ เพื่อให้ครูเลือกเรื่องตรงระดับได้
