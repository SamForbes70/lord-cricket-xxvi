# Roster import: work in progress

This branch contains staging validation and an isolated roster-aware T20 engine.
The contracts and validators live in shared packages.
The application does not yet expose roster matches or careers.
This branch does not complete V01-006.

The draft JSON format accepts structural world and player data with optional format skill and exposure records. Missing skill values use an explicit provisional midpoint of 50 on the 0–100 scale. Missing exposure is recorded separately and represented as zero recorded balls. Imported records use a confidence value of 1000 basis points and a canonical source hash. These are declared synthetic defaults, not measured player ability.

The validator checks size, version, schema, rules and variation references, unique player assignments, and the ability to select a keeper and five bowlers. A staged pack can be rebuilt from its source to detect changed data or priors. A separate check validates both selected XIs, captain, keeper, bowling capacity and ground. A frozen preparation snapshot records the chosen players, world and pack hashes, rules and model pins for each format; engines do not yet accept it. Unknown fields are rejected. Six focused unit tests, type checking and lint pass on Linux with Node v24.19.0. The complete unit run passed 660 tests across 44 files; 173 generated schemas also passed verification. The existing edited-career browser checks passed all six cases in Chromium and Firefox. The production smoke suite passed all 23 checks, including 100 frozen replay cases in each browser.

The remaining work must bind a validated copy to new-game simulation and portable saves using explicit new versions. It must preserve frozen game replays and existing saves, exercise malformed archives and failure recovery, and verify the player-facing flow in both browsers. The present staging code must not be presented as a playable import.

## Roster-aware T20 development

The branch adds `LC_T20_MATCH_ROSTER_V2` and `LC_T20_ROSTER_SETUP_V2`.
The new path uses the accepted T20 scorer and model with imported player ratings.
It rebuilds command histories against the validated roster pack.
It rejects altered sessions, commands, events and packs.
The original V1 entrypoint rejects roster setups.

The new `LC_SAVE_V3_ROSTER` record stores a roster pack with each match checkpoint.
The repository rejects missing or changed packs and recovers an earlier checkpoint.
The application does not yet create or open these saves.
The `LC_ARCHIVE_V3_ROSTER` format embeds the pack and rejects damaged data.
The archive has a 20 MiB size limit.
The application does not yet offer roster archive import or export.
Roster careers, ODI and red-ball roster matches, and the user interface remain incomplete.

On Linux with Node v24.19.0, the production build, type check and lint passed.
The complete unit suite passed 665 tests in 45 files.
Schema verification passed 174 generated schemas.
The scoring, random, probability and generator checks passed.
The full Chromium match-save suite passed eight checks.
The roster-save check passed once in Chromium and once in Firefox.

The first Python run reported four missing research-reference files.
The files were copied from the existing workspace into this ignored directory.
The repeated Python suite passed all 94 tests.
The first Firefox browser attempt used port 4190, which Firefox restricts.
The repeated test used port 4173 and passed without changing browser security settings.
The first unit test for a tampered session called the autopilot before the guard.
The corrected test calls the command boundary directly and passes.

The full unit and browser logs in this directory record the results above.
The new path has not passed a human playthrough or hosted CI.
