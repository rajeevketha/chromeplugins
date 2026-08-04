# Chrome Web Store — what actually causes rejection

Chrome does **not** reject extensions for looking modern, dark, or “AI-styled.”
Rejection risk is almost always policy / permission / privacy / deception.

## Already covered for Tab Snoozer 1.8.3

| Risk | Our mitigation |
|---|---|
| Unclear single purpose | Listing single-purpose statement: snooze tabs + remind later |
| Over-broad / unjustified permissions | Justifications for tabs, storage, alarms, notifications, scripting, http(s) hosts |
| Undisclosed data use | Local-only privacy policy; no backend / analytics |
| Remote code | None — all code in the store zip |
| Misleading function | Reminder-first by default; auto-open is optional and labeled |
| Host permission too broad | Needed for on-page side tab + toast; explained in justifications |

## Before you click Submit

1. Privacy URL must open in an **incognito** window (enable GitHub Pages first).
2. Paste permission justifications **verbatim** from `PERMISSION_JUSTIFICATIONS.txt`.
3. Screenshots must match the real UI (use `screenshots/*-1280x800.png` or fresh captures).
4. Do not claim “AI”, sync, cloud backup, or account features this build does not have.
5. Smoke-test the uploaded zip once after packaging.

## Optional hardening (only if review asks)

- If reviewers push on broad `http://*/*` / `https://*/*`, reply with the side-tab / toast justification; do not silently remove host access without replacing that UX.
- Keep the store zip free of `store/` docs, source maps, and unrelated files (the build script already does this).
