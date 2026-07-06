# Comic Skin Redesign — "หน้าหนังสือคอมิค" (Comic Book Page)

Date: 2026-07-06
Status: Approved by teacher (chose direction A, requested full skin-system compliance)

## Goal

Upgrade `shared/skins/comic.css` (currently a light overlay of ~10 targeted rules) into a
full pop-art "comic book page" reskin, while staying 100% inside the existing skin system:
no DOM changes, no new CSS custom-property names beyond what `shared/styles.css` already
declares, everything scoped under `[data-skin="comic"]`. Switching back to `dot-matrix` via
`shared/config.js` must continue to work with zero residue.

## Non-goals

- No changes to `shared/styles.css`, `shared/layout.js`, or any `topics/<id>/index.html`.
- No new token names in the `:root[data-skin="comic"]` contract — only overriding existing
  tokens (`--ink`, `--paper`, `--cyan` family, `--radius*`, `--shadow*`, `--border-w*`, `--font`).
- No changes inside sim SVG/canvas content — decoration lives on chrome (frames, buttons,
  cards, headers), never inside the sim zone's drawing surface.
- No new Google Fonts weights beyond what's needed (avoid bloating `fontsUrl` unnecessarily).

## Design

### 1. Base layer (paper + font)

- Two-layer halftone background: existing ink dot grid (22px) stays, add a second larger,
  fainter yellow Ben-Day dot layer beneath it via a second `background-image` on `body`
  (comma-separated `background-image`/`background-size`/`background-position` lists).
- `::selection` under `[data-skin="comic"]` → yellow highlight, ink text.
- `:focus-visible` → thick ink outline (accessibility for smartboard/keyboard use).
- Fonts unchanged: Kanit (body/headings), Bungee (English accent labels + new action-word
  decorations). No new weights needed — Bungee is single-weight already.

### 2. Topbar

- Logo sticker (existing yellow box) gets a `rotate(-4deg)` rest state and a brief wiggle
  keyframe on `:hover` (`rotate` oscillation, ~400ms, `ease-bounce`).
- `.topbar__name` rendered in Bungee with a 2px flat blue offset text-shadow.
- `.topbar::after` adds a thin repeating-gradient halftone strip along the bottom border.

### 3. Directory page

- `.category__head` restyled as a narration/caption box: yellow fill, ink border, `rotate(-2deg)`,
  comic-style drop shadow. Category dot (`.category__dot`) becomes a starburst via `clip-path:
  polygon(...)` (8-point star), color unchanged (cyan/magenta/yellow per category).
- `.card` / `.card--compact`: alternating rotate via `:nth-child(odd/even)` (±0.6deg), rest-state
  shadow already ink; on `:hover` shadow becomes a **color-mixed** offset shadow derived from
  whichever accent the card's ancestor `.category__dot--*` uses — implemented by scoping hover
  shadow color per category block (`.category:has(.category__dot--cyan) .card:hover`, etc.),
  since cards don't carry their own accent class today.
- Card `:hover` also reveals a `::after` "READ!" starburst badge (small yellow 8-point star with
  the word, Bungee font) fading/scaling in at the top-right corner, `pointer-events: none`.
- `.badge-level.is-filled` stays yellow-filled sticker (already implemented) — no change needed.
- `.chip.is-active` gets a `★` prefix via `::before`.

### 4. Topic page

- `.topic-title`: layered text-shadow (blue offset 2px, ink offset 4px) for comic-lettering look.
- `.topic-desc` becomes a speech bubble: ink border, surface fill, rounded, with a CSS-drawn
  tail (`::after`, two borders forming a triangle) pointing up toward the title.
- `.sim-zone`: border width bumps to 5px, adds a second inset border (`box-shadow: inset 0 0 0
  Npx var(--paper), inset 0 0 0 (N+2)px var(--ink)` trick or an actual second wrapper via
  `::before` framed absolutely) for the "double-frame panel" look. A faint blue halftone dot
  cluster is added at one corner via `::after` with `pointer-events: none` so it never sits over
  interactive sim content.
- `.sim-legend`: reshaped from pill to a slightly rotated (`-1deg`) rectangular caption-box style
  (sharper `--radius`, not `--radius-pill`, ink border, yellow fill for default legend — primary/
  secondary/tertiary variants keep their existing accent-colored fills).

### 5. Controls

- `.slider__fill`: diagonal white-stripe overlay via `repeating-linear-gradient`, layered on top
  of the existing solid accent fill (`background-image` + `background-color`).
- `.slider__thumb`: border color switches from flat ink to the slider's own `--slider-accent`
  variable (already defined per slider via `.slider--angle`/`.slider--velocity`), thicker border.
- `.btn-play`: add `::after` "GO!" starburst badge fixed at top-right corner (small, Bungee,
  yellow star), `:hover` adds radiating action-lines behind the button via a pseudo-element with
  `repeating-conic-gradient` clipped to a ring outside the button box, `:active` keeps existing
  scale-down and additionally collapses the shadow to 0 (already implicit via existing `:active`
  transform — verify visually).
- Value tiles (`.tile__value`): add layered text-shadow matching the tile's accent color; tile
  corners get a small screentone (3x3 halftone dots) decoration via `::before` in one corner,
  `pointer-events: none`.

### 6. Equations + concept section

- `.equation-card::after`: a dog-ear fold in the top-right corner (two triangles: paper-colored
  triangle + ink-colored border sliver, positioned absolutely).
- `.concept h2` restyled as the same narration/caption-box treatment as `.category__head`, for
  visual consistency across the page.

### 7. Motion & accessibility

- All new keyframe animations (wiggle, action-lines, star pop-in) wrapped in
  `@media (prefers-reduced-motion: reduce)` overrides that disable animation/transition.
- Decorative pseudo-elements (`::before`/`::after` stars, action lines, halftone corners) use
  `content` with decorative strings only, `pointer-events: none`, and `aria-hidden` is not
  needed since they're not real DOM nodes — but ensure no decorative text is ever placed in a
  way screen readers pick up (CSS `content` on pseudo-elements is already ignored by most screen
  readers, but avoid relying on it for real information).
- No changes to contrast ratios of real text — ink-on-light everywhere, matching existing
  10-meter-legibility standard.

### 8. Verification plan

- `npx serve` locally, view in Chrome with comic skin active (already default in `config.js`).
- Screenshot: directory page, and 3 topic pages covering different sim shapes — a 2D SVG sim
  (`projectile-motion`), a graph-heavy sim (`motion-graphs`), and the 3D vector sim
  (`right-hand-rule`, uses `.sim-zone--3d` which disables the CSS dot background — confirm new
  double-frame border doesn't depend on that background).
- Confirm: slider still draggable, button still clickable, console has no errors, switching
  `shared/config.js` skin back to `dot-matrix` shows zero comic-only residue.
- Confirm `prefers-reduced-motion: reduce` (via Chrome emulation) disables all new motion.

## Implementation notes for the plan phase

- All work is a single-file change: `shared/skins/comic.css` (plus reviewing whether
  `shared/config.js`'s `fontsUrl` needs adjustment — expected: no, Bungee already loaded).
- Per project convention ([[feedback_workflow_model_tiers]] equivalent for this ad-hoc design
  task — not a topic-workflow step, but same spirit): implementation should be executed with the
  Sonnet model tier, per explicit user instruction.
- Suggest structuring the implementation plan in the same order as sections 1–6 above, each as
  an independently reviewable chunk of the CSS file, followed by section 7 (motion/a11y pass) and
  section 8 (verification) as final steps.
