# sky-physic

เว็บ static สื่อการสอนฟิสิกส์ ม.ต้น–ม.ปลาย เน้น simulation ปรับค่าได้
ครูใช้แชร์จอประกอบการสอน ไม่มี backend / ไม่มี login / ไม่มี build step — host บน Vercel

โครงสร้างและกฎห้ามฝ่าฝืนอยู่ใน `AGENTS.md`, รายละเอียดเชิงเทคนิค (stack/git/verify/guardrails) อยู่ใน `_system/ARCHITECTURE.md`
เปิด project นี้ด้วย Claude Code หรือ opencode แล้วบอกว่าจะเพิ่ม/แก้/ลบเรื่องอะไร — ทำตาม workflow ใน skills ได้เลย

## เพิ่มเรื่องใหม่
1. คุยกับ agent → ร่าง spec (skill: `spec-workflow`) → ได้ `topics/<id>/spec.md`
2. agent สร้าง page จาก spec (skill: `build-workflow`) → ได้ `topics/<id>/index.html` — ขั้นนี้รวม verify อัตโนมัติ (เช็ค console error, ปรับ control แล้วดูค่า realtime เปลี่ยนจริง) ก่อนส่งต่อ
3. ครู review ความถูกต้องฟิสิกส์ + การแสดงผล (แก้วนได้จนกว่าจะโอเค)
4. บอก agent ว่า "อนุมัติแล้ว" → publish (skill: `publish-workflow`) → เติม `_system/topics.json` + commit + push → Vercel deploy อัตโนมัติ

## ลบ/ถอดเรื่องออกจากเว็บ
ลบแบบ **soft-delete เท่านั้น** — บอก agent ว่าจะถอดเรื่องไหนออก แล้วให้แก้ entry ของ id นั้นใน `_system/topics.json` เป็น `"active": false`
เรื่องจะหายจากสารบัญ/เว็บทันทีที่ deploy แต่ไฟล์ `topics/<id>/` (page + spec) ยังอยู่ในเครื่อง — เผื่อเอากลับมาใช้ใหม่หรือ regenerate ทีหลัง
**ไม่มี workflow ไหนลบโฟลเดอร์จริงให้อัตโนมัติ** — ถ้าต้องการลบไฟล์ถาวรจริงๆ ต้องบอก agent ให้ทำแยกต่างหาก ชัดเจนว่าต้องการลบถาวร

## แก้ไขเรื่องที่มีอยู่
แก้ `topics/<id>/spec.md` แล้วรัน `build-workflow` ใหม่ (regenerate page จาก spec ที่แก้แล้ว) ตามด้วย review/publish เหมือนเรื่องใหม่ — ไม่แก้ `index.html` ของเรื่องตรงๆ เพื่อให้ spec กับ page ไม่หลุดจากกัน

## เปลี่ยน skin (ธีมทั้งเว็บ)
skin = visual identity เต็มรูปแบบ (สี ฟอนต์ เงา ลวดลาย) ตั้งค่าได้จุดเดียวทั้งเว็บ **นี่คนละเรื่องกับการเพิ่ม/แก้เรื่อง
ข้างบน** — เป็นการตัดสินใจระดับ deploy ไม่ผ่าน spec-workflow/build-workflow/publish-workflow

1. เปิด `shared/config.js`
2. แก้บรรทัด `skin: 'dot-matrix'` เป็นชื่อ skin ที่ต้องการ — skin ที่มีตอนนี้:
   - `dot-matrix` — ค่าเริ่มต้น รองรับ light/dark (มีปุ่มสลับ)
   - `comic` — โทนการ์ตูนป๊อปอาร์ต รองรับ light อย่างเดียว (ปุ่มสลับจะหายไปเอง)
3. commit + push → Vercel deploy อัตโนมัติ ทั้งเว็บเปลี่ยนทันที ไม่ต้องแก้ไฟล์เรื่องไหนเลย

**เพิ่ม skin ใหม่:** สร้าง `shared/skins/<name>.css` (CSS ล้วน scope ใต้ `[data-skin="<name>"]`, override ได้
เฉพาะ token ที่มีอยู่ใน `shared/styles.css` อยู่แล้ว ห้ามเพิ่มชื่อ token ใหม่ ห้ามแตะโครง DOM), ลิงก์ไฟล์นั้นในทุกหน้า
(head ต่อจาก `styles.css`), แล้วลงทะเบียนใน `shared/config.js` (ระบุ `fontsUrl` ด้วยถ้า skin ต้องใช้ฟอนต์ภายนอก —
ห้าม `@import` ฟอนต์ตรงในไฟล์ skin css เพราะไม่ถูก scope ด้วย `[data-skin]` จะโหลดทุกหน้าไม่ว่า skin ไหน active)
รายละเอียดสถาปัตยกรรมเต็มอยู่ใน `_system/ARCHITECTURE.md` §7 และกฎอยู่ใน skill `page-template`

## สิ่งที่ควรรู้ก่อนเริ่ม
- **Vanilla เท่านั้น**: ไม่มี framework/bundler/`package.json` ที่ commit — ห้ามเพิ่ม dependency ใหม่โดยไม่จำเป็น
- **ห้าม external font/CDN/analytics**: ทุกอย่าง self-contained ในไฟล์ static ของ project (กฎ "fast response") — ยกเว้น skin ประกาศ `fontsUrl` ใน `shared/config.js` (ดูหัวข้อ "เปลี่ยน skin")
- **Design tokens จาก `shared/styles.css` เท่านั้น**: ห้ามฝัง hex/ขนาด/ฟอนต์ใหม่ในไฟล์เรื่อง
- **`_system/topics.json` คือแหล่งความจริงเดียว** ที่ขับสารบัญ — ห้ามแก้ `index.html` หน้าแรกตรงๆ
- **1 เรื่อง = 1 ระดับชั้น**: ม.ต้น กับ ม.ปลาย เรื่องเดียวกันแยกเป็นคนละ content คนละ id
- **Git**: solo maintainer, trunk-based, commit ตรง `main`, ข้อความ commit แบบ Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) — รายละเอียดใน `_system/ARCHITECTURE.md`

## dev
```
npx serve .
```
