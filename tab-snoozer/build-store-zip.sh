#!/usr/bin/env bash
# Build Chrome Web Store zip (manifest at root) into Cursor Files / artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(python3 -c "import json; print(json.load(open('${ROOT}/manifest.json'))['version'])")"
ARTIFACTS="${CURSOR_ARTIFACTS_DIR:-/opt/cursor/artifacts}"
STAGE="$(mktemp -d)"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$ARTIFACTS" "$ARTIFACTS/assets" "$ROOT/dist" "$STAGE"

cp "$ROOT/manifest.json" "$ROOT/background.js" "$ROOT/README.md" "$STAGE/"
[[ -f "$ROOT/LICENSE" ]] && cp "$ROOT/LICENSE" "$STAGE/"
[[ -f "$ROOT/SECURITY.md" ]] && cp "$ROOT/SECURITY.md" "$STAGE/"
[[ -f "$ROOT/privacy.html" ]] && cp "$ROOT/privacy.html" "$STAGE/"
cp -R "$ROOT/popup" "$ROOT/content" "$ROOT/icons" "$STAGE/"
[[ -d "$ROOT/ready" ]] && cp -R "$ROOT/ready" "$STAGE/"

NAMES=(
  "TabSnoozer-${VERSION}-store.zip"
  "TabSnoozer-store.zip"
  "TabSnoozer.zip"
)

for name in "${NAMES[@]}"; do
  out="$ARTIFACTS/$name"
  rm -f "$out"
  (cd "$STAGE" && zip -qr "$out" .)
  cp -f "$out" "$ARTIFACTS/assets/$name"
  cp -f "$out" "$ROOT/dist/$name"
  # Stable alias some sessions look for
  if [[ "$name" == "TabSnoozer-${VERSION}-store.zip" ]]; then
    cp -f "$out" "$ARTIFACTS/TabSnoozer-1.8.0-store.zip"
    cp -f "$out" "$ARTIFACTS/assets/TabSnoozer-1.8.0-store.zip"
  fi
done

python3 - <<PY
import json, zipfile, os
art = "${ARTIFACTS}"
ver = "${VERSION}"
path = os.path.join(art, f"TabSnoozer-{ver}-store.zip")
z = zipfile.ZipFile(path)
names = z.namelist()
assert "manifest.json" in names, "manifest.json must be at zip root"
m = json.loads(z.read("manifest.json"))
assert m["version"] == ver
print(f"OK Files ready: {path}")
print(f"OK version {m['version']} · {len(names)} files")
for n in sorted(os.listdir(art)):
    if n.lower().endswith(".zip") and "snooze" in n.lower():
        p = os.path.join(art, n)
        print(f"  - {n} ({os.path.getsize(p)} bytes)")
PY
