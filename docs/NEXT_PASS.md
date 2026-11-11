# Next development slice

The active target is the original V0.1 synthetic alpha under the owner's standing brief.
[The delivery plan](V01_DELIVERY_PLAN.md) and `V01_BACKLOG.json` supersede the earlier research-only work queue.
[Current status](CURRENT_STATUS.md) records actual implemented capability and evidence.

## V0.1 integration and continuity

PR #15 merged V01-003 and V01-004.
PR #16 merged V01-005, names and colours for new careers and exhibitions.
PR #17 merged V01-006, validated roster import for exhibitions and T20 careers.
PR #18 added the 115% scale and persistent match preferences.
PR #20 completed V01-007 acceptance.
PR #21 merged bounded simulation controls; PR #22 merged safe cancellation.
PR #23 merged granular T20 delegation as `753db53`.
PR #25 merged cross-format analytics as `3846282`.
PR #24 merged as `4ef85a7`; in-session inspection is delivered.
Durable fresh-session recovery and the exactly-once career result handoff are implemented in PR #39.
V01-011 remains IN_PROGRESS until hosted checks run and the owner accepts it; see [the recovery notes](MANAGED_MATCH_RECOVERY.md).
Review incremental analytics in PR #26, charts in #27 and diagnostics in #31 against current main.
#27 is not stacked on #26: it carries re-applied copies of #26's commits.
Passing earlier heads do not establish integration.
Keep V01-013 onward incomplete until their acceptance and integration are verified.
Check the current merge base and required CI before integration.
Preserve stable IDs, existing saves, frozen simulation outcomes and historical snapshots.

## Parallel research and acceptance

[M7K_PLAN.md](M7K_PLAN.md) remains the research plan; its historical and cohort gates stay explicit.
Historical decisions, sufficient untouched matches and qualifying hardware measurements remain external evidence needs.
They do not stop unrelated product work.
Research-model promotion and public deployment require separate approval.

## Approved progression after V0.1

The owner confirmed the sequence on 11 November 2026 (Australia/Brisbane):
finish the existing V0.1 queue, then persistent world, player lifecycle and squad
economy. Deliver one accepted milestone before expanding to the next.
Routine development authority extends to these milestones under the standing
brief; purchases, public deployment, owner-data deletion and empirical model
promotion retain their separate boundaries.
