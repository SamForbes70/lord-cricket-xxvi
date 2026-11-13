# Offline Assets and Transaction-Safe Updates (V01-027)

Lord Cricket XXVI bundles a deterministic offline shell and transaction-aware update coordinator so an in-progress match or IndexedDB commit is never disrupted by an unsolicited reload or partial bundle swap.

## 1. Build-Generated Offline Asset Manifest and Service Worker

During `vite build --config apps/web/vite.config.ts`, the `lcxxvi-offline-assets` plugin writes two deterministic files into `apps/web/dist/`:

- `offline-manifest.json` (`LC_OFFLINE_ASSET_MANIFEST_V1`): records a SHA-256 `buildId` computed over all emitted HTML, CSS, JavaScript and Web Worker chunks, lists `supportedEngines` (`LC_T20_MATCH_V1`, `LC_ODI_MATCH_V1`, `LC_RED5_MATCH_V1`), names `recoveryBuildPath` (`/engineering.html`), and enumerates every precached path.
- `sw.js`: pre-caches `/`, `/index.html`, `/engineering.html`, `/offline-manifest.json`, and all `/assets/*` bundles inside versioned cache `lcxxvi-offline-<buildId>`.

## 2. Transaction-Deferred Update Policy

- `sw.js` **never** calls `self.skipWaiting()` automatically during `install`.
- `apps/web/src/offline-update.ts` (`offlineUpdateCoordinator`) tracks active match worker commands (`MatchApp` `busy` and bounded simulation batches) and career IndexedDB operations (`CareerApp` and `RosterCareerApp` `busy` states).
- When a newer Service Worker reaches `installed` while an existing controller is active, `RootApp` renders `SafeUpdateBanner` (`data-testid="safe-update-banner"`).
- While any match or save transaction is active (`activeTransactions > 0`), `Apply update safely` is disabled (`deferredByActiveTransaction: true`) and `applySafeUpdate()` returns `ACTIVE_TRANSACTION_BLOCKS_UPDATE`.
- Once all transactions settle (`activeTransactions === 0`), the player can click `Apply update safely`, which posts `{ type: "LCXXVI_APPLY_SAFE_UPDATE" }` to the waiting worker and reloads cleanly on `controllerchange`.

## 3. Retained Engine Assets and Recovery Build

- During `activate`, `sw.js` retains up to two cache generations (`MAX_RETAINED_ENGINE_CACHES = 2`) before pruning older caches, keeping current supported engine bundles intact.
- `/engineering.html` is precached in every generation as an explicit offline-accessible diagnostic and recovery build surface.
