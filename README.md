# OrgKit

Chrome extension for Salesforce developers — day-to-day org tools (SOQL, Apex, schema, flows, deploy) plus Setup utilities.

## Features

### Schema & metadata
1. **Describe Browser** — Object/field describe, copy API names, picklists, **dependent picklist explorer** (pick controlling value → see controlled values)
2. **Metadata Quick Open** — Search Apex/LWC/Aura/Flow/Objects/Profiles/Perm Sets and open in Setup
3. **Package.xml Builder** — Multi-select metadata members and generate deployable `package.xml`
4. **Inactive Flow Cleaner** — List/delete Draft/Obsolete/InvalidDraft flow versions that block field deletion (Active never deleted)

### Developer assistants
5. **AI Natural Language SOQL Generator** — Plain English → SOQL (offline rules + optional AI)
5. **Smart Flow Analyzer** — Load org flows / paste metadata; flag DML-in-loop & missing fault paths
6. **Governor Limit Predictor** — Heuristic SOQL/DML/CPU risk from Apex
7. **Error Decoder** — Catalog of common Salesforce exceptions + optional AI explain
8. **Debug Log Analyzer** — Limits, exceptions, SOQL/DML from pasted logs
9. **Formula Builder AI** — NL → formula (templates + optional AI)
10. **Deployment Readiness Checker** — Security checklist + coverage / deploy signals
11. **Permission Investigator** — User CRUD / assignments / sensitive FLS for an object
12. **Apex Review Assistant** — Static scan for sharing, CRUD/FLS, injection, bulkification (+ optional AI)

Also includes Setup quick links, SOQL runner, record ID tools, favorites, org badge, and floating toolbar.

## Install (unpacked)

1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Pin **OrgKit** to the toolbar
5. Set **Site access** → **On all sites** (needed for SOQL/API calls)
6. Open a Salesforce tab, then click the OrgKit icon (or press **Alt+Shift+O**, or the blue **OrgKit** button on the floating toolbar)

OrgKit opens in a **full browser tab** (not a small popup).
4. Open a logged-in Salesforce tab → click the extension icon

## Optional AI

Open extension **Settings**:

- Enable AI assist
- Paste an OpenAI-compatible API key
- Optionally set base URL / model

Offline engines work without AI. Prompts never include your Salesforce `sid`.

## Security notes

- Session cookie stays in the browser; used only for Salesforce REST/Tooling calls you trigger
- Object API names validated before describe calls
- Permission / SOQL helpers use bind-style templates (fixed queries with escaped literals)
- Follow project skill `salesforce-standards-security` for any new Apex/API work

## Project layout

```
extension/
  manifest.json
  background/           # Session + REST/Tooling
  popup/                # Feature hub UI
  content/              # Badge + toolbar
  options/              # Settings + AI key
  lib/                  # Feature engines
  icons/
.cursor/skills/         # Agent skills (idea-driven build, SF standards)
```

## License

MIT
