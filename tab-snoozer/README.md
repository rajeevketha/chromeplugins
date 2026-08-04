# Tab Snoozer

Tiny Chrome extension: snooze a tab for later and get it back when you asked.

## What it does

- Snooze the current tab for **1 hour**, **Tonight (8:00 PM)**, or **Tomorrow morning (9:00 AM)**
- On-page **Snooze** side tab on websites (hides / show toggle)
- Side tab scans the right edge for other fixed extension tabs, then moves to a free slot (and rechecks if another extension injects later)
- Tab closes and is saved locally
- At wake time: notification + tab reopens
- View, open early, or cancel from the popup
- Hotkey: `Alt+Shift+S` snoozes for 1 hour

## Install (unpacked)

1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `tab-snoozer/` folder
4. Pin the extension, open any normal webpage, click **Tab Snoozer**

## Notes

- Local only — no accounts, sync, or tracking
- Chrome internal pages (`chrome://...`) cannot be snoozed
- If Chrome was closed when a snooze was due, tabs restore on next startup

## Privacy

Tab titles/URLs for snoozed items are stored in `chrome.storage.local` on your machine only.
