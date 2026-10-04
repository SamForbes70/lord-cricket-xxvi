# Capability matrix: Pass 08 / M3

| Capability | Status and boundary |
| --- | --- |
| M0 approved world | Original 160 players, 8 squads, 8 grounds; unchanged hashes |
| M1 scorer | Inherited supported scoring rules; unchanged |
| M2 match engine | Accepted LC_T20_MATCH_V1; unchanged rules/model/stage and LC_T20_EVENT_CHAIN_V1 |
| M3 manual browser exhibition | Implemented: team/XI/captain/keeper, toss, innings, batters/bowlers, aggression, supported bowling and named fields, delivery/over advance, both innings and final scorecard |
| UI authority | One worker; strict revisioned HUMAN requests, accepted-event projections; seed never returned |
| Tactical opponent AI | Unavailable; both teams are controlled manually. Fixture autopilot is QA only |
| Variation | Stock only; unavailable alternatives are not advertised |
| Accessibility | Keyboard and screen-size/scale/reduced-motion tests; no formal WCAG certification claim |
| Replay | In-memory event replay and command resimulation; display settings do not alter hashes |
| M3 final acceptance | Automated gates plus a recorded person completing the browser match without developer tools; no invented human sign-off |
| M4 save/import/export | Disabled; reload/close loses progress |
| M5 other formats | Deferred |
| M6 league/training | Deferred |
| M7 tactical AI/calibration | Deferred; SYNTHETIC_ALPHA |
| DLS, empirical realism, certified ICC rules | Disabled/unclaimed |
| Sam Forbes 161-player fantasy pack | Not included; later explicit opt-in pack with version/hash required |
