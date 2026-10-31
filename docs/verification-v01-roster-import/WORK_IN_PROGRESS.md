# Roster import: work in progress

Imported rosters are available for exhibition matches in T20, ODI and red-ball formats. The import screen accepts a JSON roster, provides a template, and reports validation errors. Missing ratings use a declared synthetic prior of 50. The roster is bound to versioned match sessions, browser saves and portable match archives. Existing V1 match entry points and saves remain separate.

The branch also contains a separate roster career foundation: a deterministic eight-team schedule, player condition and training state, off-screen T20 simulation, standings and player statistics, and a versioned browser save with checkpoints. The career foundation is not yet connected to the player-facing career, interactive fixtures or portable career archives. It must not be described as a complete playable roster career.

## Verification on Linux

Before the latest career foundation, the full unit suite passed 672 tests in 48 files. The match-interface suite passed 18 tests in Chromium and Firefox; subsequent targeted checks passed four cases for invalid imports and a narrow screen at 150% zoom. The first narrow-screen run exposed file-input overflow in both browsers; the input was constrained and the checks passed on rerun. The existing career suite passed 18 browser checks. The match-save suite passed eight Chromium checks, and roster archive restoration passed in both browsers.

The production build, type check, lint and schema checks passed during development. Fixture audit, engine fixtures, random vectors, probability and generator checks passed. The Python suite passed 94 tests after the missing research reference files were copied from the existing workspace into the ignored reference directory. Those files are not included in this branch.

Earlier CI passed for commit `4d56492`; the changes described above require new hosted CI. They have not had a human playthrough. Later verification results and any remaining failures must be recorded with the final delivery.

## Career foundation verification

The updated build, type check, lint and all 183 generated schemas passed. The complete unit run reported 678 passing tests across 52 files but exited unsuccessfully because Vitest reported an unhandled worker communication timeout while browser tests ran at the same time. This is not a clean suite pass. A serial rerun was started to check that result.

The roster career persistence test passed in Chromium and Firefox, including an injected transaction abort, duplicate-command rejection and recovery of the preceding checkpoint. Firefox did not reach the test page in the initial sandboxed runs; both browsers passed on the later run outside the cloud sandbox. Rejected roster save transactions now register the abort listener before aborting. The earlier suspicion that this caused the Firefox stall was not confirmed.

The remaining career work includes the management screens and interactive user fixtures, connecting saves to those screens, portable career archives, recovery workflows, and full browser and human acceptance. The current career code only simulates fixtures off-screen and is not accessible through the career interface.
