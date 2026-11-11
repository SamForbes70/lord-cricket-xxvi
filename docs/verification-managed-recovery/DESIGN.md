# Durable managed-match recovery: implementation notes

The match and season share the `lord-cricket-xxvi` IndexedDB database, but their checkpoints and leases are separate. `sessionStorage` currently contains the launch and pending result. A new tab can restore the match checkpoint without restoring the launch, so the controller cannot construct a career result.

## Required transitions

1. Before launching, persist a versioned binding with the career save ID and revision/hash, fixture and match IDs, schedule hash, selections and world/roster identity. Validate the binding using `CareerFixtureLaunchSchema` and against the loaded career. Reject a damaged or stale career without creating or changing the match.
2. Associate the binding with the specific match save, rather than relying on a global last-launch value. Preserve the original binding when a checkpoint is damaged or a writer lease is unavailable. A different active match must not have its pointer changed merely because recovery was requested.
3. On restart, identify the matching durable match and validate its game ID, match ID, world/roster and fixture before binding the controller. Respect existing match and career writer leases; do not silently claim another tab's lease.
4. A completed match must be able to regenerate its result from the validated binding and durable match checkpoint after interruption. Apply it through the existing season commit with revision checks. Clear the binding only after the career commit succeeds, and make retry after a crash between those steps detect the same completion. Reject a conflicting completion.
5. Cover standard, edited-world and imported-roster careers, expired and live leases, stale/mismatched bindings, damaged checkpoints, portable archives and crash points before and after the career commit. Preserve older saves without silently changing their meaning.

The current worker's `BOOT` branch clears the active pointer when the requested fixture differs from the restored active match. Recovery must distinguish starting a new match from a mismatched recovery and must not use that branch to discard an existing active pointer. Existing `completeUserMatch` already detects duplicate versus conflicting completions, but it depends on receiving a valid result; the binding and result must survive a new browser session for that protection to be useful.

No implementation or acceptance is claimed by this document. The fresh-tab regression remains intentionally failing.
