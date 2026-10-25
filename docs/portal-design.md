# CB Office (portal) — Design Guide

**Audience:** the UX/UI Architect role (`.claude/agents/ux-ui-architect.md`) and any builder changing a portal screen. It records the **current design system and the rules a change is checked against**. Story #118 turns the "interim" rules below into real tokens; until then this guide plus the existing components are the standard.

Verified against `campaign-buddy-portal/src` on 2026-10-25. Items marked **(pending PR #108)** are in an open PR, not on `main`. If this guide and the code disagree, the code is the truth — fix the guide. The mobile app has its own theme (`campaign-buddy-app/src/theme`); a mobile design guide is not written yet.

## 1. Principles
1. **Show the answer first** — pages open populated with sensible defaults; no "press Load".
2. **Undo beats "Are you sure?"** — act at once when reversible; ask only when it truly isn't.
3. **Progressive disclosure** — required things first, the rest on demand.
4. **Calm and consistent** — one type scale, one button hierarchy (one primary per view), real empty / loading / error states.
5. **Accessible by default** — WCAG 2.2 AA.
6. **The client (sponsor) view is the shop window** — read-only, plain language, no admin furniture, no raw ids.

## 2. Tokens (interim)
**Colour** (`src/styles/tokens.css`): `--ink #12241F` (dark green, sidebar), `--ink-soft`, `--surface #F4F6F3` (page), `--surface-card #FFF`, `--line #E3E7E1`, `--text-primary #16211C`, `--text-muted #647169`, accent `--mango #FF7A33` / `--mango-dark` / `--mango-tint`, semantic `--success`, `--pending`, `--alert`, `--info` each with a `-tint`. One accent (mango); semantic colours are separate from it.
**Typography:** body `Liberation Sans, Arial`; display headings `Poppins` (`.h-display`, page titles). Interim rules: **body text 13px, small labels 12px, nothing under 11px**; table headers 12px uppercase; page title ≈21px. `app.css` currently holds **14 distinct `font-size` values** (9, 10, 10.5, 11.5, 12, 13, 13.5, 14, 15, 16, 18, 20, 21, 25px) — three of them (9, 10, 10.5px: map pins, axis, chips) are already under the 11px floor. #118 replaces them with a scale; don't add new ad-hoc sizes.
**Radius:** the common values are 8 / 10 / 12 / 16 px and 20 px pills, but about ten other values (2–24px) also appear; prefer 10 (controls) and 12–16 (cards/panels) for new work.
**Spacing:** 4/8/12/16/24 multiples; use flex/grid `gap`, not margins between siblings.
**Not yet defined:** type/spacing/elevation tokens, dark theme (all colours go through tokens, so a dark theme is feasible later).

## 3. Layout and responsive rules
Shell: sidebar 250px (icon rail 66px), topbar 64px, content max-width 1400px (`.content`). Breakpoints in `app.css`: **≤1200** stat grid 3 columns; **≤1024 or coarse pointer** bigger tap targets; **≤980 (tablet)** sidebar auto-collapses to an icon rail, opened by tap; **≤767 (phone)** sidebar becomes an off-canvas drawer opened from the hamburger, tables render as stacked cards (`.table-cards`), top bar compresses; **≤640** extra phone tightening.
Rules: **the page never scrolls horizontally** (wide tables scroll inside their own container, first column sticky below 1024); table headers never break mid-word (`word-break: normal`, guarded by `styles/table-fit.test.js`); table cells wrap rather than force `nowrap`; verify at **375 / 768 / 1280 px**.

## 4. Components (use these; don't reinvent)
| Component | Use for | Notes |
|---|---|---|
| `DataTable` + `ResourcePage` | every list (CRUD resources) | page-size selector, search and pager appear only when >10 rows (search stays while it has text); row actions are `role="button"`, labelled, keyboard-operable; footer "Showing x to y of n" |
| `FilterBar` | list/report filters | filters apply as you change them; its button is always **Refresh**. (A hand-rolled **Apply** exists only on Supervisor Task Results, where filters don't apply until clicked) |
| `Drawer` | add/edit forms | generic, driven by `formFields` in `config/resources.jsx`; long forms should be sectioned (#115). **Today it has no dialog role, Escape handling or focus management** (target state; bug #129, see §8) |
| `Modal` | rare centred dialogs | has `role="dialog" aria-modal`; no Escape or focus handling yet |
| `Loader` | first-load placeholder | skeleton rows, `role="status"`, reduced-motion safe |
| `EmptyState` / `ErrorState` | no data / failed load | empty states say what to do next; errors offer retry. Neither is announced to screen readers today (§8) |
| `SearchableSelect` | pickers with many options | combobox-style, keyboard supported |
| `StatCard`, `TrendChart`, `CampaignMap`/`LiveMapView` | dashboard and live views | charts need a text equivalent; maps need named markers |
| `Badge` + `.badge.success/info/pending/alert/muted` | status pills | state shown as text + colour, never colour alone |
| `Sidebar` | navigation | sections fold (state remembered per browser), favorites pinned above |
| `Topbar` | campaign switcher, account menu | selected campaign is remembered per user; page title and the small section label above it come from `config/nav.js` via `lib/navLabel.js` |
| Toast (`ToastContext`) | success / error feedback | bottom-centre stack, ~2.6 s, message + type, no dismiss button or stack limit; not announced to screen readers today. **Action button (Undo, ~7 s) and the confirm dialog `ConfirmContext` are (pending PR #108)** |
Buttons: `.btn-primary` (one per view), `.btn-secondary`, `.btn-ghost-alert`, `.btn-excel`, `.btn-sm`; `.btn-danger` (pending PR #108).

## 5. Patterns
- **Loading / empty / error:** skeleton → content; empty = title + next step; error = what happened + retry.
- **Feedback:** every save/delete gives a toast naming what happened.
- **Confirm vs Undo:** reversible → act at once and offer Undo (**needs restore endpoints, #110/#111**); irreversible or high-blast (campaign/client delete) → confirm dialog with **Cancel focused**; sales archive keeps its confirmation by spec (`docs/sales-archive-spec.md`). Until PR #108 merges, native `window.confirm` is still used in 7 places.
- **Reports and logs** open on a bounded date range (`defaultRange: 'week' | 'campaign'` in `config/resources.jsx`, computed from the Colombo day); blank dates fall back to that default.
- **Campaign context:** the selected campaign persists across reloads per user (`lib/campaignChoice.js`), validated against the user's own campaigns.
- **Page titles:** the browser tab names the page (`lib/navLabel.js` `documentTitle`).
- **Forms:** required fields first, optional groups on demand, inline validation (target state, story #115).

## 6. Accessibility checklist (WCAG 2.2 AA) — the target; current gaps are in §8
Keyboard-only path for every action; visible `:focus-visible`; skip link present; every icon-only control has an accessible name; every input has a label; focus managed for dialogs/drawers (trap, Esc, return focus); contrast ≥ **4.5:1** body text (3:1 large text and UI); touch targets ≥ **24px minimum, 44px design target**; status announced (`role="status"` / `aria-live`); `prefers-reduced-motion` respected; no meaning by colour alone; no text baked into images.

## 7. Copy and terminology
Use the campaign's configured wording (`applyDesignationLabel`, e.g. "Promoter" may be "Beauty Advisor"); never hard-code it in a new string. Buttons are verbs naming what happens ("Save", "Refresh", "Remove 'Nawala'"). Errors say what went wrong and what to do. Plain words for clients (avoid internal terms like "activation" or "SKU" in sponsor-facing text unless configured). **No concatenated sentences, no text in images, survive +40% width** (Sinhala/Tamil readiness, charter §4.2). No new `LKR` / `Asia/Colombo` / `+94` literals (charter G5).

## 8. Known deviations (don't treat as precedent)
Found by `scripts/agent/shoot.mjs` on 2026-10-25, tracked as bugs: dashboard overflows at 375px (#124); white-on-orange primary buttons ≈2.6:1 contrast (#125); unlabeled selects/inputs and targets under 24px (#126). Found by code review of this guide: `Drawer` has no dialog semantics, Escape or focus management and `Modal` lacks Escape/focus; `EmptyState`, `ErrorState` and toasts are not announced to screen readers (bug #129). Buttons are ≈36–40px tall — above the 24px minimum but below the 44px target. Raw colour and `font-size` literals are widespread in `app.css` until #118. No screenshot baseline exists yet.

## 9. How the UX/UI Architect verifies
`node scripts/agent/fresh-stack.mjs up` → `node scripts/agent/shoot.mjs --routes <a,b> --widths 375,768,1280 [--campaign "<name>"]` (JPEGs + accessibility/layout findings) → open one or two images for the changed screens → `fresh-stack down`. Judge against §1–§7; cite a screenshot, a measured value or a principle for every finding. On Windows Git Bash pass routes without a leading slash.
