# Skin Workflow Agent + Skill — Design

Date: 2026-07-06
Status: approved for planning

## Goal

A dedicated agent + skill for creating and editing site skins (`shared/skins/*.css`),
optimized for three things the user named explicitly:

1. **Targeted fixes** — diagnose root cause, change one thing, verify that thing.
2. **A good thinking system** — a mandatory diagnose → root-cause → fix → verify loop,
   never shotgun patching.
3. **Overall token economy** — all heavy loops (file reading, screenshot verify) run
   inside the agent's context, not the main session; knowledge is pre-distilled into
   the skill so the agent greps instead of re-reading shared files every run.

Decisions made with the user:

- **All skin work goes through the agent** — even one-line fixes. The dispatch cost is
  accepted because every skin task ends in a browser verify loop, which is the
  token-heavy part worth isolating.
- **Hybrid knowledge strategy** — the skill embeds only stable knowledge (token
  contract names, scope rules, known pitfalls); anything volatile (selectors, class
  structure) is grepped from source at run time. Avoids staleness without paying
  full-file reads.
- **Agent and skill are written in English** to reduce token weight (project's other
  skills are Thai; this pair deliberately deviates, user approved).
- Architecture: **thin agent + fat skill** (knowledge lives in the skill, reusable by
  opencode per project convention; the agent is a routing shell).

## Components

### 1. `.claude/agents/skin-smith.md` (new — first agent in this project)

Frontmatter:
- `name: skin-smith`
- `description`: dispatch target for ALL skin/theme work (create new skin, fix
  existing skin, tune legibility/contrast). Trigger words: "skin", "theme", "แก้ skin",
  "สร้าง skin".
- `model: sonnet` — per the project's fixed tier mapping (thinking & coding tier).
- `tools`: Read, Edit, Write, Grep, Glob, Bash, ToolSearch + claude-in-chrome browser
  tools (needed for visual verify).

Body (short):
- First action: load skill `skin-workflow` and follow it exactly.
- File scope: may modify **only** `shared/skins/*.css` and `shared/config.js`.
  Never `shared/styles.css`, never DOM/layout files, never topic pages.
- **Never commit.** End every run by reporting: what was diagnosed, what changed
  (file:line), and verify evidence (screenshot results). The teacher reviews the diff.

### 2. `.claude/skills/skin-workflow/SKILL.md` (new)

Frontmatter description (English, with Thai trigger words included so main-session
matching still works): use when creating or editing a skin/theme; step X of nothing —
standalone workflow.

Four sections:

**A. Thinking system (the core)**
Mandatory order: *diagnose → root cause → single targeted fix → verify that spot*.
Rules:
- Before editing, state the root cause in one sentence. If you cannot, you are not
  ready to edit.
- Fix the cause, not the symptom (e.g., if a shadow color equals the text color,
  fix the color relationship — don't add more layers on top).
- One concern per edit; re-verify after each.
- Legibility diagnosis protocol: check shadow color vs text color (same token?),
  shadow offset vs font-size proportion, `text-shadow` is inherited (leaks into
  child elements), contrast of fg token on its actual bg.

**B. Token contract (stable, embedded)**
- The list of token *names* a skin may override (from `styles.css` `:root`):
  colors (`--ink`, `--paper`, `--surface`, `--cyan/magenta/yellow` + `-fg` variants),
  font (`--font`), radii, border widths, shadows, motion vars. Exact current list
  copied in at build time.
- Hard rules restated from AGENTS.md: every rule scoped under `[data-skin="<name>"]`;
  no new token names; no DOM changes; fonts via `config.js` `fontsUrl`, never
  `@import` (loads for every skin); decorative pseudo-elements must be
  `pointer-events: none` and must never overlap the sim drawing surface.
- For anything not in the embedded list (selectors, class structure): **grep
  `shared/styles.css` for the specific selector — never read the whole file.**

**C. Pitfall library (grown over time)**
Seeded with real bugs already hit in this repo:
- Same-color stacked shadow: shadow layer using a token that aliases to the text's
  own color → smeared glyphs.
- Shadow offset too large for small font-size → adjacent-letter shadow bleed
  (Bungee wordmark case).
- `text-shadow` inheritance into child badges (`.topic-title .en` needed a reset).
- `@import` fonts leak across skins → must use `fontsUrl` in config.js.
- Thai vowels/tone marks are thin — stacked shadows blur them first.
Each entry: one line symptom → one line cause. New pitfalls get appended when
discovered (skill instructs the agent to propose the addition in its final report).

**D. Token-efficient verify**
- Targeted fix → `zoom` screenshot of the changed region(s) + one full-page sanity
  shot. Do not screenshot every page.
- New skin → full pass: directory page + one topic page + exercise interactions
  (hover/slider/play) + `prefers-reduced-motion` check.
- Serve via `npx serve`, kill the server when done.
- Structural lint before browser: all rules scoped under `[data-skin]`, no new token
  names introduced (grep-diff against the contract list).

### 3. `AGENTS.md` — one line added

Under the skills section: all skin work is dispatched to agent `skin-smith`
(the main session must not edit skin files directly).

## Error handling

- If the requested change requires touching `shared/styles.css` or DOM structure,
  the agent stops and reports back — that's outside skin scope by project rule.
- If verify fails after 2 fix attempts on the same root cause, stop and report
  findings rather than looping.

## Testing

Acceptance: dispatch the agent on a real small task (e.g., a cosmetic tweak to the
comic skin) and confirm: it loads the skill, greps instead of full-file reads,
verifies with zoom screenshots, doesn't commit, and reports a diff summary.
