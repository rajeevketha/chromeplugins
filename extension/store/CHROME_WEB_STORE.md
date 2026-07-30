# Chrome Web Store — OrgKit

**Full submission pack (copy, screenshots, promo, checklist):**  
[`extension/store/submission/`](./submission/)

**Upload package:**

```bash
cd extension && zip -r ../OrgKit-1.6.9-store.zip . \
  -x '*.DS_Store' -x 'store/submission/screenshots/*' -x 'store/submission/promo/*'
```

Or use the prebuilt `OrgKit-1.6.9-store.zip` in agent Files / `OrgKit-CWS-1.6.9/`.

Privacy policy source: [`../privacy.html`](../privacy.html)  
Packaged hostable copy: [`submission/privacy.html`](./submission/privacy.html)

Start with [`submission/SUBMIT_CHECKLIST.md`](./submission/SUBMIT_CHECKLIST.md).

## Current submission snapshot (1.6.9)

- MV3; required permissions: `cookies`, `storage`
- Salesforce host permissions only; OpenAI optional
- No `tabs` / `activeTab` / `scripting`
- Custom objects searchable in Describe / SOQL / Permissions
- Deploy Readiness feature removed
