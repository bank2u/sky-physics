# Theme System (skin × mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สลับ visual identity (skin) ได้ด้วย config 1 บรรทัด + light/dark ต่อ skin โดยไม่ซ้ำไฟล์เนื้อหา และแก้บั๊ก sim สีค้างตอนสลับ dark mode

**Architecture:** skin เป็น CSS ล้วน scope ใต้ `[data-skin]` ในไฟล์แยกที่ `shared/skins/`, `shared/config.js` (sync ใน head) บอกว่าใช้ skin ไหน, `shared/layout.js` แสตมป์ attribute + คุม toggle + dispatch `physics-sim:themechange`, `vector3d.js` ฟัง event แล้ว re-resolve สี. Cache ทุกไฟล์ revalidate ผ่าน ETag ยกเว้น vendor immutable.

**Tech Stack:** vanilla JS (ES5 style ตาม codebase), CSS custom properties, Three.js r128 (vendored), Vercel static hosting, ไม่มี build step / test framework (verify ด้วย `node --check`, `python3 json`, `curl`, และ browser checklist)

**Spec:** `docs/superpowers/specs/2026-07-04-theme-system-design.md`

## Global Constraints

- ห้ามแตะโครง DOM ของหน้าใดๆ — skin เป็น CSS เท่านั้น (spec: "1 หน้า = 1 ไฟล์ HTML เสมอ")
- Token contract: skin ต้อง define token ชื่อเดียวกับ `:root` ใน `shared/styles.css` (อย่างน้อยกลุ่มที่ override)
- `data-skin` ไม่ระบุ = dot-matrix ทำงานจาก `:root` โดยไม่พึ่ง JS
- Default skin หลัง merge = `dot-matrix` (production ไม่เปลี่ยนหน้าตาจนกว่า deployer จะแก้ config เอง)
- Commit message = Conventional Commits, ลงท้าย `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- ห้ามแก้ `_system/topics.json` และห้ามแตะ `topics/projectile-motion/` เกินกว่าแก้ `<head>` ตามแผน
- หน้า active ที่ต้อง wire: `index.html`, `topics/projectile-motion/index.html`, `topics/right-hand-rule/index.html`

---

### Task 1: `shared/config.js` + wire เข้า `<head>` ทุกหน้า

**Files:**
- Create: `shared/config.js`
- Modify: `index.html` (head, ~line 7-8)
- Modify: `topics/projectile-motion/index.html` (head, ~line 7-8)
- Modify: `topics/right-hand-rule/index.html` (head, ~line 7-8)

**Interfaces:**
- Produces: `window.PhysicsSimConfig = { skin: string, skins: { [name]: { modes: string[] } } }` — Task 2 (layout.js) อ่าน object นี้
- ลำดับโหลดใน head: `config.js` → `styles.css` → `layout.js` (config ต้องมาก่อน layout.js เพราะ layout.js รันทันทีตอน parse)

- [ ] **Step 1: สร้าง `shared/config.js`**

```js
/* shared/config.js — ตั้งค่าระดับ deploy: เลือก skin ของทั้งเว็บ
   deployer แก้ค่า skin บรรทัดเดียว แล้ว push — ไม่ต้องแตะไฟล์อื่น
   ต้องโหลดแบบ sync ใน <head> ก่อน styles.css และ layout.js ของทุกหน้า */
