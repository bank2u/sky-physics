# Design System — "Dot-Matrix Lab"

> ตั้งแต่เพิ่ม skin system (2026-07) เอกสารนี้อธิบายเฉพาะ **`dot-matrix`** — skin ค่าเริ่มต้นของเว็บ (ground truth
> ของ token ทุกตัวที่ประกาศใน `:root` ของ `shared/styles.css`) skin อื่น (เช่น `comic`) อยู่ที่ `shared/skins/<name>.css`
> override เฉพาะค่า token จากที่นี่ ไม่ประกาศ token ใหม่ — สถาปัตยกรรม skin/mode เต็มดูที่ `_system/ARCHITECTURE.md` §7,
> วิธีสลับ skin ที่ deploy อยู่ดูที่ `README.md` หัวข้อ "เปลี่ยน skin"

ทิศทางภาพที่เลือกใช้จริงสำหรับ sky-physics (direction 1b จาก design handoff บน claude.ai/design)
neo-brutalist โทนสะอาด: การ์ดขอบมน + hard sticker shadow (offset ไม่มี blur) + พื้นผิว dot-grid ในโซน simulation
+ สีเน้นตามหมวดวิชา Light Mode เป็นค่าเริ่มต้น พร้อม Slate Dark Mode ผ่าน `prefers-color-scheme` และปุ่มสลับมือ

หน้าจอเป้าหมาย: **โปรเจกเตอร์/สมาร์ทบอร์ดในห้องเรียน** — ทุกอย่างต้องอ่านได้จากระยะ ~10 เมตร, touch target ใหญ่,
contrast สูง ต้นทาง (ground truth) ของ token คือ `shared/styles.css` — เอกสารนี้อธิบายว่าทำไมค่าถึงเป็นแบบนี้
ห้ามฝัง hex/ขนาด/ฟอนต์ใหม่ในไฟล์เรื่อง อ้างผ่าน CSS variable ใน `shared/styles.css` เสมอ

## สี

### Light Mode (ค่าเริ่มต้น)
| Token | ค่า | ใช้ที่ |
|---|---|---|
| `--ink` | `oklch(16% 0.02 280)` (~`#161311`) | ตัวหนังสือ, เส้นขอบ, พื้นหลังปุ่ม/badge ที่ fill |
| `--paper` | `oklch(97% 0.012 85)` (~`#F7F5F0`) | พื้นหลังหน้า |
| `--surface` | `#FFFFFF` | พื้นหลังการ์ด |
| `--cyan` (Electric Cyan) | `oklch(70% 0.19 200)` (~`#00BECD`) | เวกเตอร์ความเร็ว · หมวดกลศาสตร์/ความร้อน · slider มุมยิง |
| `--magenta` (Neon Magenta) | `oklch(60% 0.29 340)` (~`#E200B4`) | เวกเตอร์แรงโน้มถ่วง · หมวดไฟฟ้า-แม่เหล็ก/แสง · slider ความเร็วต้น |
| `--yellow` (Laser Yellow) | `oklch(84% 0.21 100)` (~`#EBCB00`) | อนุภาคเคลื่อนที่ · หมวดคลื่น-เสียง/อื่นๆ |
| `--cyan-fg` / `--magenta-fg` / `--yellow-fg` | `#00647A` / `#8F1257` / `#6E5700` | ตัวหนังสือ contrast สูงบน tile ที่ tint สีนั้นๆ |

**กฎสี:** ทั้งหน้าใช้สีเน้น (vivid accent) ได้สูงสุด **3 สี** และปรากฏแบบอิ่มตัวเต็มที่เฉพาะใน simulation zone
กับ value tile เท่านั้น ที่อื่นให้ปรากฏเป็น tint 30–34% ผ่าน `color-mix(in oklab, <accent> X%, surface)`
(ดู `--tile-cyan-bg` 30% / `--tile-magenta-bg` 32% / `--tile-yellow-bg` 34% ใน styles.css — ปรับขึ้นจาก
15–30% เดิมเพราะ tint เก่าที่ 18–28% จางเกินไปจนแยกจากพื้น `--paper`/`--surface` แทบไม่ออก โดยเฉพาะ magenta
กับ yellow; ค่า fg ของ yellow ก็เข้มขึ้นตามเพื่อคง contrast AA)

