USERSCRIPT_SPEC
================

Summary
-------
- Implement a userscript that lets the user press Option (Alt) + {Num} on macOS to switch the active Google service tab to the given Google account by rewriting the URL to use `/u/{N-1}` (Option+1 → `/u/0`). The userscript only performs a rewrite when the shortcut is pressed; it does not maintain a default account or fetch the accounts list.

Key behavior (userscript)
-------------------------
- Keybinding: Option (Alt) + {1..9}
  - When pressed, the userscript rewrites the current tab URL to force the account index `targetIndex = N - 1` by inserting/replacing the `/u/{targetIndex}` path segment immediately after the host (Option+1 → `/u/0`).
  - If inserting `/u/{targetIndex}` is not appropriate for the service, fallback to adding/updating the `authuser` query parameter with the 0-based value (`authuser={targetIndex}`).
  - The userscript only acts when the shortcut is pressed; it does not run background redirects or consult extension storage. A resulting 404 or missing-account behavior is acceptable.

- Scope: Run on Google service domains (mail, drive, calendar, docs, photos, maps, translate, etc.) and google.com paths (maps, finance, travel, flights). It SHOULD also run on `accounts.google.com` and other account-management pages so the shortcut can be used during account switching flows.

- Preservation: Preserve the rest of the URL path and query parameters when switching accounts; only set or replace the `authuser` parameter or insert/replace the `/u/{targetIndex}` path segment appropriately.

- Fallback behavior: If the current URL already contains the expected `/u/{targetIndex}` or `?authuser={k}` that corresponds to the requested account, do nothing.

Indexing and account numbers
----------------------------
- The userscript maps Option+N to the 0-based account index: Option+1 → `/u/0`. When using `authuser` as a fallback, set `authuser={N-1}` (0-based).
- The userscript does not consult or use any extension `defaultAccount` value and does not fetch the accounts list; it performs a pure URL rewrite.

Implementation details extracted from this repo (how the extension handles account switching)
--------------------------------------------------------------------------------------
- URL conversion / comparison
  - `convertToRedirectUrl(originalUrl, defaultAccount)` (utils.js)
    - Returns a new URL with `authuser` set to `defaultAccount` (a numeric index) unless the URL already contains a matching `authuser` or `/u/{num}` path matching `defaultAccount`.
  - Note: the userscript will not call or depend on `convertToRedirectUrl`; it should implement a deterministic rewrite: insert/replace `/u/{N-1}` or set `authuser={N-1}`.

- Declarative Net Request (DNR) redirects
  - The extension uses `chrome.declarativeNetRequest` dynamic rules to add/replace the `authuser` parameter for a long list of Google service host patterns. (background.js)
  - The DNR rules addOrReplace the `authuser` query parameter set to the extension's `defaultAccount` value. The userscript will not use DNR and will only act on explicit shortcut presses.

- Tab/service tracking and protections
  - The background service worker keeps a `processedTabs` map tracking which Google service has been processed per tab and timestamps to avoid repeated redirects. (background.js)
  - There is a cooldown period (5 seconds) used to prevent immediate repeated redirects for the same service.

- Account switcher detection and suspend behavior
  - The extension detects account-switcher / account-management URLs via `isAccountSwitcherUrl(url)` (common patterns include `accounts.google.com`, `/accounts/`, `/accountchooser`, `/signin`, `/logout`, `/servicelogin`, `/listaccounts`) and temporarily suspends automatic redirects during switching flows. The userscript SHOULD still run on `accounts.google.com` pages but must not attempt to emulate suspension logic — it only rewrites when the shortcut is pressed.
  - Recent user interactions are recorded (`recordUserInteraction`) to help avoid interfering with intentional user actions; these interactions time out after 10 seconds.

- Manual user choices
  - If a user navigates to a URL that changes the `authuser` (or `/u/{num}`) away from the extension's stored value for that service, the extension respects this manual choice and updates its tracking for that service, skipping automatic redirect for that navigation.

- Command-based keyboard switching (extension behavior)
  - `chrome.commands.onCommand` listens for commands named like `switch_to_ga_X`. The extension derives an account index by parsing the last character of the command and subtracting 1 to get a 0-based account index, then calls `redirectCurrectTab(accNum)` to update the active tab. (background.js)
  - The userscript will implement the equivalent mapping for Option+N but will perform only a local URL rewrite and will not interact with extension storage or background commands.

- Accounts list retrieval
  - The extension fetches the logged-in Google accounts list by fetching `https://accounts.google.com/ListAccounts?gpsia=1&...` and decoding the server response to get account metadata. (background.js)
  - The userscript WILL NOT fetch the accounts list; it performs a blind URL rewrite and accepts 404s or missing-account results.

Userscript-specific notes and recommended behavior
-----------------------------------------------
- Mirror extension protections: The userscript should be conservative but because it only runs on explicit shortcut presses, it MAY be allowed on account-switcher pages:
  - The userscript SHOULD run on account-switcher URLs (accounts.google.com) so the user can press the shortcut there; it must not try to emulate the extension's temporary suspension logic automatically.
  - If desired, implement an optional short grace check using `document.referrer` to avoid immediate rewrites when a page is mid-switch, but this is not required.

- Prefer path-style account switching (`/u/{N-1}`) on services that support it (e.g., `https://mail.google.com/mail/u/1/#inbox` for Option+2). When inserting `/u/{N-1}` ensure the path is normalized (insert immediately after the host portion) and preserve the rest of the path and query string.

- Fallback to `authuser` param: For services or pages where `/u/{N-1}` is not applicable, fall back to adding or replacing the `authuser` query parameter; use the 0-based indexing described above.

- Safety: Implement a short debounce and check whether the current page already contains the correct `/u/{N-1}` or `authuser` value before doing `location.replace()` or `location.href = ...` to avoid redirect loops or flashing.

Example algorithm (high-level)
------------------------------
1. On Option+N pressed:
   - If current host is not a Google URL, return.
   - Compute target account index as `targetIndex = N - 1` (0-based).
   - Compute target path: insert or replace `/u/{targetIndex}` immediately after the hostname. If resulting URL equals current URL, do nothing.
   - If inserting `/u/{targetIndex}` is not appropriate for this service, set `authuser={targetIndex}` instead.
   - Perform `location.replace(targetUrl)` to avoid creating an extra history entry.

Files & functions referenced (for implementer)
--------------------------------------------
- utils.js
  - convertToRedirectUrl(originalUrl, defaultAccount)
  - isGoogleServiceUrl(url)
- background.js
  - initializeDeclarativeNetRequestRules / updateDeclarativeNetRequestRules
  - processedTabs, temporarilySkipRedirects, shouldTemporarilySkipRedirects
  - isAccountSwitcherUrl(url)
  - chrome.commands.onCommand listener (switch_to_ga_X -> redirectCurrectTab)

Open questions / decisions for implementer
----------------------------------------
- Decide how many number slots to support (1..9 recommended). -> Support Option+1 through Option+9 for accounts 0 through 8.

Done
----
This spec captures the requested Option+Number behavior and summarizes how the extension already handles account switching flows and protections. Implement the userscript to follow the protections (account-switcher detection, temporary suspension) described above to avoid interfering with Google account-switch flows.
