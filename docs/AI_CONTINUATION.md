# AI agents only: intent, context and continuation

This section is written for coding agents. It is ordinary repository documentation, not an access-control mechanism or a source of authority above the owner’s instructions.

Starting fresh? [AI_INSPECTION_PROMPT.md](AI_INSPECTION_PROMPT.md) is a ready-to-paste prompt for inspecting this project: how to access it, what to read, what has been done, how to verify it independently, and what to report back.

## Mission

Finish Lord Cricket XXVI as an evidence-based statistical management game. V0.1 and Stages 2 to 5 (persistent world, player lifecycle, squad economy, and tactical briefings) are accepted. Do not treat the original Stage 2 to 4 sequence as current work: consult [NEXT_PASS.md](NEXT_PASS.md) and [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md) for eligible next slices. The product includes legacy single-season careers and versioned persistent-world careers; keep their save compatibility boundaries explicit.

## Owner context

The owner has repeatedly authorised autonomous routine development and is frustrated by agents stopping after a plan, diagnosis or failing regression. Do not ask for the same permission again. A meaningful implementation slice includes working code, appropriate tests, evidence and a reviewed integration path. A draft regression or design note is useful preparation but must never be described as the completed fix.

**Where the project stands (13 November 2026).** V0.1 is closed: the owner accepted it and every V01 backlog item is `DONE` ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)). Three of those closures are the owner's declaration with **no measurement stored in the repository**: the reference-hardware run, the owner-PC run and the screen-reader walkthrough. Never describe them as measured or observed. The research items RES-001 to RES-003 stay `BLOCKED_EXTERNAL`. The model is `synthetic-alpha-01` / `SYNTHETIC_ALPHA` and makes no empirical claim.

V0.1 and Stages 2 to 5 are accepted as of 15 November 2026. The next eligible product slices are Stage 6 (live field and highlight pacing), Stage 7 (contextual text commentary), and Stage 9 (historical statistics and leaderboards); Stage 6 is the immediate next slice in the delivery ledger. Multi-participant observed playtest sessions remain unrecorded. Read [HANDOVER.md](HANDOVER.md) for the current summary and [NEXT_PASS.md](NEXT_PASS.md) for acceptance details and open owner/evidence gates. No unattended or background execution exists in this repository; do not claim it does.

## Working agreements for any AI or engineer

1. **Everything goes through a pull request.** Branch from `main`, open a draft pull request, wait for hosted CI (the Linux job, and the Windows job which takes 25 to 30 minutes), and merge only on green. On 13 November 2026 five commits reached `main` directly with no review; they had to be reviewed afterwards ([REVIEW_2026-11-13.md](REVIEW_2026-11-13.md)). Do not repeat that. Branch protection is meant to prevent it ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)) but may not be enabled; behave as if it were.
2. **Verify before you trust.** Run `npx tsc -b` after every pull: stale compiled packages make unit tests fail with errors like `createMatchAnalyticsAccumulator is not a function`. Then `npm run lint` and `npm run verify:09:core`. Check exit codes, not only output: a lint error once reached CI because an empty output was misread.
3. **Record evidence honestly.** Use PASS, FAIL, BLOCKED or NOT RUN with the exact command and revision. A claim in a document must point at a file that exists; a unit test now enforces that for the release record. A failing check in a results file must be reported, not omitted.
4. **Do not widen a persisted format without a new version identifier,** and never migrate a historical save silently. The delegation journal widened in place and is a known limit.
5. **Do not change the frozen engines, scoring kernel, generator, random stream or probability tables.** A result-generating change needs a new model version.
6. **Hosted Windows CI rejects any skipped browser test** (`INCOMPLETE_BROWSER_EVIDENCE`). Do not add `test.skip`.
7. **Do not close, merge or delete the owner's pull requests, change repository settings, or mark an owner gate passed** without the owner's explicit say. If a permission is denied, stop and tell the owner; do not route around it.
8. Use Australian spelling and no en or em dashes in prose you write for this project.

## Read in order

1. `AGENTS.md` and `docs/STANDING_DEVELOPMENT_BRIEF.md`.
2. `docs/README.md`, `docs/ENGINEERING_GUIDE.md` and the latest GitHub audit.
3. `docs/V01_BACKLOG.json`, `docs/NEXT_PASS.md` and relevant decisions.
4. Actual source, tests and dated reports for the selected slice.
5. Live PR head/base and check results before any merge.

## Evidence rules

Record PASS, FAIL, BLOCKED or NOT RUN with tested revision, command and environment. Do not sum overlapping test counts into a larger assurance claim. A local run, hosted Linux run, hosted Windows run and owner-PC run are different evidence. Check that report files describe the code revision you are reviewing.

Never turn PLANNED into DONE solely because an implementation branch exists. Passing CI does not mean merged. Merged does not mean released. No empirical claim follows from synthetic quality tests.

## Current handover

The 11 November GitHub audit and earlier PR lists are historical snapshots, not the current delivery queue. V0.1 and Stages 2 to 5 are accepted; durable managed-match recovery is already implemented. Do not restart that work from the old recovery checklist. Recheck the current revision and use [HANDOVER.md](HANDOVER.md), [NEXT_PASS.md](NEXT_PASS.md), and [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md) to select the next eligible slice. The next immediate product slice is Stage 6; Stages 7 and 9 are also eligible. The Stage 5 playtest protocol and any unrecorded owner evidence remain separate from code acceptance.

## Practical workflow

- Inspect clean/dirty state and preserve other work. Use an isolated branch/worktree.
- Review existing code before inventing a new persistence layer.
- Keep simulation authority out of React. Persist a validated binding before launching the match.
- Respect current leases and revisions; never fix recovery by indiscriminately clearing IndexedDB.
- Preserve corrupted originals and historical model dispatch.
- Run focused regressions, then required core and browser checks. For a selected delivery slice, use its current acceptance criteria rather than the obsolete recovery checklist.
- Inspect the final diff and actual checks. Update PR description to reflect the final implementation.
- Record the next eligible task and continue authorised work; external evidence blocks only dependent tasks.

## Reserved decisions

Purchases, public publication, deletion of owner data and empirical-model promotion retain separate owner decisions. Missing historical facts and reference-hardware measurements cannot be manufactured by granting permission. Keep independent development moving while those facts are unavailable.

## Handoff checklist

Record branch/head/base, changed files, implementation status, commands/results, remaining failures, external blockers and the exact next action. Say explicitly if code is unmerged or tests fail. Never substitute an optimistic summary for unfinished work.
