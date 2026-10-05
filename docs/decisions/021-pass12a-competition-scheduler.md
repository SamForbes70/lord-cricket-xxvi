# ADR 021: Pass 12A competition contracts and deterministic fixture scheduling

## Status
Accepted for Pass 12A.

## Decision
The first management-layer primitive is a pure, deterministic T20 season schedule. `LC_T20_LEAGUE_01` is a bounded eight-team competition contract and `LC_T20_SEASON_SCHEDULE_V1` is the schedule contract.

The scheduler:

- uses the circle algorithm over the lexicographically sorted eight stable team IDs;
- creates seven first-half rounds and reverses every venue in rounds 8-14;
- creates exactly four fixtures per round and 56 fixtures overall;
- spaces match days three calendar days apart using pure Gregorian arithmetic, never `Date`, `Date.now`, locale or host timezone APIs;
- pins each home fixture to the validated home ground from the frozen fictional world;
- derives fixture IDs, match IDs and independent match seeds from canonical SHA-256 state hashing;
- stores a canonical schedule hash over all schedule data except the hash field itself;
- validates every ordered home/away pair exactly once, every team once per round, seven home and seven away fixtures per team, unique fixture/match IDs and unique fixture seeds.

The schedule request pins the accepted `fictional-eight-01` canonical world hash. A mutated world under the same pack ID is rejected.

## Why
Pass 12B onward needs a fixture graph that is immutable, auditable and independent of runtime order. Later AI fixture simulation must be able to process fixture IDs in any batch shape without changing match outcomes. Independent fixture seeds establish that boundary now without implementing AI season play.

## Deliberate exclusions
Pass 12A does not implement season persistence, `AdvanceDay`, `SimulateRound`, league table calculations, NRR, match-completion application, player condition, training, availability, AI squad selection, season statistics or management UI. The competition manifest records future points/table policy, but no table reducer is implemented in this pass.

## Compatibility
Match engine, scorer, model, random service, rules and M4 save behaviour are unchanged. Pass 12A adds six strict JSON schemas and does not modify existing schema bytes.
