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

RELEASES="$ROOT/releases"
mkdir -p "$RELEASES"

STORE_NAMES=(
  "TabSnoozer-${VERSION}-store.zip"
  "TabSnoozer-store.zip"
  "TabSnoozer.zip"
  "TabSnoozer-store-package.zip"
  "TabSnoozer-CURRENT-store.zip"
)

for name in "${STORE_NAMES[@]}"; do
  out="$ARTIFACTS/$name"
  rm -f "$out"
  (cd "$STAGE" && zip -qr "$out" .)
  cp -f "$out" "$ARTIFACTS/assets/$name"
  cp -f "$out" "$ROOT/dist/$name"
  # Repo path users can download when Cursor Files zip UX fails
  cp -f "$out" "$RELEASES/$name"
done

# Canonical versioned name always present in releases/
cp -f "$ARTIFACTS/TabSnoozer-${VERSION}-store.zip" "$RELEASES/TabSnoozer-${VERSION}-store.zip"

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
import json, zipfile, os, time
art = "${ARTIFACTS}"
ver = "${VERSION}"
path = os.path.join(art, f"TabSnoozer-{ver}-store.zip")
z = zipfile.ZipFile(path)
names = z.namelist()
assert "manifest.json" in names, "manifest.json must be at zip root"
assert "store/" not in names and not any(n.startswith("store/") for n in names)
m = json.loads(z.read("manifest.json"))
assert m["version"] == ver

# Pointer files so Files/UI always has an obvious "latest" entry.
latest = os.path.join(art, "TabSnoozer-LATEST.txt")
with open(latest, "w", encoding="utf-8") as fh:
    fh.write(
        f"version={ver}\n"
        f"store_zip=TabSnoozer-{ver}-store.zip\n"
        f"store_path={path}\n"
        f"assets_zip=TabSnoozer-{ver}-cws-assets.zip\n"
        f"repo_release=tab-snoozer/releases/TabSnoozer-{ver}-store.zip\n"
        f"built_at={time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n"
    )
# Stable copies for picky Files browsers
for alias in ("TabSnoozer-CURRENT-store.zip", f"tabsnoozer-{ver}-store.zip", "TabSnoozer-store-package.zip"):
    alias_path = os.path.join(art, alias)
    with open(path, "rb") as src, open(alias_path, "wb") as dst:
        dst.write(src.read())
    with open(os.path.join(art, "assets", alias), "wb") as dst:
        with open(path, "rb") as src:
            dst.write(src.read())

rel = os.path.join("${RELEASES}", f"TabSnoozer-{ver}-store.zip")
assert os.path.isfile(rel), f"missing repo release zip: {rel}"

print(f"OK store package: {path}")
print(f"OK version {m['version']} · {len(names)} files · permissions={m.get('permissions')}")
print(f"OK latest pointer: {latest}")
print(f"OK repo download: {rel}")
print("Files section zips:")
for n in sorted(os.listdir(art)):
    lower = n.lower()
    if ("snooze" in lower or n.startswith("TabSnoozer") or n.startswith("tabsnoozer")) and (
        lower.endswith(".zip") or n.endswith(".txt")
    ):
        p = os.path.join(art, n)
        print(f"  - {n} ({os.path.getsize(p)} bytes)")
PY
