# ADR 024: Pass 12D deterministic off-screen fixture execution

## Status
Accepted for Pass 12D / M6D.

## Context
M6 needs league fixtures to complete without creating a second, cheaper cricket simulator. The V0.1 design requires AI matches to execute in fixture-ID order with independent match seeds and requires results/statistics/fatigue to be applied exactly once. Passes 12A-C already provide the frozen 56-fixture schedule, career-day condition state, manual availability and temporary training readiness.

Tactical captain AI remains an M7 concern. Pass 12D therefore needs a transparent baseline policy that can finish a match without pretending to be a calibrated tactical opponent.

## Decision
1. Off-screen matches run the existing `LC_T20_MATCH_V1` engine through the existing `LC_FIXTURE_CAPTAIN_V1` fixture captain. No alternate scorer, probability model or fast-result approximation exists.
2. `LC_T20_OFFSCREEN_POLICY_V1` pins the match engine, XI-selection policy, fixture captain and condition-delta policy.
3. `LC_SEASON_XI_BASELINE_V1` excludes manually unavailable players, requires one keeper and at least five non-keeper bowling-capable players, then deterministically ranks candidates by supported T20 skill sum plus the temporary readiness rating in its corresponding area. Lower fatigue is a stable tie-break only because V0.1 does not yet define a calibrated fatigue-to-selection-rating conversion.
4. The selected XI order is the batting-order baseline. The highest-ranked selected player is captain because no captaincy attribute exists in the frozen player contract.
5. Each scheduled fixture uses the immutable Pass 12A `matchSeed`, home ground, match ID and home/away pair. Match setup still passes through the full frozen-world/hash validator.
6. Off-screen outcomes carry event-chain, command/event-log, scorecard and match-condition hashes. Hash validation is additive; it does not replace semantic validation.
7. Match-condition deltas are derived only from the final in-match fatigue values already produced by `LC_T20_MATCH_V1`. Pass 12D does not invent unsupported batting or fielding fatigue constants.
8. The career reducer applies each condition delta exactly once. A second attempt to execute an already-applied fixture is rejected at the off-screen execution boundary.
9. A round is executed in lexicographic fixture-ID order. A managed user team may be supplied; exactly that team's fixture is skipped so the caller can pause before human match play.
10. Table/NRR, season statistics, season persistence and tactical opponent AI remain deferred.

## Consequences
- All 56 league fixtures can now be completed headlessly using the same canonical engine as interactive T20 play.
- Training readiness and manual availability can influence XI selection without changing frozen base player ratings or the accepted T20 engine.
- Career fatigue is fed back from real engine output rather than fabricated post-match estimates.
- The baseline fixture captain is intentionally simple and must not be described as M7 tactical AI.
- Full M6 remains incomplete until table/NRR, statistics, season persistence/archive and management navigation are added.
