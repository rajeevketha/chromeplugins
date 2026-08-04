---
name: publish-tabsnoozer-zip
description: Build Tab Snoozer Chrome Web Store zip into Cursor Files and commit it under tab-snoozer/releases for a working GitHub download. Use whenever tab-snoozer changes, or when the user asks for the zip, store package, or Files download.
---

# Publish Tab Snoozer zip

## Why this skill exists

Cursor Files uploads `.zip` artifacts, but the Files UI often does **not** give a working download for non-previewable files. Users need a GitHub path.

## Steps

1. Run:

```bash
./tab-snoozer/build-store-zip.sh
```

2. Confirm artifacts:

```bash
ls -la /opt/cursor/artifacts/TabSnoozer-*-store.zip \
  /opt/cursor/artifacts/TabSnoozer-store-package.zip \
  tab-snoozer/releases/TabSnoozer-*-store.zip
```

3. Force-add releases if needed, then commit + push:

```bash
git add -f tab-snoozer/releases/*.zip tab-snoozer/releases/README.md
git commit -m "Publish Tab Snoozer store zip to releases/"
git push -u origin HEAD
```

4. Tell the user the **GitHub download** URL:

`https://github.com/rajeevketha/chromeplugins/raw/<branch>/tab-snoozer/releases/TabSnoozer-<version>-store.zip`

Do not promise that a markdown `/opt/cursor/artifacts/...` link will download.
