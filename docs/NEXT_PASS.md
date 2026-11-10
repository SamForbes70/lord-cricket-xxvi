# Next development slice

Finish V0.1, then deliver persistent world, player lifecycle and squad economy sequentially, as directed by the owner on 11 November 2026.

## Immediate implementation

Complete durable managed-match recovery in draft PR #37. PR #24 already merged in-session navigation; V01-011 remains IN_PROGRESS because the launch and result binding uses session storage. The fresh-tab regression restores the match revision but loses the career handoff. It is not a fix.

## Integration queue

Read [the current dated audit](GITHUB_AUDIT_2026-11-11.md). Review #26 before dependent #27 and reconcile #31 with main. Check live head/base and required checks before merging. Update backlog status only when acceptance and integration are established.

## Continuation

Use [V01_BACKLOG.json](V01_BACKLOG.json) for the remaining acceptance criteria and [AI continuation](AI_CONTINUATION.md) for context. Historical evidence and owner-PC/reference-hardware gaps remain explicit. Missing research evidence does not block independent product work.
