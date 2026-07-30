# SF Dev Toolkit

Chrome extension for Salesforce developers — quick Setup navigation, org awareness, record ID tools, SOQL runner, and favorites.

## Features

- **Quick links** — Jump to Setup, Object Manager, Apex, Flows, Debug Logs, Permission Sets, Named Credentials, and more
- **Org banner** — Sandbox vs Production pill, host, user, and org id when a session is available
- **Floating toolbar** — On-page shortcuts (Setup, Objects, Logs, Flows, Users, Developer Console)
- **Environment badge** — Sandbox / Prod indicator at the top of Salesforce pages
- **SOQL runner** — Run queries against the active org using your browser session
- **Record ID tools** — Decode key prefix, convert 15 ↔ 18, open records, scan the page for IDs
- **ID selection tip** — Highlight a Salesforce ID on any page to open or copy it
- **Favorites** — Bookmark Setup pages and custom URLs (Chrome sync)

## Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension` folder in this repo
5. Open any Salesforce org tab and click the extension icon

## Usage tips

- Keep a logged-in Salesforce tab active for SOQL and user/org info
- Hide the floating toolbar from the toolbar ✕ button or extension Settings
- Use the **IDs** tab to paste a record Id, or **Scan page** to discover Ids in the current tab
- Save frequent Setup screens under **Favs**

## Project layout

```
extension/
  manifest.json          # MV3 manifest
  background/            # Service worker (session + REST/SOQL)
  popup/                 # Extension popup UI
  content/               # On-page badge, toolbar, ID tip
  options/               # Settings page
  lib/                   # Shared Salesforce helpers + quick links
  icons/                 # Extension icons
```

## Permissions

| Permission | Why |
|---|---|
| `cookies` | Read Salesforce `sid` for REST/SOQL |
| `storage` | Favorites and settings |
| `tabs` / `activeTab` / `scripting` | Detect org tab, navigate, scan page IDs |
| Host access to `*.salesforce.com`, `*.force.com`, etc. | Run on Salesforce pages and call APIs |

Session cookies stay in your browser; the extension does not send them to any third-party server.

## Roadmap ideas

- Object describe browser
- Trace flag helper
- Lightning Debug Mode toggle
- Multi-org favorites groups
- Dark/light theme sync with Salesforce

## License

MIT
