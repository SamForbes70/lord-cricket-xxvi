# Pass 12G-R management application

## Boundary

The management UI does not own cricket truth. It renders and commands `CareerApplicationService`, which orchestrates the accepted Pass 12A-F systems. React state is limited to screen selection, transient UI status and display preferences.

## Routes and screens

The default application route is the management career. `#exhibition` opens the inherited exhibition / interactive match application.

Management screens are Home, Career, Squad, Fixtures, Statistics and Settings. The UI exposes the fixed one-season product boundary and labels fictional data, `SYNTHETIC_ALPHA` and disabled DLS.
Interactive T20 matches provide optional tactical captain delegation; the fixture autopilot remains a separate baseline policy.

## Managed fixture integration

`Simulate match` executes through the accepted off-screen fixture policy and `LC_T20_MATCH_V1`.

`Play match` creates a revision-bound launch payload containing the scheduled fixture identity, immutable match seed, scheduled ground and accepted XI snapshot. The existing match worker runs the normal T20 controller. On terminal completion it emits a hash-bound `LC_CAREER_USER_MATCH_RESULT_V1` containing the scorecard, final event hash and the shared engine-derived condition delta. The career service verifies the scorecard and source-completion hashes before applying the result exactly once through the canonical `USER_MATCH` completion boundary.

Before an interactive career match launches, a hash-checked durable binding record (`managed-binding:<matchGameId>`) is written into the IndexedDB `settings` store (`packages/persistence/src/binding.ts`). Closing and reopening the tab or browser restores the match via `RECOVER_MANAGED` without going through the exhibition reset path, applies completed results to standard, edited-world and imported-roster careers once even when no match page is open, moves pending bindings when a damaged career is copied into a recovered slot, blocks exhibition resets while a career match is pending, and offers an explicit `Abandon career match` control (`docs/MANAGED_MATCH_RECOVERY.md`).

## Persistence and recovery

Career creation is not shown as Saved until the first Pass 12F repository commit succeeds. Later management mutations acquire/renew the writer lease, require the durable revision, seal a new canonical season state and commit through the existing repository transaction. UI save states distinguish Saving, Saved, Read-only, Recovered and Error.

Completed career fixtures seal versioned ball-by-ball event logs (`LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1`, bounded to 1 MiB per fixture and 16 MiB per season) in the IndexedDB `projections` store (`CAREER_MATCH_EVENTS_V1`) and portable `.lcxxvi` archives (`LC_T20_SEASON_PORTABLE_V3_EVENT_ARCHIVES`). The `Career` and `Fixtures` screens expose `View replay` to reconstruct innings and delivery history from the preserved event chain without recomputing random outcomes. Earlier v1 saves without stored event logs remain playable without silent migration and report replay unavailability explicitly; damaged fixture event logs are isolated per fixture without invalidating career standings.

Recovered saves are continued into a fresh recovered slot while the damaged source is preserved. Players can inspect all three checkpoint generations (`Checkpoints` / `Inspect checkpoints`), see any corrupted generations isolated explicitly, and recover a chosen validated older generation into a named new career slot. Save and archive failures present plain-English explanations, recovery guidance and diagnostic codes. Manual copies, `.lcxxvi` export/import and checkpoint recovery remain keyboard reachable. Portable import is validated before the imported career becomes active.

## Accessibility target

The production Playwright suite is written for 1366 x 768, keyboard operation and 150% in-app text scale. Large tables are horizontally scrollable, controls are labelled and colour is not the sole status indicator. Recorded Linux and hosted Windows runs pass the portable management browser suite.
See [current status](CURRENT_STATUS.md) for evidence and local-PC acceptance limits.
