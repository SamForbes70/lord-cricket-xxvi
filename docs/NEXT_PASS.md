# Next development slice

Finish V0.1, then deliver persistent world, player lifecycle and squad economy sequentially, as directed by the owner on 11 November 2026.

## Integrated baseline on `main`

PR #39 (`2c742fb`) delivered durable managed-match recovery across closed tabs and browser restarts. PR #40 (`877ead2`) integrated incremental analytics (#26), complete analytical charts (#27), previewable diagnostic event exports (#31), delivery-sequence documentation (#36) and project documentation (#38). PR #41 (`77e1160`) recorded the seven confirmed reference-hardware performance budgets in [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md).

Treat [GITHUB_AUDIT_2026-11-11.md](GITHUB_AUDIT_2026-11-11.md) as a historical snapshot taken before PRs #39 to #41 merged. Use [CURRENT_STATUS.md](CURRENT_STATUS.md) and [AI_CONTINUATION.md](AI_CONTINUATION.md) for current repository context.

## Active V0.1 product queue

- **V01-011** (durable managed-match recovery) and **V01-013 / V01-014 / V01-016** (incremental analytics, charts and diagnostic exports) are integrated in code; their backlog statuses stay unchanged until owner review.
- **Batch 5**: `V01-018` (completed career event archives and replay) and `V01-019` (career save and recovery usability).
- **Batch 6**: `V01-020` (ODI tactical captain), `V01-021` (red-ball tactical captain), `V01-022` (declaration and follow-on evaluation) and `V01-023` (seeded weather and uncertain forecasts).
- **Batch 7**: `V01-024` (synthetic quality and tactical exploitation gates), `V01-025` (cross-format replay and release-scale diagnostics), `V01-026` (accessibility release audit), `V01-027` (offline assets and safe updates), `V01-028` (reference-hardware performance acceptance, blocked on the eighth memory budget threshold and qualifying host run) and `V01-029` (release record and packaging).

## Continuation

Use [V01_BACKLOG.json](V01_BACKLOG.json) for acceptance criteria and [AI_CONTINUATION.md](AI_CONTINUATION.md) for invariants. Historical evidence and owner-PC or reference-hardware gaps remain explicit. Missing research evidence (`RES-001` to `RES-003`) does not block independent product work.
