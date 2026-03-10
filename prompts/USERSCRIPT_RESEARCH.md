Plan: Summarize permissions/APIs, background behavior, UI/storage/network usage, then list extension-only APIs and map implementable features to a Tampermonkey/Greasemonkey userscript. Produce concrete migration suggestions and a clear verdict.

Manifests & Permissions
- Chrome MV3 manifest: `manifest.json` — permissions: `tabs`, `storage`, `declarativeNetRequest`, `declarativeNetRequestFeedback`; host_permissions: `<all_urls>`; background: `background.js` (service worker).
- Firefox MV2 manifest: `manifest_firefox.json` — permissions: `tabs`, `storage`, `<all_urls>`, `webRequest`, `webRequestBlocking`; background scripts: `utils.js`, `background_firefox.js`.

Background scripts & core control flow
- Chrome service worker: `background.js`
  - Loads state from `chrome.storage.sync` via `SyncStorage`.
  - Responds to `fetch_google_accounts` messages by fetching `https://accounts.google.com/ListAccounts?...` and parsing the JSON.
  - Uses `chrome.declarativeNetRequest.getDynamicRules()` and `updateDynamicRules()` to install redirect rules that add/replace `authuser` query param for many Google service domains.
  - Tracks per-tab/per-service navigation state, listens to `chrome.storage.onChanged` to update rules when settings change.
- Firefox background: `background_firefox.js`
  - Uses `chrome.webRequest.onBeforeRequest` with `blocking` to perform redirects and `chrome.tabs.update` to update tabs.
  - Also fetches `ListAccounts` when requested.
- Rules/UI helpers: `rules.js` contains `SyncStorage`, `convertToRedirectUrl`, `isGoogleServiceUrl`, and service lists.

Popup / UI
- `popup.html` + `styles.css` render the popup; scripts `utils.js`, `accounts.js`, `rules.js` build UI.
- Popup calls `chrome.runtime.sendMessage('fetch_google_accounts')` to ask background for accounts and uses `SyncStorage.store` to set `defaultAccount`.
- Popup invokes `chrome.tabs.query` + `chrome.tabs.update` to redirect the current tab after changing settings.

Network calls & storage
- Network: background fetch to `https://accounts.google.com/ListAccounts?...` (allowed in extension background, bypasses page CORS).
- Storage: `chrome.storage.sync` for `accounts`, `defaultAccount`, `rules` with `chrome.storage.onChanged` listeners.

Extension-only APIs used (cannot be used directly in a userscript)
- `chrome.declarativeNetRequest` (DNR): getDynamicRules(), updateDynamicRules() — used for global network-layer redirects (MV3). Cannot be replicated in userscript.
- `chrome.webRequest` with `blocking` (Firefox): onBeforeRequest(...) returning `redirectUrl` — extension-only.
- Browser-wide tab APIs: `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, `chrome.tabs.update`, `chrome.tabs.query` — userscripts cannot listen to global tab lifecycle or update arbitrary tabs.
- `chrome.storage.sync` cross-device sync — not available in userscripts; local alternatives exist but won't sync across devices.
- Extension-level keyboard shortcuts from `manifest`.

Code paths that strictly require extension privileges
- Network-layer, pre-request redirecting of all Google navigations (no page flash) — requires DNR or webRequest blocking.
- Centralized background tab coordination, opener-based tab redirects, and updating arbitrary tabs from background.

Features that can be reproduced in a userscript (Tampermonkey/Greasemonkey)
- UI and settings: recreate the popup as an in-page overlay or a settings page; port `popup.html`, `accounts.js`, `rules.js`, and `styles.css` into a standalone page or injected UI.
- Account fetching: run `ListAccounts` fetch via `GM_xmlhttpRequest` to avoid CORS and reuse parsing logic.
- Storage: replace `chrome.storage.sync` with `GM_setValue`/`GM_getValue` and `GM_addValueChangeListener` for cross-tab notifications.
- Content-level redirects: a userscript running `@run-at document-start` on Google domains can inspect `location.href`, compute a corrected URL with `authuser`, and `location.replace(newUrl)` to redirect immediately (best-effort).
- Per-tab skip/cooldown heuristics: use `sessionStorage` and timestamps to emulate the extension’s cooldown/skip logic.
- Cross-page propagation of default-account changes: use `GM_addValueChangeListener('defaultAccount', ...)` to let open pages react and self-redirect.
- Keyboard shortcuts: can be simulated per-page with `keydown` listeners (not global).

Limitations & differences vs extension
- Cannot reproduce invisible, network-layer pre-request redirects — userscript redirects happen in-page after the request, so users may see flashes or intermediate server redirects.
- Cannot intercept or modify requests that originate outside page context before the userscript runs.
- No cross-device `storage.sync` without building a custom sync backend.
- Userscript can't update other tabs centrally; each page must self-enforce on load or via GM value listeners.

Concrete migration suggestions (implementation sketch)
- Userscript metadata:
  - `@match` for Google hosts (use service list from `rules.js`), `@run-at document-start`, `@grant GM_setValue GM_getValue GM_addValueChangeListener GM_xmlhttpRequest GM_registerMenuCommand`.
- Storage wrapper:
  - Implement `SyncStorage` replacement using `GM_getValue`/`GM_setValue` and `GM_addValueChangeListener`.
- Account fetch:
  - Implement `fetchAccounts()` using `GM_xmlhttpRequest` to GET the ListAccounts URL and reuse the decoding/parsing logic.
- Redirect logic (content script):
  - On `document-start`, run `convertToRedirectUrl(location.href, GM_getValue('defaultAccount', 0))`. If a redirect URL is returned, call `location.replace(newUrl)`.
  - Implement skip logic via `sessionStorage` keys and `window.opener`/`document.referrer`.
- UI:
  - Provide `GM_registerMenuCommand` to open a settings overlay or open a new tab with the ported `popup.html` UI (adapted to run as a standalone page), and use `GM_setValue` to store settings.
- CORS fetch for accounts:
  - Use `GM_xmlhttpRequest` then `GM_setValue('accounts', parsedAccounts)`; UI pages use `GM_getValue` or `GM_addValueChangeListener` to update.

Bottom line
- A userscript can implement the majority of user-visible features: account fetching, default-account storage, per-page redirect to include `authuser`, a settings UI, and cross-tab notifications using GM APIs.
- However, the extension’s reliable, invisible global redirecting and centralized tab coordination (via `declarativeNetRequest` or `webRequest` + `blocking`) cannot be fully reproduced in a userscript. Expect a best-effort userscript port to be less robust and occasionally show visible redirects or race conditions.

Next steps
- If you want a runnable prototype, I can scaffold a Tampermonkey userscript with:
  1) `@run-at document-start` redirect logic for Google services,
  2) a `GM_*` storage wrapper and account fetch using `GM_xmlhttpRequest`, and
  3) a simple settings UI opened via `GM_registerMenuCommand`.
- Or I can produce a minimal redirect-only userscript so you can test behavior quickly.

References: key files to inspect/port
- Network & DNR logic: `background.js`
- Firefox blocking logic: `background_firefox.js`
- UI & settings: `popup.html`, `accounts.js`, `rules.js`, `styles.css`
- Storage/helpers: `rules.js` (contains `SyncStorage` and helper functions)

---

End of plan file (no frontmatter).