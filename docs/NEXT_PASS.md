# Next development slice

**V0.1 is closed.** The owner accepted it on 13 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)): every V01 backlog item is `DONE`, and RES-001 to RES-003 stay `BLOCKED_EXTERNAL`. "Done" for the performance, owner-PC and screen-reader gates means the owner declared them complete; no measurement or observation for them is stored in this repository.

The owner's sequence from here is **persistent world, then player lifecycle, then squad economy**, each accepted before the next begins. A separate research track (a licensed, well-characterised calibration dataset) is the brief's next priority for model quality and is blocked on data, not on routine development.

Read [HANDOVER.md](HANDOVER.md) first, then [AI_CONTINUATION.md](AI_CONTINUATION.md).

## Stage 2: Persistent multi-season world (`accepted`, 14 November 2026)

The owner accepted Stage 2 on 14 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)). The full 17-stage Master Build Brief reconciliation and slice ledger live in [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md), with Stage 2 verification evidence in [verification-stage02-persistent-world/REPORT.md](verification-stage02-persistent-world/REPORT.md).

1. **Save compatibility preserved**: Existing V0.1 single-season saves (`LC_T20_SEASON_SAVE_V1`) and portable archives (`LC_T20_SEASON_PORTABLE_V1`, `LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES`) open unchanged under their original schemas and `20 MiB` / `50 MiB` caps without silent migration. Completed single-season saves can opt into Season 2 via an explicit non-destructive copy (`Begin Season 2 in a new persistent save`) into a new slot.
2. **Explicit version boundaries**: Persistent multi-season saves use dedicated schemas (`LC_PERSISTENT_WORLD_V1`, `LC_COMPLETED_SEASON_RECORD_V1`, `LC_PERSISTENT_CAREER_PROJECTION_V1`, `LC_PERSISTENT_WORLD_PORTABLE_V1`, `LC_PERSISTENT_WORLD_ROLLOVER_RECEIPT_V1`) and dedicated IndexedDB stores.
3. **Crash-safe atomic rollover**: `rolloverPersistentWorldSeason` commits the sealed completed-season record, rotated next-season schedule, checkpoint, and idempotency receipt in a single IndexedDB transaction, with automatic checkpoint fallback recovery.

## Stage 3: Player lifecycle and youth pathway (`accepted`, 14 November 2026)

The owner accepted Stage 3 (`S03-01`) on 14 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md), [verification-stage03-player-lifecycle/REPORT.md](verification-stage03-player-lifecycle/REPORT.md), [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md)):

1. **Explicit version & fictional-parameter boundaries**: Uses `LC_PERSISTENT_WORLD_V2_LIFECYCLE`, `LC_PLAYER_LIFECYCLE_STATE_V1`, `LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1` (`parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"`), `LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE`, and `LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE` (`235` strict JSON Schemas). Stage 2 `LC_PERSISTENT_WORLD_V1` and V0.1 single-season saves remain untouched unless explicitly copied into a new V2 slot.
2. **Exploit-proof progression, ageing, retirement & youth pathway**: Daily training menu edits change only temporary daily readiness; permanent off-season progression applies once per season close from elapsed calendar training days and match appearances. Players age `+1` per season, retire with club floor guarantees (`18..22` squad size, `>= 1` keeper, `>= 5` bowling-capable), remain inspectable in **Retired Alumni** and **PlayerPage**, and are replenished by deterministic youth academy classes (`0` role shortages across a 20-season diagnostic horizon).

## Stage 4: Contracts, budgets and recruitment (`accepted`, 15 November 2026)

The owner accepted Stage 4 (`S04-01`) on 15 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md), [verification-stage04-squad-economy/REPORT.md](verification-stage04-squad-economy/REPORT.md), [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md)):