window.PhysicsSimConfig = {
  skin: 'dot-matrix', // ← เปลี่ยนเป็น 'comic' เพื่อสลับทั้งเว็บ

  /* ทะเบียน skin: แต่ละ skin ประกาศว่ารองรับโหมดไหน
     ถ้ารองรับโหมดเดียว layout.js จะบังคับโหมดนั้นและซ่อนปุ่ม toggle */
  skins: {
    'dot-matrix': { modes: ['light', 'dark'] },
    'comic': { modes: ['light'] }
  }
};
```

- [ ] **Step 2: ตรวจ syntax**

Run: `node --check shared/config.js`
Expected: ไม่มี output (ผ่าน)

- [ ] **Step 3: แก้ head ของ `index.html`**

เดิม (บรรทัด 7-8):
```html
<link rel="stylesheet" href="shared/styles.css">
<script src="shared/layout.js"></script>
```
ใหม่:
```html
<script src="shared/config.js"></script>
<link rel="stylesheet" href="shared/styles.css">
<script src="shared/layout.js"></script>
```

- [ ] **Step 4: แก้ head ของ topic ทั้งสองหน้า (path ลึกกว่า ใช้ `../../`)**

`topics/projectile-motion/index.html` และ `topics/right-hand-rule/index.html` — เดิม:
```html
<link rel="stylesheet" href="../../shared/styles.css">
<script src="../../shared/layout.js"></script>
```
ใหม่:
```html
<script src="../../shared/config.js"></script>
<link rel="stylesheet" href="../../shared/styles.css">
<script src="../../shared/layout.js"></script>
```

- [ ] **Step 5: ตรวจว่า wire ครบและลำดับถูก**

Run: `grep -B1 'shared/styles.css' index.html topics/projectile-motion/index.html topics/right-hand-rule/index.html`
Expected: ทั้ง 3 หน้าเห็นบรรทัด `config.js` อยู่เหนือ `styles.css`

- [ ] **Step 6: ตรวจหน้าเสิร์ฟได้**

Run: `(npx --yes serve -l 5713 . >/tmp/serve.log 2>&1 &) ; sleep 2 ; for p in index.html shared/config.js topics/right-hand-rule/index.html topics/projectile-motion/index.html; do curl -sL -o /dev/null -w "$p %{http_code}\n" http://localhost:5713/$p; done`
Expected: 200 ทั้ง 4 บรรทัด

- [ ] **Step 7: Commit**

```bash
git add shared/config.js index.html topics/projectile-motion/index.html topics/right-hand-rule/index.html
git commit -m "feat(theme): add deploy-level skin config and wire into page heads"
```

---

### Task 2: `layout.js` — แสตมป์ `data-skin`, บังคับโหมดตาม skin, dispatch event

**Files:**
- Modify: `shared/layout.js` (แทนที่ทั้งไฟล์ — ไฟล์เดิม ~50 บรรทัด เนื้อหาใหม่ด้านล่างครบทั้งไฟล์)

**Interfaces:**
- Consumes: `window.PhysicsSimConfig` จาก Task 1 (มี fallback ถ้าหน้าไหนลืมโหลด config)
- Produces:
  - `document.documentElement[data-skin]` ถูกตั้งก่อน paint
  - `document.documentElement[data-theme]` = `'light'|'dark'` (บังคับค่าเดียวเมื่อ skin รองรับโหมดเดียว)
  - `CustomEvent('physics-sim:themechange')` บน `document` ทุกครั้งที่โหมดเปลี่ยน — Task 4 ฟัง event นี้
  - `window.PhysicsSimLayout = { mountTopbar, isDark, setTheme }` (API เดิม ไม่เปลี่ยน signature)

- [ ] **Step 1: แทนที่เนื้อหา `shared/layout.js` ทั้งไฟล์**

