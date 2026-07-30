# OrgKit — Chrome Web Store submit checklist (v1.6.9)

Use this pack end-to-end. Everything you need is under `extension/store/submission/` and mirrored in Files as `OrgKit-CWS-1.6.9/`.

## 1. Upload package (required)

- [ ] Upload **`OrgKit-1.6.9-store.zip`** (manifest at zip root)
- [ ] Confirm version in Dashboard matches **1.6.9**
- [ ] Confirm permissions are only **cookies** + **storage** (+ Salesforce hosts; OpenAI optional)
- [ ] Do **not** upload workspace junk, `.cursor/`, or API keys

## 2. Store listing (required)

- [ ] Paste short + detailed description from `LISTING_COPY.txt`
- [ ] Category: **Productivity**
- [ ] Language: English (United States)
- [ ] Upload **store icon** `icons/icon-128.png` (128×128)
- [ ] Upload **screenshots** (prefer 1280×800 set):
  1. `screenshots/01-home-1280x800.png`
  2. `screenshots/02-nl-soql-1280x800.png`
  3. `screenshots/03-soql-runner-1280x800.png`
  4. `screenshots/04-describe-1280x800.png`
  5. `screenshots/06-onpage-launcher-1280x800.png`
  - Optional 6th: `screenshots/05-error-states-1280x800.png`
- [ ] Optional promo tiles:
  - Small: `promo/small-promo-440x280.png`
  - Marquee: `promo/marquee-promo-1400x560.png`

## 3. Privacy (required)

- [ ] Host `privacy.html` at a **public https://** URL
- [ ] Paste that URL into the listing + privacy questionnaire
- [ ] Fill questionnaire using `PRIVACY_QUESTIONNAIRE.txt`

## 4. Permissions (required)

- [ ] Paste justifications from `PERMISSION_JUSTIFICATIONS.txt` for:
  cookies, storage, host permissions, optional OpenAI hosts
- [ ] Single purpose from `LISTING_COPY.txt`
- [ ] Mention Inspector-aligned session model in reviewer notes if asked

## 5. Reviewer notes / proofs

- [ ] Attach or paste summary from `proofs/REVIEWER_NOTES.txt`
- [ ] Keep demo org screenshots sanitized (this pack uses fictional demo data)

## 6. Pre-flight test (do this before clicking Submit)

- [ ] Fresh Chrome profile → real Salesforce login on a sandbox/DE
- [ ] Open OrgKit → Session: connected
- [ ] Run SOQL on a custom object (`Something__c`) LIMIT 5
- [ ] Describe Browser → search custom object by label or API name
- [ ] NL→SOQL Tooling: “get all flows” → FlowDefinition
- [ ] Hide edge tab → **Show** restores it
- [ ] Settings → Privacy Policy opens
- [ ] Delete/Save paths still ask for confirmation
- [ ] Confirm Deploy Readiness is not present in the UI

## 7. Publisher account

- [ ] Verify publisher email
- [ ] Pay developer registration fee if not already
- [ ] Expect 1–2 review rounds for cookie/host permission extensions
