# Lord Cricket XXVI: Pass 09 / M4 report

**Result: PASS for the automated M4 Persistence, Recovery and Portable Saves gate.**

**Formal M3 human acceptance remains PENDING.** This report does not represent automated navigation as a human playthrough. Strict milestone progression to M5 should still record the M3 human checklist before treating the prior milestone as formally accepted.

Pass 09 was built from the exact Pass 08 complete package. The Pass 08 report identifies its delivered source as commit `dca7ff0070f0c89c3e680cb9fd4ae684304a29bd`; the imported local baseline is preserved as commit `764ffb5`. No cricket probability coefficients, scoring rules, random algorithm, fictional world records or accepted T20 event-chain identifiers were intentionally changed by M4.

## Delivered

Pass 09 adds a durable boundary around the existing worker-owned `LC_T20_MATCH_V1` session rather than creating a second save-state reducer.

- IndexedDB stores for games, three rolling snapshot generations, canonical events, command identities, world/model/rule pack namespaces, projections and settings.
- Command-batch atomicity: an accepted setup or command is not acknowledged as durable until its IndexedDB transaction commits. Revision comparison and the writer lease are checked inside the same storage transaction.
- Autosave on every accepted setup/command in the current manual T20 UI, which is stricter than the design minimum of over/mandatory-decision checkpoints.
- Three rolling SHA-256 checkpoint generations. If the newest checkpoint fails its hash, the previous valid generation is rehydrated into a new recovered slot and the damaged source is preserved.
- Deterministic restore: a stored `T20Session` is not trusted as authoritative state. Setup is validated and the stored command history is replayed through the production match engine. Revision, event stream, core state, receipts, execution manifest and event-chain hashes must agree before the save is accepted.
- Writer leases with revision checks. A second tab can inspect the active game but cannot issue match-changing commands while the first tab owns the lease.
- Manual local save copies, active-save loading/deletion and command-history preservation across save slots.
- Portable `.lcxxvi` archives with `manifest.json`, `game.json` and `events.ndjson`. Manifest byte counts and SHA-256 hashes are over the exact stored bytes. Imports reject unsafe paths, CRC failure, excessive archive/file sizes, unknown files, schema drift, incompatible engine/event-chain/random/model/rules/world pins, tampered payloads and event-stream mismatch before a game is exposed.
- `LC_T20_UI_V2` adds persistence requests/responses while leaving the gameplay engine/event-chain/random identifiers unchanged.
- Production UI shows Saved, Saving/failure, read-only and recovery states; provides Save copy, Export current, Import, Load and Delete; and keeps match-critical controls within the inherited 1366x768 / 150% acceptance boundary.
- The dependency-free packaged server now reports that local autosave is enabled rather than the obsolete M3 session-only warning.

The V0.1 starting world remains the approved fictional eight-team, 160-player world and the model remains `SYNTHETIC_ALPHA`. ODI, red-ball, DLS, league management, training, tactical opponent AI and empirical calibration remain excluded.

## Atomicity and recovery behaviour

The live sequence is now:

`human request -> worker/engine provisional result -> IndexedDB command-batch transaction -> durable commit -> UI acknowledgement`

If the durable write fails, the provisional controller state is discarded and the worker reloads the last durable checkpoint. An injected transaction abort is covered by browser testing and leaves no partial command batch behind. Duplicate command identities do not create another delivery or revision. Manual/imported/recovered slots retain historical command identities so duplicate-conflict protection survives save movement.

A recovery audit found one metadata edge case during this pass: an older valid checkpoint could be restored while `load()` still returned the damaged game's newest summary metadata. This was repaired so the returned summary reflects the recovered checkpoint, while the original damaged save record remains untouched. Unknown local save-schema versions are now explicitly rejected.

## Portable archive behaviour

`LC_ARCHIVE_V1` is deliberately narrow. V0.1 currently needs only `manifest.json`, `game.json` and `events.ndjson`; custom pack embedding is not enabled because no current playable save depends on a user-supplied world/model/rule pack. Built-in world, model and rule identities are pinned in the manifest. Unknown archive/save schema or engine/model/rule identities are rejected rather than silently upgraded.

The archive implementation uses bounded, uncompressed ZIP entries. The import path validates local-entry paths before exposure and enforces file-count, archive-size and expanded-size limits. The final audit changed payload hashes from decoded-text hashes to exact-byte SHA-256 hashes to match the technical design's archive requirement.

## Final verification

Environment: Debian GNU/Linux 13, Node v22.16.0, npm 10.9.2, Python 3.13.5 and system Chromium 144.0.7559.96.

A clean `npm ci` initially stalled on network retrieval. An explicit default-cache offline attempt then proved `zod` was absent from that cache. The exact pinned npm cache supplied with the accepted earlier build was extracted, after which `npm ci --offline --cache <pinned cache>` installed **208 packages in 3 seconds** from the lockfile. The final verification below was run after that clean install.

