# World state history out of the per-commit hash (design)

Status: built on branch `feat/world-state-v4` (16 November 2026) after the owner said "go ahead with world state V4". Audit item M1 (`docs/AUDIT_2026-11-16.md`). The proposal below is kept as written; "As built" records where the implementation differs.

## Problem (measured)

Three simulated contracts-era seasons, in-memory repository (so no IndexedDB time is included):

| Season | Median day advance | p90 | Rollover |
| --- | --- | --- | --- |
| 1 | 312 ms | 390 ms | 1,114 ms |
| 2 | 433 ms | 504 ms | 1,215 ms |
| 3 | 558 ms | 605 ms | |

About 120 ms more per season. [Inference] At that rate a day advance takes about 2.6 s by season 20 and about 5 s by season 38, before IndexedDB writes.

World state after two seasons is 2.5 MB of canonical JSON. By part:

| Part | KB |
| --- | --- |
| `lifecycle` | 1,406 |
| `currentSeason` | 436 |
| `completedSeasons` | 344 |
| `economy` | 253 |
| `careerProjection` | 63 |

Sealing that state takes 221 ms: schema parse 29 ms, canonical JSON 49 ms, sha256 5 ms, invariant checks about 140 ms.

## Cause

- `lifecycle.historicalRosterPacks` holds every season's full roster pack (the whole world with its source text). It grows every season and is the bulk of `lifecycle`.
- Every day advance records training exposure, which creates a new lifecycle object. The lifecycle is then serialised and hashed several times per commit: when it is sealed, inside the world-state hash, and again in the persistence invariant check, because each package caches only its own objects.
- The same packs are already stored separately, in projection scope `PERSISTENT_LIFECYCLE_ROSTER_PACK_V1`, keyed by their sha256. They are held twice.

## Proposal

1. **Lifecycle state V3.** Replace `historicalRosterPacks: StagedRosterPack[]` with `historicalRosterPackHashes: sha256[]`. The packs live only in their projection rows, which are already hash-keyed and verified on load.
2. **World state V4** carries lifecycle V3. Replay of an old fixture looks its pack up by hash (it already does: `findLifecycleRosterPackBySha256`), from the projection rows rather than the state.
3. **Copy forward.** Opening a V3 world offers a non-destructive copy into a V4 slot, the same way earlier upgrades work. V3 saves keep loading unchanged.
4. **Export.** A new archive version carries the packs once, in `lifecycle-roster-packs.ndjson`, as V3 already does.

Expected effect [Inference]: lifecycle stays near its season-one size (the active pack and per-player records), so day advances stop growing with career length.

## As built

The implementation bounds the embedded history instead of replacing it with hashes:

1. **Lifecycle state V2** (`LC_PLAYER_LIFECYCLE_STATE_V2_BOUNDED_PACKS`): the same fields as V1, but `historicalRosterPacks` holds at most two packs (`MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS`), the most recent ones. Keeping the two most recent packs embedded means the simulation code that reads them (mid-season pack updates, recent replays, award eligibility) needs no new lookup path. The horizon test shows a V2 lifecycle plays out exactly as V1: same active world, same economy hash, same season snapshots.
2. **World state V4** (`LC_PERSISTENT_WORLD_STATE_V4`) is world state V3 with lifecycle V2. Save schemas `LC_PERSISTENT_WORLD_SAVE_V4` and the presentation variant.
3. **Stored packs are the full history.** Every commit already stores the active pack as a `PERSISTENT_LIFECYCLE_ROSTER_PACK_V1` row; the first commit of a V4 save (new, copied or imported) also stores the embedded packs. Replay of an older fixture and award eligibility fall back to the stored rows (`CareerApplicationService.loadStoredRosterPacks`).
4. **Export V5** (`LC_PERSISTENT_WORLD_PORTABLE_V5_WORLD_V4`): the V4 gzip layout with a V4 save schema, carrying every stored pack. Export and import are refused if a lifecycle match archive names a pack the archive does not carry. V3 and V4 readers refuse it, and the V5 reader refuses V3 states.
5. **What uses V4.** New careers and copies of a completed single season. Existing V3 saves load, commit and export (V4 archive) unchanged. The V2 to V3 upgrade still produces V3.

### Measured effect

Same method as above (three simulated seasons, in-memory repository, one run each on a Linux container, so the figures are indicative), measured on the built branch:

| Season | V3 median day advance | V4 median | V3 state | V4 state | V3 lifecycle | V4 lifecycle |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 331 ms | 321 ms | 1,588 KB | 1,589 KB | 967 KB | 967 KB |
| 2 | 438 ms | 458 ms | 2,467 KB | 2,469 KB | 1,395 KB | 1,395 KB |
| 3 | 576 ms | 539 ms | 3,320 KB | 2,993 KB | 1,813 KB | 1,484 KB |

V4 only differs once a third pack would be embedded, so seasons 1 and 2 are the same within noise. From season 3 the lifecycle grows about 90 KB a season instead of about 420 KB. The rest of the state (current season, completed seasons, economy) still grows about 240 KB a season, and day advances still grow with it: about 80 ms from season 2 to 3 under V4, against 138 ms under V3. [Inference] Bounding the packs removes roughly half of the growth; the remainder needs the two items under "Also worth doing" and a smaller per-commit validation cost for completed seasons.

Not built: the copy-forward from an existing V3 world into a V4 slot (proposal step 3). [Inference] It needs every historical pack written as a row before the embedded list is trimmed, which a single commit can do with `seasonRosterPacks`; it is the next step if long V3 careers matter.

### Completed seasons are checked once

Measured at season 2: re-validating one completed-season record (schema parse, canonical JSON, hash, archive check) took about 23 ms, on every commit. The rows were already written only once (commit `244adbe`), but sealing re-parsed the state into new objects, so a carried-forward season was never recognised as already checked. Now:

- `validateCompletedSeasonRecord` remembers each record that passed full validation, keyed by object identity, and fills the cache only after full validation;
- every seal keeps a completed season's original object when that object is already verified, so later commits hit both this cache and the prepared-row cache.

Any other object, whether imported, edited or copied, is still checked in full; a test edits a copy and sees it refused. Same benchmark, V4:

| Season | Before | After |
| --- | --- | --- |
| 1 | 321 ms | 310 ms |
| 2 | 458 ms | 410 ms |
| 3 | 539 ms | 470 ms |

## Also worth doing

- Completed seasons are still parsed (about 5 ms each) and serialised into the state hash (about 9 ms each) on every commit. Taking them out of the state hash, or caching their canonical JSON inside a hash that is otherwise unchanged, needs a new state version.
- One process-wide verified-object registry shared by simulation and persistence would stop the same lifecycle being rehashed in both packages. It must stay identity-keyed and filled only after full validation (see Phase 2).

## Out of scope

Changing how the state hash is defined for existing versions. V1 to V3 world states and lifecycle V1 keep their hashes byte-for-byte.
