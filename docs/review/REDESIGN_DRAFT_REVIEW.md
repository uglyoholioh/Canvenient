# The Instrument — redesign draft review

**Branch** `glm/instrument-draft` · **Variant app** `/Applications/Canvenient-instrument.app`
**Date** Sep 18, 2026 (v4) · **Status** draft for review — main app and main branch untouched

## Design direction history (all on this branch)

- **v1** Graphite Apple-quiet shell — superseded.
- **v2** Apple-craft accent pass — rejected ("too simple").
- **v3** Swiss typography minimal (ink/paper + red) — rejected as "too editorial".
- **v4 (current)** Fluid typographic pastels, per Oli: "typographic but fluid, softer washed colours, fluid animations, rounded fonts".

## v4 — Fog & Dusk

- **Materials:** *Fog* — warm pastel paper `#f5f2ec`, white floating cards, soft shadows. *Dusk* — soft charcoal `#26252b`, warm off-white ink. Fog is the default; System follows macOS.
- **Type:** SF Pro Rounded (`-apple-system-rounded`) carries every moment that matters — the live clock, countdowns, big times; SF Pro Text for body; SF Mono for tabular data; uppercase tracked micro-labels as section voices.
- **Colour:** washed pastels — warm ink `#45403a`, coral `#d98a70` for live facts (now-dot, day rule, active nav, checked boxes), sage for availability. Module colours survive only as 3px data ticks and soft block tints.
- **Motion:** springy easings (`cubic-bezier(0.22,1,0.36,1)` / gentle overshoot), pill hovers that lift, meters that fill with a long ease, tick-in animation on changing values, view transitions that rise and settle.
- **Glass:** earned, not everywhere — sidebar and all overlays (command bar, sheets, menus) are milky translucent blur; content scrolls beneath the sidebar.
- **Prime directive unchanged:** inform, never instruct. All copy declarative; AI prose only in the ⌘J pane.

## What the app does (unchanged through all four visual generations)

Six primary views — **Today, Tasks, Schedule** (horizontal time axis: days as
rows, hours left→right, red now-line), **Campus** (pages: **Bus** = hero
next-departure + toned board + filterable stop picker + route step-cards,
**Venues** = draggable time rail + availability strips + saved chips),
**Modules**, **Notes** — plus utilities (Decide, Groups) and Settings. ⌘K
command layer with capture/appearance/import actions; ⌘/ cheat sheet; one mono
fact per view in the title bar; the leave-by journey join on Today's Next card;
tray jewel unchanged.

## Verification

- 236 vitest tests green (228 pre-existing + 8 journey), vite build green, prettier clean.
- Every surface exercised against the hosted backend (test@mail.com) in Fog and Dusk — browser and native.
- Native variant app installed and driven via AX/menu automation; window-scoped captures reviewed.

## Known limitations

- Native menu-bar labels (Rust) still use old view names (Venue Finder → Campus).
- Journey facts need the nusbus relay; it 502s intermittently overnight.
- Assistant pane, capture composer, drawers, PDF viewer ride pinned legacy vars (coherent, not rebuilt).
- Onboarding wizard files remain in the tree (unused by this shell).
