# Agent notes — chromeplugins

## Tab Snoozer packaging (required)

After any work on `tab-snoozer/`, always publish the Chrome Web Store zip to Files:

```bash
./tab-snoozer/build-store-zip.sh
```

Verify `/opt/cursor/artifacts/TabSnoozer-<version>-store.zip` exists before telling the user it is ready.

Project rule: `.cursor/rules/tabsnoozer-publish-zip.mdc`  
Skill: `.cursor/skills/publish-tabsnoozer-zip/SKILL.md`
