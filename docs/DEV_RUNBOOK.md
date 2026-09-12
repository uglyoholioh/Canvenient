# Canvenient Dev Runbook

Daily development commands for the Mac checkout. Architecture lives in
`docs/ARCHITECTURE.md`, hosting in `docs/HOSTING.md`, project state in
`docs/PROJECT_STATE.md`, and design rules in `design.md` /
`docs/coding-conventions.md`; this file is the "how do I run, test, format,
clean" entry point.

## Run

- Frontend dev server: `cd frontend && npm run dev`
- Backend locally: requires `DATABASE_URL` and `JWT_SECRET` in `backend/.env`
  (`database.py` refuses to start without them). The production backend runs
  on the home server (`backend/start-backend.bat`, Windows) — see
  `docs/HOSTING.md`.
- Desktop app: `scripts/rebuild-install-macos.sh` builds and installs the
  native macOS app. When building from a worktree, set
  `CARGO_TARGET_DIR` as described under "Concurrent agents".
- Remote-API mode: the `use-remote-api` marker file switches the app from
  the bundled backend to the hosted server.

## Test

- Backend: `cd backend && pytest tests/ -v` — each run gets its own temp
  database (override with `TEST_DATABASE_URL`).
- Frontend: `cd frontend && npm run lint && npm run test`
- CI (`.github/workflows/test.yml`) runs all of the above plus the macOS
  compile gate on every push to `main`.

## Format

- Frontend: `cd frontend && npm run format`
- Backend: `cd backend && ruff format .`
- CI fails on unformatted code (`format:check` / `ruff format --check`).

## Concurrent agents

See `AGENTS.md` ("Concurrent agents — worktree-default protocol"). Summary:
one git worktree per task, integrate to `main` by fast-forward, stage
explicit paths only, and share the Rust cache across worktrees with
`CARGO_TARGET_DIR="$HOME/.cache/canvenient-cargo-target"`.

## Reclaim disk

`scripts/reclaim-disk.sh` deletes the Rust `target/` dir and backend
`build/` + `dist/` (~4 GB). Everything regenerates on the next build.
