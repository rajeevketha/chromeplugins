# Tab Snoozer — Chrome Web Store submit checklist (v1.8.2)

## 1. Upload package (required)

- [ ] Run `./build-store-zip.sh` from `tab-snoozer/`
- [ ] Upload **`TabSnoozer-1.8.2-store.zip`** from Files (manifest at zip root)
- [ ] Confirm version **1.8.2**
- [ ] Confirm permissions: tabs, storage, alarms, notifications, scripting
- [ ] Confirm host permissions: `http://*/*`, `https://*/*`

## 2. Store listing (required)

- [ ] Paste short + detailed description from `LISTING_COPY.txt`
- [ ] Category: **Productivity** · Language: **English (United States)**
- [ ] Privacy policy URL live in incognito:
  - `https://rajeevketha.github.io/chromeplugins/tab-snoozer/privacy.html`
- [ ] Icon: `icons/icon-128.png`
- [ ] Screenshots: `screenshots/*-1280x800.png`
- [ ] Optional promo: `promo/small-promo-440x280.png`, `promo/marquee-promo-1400x560.png`

## 3. Permissions & privacy (required)

- [ ] Paste from `PERMISSION_JUSTIFICATIONS.txt`
- [ ] Single purpose from `LISTING_COPY.txt`
- [ ] Privacy practices from `PRIVACY_QUESTIONNAIRE.txt`

## 4. Pre-flight smoke test

- [ ] Pin Tab Snoozer; open toolbar popup on an http(s) page
- [ ] Snooze with custom time and a preset; item appears under **Snoozed tabs**
- [ ] **Remove** and **Clear all** work
- [ ] Due reminder (1m): OS notification + toast; no new tab for extension UI
- [ ] Side tab does not overlap OrgKit / other edge tabs
- [ ] chrome:// pages cannot be snoozed

## 5. Submit

- [ ] Submit for review
