# Next development slice

**V0.1 is closed.** The owner accepted it on 13 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)): every V01 backlog item is `DONE`, and RES-001 to RES-003 stay `BLOCKED_EXTERNAL`. "Done" for the performance, owner-PC and screen-reader gates means the owner declared them complete; no measurement or observation for them is stored in this repository.

The owner's sequence from here is **persistent world, then player lifecycle, then squad economy**, each accepted before the next begins. A separate research track (a licensed, well-characterised calibration dataset) is the brief's next priority for model quality and is blocked on data, not on routine development.

Read [HANDOVER.md](HANDOVER.md) first, then [AI_CONTINUATION.md](AI_CONTINUATION.md).

## Stage 2: Persistent multi-season world (`accepted`, 14 November 2026)

The owner accepted Stage 2 on 14 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)). The full 17-stage Master Build Brief reconciliation and slice ledger live in [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md), with Stage 2 verification evidence in [verification-stage02-persistent-world/REPORT.md](verification-stage02-persistent-world/REPORT.md).

1. **Save compatibility preserved**: Existing V0.1 single-season saves (`LC_T20_SEASON_SAVE_V1`) and portable archives (`LC_T20_SEASON_PORTABLE_V1`, `LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES`) open unchanged under their original schemas and `20 MiB` / `50 MiB` caps without silent migration. Completed single-season saves can opt into Season 2 via an explicit non-destructive copy (`Begin Season 2 in a new persistent save`) into a new slot.
2. **Explicit version boundaries**: Persistent multi-season saves use dedicated schemas (`LC_PERSISTENT_WORLD_V1`, `LC_COMPLETED_SEASON_RECORD_V1`, `LC_PERSISTENT_CAREER_PROJECTION_V1`, `LC_PERSISTENT_WORLD_PORTABLE_V1`, `LC_PERSISTENT_WORLD_ROLLOVER_RECEIPT_V1`) and dedicated IndexedDB stores.
3. **Crash-safe atomic rollover**: `rolloverPersistentWorldSeason` commits the sealed completed-season record, rotated next-season schedule, checkpoint, and idempotency receipt in a single IndexedDB transaction, with automatic checkpoint fallback recovery.

## Active next milestone: Stage 3 — Player lifecycle and youth pathway

With Stage 2 accepted, **Stage 3 (Player lifecycle and youth pathway)** is authorised: versioned ageing, reproducible training development protected from repeated-menu exploits, retirement, preserved retired player pages and records, youth intake, and 20-season balance diagnostics (fictional parameters labelled as such). Keep contracts and squad economy (Stage 4) outside Stage 3 until Stage 3 is accepted.

## Open items that still need people

- **Branch protection on `main`** is not applied. The AI could not apply it; the owner must ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)).
- **Delegation journal versioning:** older builds reject journals that use the widened values. Decide whether to introduce `LC_DELEGATION_JOURNAL_V2` with a migration.
- **Real measurements,** if the owner wants them: a reference-laptop run (`LCXXVI_ACCEPTANCE_DIR=... npx playwright test --config playwright.acceptance.config.ts`), the owner-PC collector (`node scripts/owner-acceptance.mjs --owner-pc`) and a screen-reader walkthrough. Store results under `docs/verification-*` and link them from the owner decisions record.
- **The empirical research items** need historical incident decisions, an untouched cohort and an approved dataset.

## How to work

Branch from `main`, open a draft pull request, wait for hosted CI (the Windows job takes 25 to 30 minutes), and merge only on green. Run `npx tsc -b` before the tests after any pull: stale compiled packages cause confusing unit failures. See [AGENTS.md](../AGENTS.md) and [VERIFICATION_GUIDE.md](VERIFICATION_GUIDE.md).
