# Theme System Design — skin × mode

วันที่: 2026-07-04
สถานะ: เสร็จสมบูรณ์ — implement + merge เข้า `main` แล้ว (`7cbbcc0`) ดูรายละเอียดใน
`docs/superpowers/plans/2026-07-04-theme-system.md` (ส่วนท้าย "สถานะ: เสร็จสมบูรณ์")

**ส่วนที่ต่างจาก design เดิม (พบระหว่าง implement):** `config.js` schema จริงมี key เพิ่ม
`fontsUrl` ต่อ skin (ไม่มีใน draft `config.js` ด้านล่าง) — เพราะ comic skin ต้องใช้ฟอนต์ภายนอก
(Kanit/Bungee) และ `@import` ตรงใน skin CSS ไม่ถูก scope ด้วย `[data-skin]` (โหลดทุกหน้าไม่ว่า skin
ไหน active) จึงย้าย font loading ไปเป็น data ใน registry แล้วให้ `layout.js` แทรก `<link>` แบบมีเงื่อนไขแทน

## เป้าหมาย

ให้เว็บสลับ "ธีม" ได้ง่ายใน 2 แกน โดยไม่ซ้ำไฟล์เนื้อหา:

- **Skin** = visual identity เต็มรูปแบบ (สี ฟอนต์ เงา รูปทรง ลวดลาย) เช่น Dot-Matrix Lab, Comic Lab
  - เลือกโดย **deployer** แก้ config 1 บรรทัด ครั้งเดียวทั้งเว็บ
- **Mode** = light/dark ภายใน skin
  - เลือกโดย **ผู้เรียน/ครู** ผ่านปุ่ม toggle, จำใน localStorage (กลไกเดิมที่มีอยู่แล้ว)
  - skin ประกาศเองว่ารองรับโหมดไหน — รองรับโหมดเดียว ปุ่ม toggle ซ่อนอัตโนมัติ

แทนที่แนวทางทดลองเดิม (index2.html ต่อ skin) ซึ่งซ้ำทั้งเนื้อหาและโค้ดฟิสิกส์

## หลักการ

- **1 หน้า = 1 ไฟล์ HTML เสมอ** — skin เป็น CSS ล้วน ใช้ DOM ร่วมกันทุก skin ห้าม skin แตะโครง DOM
- **Token contract**: ทุก skin ต้อง define token ชุดเดียวกับที่ `shared/styles.css` ประกาศ
  (`--ink`, `--paper`, `--surface`, accent 3 ตัว + `-fg` cousins, `--tile-*`, `--shadow-*`,
  `--radius-*`, `--font`, `--mono`, `--dot-color` ฯลฯ) — component rules อ้าง token เท่านั้น
- skin เพิ่ม component override เฉพาะตัวได้ (ลวดลาย/รูปทรง) แต่ต้อง scope ใต้ `[data-skin="<name>"]`
- ไม่ระบุ `data-skin` = dot-matrix ทำงานจาก `:root` โดยไม่พึ่ง JS (graceful degradation)

## โครงสร้างไฟล์

```
shared/
  config.js            ← deployer แก้: skin ที่ใช้ + ทะเบียน skin/modes
  layout.js            ← แสตมป์ data-skin, จัดการ toggle ตามทะเบียน, dispatch themechange
  styles.css           ← โครงสร้าง + semantic tokens กลาง (= dot-matrix light default)
  skins/
    comic.css          ← [data-skin="comic"] { token + component overrides }
```

ทุกหน้าโหลด `config.js` แบบ sync ใน `<head>` ก่อน stylesheet แล้วลิงก์ base + skin CSS ทุกไฟล์
(จำนวน skin จริงมีแค่ 2-3 → byte ส่วนเกินจิ๊บจ๊อยและโดน cache)

## config.js

```js
window.PhysicsSimConfig = {
  skin: 'dot-matrix',   // ← deployer แก้บรรทัดนี้ เช่น 'comic'
  skins: {
    'dot-matrix': { modes: ['light', 'dark'] },
    'comic':      { modes: ['light'] }
  }
};
```

## layout.js (ขยายจากเดิม)

