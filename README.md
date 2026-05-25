# CanVenient

CanVenient is a task manager and utility helper for NUS students, integrating Canvas, NUSMods, Telegram, and AI assistants.

This guide will walk you through setting up and running the project locally on **Windows** and **macOS**.

---

## Prerequisites

Before starting, ensure you have the following installed:
1. **Git**: [Download Git](https://git-scm.com/)
2. **Python (v3.10 or higher)**: [Download Python](https://www.python.org/downloads/)
3. **Node.js (v18 or higher) & npm**: [Download Node.js](https://nodejs.org/)

---

## Getting Started

### 1. Clone the Repository
Open your terminal (PowerShell/CMD on Windows, Terminal on macOS) and run:
```bash
git clone https://github.com/uglyoholioh/Canvenient.git
cd Canvenient
```

---

## Backend Setup (FastAPI)

Navigate to the `backend` directory:
```bash
cd backend
```

### 2. Create a Virtual Environment

- **Windows**:
  ```powershell
  python -m venv venv
  ```
- **macOS / Linux**:
  ```bash
  python3 -m venv venv
  ```

### 3. Activate the Virtual Environment

- **Windows (PowerShell)**:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
  > If you get an execution policy error, run this first:
  > ```powershell
  > Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
  > ```
- **Windows (Command Prompt)**:
  ```cmd
  .\venv\Scripts\activate.bat
  ```
- **macOS / Linux**:
  ```bash
  source venv/bin/activate
  ```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Configure Environment Variables
Create a file named `.env` inside the `backend` directory. **Do not commit this file to Git.**
```env
DATABASE_URL=postgresql+asyncpg://username:password@host:5432/dbname
```
Ask a team member for the active Supabase PostgreSQL connection string.

### 6. Run the Backend Server
```bash
uvicorn main:app --reload
```
The API runs at `http://127.0.0.1:8000`. Verify it is working by visiting `http://127.0.0.1:8000/health` in your browser — you should see `{"status": "ok"}`.

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

### Backend hangs and requests never complete
This is usually caused by too many open database connections. Supabase's Session Mode pooler limits connections to 15. Stop all running Uvicorn processes and restart:
```powershell
# Windows — kill any process using port 8000
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
```
Then restart the backend with `uvicorn main:app --reload`.

### Port 8000 is already in use
Another Uvicorn process is still running in the background. Use the command above to kill it, then restart.

### Execution policy error on Windows
Run this in your PowerShell terminal before activating the virtual environment:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

---

## Working with Git (Team Conventions)

Before making changes, consult [coding-conventions.md](coding-conventions.md).

- Create a feature branch: `git checkout -b feature/your-feature-name`
- Use prefix-based commit messages:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `chore:` for dependency or tooling updates
  - `docs:` for documentation changes
- Open a pull request and request a review before merging into `main`.