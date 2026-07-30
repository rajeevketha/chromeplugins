# Chrome Web Store — OrgKit submission pack

Use this when filling the Developer Dashboard. Keep answers short and consistent with the privacy policy (`extension/privacy.html`).

## Single purpose

**OrgKit helps Salesforce developers work in their open org:** run SOQL/Tooling queries, inspect schema/metadata, review Apex/flows, and open records — using the browser Salesforce session already available in a logged-in tab.

## Short description (≤132 characters)

```
Salesforce developer toolkit: SOQL, schema, Apex, flows. Uses your open org tab session in-browser only.
```

## Detailed description (paste into Store)

```
OrgKit is a productivity toolkit for Salesforce developers and admins.

What it does
• SOQL / Tooling runner with field autocomplete and saved query library
• Open query results in Lightning; Show all data to view fields; update/delete with confirmation
• Describe browser, metadata quick open, package.xml builder
• Inactive flow version cleaner (Active versions are never deleted)
• NL→SOQL (works offline; optional AI if you add your own API key)
• Apex review, governor heuristics, error/log helpers, deploy checklist

How authentication works
OrgKit does not ask you to type a password into the extension. It uses the Salesforce session cookie from a Salesforce tab you already logged into in Chrome, only to call Salesforce APIs for actions you start. The session stays in your browser.

Privacy
• No OrgKit backend collecting org data
• Session id is not written to sync storage and is not sent to AI providers
• Optional AI sends only the text you paste, to the endpoint you configure
• Full policy: open extension Settings → Privacy Policy (also privacy.html in the package)

Permissions (summary)
• cookies — Salesforce sid on Salesforce domains only
• tabs / activeTab — detect the active Salesforce org tab
• scripting — fallback when Chrome blocks extension network fetch to Salesforce
• storage — settings, favorites, saved SOQL (no sid)
• Host permissions — Salesforce domains only; OpenAI hosts are optional
```

## Permission justifications (Dashboard fields)

### cookies
Required to read the Salesforce `sid` cookie on Salesforce-related domains so OrgKit can call Salesforce REST/Tooling APIs using the user’s existing logged-in browser session. OrgKit does not read cookies from non-Salesforce sites.

### tabs
Required to identify the active Salesforce tab and open OrgKit / records in the correct org context.

### scripting
Required as a fallback to execute Salesforce API requests from an open Salesforce tab when Chrome site-access rules block the extension service worker fetch. Used only for Salesforce hosts.

### storage
Required to store user settings, favorites, saved SOQL library entries, and optional AI configuration locally. Session cookies are not stored in sync storage.

### activeTab
Used for user-initiated interaction with the current tab when opening OrgKit features.

### Host permissions (`*.salesforce.com`, `*.force.com`, …)
Required to call Salesforce APIs and to show the on-page OrgKit launcher on Salesforce pages. Not used for unrelated websites.

### Optional: `api.openai.com` / `*.openai.com`
Only if the user enables AI assist and grants permission. Used solely for optional NL/formula/error/Apex assistance with the user’s own API key.

## Privacy practice answers (typical CWS questionnaire)

| Question | Answer |
|---|---|
| Collects user data? | Yes — limited: settings/saved queries locally; Salesforce API responses shown in UI; optional AI prompt text if enabled |
| Sells data? | No |
| Uses data for purposes unrelated to core functionality? | No |
| Transfers data to third parties? | Only optional AI provider the user configures; Salesforce APIs the user triggers |
| Handles personal / sensitive data? | May display Salesforce CRM data the user queries; session cookie used in-browser only |
| Privacy policy URL | Host `privacy.html` (GitHub Pages / your site) or temporarily document path; Store requires a public URL |

## Pre-submit checklist

- [ ] Host `extension/privacy.html` at a public HTTPS URL and paste it into the Store listing
- [ ] Screenshots: home, SOQL runner, All data drawer, Describe, NL→SOQL (no real PII / prod secrets)
- [ ] Category: Productivity / Developer Tools
- [ ] Confirm destructive actions still require UI confirmation
- [ ] Test on a fresh profile: login SF → SOQL → Open / All data
- [ ] Remove any unpackaged debug builds; upload a clean zip of `extension/` (or OrgKit-1.6.0.zip)
- [ ] Account: verify publisher email; if new publisher expect 1–2 review rounds

## Zip for upload

Package only the extension root contents (manifest at zip root **or** a single `OrgKit/` folder — follow current CWS packaging guidance). Prefer:

```bash
cd extension && zip -r ../OrgKit-1.6.0-store.zip .
```

Do not include `.cursor/`, validation screenshots with customer data, or API keys.
