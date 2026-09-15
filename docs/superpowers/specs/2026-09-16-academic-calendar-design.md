# Academic calendar awareness

Date: 2026-09-16
Status: awaiting review
Related request: round-1 pick #6 ("Academic calendar awareness"), with NUSMods
exam slots folded in.

## Goal

The app should know where the semester is. Today it half-does: lesson
generation already respects recess week and public holidays, and exams import
from NUSMods — but nothing *knows* "it's recess", "reading week", or "exams in
5 days", and the semester dates are code, not data.

## What already exists (verified)

- `backend/routes/schedules.py`: `SEMESTER_STARTS` (hardcoded known dates with
  a Monday-on-or-after heuristic fallback), `NUS_HOLIDAYS`,
  `_academic_week_number` (recess sits after week 6; weeks ≤ 6 map one-to-one,
  weeks ≥ 7 shift one calendar week), `_lesson_dates` (skips holidays, expands
  NUSMods `weeks`).
- NUSMods import already stores per-lesson `weeks` JSON and imports exam
  blocks (`exams` → `exams` table), surfaced in Schedule and the day context.

So this feature is a **knowledge layer + surfacing**, not new ingestion.

## Design

### 1. Calendar as data

Move `SEMESTER_STARTS`, `NUS_HOLIDAYS`, and the phase constants out of
`schedules.py` into `backend/data/academic_calendar.json`:

```json
{
  "recess_after_week": 6,
  "reading_week": 14,
  "exam_weeks": [15, 16],
  "semester_starts": { "2025/2026": { "1": "2025-08-11", "2": "2026-01-12" } },
  "holidays": ["2025-12-25", "..."]
}
```

Updating for a new academic year becomes a data edit. The heuristic fallback
stays for unknown years. `schedules.py` imports from the new module; no
behavior change to lesson generation.

### 2. Pure calendar module

New `backend/academic_calendar.py`:

- `semester_for(date) -> (academic_year, semester, start_date) | None`
- `week_number(date, semester_start)` (recess-aware, moved from schedules.py)
- `phase_for(date) -> { phase: teaching | recess | reading | exam | break,
  label, week, semester, next_change: {date, phase} }`

`teaching` = weeks 1–6 and 7–13; `recess` = the gap week; `reading` = week 14;
`exam` = exam weeks, refined by the user's actual exam rows when asked.
Between semesters (after exam weeks, before next start) = `break`.

### 3. Endpoint

`GET /calendar/term` — authenticated; returns today's `phase_for` plus, during
reading/exam phases, the user's upcoming exams from the `exams` table (code,
start, venue if present). Small, cacheable (client SWR, TTL minutes).

### 4. Surfacing — subtle, per house taste

- **Today header**: one text chip next to the date — `Recess week`,
  `Reading week`, `Week 9`, or during exams `Exams: 2 in 5 days` (computed from
  the user's exam rows). Text only; no countdown hero (explicitly rejected in
  an earlier round).
- **Schedule**: compact banner when phase ≠ teaching ("Recess — no classes";
  "Reading week — no classes"; "Exam period").
- **Exams on Today**: during reading/exam phases the day context already
  returns exam rows; the Today exam row is sorted first in those phases. No
  new surface.

Deferred (Telegram/AI excluded this round): the planned phase line in the
Telegram brief greeting moves to the parked announcements/Telegram round
(see 2026-09-16-announcements-digest-design.md).

## Error handling

- Unknown academic year → heuristic semester start; phase still computed.
- Date before first known semester / after last → `phase: break`, surfaces
  render nothing.
- `GET /calendar/term` never fails hard: falls back to `{ phase: "teaching" }`
  with `stale: true` rather than erroring the Today header.

## Testing

- Pure-function tests on boundaries: the Monday recess starts/ends, week 13 →
  reading → exam transitions, holiday collisions, unknown-year fallback.
- Endpoint test with a seeded exam row (exam countdown variant).
- Frontend: chip text matrix per phase; banner on Schedule compact.
- Update `SEMESTER_STARTS` consumers; run existing NUSMods import tests to
  prove lesson generation is unchanged.
