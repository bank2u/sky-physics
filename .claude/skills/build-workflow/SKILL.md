---
name: build-workflow
description: ใช้เมื่อมี content spec (topics/<id>/spec.md) พร้อมแล้ว และต้องสร้างหน้าเว็บ simulation จาก spec นั้น. Trigger เมื่อผู้ใช้พูดว่า "สร้าง page", "build เรื่องนี้", "generate หน้า", หรือหลังร่าง spec เสร็จ. เป็นขั้นที่ 2 ของ workflow เพิ่มเรื่อง.
---

# Build Workflow

สร้าง `topics/<id>/index.html` จาก spec โดยเติมเนื้อในลง template ที่ fix ไว้ — ไม่ออกแบบใหม่

## ขั้นตอน
1. อ่าน `topics/<id>/spec.md` ทุก field
2. โหลด skill `page-template` (โครง layout 5 ส่วน) และ `simulation-patterns` (คลัง sim)
3. สร้าง `topics/<id>/index.html`:
   - ใช้โครง 5 ส่วนตามลำดับเสมอ
   - สร้าง slider/control ตาม "ตัวแปรที่ปรับได้" (ใช้ช่วงค่า/หน่วย/ค่าเริ่มต้นจาก spec)
   - แสดง "ค่าที่แสดง realtime" ด้วย token `--fs-value` (ใหญ่สุดในหน้า)
   - เรียก simulation จาก `shared/sim/<pattern>.js` ตาม field ใน spec
   - ถ้าเรื่องนี้ต้องรองรับ live sync: ประกาศ `Sync.param/player/camera` + เรียก `Sync.changed` ตามสัญญาใน `page-template` และตรวจว่า sim มี API ตาม `simulation-patterns`
4. ถ้า pattern ยังไม่มีในคลัง → สร้าง `shared/sim/<pattern>.js` ใหม่ตามแบบแผนเดิม แล้วใช้
5. **Verify (บังคับ ห้ามข้าม)** — ก่อนส่งให้ครู review:
   - **Structural lint**: spec ครบทุก field, ไม่มี hex/px ฝังตรงในหน้า (grep หา `#[0-9a-fA-F]` และ inline `style=` นอกเหนือ CSS variable), ลำดับ 5 ส่วนถูกต้อง, `_system/topics.json` entry ของ id นี้มีอยู่จริงและ path ชี้ไปโฟลเดอร์ที่มีจริง
   - **Browser smoke check** (ใช้ tool `claude-in-chrome`): เปิดหน้า, เช็คว่าไม่มี console error, ลองปรับทุก control ใน "ตัวแปรที่ปรับได้" แล้วดูว่าค่า realtime เปลี่ยนตาม
   - **2-tab smoke (เฉพาะหน้าที่เรียก `Sync.*`)**: รัน relay local (`cd _relay && npx wrangler@4 dev --port 8787`) แล้วเปิดแท็บ A (ครู) กับ B (นักเรียน) ด้วย browser profile **แยกกัน** (role ครูอยู่ใน `localStorage`) — ใช้ claude-in-chrome หรือ headless Chrome ผ่าน CDP ก็ได้ เช็ค: (1) B ถูกพาไปเรื่องนี้ แถบ `👀 ตามครู` และ control กดไม่ได้ (2) A ปรับทุก control/drag แล้วค่าและ tile ของ B ตรงกัน (3) A กดเล่น แล้วเวลาของ B ตรงกัน และ C ที่เข้าทีหลังไม่เริ่มที่ 0 (5) B กด `ทดลองเอง` ปรับได้โดย A ไม่กระทบ แล้ว `กลับไปตามครู` แล้ว snap ค่า A (8) ไม่มี console error และแท็บที่ไม่อยู่ในห้องไม่เปิด WebSocket — รายละเอียดดู `_system/ARCHITECTURE.md` §8
   - ถ้าอันไหนไม่ผ่าน → แก้ก่อน ห้ามส่งต่อให้ครู review ทั้งที่ยังพัง

## กฎ
- ห้ามออกแบบ layout / สี / ฟอนต์ / ขนาด ใหม่ — ใช้ `shared/styles.css` เท่านั้น
- ห้ามฝัง hex ตรงๆ — อ้างผ่าน CSS variable เสมอ
- ห้ามเปลี่ยนลำดับ 5 ส่วน
- ห้ามแก้ไฟล์ใน `shared/` ที่เรื่องอื่นใช้ร่วม (ยกเว้นเพิ่ม pattern ใหม่)
- ห้ามข้ามขั้นตอน verify ไม่ว่ากรณีใด

## Output
`topics/<id>/index.html` (+ `shared/sim/<pattern>.js` ถ้าจำเป็น) ผ่าน verify แล้ว — ถัดไปครู review
