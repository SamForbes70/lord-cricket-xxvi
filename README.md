# Lord Cricket XXVI | Pass 12F / M6F durable season state, recovery and archive

Pass 12F binds the existing management subsystems into one durable season aggregate without changing cricket match outcomes.

**Model status remains SYNTHETIC_ALPHA.** The frozen season remains deterministic regression evidence, not empirical calibration.

## Durable season state

`LC_T20_SEASON_STATE_V1` contains:

- the frozen 56-fixture schedule;
- V2 career condition, availability, training and readiness;
- `LC_T20_SEASON_PROJECTION_V1` table/player statistics;
- canonical match-completion records for every finished fixture;
- controlled team, aggregate revision and ACTIVE/COMPLETE phase;
- canonical SHA-256.

Validation rechecks the embedded schedule and career hashes and reconciles completed fixtures across career condition and projection ledgers. A season becomes COMPLETE only when all 56 fixtures reconcile and the projection cursor has no gaps.

## Persistence and recovery

`IndexedDbSeasonRepository` reuses the M4 database and stores. Season rows are additive `SEASON` records; inherited match saves remain readable and are excluded from season listings.

A commit requires the writer lease and durable revision, then writes the checkpoint, optional command receipt and season projection in one IndexedDB transaction. Three checkpoint generations rotate. Recovery selects the newest valid generation and leaves the corrupt generation untouched for diagnostics.

The current host blocks all browser navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so the new real-IndexedDB Playwright gate is retained but must be recorded BLOCKED here. Its production browser bundle builds successfully. Pure checkpoint/recovery and archive behaviour are independently executable in Node.

## Portable saves and final archive

A season `.lcxxvi` contains `manifest.json`, `game.json`, `events.ndjson` (canonical match completions) and `projection.json`. Complete seasons additionally carry `season-archive.json`.

`LC_T20_SEASON_ARCHIVE_V1` freezes champion, final table, leaders, all 56 completion keys and the final state hash. It cannot be produced from an incomplete season.

```sh
npm run season:persistence:fixtures
npm run season:persistence:rules
npm run verify:12f:core
```

Pass 12F deliberately does not add management screens or a second career year. The next bounded build is **Pass 12G / M6G: Management UI and Full-Season Acceptance**.
