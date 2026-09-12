#!/usr/bin/env bash
# Reclaim regenerable build artifacts (~4 GB). Safe to run anytime; the next
# desktop rebuild restores everything (frontend bundle via vite, Rust artifacts
# via cargo, backend bundles via PyInstaller).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Before:"
du -sh frontend/src-tauri/target backend/build backend/dist 2>/dev/null || true
rm -rf frontend/src-tauri/target backend/build backend/dist
echo "After:"
du -sh frontend/src-tauri/target backend/build backend/dist 2>/dev/null || echo "artifacts cleared"