| Gate | Final result |
| --- | --- |
| Clean lockfile installation from pinned cache | PASS, 208 packages |
| Generated schemas | PASS, 98 |
| Production build | PASS |
| Typecheck | PASS |
| ESLint + package/ambient boundaries | PASS, all seven boundaries |
| Scoring regression | PASS, 45/45 delivery, 45/45 ledger, 29/29 invalid rejected |
| Deterministic random/state vectors | PASS, 24 + 8 |
| Independent probability vectors | PASS, 1601-entry Decimal LUT, 15 mass/draw vectors, 4 boundaries |
| Generator vectors | PASS, 9 fixtures |
| Unit suite | PASS, **415/415 across 13 files** |
| M4 Chromium browser suite | PASS, **6/6** |
| Current M3 Chromium UI regression | PASS, **3/3** |
| Fresh 100-match Node corpus | PASS, **100/100 replay + command resimulation** |
| Prebuilt production server smoke | PASS |
| Fresh Pass 09 Firefox | **BLOCKED: Firefox executable is not installed in this environment** |
| Formal human M3 playthrough | **PENDING** |

The final 100-match corpus processed 22,051 delivery attempts. Input corpus SHA-256 is `14fd1f01736fdfeed5686c927ea4570ac08591fe36552edf2a66ba0243f20014`; generated-records SHA-256 is `e8b45493cd3389fe2f05a509a17c8dc316eeb80a83dc30375596f4f0b5b360ae`.

The M4 Chromium tests prove: exact reload/resume and continuation; second-tab read-only lease behaviour; manual copy/export/staged import with preserved command history; corrupt-newest-checkpoint recovery without overwriting the damaged source; rollback after durable failure; and injected interrupted-transaction atomicity plus duplicate-command rejection.

The current Chromium UI evidence separately completes one keyboard-only match with replay identity and terminal controls, checks the desktop essential strip at 150% text scale plus reduced motion/narrow/long-name cases, and checks selection/tactics acceptance plus visible invalid-field rejection.

Fresh Firefox was not executable in this container, so no Pass 09 Firefox result is claimed. Pass 08 contains inherited Firefox M3 evidence, but it is not substituted for fresh M4 testing here.

## Defects found and repaired during Pass 09

1. **150% desktop regression.** Adding save controls initially pushed the next-decision strip roughly six pixels below the 768px acceptance boundary. Save management was moved below match-critical content and vertical spacing tightened. The 150% test passes on the final Chromium build.
2. **Ambiguous export control in automation.** Per-slot export created multiple controls named Export. The active action is now explicitly `Export current`; the final M4 suite is green.
3. **Historical command identities on copied/imported saves.** Initial copies preserved the snapshot but not the full durable command identity set. Copies/imports/recovery now seed command-history identities atomically, preserving duplicate-conflict protection.
4. **Manual save active-pointer side effect.** A manual copy could transiently become the active slot. Clone commits now support `setActive:false` and the current autosave remains active.
5. **Archive hashing semantics.** Payload hashes were changed from decoded-text hashing to SHA-256 of exact archive bytes.
6. **Recovery summary consistency.** Older-checkpoint recovery now reports metadata from the recovered checkpoint rather than the damaged newest revision.
7. **Obsolete packaged-server text.** The M3 warning that reload loses the match was removed from `start.mjs`.

None of these repairs changes T20 event-generation rules or accepted deterministic gameplay identifiers.

## Known limitations and residual risks

Persistence is browser-local IndexedDB. There is no account, cloud synchronisation or multiplayer coordination. V0.1 currently has one live save schema; no historical v1-to-v2 migration is required yet, and unsupported versions are rejected rather than guessed. `.lcxxvi` archives do not yet carry user-supplied custom packs because that capability is not enabled in the current playable slice.

The technical design's save p95 and load p95 performance budgets were not measured on the specified reference laptop, so this pass makes no formal performance-budget claim. The Vite production build also retains a non-fatal chunk-size warning for large runtime bundles.

Formal M3 human acceptance still needs to be recorded. That is a governance/acceptance dependency, not a missing M4 persistence mechanism.

## Milestone status and next stage

**M4 automated gate: PASS.** Atomic saves, reload/resume, rolling recovery, writer contention, manual slots and portable export/import are implemented and tested.

**M3 human acceptance: PENDING.** Record the supplied human playthrough checklist before calling M3 formally closed.

Once that acceptance record is complete, the next bounded implementation stage remains **Pass 10 / M5A: ODI exhibition format**, using the same deterministic event stream and newly durable persistence foundation. Red-ball match-clock/session mechanics should follow as a separate M5B pass rather than being mixed into ODI work.
