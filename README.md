# OrgKit

Chrome extension for Salesforce developers — day-to-day org tools (SOQL, Apex, schema, flows, deploy) plus Setup utilities.

**Chrome Web Store readiness:** see [`extension/store/CHROME_WEB_STORE.md`](extension/store/CHROME_WEB_STORE.md) and [`extension/privacy.html`](extension/privacy.html).

## Features

### Schema & metadata
1. **Describe Browser** — Object/field describe, copy API names, picklists, **dependent picklist explorer**
2. **Metadata Quick Open** — Search Apex/LWC/Aura/Flow/Objects/Profiles/Perm Sets and open in Setup
3. **Package.xml Builder** — Multi-select metadata members → `package.xml`
4. **Inactive Flow Cleaner** — Delete Draft/Obsolete/InvalidDraft versions (Active never deleted)

### Query & records
5. **SOQL / Tooling runner** — Field autocomplete, saved library, Excel/Sheets export
6. **Open / All data** — Open Lightning record; view all fields; update/delete with confirmation
7. **NL → SOQL** — Offline rules (+ optional AI); matches custom objects from org describe

### Developer assistants
8. Flow analyzer, governor heuristics, error decoder, debug log analyzer
9. Formula builder, deploy checklist, permission investigator, Apex review
10. Anonymous Apex + latest debug pull, Setup links, ID tools, favorites

## Install (unpacked)

1. Chrome → `chrome://extensions` → Developer mode
2. **Load unpacked** → `extension/` folder (or unzip `OrgKit-1.6.0.zip`)
3. Open a **logged-in** Salesforce tab
4. Allow Site access for Salesforce domains (or On all sites)
5. Click the OrgKit icon / Alt+Shift+O / on-page **OrgKit** tab

## Optional AI

Settings → enable AI → your OpenAI-compatible API key. Offline engines work without AI. Prompts never include Salesforce `sid`.

## Privacy & security

- Session cookie used only in-browser for Salesforce API calls you trigger
- Cookie reads limited to Salesforce-related domains
- No OrgKit backend; no sid in sync storage
- Full policy: [extension/privacy.html](extension/privacy.html)
- Store permission justifications: [extension/store/CHROME_WEB_STORE.md](extension/store/CHROME_WEB_STORE.md)

## Project layout

```
extension/
  manifest.json
  privacy.html
  store/CHROME_WEB_STORE.md
  background/  popup/  content/  options/  lib/  icons/
```

## License

MIT
