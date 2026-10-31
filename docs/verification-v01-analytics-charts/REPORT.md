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
