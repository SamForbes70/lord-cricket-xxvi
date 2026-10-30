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

Start V01-003, player pages, then V01-004, pitch inspection.
Both can use existing immutable world data without changing simulation outcomes.
Use stable IDs and separate base skills, current condition and recorded statistics.
Expose only effective pitch/model parameters and explain missing statistics.

V01-005 and V01-006 follow with staged new-game editing and validated roster import.
A new world copy must preserve historical snapshots and carry explicit provenance/version identity.
No in-match attribute edits or automatic changes to existing saves are authorised.

## Delivery rules

Each slice includes acceptance criteria, implementation, relevant tests, evidence and a coherent commit.
Inspect the final diff and compatibility boundaries before merging.
Resolve demonstrated CI failures and merge only after required checks pass.
Record the tested head and final merge result without relabelling old evidence as fresh.

Statuses mean READY, PLANNED, IN_PROGRESS, BLOCKED_EXTERNAL, DELIVERED_PENDING_INTEGRATION or DONE.
Batch 1 reaches DONE after this change passes review and merges.
A later session can verify the merge before advancing those records.
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
Full charts, player pages, editing and broader match controls remain product work.
Existing match save copies, basic analytics, red-ball delays and T20 opposition remain implemented capabilities.
Optional prediction and verified DLS remain gated extensions.
Multiyear management, finances, contracts, youth, online play, DRS and 3D presentation remain deferred.

## Continuation

Read `AGENTS.md`, the standing brief, current status and this queue at session start.
Select the first READY item or an unblocked PLANNED item whose dependencies are delivered.
Continue independent work when an external gate blocks one item.
Update status, evidence references and the next item after completing a slice.
Do not restart planning or request the standing authorisation again.
