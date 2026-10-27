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

A reload during the scheduled interactive match can reattach the career fixture context to the inherited persisted match when IDs match.

## Persistence and recovery

Career creation is not shown as Saved until the first Pass 12F repository commit succeeds. Later management mutations acquire/renew the writer lease, require the durable revision, seal a new canonical season state and commit through the existing repository transaction. UI save states distinguish Saving, Saved, Read-only, Recovered and Error.

Recovered saves are continued into a fresh recovered slot while the damaged source is preserved. Portable import is validated before the imported career becomes active.

## Accessibility target

The production Playwright suite is written for 1366 x 768, keyboard operation and 150% in-app text scale. Large tables are horizontally scrollable, controls are labelled and colour is not the sole status indicator. Recorded Linux and hosted Windows runs pass the portable management browser suite.
See [current status](CURRENT_STATUS.md) for evidence and local-PC acceptance limits.
