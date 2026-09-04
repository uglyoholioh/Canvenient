#!/usr/bin/env bash

# Build the Canvenient sidecar and macOS app, install it, then relaunch it.
set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BACKEND_DIR="$PROJECT_ROOT/backend"
readonly FRONTEND_DIR="$PROJECT_ROOT/frontend"
readonly TAURI_DIR="$FRONTEND_DIR/src-tauri"
readonly INSTALL_APP="/Applications/Canvenient.app"
readonly BUNDLE_ID="com.oli.canvenient"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is only available on macOS." >&2
  exit 1
fi

for required_command in rustc npm ditto osascript open curl lsof pgrep; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command" >&2
    exit 1
  fi
done

readonly PYINSTALLER="$BACKEND_DIR/venv/bin/pyinstaller"
if [[ ! -x "$PYINSTALLER" ]]; then
  echo "PyInstaller was not found at $PYINSTALLER." >&2
  echo "Create the backend virtual environment and install its requirements first." >&2
  exit 1
fi

readonly TARGET_TRIPLE="$(rustc -vV | awk '/^host:/ { print $2; exit }')"
if [[ -z "$TARGET_TRIPLE" ]]; then
  echo "Could not determine the Rust target triple." >&2
  exit 1
fi

readonly SIDECAR_SOURCE="$BACKEND_DIR/dist/run"
readonly SIDECAR_TARGET="$TAURI_DIR/bin/backend-$TARGET_TRIPLE"
readonly SIDECAR_DEV_TARGET="$TAURI_DIR/bin/backend"
readonly BUILT_APP="$TAURI_DIR/target/release/bundle/macos/canvenient.app"

echo "[1/5] Building the Python backend sidecar..."
(
  cd "$BACKEND_DIR"
  "$PYINSTALLER" --noconfirm --clean run.spec
)

if [[ ! -x "$SIDECAR_SOURCE" ]]; then
  echo "The backend build did not produce $SIDECAR_SOURCE." >&2
  exit 1
fi

echo "[2/5] Updating the Tauri sidecar..."
install -m 755 "$SIDECAR_SOURCE" "$SIDECAR_TARGET"
install -m 755 "$SIDECAR_SOURCE" "$SIDECAR_DEV_TARGET"

echo "[3/5] Building the macOS app..."
(
  cd "$FRONTEND_DIR"
  npx tauri build --bundles app
)

if [[ ! -d "$BUILT_APP" ]]; then
  echo "The Tauri build did not produce $BUILT_APP." >&2
  exit 1
fi

readonly BUILT_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$BUILT_APP/Contents/Info.plist")"
if [[ "$BUILT_BUNDLE_ID" != "$BUNDLE_ID" ]]; then
  echo "Refusing to install bundle ID '$BUILT_BUNDLE_ID'; expected '$BUNDLE_ID'." >&2
  exit 1
fi

echo "[4/5] Replacing $INSTALL_APP..."
/usr/bin/osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true

matching_app_pids() {
  /usr/bin/pgrep -f "^$INSTALL_APP/Contents/MacOS/(canvenient|backend)( |$)" || true
}

for _ in {1..30}; do
  [[ -z "$(matching_app_pids)" ]] && break
  sleep 0.2
done

if [[ -n "$(matching_app_pids)" ]]; then
  while IFS= read -r process_id; do
    [[ -n "$process_id" ]] && kill -TERM "$process_id" 2>/dev/null || true
  done < <(matching_app_pids)

  for _ in {1..20}; do
    [[ -z "$(matching_app_pids)" ]] && break
    sleep 0.2
  done
fi

if [[ -n "$(matching_app_pids)" ]]; then
  echo "Canvenient did not stop cleanly; the installed app was not replaced." >&2
  exit 1
fi

if /usr/sbin/lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8000 is still in use by another process:" >&2
  /usr/sbin/lsof -nP -iTCP:8000 -sTCP:LISTEN >&2
  echo "Stop that process, then run this command again." >&2
  exit 1
fi

readonly STAGING_DIR="$(mktemp -d /Applications/.canvenient-install.XXXXXX)"
readonly STAGED_APP="$STAGING_DIR/Canvenient.app"
readonly PREVIOUS_APP="$STAGING_DIR/Previous.app"

cleanup_staging() {
  if [[ -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
}
trap cleanup_staging EXIT

/usr/bin/ditto "$BUILT_APP" "$STAGED_APP"

if [[ -e "$INSTALL_APP" ]]; then
  mv "$INSTALL_APP" "$PREVIOUS_APP"
fi

if ! mv "$STAGED_APP" "$INSTALL_APP"; then
  if [[ -e "$PREVIOUS_APP" && ! -e "$INSTALL_APP" ]]; then
    mv "$PREVIOUS_APP" "$INSTALL_APP"
  fi
  echo "Installation failed; the previous app was restored." >&2
  exit 1
fi

echo "[5/5] Relaunching Canvenient..."
/usr/bin/open "$INSTALL_APP"

app_is_running=false
backend_is_healthy=false
# A rebuilt PyInstaller sidecar can take longer than 20 seconds to initialise
# its database on first launch. Keep this bounded, but do not report a failed
# install while the process is still starting normally.
for _ in {1..300}; do
  if [[ -n "$(matching_app_pids)" ]]; then
    app_is_running=true
  fi
  if curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    backend_is_healthy=true
  fi
  if [[ "$app_is_running" == true && "$backend_is_healthy" == true ]]; then
    break
  fi
  sleep 0.2
done

if [[ "$app_is_running" != true ]]; then
  echo "Canvenient was installed, but it did not stay open." >&2
  exit 1
fi

if [[ "$backend_is_healthy" != true ]]; then
  echo "Canvenient was installed and opened, but its backend health check failed." >&2
  exit 1
fi

echo "Canvenient is rebuilt, installed, and running."
