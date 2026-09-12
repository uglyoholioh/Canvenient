# Canvenient Agent Guardrails

Read this file and [`docs/AI_WORKING_AGREEMENT.md`](docs/AI_WORKING_AGREEMENT.md)
before changing this repository. These rules apply to every AI-assisted task.

## Non-negotiable protections

- Treat the current working tree and local app data as user-owned. Inspect with
  `git status` before editing; preserve unrelated changes.
- Never run `git reset --hard`, broad `git checkout` / `git restore`, `git
  clean`, destructive database commands, or overwrite the installed app/data
  unless the user explicitly names the target and asks for that action.
- Do not modify `backend/canvenient.db`, the macOS Application Support data
  directory, or WebKit local storage without explicit approval. Back up first
  when data changes are authorised.
- Do not silently replace a design with a newer or "cleaner" interpretation.
  When a screenshot or a prior state is the reference, reproduce it faithfully
  and verify it in the native app.
- Keep changes inside the user-requested scope. Ask before expanding that
  scope, sending data externally, altering accounts, or making a public change.

## Required workflow

1. Read the working agreement and inspect `git status` plus relevant source.
2. State the intended scope and any assumptions in the task update.
3. Make small, reviewable changes. Preserve unrelated dirty files.
4. Verify proportionately. For desktop UI changes, run the native rebuild and
   inspect the rendered macOS app; a successful frontend build alone is not
   visual acceptance.
5. Report what changed, what was verified, and any remaining limitation.
6. Update the relevant documentation when behaviour, operations, architecture,
   or a recovery decision changes.

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

## Safepoints

Maintain Git properly at your own discretion. Make logical safepoint commits as work progresses or when a state is known-good. If a commit or operation involves significant risk or requires attention, elevate and ask the user for explicit approval first. Safepoint commits contain source, required assets, tests, and operational scripts; exclude local databases, build output, credentials, logs, and scratch files unless the user explicitly requests them.

The current known-good restored dashboard checkpoint is `5e6b9cb`.