1. ตอนโหลด (sync, กัน flash): แสตมป์ `data-skin` จาก config ทันที
2. โหมด: อ่าน localStorage เหมือนเดิม แต่ถ้า skin รองรับโหมดเดียว → บังคับโหมดนั้น
   และ `mountTopbar` ไม่ render ปุ่ม toggle
3. ทุกครั้งที่ skin/mode เปลี่ยน → `document.dispatchEvent(new CustomEvent('physics-sim:themechange'))`

## 3D sim ตามธีม

`shared/sim/vector3d.js` resolve CSS token เป็นสี canvas อยู่แล้วแต่ **cache ไม่เคยล้าง**
(บั๊กแฝง: สลับ dark แล้วสีใน canvas ค้าง) — แก้โดย:

- ฟัง `physics-sim:themechange` → ล้าง resolve cache → resolve ใหม่ → อัปเดต material ทุกตัว
- สีใน sim ตามทั้ง skin และ mode โดยหน้าเรื่องไม่ต้องแก้

**ตัดออก (YAGNI)**: material style ต่อ skin (toon vs classic) — v1 เปลี่ยนเฉพาะสี
อนาคตถ้าต้องการค่อยเพิ่ม token `--sim-style` โดยไม่แตะโครง

## Cache strategy (แก้กังวลเว็บไม่ update)

ตั้ง headers ใน `vercel.json`:

| ไฟล์ | Cache-Control | ผล |
|---|---|---|
| `*.css` `*.js` `*.json` `*.html` | `public, max-age=0, must-revalidate` | revalidate ผ่าน ETag ทุกโหลด — deploy ใหม่เห็นผลใน reload ถัดไป, ไฟล์ไม่เปลี่ยนได้ 304 ราคาถูก |
| `shared/vendor/*` | `public, max-age=31536000, immutable` | three.min.js ไม่เคยเปลี่ยน cache ถาวร — ถ้าอัปเกรดให้เปลี่ยนชื่อไฟล์ |

ไม่ต้อง bump `?v=` มือ ไม่ต้องมี build step

## ลำดับ migration (แต่ละขั้น deploy ได้โดยเว็บไม่พัง)

1. **วางราก** — สร้าง `config.js`, แก้ `layout.js`, เติม cache headers ใน `vercel.json`
   และแก้ `<head>` ของทุกหน้า (index.html + topics ทุกเรื่อง) ให้โหลด `config.js` ก่อน stylesheet
   พร้อมลิงก์ skin CSS (ตอนนี้มีหน้าเดียวที่ active คือ right-hand-rule + หน้าสารบัญ)
2. **แก้บั๊ก sim cache** — `vector3d.js` ฟัง themechange + ล้าง cache + อัปเดตสี
3. **สกัด Comic skin** — แปลง CSS จาก index2.html ทั้งสองไฟล์เป็น `shared/skins/comic.css`
   บน DOM มาตรฐานของ page-template (งานใหญ่สุด — comic เดิมใช้ DOM คนละโครง)
4. **ทดสอบ** — dot-matrix light/dark, comic light (+ toggle ต้องหาย) ทั้งหน้าสารบัญและ right-hand-rule
5. **เก็บกวาด** — ลบ `index2.html` ทั้งสองไฟล์, อัปเดต `AGENTS.md` + skill `page-template`:
   กฎใหม่ "skin อยู่ใน `shared/skins/` ต้อง implement token contract ครบ ห้ามแตะ DOM"

## Non-goals

- ไม่แตะ `_system/topics.json` และโครง layout 5 ส่วน
- ไม่มี UI เลือก skin ฝั่งผู้เรียน (skin เป็นการตัดสินใจระดับ deploy)
- ไม่มี build step / bundler

## ความเสี่ยงหลัก

ขั้น 3: Comic เคยออกแบบบน DOM อิสระ เมื่อบังคับใช้ DOM มาตรฐาน รายละเอียดบางอย่าง
(speech bubble, D-pad) อาจต้องลดรูป หรือเจรจาเพิ่ม class hook กลางแบบ generic ใน page-template
— ถ้าเจอให้เสนอเป็นรายกรณี ห้าม skin แก้ DOM เอง
