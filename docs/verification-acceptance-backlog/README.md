# Acceptance backlog audit and collector

The acceptance wrapper now reports observed test counts from fresh structured evidence.
The owner-PC collector automates the existing build and browser evidence steps with one command.
The implementation leaves gameplay, saves, model packs and historical source registers unchanged.
External evidence gates remain explicit rather than acquiring a passing label from tool availability.

## Corrected count and freshness handling

The old wrapper hard-coded 542 unit tests while the current suite contained 602.
New acceptance tests bring the final suite to 609.
`scripts/verify.mjs` now writes Vitest JSON and validates its timestamp, totals and successful completion.
The parent removes stale inherited manifests before starting verification.
The wrapper records `unitTestsObserved` and the structured `unitEvidence` from that run.
Skipped, failed, empty or stale unit evidence cannot satisfy acceptance.

The recorded wrapper run passes 16 mandatory gates and observes 608 passing tests across 38 files.
A final failure-path regression brings the final core run to 609 passing tests across the same 38 files.
`COMMANDS.json` retains exact commands, durations, exit codes and log hashes.
The raw inherited evidence remains under `/workspace/lc-backlog-inherited-verification`.
The compact wrapper manifest is retained separately in this directory.

## Owner-PC collector

`scripts/owner-acceptance.mjs` records OS release, CPU inventory, memory, Node/npm, source revision and source changes.
It records command lines, real exit codes, logs, hashes and actual structured test counts.
Its suites cover match UI, portable career, candidate archives and production-browser observations.
The collector installs the pinned dependencies and supported browsers unless dependency installation is explicitly skipped.
It uses fresh browser contexts and uploads no files.

The Windows CI job runs the same collector with hosted-site classification.
A hosted run cannot establish owner-PC acceptance.
Source identity, declared location and actual test execution remain separate fields.
A missing commit or dirty checkout leaves owner-PC acceptance unestablished.
[LOCAL_ACCEPTANCE_COLLECTOR.md](../LOCAL_ACCEPTANCE_COLLECTOR.md) contains the local command and result checks.

## Performance observations and limits

The production-page probe records click dispatch to committed UI revision, excluding exhibition saves.
It collects at least 30 command samples per browser and reports p95.
It separates page-lifetime long tasks from tasks overlapping measured command windows.
It records the exact browser version, user agent and viewport.
Main-thread JavaScript heap bytes exclude workers and native allocations.

The initial cloud observations record p95 acknowledgements of 23.9 ms in Chromium and 29 ms in Firefox.
These values describe that run, rather than four-core, 8 GB reference-laptop acceptance.
Chromium records page-lifetime long tasks; Firefox does not expose the Long Tasks API in this run.
The final collector observations use the revised command-window classification and remain separately identifiable.
The extended worker probe measures 20 complete T20 matches and 20 complete five-day matches through the unchanged engines.
It also simulates the full 56-fixture league with actual career, condition and projection updates.
The storage probe measures 20 real IndexedDB commits and 20 validated active-save loads using the complete season.
The final browser suite passes four cases across Chromium and Firefox.
The earlier end-to-end collector check passes six match UI, four career, four research and two initial observation cases.
The final CI collector additionally runs the extended engine/storage probes.

| Cloud observation | Chromium | Firefox | Proposed budget |
| --- | ---: | ---: | ---: |
| T20 engine p95 | 411.8 ms | 681 ms | 1,000 ms |
| Five-day engine p95 | 1,627 ms | 2,975 ms | 5,000 ms |
| Full league | 21,436.6 ms | 37,376 ms | 60,000 ms |
| Full-season save p95 | 41.3 ms | 67 ms | 500 ms |
| Active-save load p95 | 37.2 ms | 58 ms | 2,000 ms |

These are cloud measurements, rather than reference-laptop acceptance.
The exact samples and hashes appear in `complete-observations/`.
Total application memory remains unmeasured because main-window heap metrics exclude workers and native allocations.

## Gates that this environment cannot certify

| Gate | Current status and required evidence |
| --- | --- |
| Owner-PC automation | No attached execution channel to the owner's Windows PC; the collector is ready for that machine. |
| Remaining human details | The successful Edge playthrough remains valid; missing individual observations and historical metadata remain unrecorded. |
| Historical source fixtures | SF's confirmation remains recorded; missing incident-specific chronology, conditions, award details and ends remain unknown. |
| Untouched-cohort evaluation | The fresh archive inventory supplies only 18 forward T20 candidates before eligibility checks; the protocol requires 200. |
| Reference-laptop performance | This cloud host is not an attested four-core, 8 GB laptop; seven budget areas now have measurements, but total application memory and reference-hardware qualification remain unaccepted. |
| Model promotion | Explicit promotion remains unapproved; the accepted gameplay model remains `synthetic-alpha-01`. |

The source and cohort findings remain in [the transaction report](../verification-m7k/transactions/README.md).
The collector does not infer human observations or relabel previously inspected matches as untouched.
Issue #1 remains open until actual owner-PC evidence satisfies its retained criterion.
No additional owner review approval is requested by this implementation.


## Native Windows functional deadlines

The first full Windows collector run exposed two inherited off-screen round tests exceeding Vitest's default five-second deadline.
The tests took approximately 6.1 and 6.3 seconds on that runner.
`WINDOWS_FAILURE.json` retains the failed cases, counts, run/job references and artifact hash.
Only these two multi-fixture functional tests receive a bounded 30-second allowance.
Their assertions remain unchanged, and the independent performance probes keep their original proposed budgets.
All nine off-screen tests and typecheck pass after this adjustment.