```js
/* shared/layout.js — โครง 5 ส่วนของ page: top bar ร่วม (โลโก้ Φ + toggle มืด/สว่าง)
   ใช้ผ่าน window.PhysicsSimLayout — โหลดใน <head> (ไม่ defer) เพื่อกันจอกระพริบตอนสลับ dark mode
   อ่าน skin จาก shared/config.js (ต้องโหลดมาก่อน) แล้วแสตมป์ data-skin ก่อน paint
   skin ที่รองรับโหมดเดียวจะถูกบังคับโหมดนั้นและไม่แสดงปุ่ม toggle */
(function () {
  var STORAGE_KEY = 'physics-sim-theme';

  var config = window.PhysicsSimConfig || {
    skin: 'dot-matrix',
    skins: { 'dot-matrix': { modes: ['light', 'dark'] } }
  };
  var skinName = config.skin;
  var skinDef = (config.skins && config.skins[skinName]) || { modes: ['light', 'dark'] };
  var modes = skinDef.modes || ['light', 'dark'];

  // แสตมป์ skin ทันที (script นี้รัน sync ใน head) กัน flash ของ skin default
  document.documentElement.setAttribute('data-skin', skinName);

  function storedTheme() {
    var v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  }

  function isDark() {
    if (modes.length === 1) return modes[0] === 'dark';
    var stored = storedTheme();
    if (stored) return stored === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function setTheme(dark) {
    if (modes.length === 1) dark = modes[0] === 'dark'; // skin โหมดเดียว: ค่าถูกบังคับ
    var value = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', value);
    localStorage.setItem(STORAGE_KEY, value);
    document.querySelectorAll('.toggle').forEach(function (t) {
      t.setAttribute('aria-pressed', String(dark));
    });
    document.dispatchEvent(new CustomEvent('physics-sim:themechange'));
  }

  // Apply ทันทีกัน flash: skin โหมดเดียวบังคับเลย, นอกนั้นตามค่าที่จำไว้
  if (modes.length === 1) {
    document.documentElement.setAttribute('data-theme', modes[0]);
  } else {
    var stored = storedTheme();
    if (stored) document.documentElement.setAttribute('data-theme', stored);
  }

  function mountTopbar(root, homeHref) {
    var toggleHtml = modes.length > 1
      ? '<button type="button" class="toggle" aria-label="สลับโหมดมืด/สว่าง" aria-pressed="' + isDark() + '">' +
        '<span class="toggle__thumb"></span></button>'
      : '';
    root.innerHTML =
      '<div class="topbar">' +
      '<a class="topbar__brand" href="' + homeHref + '">' +
      '<span class="topbar__logo">Φ</span>' +
      '<span class="topbar__name">PHYSICS-SIM</span>' +
      '</a>' + toggleHtml + '</div>';
    var toggle = root.querySelector('.toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        setTheme(!isDark());
      });
    }
  }

  window.PhysicsSimLayout = { mountTopbar: mountTopbar, isDark: isDark, setTheme: setTheme };
})();
```

- [ ] **Step 2: ตรวจ syntax**

Run: `node --check shared/layout.js`
Expected: ไม่มี output (ผ่าน)

- [ ] **Step 3: ตรวจพฤติกรรมด้วย grep (proxy test — ไม่มี DOM test framework)**

Run: `grep -c "data-skin\|physics-sim:themechange\|modes.length" shared/layout.js`
Expected: ≥ 5 (แสตมป์ skin 1, dispatch 1, เช็คโหมดเดียว ≥ 3)

- [ ] **Step 4: Commit**

```bash
git add shared/layout.js
git commit -m "feat(theme): stamp data-skin, per-skin mode lock, themechange event"
```

---

### Task 3: cache headers ใน `vercel.json`

**Files:**
- Modify: `vercel.json` (แทนที่ทั้งไฟล์)

**Interfaces:**
- Produces: ทุกไฟล์ revalidate ผ่าน ETag ทุกโหลด ยกเว้น `shared/vendor/*` cache ถาวร — ไม่มี task ไหน consume โดยตรง แต่เป็น requirement จาก spec ("Cache strategy")

- [ ] **Step 1: แทนที่ `vercel.json` ทั้งไฟล์**

