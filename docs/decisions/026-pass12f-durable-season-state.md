# ADR 026 — Pass 12F durable season state, recovery and archive

Status: accepted for Pass 12F.

## Decision

Persist the management season as a separate `SEASON` record type inside the existing M4 IndexedDB database and exact store set. Do not create a second database or a parallel save framework.

The authoritative aggregate is `LC_T20_SEASON_STATE_V1`. It binds the immutable season schedule, V2 career condition/training state, `LC_T20_SEASON_PROJECTION_V1`, and the ordered canonical match-completion records. The aggregate carries a canonical SHA-256. Validation also re-hashes the embedded schedule and career state and reconciles fixture/match/source identities across completion, projection and condition ledgers.

Season commits use the existing writer-lease concept and a single IndexedDB transaction across `games`, `snapshots`, `commands`, `settings` and `projections`. Three checkpoint generations rotate by checkpoint serial modulo three. A failed transaction is unacknowledged. Recovery never overwrites a corrupt generation; it selects the newest older checkpoint whose bytes, outer state, schedule and career hashes validate.

Existing M4 match saves retain their old row shape. Match save listing filters the additive `SEASON` records, preserving compatibility without rewriting old save bytes.

The portable season `.lcxxvi` archive uses the same bounded store-only ZIP parser as M4 and contains `manifest.json`, `game.json`, `events.ndjson` and `projection.json`; a complete season additionally contains `season-archive.json`. `events.ndjson` is the canonical match-completion journal, not a second simulation event stream. File bytes and hashes are declared in the manifest and checked before exposure.

`LC_T20_SEASON_ARCHIVE_V1` is created only from a reconciled 56-fixture complete state. It freezes champion, final table, leaders, completion keys and the final season-state hash. It is immutable data; continuing into another season is explicitly outside V0.1.

## Boundaries

Pass 12F does not add the management UI, a second career year, transfers/contracts, injuries, DLS or tactical M7 AI. Projection semantic rebuilding remains owned by `@lcxxvi/projections`; Pass 12F proves rebuild equivalence in its acceptance corpus rather than creating a duplicate projection implementation in persistence.

The fresh browser IndexedDB verification source is included and builds, but this execution host blocks all browser navigation before application code executes. That gate must be recorded as BLOCKED unless it executes successfully in a browser-capable release environment.
