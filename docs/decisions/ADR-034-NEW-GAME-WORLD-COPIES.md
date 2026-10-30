# ADR 034: New-game world copies

## Status

Accepted for the V01-005 implementation, pending integration.

## Decision

A new career or exhibition may use an `LC_NEW_GAME_WORLD_COPY_V1` presentation copy.
The copy contains the complete fictional world with edited player, team and ground names and team colours.
All stable IDs, memberships, skills, pitch values and rule references remain equal to the frozen world.
The validator checks the original world hash, entity references, content hash and content-derived copy ID.
It rejects changes outside the permitted fields.

The simulation continues to use the accepted frozen world and model.
The application applies the copy only when it presents an associated career or match.
The engine's match setup, event chain and scorecard remain authoritative.
React renders names as text, and colour values must use six-digit hexadecimal notation.

An edited career or match stores the copy in `worldPacks` by hash.
The game row and copy are committed in the same IndexedDB transaction.
The application treats each association as immutable and rejects missing or damaged copies.
Recovery retains the copy while selecting an older valid checkpoint.

Edited career archives use `LC_T20_SEASON_PORTABLE_V2` and `LC_SEASON_SAVE_V2_PRESENTATION`.
Edited match archives use `LC_ARCHIVE_V2_PRESENTATION` and `LC_SAVE_V2_PRESENTATION`.
Both formats include the copy and verify its hash before import.
The application retains the V1 readers and does not migrate existing V1 saves.
Older applications may reject the new formats explicitly.

## Scope

The editor stages a copy before a new career or exhibition starts.
It can download and reopen its own versioned copy.
It does not change a running career, match or historical snapshot.
The three exhibition formats use the same frozen simulation world.
Arbitrary roster import and its validation remain V01-006.
No research model is promoted by this decision.
