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
| Persistent multi-season world (`Stage 2`, `accepted`) | Standard and edited-world careers support consecutive 14-round, 56-fixture T20 seasons (`LC_PERSISTENT_WORLD_V1`), crash-safe idempotent rollover, immutable Roll of Honour, cross-season ball-by-ball replay archives, all-time club and player career statistics, cross-season player history, `.lcxxvi` `LC_PERSISTENT_WORLD_PORTABLE_V1` archives (`160 MiB` bound), and explicit non-destructive copy-forward of completed V0.1 single-season saves into Season 2 ([verification-stage02-persistent-world/REPORT.md](verification-stage02-persistent-world/REPORT.md)). Owner-accepted 14 November 2026 ([OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md)). |
| Management screens | Home, Career, Squad, Fixtures, Statistics, Settings and player pages. |
| Player pages | Base ratings by format, current T20 career condition, recorded season statistics, and (in persistent worlds) cross-season career totals plus season-by-season breakdowns. Squad and statistics link by stable player ID. |
| Pitch inspection | The selected exhibition ground and next career fixture show the seam and spin values used by the match model. Unused conditions and unavailable forecasts are labelled. |
| Training and condition | Rest/practice, availability, fatigue and temporary readiness; no permanent skill growth. |
| Tactical captain | Optional deterministic public-view policies for T20, ODI and five-day red ball (declarations, follow-on, new ball, workload and fields, with a conservative, balanced or aggressive red-ball profile). Legal controls are tested. Empirical tactical quality is unaccepted, and on first-innings runs the T20 captain is indistinguishable from the neutral baseline ([follow-up](verification-v01-batch7-diagnostics/FOLLOW_UP_2026-11-13.md)). |
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
| Performance | All eight budgets are confirmed, including 768 MiB total application memory ([PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md)). The owner declared the gate complete; a Linux container observation meets every budget, and **no reference-laptop measurement is stored in this repository**. |
| Red-ball weather | Seeded, versioned 30-minute weather segments in an independent random domain, with uncertain pre-day forecasts and interruptions applied only at safe over boundaries. Synthetic, not calibrated. |
| DLS and limited-overs rain | Disabled. |
| Career event archives and replay | Completed career matches keep a versioned event archive that replays without recomputing outcomes; career archives use `LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES` when they carry event archives, and older archives still read. Checkpoint generations can be inspected and recovered into a new slot. |
| Offline use and safe updates | A precached offline shell; updates wait until no match or save transaction is active; `/engineering.html` stays available as a recovery surface. |
| Accessibility | Automated keyboard, focus, contrast, 150 percent and narrow-layout checks pass ([ACCESSIBILITY_RELEASE_AUDIT.md](ACCESSIBILITY_RELEASE_AUDIT.md)). The human screen-reader walkthrough is owner declared; no observation is stored here. |
| Packaging | `npm run package:game` builds a playable zip (game, local server, launchers) and a source zip. The Windows launcher has not been run on Windows by the packager. |
| Release record | [release-v01/RELEASE_RECORD.json](release-v01/RELEASE_RECORD.json) lists capabilities, evidence files, owner declarations, known limits and recovery instructions. A unit test fails if it cites a file that does not exist. |
| Win prediction, super overs and DRS | Not enabled. The design brief makes win prediction optional. |
| Lifecycle and squad economy (`Stages 3–4`) | Ageing, permanent skill development, youth intake, retirement, contracts, transfers, finances and international management are not implemented (Stage 3 active next slice; Stage 4 gated on Stage 3 acceptance). |

Unit totals and commands belong to their dated evidence records, rather than this capability table.
[Acceptance reconciliation](ACCEPTANCE_RECONCILIATION.md) maps completed and unrecorded gates without inferring missing results.
