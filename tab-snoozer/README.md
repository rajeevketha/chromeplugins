# Tab Snoozer

Tiny Chrome extension: snooze a tab for later and get it back when you asked.

**Park a tab. Get it back later.**

## Features (v1.8.3)

- Presets: **1m / 15m / 30m / 1h / 2h / Tonight / Tomorrow**
- **Custom hours + minutes** timer
- Full **Snoozed tabs** list — Open, Remove, Clear all
- Settings: auto-open when due, page side tab on/off
- On-page **Snooze** side tab (with custom timer)
- Side tab **avoids overlapping** other right-edge extension tabs (scans, shifts, rechecks)
- Due reminder: OS notification + on-page toast
- Shortcuts: **Alt+Shift+Z** (popup), **Alt+Shift+S** (15m)

## Install (unpacked)

1. Chrome → `chrome://extensions`
2. Remove any older Tab Snoozer build
3. Enable **Developer mode** → **Load unpacked** → this folder
4. Pin the icon and use it on a normal http(s) page

## Chrome Web Store

```bash
./build-store-zip.sh
```

Publishes to Files:

- `TabSnoozer-1.8.3-store.zip` — upload package (manifest at root)
- `TabSnoozer-1.8.3-cws-assets.zip` — listing copy, screenshots, promo

Follow [`store/submission/SUBMIT_CHECKLIST.md`](store/submission/SUBMIT_CHECKLIST.md).

## Notes

- Local only — no accounts, sync, or tracking
- Only `http://` / `https://` pages can be snoozed
- Allow Chrome notifications so due reminders are visible
- Privacy: [`privacy.html`](privacy.html)

## License

MIT
