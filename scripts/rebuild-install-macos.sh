#!/usr/bin/env bash

# Build the Canvenient sidecar and macOS app, install it, then relaunch it.
# Concurrent-agent protocol (AGENTS.md): the install holds a claim lock so
# two agents never race the same target app; set CANVENIENT_VARIANT=<name> to
# build and install a separate app instance (own bundle id and data dir)
# instead of the main app.
set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BACKEND_DIR="$PROJECT_ROOT/backend"
readonly FRONTEND_DIR="$PROJECT_ROOT/frontend"
readonly TAURI_DIR="$FRONTEND_DIR/src-tauri"
readonly TAURI_CONF="$TAURI_DIR/tauri.conf.json"

# Optional parallel-review variant: CANVENIENT_VARIANT=modules builds
# productName "canvenient-modules" with bundle id "com.oli.canvenient.modules"
# and installs /Applications/Canvenient-modules.app — its own Application
# Support dir and WebKit storage, so it never contends with the main app.
readonly VARIANT="${CANVENIENT_VARIANT:-}"
if [[ -n "$VARIANT" && ! "$VARIANT" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "CANVENIENT_VARIANT must be lowercase letters, digits and dashes." >&2
  exit 1
fi
if [[ -n "$VARIANT" ]]; then
  readonly PRODUCT_NAME="canvenient-$VARIANT"
  readonly INSTALL_APP="/Applications/Canvenient-$VARIANT.app"
  readonly BUNDLE_ID="com.oli.canvenient.$VARIANT"
  readonly BUILT_APP="$TAURI_DIR/target/release/bundle/macos/$PRODUCT_NAME.app"
else
  readonly PRODUCT_NAME="canvenient"
  readonly INSTALL_APP="/Applications/Canvenient.app"
  readonly BUNDLE_ID="com.oli.canvenient"
  readonly BUILT_APP="$TAURI_DIR/target/release/bundle/macos/canvenient.app"
fi

# Install claim (AGENTS.md concurrent protocol): one install per target app
# at a time. A claim older than CLAIM_STALE_MINUTES counts as abandoned.
readonly CLAIM_STALE_MINUTES=20
readonly CLAIM_DIR="${TMPDIR:-/tmp}/canvenient-install-claims"
readonly CLAIM_KEY="$(basename "$INSTALL_APP")"
readonly CLAIM_LOCK="$CLAIM_DIR/$CLAIM_KEY.lock"

STAGING_DIR=""
TAURI_CONF_BACKUP=""
CLAIM_HELD=""
cleanup_install() {
  if [[ -n "$TAURI_CONF_BACKUP" && -f "$TAURI_CONF_BACKUP" ]]; then
    mv "$TAURI_CONF_BACKUP" "$TAURI_CONF"
    echo "Restored tauri.conf.json."
  fi
  if [[ -n "$CLAIM_HELD" ]]; then
    rm -rf "$CLAIM_LOCK"
  fi
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
}
trap cleanup_install EXIT

# ── Install claim (AGENTS.md concurrent protocol) ──────────────────────────
mkdir -p "$CLAIM_DIR"
if ! mkdir "$CLAIM_LOCK" 2>/dev/null; then
  if [[ -n "$(find "$CLAIM_LOCK" -maxdepth 0 -mmin +"$CLAIM_STALE_MINUTES" 2>/dev/null)" ]]; then
    echo "Taking over a stale install claim (older than ${CLAIM_STALE_MINUTES} min)."
    rm -rf "$CLAIM_LOCK"
    mkdir "$CLAIM_LOCK"
  else
    echo "Another install holds the claim for $CLAIM_KEY:" >&2
    cat "$CLAIM_LOCK/who" 2>/dev/null >&2 || true
    echo "Wait for it to finish, or remove $CLAIM_LOCK if it is abandoned." >&2
    exit 1
  fi
fi
CLAIM_HELD=1
{
  echo "app=$CLAIM_KEY"
  echo "pid=$$"
  echo "branch=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo unknown)"
  echo "commit=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "variant=${VARIANT:-main}"
  echo "started=$(date '+%Y-%m-%d %H:%M:%S')"
} > "$CLAIM_LOCK/who"
echo "Install claim held: $CLAIM_LOCK"

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

# Clean up staging dirs abandoned by interrupted installs (older than a day;
# never touch a directory another concurrent install may be using right now).
for stale in /Applications/.canvenient-install.*; do
  if [[ -d "$stale" && ! -n "$(find "$stale" -maxdepth 0 -mtime -1 2>/dev/null)" ]]; then
    rm -rf "$stale"
    echo "Removed stale install staging dir: $stale"
  fi
done

# Signing and notarization activate automatically once an Apple Developer
# "Developer ID Application" certificate exists in the login keychain.
# Notarization additionally needs `xcrun notarytool` credentials: either a
# stored keychain profile named "canvenient-notary" or APPLE_ID,
# APPLE_PASSWORD, and APPLE_TEAM_ID in the environment. Without a certificate
# the build behaves exactly as before (ad-hoc signed, local install only).
readonly NOTARY_PROFILE="canvenient-notary"
SIGNING_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | awk '/Developer ID Application/ { print $2; exit }')"
if [[ -n "$SIGNING_IDENTITY" ]]; then
  export APPLE_SIGNING_IDENTITY="$SIGNING_IDENTITY"
  echo "Code signing enabled: $SIGNING_IDENTITY"
else
  echo "No Developer ID Application certificate found; the build stays ad-hoc signed (local install only)."
fi

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
if [[ -n "$VARIANT" ]]; then
  echo "  variant '$VARIANT': productName -> $PRODUCT_NAME, bundle id -> $BUNDLE_ID"
  cp "$TAURI_CONF" "$TAURI_CONF.canvenient-variant-backup"
  TAURI_CONF_BACKUP="$TAURI_CONF.canvenient-variant-backup"
  CONF_FILE="$TAURI_CONF" VARIANT_PRODUCT_NAME="$PRODUCT_NAME" VARIANT_BUNDLE_ID="$BUNDLE_ID"
  export CONF_FILE VARIANT_PRODUCT_NAME VARIANT_BUNDLE_ID
  python3 - << 'PY'
import json, os

with open(os.environ["CONF_FILE"]) as f:
    conf = json.load(f)
conf["package"]["productName"] = os.environ["VARIANT_PRODUCT_NAME"]
conf["tauri"]["bundle"]["identifier"] = os.environ["VARIANT_BUNDLE_ID"]
with open(os.environ["CONF_FILE"], "w") as f:
    json.dump(conf, f, indent=2)
    f.write("\n")
PY
fi
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
  # The bundle binary is named after the product (canvenient / canvenient-<variant>),
  # so match any executable inside this app's MacOS dir.
  /usr/bin/pgrep -f "^$INSTALL_APP/Contents/MacOS/[^/]+( |$)" || true
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

/usr/bin/ditto "$BUILT_APP" "$STAGED_APP"

# Identify the installed build (AGENTS.md: check this before diagnosing a
# wrong app or installing over another agent — branch, commit, built_at).
if command -v git >/dev/null 2>&1; then
  printf '{"commit":"%s","branch":"%s","built_at":"%s"}\n' \
    "$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)" \
    "$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo detached)" \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    > "$STAGED_APP/Contents/Resources/build-meta.json"
fi

# Notarize and staple the staged app when signing + notary credentials exist.
# Failures are reported loudly but never block the local install.
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  notary_args=()
  if xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
    notary_args=(--keychain-profile "$NOTARY_PROFILE")
  elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    notary_args=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
  fi

  if [[ ${#notary_args[@]} -eq 0 ]]; then
    echo "Signed, but not notarized: configure notarytool (keychain profile '$NOTARY_PROFILE' or APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID) to enable notarization." >&2
  else
    echo "Submitting the app for Apple notarization (usually a few minutes)..."
    readonly NOTARY_ZIP="$STAGING_DIR/Canvenient-notarize.zip"
    if /usr/bin/ditto -c -k --keepParent "$STAGED_APP" "$NOTARY_ZIP" \
      && xcrun notarytool submit "$NOTARY_ZIP" --wait "${notary_args[@]}" \
      && xcrun stapler staple "$STAGED_APP" \
      && /usr/sbin/spctl -a -t exec -vv "$STAGED_APP"; then
      echo "Notarization accepted by Gatekeeper."
    else
      echo "Notarization or Gatekeeper assessment failed; installing the signed-but-unnotarized build. Check your notarytool credentials." >&2
    fi
    rm -f "$NOTARY_ZIP"
  fi
fi

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
if [[ -n "$VARIANT" && -f "$HOME/Library/Application Support/com.oli.canvenient/use-remote-api" ]]; then
  VARIANT_DATA_DIR="$HOME/Library/Application Support/$BUNDLE_ID"
  mkdir -p "$VARIANT_DATA_DIR"
  cp "$HOME/Library/Application Support/com.oli.canvenient/use-remote-api" "$VARIANT_DATA_DIR/use-remote-api"
  echo "Seeded the remote-API marker into the variant's data dir."
fi
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
  if [[ -f "$HOME/Library/Application Support/$BUNDLE_ID/use-remote-api" ]]; then
    echo "Local backend not running — expected in remote-API mode (the app talks to the hosted server)."
  else
    echo "Canvenient was installed and opened, but its backend health check failed." >&2
    exit 1
  fi
fi

echo "Canvenient is rebuilt, installed, and running."
