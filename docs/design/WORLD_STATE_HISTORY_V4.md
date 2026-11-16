# World state history out of the per-commit hash (design)

Status: proposed, 16 November 2026. Audit item M1 (`docs/AUDIT_2026-11-16.md`). Needs owner review before building: it adds new state versions.

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

## Also worth doing

- Completed-season records are re-put on every commit (`persistent-world.ts`, commit). They are immutable once sealed; write each once, at rollover.
- One process-wide verified-object registry shared by simulation and persistence would stop the same lifecycle being rehashed in both packages. It must stay identity-keyed and filled only after full validation (see Phase 2).

## Out of scope

Changing how the state hash is defined for existing versions. V1 to V3 world states and lifecycle V1 and V2 keep their hashes byte-for-byte.
