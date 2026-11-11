# Next development slice

Finish V0.1, then deliver persistent world, player lifecycle and squad economy sequentially, as directed by the owner on 11 November 2026.

## Immediate implementation

Durable managed-match recovery is implemented in PR #39, which replaces the failing regression in #37 with behavioural specs. PR #24 already merged in-session navigation. V01-011 remains IN_PROGRESS until hosted checks, Firefox and Windows have run and the owner accepts it. See [the recovery notes](MANAGED_MATCH_RECOVERY.md).

## Integration queue

Read [the current dated audit](GITHUB_AUDIT_2026-11-11.md). Merge #26, then #27, then #31. #27 is not stacked on #26: it carries re-applied copies of #26's commits, so merge #26 first and re-run checks on the rebased #27. #31 conflicts with both in `main.tsx`, `match.worker.ts` and `protocol.ts`. Check live head/base and required checks before merging. Update backlog status only when acceptance and integration are established.

## Continuation

Use [V01_BACKLOG.json](V01_BACKLOG.json) for the remaining acceptance criteria and [AI continuation](AI_CONTINUATION.md) for context. Historical evidence and owner-PC/reference-hardware gaps remain explicit. Missing research evidence does not block independent product work.
