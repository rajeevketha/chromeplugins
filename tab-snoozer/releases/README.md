# Tab Snoozer — downloadable store packages

Cursor Files often fails to expose `.zip` downloads even when the agent uploads them.
This folder is the **reliable download path** (committed to git).

## Current package

- `TabSnoozer-1.8.3-store.zip` — upload this to the Chrome Web Store
- `TabSnoozer-store.zip` / `TabSnoozer-CURRENT-store.zip` / `TabSnoozer-store-package.zip` — same build aliases

Rebuild with:

```bash
./tab-snoozer/build-store-zip.sh
```
