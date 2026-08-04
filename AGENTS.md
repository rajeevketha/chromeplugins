# Agent notes — chromeplugins

## Tab Snoozer packaging (required)

After any work on `tab-snoozer/`, always:

```bash
./tab-snoozer/build-store-zip.sh
```

Then commit/push `tab-snoozer/releases/TabSnoozer-<version>-store.zip` and give the user a **GitHub download URL**.

Cursor Files (`/opt/cursor/artifacts`) is still written, but `.zip` downloads there are often missing/broken in the UI. Do not rely on markdown links to `/opt/cursor/artifacts/...`.

Project rule: `.cursor/rules/tabsnoozer-publish-zip.mdc`  
Skill: `.cursor/skills/publish-tabsnoozer-zip/SKILL.md`
