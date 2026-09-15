# Menu bar companion, Onigiri-style focus timer, and focus session system

Date: 2026-09-16
Status: awaiting review
Related request: "3 is good, i also want a onigiri style study timer, add features you
deem fit, but i want it exactly like onigiri as a base" + "add 6. but we must
deliberately plan the system again, i dont want to be attached to the old
implementation".

## Goal

Canvenient lives in the macOS menu bar: a glanceable panel (next class, next bus,
top deadlines) that also hosts a faithful Onigiri-style focus timer. Completed
timer runs quietly become real study-time data through a new focus session
system, deliberately designed fresh rather than contorted around the existing
`study_sessions` model.

## Non-goals (this round)

- iOS tray/timer parity (backend session API is shared, iOS logs later).
- Auto pomodoro cycles — Onigiri has none; starts stay manual.
- Stats dashboards beyond one plain-text footer line.
- Global quick-capture hotkey (deferred pack item).

## Onigiri base — faithful reproduction

Reference: Onigiri – Pomodoro & Timer (Studio 1J). Face rules:

1. **Menu bar item** shows the Canvenient mark normally; while a timer runs the
   item title becomes a live `mm:ss` countdown (template image, monochrome,
   readable in light/dark menu bars; increased-contrast option).
2. **Click opens the panel** — one shared panel for companion content and timer.
3. **Set the time three ways**: a slider (5–120 min), typing a number of
   minutes, or one-click presets that start immediately (defaults 15 / 25 / 45 /
   90; editable in Settings).
4. **During a run**: large remaining time, Pause/Resume, Cancel. Nothing else.
5. **Floating display**: optional small always-on-top chip showing remaining
   time, draggable, toggled from the panel and Settings. Solid background —
   house rule: no translucency.
6. **On completion**: the panel opens itself and the alarm keeps sounding until
   dismissed by interaction. Sounds: Silent / Bell / Digital / Chime / Kalimba
   (bundled short samples), default Bell. "Open panel on finish" is a toggle.
7. Pure timer — no forced breaks, no accounts, no stats screens in the face.

## Canvenient layer (behind the face)

- **Focus target (optional, one line)**: "Focus on:" picker above the start
  control, preseeded with the last-used target; options are Nothing (default —
  zero-press unattached focus), up to six today tasks, and modules.
- **Logging**: a run that completes, or is cancelled after ≥1 minute, POSTs one
  completed focus session (planned minutes, actual seconds, target). Offline,
  the session queues in localStorage and flushes on next launch or Sync.
- **Gentle break nudge**: after completion the panel footer shows "Take 5?" —
  one click starts a 5-minute timer flagged as a break. Never auto-starts;
  breaks are not logged as focus.
- **Footer line**: `Today 1h 40m · Week 6h 12m` plain text; clicking it opens
  the Dashboard.
- **Wheel link**: the existing spin-wheel study_modules preset ("offer link to
  tasks / study timer" comment in SpinWheelView.jsx) deep-links by starting the
  tray timer preloaded with the picked module.

## Panel layout (top → bottom)

1. **Next**: next class today (code, time, venue) or "No more classes"; below
   it the next ISB departure for the configured home route (existing
   campus_bus data).
2. **Deadlines**: next three tasks by due date (title + relative due).
3. **Focus timer** (Onigiri face above).
4. **Footer**: today/week focus totals · Open Canvenient · Sync.

Tray right-click menu: Open Canvenient / Start focus (25) / Sync / Quit.

## Implementation

- **Tauri 1.8.1.** Add the `system-tray` feature to the `tauri` dependency
  (currently absent from `Cargo.toml`). `global-shortcut`, `window-all`,
  `notification-all` are already enabled.
- **Rust** (`src-tauri`): build the tray with `SystemTray` + right-click menu;
  left-click toggles the panel window. New commands: `set_tray_title(text)`
  (drives the live countdown), `open_panel`, and a command to start the timer
  with preset/ target arguments for deep links. The panel is a borderless,
  always-on-top, skip-taskbar window loading a new `#/tray` route in the
  existing frontend; hides on blur. The floating chip is a second small window
  using the already-enabled `startDragging`.
- **Frontend**: `TrayPanel.jsx` (route `#/tray`) renders the panel from existing
  SWR data sources (day context, campus bus, tasks) so it reads the same cache
  as the app; a `useFocusTimer` hook owns running state (start/pause/cancel,
  drift-corrected via wall-clock timestamps, not interval ticks).
- **Alarm**: the panel opens on finish (Onigiri behavior), so samples play via
  HTMLAudio in the panel; a native notification (already enabled) fires as
  backup.
- **Styling**: monochrome, type-ladder tokens, no cards, no translucency —
  same rules as the main shell.

## Focus session system (fresh design)

Deliberate break from the old model: the old `study_sessions` keeps a
server-side *active* row (unique one per user), which couples the server to
running state and breaks offline. The new system stores only **completed**
sessions; running state lives entirely in the client.

**Table `focus_sessions`**

```
id BIGSERIAL PK
user_id BIGINT NOT NULL FK users ON DELETE CASCADE
started_at TIMESTAMPTZ NOT NULL
ended_at TIMESTAMPTZ NOT NULL
planned_minutes INT NOT NULL CHECK (BETWEEN 1 AND 480)
actual_seconds INT NOT NULL CHECK (>= 0)
source TEXT NOT NULL CHECK (source IN ('mac_tray','ios','manual','legacy','break'))
client_id UUID NULL — client-generated; unique index for offline replay dedupe
module_id BIGINT NULL FK academic_modules ON DELETE SET NULL
task_id BIGINT NULL FK tasks ON DELETE SET NULL
is_break BOOLEAN NOT NULL DEFAULT FALSE
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes: `(user_id, ended_at DESC)`. No uniqueness constraint — clients queue
offline, so idempotency is handled by a client-generated `client_id UUID` unique
index (safe replay on flush).

**API** (all user-scoped, in a new `backend/routes/focus.py`)

- `POST /focus/sessions` — create a completed session; accepts `client_id`;
  replays return the existing row (200, not 201).
- `GET /focus/summary?range=today|week` — totals (seconds, sessions).
- `GET /focus/sessions?limit=20` — recent sessions.
- `DELETE /focus/sessions/{id}` — mistake correction.

**Migration**: a one-shot insert copies `study_sessions` rows (completed only)
into `focus_sessions` with `source='legacy'`; the old tables and routes stay
untouched for now. Dashboard and Settings leaderboard re-point to
`/focus/summary` in the same change, so nothing reads two systems. Old rows'
titles are dropped (totals and leaderboards never showed per-session titles).

## Error handling

- Timer state survives app restarts: on launch, a running session is restored
  from persisted state if `started_at + planned` is still in the future,
  otherwise it is logged as completed-at-wallclock and cleared.
- Session POST failures queue locally (max 50) and retry on Sync/launch.
- Bus/deadline rows in the panel degrade to their last SWR cache with a muted
  "cached" marker (shares the offline story of hardening item 10).

## Testing

- Backend pytest: focus endpoints (create/replay/summary/delete), migration
  copy completeness, user scoping.
- Vitest: `useFocusTimer` with fake timers (`vi.useFakeTimers` incl. Date),
  TrayPanel render from mocked SWR, offline queue flush, restore-on-restart.
- Rust: compile gate covers tray construction; manual native-app verification
  per house rules (tray click, countdown title, alarm interaction-to-stop).
