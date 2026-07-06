---
name: skin-workflow
description: Use for ALL skin/theme work on this site — creating a new skin, editing an existing one, or fixing legibility/contrast/decoration issues in shared/skins/*.css. Triggers เมื่อผู้ใช้พูดว่า "แก้ skin", "สร้าง skin/theme", "เปลี่ยนธีม", "อ่านยาก" about skinned UI. Standalone workflow, normally executed by agent skin-smith.
---

# Skin Workflow

Create or edit skins in `shared/skins/<name>.css`. A skin is pure CSS scoped under
`[data-skin="<name>"]` that overrides design tokens declared in `shared/styles.css`.

**File scope: `shared/skins/*.css` and `shared/config.js` only.** If the task requires
touching `shared/styles.css`, layout.js, or any DOM structure — stop and report back;
that is outside skin scope by project rule.

## 1. Thinking system (mandatory, in this order)

1. **Diagnose** — reproduce/observe the issue (screenshot the exact spot) before
   touching CSS.
2. **Root cause in one sentence** — if you cannot state it, you are not ready to edit.
   Check the pitfall library (§3) first; most legibility bugs recur.
3. **Single targeted fix** — fix the cause, not the symptom. Never add layers on top
   of a broken rule (e.g., if a shadow color equals the text color, fix the color
   relationship — don't stack more shadows). One concern per edit.
4. **Verify that spot** (§4), then move to the next concern.
5. If verify fails twice on the same root cause: stop, report findings, don't loop.

Legibility diagnosis protocol (run these checks before proposing a fix):
- Shadow color vs text color — do they resolve to the same token? (Trace aliases:
  `--accent-*-fg` and `--tile-accent-*-fg` may map to the same value.)
- Shadow offset vs font-size — offsets that look right at 40px smear at 20px.
- `text-shadow` is **inherited** — it leaks into child elements (badges, `.en` tags);
  children may need an explicit reset.
- Contrast of the fg token on its *actual* rendered background (tint mixes shift it).
- Thai vowels/tone marks are thin and sit above/below the line — stacked shadows and
  tight line-height break them first. Always verify with Thai text, not just Latin.

## 2. Token contract

A skin may **only override values** of tokens that `shared/styles.css` `:root`
already declares. Never invent new token names. Overridable groups:

- Core: `--ink` `--paper` `--surface`
- Accents: `--cyan` `--magenta` `--yellow` + `--cyan-fg` `--magenta-fg` `--yellow-fg`
- Tiles: `--tile-{cyan,magenta,yellow}-{bg,fg}` `--value-glow` `--dot-color`
- Semantic aliases: `--bg` `--border` `--text` `--text-muted` `--accent`
  `--accent-soft` `--value` `--sim-bg` `--grid`,
  `--accent-{primary,secondary,tertiary}[-fg]`, `--tile-accent-*`
- Type: `--font` `--mono` `--fs-{title,desc,value,label,body,eq}`
- Geometry: `--space-1..7` `--gap` `--pad` `--radius[-lg,-xl,-pill]`
  `--border-w[-sm]` `--slider-h` `--slider-thumb` `--btn-h` `--sim-header-clearance`
- Effects/motion: `--shadow-{sm,md,lg,btn}` `--ease-bounce` `--dur-{fast,slow}`

Hard rules (from AGENTS.md):
- Every rule scoped under `[data-skin="<name>"]` — zero rules outside the scope.
- No DOM changes; decoration only via pseudo-elements with `pointer-events: none`,
  never overlapping the sim drawing surface (`.sim-zone svg` / `canvas`).
- Fonts via `skins[name].fontsUrl` in `shared/config.js` — **never `@import`**
  (an `@import` loads on every page regardless of active skin).
- A skin declares which modes it supports in `config.js` (`modes: ['light']` etc.).

**For anything not listed above** (selectors, class structure, component markup):
`grep` the specific selector in `shared/styles.css` / `shared/layout.js` — never read
those files whole.

## 3. Pitfall library (real bugs from this repo — check before diagnosing anew)

| Symptom | Cause |
|---|---|
| Big numerals look doubled/blurry | Shadow layer token aliases to the text's own color → same-color glyph offset 1px |
| Wordmark letters bleed together | Shadow offset (2px) too large for small font-size (20px) on tight-tracked display font |
| Text inside child badge blurry | `text-shadow` inherited from styled parent; child needs `text-shadow: none` |
| Other skins load unused webfonts | Font loaded via `@import` instead of `config.js` `fontsUrl` |
| Thai diacritics illegible | Multi-layer shadows / outline halos too thick for thin marks |

When you hit a **new** pitfall, append it to this table as part of your change.

## 4. Verify (token-efficient — scale to the task)

Serve first: `(npx --yes serve -l 5757 . > /tmp/serve.log 2>&1 &)` — kill when done
(`pkill -f "serve -l 5757"`). Note: server redirects `/index.html` → clean URLs.

**Structural lint (always, before browser):**
- All rules scoped under `[data-skin="<name>"]` (grep for rules outside scope).
- No token names introduced that `styles.css :root` doesn't declare.

**Targeted fix** → browser check of only what changed:
- `zoom` screenshot of each changed region + ONE full-page sanity screenshot.
- Do NOT screenshot every page or re-verify unchanged areas.

**New skin / broad redesign** → full pass:
- Directory page + one topic page (e.g. `topics/friction/`).
- Exercise interactions: hover a card, drag a slider, press play.
- Each mode the skin declares in `config.js`; `prefers-reduced-motion` honored for
  any animation the skin adds.

## Output

Report (no commit — teacher reviews the diff):
- Root cause, one sentence each.
- What changed: `file:line` list.
- Verify evidence: which screenshots taken, what they showed.
- Any new pitfall added to §3.
