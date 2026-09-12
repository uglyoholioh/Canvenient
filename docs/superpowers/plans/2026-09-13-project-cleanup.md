# Project Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate version control onto `main`, delete dead code, and install the multi-agent worktree workflow, formatters, and runbook per the approved spec.

**Architecture:** Three gated phases executed in a dedicated git worktree (dogfooding the new protocol). `main` becomes the integration branch via fast-forward; all cleanup commits land on a task branch and integrate at the end. Deletions are grep-verified and gated on test suites plus a native macOS smoke test.

**Tech Stack:** git worktrees, FastAPI/pytest backend, Vite/ESLint/Vitest/Prettier frontend, Tauri (Rust) shell, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-project-cleanup-design.md`

## Global Constraints

- Never run `git reset --hard`, broad checkout/restore, `git clean`, or destructive DB commands (AGENTS.md).
- Never modify `backend/canvenient.db`, Application Support data, or WebKit local storage.
- Stage explicit paths only; never `git add -A` or `git add .`.
- Do not touch another agent's dirty files; pre-existing dirty work belongs to the user.
- Phase 0 gate: no execution while other agents are actively committing.
- Commits follow conventional style: `feat|fix|chore|docs|refactor(scope): message`.
- Backend tests: `cd backend && pytest tests/ -v`. Frontend: `cd frontend && npm run lint && npm run test`.
- Ruff line length 120; config lives in `backend/pyproject.toml` (do not duplicate).

---

### Task 0: Preflight — quiet-tree gate and land orphaned work

**Files:**
- Possibly commit (not modify): the dirty files left by concurrent agents.

**Interfaces:**
- Produces: a quiet working tree with all pre-existing changes committed, and the current branch tip SHA recorded for Task 2.

- [ ] **Step 1: Poll until the tree is quiet**

Repeat until two consecutive checks ≥3 minutes apart both show no new commits and the dirty-file set is stable:

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenientpersonal"
git log --oneline -3 && git status --short
sleep 180 && git log --oneline -3 && git status --short
```

Known in-flight files as of plan-writing: `backend/models/*.py` (9 files), `backend/test_db_tasks.py`, `frontend/src/index.css`, `ios/project.yml`. If still hot after several polls, keep waiting — do not proceed hot.

- [ ] **Step 2: Inspect any remaining dirty work**

```bash
git diff --stat && git diff
```

If the diff is a coherent change (expected: small model field edits), validate it:

```bash
cd backend && pytest tests/ -v
```

- [ ] **Step 3: Commit orphaned work with explicit paths**

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenientpersonal"
git add backend/models/ai_model.py backend/models/community.py backend/models/event.py backend/models/form.py backend/models/invite.py backend/models/notification.py backend/models/schedule.py backend/models/study_session.py backend/models/task.py backend/test_db_tasks.py frontend/src/index.css ios/project.yml
git commit -m "chore: land pending changes left by concurrent session"
```

Adjust the path list to exactly the dirty files found in Step 2. If any dirty file looks broken or half-finished (tests fail), STOP and report to Oli instead of committing.

- [ ] **Step 4: Record the integration point**

```bash
git rev-parse HEAD
```

Expected: a single clean tip, everything committed. This SHA is what Task 2 fast-forwards `main` to.

---

### Task 1: Create the execution worktree

**Files:**
- Create: `../canvenient-zcode-cleanup/` (worktree, outside the repo dir)

**Interfaces:**
- Produces: branch `zcode/project-cleanup` checked out in an isolated worktree; all subsequent tasks run there via `WORKTREE="/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"`.

- [ ] **Step 1: Invoke superpowers:using-git-worktrees** to create the isolated workspace for branch `zcode/project-cleanup` off the current tip. Fallback manual command:

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenientpersonal"
git worktree add ../canvenient-zcode-cleanup -b zcode/project-cleanup
```

- [ ] **Step 2: Share the Rust target dir** so the worktree does not duplicate ~3.3 GB:

