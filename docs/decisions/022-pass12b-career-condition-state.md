# ADR 022: Pass 12B career-day, availability and squad-condition state

## Status
Accepted for Pass 12B.

## Decision
Pass 12B adds a separate, deterministic career-condition layer around the frozen Pass 12A season schedule. Match engines continue to own in-match fatigue. The career layer owns between-match fatigue, elapsed-day recovery, manual availability and exactly-once application of accepted match-condition deltas.

`LC_T20_CAREER_DAY_STATE_V1` is bound to the exact season schedule hash, frozen world hash, availability-pack hash and `LC_T20_CAREER_CONDITION_V1` policy. It contains one condition record for each of the 160 frozen fictional players and a bounded ledger of match-condition completions.

Career dates advance with pure Gregorian arithmetic. No `Date`, timezone, wall clock, application-open time or other ambient host state is used. A normal rest day reduces fatigue by 2,000 basis points per player, clamped at zero. The policy also pins the future practice recovery constant at 1,400 basis points, but Pass 12B does not yet implement training assignments.

Manual unavailability is supplied through `LC_T20_AVAILABILITY_PACK_V1`. V0.1 does not generate random injuries. Availability is projected separately from fatigue, so being rested or fresh cannot silently make a manually unavailable player eligible.

Match fatigue enters the career state only through `LC_T20_MATCH_CONDITION_DELTA_V1`. A delta must reference a match in the exact bound schedule, use that fixture's match day and contain only players from the two scheduled squads. The match completion key and match ID are each applied at most once. Repeating an identical completion is idempotent; changing the payload under the same key or reusing a match under another key is rejected.

## Why
The management loop needs a durable deterministic state boundary before training, AI round simulation and league statistics can be added. Keeping career condition separate from individual match state avoids double-counting recovery, preserves replayability and lets later persistence commit one career transition atomically.

## Deliberate exclusions
Pass 12B does not implement training choice/readiness effects, `SimulateRound`, table/NRR, season statistics, AI squad selection, match-to-career fatigue derivation, IndexedDB career persistence or management UI. The match runner in a later M6 pass will calculate the accepted match-condition delta from canonical match events and then apply it through this boundary.

## Compatibility
Pass 12B does not modify scoring, random service, probability model, T20/ODI/red-ball match engines or M4 match persistence behaviour. Existing schemas remain byte-stable; this pass adds career-condition schemas only.
