# CanVenient

CanVenient is a native macOS task manager and utility helper for NUS students, built with Tauri, integrating Canvas, NUSMods, Telegram, and AI assistants.

This guide walks through setting up and running the project locally on **macOS** (the packaged-app target). Server-style deployment with PostgreSQL is optional.

---

## Prerequisites

Before starting, ensure you have the following installed:
1. **Git**: [Download Git](https://git-scm.com/)
2. **Python (v3.10 or higher)**: [Download Python](https://www.python.org/downloads/)
3. **Node.js (v18 or higher) & npm**: [Download Node.js](https://nodejs.org/)

---

## Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/uglyoholioh/Canvenient.git
cd Canvenient
```

> **Note:** Databases, build output, and the generated backend sidecar binaries are
> not committed to git. After a fresh clone, run `npm run desktop:rebuild` once from
> the project root to build them (see [Troubleshooting](#rebuild-and-reinstall-the-macos-app)).

---

## Backend Setup (FastAPI)

Navigate to the `backend` directory:
```bash
cd backend
```

### 2. Create and Activate a Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a file named `.env` inside the `backend` directory. **Do not commit this file to Git.**

The desktop app runs on a local SQLite database by default, so the only required
variable is the database URL:
```env
DATABASE_URL=sqlite:///./canvenient.db
# AI Brief (optional — enables /ai/brief and /ai/chat)
MODEL_API_KEY=your-gemini-api-key
# Telegram bot (optional)
TELEGRAM_BOT_TOKEN=123456:replace-with-botfather-token
TELEGRAM_BOT_USERNAME=your_bot_username
```

Notes:
- `JWT_SECRET` is optional. When unset, the backend generates a random key on
  first start and persists it next to the database file. Set it explicitly for
  server deployments where tokens must survive across machines.
- Server deployments may point `DATABASE_URL` at PostgreSQL instead; the SQL
  layer supports both dialects.

### 5. Run the Backend Server
```bash
uvicorn main:app --reload
```
The API runs at `http://127.0.0.1:8000` and is reachable only from localhost. Verify it is working by visiting `http://127.0.0.1:8000/health` in your browser — you should see `{"status": "ok"}`.

The API only accepts browser origins from the packaged Tauri webview
(`tauri://localhost`) and the Vite dev server (`http://localhost:5173`); set
`CANVENIENT_ALLOWED_ORIGINS` (comma-separated) to add more.

### Telegram Bot

1. Create a bot with BotFather and configure `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_BOT_USERNAME`.
2. Expose the backend over HTTPS, then register `https://your-host/telegram/webhook`
   with Telegram's `setWebhook`, passing the same `TELEGRAM_WEBHOOK_SECRET` as
   `secret_token`. **The webhook rejects updates unless that secret matches** —
   an unset secret returns 403 (set `TELEGRAM_WEBHOOK_INSECURE=1` only for
   local-only testing).
3. Send `/start` to the bot. It replies with a connection code valid for 15 minutes.
4. While logged in, open Canvenient Settings and enter the code under Telegram Bot.

The settings screen claims the code through `POST /telegram/claim`. The bot supports `/today`, `/week`, `/deadlines`, `/tasks`,
`/done <task id>`, and `/help`. Link status is available from `GET /telegram/link`,
and `DELETE /telegram/link` disconnects the account.

---

## Frontend Setup (React + Vite)

Open a **new terminal window**, then navigate to the `frontend` directory from the project root:
```bash
cd frontend
```

### 7. Install Dependencies
```bash
npm install
```

### 8. Run the Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

> **Note:** Vite is configured to proxy all `/auth` requests to the backend at port 8000, so both servers need to be running at the same time.

---

## Troubleshooting

### Rebuild and reinstall the macOS app

From the project root, run:

```bash
npm run desktop:rebuild
```

This rebuilds the Python backend sidecar and Tauri app, closes the installed
Canvenient app, replaces `/Applications/Canvenient.app`, relaunches it, and
checks that its backend is healthy. Your app data in macOS Application Support
is left untouched. Run this once after a fresh clone — the generated sidecar
binaries under `frontend/src-tauri/bin/` are not committed.

### Port 8000 is already in use
Another Uvicorn or sidecar process is still running in the background. Kill the
process bound to port 8000, then restart the backend.

---

## Working with Git (Team Conventions)

Before making changes, consult [coding-conventions.md](coding-conventions.md).
AI-assisted changes must also follow [AGENTS.md](AGENTS.md) and the
[AI Working Agreement](docs/AI_WORKING_AGREEMENT.md). The latest accepted
application state is recorded in [Project State and Safepoints](docs/PROJECT_STATE.md).

- Create a feature branch: `git checkout -b feature/your-feature-name`
- Use prefix-based commit messages:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `chore:` for dependency or tooling updates
  - `docs:` for documentation changes
- Open a pull request and request a review before merging into `main`.
