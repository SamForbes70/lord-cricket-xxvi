# Managed-match recovery

A managed match is a match played from a career fixture. The match checkpoint and the career are separate durable records. Until this change the link between them lived only in `sessionStorage`, so closing the tab or browser left a restorable match that could never return its result.

## Ownership

| Thing | Owner | Where it lives |
| --- | --- | --- |
| Match checkpoint | Match worker | `games` and `snapshots` stores, save id `auto:<matchGameId>` |
| Career state | Career application service | Season rows in the `games` store |
| Link between them | Binding repository | `settings` store, key `managed-binding:<matchGameId>` |

The binding is an identity record only. It holds the career save id and kind, the match, fixture and season ids, the schedule hash, the career state hash, the validated launch, a status and a hash of its own content. It is never used to infer a result.

## Life cycle

1. The career writes a `PENDING` binding before it navigates to the match. Repeating the same launch is a no-op. A different pending binding for the same match is rejected.
2. The match worker restores the checkpoint. If the restored game is the managed lineage (`auto:<gameId>` or a `recovered-*` copy) and a pending binding exists, the controller is re-bound through its normal BOOT checks. Manual copies and imports are never bound.
3. A request to start a fixture that already has a match resumes that match. It does not start a second one, and a first commit refuses to replace an existing save (`SAVE_ALREADY_EXISTS`).
4. When the career opens, every pending binding of that career whose checkpoint is complete is applied from the saved match through the existing season commit, then marked `APPLIED`. A repeat is detected as the same completion and changes nothing. A conflicting completion is reported and nothing is overwritten.
5. A binding becomes `ABANDONED` when the player abandons the match (the match is kept as an exhibition), or when the fixture was completed another way (for example the manager simulated it).
6. A damaged binding is preserved and reported. It is not repaired, used or deleted.

"New exhibition" is refused while the active match has a pending binding. The player either finishes the match or abandons it explicitly.

## Writer leases

The lease lasts 12 s and is renewed every 4 s. The page now releases it on `pagehide` (best effort) and a restored match that is read-only retries for about 30 s, so reopening shortly after closing recovers on its own. A live lease held by another tab is never taken over.

## Crash-point coverage

| Interruption point | Covered by | Status |
| --- | --- | --- |
| After binding, before match start | Abandon-and-resume spec (resume starts the same fixture once) | Chromium |
| Tab closed mid-match | Fresh-tab spec, retained-profile spec | Chromium |
| Match completed, career not updated | Lost-tab spec (career applies it with no match page) | Chromium |
| After career commit, before binding cleared | Unit test: applying the same result twice is a no-op | Unit only, not crash-injected in a browser |
| Conflicting completion | Unit test: conflicting hash is rejected | Unit only |
| Damaged match checkpoint | Existing recovery to a `recovered-*` slot; binding follows the game id | Not run as a managed-match browser case |
| Live lease in another tab | Existing M4 read-only spec; retry never takes over | Not run as a managed-match browser case |
| Stale or mismatched binding | Controller identity checks and unit tests on binding validity | Unit only |
| Standard, edited-world and imported-roster | Each has a browser spec; the edited-world spec checks the edited team and ground names come back from the bound world copy | Chromium |
| Career itself recovered into a new slot | Browser spec damages the newest career checkpoint; the pending match link follows the career into the `recovered-*` slot and Play match resumes the same match. Unit tests cover the re-key | Chromium |

## Evidence boundary

Local runs are Linux with Chromium only (Firefox is not installable on that host). Hosted GitHub Actions on commit `233f049` also passed: the Linux job, and the Windows job running the browser UI suite and the career suite in Chromium and Firefox, including every recovery spec and the retained-profile restart in both browsers. Hosted Windows is not the owner's PC. The owner-PC checklist, reference hardware and any human observation are not established. V01-011 stays `IN_PROGRESS` until the owner accepts it.

## Known limits

- A career recovered into a new `recovered-*` slot moves its pending bindings with it (`rekeyCareer`). If that move fails, the match is reported and not applied: nothing is applied to a career the binding does not name. Applied and abandoned bindings stay under the original id as history.
- The interface has no career delete action, so no binding clean-up on delete is needed today. `removeForCareer` exists and is unit tested for when one is added. Deleting a match save from the save list leaves its binding pending; playing the fixture again then starts it fresh, the same as an interruption before the match began.
- Imported-roster careers are not recovered into a new slot automatically (the page asks for an explicit recovered copy first), so they have no re-key path.
