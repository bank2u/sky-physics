# physics-sim

เว็บ static สื่อการสอนฟิสิกส์ ม.ต้น–ม.ปลาย เน้น simulation ปรับค่าได้

โครงสร้างและวิธีทำงานทั้งหมดอยู่ใน `AGENTS.md`
เปิด project นี้ด้วย Claude Code หรือ opencode แล้วบอกว่าจะเพิ่มเรื่องอะไร — ทำตาม workflow ใน skills ได้เลย

## เพิ่มเรื่องใหม่
1. คุยกับ agent → ร่าง spec (skill: spec-workflow)
2. agent สร้าง page (skill: build-workflow)
3. review
4. publish (skill: publish-workflow) → push → Vercel deploy

## dev
\`\`\`
npx serve .
\`\`\`
