# Current capability matrix

This matrix describes the implemented game after merged PR #2.
[CURRENT_STATUS.md](CURRENT_STATUS.md) records acceptance scope and unmerged research work.
Dated reports retain the results of their original runs.

| Capability | Current boundary |
| --- | --- |
| Fictional world | Eight teams, 160 players and eight grounds in the frozen world pack. |
| Match formats | T20, ODI and five-day red-ball exhibitions under documented custom rules. |
| Match interface | XIs, captain/keeper, toss, batting/bowling choices, field controls and complete scorecards. |
| One-season career | Eight teams, 14 rounds and 56 fixtures, with managed interactive or simulated fixtures. |
| Management screens | Home, Career, Squad, Fixtures, Statistics and Settings. |
| Training and condition | Rest/practice, availability, fatigue and temporary readiness; no permanent skill growth. |
| Tactical captain | Optional deterministic public-view T20 policy; legal controls are browser-tested. Empirical tactical quality is unaccepted. |
| Fixture autopilot | Separate deterministic baseline completion policy; it is not the tactical captain. |
| Local saves | IndexedDB commits, writer lease, revisions, checkpoints and validated recovery. |
| Portable archives | `.lcxxvi` export/import, including browser tests in a fresh context. |
| Final season | Immutable completion after exactly 56 reconciled fixtures. |
| Statistics | League table, NRR, player statistics and accepted-event match analytics. |
| Browser acceptance | Recorded Linux and hosted Windows Chromium/Firefox suites pass. Owner-PC automation is NOT RUN. |
| Human match | Sam reports a successful Windows Edge match, layout check and repeat replay verification. Individual missing fields remain recorded. |
| Replay and determinism | Frozen scoring/vector gates and the 100-case T20 browser/worker corpus pass in recorded runs. |
| Gameplay model | `synthetic-alpha-01` / `SYNTHETIC_ALPHA`; no empirical-realism claim. |
| Empirical research | M7F-J candidates remain offline research. No candidate is selectable in gameplay. |
| M7K | Evidence preparation recorded in PR #3; no adjudicated source fixtures or new production ledger. |
| Scenario quality harness | Paired baseline/tactical developer tool across all eight teams and grounds; descriptive synthetic results only. |
| Performance | Reference-hardware browser, season, memory and save/load budgets remain unaccepted. |
| DLS and limited-overs rain | Disabled. Red-ball delay commands do not establish a calibrated weather scheduler. |
| Prediction, super overs and DRS | Not enabled. |
| Multiyear management | Transfers, contracts, finances, youth and international management are not implemented. |

Unit totals and commands belong to their dated evidence records, rather than this capability table.
[Acceptance reconciliation](ACCEPTANCE_RECONCILIATION.md) maps completed and unrecorded gates without inferring missing results.
