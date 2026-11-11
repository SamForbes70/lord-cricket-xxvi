# V0.1 delivery plan

Target: the original bounded, visibly labelled synthetic alpha.
Owner authority: [standing brief](STANDING_DEVELOPMENT_BRIEF.md), adopted 30 October 2026.
Scope reconciliation: [ADR-033](decisions/ADR-033-V01-SYNTHETIC-ALPHA-DELIVERY.md).
`V01_BACKLOG.json` contains stable IDs, design references, dependencies and acceptance criteria.

## Ordered batches

| Batch | Outcome | Items |
| --- | --- | --- |
| 1 | Persist authority, reconcile scope and review outstanding research. | V01-001–002 |
| 2 | Player pages, pitch inspection, editing, roster import and settings. | V01-003–007 |
| 3 | Broader simulation, cancellation, granular delegation and navigation continuity. | V01-008–011 |
| 4 | Cross-format analytics, charts, scorecards and diagnostic exports. | V01-012–016 |
| 5 | Manual career copies, completed event archives and recovery usability. | V01-017–019 |
| 6 | ODI/red-ball opposition, declarations, follow-on and seeded weather. | V01-020–023 |
| 7 | Quality, replay volume, accessibility, offline updates, performance and packaging. | V01-024–029 |

## Next eligible work

PR #15 merged V01-003 and V01-004.
PR #16 merged V01-005, names and colours for new careers and exhibitions.

PR #17 merged V01-006, including imported-roster exhibitions and T20 careers.
PR #18 added the 115% scale and persistent match preferences.
PR #20 completed V01-007 keyboard and settings acceptance.
PR #21 merged V01-008 bounded advances; PR #22 merged V01-009 cancellation.
PR #23 merged V01-010 granular T20 delegation as `753db53`.
PR #25 merged V01-012 cross-format analytics as `3846282`.
PR #24 merged in-session navigation. Durable recovery across browser sessions is implemented in PR #39 (replacing the failing regression in #37) and awaits hosted checks, Firefox, Windows and owner acceptance; V01-011 stays IN_PROGRESS.
PR #28 merged scorecard exports and PR #30 merged manual career copies.
Accept V01-011 recovery next, then merge #26 incremental analytics, #27 charts (which carries copies of #26's commits) and #31 diagnostics in that order.
Use [the GitHub audit](GITHUB_AUDIT_2026-11-11.md) for the dated branch and check inventory.
Preserve stable IDs, historical snapshots, existing saves and frozen simulation outcomes.
Keep new packs versioned and validate all imported references and content.

## Delivery rules

Each slice includes acceptance criteria, implementation, relevant tests, evidence and a coherent commit.
Inspect the final diff and compatibility boundaries before merging.
Resolve demonstrated CI failures and merge only after required checks pass.
Record the tested head and final merge result without relabelling old evidence as fresh.

Statuses mean READY, PLANNED, IN_PROGRESS, BLOCKED_EXTERNAL, DELIVERED_PENDING_INTEGRATION or DONE.
Use the committed backlog for individual completion states; this plan does not automatically mark a batch complete.
The release item depends on every V01 item, including reference-hardware acceptance.

## Independent evidence track

RES-001 covers historical incident decisions and their executable expectations.
RES-002 covers the sealed untouched empirical cohort.
RES-003 covers empirical evaluation and separate promotion approval.
These items remain blocked by unavailable evidence, not by withheld routine development approval.
They do not block player pages, exports or other independent product work.

Reference-hardware acceptance is V01-028 and remains an original release gate.
Owner-PC and human observations remain recorded in `ACCEPTANCE_RECONCILIATION.md`.
Do not replace missing owner observations with hosted CI results.

## Reconciliation of the earlier gap list

The earlier chat list identifies candidate work; the committed backlog records the actionable scope.
Full charts and broader match controls remain product work.
Existing match save copies, basic analytics, red-ball delays and T20 opposition remain implemented capabilities.
Optional prediction and verified DLS remain gated extensions.
Multiyear management and squad economy are outside V0.1 and enter the approved subsequent milestones: persistent world, player lifecycle, then squad economy. Online play, DRS and 3D presentation are not added to that sequence.

## Continuation

Read `AGENTS.md`, the standing brief, current status and this queue at session start.
Select the first READY item or an unblocked PLANNED item whose dependencies are delivered.
Continue independent work when an external gate blocks one item.
Update status, evidence references and the next item after completing a slice.
Do not restart planning or request the standing authorisation again.
