# Offline app architecture

The production app can reopen offline after preparing its static assets. Session recovery remains a separate, optional IndexedDB feature. The [user guide](../README.md#offline-use-and-installation) describes installation, update notices and backup behavior.

## Build and scope

After Vite finishes, [build-offline.ts](../scripts/build-offline.ts) reads the complete `dist/` tree and generates `sw.js` from [offline-worker.js](../scripts/offline-worker.js). Each asset has a SHA-256 integrity value. The release identifier hashes both the asset manifest and worker source. The editor Worker, bundled sample (including an inlined sample), translations, manifest, icons and license notice are covered. The service worker itself is excluded from its precache.

[pwa.ts](../src/pwa.ts) registers the service worker only for production builds in a secure context, relative to the current app directory, with `updateViaCache: 'none'`. All manifest URLs and the service worker's asset URLs are relative. Each cache name includes the registration's full scope and release identifier, isolating separate deployments on the same origin. The app caches only allowlisted GET requests. Navigation to the scope root or its `index.html` uses the cached entry point, ignoring query parameters for cache lookup; the page retains its actual URL, including `lang`. Unknown paths, non-GET requests and other origins are not intercepted. Imported save and CSV contents never enter Cache Storage.

`Cache.addAll` prepares the asset batch with integrity-checked requests that bypass the HTTP cache. A failed first install removes its incomplete cache; a failed update leaves the active cache alone. A mismatched deployment is not marked ready. Runtime cache misses can fetch and verify the expected asset; if storage is denied or the expected release is unavailable, the request can still use the network without caching an unverified response.

## Readiness, recovery and installation

The app asks the active service worker whether every expected asset is still cached before reporting readiness. Visibility changes and reconnecting recheck readiness and updates. The UI offers a retry that refills the cache; missing browser storage or a failed registration leaves ordinary online editing available. Readiness describes the current browser cache, not a guarantee against later browser eviction or manual deletion.

[OfflineApp.tsx](../src/OfflineApp.tsx) provides localized readiness, installation guidance and update notices without adding a second recovery status. `beforeinstallprompt` is retained only in memory and used in a user-initiated install action; rejection/dismissal does not change an open save. Browsers without that event use their own menus. The [manifest](../public/manifest.webmanifest) uses a relative app ID, scope and start URL, with standalone display and 192/512-pixel maskable icons derived from [app.svg](../public/icons/app.svg). Installed launches use browser language detection; language-specific bookmarks keep their URL parameter. There is no stored language setting.

Enabling recovery remains the only way to persist user files and applied work. Installing the app does not enable it; disabling recovery deletes the session but does not remove the offline app cache. Unapplied dialog input is never saved. Browser profile/OS behavior can affect storage sharing between a browser tab and an installed app; automatic tests establish behavior in Chromium, not all installation environments.

## Updates and validation

A new worker installs into its own verified cache and waits while the old worker controls any app window. The UI announces that update and asks users to apply pending inputs, save/download work, and close all app windows before reopening. There is no `skipWaiting`, navigation request, or automatic reload. This preserves live edits and dialogs across multiple tabs and avoids mixing editor versions through a forced activation. On normal activation, only obsolete caches with the exact same scope prefix are deleted; unrelated caches and IndexedDB recovery are untouched.

[Browser tests](../tests/e2e/offline.spec.ts) serve real versioned responses instead of mocking service worker requests. They cover root/subpath entry points, language query strings, offline reopening with CSV and exact 64-bit edits, disabled recovery, manifest/icon validity and Chromium installability, a fresh browser process, multi-tab update waiting, separate cache scopes, failed/mismatched installs, cache repair, registration/property denial and localized mobile installation events. Native installation menus and device home-screen behavior are not exercised by headless automation.

The lifecycle follows MDN's [service worker installation and update guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). Browser installation behavior and limits are described in [Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and the [`beforeinstallprompt` event reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
