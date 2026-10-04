# ADR 006: Fixture-first scoring boundary

Accepted for Pass 02. Follow the Pass 01 Scoring Fixtures handoff. Create independent expected values before a scorer. No scorer, state reducer, sampler, roster generator or playable match is introduced.

## DeliveryResolution and ScoringContext

DeliveryResolution is adjudicated pre-scoring input. It has raw run channels, completed/attempted physical runs, legality, explicit end occupancy and supporting contact/dismissal facts. It does not have legalBall, countsAsBallFaced, freeHitNext or creditedBowlerId. Those belong to the expected DeliveryRecorded output. This avoids letting the sampler assign derived scorekeeping facts.

ScoringContext is a small boundary fixture snapshot, not a replacement for MatchState. It carries immutable participant identities, starting ends, base-profile allocation, legal-ball/attempt indexes and free-hit/target state. Global attempt indexes must not precede innings legal-ball counts. Limited-overs contexts use the pinned base allocations of 120/300; rain-adjusted allocations remain unsupported. A future adapter must map a fully validated MatchState into this context.

IMMEDIATE_PENALTY means the automatic wide or no-ball alone ends the chase. No subsequent bat contact, running or dismissal is allowed. A delivered no-ball still counts as faced under the design's explicit supported profile, even when its automatic run wins. freeHitNext is recorded on no-balls but cannot schedule play after completion. DEAD is an early dead attempt: no score, wicket or legal-ball charge; its recorded attempt index advances.

End occupancy is at the end of the resolved delivery, before replacement selection. strikerEndAfter reflects only the change of facing end at over completion. For run-outs, an explicitly specified survivor end is authoritative; wicket end alone cannot infer whether batters crossed or turned back. The eight mandatory matrix cases specify crossing on the attempted second run; S18 explicitly describes an abandoned single and return to the starting ends.

## Validator scope

The pure domain validator rejects inconsistent run channels, illegal supported dismissals, unsafe arithmetic, inconsistent physical ends and non-truncated winning extras. It parses strict schemas and returns validated input without changing state or emitting events. It is not an umpire, scorer, command-authority service or exhaustive cricket-laws validator. Leg-byes require attempted stroke under the supplied simplified model. Penalty runs are rejected as UNSUPPORTED_PENALTY until a separate administrative scoring contract is implemented; the old Extras schema still retains its reserved penalty field.

## Fixture ownership

corpus.json is committed full JSON with manually specified numeric expectations, rationale and source references. Shared neutral values were expanded during authoring; expected scores were not produced by a scorer or random engine. No fixture generator executes in verification. The index locks IDs and SHA256 bytes. Changes require reviewing expectations and updating the index intentionally. Formatting excludes the golden corpus to avoid incidental digest changes.

Fixture audit tests conservation/attribution arithmetic, schema validity, supported resolution rejection and expected event ordering. They do not execute terminal, clock, NRR or persistence implementations. assertScoringObservation is ready to compare future adapter output against the whole expected record. Its control test checks the harness with a known value and mutations; it does not stand in for an engine. `npm run fixtures:engine` deliberately exits 2 with SCORER_NOT_IMPLEMENTED.

The original 54 schema files retain their existing meanings. Ten new schemas use separate stable URNs; fixtureVersion is 1.0.0. Existing save schema 1.0.0 is not redefined and no new engine version is claimed.
