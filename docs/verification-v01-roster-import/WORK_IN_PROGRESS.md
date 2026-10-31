# Roster import: work in progress

Imported rosters are available for exhibition matches in T20, ODI and red-ball formats. The import screen accepts a JSON roster, provides a template, and reports validation errors. Missing ratings use a declared synthetic prior of 50. The roster is bound to versioned match sessions, browser saves and portable match archives. Existing V1 match entry points and saves remain separate.

The branch also contains an imported-roster career. It has a deterministic eight-team schedule, training, managed and simulated T20 fixtures, standings and player statistics. Versioned browser saves and portable archives retain the roster pack. The integration remains unmerged and requires final hosted verification.

## Verification on Linux

Before the latest career foundation, the full unit suite passed 672 tests in 48 files. The match-interface suite passed 18 tests in Chromium and Firefox; subsequent targeted checks passed four cases for invalid imports and a narrow screen at 150% zoom. The first narrow-screen run exposed file-input overflow in both browsers; the input was constrained and the checks passed on rerun. The existing career suite passed 18 browser checks. The match-save suite passed eight Chromium checks, and roster archive restoration passed in both browsers.

The production build, type check, lint and schema checks passed during development. Fixture audit, engine fixtures, random vectors, probability and generator checks passed. The Python suite passed 94 tests after the missing research reference files were copied from the existing workspace into the ignored reference directory. Those files are not included in this branch.

Earlier CI passed for commit `4d56492`; the changes described above require new hosted CI. They have not had a human playthrough. Later verification results and any remaining failures must be recorded with the final delivery.

## Career foundation verification

The updated build, type check, lint and all 183 generated schemas passed. The complete unit run reported 678 passing tests across 52 files but exited unsuccessfully because Vitest reported an unhandled worker communication timeout while browser tests ran at the same time. This is not a clean suite pass. A serial rerun was started to check that result.

The roster career persistence test passed in Chromium and Firefox, including an injected transaction abort, duplicate-command rejection and recovery of the preceding checkpoint. Firefox did not reach the test page in the initial sandboxed runs; both browsers passed on the later run outside the cloud sandbox. Rejected roster save transactions now register the abort listener before aborting. The earlier suspicion that this caused the Firefox stall was not confirmed.

The career foundation above initially supported off-screen fixtures only. The later integration section records the player-facing and managed-match work.

## Roster career integration in progress

The branch now exposes an imported-roster T20 career. It supports roster staging, team selection, training directives and managed or simulated fixtures. The managed fixture result is replayed against its roster before the career accepts it. Career saves use a separate version and embed the roster pack. A portable archive includes the career and roster. The career can create a new copy from an older recovered checkpoint.

A Linux run completed all 56 simulated fixtures. Each team played 14 matches. Chromium and Firefox each passed a managed-match, reload and archive-transfer check. Both browsers also passed a damaged-checkpoint recovery and copy check. An initial managed-match test failed because an undefined response field could not be saved. The field is now omitted until a result exists, and the browser tests passed on rerun.

A later local unit run passed 678 tests in 52 files. Build, type check, lint and 185 schema checks passed during this work. The hosted run for `28200d8` exposed a separate Windows Chromium failure: one roster exhibition test could not find the import control. Twenty-one other browser checks passed. The cause remains under investigation. CI now prints failed command output when artefacts are unavailable.

PR #17 merged as `3afec43` after four hosted Linux and Windows checks passed. Earlier human evidence applies only to its recorded build.

A Linux Chromium startup repetition passed ten isolated contexts. The Windows failure has not been reproduced locally. The failing test now records the page state if startup fails again.

The hosted Linux run for `28200d8` reported 678 passing assertions but failed on a Vitest `onTaskUpdate` worker timeout. The long red-ball tests now yield to the event loop during match loops. Their match and replay assertions remain unchanged. A fresh hosted run must confirm whether this resolves the timeout.

The original managed-match save ID was shared across fixtures. Consecutive fixtures now use distinct IDs. Browser checks cover starting and reloading the next managed fixture after returning a result.

The local production smoke run passed all 23 checks. Three repetitions of the exact previously failing Chromium match test passed locally. These results do not explain the hosted Windows startup failure.

A size review reproduced a staged roster pack of 22,354,888 bytes from a valid 22,163,577-byte source. That pack exceeds the 20 MiB portable archive limit before match data is added. New staged packs now have an 8 MiB limit, leaving space for game data. Earlier staged packs still validate for recovery. The complete archive remains limited to 20 MiB, and unusually large match or career data can still exceed that archive limit.

A hosted Firefox career test timed out while waiting for a batter or bowler control. The test and tactical opponent could act on the same decision. The test now selects manual decisions before driving the match. A fresh hosted run must confirm the result.

The final local unit run passed 679 tests in 52 files. Both hosted Linux checks and both hosted Windows checks passed for `6679ad3`. GitHub artefact storage was full; structured verification records remain in the job logs.
