# Granular T20 delegation

A player can delegate toss, innings, batter, bowler, batting-plan and bowling-plan decisions by team.
The worker uses the existing T20 captain and accepted match commands.
Undelegated decisions remain manual. Field selection and other formats remain unavailable for delegation.
The existing optional opponent captain keeps its previous behaviour.

A versioned journal records each choice and its match revision.
A writer lease and revision checks protect updates.
Each checkpoint retains the matching journal with an integrity hash.
Recovery creates a copy with the choices from its selected checkpoint.
Portable archive V4 carries the journal for original, edited and imported-roster matches.
The first delegation choice marks its local save V4; older builds reject that version.
Older saves and archives remain readable without migration.

The Linux core verification passed 188 schema checks and 687 unit tests across 53 files.
Build, type check, lint, fixture audit, scorer and deterministic vector gates passed.
The full Chromium persistence suite passed 10 checks.
The full match UI suite passed 48 checks across Chromium and Firefox.
The production smoke suite passed 23 checks across Chromium and Firefox.
Firefox used the cloud host sandbox override.
Browser checks covered delegation, a complete match, replay, archive import and checkpoint recovery.
A targeted unit run exercised all six supported categories.

The initial core run after adding contracts failed two old schema-count assertions.
The assertions were updated to include the three new schemas, and the core rerun passed.
An initial browser check attempted import before worker startup; it passed after waiting for readiness.
Hosted Linux and Windows checks remain required on the final pull request head.