```bash
echo 'export CARGO_TARGET_DIR="$HOME/.cache/canvenient-cargo-target"' >> /tmp/cleanup-env
```

Use this env var for any cargo/tauri command run inside the worktree.

- [ ] **Step 3: Verify isolation**

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup" && git status --short && git branch --show-current
```

Expected: clean tree on `zcode/project-cleanup`.

---

### Task 2: VCS consolidation — `main` becomes the integration branch

**Files:**
- No source files. Refs only.

**Interfaces:**
- Consumes: the tip SHA from Task 0.
- Produces: `main` = pre-cleanup tip, pushed; `codex/global-quick-capture` deleted locally and on origin; primary checkout switched to `main`.

- [ ] **Step 1: Fast-forward `main` to the tip** (from the worktree; `main` is checked out nowhere, so `branch -f` is a pure fast-forward):

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"
TIP=$(git rev-parse zcode/project-cleanup)
git branch -f main "$TIP"
git push origin main
```

Expected: push is a fast-forward; origin/main moves from the old tip to `$TIP`.

- [ ] **Step 2: Switch the primary checkout to `main`** (dirty files, if any remain, carry over — same commit, zero file changes):

```bash
git -C "/Users/oli/Desktop/Personal Projects/canvenientpersonal" switch main
```

- [ ] **Step 3: Retire the codex branch**

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"
git branch -D codex/global-quick-capture
git push origin --delete codex/global-quick-capture
```

- [ ] **Step 4: Verify**

```bash
git -C "/Users/oli/Desktop/Personal Projects/canvenientpersonal" branch --show-current
git log --oneline origin/main -1
```

Expected: primary checkout on `main`; origin/main at the Task 0 tip. The macOS compile CI job now triggers on `main` pushes — check the Actions tab after this push.

---

### Task 3: Strays — gitignore and delete scratch artifacts

**Files:**
- Modify: `.gitignore` (append three lines)
- Delete: `node_modules/` (repo root, empty), `.v2c/`, `.video_agent/`

- [ ] **Step 1: Append to `.gitignore`**

```
# Agent/plugin scratch and accidental installs
.v2c/
.video_agent/
/node_modules/
```

- [ ] **Step 2: Inspect then delete** (contents already verified as scratch: `plugin_root` pointer files, empty node_modules)

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"
ls -la node_modules .v2c .video_agent
rm -rf node_modules .v2c .video_agent
```

- [ ] **Step 3: Verify and commit**

```bash
git status --short
git add .gitignore
git commit -m "chore: ignore and remove agent scratch dirs and stray root node_modules"
```

---

### Task 4: Delete unreferenced legacy code

**Files:**
- Delete: `scripts/legacy_patches/` (20 files), `frontend/src/legacy/` (18 files)

**Interfaces:**
- Consumes: nothing. Both directories are grep-verified unreferenced (spec finding); re-verify now anyway.

