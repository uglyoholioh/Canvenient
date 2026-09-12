# Backend Hosting

The backend can run in two modes. Both use the same FastAPI app and a SQLite
database; clients (macOS app, iOS app) only need the base URL.

## Current: home server (Windows desktop) via Tailscale

The production-for-now instance runs on the owner's Windows desktop and is
reachable **only inside the owner's tailnet** at:

```
https://olisdesktop.tail7ecaad.ts.net
```

TLS is a real Let's Encrypt certificate issued by Tailscale, so iOS App
Transport Security is satisfied with no exceptions.

### Layout on the box

| Path | Purpose |
|---|---|
| `C:\Users\oli\canvenient-server\app` | Backend source (copied from `backend/`, plus `requirements-server.txt`) |
| `C:\Users\oli\canvenient-server\data` | SQLite DB (`canvenient.db`), `jwt_secret`, rolling `backups/` |
| `C:\Users\oli\canvenient-server\start-backend.cmd` | Launcher: sets `JWT_SECRET`, runs `run.py --data-dir ...\data --port 8000`, logs to `backend.log` |
| Scheduled task `CanvenientBackend` | Starts the launcher at system boot as SYSTEM |

Optional launcher env (assistant features, added 2026-09-13): `set
MODEL_API_KEY=<key>` enables `/assistant/*` AI replies (without it they
answer 503 or degrade to deterministic facts); `set AI_PROVIDER=` selects the
provider shape — `gemini` (default, generativelanguage.googleapis.com) or
`zai` (OpenAI-compatible chat completions, base URL `AI_BASE_URL` defaults to
`https://api.z.ai/api/paas/v4`, model default `glm-4.5-flash` with thinking
disabled and `response_format: json_object`). `set AI_MODEL=` overrides the
per-provider default model. PDF attachments ("Ask about this" on files) are
Gemini-only; on `zai` they answer 503 with a clear message.
`set TELEGRAM_BOT_TOKEN=<bot token>` lets the in-process digest scheduler push
the daily Telegram digest at each linked user's `digest_time`. Add to
`start-backend.cmd`, then restart the task. Never commit key values; they
live only in the server launcher.

SSH access is key-only (`oli`, OpenSSH Server, key installed in
`administrators_authorized_keys`). The backend binds `127.0.0.1` inside the
box; `tailscale serve --bg 8000` (persistent) is the only door — nothing is
exposed to the LAN or the public internet.

### Operational notes

- **`requirements-server.txt`** is `requirements-lock.txt` minus `uvloop`
  (uvloop does not build on Windows; uvicorn falls back to the standard
  asyncio loop). Regenerate with
  `findstr /v uvloop requirements-lock.txt > requirements-server.txt`.
- The box must be powered on for clients to sync. Windows Update restarts
  cause brief outages; the scheduled task brings the backend back
  automatically on boot.
- First-party feeds (`api.nusmods.com`) are reachable from the box. The
  `nusbus.app` relay is third-party; when it 502s, bus endpoints report
  "temporarily unavailable" until it recovers (client caching applies).
- To update the server after backend changes: re-copy changed files via
  `scp`/`tar` over SSH, then `schtasks /run /tn CanvenientBackend`.

## Future: Fly.io (documented production path)

For 24/7 availability independent of the home desktop, the same container
deploys to Fly.io unchanged (`backend/Dockerfile`): `fly launch` in `sin`
region, SQLite on a Fly Volume (`DATABASE_URL=sqlite:////data/canvenient.db`),
`JWT_SECRET` set as a secret, `/health` as the HTTP check. Clients switch by
changing their base URL — no code changes. Estimate ~$5/mo (Fly removed its
free tier in 2024).

## Client opt-in (macOS app)

The packaged macOS app talks to its bundled localhost sidecar by default.
To point it at a hosted backend instead, create a marker file:

```
~/Library/Application Support/com.oli.canvenient/use-remote-api
```

whose first non-empty line is the server base URL (e.g.
`https://olisdesktop.tail7ecaad.ts.net`). On the next launch the app skips
the local sidecar entirely and uses the remote API. Delete the file to
revert to local mode. Accounts are per-database: the first launch against a
fresh server needs a new registration (or re-registration with the same
email/password as local, if desired).
