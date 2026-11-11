# @lcxxvi/persistence

IndexedDB persistence for matches, careers, portable archives and managed-match bindings. All of it shares one database, `lord-cricket-xxvi`, at schema version 1.

## Behaviour that matters to recovery

- **Writer lease.** 12 s (`WRITER_LEASE_MS`). The match worker renews it every 4 s while it holds it and becomes read-only if renewal fails. A new browser session has a new owner id, so it cannot write until the old lease expires or is released. The page releases the lease on `pagehide` as a best effort and retries for about 30 s.
- **First commit.** `commit()` with `expectedRevision: null` now throws `SAVE_ALREADY_EXISTS` if the save id exists. It never replaces a save. Later commits compare `expectedRevision` with the durable revision and throw `SAVE_STALE_REVISION` on a mismatch.
- **Match save list.** `IndexedDbSaveRepository.list()` omits career rows of both kinds (`SEASON` and `ROSTER_SEASON`). Career rows share the `games` store.
- **Checkpoints.** Three validated generations. A damaged newest generation recovers an older one into a new `recovered-*` slot and the damaged original is kept.
- **Managed-match bindings.** `ManagedMatchBindings` stores hash-checked records under `managed-binding:<matchGameId>` in the `settings` store, with compare-and-set writes. See `docs/MANAGED_MATCH_RECOVERY.md`.

The persistence package holds no ambient clock. Callers pass time in.
