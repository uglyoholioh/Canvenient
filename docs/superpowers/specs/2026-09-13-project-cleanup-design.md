# Project Cleanup — VCS Consolidation, Slimming, Workflow Structure

**Date:** 2026-09-13
**Status:** Approved design, awaiting quiet-tree gate before execution
**Origin:** Oli's request to clean up version control, reduce bloat, and make
the development workflow neater and more structured.

## Findings that shaped this design

- **Branch topology, not history, is the VCS mess.** Commit history is healthy
  (conventional commits, 367 tracked files, no junk in history). But `main` is
  stale: `codex/global-quick-capture` is 130 commits ahead, 0 behind — all iOS,
  dashboard, and assistant work from multiple agents has piled onto one
  long-running feature-named branch.
- **The CI macOS compile gate never fires.**
  `.github/workflows/test.yml` runs the Vite + Tauri compile job only on
  pushes/PRs targeting `main`. Since nothing lands on `main`, the strongest
  guard in the pipeline is dormant.
- **The repo feels 4 GB but the tracked source is tiny.** Regenerable
  artifacts dominate: 3.3 GB `frontend/src-tauri/target/`, 611 MB
  `frontend/node_modules/`, 46 MB `src-tauri/bin/`, 130 MB `backend/venv/`,
  63 MB `backend/build` + `dist`. All already gitignored.
- **Legacy code is unreferenced.** A repo-wide grep found no references to
  `scripts/legacy_patches/` (588 KB `temp.js`), `frontend/src/legacy/`, or the
  old `legacy/CanvasView.jsx`.
- **The dead `/ai/*` layer is still mounted.** `backend/routes/ai.py` is
  included at `backend/main.py:96` alongside the replacement `/assistant/*`
  layer. (Known-pending removal since the assistant migration.)
- **Workflow bones are good; gaps are narrow.** CI already runs backend pytest
  + ruff and frontend eslint + vitest. Missing: formatters, a documented dev
  runbook (run/test knowledge currently lives in agents' memories, not the
  repo), and branch conventions for concurrent agents.
- **Chronic dirty tree.** 15 modified backend model files (~16 insertions)
  have sat uncommitted across sessions, belonging to other in-flight agent
  work. Stray untracked root artifacts: `node_modules/` (empty, 4 KB),
  `.v2c/`, `.video_agent/`.

## Goals

1. Make `main` the live integration branch again and activate the macOS CI gate.
2. Remove dead code and reclaim disk with a repeatable one-command script.
3. Add formatters, a dev runbook, and written conventions so concurrent
   agents (and Oli) work the same structured way.

## Non-goals

- **Shipped-app efficiency** (bundle size, startup, runtime memory): deferred
  until measured. If pursued later, it starts with profiling, not deletion.
- Rewriting or reorganizing healthy commit history.
- Any behavior change in the shipped Mac/iOS apps.

## Phase 0 — Timing gate

No structural work while other agents are active. Phase 1 begins only when
the working tree is quiet and the dirty backend model files have landed under
their owner's commit. Re-check `git status` immediately before every phase.

## Phase 1 — VCS consolidation (near-zero risk)

1. Fast-forward `main` to `codex/global-quick-capture`. `main` becomes the
   integration branch; the macOS compile gate activates for all future pushes.
2. Delete `codex/global-quick-capture` (local + remote) after the merge.
3. Write the branch convention into `AGENTS.md` and
   `docs/AI_WORKING_AGREEMENT.md`: integration on `main`; task branches only
   for risky or experimental work; stage explicit paths, never `git add -A`.
4. Strays: add `.v2c/`, `.video_agent/`, and root `node_modules/` to
   `.gitignore`; inspect contents, then delete the empty root `node_modules/`
   and the two scratch directories.

## Phase 2 — Slimming (verify-before-delete)

One commit per cluster, each landing with CI green:

1. **Legacy deletion:** `scripts/legacy_patches/`, `frontend/src/legacy/`,
   `old_CanvasView.jsx` (untracked scratch). Re-verify zero references
   immediately before deletion.
2. **Dead `/ai/*` layer:** delete `backend/routes/ai.py` and its mount in
   `backend/main.py`. Audit `backend/models/ai_model.py` separately — the
   assistant layer may import from it; remove only genuinely dead parts. This
   cluster waits until the currently-dirty `ai_model.py` changes have landed.
3. **Disk reclaim:** `scripts/reclaim-disk.sh` running `cargo clean` in
   `frontend/src-tauri` and clearing `backend/build` + `backend/dist`
   (~4 GB recoverable on demand).
4. **Acceptance for deletions:** grep verification, backend pytest, frontend
   vitest, then a native macOS app rebuild + launch smoke test per the
   AGENTS.md verification rule (a green frontend build alone is not visual
   acceptance).

## Phase 3 — Workflow structure

1. **Formatters:** Prettier for frontend, `ruff format` for backend, plus a
   CI format-check job (ruff lint already runs in CI).
2. **Dev runbook:** `docs/DEV_RUNBOOK.md` — Mac dev flow, remote-API marker
   mode, backend/frontend test commands, reclaim-disk usage.
3. **Working agreement update:** branch convention and the concurrent-agent
   staging rule, matching Phase 1.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Colliding with concurrent agents | Phase 0 quiet-tree gate; explicit-path staging only |
| Deleting something actually used | Grep re-verification + full test suites + native smoke test |
| `/ai/*` still called somewhere | Grep frontend/iOS for `/ai/` calls before removal |
| Fast-forward surprises | `main` is 0 behind; merge is a pure fast-forward, no conflicts possible |

## Success criteria

- `main` is the integration branch, CI (including macOS compile) green on push.
- No codex long-running branch; conventions documented in the repo.
- Legacy and `/ai/*` code gone with all suites green and the native app verified.
- `scripts/reclaim-disk.sh` recovers ~4 GB.
- Formatters + format check in CI; `docs/DEV_RUNBOOK.md` exists.
