# The Instrument — redesign draft review

**Branch** `glm/instrument-draft` · **Variant app** `/Applications/Canvenient-instrument.app`
**Date** Sep 18, 2026 · **Status** draft for review — main app and main branch untouched

## What this is

A complete ground-up redesign draft of the Mac app, built from two skills
(`macos-design` for native structure, `uncodixfy` for anti-slop discipline) and
one prime directive from Oli:

> **The app informs the user. It never instructs the user.**

Every rendered string states what *is* — times, counts, thresholds, states.
No nudges, no "you should", no triage pressure, no celebration copy. The AI
brief renders structured facts only; AI prose lives in the ⌘J pane, on request.

## The one idea

Canvenient stops being eight products in one window and becomes **one
instrument**: a glance states where you are in the semester, what's next, and
when the threshold moments are. The title bar carries one mono fact
(`ST2334 08:00 · LT27`), the sidebar carries six views, and the ⌘K command
layer carries everything else.

## Information architecture

| Was | Now |
| --- | --- |
| Dashboard | **Today** — editorial brief with the leave-by join |
| Venue Finder + ISB buses + trip planner | **Campus** — one surface |
| Spin the Wheel (4 decider modes) | **Decide** — one wheel, all options live |
| Dashboard/Tasks/Schedule/Modules/Notes/Groups | kept, restructured |
| 6 themes | **2 materials**: Graphite (dark, default) + Paper (light) + System |

View ids in `localStorage` and the native ⌘1–8 menu mapping are unchanged
(the native View menu still says "Venue Finder" — Rust untouched; it lands on
Campus).

## The signature feature: the journey join

The Next card joins the next class with the bus network: nearest stop to the
venue, live ISB ETAs, walk minutes, and a stated origin (previous class venue,
else the pinned bus stop). Every element is a fact — `D2 from Opp TCOMS · bus
at 07:16 · arrives 07:24 · then 1 min walk · est` — and the reader decides.
When the nusbus relay is down (it flakes, especially at night) the card
degrades silently to plain class facts.

## New interaction layer

- **⌘K CommandBar** — views, notes, tasks, Canvas corpus, capture, appearance,
  import, assistant escalation. The three duplicate search surfaces are gone.
- **⌘/** — full keyboard cheat sheet.
- **Orientation sheet** — one quiet screen, once per account: ⌘K, ⌘N, ⌘J
  (replaces the 903-line onboarding wizard; name capture kept).
- **Title-bar fact** — per-view: Today shows the next class, Schedule the week,
  Campus the free-room count, Tasks the open count, Modules the inbox count.

## Surface notes

- **Today** — date + NUS week/phase countdown, NOW line, Next with journey,
  Overdue/Due today/This week as plain fact sections with the `[ ]` checkbox,
  classes list with ink ticks, departures board, announcements. No greeting
  copy, no "0 pending".
- **Schedule** — Registrar grid (print-timetable), semester phase strip with a
  position marker, weekend collapsed unless it has items, ←/→/T keys, class
  context drawer kept, selection brightens (never darkens), Import sheet
  (NUSMods URL / .ics; ⌘O and drag-drop still land here).
- **Campus** — room search + day/time scrubber + green availability bars +
  mono room codes + save pins; departures board (pin persists to
  `canvenient-isb-stop`); A→B trip planner with place autocomplete.
- **Modules** — Semester three columns: module rail (ink ticks + upcoming
  counts) · pane with Assignments/Files/Overview segmented control ·
  announcement inbox with j/k/d available but never demanded. Canvas-gated
  dead-end fixed: the empty state routes to Settings → Connections.
- **Tasks** — dense table, overdue as red facts at top, docked composer
  (task + note modes), no triage modal.
- **Notes** — calm list + the existing tiptap editor; graph demoted out.
- **Settings** — four panes (Appearance / Connections / Backups / Account);
  theme gallery is two materials + system.
- **Tray** — the shipped Onigiri jewel untouched except theme mapping.
- **Study leaderboard** — out of the draft (gamified pressure).
- **Groups** — demoted to Utilities, still fully functional.

## Design system

`src/design/system.css` + `src/instrument/instrument.css`: oklch-quiet
graphite scale, SF type ladder 26/15/13/12/11 (11px floor), `ui-monospace`
tabular numerals for **all** data (times, counts, ETAs), 3px module ink ticks,
hairlines carry structure (no card kits), radii 6/10, motion 120–160ms
ease-out, solid materials (no translucency), reduced-motion respected.
Legacy CSS vars are pinned to the instrument palette so unmigrated surfaces
(tray, assistant pane, capture composer, drawers, PDF viewer) render inside
the same material.

## Functionality changes

**Added:** journey join (client-side; no backend change), command layer,
cheat sheet, phase strip. **Pruned:** duplicate search surfaces, wheel decider
modes, 4 theme tints, dead `CommandPalette` usage, "coming soon" scaffolding,
leaderboard surface. **Untouched:** backend, DB, auth model, integrations,
reminders, backups, all user data.

## Verification

- 236 vitest tests green (228 existing + 8 new journey tests), vite build
  green, prettier clean.
- Every surface exercised in the browser against the hosted backend
  (test@mail.com) in both materials, incl. ⌘K, capture panel, assistant.
- Native build installed as variant app (below) and driven in the real shell.

## Known limitations

- Native menu-bar labels (Rust) still use old view names for Campus/Decide.
- Journey facts need the nusbus relay; it 502s intermittently (known).
- Onboarding wizard files remain in the tree (unused by this shell).
- Assistant pane, capture composer, drawers and PDF viewer are restyled via
  pinned legacy vars, not rebuilt — a second pass could rebuild them native.
