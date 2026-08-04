# Security

Tab Snoozer handles tab URLs and titles. Treat that as sensitive.

## Threat model (v1.8.1)

- Data stays on the device in `chrome.storage.local`
- No network backend, sync service, or telemetry
- Extension only acts on the tab the user chooses to snooze
- Restore only opens URLs that pass an http/https allowlist

## Hardening in place

- Allow only `http:` / `https:` for snooze and restore
- Reject `chrome:`, `chrome-extension:`, `file:`, `javascript:`, etc.
- Truncate stored titles
- Cap number of snoozed items
- Content script draws Tab Snoozer UI only (no page content reading)
- No remote code

## Reporting issues

Open a GitHub issue on this repository with steps to reproduce. Avoid posting private URLs in public issues.
