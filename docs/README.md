# Lord Cricket XXVI documentation

## Start here

Lord Cricket XXVI is a browser-based statistical cricket management game built as a TypeScript monorepo. The current playable product is a fictional, single-season synthetic alpha. The finished multi-season management game remains a development goal.

| Reader | Start with |
| --- | --- |
| Player or owner | [Capabilities](CAPABILITY_MATRIX.md), [acceptance](ACCEPTANCE_RECONCILIATION.md) |
| Developer | [Engineering guide](ENGINEERING_GUIDE.md), [contribution workflow](../CONTRIBUTING.md) |
| AI coding agent | [AI-only continuation guide](AI_CONTINUATION.md), [repository instructions](../AGENTS.md) |
| Reviewer | [AI continuation guide](AI_CONTINUATION.md), [current status](CURRENT_STATUS.md), [V0.1 backlog](V01_BACKLOG.json) |
| Persistence maintainer | [Storage and archive reference](../packages/persistence/README.md) |
| Test author | [Verification and evidence guide](VERIFICATION_GUIDE.md) |
| Performance acceptance | [Reference-hardware budgets](PERFORMANCE_BUDGETS.md) |
| Reviewer or AI taking over | [Handover](HANDOVER.md), [prompt for an AI inspecting this project](AI_INSPECTION_PROMPT.md) |
| Owner | [Owner decisions](OWNER_DECISIONS_2026-11-13.md), [review of the unreviewed commits](REVIEW_2026-11-13.md), [branch protection](BRANCH_PROTECTION.md) |
| Research contributor | [Research gates](M7G_RESEARCH_AND_PROMOTION_GATES.md), [M7K plan](M7K_PLAN.md) |
| Release operator | [Local acceptance collector](LOCAL_ACCEPTANCE_COLLECTOR.md), [Windows handoff](codex-migration/WINDOWS_ACCEPTANCE_HANDOFF.md) |

## Document authority

Code and Git history establish what exists on a particular revision. The backlog establishes acceptance criteria. Verification reports establish what a particular test run demonstrated. Neither a planning document nor passing CI proves a feature was merged, publicly released, empirically calibrated or tested on the owner's PC.

Read the dated GitHub audit before older queue text. Historical reports retain their original counts and limitations. CURRENT_STATUS contains valuable history but its earlier PR lists are not a live GitHub index. Recheck GitHub before making integration decisions.

## Delivery intent

The owner directed on 11 November 2026, Brisbane time: finish V0.1, then deliver the persistent world, player lifecycle and squad economy sequentially. Preserve supported saves and deterministic replay. Do not widen the implementation to all future systems at once.

[Standing authority](STANDING_DEVELOPMENT_BRIEF.md) covers routine implementation, tests, commits, pushes, PRs and reviewed merges after required checks pass. Missing evidence remains missing even when implementation is authorised.