- [ ] **Step 1: Re-verify zero references** (must print nothing but the deleted dirs' own paths):

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"
grep -rn "legacy_patches\|src/legacy" frontend/src backend/routes backend/ai frontend/src-tauri/src ios scripts/rebuild-install-macos.sh 2>/dev/null
```

- [ ] **Step 2: Delete**

```bash
git rm -r scripts/legacy_patches frontend/src/legacy
```

- [ ] **Step 3: Run frontend suite**

```bash
cd frontend && npm run lint && npm run test
```

Expected: pass. If a test imports from `src/legacy/`, STOP — restore nothing, report the dependency to Oli.

- [ ] **Step 4: Commit**

```bash
cd .. && git commit -m "chore: delete unreferenced legacy patches and legacy frontend views"
```

---

### Task 5: Remove the dead `/ai/*` layer

**Files:**
- Delete: `backend/routes/ai.py`, `backend/models/ai_model.py` (orphan — no `.py` file references it)
- Modify: `backend/main.py:13` (remove `from routes.ai import router as ai_router`), `backend/main.py:96` (remove `app.include_router(ai_router)`)
- Modify: `frontend/src/api.js:951-965` (remove `getAiBrief` and `sendAiChat`, both caller-verified dead; keep the `// Fresh assistant layer` comment and everything below)

- [ ] **Step 1: Final reference checks** (all must come back empty/only-self):

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"
grep -rn "getAiBrief\|sendAiChat" frontend/src --include="*.jsx" --include="*.js" | grep -v "api.js"
grep -rn "routes.ai\|routes/ai" backend --include="*.py" | grep -v __pycache__ | grep -v "backend/routes/ai.py"
grep -rn "ai_model" backend --include="*.py" | grep -v __pycache__ | grep -v "backend/models/ai_model.py"
grep -rn '"/ai/\|`/ai/' ios --include="*.swift"
```

- [ ] **Step 2: Delete backend pieces** — remove the two `main.py` lines and:

```bash
git rm backend/routes/ai.py backend/models/ai_model.py
```

Note: `routes/ai.py` writes to the `ai_brief_cache` table. Do not touch migrations or the table — it simply becomes unused data. If `backend/migrations/` references `ai_brief_cache`, leave those references (migrations are history).

- [ ] **Step 3: Delete the two dead frontend exports** in `frontend/src/api.js` (the `getAiBrief` and `sendAiChat` function blocks exactly as shown between `markAllNotificationsAsRead` and the `// Fresh assistant layer` comment).

- [ ] **Step 4: Run backend + frontend suites**

```bash
cd backend && pytest tests/ -v && cd ../frontend && npm run lint && npm run test
```

- [ ] **Step 5: Commit**

```bash
cd .. && git add backend/main.py frontend/src/api.js && git commit -m "chore: remove dead /ai/* layer superseded by /assistant/*"
```

---

### Task 6: Reclaim-disk script

**Files:**
- Create: `scripts/reclaim-disk.sh` (executable)

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Reclaim regenerable build artifacts (~4 GB). Safe to run anytime;
# next desktop rebuild restores everything (frontend/dist via vite build,
# Rust artifacts via cargo, backend bundles via PyInstaller).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Before:"; du -sh frontend/src-tauri/target backend/build backend/dist 2>/dev/null || true
rm -rf frontend/src-tauri/target backend/build backend/dist
echo "After:"; du -sh frontend/src-tauri/target backend/build backend/dist 2>/dev/null || echo "artifacts cleared"
```

- [ ] **Step 2: Make executable and smoke-test the syntax**

```bash
chmod +x scripts/reclaim-disk.sh && bash -n scripts/reclaim-disk.sh
```

Do NOT run it now — Task 11 needs the existing target dir for the native rebuild.

- [ ] **Step 3: Commit**

```bash
git add scripts/reclaim-disk.sh && git commit -m "feat(scripts): add reclaim-disk.sh to clear regenerable build artifacts"
```

---

### Task 7: Per-run test databases in conftest

**Files:**
- Modify: `backend/tests/conftest.py:13`

**Interfaces:**
- Produces: `TEST_DATABASE_URL` env override still wins; default becomes a unique temp dir per pytest invocation, so concurrent/interleaved runs never collide.

- [ ] **Step 1: Edit the constant block** (add `import tempfile` to the stdlib imports; replace the fixed path):

```python
# Unique per-run database so concurrent test invocations can never collide.
TEST_DB_DIR = tempfile.mkdtemp(prefix="canvenient-test-db-")
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{TEST_DB_DIR}/test.db")
os.environ["DATABASE_URL"] = TEST_DB_URL
```

- [ ] **Step 2: Verify two consecutive runs leave no shared `test.db` and both pass**

```bash
cd backend
ls test.db 2>/dev/null && echo "FAIL: shared test.db still used" || echo "OK: no shared test.db"
pytest tests/ -q
```

Expected: `OK`, suite passes. (CI's explicit `DATABASE_URL` env is overridden by conftest exactly as before; `TEST_DATABASE_URL` override unchanged.)

- [ ] **Step 3: Commit**

```bash
cd .. && git add backend/tests/conftest.py && git commit -m "fix(tests): give each pytest run a unique temp database"
```

---

### Task 8: Write the concurrency conventions into AGENTS.md and the working agreement

**Files:**
- Modify: `AGENTS.md` (new section after "Required workflow")
- Modify: `docs/AI_WORKING_AGREEMENT.md` (new section after "Protect source, history, and data")

- [ ] **Step 1: Add to `AGENTS.md`**

```markdown
## Concurrent agents — worktree-default protocol

Integration happens on `main`. `main` must always stay releasable: CI runs
backend tests, frontend lint+tests, and the macOS compile gate on every push.

- Any task expected to modify backend code, shared files (`index.css`,
  `backend/main.py`, Tauri config), run tests or dev servers, or take more
  than a few minutes runs in its own worktree:
  `git worktree add ../canvenient-<agent>-<slug> -b <agent>/<slug>`.
- Tiny, disjoint changes (docs, single-file tweaks) may use the main checkout
  only when no other agent's dirty files overlap.
- In a shared tree: re-check `git status` before every add/commit; stage
  explicit paths only (never `git add -A` or `git add .`); commit with a
  pathspec limited to files your task touched; never touch another agent's
  dirty or untracked files; on `.git/index.lock` contention wait and retry,
  never delete the lock.
- Share the Rust build cache across worktrees with
  `CARGO_TARGET_DIR="$HOME/.cache/canvenient-cargo-target"`.
- Task branches integrate by fast-forward into `main` and are deleted after.
```

- [ ] **Step 2: Add matching section to `docs/AI_WORKING_AGREEMENT.md`**

```markdown
## Work concurrently without clashes

Multiple assistants may work at once. The default is isolation: one git
worktree per task (see `AGENTS.md`). In the shared-tree exception, an
assistant stages only paths it touched, re-checks `git status` immediately
before every commit, and treats all pre-existing dirty or untracked files as
the user's property. Destructive git commands remain prohibited under the
section above regardless of which worktree they run in.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md docs/AI_WORKING_AGREEMENT.md
git commit -m "docs: add worktree-default multi-agent protocol to agent guardrails"
```

---

### Task 9: Dev runbook

**Files:**
- Create: `docs/DEV_RUNBOOK.md`

- [ ] **Step 1: Inventory existing docs first** and cross-link instead of duplicating:

```bash
ls docs/
```

- [ ] **Step 2: Write `docs/DEV_RUNBOOK.md`**

```markdown
# Canvenient Dev Runbook

Daily development commands for the Mac checkout. Architecture and ops docs
live elsewhere in `docs/`; this file is the "how do I run/test/clean" entry
point.

## Run

- Frontend dev server: `cd frontend && npm run dev`
- Backend locally: requires `DATABASE_URL` and `JWT_SECRET` in `backend/.env`
  (`database.py` refuses to start without them). The production backend runs
  on the home server (`backend/start-backend.bat`, Windows) — see the home
  server docs.
- Desktop app: `scripts/rebuild-install-macos.sh` builds and installs the
  native macOS app. Set `CARGO_TARGET_DIR` when building from a worktree.
- Remote-API mode: the `use-remote-api` marker file switches the app from
  bundled backend calls to the hosted server.

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
one git worktree per task, integrate to `main` by fast-forward, share the
Rust cache via `CARGO_TARGET_DIR="$HOME/.cache/canvenient-cargo-target"`,
stage explicit paths only.

## Reclaim disk

`scripts/reclaim-disk.sh` deletes Rust `target/`, backend `build/` and
`dist/` (~4 GB). Everything regenerates on the next build.
```

- [ ] **Step 3: Commit**

```bash
git add docs/DEV_RUNBOOK.md && git commit -m "docs: add dev runbook — run, test, format, worktrees, disk reclaim"
```

---

### Task 10: Wire in formatters

**Files:**
- Create: `frontend/.prettierrc.json`
- Modify: `frontend/package.json` (scripts: `format`, `format:check`)
- Modify: `frontend/eslint.config.js` (add prettier config so lint and format agree)
- Format-once churn: backend `.py` files via `ruff format`, frontend files via prettier
- Modify: `.github/workflows/test.yml` (add format checks to both test jobs)

- [ ] **Step 1: Create `frontend/.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 2: Add scripts to `frontend/package.json`**

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

Add a `.prettierignore` if `npm run format:check` trips on build output:

```
dist/
node_modules/
src-tauri/
```

- [ ] **Step 3: Wire prettier into eslint** — in `frontend/eslint.config.js` add `eslint-config-prettier` as the LAST entry of the flat-config array (disables stylistic rules that fight prettier; `eslint-plugin-prettier` stays unused to keep lint fast):

```js
import eslintConfigPrettier from "eslint-config-prettier";
// ...append to the exported config array:
eslintConfigPrettier,
```

- [ ] **Step 4: Format once and verify**

```bash
cd frontend && npm run format && npm run lint && npm run test
cd ../backend && ruff format . && ruff check . && pytest tests/ -q
```

- [ ] **Step 5: Add CI format gates** — in `frontend-tests` job after lint:

```yaml
      - name: Check formatting (Prettier)
        run: |
          cd frontend
          npm run format:check
```

In `backend-tests` job, replace the lint step's run block with:

```yaml
      - name: Lint backend (ruff)
        run: |
          cd backend
          ruff check .
          ruff format --check .
```

- [ ] **Step 6: Commit** (separate commits: config, then format churn, so review stays readable)

```bash
cd ..
git add frontend/.prettierrc.json frontend/.prettierignore frontend/package.json frontend/eslint.config.js .github/workflows/test.yml
git commit -m "build: wire in prettier and ruff format with CI gates"
git add -u frontend/src backend
git commit -m "style: apply prettier and ruff format across the codebase"
```

---

### Task 11: Final acceptance and integration

**Files:**
- None new. Verification + integration only.

**Interfaces:**
- Consumes: all prior tasks on `zcode/project-cleanup`.

- [ ] **Step 1: Full suites on the task branch**

```bash
cd backend && pytest tests/ -v && cd ../frontend && npm run lint && npm run format:check && npm run test
```

- [ ] **Step 2: Integrate to `main`**

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenient-zcode-cleanup"
git push origin zcode/project-cleanup
git fetch . zcode/project-cleanup:main
git push origin main
```

Wait for CI green on the `main` push (Actions tab) — including the macOS compile gate, which fires for the first time.

- [ ] **Step 3: Native smoke test in the primary checkout** (per AGENTS.md: a green build alone is not visual acceptance)

```bash
cd "/Users/oli/Desktop/Personal Projects/canvenientpersonal" && git pull --ff-only && scripts/rebuild-install-macos.sh
```

Launch the installed app, sign in, confirm dashboard renders and one AI/assistant surface responds. If `CARGO_TARGET_DIR` was used for the worktree build, the primary checkout's existing `frontend/src-tauri/target` is untouched and reused.

- [ ] **Step 4: Retire the task branch and worktree**

```bash
git worktree remove ../canvenient-zcode-cleanup
git branch -D zcode/project-cleanup
git push origin --delete zcode/project-cleanup
```

- [ ] **Step 5: Success-criteria audit against the spec** — confirm each spec bullet: `main` is integration branch with CI green (incl. macOS gate); codex branch gone; conventions in AGENTS.md + agreement; legacy + `/ai/*` deleted with suites green and native app verified; `reclaim-disk.sh` exists (run it after acceptance to demonstrate the ~4 GB recovery); formatters + format check in CI; `docs/DEV_RUNBOOK.md` exists; conftest per-run DBs; worktree flow validated end-to-end (this task is that validation). Report the audit table to Oli.
