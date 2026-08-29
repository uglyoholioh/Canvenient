#!/usr/bin/env bash

# Canvenient - Unified Dev Server Launcher
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Canvenient (Backend + Frontend)..."

# Cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Stopping servers..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start Backend
echo "📦 Starting FastAPI backend at http://127.0.0.1:8000..."
cd "$PROJECT_ROOT/backend"
if [ -d "venv" ]; then
  source venv/bin/activate
fi
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# 2. Start Frontend
echo "✨ Starting Vite frontend at http://localhost:5173..."
cd "$PROJECT_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers are running!"
echo "   - Web App: http://localhost:5173"
echo "   - API Docs: http://127.0.0.1:8000/docs"
echo "   Press Ctrl+C to stop both servers."
echo ""

wait
