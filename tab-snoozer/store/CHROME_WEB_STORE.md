# Tab Snoozer — Chrome Web Store pack

Version: **1.8.3**

## Upload package

```bash
./build-store-zip.sh
```

Publishes to:

1. **GitHub (reliable download):** `tab-snoozer/releases/TabSnoozer-1.8.3-store.zip`
2. **Cursor Files attempt:** `/opt/cursor/artifacts/` (`.zip` download in Files UI is often broken)

| File | Use |
|---|---|
| `TabSnoozer-1.8.3-store.zip` | **Package** upload (manifest at zip root) |
| `TabSnoozer-store.zip` / `TabSnoozer-store-package.zip` | Stable aliases of the same build |
| `TabSnoozer-1.8.3-cws-assets.zip` | Listing copy, screenshots, promo, justifications |

## Listing materials

See [`submission/`](submission/):

- `LISTING_COPY.txt`
- `PERMISSION_JUSTIFICATIONS.txt`
- `PRIVACY_QUESTIONNAIRE.txt`
- `SUBMIT_CHECKLIST.md`
- `screenshots/*-1280x800.png`
- `promo/*`
- `icons/icon-128.png`

## Privacy policy URL

After GitHub Pages is enabled for this repo (or under chromeplugins):

- `https://rajeevketha.github.io/chromeplugins/tab-snoozer/privacy.html`
- or `https://rajeevketha.github.io/tabsnoozer/privacy.html` if published from a dedicated repo
