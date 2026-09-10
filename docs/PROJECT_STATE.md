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

## 2026-09-09 — Codebase audit fixes: SQLite SQL, local API security, repo hygiene

- **Scope:** Full audit findings fixed in order: safepoint commits of the Groups/wheel/attendance/PDF-viewer feature batch; dialect-safe SQL; security hardening; artifact untracking; docs reconciliation.
- **SQLite SQL fix:** ~60 `NOW()`/`INTERVAL`/`::`/`date_trunc`/`split_part` sites ran Postgres-only SQL on the shipped SQLite sidecar, silently breaking `/ai/brief`, `/tasks/sync-canvas`, `/canvas/sync-files`, study-session summary/leaderboard, and Telegram commands. New `backend/sql_dialect.py` provides per-dialect expressions; regression tests live in `backend/tests/test_sqlite_dialect.py`.
- **Security posture (deliberate decisions):** JWT tokens are signed with a random per-install key persisted as `jwt_secret` beside the SQLite DB (set `JWT_SECRET` to override) — the previous in-source fallback let any local process forge tokens. CORS is restricted to `tauri://localhost` and the Vite dev origin (`CANVENIENT_ALLOWED_ORIGINS` overrides). The Telegram webhook rejects updates unless `TELEGRAM_WEBHOOK_SECRET` matches (`TELEGRAM_WEBHOOK_INSECURE=1` opts out for local testing). The raw Canvas token is never returned by auth endpoints; the API exposes `canvas_connected` and a masked hint, and profile updates preserve the stored token when `canvas_token` is omitted (empty string disconnects). Canvas syllabus/announcement HTML is sanitized with DOMPurify and the Tauri window now ships a real CSP (was `null`).
- **Consequences:** existing login sessions and the stored dev secret are invalidated by the JWT change — users log in once more after updating. `backend/canvenient.db`, PyInstaller output, sidecar binaries, and `.DS_Store` files are no longer tracked; a fresh clone must run `npm run desktop:rebuild` once before first launch.
- **Verification:** backend pytest 88 passed / 1 skipped (dead `canvas_search` test skipped pending feature decision), frontend vitest 155 passed / 2 skipped, Vite production build, packaged macOS rebuild, installed-app inspection, and local `/health`.
- **Known follow-ups (not yet done):** frontend ESLint has ~217 errors across 59 files and is not enforced in CI; `GroupsView` and `wheel/` bypass the graphite design tokens (hardcoded hex colours, undefined `--color-mac-accent`); `communities/folders/forms/notes/study_sessions` backend routes have no dedicated tests; git history still contains old binary blobs (~474MB) until a squash/filter-repo is chosen; the stray root `canvenient.db` (Sep 7) needs a data decision before deletion.

## 2026-09-10 — Audit follow-ups: lint enforced, route tests, small correctness fixes

- **ESLint is now a gate:** `npm run lint` runs in CI on every branch push and fails on errors (0 errors at adoption; ~63 warnings remain, all React Compiler-era `react-hooks/*` rules flagging deliberate patterns — tracked debt to re-harden site by site). ESLint config now ignores `dist/`, `src-tauri/` codegen assets, vendored `public/pdfjs` wasm, and the archived `src/legacy/`. `vite.config.js` forces the automatic JSX runtime, so neither components nor test files need `import React` in scope.
- **Dead code removed:** TaskView's unused `DueDateEditor`/`saveEdit`/`parseDueParts`, CanvasModule `attentionItems`, CampusBusModule `formatTimeAgo`, WheelModule unused state, ~100 unused imports, stale eslint-disable directives, `global` → `globalThis` in tests.
- **Route tests added:** notes/folders CRUD + cross-user isolation, communities creator-only update/delete, group-form lifecycle (admin-only creation, member response, duplicate rejection, admin-only responses/stats) — backend suite now 98 passed / 1 skipped.
- **Small fixes:** Gemini API key moved to the `x-goog-api-key` header (was a URL query param); pydantic v2 `ConfigDict` replaces deprecated class-based `Config` (event, group models); AiBriefModule timeframe select now uses real `--border`/`--bg` tokens (was undefined `--border-color`/`--bg-color`); Canvas file/folder query params are URL-encoded; invite-copy and wheel timers clear on unmount/re-trigger.
- **Stray root `canvenient.db` inspected (read-only):** completely empty schema (0 rows in all checked tables) — an artifact of running the server from the repo root. Safe to delete; awaiting user approval. Real dev data lives in `backend/canvenient.db`; the packaged app uses Application Support.
- **Verification:** backend pytest 98/98 (plus 1 skipped), frontend vitest 157 passed / 2 skipped, ESLint 0 errors, Vite production build, packaged desktop rebuild, `/health` OK, installed-app inspection.
- **Still open:** git history slimming (~474 MB; needs squash/filter-repo + force-push approval), GroupsView/wheel graphite-token redesign, the empty root `canvenient.db` deletion, stale `/Applications/.canvenient-install.d8tMvB` staging dir from Sep 4.

