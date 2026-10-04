# ADR 004: Resolve configuration without claiming behaviour

Accepted for Pass 01. Conditions uses a nested pitch object containing seamBp, turnBp, variabilityBp, moistureBp and wearPoints, followed by the Appendix G weather/ball/outfield fields. wearPoints is a non-negative counter rather than a basis-point quantity. ClockState retains the Appendix A shape; additional scheduling state must be versioned in a later pass.

TeamTactics follows Appendix G: battingPlans keyed by player ID, bowlingPlan, fieldSlots, nextBatterId and delegation. The semantic validator requires two correctly keyed plans and nine unique outfield players/slots. XI membership, keeper/bowler exclusion, handedness transformations and phase-specific legality remain future field-rule checks.

Bowling enum values are uppercase OFF/STUMPS/LEG, YORKER/FULL/GOOD/SHORT, CONSERVE/NORMAL/MAXIMUM. Full toss is an executed outcome only. Ground radii are eight positive integer centimetres. The neutral geometry, pitch, delegation booleans, weather weights and 30-minute segment constant implement Appendix G configuration only.

The minimal field registry resolves both required default T20 templates. Illustrative coordinates use 0 degrees towards the keeper, 180 towards the bowler, right-hand leg side at 0..180; sectors are nearest 45-degree centres. Metadata is explicit, never inferred from a slot name. Fine leg is deep. Default templates are tested for nine distinct slots, outside-circle counts (2 and 4), and the stated leg-side limits. Additional slots and left-hand transforms are deferred until field rules. This registry is not tracking data or a gameplay effect.

Rule manifests pin the document's intentional 2026 edition, not today's date. supportedClauses is empty and validationStatus is CONTRACT_ONLY. fixtureIds identify planned evidence, not passing scoring tests. No runtime claims ICC conformity. Model manifest schema exists; no fake LUT/model pack is published.