2026-07 tuning note: base accent tokens ก็เข้มขึ้นจากเดิม (cyan/magenta ไล่ lightness ลง + chroma ขึ้น,
yellow ลด lightness ลงจาก 89%→84% เพราะใกล้ `--paper` 97% เกินไป) ให้ความรู้สึก "electric/neon/laser" สมชื่อ
มากขึ้น และอ่านง่ายขึ้นบนโปรเจกเตอร์ ทุกค่าตรวจ contrast ผ่าน WCAG AA แล้ว (tile text ≥ 4.5:1)

### Dark Mode — Slate (`prefers-color-scheme: dark` หรือ `[data-theme="dark"]`)
| Token | ค่า |
|---|---|
| `--ink` | `#F2F1ED` |
| `--paper` | `#101214` |
| `--surface` | `#181B1E` |
| accent (cyan/magenta/yellow) | เฉดเดิม แต่ตัวเลขค่า realtime ใช้ `text-shadow` เรืองแสง (`--value-glow`) แทนพื้นหลัง tint |

Toggle มือ (top bar) เขียนค่าไปที่ `data-theme` บน `<html>` และ persist ใน `localStorage`; ค่าเริ่มต้นอ่านจาก
`prefers-color-scheme` ตอนโหลดหน้าครั้งแรก

## ตัวอักษร

- Font stack: `--font` = `'Montserrat', 'Noto Sans Thai', sans-serif` (น้ำหนัก 600/700/800/900) — โหลดผ่าน Google Fonts
- Mono (ใช้เฉพาะ label/annotation): `--mono` = `ui-monospace, 'SF Mono', 'Courier New', monospace`
- Scale (ทุกตัวใช้ผ่าน `--fs-*`, responsive ด้วย `clamp()`):
  - `--fs-title` — H1/หัวเรื่อง 28–40px น้ำหนัก 900
  - `--fs-value` — ตัวเลขค่า realtime 28–44px น้ำหนัก 900 (ใหญ่/เด่นสุดในหน้าเสมอ)
  - `--fs-desc` — คำอธิบายใต้หัวเรื่อง 15–17px น้ำหนัก 600 opacity ~65%
  - `--fs-body` — เนื้อหาทั่วไป 15–17px น้ำหนัก 600
  - `--fs-eq` — สมการ 17–20px น้ำหนัก 700
  - `--fs-label` — mono/uppercase micro-label 11–13px น้ำหนัก 800 letter-spacing กว้าง
- ห้ามใช้ตัวอักษรเล็กกว่า 24px สำหรับข้อความสอนบนจอ (นี่คือสมาร์ทบอร์ด ไม่ใช่มือถือ) — ค่า clamp ปัจจุบันคุมไว้แล้ว
  แต่ topic content ที่เพิ่ม font-size เองห้ามต่ำกว่านี้

## ระยะห่าง (Spacing scale)
`--space-1..7` = 4, 8, 16, 24, 32, 48, 64px — ใช้ตรงๆ สำหรับ layout ที่ fix ขนาด
`--gap`, `--pad` = responsive clamp เดิม ใช้กับ section หลักของ 5-part layout

## Radius
`--radius` 12px (control เล็ก) · `--radius-lg` 18px (การ์ด/tile) · `--radius-xl` 28px (page shell) · `--radius-pill` 999px (pill/slider/badge)

## Sticker Shadow (offset shadow ไม่มี blur)
`--shadow-sm` 4/4 · `--shadow-md` 6/6 · `--shadow-lg` 9/9 (ทั้งหมดสี `var(--ink)`) · `--shadow-btn` สำหรับปุ่ม primary (`4px 4px 0 rgba(0,0,0,.3)`)
Hover: shadow ขยับขึ้นหนึ่งระดับ (6→9) + ลอยขึ้น `-2px` · Press: `scale(0.96)`

## Motion
`--ease-bounce` = `cubic-bezier(.34, 1.56, .64, 1)` (bouncy overshoot) · ระยะเวลา `--dur-fast` 160ms / `--dur-slow` 220ms
ใช้กับ: toggle thumb, hover/press ของการ์ดและปุ่ม, slider thumb

Sticker-peel hover: `.card`/`.card--compact` hover เพิ่ม `rotate(±1deg)` เล็กน้อยเข้ากับ translate เดิม (คนละทิศกัน
ระหว่างการ์ดใหญ่/เล็กเพื่อความมีชีวิตชีวา) ใช้ `--ease-bounce` ผ่าน `--dur-slow` ให้ความรู้สึกเหมือนสติกเกอร์ลอกตัวขึ้น
เข้ากับกลุ่มเป้าหมายนักเรียน โดยไม่เพิ่มโทเค็นสีหรือทำลายกฎ ≤3 accent

