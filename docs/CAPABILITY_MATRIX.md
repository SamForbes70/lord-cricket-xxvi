# Capability matrix: Pass 11 / M5B

| Capability | Status and boundary |
| --- | --- |
| M0 approved world | Original 160 players, 8 squads and 8 grounds; gameplay data unchanged |
| M1 scorer | Inherited supported scoring rules; full scoring regression retained |
| T20 engine | `LC_T20_MATCH_V1`; inherited 100-match replay/resimulation corpus passes |
| ODI engine | `LC_ODI_MATCH_V1`; inherited 50-over browser and unit regressions pass |
| Red-ball engine | `LC_RED5_MATCH_V1`; up to four innings with deterministic event stream and replay |
| Red-ball rules | `LC_RED5_01`: two innings per team, no fixed innings ball allocation, no bowler quota/circle restriction, no free hit |
| Match clock | Five days, 11:00 start, lunch 13:00-13:40, tea 15:40-16:00, scheduled close 18:00 |
| Day 1-4 extension | May continue to 18:30 while pursuing 90 legal overs; no carry of unbowled overs |
| Final hour | Day 5 from 17:00; scheduled time and legal-ball obligation must both be satisfied |
| Lost time | Deterministic red-ball rain-delay rules event implemented; final-hour obligation reduction tested |
| Declarations | Available between deliveries |
| Follow-on | Optional at a 200-run first-innings lead; explicit `A,B,B,A` order supported |
| New ball | Available after 480 legal balls; resets ball age without resetting innings overs |
| Red-ball result arbitration | Innings victories, fourth-innings target, completed tie and time-expiry draw implemented |
| Browser exhibition | T20, ODI and five-day red-ball available through normal production UI; both teams manually controlled |
| M4 persistence | Atomic autosave, resume, checkpoints, writer leases, manual slots and `.lcxxvi` export/import retained for all three formats |
| Portable archive pins | Explicit T20, ODI and RED5 engine/rules/event-chain allow-list |
| Automatic stochastic weather schedule | Not enabled in M5B; rules-side lost-time handling is implemented |
| Limited-overs rain / DLS | Disabled; no target is invented or approximated |
| Tactical opponent AI | Unavailable; both teams are controlled manually |
| M5 other formats | **Complete for the bounded V0.1 T20, ODI and five-day red-ball exhibition profiles** |
| M6 league/training | Next stage; deferred in this pass |
| M7 tactical AI/calibration | Deferred; model status remains `SYNTHETIC_ALPHA` |
| Certified ICC rules / empirical realism | Unclaimed |
| Formal M3 human acceptance | Still pending as a separate acceptance record |
