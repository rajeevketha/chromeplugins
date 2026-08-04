---
name: publish-tabsnoozer-zip
description: Build and publish Tab Snoozer Chrome Web Store zip into Cursor Files (/opt/cursor/artifacts). Use whenever tab-snoozer changes, or when the user asks for the zip, store package, or Files download.
---

# Publish Tab Snoozer zip to Files

## When to use

- Any edit under `tab-snoozer/`
- User asks for the zip / store package / Files section download
- End of a turn that touched packaging, UI, or extension logic

## Steps

1. Run:

```bash
./tab-snoozer/build-store-zip.sh
```

2. Confirm with:

```bash
ls -la /opt/cursor/artifacts/TabSnoozer-*-store.zip /opt/cursor/artifacts/TabSnoozer-LATEST.txt
```

3. Tell the user the exact versioned filename and link it from `/opt/cursor/artifacts/`.

## Notes

- Store zip has `manifest.json` at the zip root (no nested folder).
- Listing assets zip is also published as `TabSnoozer-<version>-cws-assets.zip`.
- Do not finish without the artifacts existing on disk.
