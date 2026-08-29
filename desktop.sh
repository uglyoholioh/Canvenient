#!/usr/bin/env bash

# Canvenient - Tauri desktop development launcher
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""

cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    echo ""
    echo "Stopping Canvenient backend..."
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if curl -fsS "http://127.0.0.1:8000/docs" >/dev/null 2>&1; then
  echo "Using the backend already running on port 8000."
else
  echo "Starting the Canvenient backend..."
  cd "$PROJECT_ROOT/backend"
  if [ -d "venv" ]; then
    source venv/bin/activate
  fi
  uvicorn main:app --reload --port 8000 &
  BACKEND_PID=$!

  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:8000/docs" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

echo "Opening the Canvenient desktop window..."
echo "Press Ctrl+C in this terminal to close it."
cd "$PROJECT_ROOT/frontend"
npx tauri dev