หมายเหตุ: ใน Vercel เมื่อหลาย source match path เดียวกัน entry ที่มา**ทีหลัง**ชนะสำหรับ header key เดียวกัน — จึงวาง rule ทั่วไปก่อน แล้ว vendor override ทีหลัง

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    },
    {
      "source": "/shared/vendor/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

- [ ] **Step 2: ตรวจ JSON ถูกต้อง**

Run: `python3 -c "import json; d=json.load(open('vercel.json')); assert len(d['headers'])==2; print('valid,', len(d['headers']), 'header rules')"`
Expected: `valid, 2 header rules`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(deploy): ETag revalidation for all files, immutable cache for vendor"
```

---

### Task 4: `vector3d.js` — re-resolve สีเมื่อ theme เปลี่ยน (แก้บั๊กสีค้าง)

**Files:**
- Modify: `shared/sim/vector3d.js`

**Interfaces:**
- Consumes: `CustomEvent('physics-sim:themechange')` จาก Task 2
- Produces: API สาธารณะเดิม (`setBasis/setCurl/setLabel/setVisible/setPalmFlip/resetView/resize/destroy`) ไม่เปลี่ยน — เพิ่มพฤติกรรมภายใน: สี material/label/grid อัปเดตตาม token ปัจจุบันเมื่อ event มา และ `destroy()` ถอด listener

โครงสร้างเดิมที่เกี่ยวข้อง (อ้างอิงตอนแก้): `resolveCache` เป็น object module-level ที่ไม่เคยล้าง; `create()` resolve `COLORS` ครั้งเดียว; material ถูกสร้างกระจายใน `makeArrow`/`buildLoop`/`boxWithEdges` โดยไม่เก็บ reference กลาง; label สีถูกฝังตอน `updateTextSprite`

- [ ] **Step 1: ทำ `resolveCache` ล้างได้**

เดิม (บรรทัด ~21):
```js
  var resolveCache = {};
```
ใหม่:
```js
  var resolveCache = {};

  function clearResolveCache() {
    resolveCache = {};
  }
```
และใน `resolveVarToHex` ไม่ต้องแก้อะไร (อ่าน `resolveCache` ผ่าน closure ซึ่งชี้ object ใหม่หลังล้าง)

- [ ] **Step 2: รวมการ resolve สีเป็นฟังก์ชัน แล้วเก็บ registry ของ material ตาม role**

ใน `create()` เดิม:
```js
    var COLORS = {
      thumb: resolveVarToHex('--magenta', 0xF0665B),
      fingers: resolveVarToHex('--cyan', 0x4FC3C3),
      palm: resolveVarToHex('--yellow', 0xE8A33D),
      hand: resolveVarToHex('--surface', 0xDCEDF7),
      edge: resolveVarToHex('--ink', 0x0B2545),
      grid: resolveVarToHex('--ink', 0x1E4A72)
    };
    var labelBg = hexToRgba(resolveVarToHex('--surface', 0x0B2545), 0.82);
```
ใหม่:
```js
    function resolveColors() {
      return {
        thumb: resolveVarToHex('--magenta', 0xF0665B),
        fingers: resolveVarToHex('--cyan', 0x4FC3C3),
        palm: resolveVarToHex('--yellow', 0xE8A33D),
        hand: resolveVarToHex('--surface', 0xDCEDF7),
        edge: resolveVarToHex('--ink', 0x0B2545),
        grid: resolveVarToHex('--ink', 0x1E4A72)
      };
    }
    var COLORS = resolveColors();
    var labelBg = hexToRgba(COLORS.hand, 0.82);

    /* registry สี: ทุก material ที่ผูกกับ token ลงทะเบียนที่นี่ เพื่อ re-color ตอน theme เปลี่ยน */
    var themedMats = []; // { mat: THREE.Material, role: key ใน COLORS }
    function reg(mat, role) {
      themedMats.push({ mat: mat, role: role });
      return mat;
    }
```
(หมายเหตุ: `labelBg` เดิม resolve `--surface` อยู่แล้ว — `COLORS.hand` คือค่าเดียวกัน)

- [ ] **Step 3: ลงทะเบียน material ทุกจุดที่สร้าง**

`makeArrow`/`buildLoop`/`boxWithEdges` เป็น helper module-level — แก้จุดเรียกใน `create()` ให้ผ่าน `reg()` ไม่ได้โดยตรงเพราะ material อยู่ข้างใน helper ดังนั้นแก้ helper ให้ expose material ผ่าน `userData.mats` แล้วลงทะเบียนตอนเรียก:

`boxWithEdges` เดิมรับ `(handMat, edgeMat, w, h, d)` — material ส่งเข้าไปจากข้างนอกอยู่แล้ว จึงลงทะเบียนที่จุดสร้าง `handMat`/`edgeMat` ใน `create()`:
```js
    var handMat = reg(new THREE.MeshStandardMaterial({ color: COLORS.hand, roughness: 0.55, metalness: 0.06 }), 'hand');
    var edgeMat = reg(new THREE.LineBasicMaterial({ color: COLORS.edge }), 'edge');
```

`makeArrow(colorHex)` เดิมสร้าง `mat` ภายใน — เพิ่มบรรทัดท้ายก่อน `return group;`:
```js
    group.userData.mats = [mat];
```
แล้วที่จุดเรียกใน `create()` ลงทะเบียน:
```js
    var arrowThumb = makeArrow(COLORS.thumb);
    arrowThumb.userData.mats.forEach(function (m) { reg(m, 'thumb'); });
```
ทำแบบเดียวกันกับ `arrowFingers` (role `'fingers'`) และ `arrowPalm` (role `'palm'`)

`buildLoop(radius, cx, full, colorHex)` เดิมสร้าง line `mat` + `headMat` — เก็บทั้งคู่ใน `group.userData.mats`:
```js
    var mat = new THREE.LineBasicMaterial({ color: colorHex });
    // ... (โค้ดเดิม)
    var headMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    // ... (โค้ดเดิม)
    group.userData.mats = [mat, headMat];
    return group;
```
จุดเรียก: `circleLoop` → role `'fingers'`, `arc` → role `'thumb'`

grid ใน `create()`:
```js
    var grid = new THREE.GridHelper(10, 20, COLORS.grid, COLORS.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    reg(grid.material, 'grid');
```

- [ ] **Step 4: จำข้อความ label ล่าสุด เพื่อ re-render ด้วยสีใหม่ได้**

ใน `setLabel` เดิม:
```js
    function setLabel(part, text) {
      var sprite = LABEL_MAP[part];
      if (sprite) updateTextSprite(sprite, text, COLOR_MAP[part]);
    }
```
ใหม่ (เพิ่มการจำ text — `COLOR_MAP` จะถูกอัปเดตใน Step 5):
```js
    var lastLabelText = {};
    function setLabel(part, text) {
      var sprite = LABEL_MAP[part];
      if (!sprite) return;
      lastLabelText[part] = text;
      updateTextSprite(sprite, text, COLOR_MAP[part]);
    }
```

- [ ] **Step 5: ฟังก์ชัน `refreshTheme` + event listener + ถอดตอน destroy**

วางหลังนิยาม `resetView` ใน `create()`:
```js
    function refreshTheme() {
      clearResolveCache();
      COLORS = resolveColors();
      labelBg = hexToRgba(COLORS.hand, 0.82);
      COLOR_MAP.thumb = COLORS.thumb;
      COLOR_MAP.fingers = COLORS.fingers;
      COLOR_MAP.palm = COLORS.palm;
      COLOR_MAP.circle = COLORS.fingers;
      themedMats.forEach(function (t) {
        t.mat.color.setHex(COLORS[t.role]);
      });
      Object.keys(lastLabelText).forEach(function (part) {
        var sprite = LABEL_MAP[part];
        sprite.userData.bg = labelBg;
        updateTextSprite(sprite, lastLabelText[part], COLOR_MAP[part]);
      });
    }
    document.addEventListener('physics-sim:themechange', refreshTheme);
```
ข้อควรระวัง: `COLORS`/`labelBg`/`COLOR_MAP` ต้องประกาศด้วย `var` ที่ scope ของ `create()` (เป็นอยู่แล้ว) เพื่อให้ assign ทับได้ และ `makeTextSprite` เก็บ `bg` ไว้ใน `sprite.userData.bg` — ต้องอัปเดตก่อนเรียก `updateTextSprite`

ใน `destroy()` เดิม:
```js
      destroy: function () {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onWindowResize);
        renderer.dispose();
      }
```
ใหม่:
```js
      destroy: function () {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onWindowResize);
        document.removeEventListener('physics-sim:themechange', refreshTheme);
        renderer.dispose();
      }
