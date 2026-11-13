# Managed-match recovery

A managed match is a match played from a career fixture. The match checkpoint and the career are separate durable records. Until this change the link between them lived only in `sessionStorage`, so closing the tab or browser left a restorable match that could never return its result.

## Ownership

| Thing | Owner | Where it lives |
| --- | --- | --- |
| Match checkpoint | Match worker | `games` and `snapshots` stores, save id `auto:<matchGameId>` |
| Career state | Career application service | Season rows in the `games` store |
| Link between them | Binding repository | `settings` store, key `managed-binding:<matchGameId>` |

The binding is an identity record only. It holds the career save id and kind, the match, fixture and season ids, the schedule hash, the career state hash, the validated launch, a status and a hash of its own content. It is never used to infer a result.

Standard careers scope new `matchGameId` values by both `careerSaveId` and `seasonId` (`career-match-<careerSaveId>-<seasonId>-<fixtureId>`, `apps/web/src/career/managed-game-id.ts`) while resolving pre-existing legacy `career-match-<fixtureId>` bindings and checkpoints transparently so multiple careers or manual career copies in the same browser profile never collide.

## Life cycle

1. The career writes a `PENDING` binding before it navigates to the match. Repeating the same launch is a no-op. A different pending binding for the same match is rejected.
2. The match worker restores the checkpoint. If the restored game is the managed lineage (`auto:<gameId>` or a `recovered-*` copy) and a pending binding exists, the controller is re-bound through its normal BOOT checks. Manual copies and imports are never bound.
3. A request to start a fixture that already has a match resumes that match (preferring the newest valid `recovered-*` copy when the original `auto:<gameId>` checkpoint is damaged). It does not start a second one, and a first commit refuses to replace an existing save (`SAVE_ALREADY_EXISTS`).
4. When the career opens, every pending binding of that career whose checkpoint is complete is applied from the saved match through the existing season commit, then marked `APPLIED`. A repeat is detected as the same completion and changes nothing. A conflicting completion is reported and nothing is overwritten.
5. A binding becomes `ABANDONED` when the player abandons the match (the match is kept as an exhibition), when the player deletes the underlying managed match save from `#exhibition`, or when the fixture was completed another way (for example the manager simulated it).
6. A damaged binding is preserved and reported. It is not repaired, used or deleted.

"New exhibition" is refused while the active match has a pending binding. The player either finishes the match or abandons it explicitly.

## Writer leases

The lease lasts 12 s and is renewed every 4 s. The page releases it on `pagehide` (best effort) and a restored match that is read-only retries for about 30 s, so reopening shortly after closing recovers on its own. A live lease held by another tab is never taken over.

## Crash-point coverage

| Interruption point | Covered by | Status |
| --- | --- | --- |
| After binding, before match start | Abandon-and-resume spec (resume starts the same fixture once) | Chromium, Firefox |
| Tab closed mid-match | Fresh-tab spec, retained-profile spec | Chromium, Firefox |
| Match completed, career not updated | Lost-tab spec (career applies it with no match page) | Chromium, Firefox |
| After career commit, before binding cleared | Unit test: applying the same result twice is a no-op | Unit |
| Conflicting completion | Unit test: conflicting hash is rejected | Unit |
| Damaged match checkpoint | Dedicated managed-recovery browser spec (`recovered-*` slot resumes and applies once) | Chromium, Firefox |
| Live lease in another tab | Dedicated managed-recovery browser spec (second tab stays read-only, never steals writer lease) | Chromium, Firefox |
| Stale or mismatched binding | Controller identity checks and unit tests on binding validity | Unit |
| Standard, edited-world and imported-roster | Each has a browser spec; edited-world spec checks edited team and ground names | Chromium, Firefox |
| Career or roster career recovered into a new slot | Standard automatic recovery and roster `Create recovered copy` both call `rekeyCareer` so pending match links follow into the new slot | Chromium, Firefox, Unit |

## Evidence boundary

Container and hosted CI runs verify automated Chromium and Firefox behaviour, including all nine recovery specs in `tests/ui/managed-recovery.spec.ts` and `playwright.m4.config.ts`. Hosted Windows and Linux containers are not the owner's PC. The owner-PC checklist, reference hardware and human acceptance remain separate gates. V01-011 stays `IN_PROGRESS` until the owner accepts it.

## Known limits

- Both standard careers (automatic recovery) and imported-roster careers (`Create recovered copy`) move pending bindings into the new slot via `rekeyCareer`. If that move fails, the match is reported and not applied: nothing is applied to a career the binding does not name. Applied and abandoned bindings stay under the original id as history.
- The interface has no career delete action, so career-level binding clean-up is not exposed in UI today (`removeForCareer` exists and is unit tested). Deleting a match save from the `#exhibition` save list abandons its pending binding if no other checkpoint for that `matchGameId` remains.
