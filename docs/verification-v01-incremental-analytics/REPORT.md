# Incremental analytics and rebuilds

Match controllers apply accepted events in sequence to an analytics accumulator.
The accumulator rejects gaps and duplicate events.
It rebuilds its cache when a restored event chain differs or becomes shorter.
A completed match can rebuild analytics in the worker with progress and cancellation.
A completed rebuild must match the incremental result before it is accepted.
Cancellation leaves the match revision and existing analytics unchanged.

Linux core verification passed 185 schema checks and 683 unit tests across 52 files.
Build, type check, lint, fixture audit, scorer and deterministic vector gates passed.
Unit checks compared incremental and full projections in all three formats.
They also covered rejected events, detached snapshots and rollback to an earlier prefix.
Six Chromium and Firefox full-match checks covered rebuild and cancellation in all formats.
The production smoke suite passed 23 checks across Chromium and Firefox.
Firefox used the cloud host sandbox override.
Hosted CI is blocked by the GitHub Actions budget and remains required before merge.

After integration with the merged delegation changes, `npm run verify:09:core` passed 188 schema checks and 688 unit tests in 53 files. Three Chromium and three Firefox checks passed for completed T20 analytics, delegated decisions and checkpoint recovery. The first Firefox attempt could not start because the browser binary was missing; the passing rerun used a newly installed Playwright Firefox with the Linux sandbox override. Hosted checks on the updated base did not start because an Actions budget prevented further use.


## Hosted verification update

GitHub Actions run 42807023107 passed Linux and hosted Windows checks for branch head `7ddbfeb` against the earlier cross-format analytics base.
An earlier Windows run reported a connection failure during archive import; the passing run did not reproduce it.
The cause remains unconfirmed. The branch now targets main and requires checks on that integration.


## Snapshot isolation

A shot-sector snapshot previously shared objects with its accumulator.
A regression test reproduced mutation of cached results through a returned snapshot.
Snapshots now copy shot-sector entries. The related 30 T20, ODI and red-ball tests passed locally.
The branch must pass hosted checks against main after PR #28.

## Current-main integration: 11 November 2026 (Brisbane)

Tested integration `b9eb19288a9204fb8a294d2b7842228c1c1f7847` includes
main `c37f1e0`, including navigation, scorecard exports and the current Windows
collector timeout. Linux Node 24.22.1 / npm 11.9.0 verification passed (the project requires Node 22.12 or later and hosted CI uses Node 22, so a Node 22 run is the better reference; see the integration branch notes):

- `npm run verify:09:core`: 188 schemas, build, typecheck, lint, scoring fixtures,
  independent vectors and all 690 tests in 54 files.
- Six analytics browser checks: T20, ODI and red-ball in Chromium and Firefox,
  covering rebuild, cancellation-or-completion race, unchanged revision and replay.
- `npm run management:acceptance`: all 56 fixtures, archive round trips,
  deterministic continuation and duplicate completion rejection.
- `npm run smoke -- --workers=1`: all 23 production smoke checks.

Logs, tested revision and SHA-256 values are retained in
`integration-2026-11-11/`. No browser sandbox override was used.
Frozen simulation, contracts, world data and the dependency lockfile have no
diff from main. Hosted checks must pass on the final PR head before merge.
These runs do not establish owner-PC or reference-hardware acceptance.

## Integration branch note: 11 November 2026

The analytics rebuild now yields to the event loop by time budget instead of a fixed 10 ms wait per 32 events, so a long red-ball rebuild is not slowed by the delay while a cancel message is still seen within one slice. Cancellation is unchanged. Re-run on Node 22.23.4 after the merge; see the integration pull request for the recorded results.
