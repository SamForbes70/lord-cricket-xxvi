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
