# Current game and acceptance status

Lord Cricket XXVI is a playable single-season management alpha.
Main includes merged PR #2, capability reconciliation from PR #4 and the scenario harness from PR #5.
The integration baseline is `b4aceda`; each merge retains the historical simulation and save boundaries.
The accepted gameplay model remains `synthetic-alpha-01` / `SYNTHETIC_ALPHA`.
M7 quality validation and M8 release acceptance remain incomplete.

## Implemented product

The game provides eight fictional teams and 160 players.
T20, ODI and five-day red-ball exhibitions use documented custom rules.
The T20 career supports 14 rounds, 56 fixtures, interactive/simulated managed matches, training, condition and statistics.
Local saves, checkpoints, replay verification and `.lcxxvi` export/import are implemented.
Optional T20 tactical captain delegation is distinct from the fixture autopilot.

DLS, limited-overs rain, prediction, super overs and DRS are not enabled.
Multiyear careers, contracts, transfers, finances, youth and international management are not implemented.
No empirical-realism or complete ICC-conformity claim accompanies the custom game rules.
[CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md) records the full current boundary.

## Accepted evidence and remaining limits

Recorded baseline/follow-up runs pass 538 TypeScript unit tests, 72 Python research tests and 167 schema checks.
Those runs also pass scoring/vector gates, 23 browser smoke tests and a complete 56-fixture season.
Recorded Windows runs pass six match UI tests and four portable career tests across Chromium and Firefox.
Linux browser evidence covers the repaired layouts, long names, replay, formats, persistence and career paths.
These counts refer to their recorded commands, rather than a new combined run of every suite.

Sam installed and built the app on Windows, then reported a complete match in Edge.
The match, layout and repeated replay checks pass by owner report.
The owner-archive comparison passes 23 manifest hashes, 894 historical source files and 16 HTTP asset checks.
Simulation-worker and persistence-module bytes agree with the original release.

Owner-PC Chromium/Firefox automation remains NOT RUN.
Individual human metadata and some separate checklist observations remain NOT RECORDED.
Reference-hardware performance budgets and empirical model promotion remain unaccepted.
[ACCEPTANCE_RECONCILIATION.md](ACCEPTANCE_RECONCILIATION.md) records those distinctions and issue #1's residual gate.

## M7K and PR review

The owner authorised M7K research preparation on 26 October 2026.
[PR #3](https://github.com/SamForbes70/lord-cricket-xxvi/pull/3) records research preparation, rather than gameplay integration.
Its reviewed head `5baea6a` has four passing checks across push and PR workflows.
The review verifies 31 committed evidence hashes and identifies no blocking implementation defect.
The review covers the selector, provenance checks, CI and research-only capability boundary.
It does not independently adjudicate a cricket incident.
[pr3-review.json](verification-status-quality/pr3-review.json) retains exact check links and review limits.

PR #3 contains the 69-case worksheet, 45 representative observed signatures and source evidence.
Its integration with `b4aceda` retains both Linux Python check steps and the 542-test TypeScript suite.
Fresh local integration results are retained under `verification-m7k/integration-main/`.
Eleven event hashes across seven matches match the historical register.
Two priority cases have independent published corroboration, but zero source-derived fixtures have adjudication approval.
M7K has not integrated a new production scorer, ledger, save version or gameplay model.

## Immediate engineering activities

The current work completes the first four activities from the owner's status assessment:

1. Review PR #3 and its CI, preserving its research-only boundary.
2. Reconcile capability descriptions, including the inaccurate exhibition footer.
3. Reconcile baseline acceptance, human evidence and the owner-PC automation gap.
4. Run a fixed-seed scoring-quality diagnostic without changing coefficients.

[STATUS_AND_QUALITY_REPORT.md](STATUS_AND_QUALITY_REPORT.md) records the implementation and fresh diagnostic results.
The source protocol and evidence are retained under `verification-status-quality/`.
Historical acceptance reports remain dated snapshots, with links to this current status.

## Next development boundary

Exceptional-event review and ordinary scoring-quality diagnosis remain separate tracks.
Reviewed fixtures must precede production-capable v2 scorer integration.
New model/rule versions must preserve historical saves and exact v1 replay.
Empirical evaluation requires a new untouched cohort and explicit thresholds, rather than reused development holdout data.
The owner authorised integrating and merging PR #3 as research preparation on 28 October 2026.
Production ledger acceptance, research-model promotion and release publication retain their separate gates.


## Scenario quality tooling

Merged PR #5 provides the [scenario quality harness](SCENARIO_QUALITY_HARNESS.md).
Its four additional tests bring the TypeScript suite to 542 tests across 31 files.
The retained default grid has 64 paired scenarios, 128 policy runs and 64 deterministic repeat checks.
The grid compares existing policies without changing gameplay coefficients or approving empirical realism.
