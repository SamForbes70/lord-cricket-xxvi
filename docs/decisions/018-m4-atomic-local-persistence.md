# ADR 018: M4 atomic local persistence and portable saves

## Status
Accepted for Pass 09 implementation.

## Decision
The existing worker-owned `T20Session` remains the only authoritative live match state. Persistence is a durability boundary around accepted commands, not a second reducer. The worker calculates a provisional result, then commits the command identity, new event rows, rolling snapshot pointer and save metadata in one IndexedDB transaction. Only a successful transaction is acknowledged as durable. A failed transaction restores the last durable session before replying.

IndexedDB contains the V0.1 stores `games`, `snapshots`, `events`, `commands`, `worldPacks`, `modelPacks`, `rulePacks`, `projections` and `settings`. Active games retain three checkpoint generations. Checkpoint hashes are validated at load; recovery uses the newest valid older generation and creates a distinct recovered save so the damaged source is not overwritten.

A writer lease prevents normal concurrent mutation from two tabs, with revision comparison still enforced inside the transaction. A reload preserves the browser-tab writer identity; a new navigation/tab receives a new identity. Lease identity is operational metadata and is not simulation randomness.

Portable archives use `.lcxxvi` and `LC_ARCHIVE_V1`. V0.1 writes uncompressed ZIP entries for deterministic, dependency-free packaging: `manifest.json`, `game.json` and `events.ndjson`. Import rejects unsafe paths, unsupported compression, excess size/file count, CRC/hash mismatches and incompatible engine/event-chain/PRNG/model/rules/world pins before a staged game becomes visible.

Persisted simulation state is never accepted merely because its checksum is valid. `rehydrateT20Session` revalidates the frozen setup, resimulates every stored command through `LC_T20_MATCH_V1`, then compares revision, events, core, receipts, execution manifest and event-chain heads with the stored snapshot.

## Compatibility
The UI wire contract advances to `LC_T20_UI_V2` because persistence request/response variants are additive public behaviour. Gameplay engine, scoring, event-chain, probability, random, model, stage and world identifiers remain unchanged.

Unknown archive pins are rejected in V0.1 rather than silently migrated. Future save-schema migrations must be explicit, sequential and pure.

## Verification
Pass 09 adds deterministic unit tests for save rehydration and archive tamper/path/version rejection, plus browser tests for reload/resume, writer leases, manual save/export/import, checkpoint recovery, rollback after save failure, transaction-abort atomicity and duplicate-command rejection.
