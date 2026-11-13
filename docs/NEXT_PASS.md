# Next development slice

Finish V0.1, then deliver persistent world, player lifecycle and squad economy sequentially, as directed by the owner on 11 November 2026.

## Integrated baseline on `main`

PR #39 (`2c742fb`) delivered durable managed-match recovery across closed tabs and browser restarts. PR #40 (`877ead2`) integrated incremental analytics (#26), complete analytical charts (#27), previewable diagnostic event exports (#31), delivery-sequence documentation (#36) and project documentation (#38). PR #41 (`77e1160`) recorded the seven confirmed reference-hardware performance budgets in [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md).

Treat [GITHUB_AUDIT_2026-11-11.md](GITHUB_AUDIT_2026-11-11.md) as a historical snapshot taken before PRs #39 to #41 merged. Use [CURRENT_STATUS.md](CURRENT_STATUS.md) and [AI_CONTINUATION.md](AI_CONTINUATION.md) for current repository context.

## V0.1 engineering closure on branch `codex/v01-closure`

- **V01-011 hardening**: `150%` text-scale vertical budget headroom in Firefox and Chromium, slot-scoped `matchGameId` isolation across career copies/multiple careers with legacy fallback, `rekeyCareer` on imported-roster `Create recovered copy`, dangling-binding abandonment on match `DELETE_SAVE`, `playwright.m4.config.ts` wired into CI and owner acceptance, and two new browser recovery specs (damaged match checkpoint and live writer lease in another tab).
- **Batch 5 (`V01-018`, `V01-019`)**: completed career match event-archive retention, ball-by-ball replay without recomputation, V3 `.lcxxvi` portable round-trip, and checkpoint generation recovery usability.
- **Batch 6 (`V01-020` to `V01-023`)**: ODI and five-day red-ball tactical captains, declaration and follow-on rollout evaluation on an isolated planning seed, and seeded red-ball weather interruptions with uncertain pre-day forecasts (DLS and limited-overs rain remain disabled).
- **Batch 7 (`V01-024` to `V01-029`)**: synthetic quality and exploitation gates (`V01-024`), `300`-match cross-format replay plus `30,000`-innings Monte Carlo diagnostics (`V01-025`, [REPORT.md](verification-v01-batch7-diagnostics/REPORT.md)), automated browser accessibility audit (`V01-026`, [ACCESSIBILITY_RELEASE_AUDIT.md](ACCESSIBILITY_RELEASE_AUDIT.md)), precached offline shell with transaction-deferred updates (`V01-027`, [OFFLINE_SAFE_UPDATES.md](OFFLINE_SAFE_UPDATES.md)), automated 8-budget measurement harness with OS browser/worker/native memory probing (`V01-028`, [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md)), and deterministic release-candidate manifest packaging (`V01-029`, [RELEASE_RECORD.json](release-v01/RELEASE_RECORD.json)).
- Backlog statuses in [V01_BACKLOG.json](V01_BACKLOG.json) remain unchanged until owner review.

## Active Stop-Gate 1 before multi-season gameplay code

1. Owner confirms the numeric threshold for Budget 8 (`LCXXVI_MEMORY_BUDGET_MB`, total application memory including workers and native allocations).
2. Owner runs `node scripts/owner-acceptance.mjs --owner-pc` on the owner Windows PC and designated four-core, 8 GB reference hardware, plus completes the remaining human playthrough and screen-reader observations.
3. Explicit owner sign-off marks `V01-011`, `V01-028` and V0.1 accepted before starting Persistent World (Milestone 2), Player Lifecycle (Milestone 3), and Squad Economy (Milestone 4).
