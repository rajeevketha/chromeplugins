#!/usr/bin/env bash
# Build Chrome Web Store zip + listing assets into Cursor Files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(python3 -c "import json; print(json.load(open('${ROOT}/manifest.json'))['version'])")"
ARTIFACTS="${CURSOR_ARTIFACTS_DIR:-/opt/cursor/artifacts}"
STAGE="$(mktemp -d)"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$ARTIFACTS" "$ARTIFACTS/assets" "$ROOT/dist" "$STAGE"

# Extension-only payload (manifest at zip root).
cp "$ROOT/manifest.json" "$ROOT/background.js" "$ROOT/README.md" "$STAGE/"
[[ -f "$ROOT/LICENSE" ]] && cp "$ROOT/LICENSE" "$STAGE/"
[[ -f "$ROOT/SECURITY.md" ]] && cp "$ROOT/SECURITY.md" "$STAGE/"
[[ -f "$ROOT/privacy.html" ]] && cp "$ROOT/privacy.html" "$STAGE/"
cp -R "$ROOT/popup" "$ROOT/content" "$ROOT/icons" "$STAGE/"
[[ -d "$ROOT/ready" ]] && cp -R "$ROOT/ready" "$STAGE/"

STORE_NAMES=(
  "TabSnoozer-${VERSION}-store.zip"
  "TabSnoozer-store.zip"
  "TabSnoozer.zip"
  "TabSnoozer-1.8.0-store.zip"
)

for name in "${STORE_NAMES[@]}"; do
  out="$ARTIFACTS/$name"
  rm -f "$out"
  (cd "$STAGE" && zip -qr "$out" .)
  cp -f "$out" "$ARTIFACTS/assets/$name"
  cp -f "$out" "$ROOT/dist/$name"
done

# Listing / screenshot assets pack for the Developer Dashboard.
if [[ -d "$ROOT/store" ]]; then
  ASSETS_ZIP="$ARTIFACTS/TabSnoozer-${VERSION}-cws-assets.zip"
  rm -f "$ASSETS_ZIP"
  (cd "$ROOT" && zip -qr "$ASSETS_ZIP" store -x '*.DS_Store*')
  cp -f "$ASSETS_ZIP" "$ARTIFACTS/assets/"
  cp -f "$ASSETS_ZIP" "$ARTIFACTS/TabSnoozer-cws-assets.zip"
  cp -f "$ASSETS_ZIP" "$ARTIFACTS/assets/TabSnoozer-cws-assets.zip"
  cp -f "$ASSETS_ZIP" "$ROOT/dist/"
fi

python3 - <<PY
import json, zipfile, os
art = "${ARTIFACTS}"
ver = "${VERSION}"
path = os.path.join(art, f"TabSnoozer-{ver}-store.zip")
z = zipfile.ZipFile(path)
names = z.namelist()
assert "manifest.json" in names, "manifest.json must be at zip root"
assert "store/" not in names and not any(n.startswith("store/") for n in names)
m = json.loads(z.read("manifest.json"))
assert m["version"] == ver
print(f"OK store package: {path}")
print(f"OK version {m['version']} · {len(names)} files · permissions={m.get('permissions')}")
print("Files section zips:")
for n in sorted(os.listdir(art)):
    if n.lower().endswith(".zip") and "snooze" in n.lower():
        p = os.path.join(art, n)
        print(f"  - {n} ({os.path.getsize(p)} bytes)")
PY
