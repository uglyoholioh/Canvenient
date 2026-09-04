# AI Working Agreement

This document protects Canvenient from accidental regressions during assisted
development. It is a living operational guide: update it in the same change
when an instruction, recovery technique, build process, or architectural
decision changes.

## Start every task safely

Before touching source, an assistant must:

1. Read `AGENTS.md`, this agreement, and the relevant feature documentation.
2. Run `git status --short` and identify pre-existing work. It belongs to the
   user unless the request clearly includes it.
3. Inspect the affected implementation before proposing or applying a change.
4. Keep the request bounded. Do not convert a bug fix into a redesign or
   replace a supplied visual reference with an interpretation.

## Protect source, history, and data

The following require explicit, target-specific user approval:

- resetting, cleaning, checking out, restoring, stashing, or reverting files;
- deleting or overwriting source, generated assets, local databases, or app
  support data;
- editing saved Canvas credentials, session storage, account data, or data in
  `backend/canvenient.db`;
- force-pushing, changing a remote, or opening a pull request (maintain standard git commits properly at your own discretion);
- transmitting credentials, tokens, personal data, or files to another
  service.

When recovery is requested, first make a non-destructive copy or commit of the
current source if authorised. Prefer Git reflogs, local editor history, and
known snapshots over speculative reconstruction. Never report recovery as
complete until the requested state is visibly verified.

## Desktop acceptance standard

For changes that affect the packaged macOS app:

1. Run focused tests or a frontend production build as appropriate.
2. Run `npm run desktop:rebuild` from the repository root.
3. Confirm `http://127.0.0.1:8000/health` responds successfully.
4. Inspect the installed `/Applications/Canvenient.app` at the relevant view.
5. Compare layout, interaction, and persisted data behaviour against the
   request. Do not call a build-only check visual verification.

The rebuild process preserves the user's application data. Do not replace or
migrate that data as part of a normal UI change.

## Source versus local output

Commit application source, tests, documentation, static assets, and build
scripts. Leave these out of normal safepoint commits unless explicitly needed:

- `backend/canvenient.db` and macOS Application Support data;
- PyInstaller output under `backend/build/` and `backend/dist/`;
- generated Tauri sidecar binaries;
- `.DS_Store`, audit output, logs, and one-off recovery/patch scripts;
- credentials, API tokens, and `.env` files.

## Keeping this documentation useful

- Record durable decisions and known-good checkpoints in
  [`docs/PROJECT_STATE.md`](PROJECT_STATE.md).
- Update the README when setup or operational commands change.
- Update this agreement and `AGENTS.md` when a new failure mode or safety rule
  is discovered.
- Keep entries factual: what changed, why it matters, how it was verified, and
  what must not be casually overwritten.
