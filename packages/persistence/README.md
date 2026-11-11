# Persistence package

This package owns browser durability and portable archives. It does not decide cricket outcomes. Read this alongside the [engineering guide](../../docs/ENGINEERING_GUIDE.md) and the actual source on the revision being changed.

## Source and public boundaries

| Source | Principal boundary | Purpose |
| --- | --- | --- |
| [index.ts](src/index.ts) | `IndexedDbSaveRepository`, `DurableCommit`, `LoadResult` | Match saves, command receipts, checkpoints, writer ownership, delegation journal |
| [season.ts](src/season.ts) | `IndexedDbSeasonRepository`, `SeasonDurableCommit` | Standard and imported-roster career persistence, validation and recovery |
| [archive.ts](src/archive.ts) | `createPortableArchive`, `readPortableArchive` | Match archive encoding and validation |
| [archive.ts](src/archive.ts) | `createSeasonPortableArchive`, `readSeasonPortableArchive` | Standard career portable archives |
| [archive.ts](src/archive.ts) | `createRosterSeasonPortableArchive`, `readRosterSeasonPortableArchive` | Imported-roster career portable archives |

These are in-process TypeScript APIs, not HTTP endpoints. Consult the exported types for exact arguments and return shapes. A documentation example must not become an alternate implementation of validation.

## Storage layout

Both repositories open IndexedDB `lord-cricket-xxvi`, database version 1. Database layout version and payload schema versions are different concepts. Both repository initialisers create the shared stores; a future layout change must reconcile both paths.

| Store | Key | Responsibility |
| --- | --- | --- |
| `games` | `saveId` | Save metadata and revision identity |
| `snapshots` | `[saveId, generation]` | Checkpoint payloads and integrity metadata |
| `events` | `[saveId, sequence]` | Accepted match events |
| `commands` | `[saveId, commandId]` | Durable command identity and receipts |
| `worldPacks`, `modelPacks`, `rulePacks` | `hash` | Pack storage slots; inspect current callers before assuming all are populated |
| `projections` | `[saveId, scope, key]` | Derived data storage |
| `settings` | `key` | Namespaced operational pointers, leases, delegation journals and managed-match bindings (`managed-binding:<matchGameId>`) |

Sharing stores does not make career completion and match persistence one atomic transaction. The match checkpoint can survive while a browser-session-only career handoff disappears.

## Commit and recovery invariants

Match commits validate and hash input before opening the write transaction. The transaction includes games, snapshots, events, commands, settings, projections and world packs. It checks writer ownership and expected durable revision. A first commit (`expectedRevision: null`) throws `SAVE_ALREADY_EXISTS` if the save id exists; it never replaces a save. `list()` omits career rows of both kinds (`SEASON` and `ROSTER_SEASON`). Do not add unrelated asynchronous work inside an IndexedDB transaction: transaction activity must remain valid until all dependent requests are submitted.

Match and season writer lease durations are currently 12 seconds. The match worker renews its lease every 4 seconds and becomes read-only if renewal fails. A new browser session has a new owner id, so it cannot write until the old lease expires or is released; the pages release it on `pagehide` (best effort) and retry for about 30 seconds, and never take over a live lease. A live lease owned elsewhere prevents writing; renewal requires current, unexpired ownership. Release must only remove the releasing owner's lease. Time used for ownership is operational metadata, not a source of simulation randomness.

Keep three match checkpoint generations. Recovery must validate candidate identity and integrity rather than selecting the latest timestamp alone. A recovered state is not permission to overwrite the original without preserving the supported recovery path.

New-game presentation copies and imported roster packs are immutable inputs for an existing save. Match commit rejects missing required packs, conflicting world types and changed identities. The supported schema families are base, presentation, roster and delegation; portable archive versions have their own dispatch. Read the constants and validators before extending any family.

## Imports and backups

`.lcxxvi` identifies the portable archive format. Import validates structure, supported versions, pins, hashes and semantic relationships. A matching checksum alone establishes neither trusted input nor compatibility. Export/import and manual save copies serve different user needs; test the specific path being changed.

Browser storage belongs to an origin and browser profile. Copying the repository or replacing a build does not copy IndexedDB. Clearing site data can remove careers. Use supported exports for user backups and disposable browser profiles for destructive test cases.

## Managed-match bindings

`ManagedMatchBindings` (in [binding.ts](src/binding.ts)) stores a hash-checked record per managed match that links a career fixture to its match. It is written before the match launches, resolved to `APPLIED` or `ABANDONED`, and never used to infer a result. A damaged record is reported and preserved. Writes are compare-and-set. The global active match pointer is not proof of career ownership; only a binding is. See [the recovery notes](../../docs/MANAGED_MATCH_RECOVERY.md) for the life cycle, ownership and crash-point coverage.

## Verification entry points

- [Match persistence tests](../../tests/unit/persistence-m4.test.ts).
- [Season persistence tests](../../tests/unit/season-persistence.test.ts).
- [Career service tests](../../tests/unit/career-application-service.test.ts).
- [Imported-roster career tests](../../tests/unit/roster-season.test.ts).
- [Binding rules and result regeneration](../../tests/unit/managed-binding.test.ts), and the real-IndexedDB [binding spec](../../tests/m4/managed-binding-persistence.spec.ts).
- Browser save/reload, archive and fresh-session checks in the [verification guide](../../docs/VERIFICATION_GUIDE.md).

Pure unit tests do not establish browser IndexedDB transaction behaviour. Keep real browser coverage for leases, interrupted saves, imports and session recovery.
