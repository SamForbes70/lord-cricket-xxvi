# Match archive storage, version 2 (design)

Status: proposed, 16 Nov 2026. Audit Phase 4b (`docs/AUDIT_2026-11-16.md`).

## Problem (measured)

One contracts-era season, measured on `fix/phase4-scale`:

| Part of the `.lcxxvi` export | Bytes |
|---|---|
| `match-events.ndjson` (56 ball-by-ball archives) | 14,430,247 |
| `game.json` | 1,628,436 |
| everything else | about 0.86 MB |
| whole export | 16,916,185 |

- The per-world archive ceiling is 128 MB (`MAX_PERSISTENT_WORLD_EVENT_ARCHIVES_TOTAL_BYTES`). At 14.4 MB a season, a commit that adds archives fails in season 9, so **the career cannot advance**.
- The export cap is 160 MB, so exports fail at about the same point.
- Opening a career loads and parses every archive (`CareerApplicationService.loadCareerEventArchives`) to build fielding statistics and awards. At 20 seasons that is about 290 MB of JSON in memory.
- Replaying one fixture in a multi-season world also loads every archive.

Measured compression: 8 archives, 2,084,095 bytes, gzip to 350,877 (about 6:1).

## What actually needs the archives

| Consumer | Needs |
|---|---|
| Replay viewer | one fixture's full events |
| Historical statistics | per match: crease order per innings (batting position filter), ground, fielding credits |
| Season awards (Best Fielder) | per match: fielding credits |
| Match awards | fielding points; recorded once in the ledger, rebuilt on import |
| Import | the full archives, once |

Only replay and import need full events. Everything else needs a few hundred bytes per match.

## Design

1. **Match digest.** A pure function in `@lcxxvi/projections`, `deriveCareerMatchDigest(archive, completion)`, returns `{ digestVersion, fixtureId, groundId, creaseOrder, fielding[] }` where `fielding` is sorted by player id. It is exactly what `extractArchiveDetail` derives today, so statistics and awards are unchanged. A test proves equality on real archives.
2. **Digest storage.** Each commit that adds archives also writes a digest row (new projection scope `CAREER_MATCH_DIGEST_V1`, key `fixtureId`), hashed like other rows. Digests for existing archives are derived on first load and written back when the tab holds the writer lease.
3. **Lazy archive loads.** Statistics and awards take digests. Full archives are loaded per fixture for replay (`loadMatchEventArchive(saveId, fixtureId)`), and in full only for export.
4. **Compressed storage.** New commits write archives to a new scope `CAREER_MATCH_EVENTS_GZIP_V1`: payload is base64 of gzip of the same canonical JSON, `sha256` is the hash of the uncompressed JSON, so integrity checks are unchanged after decompression. Readers accept both scopes. The ceiling counts stored bytes. Measured after implementation: 3.3 MB stored per season (14.4 MB raw), so about 38 seasons at 128 MB.
5. **Compressed export.** A new archive version, `LC_PERSISTENT_WORLD_PORTABLE_V4`, carries `match-events.ndjson.gz` and `game.json.gz`. The reader decompresses with a hard cap on expanded bytes (the existing zip-bomb limits apply to expanded size). V1 to V3 readers stay byte-for-byte.

## Order of work

Each step is separately testable and keeps old saves readable:

1. digest function plus equivalence test;
2. statistics and awards consume digests;
3. digest storage and per-fixture replay loads;
4. compressed storage scope;
5. V4 export.

## Out of scope

- Pruning old archives. Not needed if 40 seasons fit; it would also lose replays.
- Raising `MAX_PERSISTENT_SEASONS` (200). The binding limit becomes the archive ceiling: about 38 seasons, measured.
- The world state itself (1.6 MB after one season, 2.5 MB after two) is rewritten on every commit; storing completed seasons once and referencing them is separate work (audit M1).
