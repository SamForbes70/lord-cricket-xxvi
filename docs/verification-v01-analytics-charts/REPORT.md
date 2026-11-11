# Analytical charts verification

The match analytics panel shows a score worm for each innings, a wagon wheel of bat runs by recorded shot sector, and a count of simulated delivery length categories. The sector display reflects the selected left-handed batter's view without changing events. Extras have no shot sector in the wheel. Line lengths compare sector totals and do not represent measured distance. Pitch categories do not claim physical ball coordinates. Missing length and sector data are identified in the panel.

The charts use the event projection shared by incremental analytics and full rebuilds. Batter handedness comes from the match XI. Existing score tables remain available alongside the charts. No match engine or save format changes are required.

## Local verification

- `npm run verify:09:core`: passed; 185 schemas and 685 tests in 53 files, with build, type checking, lint, fixture and vector gates.
- Chromium and Firefox completed-match analytics checks: 6 passed across T20, ODI and red-ball. The checks include narrow-screen 150% scaling, rebuild, cancellation and replay.
- Production smoke suite: 23 passed.
- The T20 browser checks require a left-handed batter and compare reflected sector totals with saved delivery events. ODI and red-ball make the same comparison when a left-handed batter has a recorded sector.
- Firefox used `MOZ_DISABLE_CONTENT_SANDBOX=1` on the Linux host. Chromium used the host executable.

The branch depends on the cross-format and incremental analytics changes in PRs #25 and #26. Hosted checks must pass before integration; GitHub Actions jobs were not starting because the account budget was exhausted.

## Current-main integration: 11 November 2026 (Brisbane)

Tested integration `e93d36325d0cd725f5d265adfc4c6ec656280758` includes
main `c37f1e0` and incremental analytics `b9eb192`. The stylesheet conflict was
resolved by retaining both chart styles and printable-scorecard styles.
The current collector's 30-minute match UI timeout is retained; the previous
Windows branch run used the older 15-minute timeout. This does not establish
a passing Windows run on the integrated head.

Linux Node 24.22.1 / npm 11.9.0 verification passed all 188 schemas, build,
typecheck, lint, scoring fixtures, independent vectors and 692 unit tests
in 55 files. All six T20/ODI/red-ball browser checks passed in Chromium and
Firefox, including saved-event handedness comparisons, charts, narrow 150%
layout, rebuild, cancellation-or-completion race and replay.

The browser run used a temporary copy of the existing UI configuration with
port 4181 to avoid the other worktree's server. Its initial attempt failed
before tests because the Vite path was resolved relative to `work/`. Setting
the preview server's cwd to the repository fixed the harness; no product code
changed for that retry. The configuration, both logs and checksums are retained
in `integration-2026-11-11/`.

Frozen simulation, contracts, world data and the lockfile have no diff from
main. Hosted checks on the final head remain required before merge. These
Linux results do not establish owner-PC or reference-hardware acceptance.
