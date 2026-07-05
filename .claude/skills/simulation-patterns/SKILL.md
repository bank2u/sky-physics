---
name: simulation-patterns
description: คลังแบบแผน simulation ที่ใช้ซ้ำข้ามเรื่อง (กราฟ, การยิงวัตถุ, เวกเตอร์ 3 มิติ) และกฎการเพิ่ม pattern ใหม่. ใช้โดย build-workflow เมื่อต้องเลือกหรือสร้าง simulation.
---

# Simulation Patterns

คลัง simulation ที่ใช้ซ้ำได้ อยู่ใน `shared/sim/` — ใช้ซ้ำก่อนสร้างใหม่เสมอ

## Pattern ที่มี (อัปเดตเมื่อเพิ่ม)
- `graph.js` — วาดกราฟ x-y, รองรับ realtime update + เส้นกริด (ใช้ token `--grid`)
- `projectile.js` — วิถีการเคลื่อนที่แบบโพรเจกไทล์ ปรับมุม/ความเร็ว
- `vector3d.js` — เวกเตอร์ 3 มิติ หมุนดูได้ (กฎมือขวา ฯลฯ)
- `refraction.js` — รังสีตกกระทบ/หักเห/สะท้อนกลับหมดภายใน ปรับมุมตกกระทบและดัชนีหักเหของตัวกลาง 2 ฝั่ง (กฎของสเนลล์ + มุมวิกฤต)
- `motion-graphs.js` — รถวิ่งบนถนนตรง + กราฟ x-t/v-t/a-t วาดสดตามเวลาจริง แกนเวลาร่วมกัน (`window.SimPatterns.motionGraphs`)
- `circuit-ohm.js` — วงจรไฟฟ้าอย่างง่าย (แบตเตอรี่ + หลอดไฟ) สลับอนุกรม/ขนาน จุดประจุไหลด้วยอัตราเร็ว ∝ กระแส, หลอดสว่างตาม I (`window.SimPatterns.circuitOhm`)
- `wave-interference.js` — การซ้อนทับของคลื่นสองขบวน + การแทรกสอดสองแหล่งกำเนิดอาพันธ์ (Young's double slit), ปรับความถี่/แอมพลิจูด/ระยะห่างช่องคู่ (`window.SimPatterns.waveInterference`)
- `mirrors-lenses.js` — ray diagram กระจกเว้า/นูน และเลนส์นูน/เว้า ลากวัตถุหรือปรับระยะวัตถุ/ความยาวโฟกัส เห็นภาพจริง/เสมือนสลับกันที่จุดโฟกัส (`window.SimPatterns.mirrorsLenses`)
- `sound-wave.js` — โมเลกุลอากาศสั่นตามยาว (อัด-ขยาย) คู่กับกราฟความดัน + เสียงจริงผ่าน Web Audio API ปรับความถี่/แอมพลิจูด (`window.SimPatterns.soundWave`)
- `heat-transfer.js` — การถ่ายโอนความร้อนแบบนำ (แท่งโลหะ, diffusion ระหว่างจุด) และแบบพา (ของไหลหมุนวนตามการลอยตัว) สลับโหมดได้ (`window.SimPatterns.heatTransfer`)
- `gas-particles.js` — โมเลกุลแก๊สชนผนัง/ชนกันแบบยืดหยุ่นในกล่อง ลูกสูบปรับปริมาตร คำนวณความดันจาก Σv² และวาดกราฟ P-V สด (`window.SimPatterns.gasParticles`)

## วิธีใช้
- spec ระบุ field "simulation pattern ที่ใช้" → เรียกไฟล์ตรงนั้น
- แต่ละ pattern รับ config (ตัวแปร, ช่วงค่า) จาก control แล้ว render ลงโซน simulation

## กฎการเพิ่ม pattern ใหม่
- ตั้งชื่อไฟล์ kebab-case สื่อความหมาย (เช่น `pendulum.js`)
- ใช้ design token จาก styles.css (`--accent`, `--grid`, `--sim-bg`) — ห้าม hex ตรงๆ
- รับ input เป็น config object, expose ฟังก์ชัน init/update ให้ control เรียก
- เขียนให้ generic พอใช้ซ้ำในเรื่องอื่นได้ ไม่ผูกกับเรื่องเดียว
- เพิ่มชื่อ pattern เข้ารายการด้านบนนี้ด้วย