```

- [ ] **Step 6: ตรวจ syntax + ตรวจว่าลงทะเบียนครบ**

Run: `node --check shared/sim/vector3d.js && grep -c "reg(" shared/sim/vector3d.js`
Expected: ผ่าน syntax และ `reg(` ≥ 6 จุด (handMat, edgeMat, grid, arrow×3 ผ่าน forEach — forEach นับรวมแล้วแต่ต้อง ≥ 6 เมื่อรวม loop 2 จุด)

Run: `grep -n "physics-sim:themechange" shared/sim/vector3d.js`
Expected: 2 บรรทัด (addEventListener + removeEventListener)

- [ ] **Step 7: Commit**

```bash
git add shared/sim/vector3d.js
git commit -m "fix(sim): vector3d re-resolves theme colors on themechange (stale dark-mode colors)"
```

---

### Task 5: `shared/skins/comic.css` + ลิงก์ในทุกหน้า

**Files:**
- Create: `shared/skins/comic.css`
- Modify: `index.html`, `topics/projectile-motion/index.html`, `topics/right-hand-rule/index.html` (เพิ่ม `<link>` ต่อจาก styles.css)

**Interfaces:**
- Consumes: `data-skin="comic"` attribute จาก Task 2, token contract จาก `shared/styles.css`
- Produces: skin comic สมบูรณ์บน DOM มาตรฐาน — palette แดง/น้ำเงิน/เหลือง, ฟอนต์ Kanit/Bungee, พื้น halftone, เงา sticker เดิม

หมายเหตุขอบเขต (จาก spec): รายละเอียด DOM-เฉพาะของ index2 (speech bubble, D-pad) **ไม่ port** — comic v1 = palette + ฟอนต์ + ลวดลาย + accent บน component มาตรฐาน

- [ ] **Step 1: สร้าง `shared/skins/comic.css`**

```css
/* Skin: Comic Lab — pop-art comic บนพื้นสว่าง (light เท่านั้น — ประกาศใน shared/config.js)
   Scope ทุก rule ใต้ [data-skin="comic"] — ห้ามมี rule นอก scope นี้
   Token contract: override เฉพาะค่า ห้ามเพิ่มชื่อ token ใหม่นอกเหนือจากที่ :root ใน styles.css ประกาศ */
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@500;600;700;800;900&family=Bungee&display=swap');

:root[data-skin="comic"] {
  --ink: #14161f;
  --paper: #eef2fb;
  --surface: #ffffff;

  /* palette comic แมปลง token กลาง: cyan→น้ำเงิน, magenta→แดง, yellow→เหลืองทอง */
  --cyan: #2f6bff;
  --magenta: #ff3b5c;
  --yellow: #ffc93c;
  --cyan-fg: #1e4dc4;
  --magenta-fg: #c41f3f;
  --yellow-fg: #8a6a00;

  --font: 'Kanit', 'Noto Sans Thai', sans-serif;

  --radius: 10px;
  --radius-lg: 16px;
  --radius-xl: 22px;
}

/* พื้นกระดาษ halftone แบบ comic (ทับ dot ปกติของ dot-matrix) */
:root[data-skin="comic"] body {
  background-image: radial-gradient(color-mix(in oklab, var(--ink) 22%, transparent) 1px, transparent 1px);
  background-size: 22px 22px;
  background-attachment: fixed;
}

/* โลโก้ topbar เป็นสติกเกอร์เหลือง */
:root[data-skin="comic"] .topbar__logo {
  background: var(--yellow);
  color: var(--ink);
  border: var(--border-w-sm) solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

/* ป้ายภาษาอังกฤษ (.en) เป็นสติกเกอร์เอียงสไตล์ comic */
:root[data-skin="comic"] .directory-header h1 .en,
:root[data-skin="comic"] .topic-title .en {
  font-family: 'Bungee', var(--font);
  opacity: 1;
  font-size: 12px;
  background: var(--yellow);
  border: var(--border-w-sm) solid var(--ink);
  border-radius: 8px;
  padding: 4px 10px;
  display: inline-block;
  transform: rotate(-3deg);
  box-shadow: 3px 3px 0 var(--ink);
  vertical-align: middle;
}

/* การ์ดสารบัญ: เงา offset เป็นสีตามหมวด (ผ่าน accent ของ category dot ที่การ์ดอยู่ใต้) */
:root[data-skin="comic"] .card:hover {
  transform: translate(-2px, -2px) rotate(0deg);
}
:root[data-skin="comic"] .card--compact:hover {
  transform: translate(-2px, -2px) rotate(0deg);
}

/* กรอบสรุปสั้น/คำอธิบาย ใช้เส้นประหนาแบบช่องการ์ตูน */
:root[data-skin="comic"] .recap-strip {
  border-style: dashed;
}
```

- [ ] **Step 2: เพิ่ม `<link>` ใน head ทั้ง 3 หน้า ต่อจาก styles.css**

`index.html`:
```html
<link rel="stylesheet" href="shared/styles.css">
<link rel="stylesheet" href="shared/skins/comic.css">
```
`topics/projectile-motion/index.html` และ `topics/right-hand-rule/index.html`:
```html
<link rel="stylesheet" href="../../shared/styles.css">
<link rel="stylesheet" href="../../shared/skins/comic.css">
```

- [ ] **Step 3: ตรวจทุก rule อยู่ใต้ scope**

Run: `grep -cv '^\s*$\|^/\*\|^\s*\*\|^@import\|^:root\[data-skin\|^\s\|^}' shared/skins/comic.css`
Expected: `0` (ทุกบรรทัดที่เป็น selector เริ่มด้วย `:root[data-skin` — ไม่มี rule หลุด scope)

- [ ] **Step 4: ตรวจ token ที่ override เป็น subset ของ contract**

Run:
```bash
python3 - <<'EOF'
import re
base = set(re.findall(r'(--[a-z][\w-]*)\s*:', open('shared/styles.css').read()))
skin = set(re.findall(r'(--[a-z][\w-]*)\s*:', open('shared/skins/comic.css').read()))
extra = skin - base
print('extra tokens:', extra if extra else 'none')
assert not extra, 'skin ประกาศ token นอก contract'
print('OK: comic overrides %d/%d base tokens' % (len(skin & base), len(base)))
EOF
```
Expected: `extra tokens: none` + บรรทัด OK

- [ ] **Step 5: ตรวจหน้าเสิร์ฟได้**

Run: `curl -sL -o /dev/null -w "%{http_code}\n" http://localhost:5713/shared/skins/comic.css`
Expected: `200`

- [ ] **Step 6: Commit**

```bash
git add shared/skins/comic.css index.html topics/projectile-motion/index.html topics/right-hand-rule/index.html
git commit -m "feat(theme): add comic skin as pure-CSS layer on standard DOM"
```

---

### Task 6: ทดสอบ 4 ชุดค่า (browser checklist — ต้องให้ครูช่วยดู)

**Files:** ไม่แก้ไฟล์ (ยกเว้นพบบั๊กจึงแก้จุดที่พบ)

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1-5

- [ ] **Step 1: รัน local server แล้วเปิดตามรายการ**

Run: `npx --yes serve -l 5713 .` แล้วเปิด browser ตาม checklist:

| # | ตั้งค่า | หน้า | สิ่งที่ต้องเห็น |
|---|---|---|---|
| 1 | config `skin:'dot-matrix'` | `/` | หน้าตาเดิมทุกประการ, toggle มี, สลับ dark ได้ |
| 2 | config `skin:'dot-matrix'` + dark | `/topics/right-hand-rule/` | **สีใน 3D canvas เปลี่ยนตาม** ทันทีที่กด toggle (บั๊กเดิมต้องหาย) |
| 3 | แก้ config เป็น `skin:'comic'` | `/` | palette แดง/น้ำเงิน/เหลือง ฟอนต์ Kanit ป้าย .en เป็นสติกเกอร์ **ไม่มีปุ่ม toggle** |
| 4 | config `skin:'comic'` + OS เป็น dark mode | `/topics/right-hand-rule/` | ยังเป็น light (โหมดถูกบังคับ) สี sim เป็นชุด comic |

- [ ] **Step 2: เช็ค console ไม่มี error ทั้ง 4 ชุด** (DevTools → Console ระหว่างเปิดแต่ละหน้า)

- [ ] **Step 3: คืนค่า config เป็น `skin: 'dot-matrix'`** (default production ตาม Global Constraints)

Run: `grep -n "skin: 'dot-matrix'" shared/config.js`
Expected: 1 บรรทัด (ค่า default ถูกคืนแล้ว)

- [ ] **Step 4: Commit (ถ้ามีการแก้บั๊กระหว่างทดสอบ)**

```bash
git add -A
git commit -m "fix(theme): issues found during 4-combo verification"
```
(ข้ามถ้าไม่มีไฟล์เปลี่ยน)

---

### Task 7: เก็บกวาด — ลบ index2, อัปเดตกฎใน AGENTS.md + skill

**Files:**
- Delete: `index2.html`, `topics/right-hand-rule/index2.html`
- Modify: `AGENTS.md` (section "โครงสร้าง")
- Modify: `.claude/skills/page-template/SKILL.md` (append section ท้ายไฟล์)

**Interfaces:**
- Consumes: comic skin จาก Task 5 ผ่านการทดสอบ Task 6 แล้ว (identity ของ index2 ถูกแทนที่สมบูรณ์)

- [ ] **Step 1: ลบไฟล์ทดลอง**

```bash
git rm index2.html topics/right-hand-rule/index2.html
```

- [ ] **Step 2: เพิ่มบรรทัดใน `AGENTS.md` section "โครงสร้าง"**

เดิม:
```markdown
- `shared/styles.css` — design system | `shared/layout.js` — โครง 5 ส่วน | `shared/sim/*.js` — คลัง simulation ใช้ซ้ำ
```
ใหม่:
```markdown
- `shared/styles.css` — design system | `shared/layout.js` — โครง 5 ส่วน | `shared/sim/*.js` — คลัง simulation ใช้ซ้ำ
- `shared/config.js` — เลือก skin ระดับ deploy | `shared/skins/<name>.css` — skin เป็น CSS ล้วน scope ใต้ `[data-skin]` ต้องใช้ token contract เดิม ห้ามแตะ DOM
```

- [ ] **Step 3: Append ท้าย `.claude/skills/page-template/SKILL.md`**

```markdown

## Skin system

- skin = visual identity เต็ม (สี ฟอนต์ เงา ลวดลาย) อยู่ที่ `shared/skins/<name>.css` — ทุก rule ต้อง scope ใต้ `:root[data-skin="<name>"]`
- skin override ได้เฉพาะค่า token ที่ `:root` ใน `shared/styles.css` ประกาศ + component rule เพิ่มเติม — **ห้ามเพิ่มชื่อ token ใหม่ และห้ามพึ่งโครง DOM ที่ต่างจาก page template นี้**
- ลงทะเบียน skin + โหมดที่รองรับใน `shared/config.js` (`skins` registry) — skin โหมดเดียว ปุ่ม toggle จะถูกซ่อนอัตโนมัติ
- หน้าใหม่ทุกหน้าต้องโหลดใน head ตามลำดับ: `config.js` → `styles.css` → skin css ทุกไฟล์ → `layout.js`
- sim ที่วาดลง canvas ต้อง resolve สีจาก CSS token และฟัง event `physics-sim:themechange` เพื่อ re-resolve (ดู `shared/sim/vector3d.js` เป็นแบบ)
```

- [ ] **Step 4: ตรวจไม่มีอะไรอ้าง index2 ค้าง**

Run: `grep -rn "index2" --include="*.html" --include="*.js" --include="*.json" --include="*.md" . | grep -v docs/superpowers | grep -v node_modules`
Expected: ไม่มี output

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(theme): retire index2 experiments, document skin rules in AGENTS.md and page-template skill"
```

---

## Self-Review (ทำแล้ว)

- **Spec coverage:** config 1 บรรทัด→T1, layout.js สามหน้าที่→T2, cache→T3, sim บั๊ก+event→T4, comic skin+ลิงก์ head→T5 (รวม head-wiring จาก migration ขั้น 1 ของ spec: config ใน T1, skin link ใน T5), ทดสอบ 4 ชุด→T6, ลบ index2+อัปเดตเอกสาร→T7 ✓
- **Placeholder scan:** ทุก step มีโค้ด/คำสั่ง/ค่า expected จริง ✓
- **Type consistency:** `window.PhysicsSimConfig` (T1=T2), `physics-sim:themechange` (T2=T4=skill doc T7), `data-skin` (T2=T5), ลำดับ head (T1=T5=skill doc T7) ✓
