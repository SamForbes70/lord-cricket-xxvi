# World state V5: finished seasons out of the per-save hash (design)

Status: approved by the owner, 16 November 2026 ("start finished seasons out of the hash"), and built on branch `feat/world-state-v5`. Follows [WORLD_STATE_HISTORY_V4.md](WORLD_STATE_HISTORY_V4.md).

## Problem (measured)

After #56, a finished season is fully validated once, but every save still pays for each finished season:

- about 5 ms to schema-parse it when the state is sealed;
- about 9 ms each time the state is serialised to canonical JSON, which happens for the state hash and again for the stored checkpoint.

Measured at season 2 with one finished season of 335 KB. The cost grows linearly with career length: [Inference] about 0.3 s per save by season 20.

## Design

Only what is stored and hashed changes. The in-memory shape stays the same, so statistics, history screens, awards and rollover need no change.

1. **World state V5** (`LC_PERSISTENT_WORLD_STATE_V5`): the same fields as V4, with lifecycle V2 and full `completedSeasons` records in memory.
2. **State hash.** `stateSha256` is the sha256 of the canonical JSON of the core with `completedSeasons` replaced by each record's `recordSha256`, in order. Each record is bound by its own hash, which `validateCompletedSeasonRecord` checks in full once and then caches by identity (#56).
3. **Sealing** validates finished seasons through that cached validator rather than re-parsing them with the state schema.
4. **Stored checkpoint.** The checkpoint payload stores `completedSeasons` as `{ seasonId, recordSha256 }` references. The records already live once each in `COMPLETED_SEASON_RECORD_V1` rows, written once per season. Loading a V5 checkpoint reads those rows, checks each against its reference, and rebuilds the full state. A missing or damaged row means that checkpoint fails to load, and recovery falls back to an older generation as it does today.
5. **Export V6** (`LC_PERSISTENT_WORLD_PORTABLE_V6_WORLD_V5`): the V5 gzip layout, with `game.json` holding the full V5 state, so an archive is self-contained. Older readers refuse it, and the V6 reader refuses V1 to V4 states.
6. **What uses V5.** New careers and single-season copies. V1 to V4 saves load, save and export exactly as before.

## Compatibility

- V1 to V4 states and their hashes are unchanged byte-for-byte.
- **No rollback:** older builds cannot open a V5 save or read a V6 export.
- Rows: no new projection scope. V5 relies on `COMPLETED_SEASON_RECORD_V1` rows, which every world version already writes.

## Measured (as built)

One finished season of about 335 KB, the same state sealed and stored both ways, averages of 10 runs on a Linux container:

| Per save | V4 | V5 |
| --- | --- | --- |
| Seal (parse, hash, invariants) | 110 ms | 93 ms |
| Checkpoint canonical JSON | 30 ms | 23 ms |
| Checkpoint size | 2,062 KB | 1,729 KB |

So each finished season costs about 24 ms and 333 KB less per save. [Inference] By season 20 that is roughly 0.45 s and 6 MB per save. The three-season day-advance benchmark (in-memory repository, one run each) is within noise of V4 at that length: season medians 245, 310 and 369 ms against 249, 321 and 362 ms. That harness writes the full state, so it does not see the smaller checkpoint.

## Verification plan

- A V5 world plays out exactly as V4: same active world, economy and season records across rollovers. Only the state hash differs.
- Save, reload and recover in real IndexedDB, including a damaged season row.
- V6 export round trip; V4 and V5 readers refuse each other's archives.
- Day-advance benchmark over three seasons against V4.
