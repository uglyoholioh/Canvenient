#!/usr/bin/env bash
# Stamp the git hash into the build version, then build + install + launch
# on the connected iPhone so the phone's Settings › About always shows
# exactly which commit is running.
set -euo pipefail
cd "$(dirname "$0")"
HASH=$(git rev-parse --short HEAD)
python3 - "$HASH" <<'PY'
import pathlib, re, sys
h = sys.argv[1]
p = pathlib.Path("project.yml")
t = p.read_text()
t = re.sub(r'CURRENT_PROJECT_VERSION: "[^"]*"', f'CURRENT_PROJECT_VERSION: "{h}"', t)
p.write_text(t)
PY
xcodegen generate >/dev/null
xcodebuild -project Canvenient.xcodeproj -scheme Canvenient \
  -destination "platform=iOS,id=E5195963-AF73-5736-9126-3460883CFE14" \
  -allowProvisioningUpdates build >/dev/null
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/Canvenient-*/Build/Products/Debug-iphoneos/Canvenient.app | head -1)
xcrun devicectl device install app --device E5195963-AF73-5736-9126-3460883CFE14 "$APP" >/dev/null
xcrun devicectl device process launch --device E5195963-AF73-5736-9126-3460883CFE14 com.oli.canvenient.ios || true
echo "Deployed $HASH to iPhone (version 0.2.0 ($HASH))"
