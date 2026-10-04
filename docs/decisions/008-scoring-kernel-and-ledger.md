# ADR 008: Pure scoring and atomic innings reduction

Accepted for Pass 03. Scoring engine identifier: LC_SCORING_V1. The first implemented scorer must not be conflated with a complete match engine.

## Responsibilities

scoreDelivery validates ScoringContext + DeliveryResolution and produces one DeliveryRecorded. It assigns legal-ball/faced flags, bowler dismissal credit and next free-hit state. It does not update a state object.

reduceScoringBoundary consumes a recorded event and computes safe integer deltas, new totals, physical ends, over completion, innings termination, limited-overs chase results and the next required action. This is the production path used by the actual ScoringFixtureAdapter. It has no access to fixture IDs, descriptions or expected values.

reduceInningsLedger applies the boundary to the authoritative InningsState and separate batting/bowling lines. It records extras, dismissal details, legal-ball quotas, boundaries, maidens and the next global delivery index. All public transitions validate the input, clone it through strict parsing, and validate the resulting ledger. A failed transition leaves the caller's input unchanged. Safe integer addition applies to every cumulative scoring counter.

applyDeliveryResolution combines the scorer and ledger reducer. selectInningsBatter fills the one empty end with an undismissed, inactive batting-order member. selectInningsBowler works only after an over and required batter decision, rejects the previous bowler or an exhausted quota, and requires explicit replacement outfield identities.

## Atomic over consequence

The innings reducer applies the whole delivery boundary, including an over-end facing-end change and clearing bowlerId. OVER_COMPLETED is a notification produced by that boundary; it must not be applied again as a second innings mutation. A future full-event replay dispatcher must route statistical/administrative notifications accordingly. This pass does not implement that dispatcher or satisfy the total full-MatchState EventReducer port.

The result/innings decision precedes selection consequences. A completed over is still recorded statistically on the final winning delivery. A continuing sixth-ball wicket requests the batter before the bowler. No further delivery/selection is accepted after the innings is complete.

## Ledger invariants

Bat runs plus extras equal innings runs. Bowler concessions exclude byes, leg-byes and penalties. Sum of bowler legal balls equals innings legal balls. Sum of batter balls faced equals legal balls plus delivered no-balls under this custom profile. Dismissal records reconcile exactly with bowler wicket credits. Eleven batting and bowling identities, unique occupied ends, dismissal flags, quota counters, ball-age counters and terminal state must agree.

Maiden status uses bowler-conceded runs in the completed over. Byes alone can coexist with a maiden. A wide before the first legal ball has zero legal-ball remainder but positive current-over runs; therefore a zero legal-ball remainder must not be interpreted as an empty over.

## Event validation limitation

Stored DeliveryRecorded does not retain raw attemptedStroke or batContact evidence. Revalidation checks only facts available in the accepted event; raw evidence was checked at scoreDelivery. Trajectory metadata alone is not used to invent bat contact. Replay integrity still requires the future hash-chain/version service. This API rejects structurally or semantically inconsistent recorded facts but cannot authenticate a fabricated, internally coherent event.

Duplicate/out-of-order deliveries are rejected by nextDeliveryIndex. That is not persisted command-id idempotency: duplicate command receipts and transactional saves remain M4 work.

## Closed profile scope

The three supplied base profiles are supported. Runtime rule-pack loading, rain-adjusted allocations, declarations, follow-on/aggregate red-ball result arbitration, the match clock and full-match orchestration remain outside this pass. A supplied chase target can be resolved locally; no red-ball aggregate target is computed here. No stochastic generator or world data is introduced.
