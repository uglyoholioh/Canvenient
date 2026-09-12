# Design — Canvenient

A locked visual system for Canvenient's workspace. It keeps the app calm,
dense, and native-feeling while leaving course colours and status states clear.

## Genre

Modern-minimal native workbench.

## App structure

- Workspace: a continuous charcoal canvas with a 48px icon rail and a quiet
  40px toolbar.
- Dashboard: a day anchor sits above a 70/30 workbench; Tasks is the dominant
  working surface while Schedule, Canvas, and Notes are contextual support.
- Navigation: compact rail by default; text labels remain available on hover
  or when the user pins the sidebar open.
- Content: grouped rows and hairline dividers take priority over isolated cards.
- Elevated moments: command palette, drawers, and focused task views may use a
  modest rounded sheet and restrained shadow.

## Theme

- Default paper: Graphite, `#101113`.
- Surfaces: close-value charcoal steps; borders are white at 7–12% opacity.
- Accent: neutral grey for general selection. Colour is reserved for course
  identity, success, warnings, and errors.
- Other themes are quiet tints of the same material system, not independent
  visual brands.

## Typography

- Body and display: native macOS system sans (SF Pro). No monospace in
  interface copy; monospace survives only where text IS data (the terminal).
- Shared scale, defined in `tokens.css` and applied app-wide:
  display 28px/700 (hero dates, empty states), title 15px/700, body 13px,
  secondary 12px, caption 11px. 11px is the absolute floor — nothing smaller.
- Section labels: 11px/600, muted, uppercase with 0.06-0.08em tracking
  (the macOS System Settings pattern) — used sparingly, never as decoration.
- Timestamps use tabular numerals.
- Information hierarchy comes from contrast and spacing, not font novelty.

## Spacing and shape

- Compact 4px rhythm; common gaps are 4, 8, 12, and 16px.
- Normal controls use 6px radii. Only sheets and palettes reach 10–12px.
- Use hairline rules before raised containers. Shadows are reserved for overlays.

## Motion

- Fast, quiet fade and 6–10px translate for overlays.
- No colour glows, bouncy hover effects, or persistent card lift.
- Respect reduced-motion preferences.

## What to avoid

- A dashboard made from equally prominent boxed cards. The Focus layout is
  deliberately chrome-less: content sits on the window material, structured
  by whitespace, hairlines, and the type scale — this was re-affirmed in the
  September 2026 unification after a carded experiment was rejected.
- Saturated accent colour as general decoration.
- Thick borders, multiple nested panels, or over-rounded containers.
