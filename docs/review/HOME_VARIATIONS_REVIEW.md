# Home dashboard — variations review (Sep 19, 2026)

Everything below lives behind **Settings → Dashboard** and applies live — no
reload needed. Defaults are the recommended set; nothing here is a mockup, all
of it runs on the real feed. Review on the branch dev server (vite 5183);
nothing is installed (consolidation order still stands).

## What changed since the last round

1. **The brief never loads empty again.** The last good brief is cached and
   rendered instantly on every tab switch; a background refresh happens only
   after 5 minutes, and a failed refresh keeps the old words on screen. The
   refresh button still forces a re-ask.
2. **The brief is narrow** and sits beside **today's classes as a vertical
   timeline** — time range, code · type, and venue stated on every row, the
   next class expanded with its approach meter and journey line, the live gap
   caption ("17m") hung on the rule, and tomorrow's first commitment at the
   foot. The horizontal colour-bar rail is retired to an option, not deleted.
3. **Today is renamed Home** (sidebar, title bar, docs).
4. **Schedule no longer stretches** to fill the window — fixed 96px rows —
   and the **exams (dates + times) sit below the grid**.
5. Dashboard customisation, the bus variations, the horizon views, and the
   layout variants — all below.

## Bus card — five variants (Settings → Dashboard → Bus card)

| Variant | What it is | When it wins |
| --- | --- | --- |
| **Board** (default) | Stop name + ISB stamp, services in route-tone chips, next two arrivals each | The honest little terminal — reads as part of the dashboard family |
| **Hero** | One departure, large: tone chip, numeral, "then 15 min" | When the only question is "do I run now" |
| **Ribbon** | The hour as a scale with tone ticks, now/30/60 marks | The glance shape of the hour |
| **Chips** | One tone-tinted chip per service, next arrival each | Compact but colourful |
| **Line** | The whole hour as one mono line | Minimal footprint |

Note: the feed looked empty overnight in testing (real nusbus behaviour at
3am); with daytime data every variant populates. Stale feed = the card dims,
never errors.

## The horizon (was "Fortnight") — now unlabelled and switchable

The section caption is **empty by default** — Settings → Horizon → caption
takes any word you prefer ("Horizon", "Dues", anything up to 24 characters).
Three voices: **Columns** (ink bars, cap 4 + overflow), **Strip** (a weather
ribbon, fill rising with load), **List** (a quiet grouped agenda). Range:
7 or 14 days.

## Layout variants (Settings → Arrangement)

- **Ledger** (default) — dues + horizon left, campus right; stacks below 880px.
- **Columns** — three across on wide windows (dues | horizon | campus), so the
  right side of a 1700px window stops being dead space; folds to a stack under
  1150px.
- **Focus** — one quiet column, max 760px.

## Other customisation

Clock (24h/12h, seconds), Type (Rounded / Standard / Serif — applies to the
clock and date), The day (Timeline / Rail / Hidden), Sections (Brief, Dues,
Exams on/off). The exams widget lists the next exams from the timetable.

## Deliberately not done

- No countdowns on class items (your standing rule); bus ETAs stay
  minute-granular rather than ticking per second.
- The grades drip stays dead — Canvas grades carry no recency timestamps.
- The AI brief's text itself is a backend product; when its day facts look
  wrong (it described an empty Saturday as busy), that's the assistant
  service, not the dashboard.