## เส้นขอบ
`--border-w` 3px (การ์ด/control/sim zone) · `--border-w-sm` 2px (badge/category dot)

## Touch target
ปุ่ม/slider thumb ขั้นต่ำ 44px, ปุ่มหลัก (Play) และ slider thumb 56–64px (`--btn-h`, `--slider-thumb`)

## Layout — 5 ส่วนตายตัวของทุก topic page
1. หัวเรื่อง + คำอธิบายสั้น (`.topic-header`, `.topic-title`, `.topic-desc`)
2. โซน simulation (`.sim-zone` — พื้น dot-grid, เส้นขอบ ink 3px, radius-xl)
3. แผงควบคุม (`.controls` — `.tile-grid` 2×2 + `.sliders` + `.actions`)
4. ค่าที่อ่านได้ realtime (อยู่ใน `.tile` ภายใน controls — ใช้ `--fs-value` เด่นสุดในหน้า)
5. คำอธิบายแนวคิด/สมการ เต็มกว้าง (`.equations`, `.concept`)

Responsive: ≥900px → `.sim-row` เป็น grid `1.6fr/1fr` (sim ซ้าย, control ขวา); มือถือ → เรียงลงล่าง 1→5

หน้าสารบัญ (`index.html`): `#categories` (คอนเทนเนอร์ที่ JS เติมกลุ่ม `.category` เข้าไป) ต้องเป็น
`display:flex; flex-direction:column; gap:var(--space-6)` เอง — `.directory`'s gap ครอบแค่ระหว่าง
`.directory-header` กับ `#categories` (ลูกโดยตรงชิ้นเดียว) ไม่ไหลลงไปถึง `.category` แต่ละกลุ่มข้างใน
ถ้าลืมใส่ gap นี้ shadow ของการ์ดกลุ่มบนจะทับหัวข้อกลุ่มถัดไปพอดี (เคยเกิดจริง แก้แล้วใน styles.css)

## Components หลัก (คลาสอยู่ใน `shared/styles.css`)
- **Top bar**: `.topbar` (โลโก้ Φ ซ้าย + `.toggle` มือขวา) — render ผ่าน `shared/layout.js`
- **Filter chip**: `.chip` / `.chip.is-active`
- **Topic card**: `.card` (ใหญ่, shadow-lg) และ `.card--compact` (เล็ก, shadow-md) + `.badge-level`
- **Value tile**: `.tile--cyan/--magenta/--yellow` (tint พื้นหลังใน light, glow ตัวเลขใน dark)
- **Slider**: `.slider--angle` (cyan) / `.slider--velocity` (magenta) — track หนา 26px, thumb วงกลม 40px
- **ปุ่ม**: `.btn-play` (tint cyan 30% + `--cyan-fg` ตามกฎ tile ด้านบน — ไม่ fill ink เหมือนเดิม เพื่อให้ปุ่มหลักมีสี
  ไม่ใช่ดำ-ขาวล้วน), `.btn-reset` (outline)
- **Equation card**: `.equation-card`

## กฎที่ห้ามฝ่าฝืน
- ห้ามฝัง hex/ขนาด/ฟอนต์ใหม่ในไฟล์เรื่อง — อ้าง token/class จาก `shared/styles.css` เท่านั้น
- ห้ามเกิน 3 สีเน้นต่อหน้า และสีอิ่มตัวเต็มใช้ได้เฉพาะใน sim zone/value tile
- ค่า realtime ต้องใช้ `--fs-value` และเด่นที่สุดในหน้าเสมอ
- 1 theme ต่อหน้า (light หรือ dark) ห้ามสลับกลางหน้า ยกเว้นการสลับด้วยปุ่ม toggle ทั้งหน้า
- Contrast ต้องอ่านได้บนโปรเจกเตอร์ (WCAG AA เป็นขั้นต่ำ)

## ที่มา
Design handoff: claude.ai/design project "Physics-Sim Educational UI" (`design_handoff_physics_sim/README.md`,
`app-prototype.dc.html`, `tokens.dc.html`) โดย Siwat — direction **1b "Dot-Matrix Lab"**
