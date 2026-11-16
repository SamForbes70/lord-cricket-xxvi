# Stage 9 Verification Report — Historical Statistics and Leaderboards (`S09-01`)

- **Date**: 2026-11-16
- **Base Revision**: `d02e899` (`main` — Stages 2, 3, 4, 5, 6, 7 & 8 merged and owner-accepted)
- **Branch**: `feat/stage9-historical-stats-leaderboards`
- **Slice ID**: `S09-01`
- **Status**: `accepted` (owner-accepted 16 November 2026; merged to `main`)

---

## 1. Scope Delivered

1. **Contracts (`packages/contracts/src/historical-stats.ts`, `+16` strict JSON Schemas; `325` total)**:
   - `HISTORICAL_STATS_PROJECTION_VERSION = "LC_HISTORICAL_STATISTICS_PROJECTION_V1"`.
   - `HistoricalSourceClassSchema` (`CAREER`), `HistoricalSeasonScopeSchema` (`"ALL" | "ACTIVE" | seasonNumber`), `HistoricalBattingPositionBandSchema` (`ALL`, `OPENER`, `TOP_ORDER`, `MIDDLE_ORDER`, `LOWER_ORDER`), `HistoricalPlayerStatusFilterSchema` (`ALL`, `ACTIVE`, `RETIRED`).
   - `HistoricalFilterQuerySchema` & `HistoricalFilterSupportSchema`: explicit source-data capability flags for `formats` (`T20` active; `ODI`/`RED_BALL` explicitly marked unavailable in career archives), `competitions` (`LC_T20_LEAGUE_01`), `seasons`, `opponents`, `teams`, `venues` (`ALL_RESOLVED` / `PARTIAL` / `UNAVAILABLE`), `battingPosition`, and `fielding` archive coverage (`ALL_ARCHIVED` / `PARTIAL_ARCHIVES` / `UNAVAILABLE`).
   - `HistoricalContributingMatchSchema`: per-match batting (`battedInnings`, `battingPosition`, `runsScored`, `ballsFaced`, `fours`, `sixes`, `notOut`), bowling (`bowledLegalBalls`, `bowlingRunsConceded`, `bowlingWickets`, `maidens`), fielding (`catches`, `stumpings`, `runOuts`, `archiveEvaluated`, `archiveReplayAvailable`), `resultSummary`, and `sourceCompletionSha256` link metadata.
   - `HistoricalPlayerRecordSchema` & `HistoricalLeaderboardTableSchema`: 12 leaderboards (`RUNS`, `BATTING_AVERAGE`, `BATTING_STRIKE_RATE`, `HIGH_SCORE`, `SIXES`, `WICKETS`, `BOWLING_AVERAGE`, `ECONOMY`, `BOWLING_STRIKE_RATE`, `BEST_BOWLING`, `FIELDING_DISMISSALS`, `CATCHES`) with explicit qualification rules, denominator definitions, null policies, and shared-rank tie rules.
2. **Pure Rebuildable Historical Projections (`packages/projections/src/historical-stats.ts`)**:
   - `createEmptyHistoricalStatsAccumulator`, `registerHistoricalSeasonMetadata`, `buildHistoricalMatchFact`, `applyHistoricalMatchFact`, `finalizeHistoricalStatisticsProjection`, `projectHistoricalStatistics`, `buildHistoricalStatsSourceFromPersistentWorld`, and `buildHistoricalStatsSourceFromSingleSeason`.
   - **Exact incremental-vs-rebuild parity**: Incremental match application reproduces full rebuilds byte-for-byte, deduplicates repeated fixture/result records by `seasonNumber:fixtureId`, preserves historical player identity across seasons and club transfers, and survives multi-season rollover and `.lcxxvi` round-trips.
   - **Explicit source separation**: Career historical stats isolate strictly from exhibitions, scenarios, and imported non-career histories (`HISTORICAL_SEPARATION_NOTICE`).
   - **Explicit qualification, null & tie rules**:
     - Rate thresholds adapt transparently by scope (`isSmallSample` <= 5 matches vs single season vs multi-season): Batting Average (`>= 2`/`>= 5`/`>= 10` dismissals), Batting Strike Rate (`>= 12`/`>= 30`/`>= 60` balls faced), Bowling Average & Strike Rate (`>= 2`/`>= 5`/`>= 10` wickets), Bowling Economy (`>= 12`/`>= 60`/`>= 120` legal balls).
     - Undefined denominators (`0` dismissals for batting average, `0` balls faced for SR, `0` wickets for bowling average/SR, `0` legal balls for economy) return `null` rather than `0` or `NaN`.
     - Competition ties share the same rank (`tied: true`) and advance the next rank by count of tied entries.
3. **Career Service & UI (`apps/web/src/career/service.ts`, `CareerApp.tsx`, `PlayerPage.tsx`, `RosterCareerApp.tsx`, `career.css`)**:
   - **Statistics screen**: Multi-dimensional filter bar (Season scope, Competition, Club, Opponent, Venue, Batting position band/slot, Player status `All / Active / Retired`), explicit source-separation & coverage banner, 12 qualified leaderboard tables with rule summaries and contributing-match drill-down links (`View replay` / `Match summary`), expanded **Batting, Bowling & Fielding** player records table (including retired alumni), and filtered team W/L/T/Pts records.
   - **PlayerPage**: Cross-season historical filters (`Season` & `Batting position`), expanded career batting/bowling/fielding summary, and clickable **Contributing matches** log linking directly to archived match replays (`onOpenMatchReplay`).
   - **RosterCareerApp**: Preserves single-season imported-roster career isolation with explicit separation label.

---

## 2. Verification Executed

| Command | Environment | Actual Result |
| --- | --- | --- |
| `npm run verify:09:core` | Linux container (`Node v24.18.0`, `Python 3`) | **PASS** — `325` JSON Schemas verified, Vite production + runtime builds, `tsc -b` + `tsconfig.tools.json`, `eslint` + 7 package boundaries, `45` scorer fixtures + `29` rejections, Python determinism/probability/generator vectors, and **`767/767` unit tests across `71/71` files** (`322.38s` Vitest) |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/historical-stats-stage9.spec.ts tests/ui/audio-stage8.spec.ts tests/ui/accessibility-release-audit.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — **`6/6` passed** (`5.1m`) |

### Stage 9 Regression Coverage (`tests/unit/historical-stats-stage9.test.ts` & `tests/ui/historical-stats-stage9.spec.ts`)

- Proves incremental accumulator parity against complete multi-season rebuilds, duplicate-fixture rejection, multi-season rollover retention, `.lcxxvi` round-trip consistency, retired-player discoverability (`RETIRED` filter + alumni page), fielding dismissal extraction from event archives, null denominators, tied leaderboard ranks, and direct contributing-match replay navigation.

---

## 3. Save & Replay Compatibility

- Statistics are strictly rebuildable projections derived from committed career saves and sealed match event archives (`CAREER_MATCH_EVENTS_V1`).
- Authoritative match workers, frozen random-stream addresses, integer probability LUTs, V0.1 single-season saves, Stage 2–4 persistent-world saves (`V1`–`V3`), and `.lcxxvi` portable archives remain completely unchanged.

---

## 4. Remaining Gates

- **Owner Stage 9 review/acceptance**: **Accepted** by owner (Sam Forbes) on 16 November 2026 ([OWNER_DECISIONS_2026-11-13.md](../OWNER_DECISIONS_2026-11-13.md)).
- **Hosted GitHub Actions** (`Linux` + `Windows`) run after push of `feat/stage9-historical-stats-leaderboards` and `main`.