1. **Explicit version & fictional-economy boundaries**: Uses `LC_PERSISTENT_WORLD_V3_ECONOMY`, `LC_SQUAD_ECONOMY_STATE_V1`, `LC_SQUAD_ECONOMY_MODEL_FICTIONAL_V1` (`parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"`), and `LC_PERSISTENT_WORLD_PORTABLE_V3_ECONOMY` (`261` strict JSON Schemas). V0.1, Stage 2 (`V1`), and Stage 3 (`V2`) saves open unchanged unless explicitly copied into a new V3 slot.
2. **Symmetrical budgets, auditable ledger & exploit resistance**: All 8 clubs operate under symmetrical `$2,500k` annual wage caps, 3-round pre-season negotiation windows, cap reservations for pending bids, `50%` buyout cap charges against release-and-sign circumvention, `commandId` idempotency, SHA-256 hash-chained transaction ledgers, and public-only AI club recruitment (`0` hidden future-ability reads, `0` overspent clubs, and `0` role shortages across a 12-season diagnostic horizon).

## Stage 5: Tactical briefings and feedback (`accepted`, 15 November 2026)

The owner accepted Stage 5 (`S05-01`) on 15 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md), [verification-stage05-tactical-briefings/REPORT.md](verification-stage05-tactical-briefings/REPORT.md), [PLAYTEST_SCRIPT_STAGE05.md](PLAYTEST_SCRIPT_STAGE05.md)):

1. **Pure public-data briefings & trade-off guidance**: `LC_TACTICAL_BRIEFING_V1` (`281` strict JSON Schemas total) builds pre-match pitch/readiness/opponent briefings, plain-language upside/trade-off explanations for all 7 tactical controls, contextual legal presets across `T20` / `ODI` / `RED_BALL`, and incremental + rebuildable post-spell and batting-stint outcome summaries without reading hidden player ratings, youth ceilings, or seeds.
2. **Presentation-only visibility toggle**: `showTacticalBriefings` (`Shown` / `Hidden`) persists in UI preferences and never mutates worker `revision` or random draws.
## Stage 6: Live field and highlight pacing (`accepted`, 15 November 2026)

The owner accepted Stage 6 (`S06-01`) on 15 November 2026 ([verification-stage06-live-field-highlights/REPORT.md](verification-stage06-live-field-highlights/REPORT.md), [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md)):

1. **Committed-event presentation adapter (`LC_FIELD_PRESENTATION_V1`, `292` strict JSON Schemas)**: Responsive 2D SVG named-position field across `T20` / `ODI` / `RED_BALL`, mirroring `RHB` and `LHB` striker geometry, showing powerplay infield/outfield legality diagnostics, and providing keyboard-accessible field preset controls.
2. **Illustrative highlights & identical state hashes**: Highlight modes (`EVERY_BALL`, `KEY_MOMENTS`, `FAST`) and `reducedMotion` use an isolated presentation seed (`ILLUSTRATIVE_SECTOR_AND_LENGTH`), fall back cleanly when sector data is absent, preserve decision stops and immediate cancellation, and leave final state and event hashes byte-identical across modes.
3. **Next eligible slices**: **Stage 7 (Contextual text commentary)**, **Stage 8 (Optional sound and narration)**, and **Stage 9 (Historical statistics and leaderboards)** (plus human playtest review of Stages 5–6).

## Open items that still need people

- **Branch protection on `main`** is not applied. The AI could not apply it; the owner must ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)).
- **Delegation journal versioning:** older builds reject journals that use the widened values. Decide whether to introduce `LC_DELEGATION_JOURNAL_V2` with a migration.
- **Real measurements,** if the owner wants them: a reference-laptop run (`LCXXVI_ACCEPTANCE_DIR=... npx playwright test --config playwright.acceptance.config.ts`), the owner-PC collector (`node scripts/owner-acceptance.mjs --owner-pc`) and a screen-reader walkthrough. Store results under `docs/verification-*` and link them from the owner decisions record.
- **The empirical research items** need historical incident decisions, an untouched cohort and an approved dataset.

## How to work

Branch from `main`, open a draft pull request, wait for hosted CI (the Windows job takes 25 to 30 minutes), and merge only on green. Run `npx tsc -b` before the tests after any pull: stale compiled packages cause confusing unit failures. See [AGENTS.md](../AGENTS.md) and [VERIFICATION_GUIDE.md](VERIFICATION_GUIDE.md).
