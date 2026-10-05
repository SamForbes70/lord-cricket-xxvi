# Capability matrix: Pass 12E / M6E

| Capability | Status and boundary |
| --- | --- |
| T20/ODI/red-ball match engines | Inherited unchanged from Pass 11 |
| M4 match persistence | Inherited unchanged; career/season persistence not yet implemented |
| Fictional world | Frozen `fictional-eight-01`, 160 players / 8 teams / 8 grounds |
| T20 competition | `LC_T20_LEAGUE_01`, 14-round / 56-fixture double round robin |
| Career condition and availability | Implemented through Pass 12B |
| Training/readiness | Implemented through Pass 12C; no permanent attribute growth |
| Off-screen fixture execution | Pass 12D; same `LC_T20_MATCH_V1` engine, no alternate simulator |
| Season projection | `LC_T20_SEASON_PROJECTION_V1` implemented |
| Points table | 2 win / 1 tie or no-result / 0 loss |
| Table tie-break | Points, wins, exact NRR, head-to-head mini-table points, stable ascending team ID |
| Net run rate | Exact rational ranking; all-out innings use 120 balls; successful chases use actual legal balls; no-results excluded |
| Player season totals | Matches, runs, dismissals, balls, boundaries, bowling runs/balls/wickets/maidens |
| Rate projections | Batting average, strike rate, bowling average, economy and bowling strike rate as deterministic fixed-point hundredths; zero denominators null |
| Season leaders | Top runs and wickets with stable player-ID fallback |
| Projection exactly-once | Duplicate identical completion ignored; conflicting completion rejected; cursor exposes missing fixture ordinals |
| Full 56-match projection corpus | Implemented and hash-pinned |
| User-played match adapter | Shared completion contract exists; UI/controller integration deferred |
| Season persistence/archive | Deferred to Pass 12F |
| Management UI/navigation | Deferred |
| Full season acceptance | Deferred to Pass 12G |
| Tactical opponent AI | Deferred to M7; fixture captain remains baseline autopilot |
| Limited-overs DLS | Disabled |
| Model status | `SYNTHETIC_ALPHA` |
