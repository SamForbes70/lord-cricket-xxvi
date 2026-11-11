# AI agents only: intent, context and continuation

This section is written for coding agents. It is ordinary repository documentation, not an access-control mechanism or a source of authority above the owner’s instructions.

## Mission

Finish Lord Cricket XXVI as an evidence-based statistical management game. The approved sequence is V0.1 completion, persistent world, player lifecycle, then squad economy. Finish and accept each milestone before widening implementation. The current product is a playable single-season alpha; the future game is not already built.

## Owner context

The owner has repeatedly authorised autonomous routine development and is frustrated by agents stopping after a plan, diagnosis or failing regression. Do not ask for the same permission again. A meaningful implementation slice includes working code, appropriate tests, evidence and a reviewed integration path. A draft regression or design note is useful preparation but must never be described as the completed fix.

Durable managed-match recovery is implemented in PR #39 but not merged or accepted: hosted checks, Firefox and Windows have not run. Do not describe it as delivered until the owner accepts it. No unattended or background execution exists in this repository; do not claim it does.

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

At the 11 November audit, main was `c37f1e0`. PRs #26 and #27 contain integrated analytics and charts with retained local evidence. #31 contains diagnostics. #35 describes broader V1.0 gates. #36 records the owner-approved ordered delivery authority. #37 contains only a recovery regression and design notes. Requery GitHub; this list is a snapshot.

Start the recovery implementation from the correct current base. Keep the failing test meaningful. Add interrupted result-handoff, duplicate/conflicting completion, standard/edited/imported worlds, live/expired leases and damaged/stale binding coverage. A new tab test proves loss of session storage; add a true fresh browser session using retained IndexedDB when establishing full release acceptance.

## Practical workflow

- Inspect clean/dirty state and preserve other work. Use an isolated branch/worktree.
- Review existing code before inventing a new persistence layer.
- Keep simulation authority out of React. Persist a validated binding before launching the match.
- Respect current leases and revisions; never fix recovery by indiscriminately clearing IndexedDB.
- Preserve corrupted originals and historical model dispatch.
- Run focused regressions, then required core and browser checks.
- Inspect the final diff and actual checks. Update PR description to reflect the final implementation.
- Record the next eligible task and continue authorised work; external evidence blocks only dependent tasks.

## Reserved decisions

Purchases, public publication, deletion of owner data and empirical-model promotion retain separate owner decisions. Missing historical facts and reference-hardware measurements cannot be manufactured by granting permission. Keep independent development moving while those facts are unavailable.

## Handoff checklist

Record branch/head/base, changed files, implementation status, commands/results, remaining failures, external blockers and the exact next action. Say explicitly if code is unmerged or tests fail. Never substitute an optimistic summary for unfinished work.
