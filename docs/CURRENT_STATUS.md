# Current game and acceptance status

For the 11 November 2026 branch/merge reconciliation, read [the GitHub audit](GITHUB_AUDIT_2026-11-11.md) and [next slice](NEXT_PASS.md). The dated records below retain their original scope; earlier PR lists are historical.

Lord Cricket XXVI is a playable single-season management alpha.
Main includes merged PR #2, capability reconciliation from PR #4 and the scenario harness from PR #5.
PR #3 merged as `4aa71d9` after integration with `b4aceda`. Historical simulation and save boundaries remain intact.
The accepted gameplay model remains `synthetic-alpha-01` / `SYNTHETIC_ALPHA`.
M7 quality validation and M8 release acceptance remain incomplete.

## Active V0.1 delivery

The owner adopted [the standing brief](STANDING_DEVELOPMENT_BRIEF.md) on 30 October 2026.
[The delivery plan](V01_DELIVERY_PLAN.md) records seven batches and a separate empirical research track.
Batch 1 records authority, scope reconciliation and review of research commit `b93bccb`.
PR #15 merged player pages and pre-match pitch inspection.
PR #16 merged edited names and colours for new careers and exhibitions.
Matches in all three formats and portable saves retain the edited copy.
PR #17 merged imported-roster exhibitions and a T20 career as `3afec43`.
PR #18 merged 115% text scale and persistent match preferences as `4aeb41b`.
New roster packs are limited to 8 MiB; complete portable archives are limited to 20 MiB.
PR #20 completed settings and player-navigation acceptance.
PR #19 added durable command acknowledgements.
PR #21 merged bounded simulation controls.
PR #22 merged safe cancellation and committed event-range reporting.
PR #23 merged granular T20 decision delegation as `753db53`.
The delegation journal carries selected categories in saves and archives.
PR #24 merged match continuity across management navigation as `4ef85a7`.
PR #28 merged scorecard export and print.
PR #30 merged manual career copies.
Durable managed-match recovery (V01-011) is implemented on its branch and browser-tested locally in Chromium and on hosted Windows in Chromium and Firefox; it is not yet merged or accepted by the owner, and the owner PC has not run it. See [the recovery notes](MANAGED_MATCH_RECOVERY.md).
Test counts quoted in these documents are branch-specific and not additive. A count is only meaningful with the revision it was measured on.
PR #25 merged cross-format match analytics as `3846282`.
The [batch 2 report](verification-v01-batch2/REPORT.md) records the previous slice.
The [world editing report](verification-v01-world-editing/REPORT.md) records this slice.
A labelled synthetic-alpha release remains distinct from empirical model promotion.

## Latest acceptance and M7K verification

PR #12 merged as `b755034` after four passing Linux and Windows checks.
It fixes career acceptance waits and adds a delayed-save regression with durable reload checks.
[The completion report](verification-m7k/completion/REPORT.md) records the latest work and remaining evidence gates.
The recorded M7K completion run passed 645 TypeScript tests and 94 Python tests.
The roster work later passed 679 local unit tests and four hosted Linux and Windows checks.
Research browser acceptance now checks all seven engineering fixtures in both physical-end orientations.
These synthetic expectations remain separate from complete historical source fixtures.
The source audit verifies 69 events across 65 matches; the refreshed forward inventory still contains 18 candidates.
[The owner-PC collector](LOCAL_ACCEPTANCE_COLLECTOR.md) runs local acceptance without opening existing browser profiles.
Cloud and hosted runs remain separate from owner-PC and reference-laptop acceptance.

## Steps 2–6 acceptance review

[The acceptance review](verification-m7k/acceptance-review/REPORT.md) adds executable intake for complete historical fixture packets.
It checks every expected prefix against ledger execution, replay and checkpoint recovery.
A broader all-format men's archive still supplies only 18 forward-dated T20 candidates before eligibility checks.
Historical decisions, sufficient untouched data and qualifying hardware measurements remain missing.
Overall M7K acceptance remains incomplete; gameplay promotion remains unauthorised.

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

The latest supplied owner-PC run passed 609 unit tests and all six match UI tests.
Its career suite passed three tests and failed Firefox's five-second save assertion.
PR #12 fixes that assertion; the updated owner-PC result has not been supplied.
Individual human metadata and some separate checklist observations remain NOT RECORDED.
Reference-hardware performance budgets and empirical model promotion remain unaccepted.
[ACCEPTANCE_RECONCILIATION.md](ACCEPTANCE_RECONCILIATION.md) records those distinctions and issue #1's residual gate.

## M7K and PR review

The owner authorised M7K research preparation on 26 October 2026.
[PR #3](https://github.com/SamForbes70/lord-cricket-xxvi/pull/3) records research preparation, rather than gameplay integration.
Its integrated head `0b0d410` passed four checks across push and PR workflows before the merge.
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

The earlier status assessment recorded these four activities:

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

## M7K source coverage follow-up

[Source context](verification-m7k/source-context/README.md) verifies all 69 registered event hashes across 65 matches and 45 observed signatures.
PR #6 merged this audit as `47c37df` after four passing CI checks.
It extends the previous 11-event batch with player identities, recorded values and neighbouring source addresses.
Source order and recorded values remain observations for review; no source case gains independent adjudication.
[Historical conditions](verification-m7k/historical-conditions/README.md) add the ICC 2012 standard T20I PDF and a qualified 2013 transcription.
Both restrict initial free-hit eligibility to foot-fault no-balls.
These sources supply rule context, rather than confirmation of match adoption or no-ball cause.
K1 requires independent decisions and applicable conditions before K2 ledger implementation.


## Scenario quality tooling

Merged PR #5 provides the [scenario quality harness](SCENARIO_QUALITY_HARNESS.md).
Its four additional tests bring the TypeScript suite to 542 tests across 31 files.
The retained default grid has 64 paired scenarios, 128 policy runs and 64 deterministic repeat checks.
The grid compares existing policies without changing gameplay coefficients or approving empirical realism.


## Isolated M7K implementation after owner confirmation

SF confirmed the presented review material on 28 October 2026 and directed implementation to continue.
[Research ledger and evaluation tools](verification-m7k/ledger/README.md) record that instruction and the implemented boundaries.
The separate tooling supplies a T20 research ledger, reconciliation, replay, journal recovery and offline evaluation reports.
Historical source records remain unchanged; six engineering fixtures supply explicit synthetic expectations.
Incident-specific fixture coverage and untouched-cohort evaluation remain incomplete. A shared research journal now supplies durable cross-innings transactions.
No candidate enters gameplay or an existing save.


## Durable transaction follow-up

PR #8 merged as `931da3b` after four passing checks.
[Shared transactions](verification-m7k/transactions/README.md) add one durable acceptance point for both innings and real-process-exit recovery tests.
Two conditional historical probes verify scorer arithmetic without claiming missing historical context.
A fresh source inventory finds 18 forward-dated matches before eligibility checks, below the required 200.
The remaining fixture and evaluation gates stay explicit; gameplay and existing saves remain unchanged.
