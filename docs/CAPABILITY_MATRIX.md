# Capability matrix: Pass 10 / M5A

| Capability | Status and boundary |
| --- | --- |
| M0 approved world | Original 160 players, 8 squads, 8 grounds; unchanged gameplay data |
| M1 scorer | Inherited supported scoring rules; unchanged |
| T20 engine | `LC_T20_MATCH_V1`; inherited event-chain/hash regressions unchanged |
| ODI engine | `LC_ODI_MATCH_V1`; one 50-over innings per team, deterministic event stream and replay |
| ODI innings allocation | 300 legal balls unless all out or chase completes first |
| ODI bowler quota | 60 legal balls per bowler; same bowler cannot bowl consecutive overs |
| ODI field phases | Max 2 outside balls 0-59; max 4 outside 60-239; max 5 outside 240-299 |
| ODI model phases | `ODI_EARLY`, `ODI_MIDDLE`, `ODI_LATE` at the same legal-ball boundaries |
| ODI named fields | ODI-only registry adds `long-off`, allowing an actual five-outfielder late-innings field without altering T20 choices |
| ODI browser exhibition | Implemented through normal production UI; both teams manually controlled |
| M4 persistence | Retained for T20 and ODI: atomic autosave, resume, checkpoints, leases, manual slots and `.lcxxvi` export/import |
| Portable archive pins | Import accepts only an explicitly supported T20 or ODI engine/rules/event-chain pin set |
| Tactical opponent AI | Unavailable; both teams are controlled manually |
| Limited-overs rain / DLS | Disabled; no target is invented or approximated |
| Red-ball M5B | Deferred |
| M6 league/training | Deferred |
| M7 tactical AI/calibration | Deferred; `SYNTHETIC_ALPHA` |
| Certified ICC rules / empirical realism | Unclaimed |
| Formal M3 human acceptance | Still pending as a separate acceptance record |
