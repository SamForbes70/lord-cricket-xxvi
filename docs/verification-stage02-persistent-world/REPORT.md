# Verification Report — Stage 2: Persistent Multi-Season World (`S02-01`)

- **Date**: 14 November 2026 (Australia/Brisbane)
- **Base Revision**: `f7ee054` (`main`, PR #43)
- **Branch**: `feat/stage2-persistent-world`
- **Stage & Slice**: Stage 2 (`S02-01` — Persistent multi-season world)
- **Status**: `accepted` (owner-accepted 14 November 2026 per `docs/OWNER_DECISIONS_2026-11-13.md`)

## 1. Delivered Capabilities

1. **Versioned Persistent World & Portable Archive Contracts (`packages/contracts/src/persistent-world.ts`)**:
   - Added explicit versioned schemas (`LC_PERSISTENT_WORLD_V1`, `LC_COMPLETED_SEASON_RECORD_V1`, `LC_PERSISTENT_CAREER_PROJECTION_V1`, `LC_PERSISTENT_WORLD_PORTABLE_V1`, `LC_PERSISTENT_WORLD_ROLLOVER_RECEIPT_V1`) without widening or mutating any frozen V0.1 single-season contract.
   - Generated 13 strict AJV 2020-12 JSON Schemas (`207` total schemas verified).
2. **Deterministic Multi-Season Progression (`packages/simulation/src/persistent-world.ts`)**:
   - Preserves stable `worldId`, `teamId`, `playerId`, and `groundId` across consecutive seasons.
   - Rotates team seed order on alternate seasons and derives deterministic per-season seeds so consecutive 14-round, 56-fixture schedules have distinct fixture pairings and home/away parity.
   - Applies between-season rest recovery (`fatigueBp` reduced, temporary readiness reset to `0`, training directive set to `BALANCED`, injury days decremented across the off-season gap) while keeping permanent skills and contracts strictly untouched in Stage 2.
   - Seals immutable `CompletedSeasonRecord` entries (`championTeamId`, `runnerUpTeamId`, frozen `SeasonState`, frozen `SeasonCompleteProjection`, and `completedEventArchiveDigestsByFixtureId`).
3. **Rebuildable Cross-Season Projections (`packages/projections/src/persistent-world.ts`)**:
   - Rebuilds Roll of Honour, all-time club honours/records (`closedSeasons`, `titles`, `runnerUps`, aggregate W/L/T/NR/points), and all-time player T20 career totals (`seasonsPlayed`, `matches`, `runs`, `highestScore`, `battingAverageX100`, `strikeRateX100`, `bowlingWickets`, `bowlingAverageX100`, `economyX100`) from immutable completed-season records plus the optional active season.
   - Verified bit-identical parity between incremental progression and full season-by-season rebuilds.
4. **Crash-Safe IndexedDB Persistence & `.lcxxvi` Archives (`packages/persistence/src/persistent-world.ts`, `packages/persistence/src/archive.ts`)**:
   - Dedicated IndexedDB stores (`PERSISTENT_WORLD_SAVES_V1`, `PERSISTENT_WORLD_CHECKPOINTS_V1`, `PERSISTENT_WORLD_ROLLOVER_RECEIPTS_V1`) alongside existing V0.1 stores.
   - Atomic single-transaction `rolloverPersistentWorldSeason` with `idempotencyKey` receipt replay so repeated rollover calls or mid-transition reloads never duplicate seasons, fixtures, or statistics.
   - Automatic checkpoint fallback recovery when the head persistent-world record is damaged, without losing sealed prior seasons.
   - Composite `${seasonNumber}:${fixtureId}` event-archive keys in IndexedDB and `persistent-match-events.ndjson` so ball-by-ball replays survive across multiple completed seasons (`160 MiB` cap scoped strictly to `LC_PERSISTENT_WORLD_PORTABLE_V1`; single-season V1/V3 archives retain `20 MiB` / `50 MiB` limits).
   - Non-destructive `copyCompletedSingleSeasonIntoNextSeason` copies a completed V0.1 single-season save into Season 2 in a new slot while leaving the original single-season save untouched.
5. **Player-Visible Career UI (`apps/web/src/career/service.ts`, `CareerApp.tsx`, `PlayerPage.tsx`, `career.css`)**:
   - Home screen supports starting a persistent multi-season world career (standard or edited world copy) alongside existing single-season and imported-roster careers.
   - Career overview displays world season badge (`Season N · YYYY`), `Advance to Season N+1` upon 56/56 completion, and `Begin Season 2 in a new persistent save` on legacy completed single-season saves.
   - Roll of Honour panel lists every closed season with champion, runner-up, expandable standings, and per-fixture ball-by-ball replay inspection.
   - Statistics screen adds a scope bar switching between the active season, `All-time career` honours/leaders/totals, and any archived completed season.
   - Player pages display cross-season career totals and a season-by-season (`Completed` / `Active`) table.

## 2. Verification Commands & Observed Results

All checks below were executed in the Linux container (`Node.js`, `Python 3`, Playwright Chromium + Firefox with `MOZ_DISABLE_CONTENT_SANDBOX=1`):

| Command | Outcome | Summary |
| --- | --- | --- |
| `npm run verify:09:core` | **PASS** (exit `0`) | `207` JSON Schemas verified; production + runtime Vite bundles built; `tsc -b` + `tsconfig.tools.json` clean; `eslint .` + 7 package/ambient boundary gates passed; `45` scorer fixtures + `29` rejections matched; Python determinism (`24` + `8`), probability (`1601` LUT), and generator (`9`) vectors verified; **`736/736` unit tests across `64/64` files passed**. |
| `npx vitest run tests/unit/persistent-world-stage2.test.ts` | **PASS** (`4/4` tests) | Consecutive 3-season rollover (`Season 1` -> `Season 2` -> `Season 3`), stable IDs, distinct schedules, idempotent rollover receipt replay, exact rebuild parity, `.lcxxvi` `LC_PERSISTENT_WORLD_PORTABLE_V1` round-trip with multi-season ball-by-ball replay archives, corrupted post-rollover head recovery from checkpoint, edited-world identity preservation, and non-destructive V0.1 single-season copy-forward into Season 2. |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/persistent-world-stage2.spec.ts` | **PASS** (`2/2`: Chromium + Firefox) | End-to-end browser verification: starts persistent career, completes 56 fixtures in Season 1 (`2027`), rolls into Season 2 (`2028`), plays Round 1 of Season 2, inspects Season 1 Roll of Honour + ball-by-ball replay, verifies `All-time career` club & player statistics, checks player page Season 1/Season 2 breakdown, and round-trips `.lcxxvi` into a clean browser context. |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/career-copy.spec.ts tests/ui/accessibility-release-audit.spec.ts` | **PASS** (`14/14`: Chromium + Firefox) | Confirms standard/roster career copies, stale/locked rejection guards, keyboard focus order, WCAG AA contrast, ARIA landmarks, `200%` zoom, and `150%` narrow/long-name layout remain intact. |
| `MOZ_DISABLE_CONTENT_SANDBOX=1 npm run smoke` | **PASS** (`23/23`: Chromium + Firefox) | Node, browser main thread, and Worker agree across all frozen determinism, probability, generator, world, and 100-match T20 corpus vectors. |

## 3. Save & Replay Compatibility

- Existing V0.1 single-season saves (`LC_T20_SEASON_SAVE_V1`) and portable archives (`LC_T20_SEASON_PORTABLE_V1`, `LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES`) load, replay, copy, and export under their original schemas and size caps (`20 MiB` / `50 MiB`) without silent migration.
- Completed V0.1 single-season saves can opt into Season 2 via an explicit non-destructive copy into a new persistent-world slot.
- Match simulation kernels, random-stream addresses, event hashes, and `synthetic-alpha-01` weights are unchanged.

## 4. Known Limitations & Remaining Human Acceptance

- **Stage 2 owner acceptance required before Stage 3**: Per the Master Build Brief (`A6`, `Part B Prompt 2–3`) and [NEXT_PASS.md](../NEXT_PASS.md), player lifecycle (ageing, permanent skill growth, youth intake, retirement) and contracts/budgets remain intentionally excluded from Stage 2 and gated on owner acceptance of Stage 2.
- **Imported-roster careers**: Imported-roster careers remain single-season in this slice while standard and edited-world careers support persistent multi-season worlds.
- **Unmeasured V0.1 hardware/human gates**: Reference-laptop measurements, owner-PC collector artifacts, and human screen-reader observations remain owner-declared per [OWNER_DECISIONS_2026-11-13.md](../OWNER_DECISIONS_2026-11-13.md).
