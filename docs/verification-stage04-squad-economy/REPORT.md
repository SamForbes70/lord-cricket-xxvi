# Stage 4 (`S04-01`) Verification Report — Contracts, Budgets & Recruitment

- **Date**: 15 November 2026 (AEST)
- **Base revision**: `1fc2175` (`main` — Stage 3 player lifecycle & youth pathway merged and owner-accepted)
- **Branch**: `feat/stage4-contracts-recruitment`
- **Status**: `accepted` (owner-accepted 15 November 2026; merged to `main`)

## 1. Scope Implemented

1. **Versioned Stage 4 Contracts (`packages/contracts/src/squad-economy.ts`, `packages/contracts/src/index.ts`)**:
   - Added `LC_SQUAD_ECONOMY_STATE_V1`, `LC_SQUAD_ECONOMY_MODEL_FICTIONAL_V1` (`parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"`), `LC_PERSISTENT_WORLD_V3_ECONOMY`, and `LC_PERSISTENT_WORLD_PORTABLE_V3_ECONOMY`.
   - Generated 26 new strict AJV 2020-12 JSON Schemas (`261` total schemas verified; `257` exported Zod schemas).
2. **Domestic Contracts, Symmetrical Club Budgets & Auditable Ledger (`packages/simulation/src/squad-economy.ts`)**:
   - Symmetrical `2500k` (`$2,500k`) annual club wage budgets across all 8 clubs (`minWageK: 10`, `maxWageK: 420`, contract lengths `1..3` seasons, max 3 negotiation rounds per pre-season window).
   - Public-only market valuation (`buildPublicMarketPlayerView`, `estimatePlayerMarketWageK`) and symmetrical AI club recruitment that inspect only public abilities, age, role needs, and recent recorded season stats (`aiHiddenFutureAbilityReads === 0`; hidden `fictionalCeilingTier` is structurally excluded).
   - Append-only SHA-256 hash-chained `EconomyTransactionLedgerEntry` ledger (`verifyEconomyLedgerChain`) auditing initial contracts, youth graduations, offer submissions/withdrawals, round resolutions, counter-offer acceptances, buyouts, expiries, and retirements.
   - Anti-exploit protections: overspending cap reservations across pending offers, `commandId` idempotency against duplicate offer/acceptance submissions, deterministic simultaneous competing-bid tie-breaking, buyout cap charge (`50%` annual wage charged against current-season payroll cap so release-and-sign cannot circumvent the cap), reload persistence mid-bidding, and club floor enforcement (`18..22` squad size, `>= 1` wicketkeeper, `>= 5` bowling-capable).
   - Auctions and international release rules remain deferred to later competition packs per Stage 4 prompt.
3. **Cross-Season Transfer Career Projection Fix (`packages/projections/src/persistent-world.ts`)**:
   - Updated `projectPersistentCareerFromSeasons` to update `latestTeamId` across season boundaries when a player transfers clubs between seasons, while preserving strict intra-season `PLAYER_TEAM_MISMATCH` checks.
4. **Persistence, Digest Fast-Path & Non-Destructive Slot Upgrade (`packages/persistence/src/persistent-world.ts`, `packages/persistence/src/archive.ts`)**:
   - Added crash-safe `LC_PERSISTENT_WORLD_V3_ECONOMY` storage, atomic rollover receipts, `LC_PERSISTENT_WORLD_PORTABLE_V3_ECONOMY` `.lcxxvi` export/import (`160 MiB` bound), and non-destructive `upgradePersistentWorldV2ToEconomyV3` into a new save slot while preserving V0.1, Stage 2 (`V1`), and Stage 3 (`V2`) saves untouched.
   - Added `WeakSet` / `WeakMap` verified-digest caching across `validatePlayerLifecycleState`, `validateSquadEconomyState`, and `validatePersistentWorldStateV1/V2/V3` to eliminate redundant multi-pass SHA-256 recomputation during full-season runs.
5. **Management UI & Player Pages (`apps/web/src/career/service.ts`, `CareerApp.tsx`, `PlayerPage.tsx`, `career.css`)**:
   - Added **Contracts & Recruitment** workspace on **Squad** (`Club wage budget`, `Squad contracts & renewals`, `Pending negotiation offers`, `Free agent market`, `Resolve negotiation round`, and `Transaction ledger`) plus **Economy rollover summary** on **Career**, non-destructive Stage 3 -> Stage 4 slot upgrade banner, and contract/free-agent status on **PlayerPage**.

## 2. 12-Season Domestic Economy Diagnostic Horizon (`LC_SQUAD_ECONOMY_MODEL_FICTIONAL_V1`)

Deterministic 12-season horizon (`2026`–`2037`, `worldId: "economy-diag-12y"`, `seed: "seed-economy-diag-12y"`, `economySha256: 61072b4ec5d633d2e045b8e9f9b67fe92b6927703b463b4c51b597574a04edca`, `1,199` hash-chained ledger entries):

| Metric | Season 1 (`2026`) | Season 6 (`2031`) | Season 12 (`2037`) |
| --- | --- | --- | --- |
| Active contracts (8 clubs) | `166` | `159` | `158` |
| Free-agent pool size | `12` | `14` | `12` |
| Club payroll used (`min / median / max` vs `2500k` cap) | `1526k / 1726k / 1926k` | `1624k / 1819k / 2123k` | `1801k / 2085k / 2236k` |
| Clubs overspent (all 12 seasons) | **`0`** | **`0`** | **`0`** |
| Clubs with role shortages (all 12 seasons) | **`0`** | **`0`** | **`0`** |
| AI hidden future-ability reads (all 12 seasons) | **`0`** | **`0`** | **`0`** |
| Season renewals / free-agent signings | `24` / `6` | `39` / `12` | `49` / `12` |
| Wage distribution (`p10 / median / mean / p90`) | `15k / 20k / 20.7k / 28k` | `10k / 22k / 22.8k / 34k` | `17k / 25k / 25.7k / 39k` |

## 3. Verification Commands & Actual Results

| Command | Environment | Result |
| --- | --- | --- |
| `npm run verify:09:core` | Linux container (`Node v24.18.0`, `Python 3`) | **PASS** — `261` JSON Schemas verified; Vite production + runtime builds clean; `tsc -b` + `eslint` + all 7 boundary gates clean; `45` scorer fixtures + `29` rejections; Python determinism/probability/generator vectors verified; **`746/746` unit tests across `66/66` files passed** (`289.5s`) |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/squad-economy-stage4.spec.ts tests/ui/player-lifecycle-stage3.spec.ts tests/ui/persistent-world-stage2.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — `6/6` passed (`6.9m`) |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/career-copy.spec.ts tests/ui/accessibility-release-audit.spec.ts` | Linux Playwright (`Chromium` + `Firefox`) | **PASS** — `14/14` passed (`41.3s`) |

## 4. Save & Replay Compatibility

- V0.1 single-season saves (`LC_T20_SEASON_SAVE_V1`, V1/V3 `.lcxxvi`), Stage 2 persistent worlds (`LC_PERSISTENT_WORLD_V1`, `LC_PERSISTENT_WORLD_PORTABLE_V1`), and Stage 3 lifecycle worlds (`LC_PERSISTENT_WORLD_V2_LIFECYCLE`, `LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE`) load, replay, and export under their original schemas with zero silent migration.
- Stage 3 V2 saves upgrade to Stage 4 V3 (`LC_PERSISTENT_WORLD_V3_ECONOMY`) only via explicit copy into a new save slot.
- Completed Stage 4 fixtures archive per-season roster snapshots (`LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE`) so historical ball-by-ball replay remains exact even after transfers, development, or retirements.
