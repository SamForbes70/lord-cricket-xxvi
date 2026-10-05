# ADR 025: Pass 12E league table, NRR and season statistical projections

## Status
Accepted for Pass 12E / M6E.

## Decision
Season management uses one pure projection path, `LC_T20_SEASON_PROJECTION_V1`, over canonical completed T20 match records. Off-screen Pass 12D outcomes are adapted to `LC_T20_SEASON_MATCH_COMPLETION_V1`; a later user-played match must feed the same contract rather than maintain a second table or statistics implementation.

A projection records each fixture exactly once by fixture/match identity plus its source-completion hash. An identical retry is idempotent. A conflicting completion for an already-applied fixture is rejected. Completions may arrive out of fixture order; the cursor records the highest applied fixture ordinal and any missing ordinals so gaps are visible rather than silently treated as complete.

The table implements the frozen `LC_T20_LEAGUE_01` policy: two points for a win, one each for a tie or no-result, zero for a loss. Sorting is points, wins, exact net run rate, head-to-head points and ascending stable team ID. Head-to-head points are a mini-table among the teams still tied after points, wins and exact NRR. This makes the tie-break transitive for multi-team ties. A team without an eligible NRR denominator compares as exact zero for ranking while retaining a null displayed NRR value.

NRR never uses decimal overs. For each eligible match, an all-out innings contributes 120 denominator balls; otherwise it contributes its actual legal-ball count, including a successful chase. No-result matches contribute no NRR runs or balls. Exact NRR comparison uses integer rational cross-multiplication. `nrrX1000` is a display projection only and never controls ranking.

Player season totals are derived from canonical scorecard lines. Batting average, strike rate, bowling average, economy and bowling strike rate use the V0.1 definitions and are stored as deterministic fixed-point hundredths. Zero denominators remain null. Runs and wickets leaderboards use raw aggregate totals with stable player-ID tie-breaking; qualification rules for rate-stat leaderboards are deferred because V0.1 does not specify them.

Pass 12E does not persist season projections to IndexedDB and does not add a management UI. Pass 12F owns durable season state/archive and may persist this projection or rebuild it from canonical match completions, but must retain exactly-once semantics and verify recovery equivalence.
