# ADR 013: Conditional generator, stage pack and immutable draw-address registry

**Status:** ACCEPTED FOR SOURCE IMPLEMENTATION ONLY. Pass 06.0 acceptance is BLOCKED until the inherited Pass 05.1 and new production gates genuinely pass.

## Decision and implementation boundary

`LC_CONDITIONAL_DELIVERY_V1` is a one-attempt, pure staged source implementation within `packages/simulation`. It consumes the already-pinned `LC_INTEGER_PROBABILITY_V1` and `SHA256_COUNTER_V1`, validates a strict complete request and pinned hashes before drawing, and returns a deeply frozen internal trace with one scorer-validated `DeliveryResolution`. It does not generate a complete match, modify a score, allocate a new batter or schedule the next bowler. The compiled batch adapter delegates to the existing `LC_SCORING_V1` after generation. Browser workers expose the same one-shot generator without owning match state.

The prior model pack `synthetic-alpha-01`, its LUT, the Pass 02 scoring corpus, Pass 04 vectors and Pass 05 vectors remain byte-identical. New delivery-only provisional Appendix F parameters live in **additive** `synthetic-alpha-01-delivery-v1`, SHA-256 `34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a`. Both packs carry `SYNTHETIC_ALPHA`; there is no calibration claim. Changing draw order, stage meanings, synthetic coefficients or hard-coded branch interpretations requires a new generator or stage-pack identifier; neither existing probability-model nor random generator identifier is silently revised.

## Frozen random addresses

All draws are SHA-256 over the same six-position JSON address. Delivery addresses use the hidden original match seed, `MATCH_DELIVERY` domain, `${matchId}:${inningsIndex}` entity ID and the **global delivery-attempt ordinal**, including wides and no-balls. A stage/draw-index registry is checked into `generator.ts`:

| Variable | stageName | drawIndex |
|---|---|---:|
| Intended-to-executed length | `length` | 0 |
| Legality | `legality` | 0 |
| Contact | `contact` | 0 |
| Sector | `sector` | 0 |
| Immediate dismissal | `dismissal` | 0 |
| Stumping | `dismissal` | 1 |
| Catch chance | `fielding` | 0 |
| Catch conversion | `fielding` | 1 |
| Physical runs / extras | `running` | 0 |
| Run-out | `running` | 1 |
| Threatened run-out end | `running` | 2 |

The generator asserts no duplicate six-position address in its trace. A skipped stochastic stage does not consume or advance a mutable cursor. Its internal trace includes the hidden seed and must never be passed into AI, commentary or public projection DTOs.

## Explicit Appendix F interpretations and limitations

* The eight sectors are grouped as off 0,1,2; straight 3,4; leg 5,6,7. This grouping is an **explicit implementation convention**, not derived from measured field geometry. Full named-slot geometry and phase-aware field legality are outside Pass 06. Nine outfield IDs, distinct players, sector ranges, slot depth and limited slot roles are validated. Upstream orchestration must supply a legal field under the selected profile.
* Effective movement uses centred pitch assistance and centred rating in basis points; the fatigue feature is nonnegative. All new categorical paths use the pre-existing integer LUT and exact `2^32` mass conversion. Rounding and cumulative category tie order remain untouched.
* The Appendix F catch conversion and run-out logits are provisional, not empirical. Stumping's `0.003 * sigmoid(keeping)` is converted to a one-billion-unit weighted binary distribution before the integer categorical normaliser. Its discretisation is independently testable; it does not use floating-point exponentiation.
* The generator records fixed `40` elapsed seconds as a pinned provisional stage-pack constant. This is not a validated cricket clock. Weather updates and fatigue recovery remain separate future behaviour. There is no live match orchestration.
* Full physical LBW pitch tracing is not claimed: Appendix F's synthetic leg-line outside-leg flag simply masks LBW. Unsupported bowling variations are rejected. Wides bypass contact; no-balls can proceed through it; a winning automatic extra truncates before any later stochastic outcome. Drop outcomes can continue through runs. Only supported dismissals pass through existing `validateDeliveryResolution`.
* A verification-discovered chase edge case required pre-sampling masking for ordinary two/three-run outcomes when fewer runs remain. This avoids creating invalid physical runs past the winning run. A four/six remains a full awarded boundary even when it exceeds the target. The correction affects only new `LC_CONDITIONAL_DELIVERY_V1` behaviour before release; it does not modify any older frozen contract or fixture.

## Verification and compatibility

Nine generator fixtures have independently calculated SHA-256 digests for 48 stage addresses and independent fixed-point length/legality mass oracles. One execution of the actual transpiled TypeScript generator, probability model and domain validator under explicitly stated dependency substitutes covered 1,200 synthetic seed scenarios; **these checks do not count as Zod/AJV parity, workspace build, Vitest, compiled-production or real-browser verification**. All mandatory prior and new gates must pass again before Pass 06 or a baseline freeze is declared.

Full delivery orchestration, seed lifecycle, match progression, player roster, empirical calibration, AI captaincy, DLS and durable saves are out of scope.

## Hardening defects and repairs

1. **Chase mask before sampling.** A first review found that statistically selected two/three-run outcomes could exceed a one-run chase target, causing the scorer's valid stop-at-target boundary to reject an otherwise generated delivery. The generator now masks non-boundary physical-running categories above the remaining target before the integer sampler draws, while retaining full four/six boundary awards. A frozen-seed regression checks both the mask and score acceptance. This behaviour is part of the new, not-yet-released `LC_CONDITIONAL_DELIVERY_V1`; it does not change `LC_SCORING_V1`, `SHA256_COUNTER_V1` or `LC_INTEGER_PROBABILITY_V1`.
2. **Capability disclosure.** The Pass 05 runtime status and browser shell initially still said the generator was absent. Both now distinguish implemented one-attempt generation from blocked production verification and absent playable matches.
3. **New schema count and CI.** The old 84-schema assertion now includes the four new Pass 06 contracts (88 structural mirrors). CI provisions both Chromium and Firefox for the full mandatory worker test instead of Chromium alone. The new mirror files are independently checked against the Draft 2020-12 metaschema, but their byte-exact Zod-generated parity and production AJV compile remain blocked pending pinned npm dependencies.
4. **Dependency manifest.** `packages/simulation` now explicitly declares the existing `@lcxxvi/domain` workspace dependency for the scorer-validation boundary, with only the corresponding workspace lockfile metadata updated. No third-party dependency version changed. All 84 historical schema files, scoring and determinism fixtures, probability vectors and original probability pack retain their bytes.
