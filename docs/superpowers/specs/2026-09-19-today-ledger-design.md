# Today — the Ledger (dashboard redesign)

Approved direction (Oli, Sep 19): keep the information architecture he restored
(brief → day → dues → departures → inbox), redraw it in the v4 grammar, and
cut it down to what a high-level user cannot already infer.

**Design law (Oli's words, governing every micro-decision):** don't overload;
let the user surface information themselves; only show what is genuinely
useful, or show it subtly through visual cues, elements, and animations. Treat
the user as high-level — never spell out what they can infer ("recess in 21
days" is gone). Shape first, numbers only when live and needed, details on
demand, facts appear when they become relevant. Extends the existing prime
directive: the app informs, never instructs; never restate what another
surface already shows better.

## Layout

`TodayView.jsx` is rewritten in place (the shell already insets content via
`ins-main` marginLeft, so no shell change). `.ins-today` drops its 760px cap.
A `useContainerWidth` ResizeObserver drives the two-zone fold:

```
head      clock (46px, live) + date | semester runway hairline
brief     My Day band (unchanged)
rail      THE DAY — full-width day shape  [+ featured card on selection]
body      wide ≥880px: [dues + fortnight] | [departures + inbox]
          narrow: stacked in that order
```

## Head

Clock and date exactly as shipped. The week/phase text line is **removed**.
Semester context becomes a **runway hairline** (~280px, right-aligned on wide):
one 2px track spanning orientation week → next orientation, segments tinted
only where they differ from teaching (recess sage-wash, reading sky-wash,
exams amber-wash, vacation hairline only), a coral now-dot at today's
fraction. Phase names surface on hover only. Computed by walking
`getAcademicWeek` day-by-day across the current semester (memoized per day);
no text label is rendered by default. The toolbar keeps the existing live
now/next mono fact.

## Day rail

One horizontal strip of today (`scheduleItemsForDate`): classes as washed
blocks (module color, `color-mix` 16% over bg + 2px left tick — the Schedule
block formula), Canvas events outlined, exams amber-washed, past blocks at
35% opacity. Scale pads ±45 min around first/last item, clamped 07:00–24:00;
hour hairlines with sparse 3-hourly labels.

- Open gaps ≥25 min are visible as the rail's own background; a duration
  caption ("1h 20m") exists only on hover — except **one** live mono caption
  pinned at the now-dot while it sits in a gap ("how long do I have right
  now"). No caption while in class (toolbar fact carries it).
- Hover any block → tooltip (mono time range · code · type · venue).
- Click → featured card under the rail (now/next selected by default): time
  range, code · type · class no, name, venue, approach meter over the final
  8 h, journey line only for the upcoming class (existing `journey.js`).
- Empty today: the rail is replaced by one quiet mono line — "Clear day ·
  next tomorrow 10:00 · CS2101" (tomorrow's first commitment from
  `scheduleItemsForDate(schedule, +1)`).
- On a populated day, after the last item ends, a faint tick appears at the
  rail's tail naming tomorrow's first commitment on hover. Evening fact,
  absent all day.

No countdowns anywhere; no elapsed-day wash (both previously rejected as
time-restating).

## Dues (body left)

Rows only for what is actionable now: **Overdue** (coral, max 5 + "All N in
Tasks") and **Due today** (max 6). The "This week / Later" buckets are
**removed** — the fortnight carries them. Rows keep the existing grammar
(`ins-check` circle, module tick, title, mono code, mono relative due).

## Fortnight strip (under dues)

Rolling 14 days from today: one column per day; ink bars encode the number of
due items (1 bar each, cap 4 + mono "+N"); today outlined in coral; an
overdue cap-column leads when overdue exist. Canvas exams in-window mark
their column with an amber dot. Phase days (recess/reading/exam) tint their
columns faintly — no tags. Hover a column → tooltip listing that day's items
(max 4 + "…"); click → toggles an inline expansion listing the day's rows
(informational; click-through to Tasks/Modules). Sources: tasks (effective
due) + canvas assignments, deduped by `source_type === "canvas" &&
String(source_id) === String(assignment.id)`. Pure count, no weights — no
fabricated urgency.

## Departures (body right)

Pinned stop (existing selection logic). A 60-minute ribbon from now: each
arrival a tick at its ETA in its `serviceTone`, the imminent (<3 min) tick
breathes. One mono caption for the imminent departure ("A1 · 3 min"). Stop
name small mono; click → Campus (Bus). Feed stale/failing: the ribbon dims
and keeps last-known; never an error banner.

## Inbox (body right, under departures)

One mono line, only when there is news: "3 new · CS2103 ×2 · CS2211 ×1" from
`brief.new_announcements`, click → Modules (Inbox). No titles — Modules holds
the titles.

## Non-goals

Grades drip (payload has no recency timestamps — can't be honest). No changes
to Schedule/Campus/Decide/Tasks/Tray/Modules. No install: the variant app is
not rebuilt until Oli calls the consolidation; verification is vitest + vite
build + dev server with real data.

## Testing

`instrument/ledger.js` — pure helpers, no React/localStorage:
`dayWindows` (rail scale, gaps, current gap, clamping), `tomorrowFirst`,
`fortnightBuckets` (dedupe, overdue cap, bar caps, exam marks),
`ribbonTicks` (horizon, position, imminent), `semesterRunway` (phase
segments from `getAcademicWeek`). Vitest in
`frontend/src/__tests__/ledger.test.js` with frozen dates around the real
AY26/27 calendar (Sem 1 starts 2026-08-10; recess = week of 2026-09-28).
