# Batch 1: standing authority and delivery queue

The owner adopted autonomous V0.1 development on 30 October 2026.
This batch persists that authority, reconciles the design boundary and reviews the outstanding research commit.
It changes no production behaviour, saved-game format or gameplay model.

## Delivered records

`STANDING_DEVELOPMENT_BRIEF.md` records routine authority and decisions that still need owner input.
`V01_DELIVERY_PLAN.md` defines seven batches and a separate evidence track.
`V01_BACKLOG.json` supplies 29 delivery items and three research items with stable IDs and acceptance criteria.
ADR-033 retains synthetic-alpha delivery without claiming empirical realism.
The agent instructions, start document, next-pass document and current status link to the active queue.

No mandatory V0.1 feature is dropped by this reconciliation.
Optional prediction, verified DLS and explicitly deferred long-term systems retain their original boundaries.
Reference-hardware and release acceptance remain gates, even when empirical research is blocked.

## Outstanding research review

Commit `b93bccb` has two successful push checks in run `40879594000`.
The review finds no blocking defect within its isolated research scope.
Fourteen intake tests and four metadata-inventory tests pass in this batch.
All 11 retained evidence hashes verify.
The diff from the main baseline contains no production, contract or dependency changes.

The reviewed runner compares declared expectations and source identities; it does not authenticate historical facts.
No historical acceptance or model promotion follows from merging this code.
`RESEARCH_REVIEW.json` records the scope and limits.

## Integration and continuation

The existing research commit stays separate from the standing-brief commit within one combined PR.
Merge requires final-diff review and passing Linux/Windows checks on the exact head.
The backlog records integration as pending when authored; GitHub records the later merge result.
A continuation checks that result before advancing V01-002 to DONE.

The next product slice is V01-003, player pages with persistent format filters.
V01-004, pre-match pitch and conditions inspection, follows without a new approval request.
Neither requires the missing empirical cohort or historical incident records.
