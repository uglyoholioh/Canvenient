# Project State and Safepoints

This is a concise, append-only record of verified project states and durable
operational decisions. Add an entry whenever the user accepts a substantial
state, a recovery succeeds, or a build/release workflow changes.

## 2026-09-04 — Restored dashboard safepoint

- **Commit:** `4fbca5e` (`chore: checkpoint restored workspace state`)
- **Accepted state:** three-column dashboard with Tasks on the left, Schedule
  above NUS ISB in the centre, Canvas on the right, and a hover-only sidebar.
- **Verification:** frontend production build, packaged macOS rebuild,
  installed-app visual inspection, and a successful local `/health` response.
- **Recovery note:** the visual state was recovered from local Antigravity
  history after a later wide-task-panel layout had overwritten the dashboard
  CSS. Treat a supplied visual reference as stronger evidence than a later
  implementation.
- **Do not overwrite casually:** `frontend/src/index.css`,
  `frontend/src/components/Dashboard.jsx`, and
  `frontend/src/components/WorkspaceLayout.jsx` define this accepted layout.

## 2026-09-06 — Restored timeline schedule on dashboard

- **Commit:** `cb9c48d` (`feat(dashboard): restore ScheduleModule with timeline and view controls`)
- **Accepted state:** Restored `ScheduleModule` with the time-scaled vertical timeline, current-time indicator line, and day/view navigation controls (`< Today >`). Removed the temporary compact schedule list widget (`ScheduleCompactModule`).
- **Verification:** Frontend test suite (115/115 passing), Vite production build, packaged macOS desktop rebuild, and local backend `/health` response.

## 2026-09-09 — Restored NUS ISB and removed Notes from dashboard

- **Accepted state:** Three-column focus dashboard restored to checkpoint `4fbca5e` structure: Tasks spanning left column (2 rows), Schedule timeline above NUS ISB in centre column, and Canvas spanning right column (2 rows). Notes module removed from default dashboard grid (hidden by default, accessible via Customize).
- **Verification:** 140/140 unit and integration tests passing (`npm test`), Vite production build, packaged macOS desktop rebuild (`npm run desktop:rebuild`), installed-app launch, and local `/health` check.
- **Key files:** `frontend/src/index.css`, `frontend/src/components/dashboard/dashboardConfig.js`, `frontend/src/components/Dashboard.jsx`.

