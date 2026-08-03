# OrgKit — Chrome Web Store submit checklist (v1.7.1)

Use this pack end-to-end. Mirrored in Files as `OrgKit-CWS-1.7.1/`.

## 1. Upload package (required)

- [ ] Upload **`OrgKit-1.7.1-store.zip`** (manifest at zip root)
- [ ] Confirm version **1.7.1**
- [ ] Confirm permissions: **cookies** + **storage** only (+ Salesforce hosts; OpenAI optional)
- [ ] Confirm UI entry is `app/index.html` (not popup/popup.html)

## 2. Store listing (required)

- [ ] Paste short + detailed description from `LISTING_COPY.txt`
- [ ] Category: **Productivity** · Language: **English (United States)**
- [ ] Privacy policy URL: `https://rajeevketha.github.io/chromeplugins/extension/privacy.html`
- [ ] Icon: `icons/icon-128.png`
- [ ] Screenshots: `screenshots/*-1280x800.png`
- [ ] Optional promo: `promo/small-promo-440x280.png`, `promo/marquee-promo-1400x560.png`

## 3. Permissions (required)

- [ ] Paste from `PERMISSION_JUSTIFICATIONS.txt` (cookies, storage, hosts, optional OpenAI)
- [ ] Single purpose from `LISTING_COPY.txt`
- [ ] Privacy practices from `PRIVACY_QUESTIONNAIRE.txt`

## 4. Pre-flight

- [ ] Privacy URL opens in incognito
- [ ] Load store zip / runtime zip → Session connected on Salesforce tab
- [ ] SOQL on custom object; Describe search by label/API; Hide/Show launcher
- [ ] Opens as `chrome-extension://…/app/index.html`
- [ ] Submit for review
