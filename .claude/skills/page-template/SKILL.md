---
name: page-template
description: กฎ layout 5 ส่วนของทุก page และ design system (สี/ฟอนต์/ขนาด tokens). ใช้โดย build-workflow เมื่อสร้างหน้าเว็บ เพื่อให้ทุกเรื่องหน้าตาและโครงเหมือนกัน.
---

# Page Template

โครงและ design system ที่ทุก page ต้องยึด — Build Agent เติมเนื้อในลงโครงนี้ ห้ามออกแบบใหม่
ทิศทางภาพ: **"Dot-Matrix Lab"** (neo-brutalist, sticker shadow, dot-grid sim zone) — รายละเอียดเต็มอยู่ที่ `DESIGN.md`

## Layout 5 ส่วน (ลำดับตายตัว)
1. หัวเรื่อง + คำอธิบายสั้น (`.topic-header`, `.topic-title`, `.topic-desc`)
2. โซน simulation (`.sim-zone`)
3. แผงควบคุม (`.controls` — `.tile-grid` + `.sliders` + `.actions`)
4. ค่าที่อ่านได้ realtime (`.tile--cyan/--magenta/--yellow` ภายในแผงควบคุม)
5. คำอธิบายแนวคิด / สมการ เต็มกว้าง (`.equations`, `.concept`)

Responsive: จอ ≥900px → `.sim-row` เป็น grid `1.6fr/1fr` (simulation ซ้าย, control ขวา); มือถือ → เรียงลงล่าง 1→5

## Design tokens (อยู่จริงใน shared/styles.css — อ้างผ่าน var() หรือ class เท่านั้น รายละเอียดเต็มดู DESIGN.md)
สี: รองรับ light/dark ด้วย `prefers-color-scheme` + ปุ่ม toggle มือ (`[data-theme]`)
- พื้นฐาน: `--ink`, `--paper`, `--surface`
- สีเน้น (สูงสุด 3 สีต่อหน้า, อิ่มตัวเต็มเฉพาะใน sim zone/value tile): `--cyan`, `--magenta`, `--yellow`
- ตัวหนังสือ contrast สูงบน tile: `--cyan-fg`, `--magenta-fg`, `--yellow-fg`

ฟอนต์: `--font` = `'Montserrat', 'Noto Sans Thai', sans-serif` (น้ำหนัก 600/700/800/900), `--mono` สำหรับ label

ขนาด (responsive ด้วย clamp):
- `--fs-title`, `--fs-desc`, `--fs-value` (ใหญ่สุดในหน้า), `--fs-label`, `--fs-body`, `--fs-eq`

spacing/radius/shadow/motion: `--gap`, `--pad`, `--space-1..7`, `--radius`/`--radius-lg`/`--radius-xl`/`--radius-pill`,
`--shadow-sm`/`--shadow-md`/`--shadow-lg` (sticker shadow, offset ไม่มี blur), `--ease-bounce`, `--slider-h`, `--slider-thumb`, `--btn-h` (ปุ่ม/slider ≥44px)

Component class สำเร็จรูป (ใช้แทนการเขียน style เอง): `.card` / `.card--compact`, `.badge-level`, `.chip`,
`.tile--cyan/--magenta/--yellow`, `.slider--angle/--velocity`, `.btn-play`/`.btn-reset`, `.equation-card`

## กฎ
- ค่า realtime ต้องเด่นสุดในหน้า (ใช้ `--fs-value`)
- ห้ามฝัง hex/ขนาด/ฟอนต์ตรงๆ — อ้าง token/class เสมอ
- ห้ามเกิน 3 สีเน้นต่อหน้า และอิ่มตัวเต็มเฉพาะใน sim zone/value tile (ที่อื่น tint 30–34%)
- contrast สูง อ่านบนโปรเจกเตอร์ได้ (WCAG AA ขั้นต่ำ)
