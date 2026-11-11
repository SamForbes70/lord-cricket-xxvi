# Current capability matrix

This matrix describes implemented capabilities; dated verification records retain their original test counts.
[CURRENT_STATUS.md](CURRENT_STATUS.md) records acceptance scope and unmerged research work.
Dated reports retain the results of their original runs.

| Capability | Current boundary |
| --- | --- |
| Fictional world | Eight teams, 160 players and eight grounds in the frozen world pack. |
| New-game editing | New careers and exhibitions use a validated, immutable presentation copy for names and colours. Existing saves and simulation snapshots retain their original versions. |
| Roster import | Versioned imported rosters support all exhibition formats and a T20 career. New staged packs are limited to 8 MiB; portable archives are limited to 20 MiB. |
| Match formats | T20, ODI and five-day red-ball exhibitions under documented custom rules. |
| Match interface | XIs, captain/keeper, toss, batting/bowling choices, field controls and complete scorecards. |
| One-season career | Eight teams, 14 rounds and 56 fixtures, with managed interactive or simulated fixtures. |
| Management screens | Home, Career, Squad, Fixtures, Statistics, Settings and player pages. |
| Player pages | Base ratings by format, current T20 career condition and recorded season statistics. Squad and statistics link by stable player ID. |
| Pitch inspection | The selected exhibition ground and next career fixture show the seam and spin values used by the match model. Unused conditions and unavailable forecasts are labelled. |
| Training and condition | Rest/practice, availability, fatigue and temporary readiness; no permanent skill growth. |
| Tactical captain | Optional deterministic public-view T20 policy; legal controls are browser-tested. Empirical tactical quality is unaccepted. |
| Granular T20 delegation | PR #23 merged six decision categories. A versioned journal persists choices in checkpoints and portable archives. |
| Fixture autopilot | Separate deterministic baseline completion policy; it is not the tactical captain. |
| Local saves | IndexedDB commits, writer lease, revisions, checkpoints and validated recovery of match and career checkpoints. A first commit cannot replace an existing save. |
| Managed-match recovery | A durable, hash-checked binding links a career fixture to its match before launch. A closed tab or browser leaves a restorable match that reconnects to its career, and a completed match applies its result to the career once. Browser-tested for standard and imported-roster careers and a retained-profile restart: locally in Chromium, and on hosted Windows in Chromium and Firefox. Not run on the owner PC. See [MANAGED_MATCH_RECOVERY.md](MANAGED_MATCH_RECOVERY.md). |
| Portable archives | `.lcxxvi` export/import, including browser tests in a fresh context. |
| Final season | Immutable completion after exactly 56 reconciled fixtures. |
| Statistics | League table, NRR, player statistics and accepted-event match analytics for T20, ODI and red-ball matches. |
| Browser acceptance | Recorded Linux and hosted Windows Chromium/Firefox suites pass. Sam confirmed a Windows match and save/reload on the `19e15de` package. The full owner-PC checklist remains incomplete. |
| Human match | Sam reports a successful Windows Edge match, layout check and repeat replay verification. Individual missing fields remain recorded. |
| Replay and determinism | Frozen scoring/vector gates and the 100-case T20 browser/worker corpus pass in recorded runs. |
| Gameplay model | `synthetic-alpha-01` / `SYNTHETIC_ALPHA`; no empirical-realism claim. |
| Empirical research | M7F-J candidates remain offline research. No candidate is selectable in gameplay. |
| M7K | Source evidence plus isolated research ledger, replay, recovery and evaluation tooling; no new production ledger or promoted model. |
| Scenario quality harness | Paired baseline/tactical developer tool across all eight teams and grounds; descriptive synthetic results only. |
| Performance | Reference-hardware browser, season, memory and save/load budgets remain unaccepted. |
| DLS and limited-overs rain | Disabled. Red-ball delay commands do not establish a calibrated weather scheduler. |
| Prediction, super overs and DRS | Not enabled. |
| Multiyear management | Transfers, contracts, finances, youth and international management are not implemented. |

Unit totals and commands belong to their dated evidence records, rather than this capability table.
[Acceptance reconciliation](ACCEPTANCE_RECONCILIATION.md) maps completed and unrecorded gates without inferring missing results.
