# Next development slice

**V0.1 is closed.** The owner accepted it on 13 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)): every V01 backlog item is `DONE`, and RES-001 to RES-003 stay `BLOCKED_EXTERNAL`. "Done" for the performance, owner-PC and screen-reader gates means the owner declared them complete; no measurement or observation for them is stored in this repository.

The owner's sequence from here is **persistent world, then player lifecycle, then squad economy**, each accepted before the next begins. A separate research track (a licensed, well-characterised calibration dataset) is the brief's next priority for model quality and is blocked on data, not on routine development.

Read [HANDOVER.md](HANDOVER.md) first, then [AI_CONTINUATION.md](AI_CONTINUATION.md).

## Next milestone: persistent world (Milestone 2)

Proposed scope and acceptance are in [V01_DELIVERY_PLAN.md](V01_DELIVERY_PLAN.md) ("After V0.1"). They are proposals until the owner accepts them. Before writing code:

1. Write the acceptance criteria and the save-compatibility plan for the owner to confirm. A multi-season career must keep existing single-season saves openable unchanged, or copy them forward by an explicit action. Never migrate a historical save silently.
2. Decide the version identifiers for any widened persisted format. The delegation journal widened in place without a new version (see [REVIEW_2026-11-13.md](REVIEW_2026-11-13.md)); do not repeat that.
3. Plan season rollover as one atomic transaction that a crash cannot leave half done.

Do not start player lifecycle or squad economy code before the persistent world is accepted.

## Open items that still need people

- **Branch protection on `main`** is not applied. The AI could not apply it; the owner must ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)).
- **Delegation journal versioning:** older builds reject journals that use the widened values. Decide whether to introduce `LC_DELEGATION_JOURNAL_V2` with a migration.
- **Real measurements,** if the owner wants them: a reference-laptop run (`LCXXVI_ACCEPTANCE_DIR=... npx playwright test --config playwright.acceptance.config.ts`), the owner-PC collector (`node scripts/owner-acceptance.mjs --owner-pc`) and a screen-reader walkthrough. Store results under `docs/verification-*` and link them from the owner decisions record.
- **The empirical research items** need historical incident decisions, an untouched cohort and an approved dataset.

## How to work

Branch from `main`, open a draft pull request, wait for hosted CI (the Windows job takes 25 to 30 minutes), and merge only on green. Run `npx tsc -b` before the tests after any pull: stale compiled packages cause confusing unit failures. See [AGENTS.md](../AGENTS.md) and [VERIFICATION_GUIDE.md](VERIFICATION_GUIDE.md).
