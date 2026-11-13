# Completed career event archives and save recovery verification (V01-018, V01-019)

## Summary of changes

### V01-018 — Completed career event archives and replay
- **Contracts & JSON Schemas (`packages/contracts/src/season-persistence.ts`)**: Added `CompletedCareerMatchEventArchiveCoreSchema`, `CompletedCareerMatchEventArchiveSchema` (`LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1`), and `SeasonPortableManifestV3Schema` (`LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES`), bounding per-fixture event archives to 1 MiB (`MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES`) and per-season event archive sets to 16 MiB (`MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES`).
- **Deterministic archive sealing & replay (`packages/simulation/src/career-replay.ts`)**: Added `createCompletedCareerMatchEventArchive` and `replayCareerMatchEventArchive`. Replay reconstructs the full `T20Session` and scorecard strictly via `replayT20Events` over the sealed event chain without drawing any new random outcomes, verifying scorecard SHA-256 and final event hash equivalence.
- **Durable storage & portable `.lcxxvi` V3 round-trip (`packages/persistence/src/season.ts`, `packages/persistence/src/archive.ts`)**: Stored validated event archives in the IndexedDB `projections` store under scope `CAREER_MATCH_EVENTS_V1` within the same atomic repository commit as the season state, copied them on manual career copies and checkpoint recoveries, and exported/imported them as `match-events.ndjson` in `LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES`. Earlier v1/v2 careers without stored event logs load unchanged without silent migration and report `UNAVAILABLE` explicitly; damaged per-fixture event logs report `DAMAGED` without invalidating career standings or scorecards.
- **Live `USER_MATCH` & off-screen integration (`apps/web/src/match/controller.ts`, `apps/web/src/match/managed-result.ts`, `apps/web/src/career/service.ts`)**: Both simulated off-screen fixtures and completed live/regenerated `USER_MATCH` sessions seal canonical `LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1` records.
- **Management UI replay viewer (`apps/web/src/career/CareerApp.tsx`)**: Added `View replay` actions on completed fixtures in `Career` and `Fixtures`, rendering innings switchers, delivery-by-delivery ledger rows, archive metadata, keyboard focus restoration on close, and explicit banners for legacy unavailable or damaged fixture archives.

### V01-019 — Career save and recovery usability
- **Checkpoint generation inspection & selective recovery (`packages/contracts/src/season-persistence.ts`, `packages/persistence/src/season.ts`, `apps/web/src/career/service.ts`)**: Added `SeasonCheckpointGenerationOptionSchema`, `SeasonCheckpointInspectionSchema`, `inspectCheckpoints`, and `recoverCheckpointGeneration`. Corrupted checkpoint generations are detected and listed explicitly while the damaged original save slot and its corrupted rows remain untouched in IndexedDB; players can recover any validated older generation (`G0`–`G2`) into a new named career slot.
- **Plain-English persistence error descriptions (`describeSeasonPersistenceError`)**: Added structured `{ code, summary, guidance }` error descriptions for read-only writer leases, corrupted checkpoints, stale/locked copy sources, portable `.lcxxvi` verification failures, and match event archive bounds/integrity errors.
- **Accessible recovery UI (`apps/web/src/career/CareerApp.tsx`, `apps/web/src/career/career.css`)**: Added keyboard-accessible `Checkpoints` / `Inspect checkpoints` panels on both the career start selector and `Settings`, alongside keyboard-accessible manual career copies, `.lcxxvi` export, and `.lcxxvi` import with zero horizontal overflow at `1366x768`.

## Local verification (2026-11-13, Linux container)

- `npm run schemas:check && npm run build && npm run typecheck && npm run lint && npm run fixtures:audit && npm run fixtures:engine && npm run vectors:check && npm run probability:check && npm run generator:check`: **PASS** (193 JSON Schemas verified, TypeScript build + tools typecheck clean, ESLint + 7 package boundary checks clean, 45 scorer fixtures + 24 random-address / 8 state-hash / 15 probability / 9 generator vectors verified).
- `npm test` (`vitest run`): **PASS** — **711 passed** across **58 test files** (including `tests/unit/v01-career-event-archive-recovery.test.ts`, `tests/unit/contracts.test.ts`, `tests/unit/scoring-fixtures.test.ts`, `tests/unit/season-persistence.test.ts`, and `tests/unit/managed-binding.test.ts`).
- `npx playwright test --config=playwright.ui.config.ts --project=chromium tests/ui/career-replay-and-recovery.spec.ts tests/ui/career-copy.spec.ts`: **PASS** — **8 passed** (Chromium).
- `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts --project=firefox tests/ui/career-replay-and-recovery.spec.ts`: **PASS** — **2 passed** (Firefox).
- `npx playwright test --config playwright.m6g.config.ts --project=chromium`: **PASS** — **13 passed** (including `tests/m6g/career-event-archive-recovery.spec.ts` and `tests/m6g/management.spec.ts` completing all 14 rounds / 56 fixtures and round-tripping the V3 `.lcxxvi` archive).
- `npm run smoke` (`playwright test`): **PASS** — **23 passed** across Chromium and Firefox.

## Not run / external gates

- Hosted GitHub Actions Linux and Windows suites: **NOT RUN** (local workspace verification only).
- Owner Windows PC / reference-hardware acceptance: **NOT RUN**.
- `docs/V01_BACKLOG.json` statuses for `V01-018` and `V01-019` remain `PLANNED` until owner review per `docs/AI_CONTINUATION.md`.
