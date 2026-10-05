# Capability matrix: Pass 12A / M6A

| Capability | Status and boundary |
| --- | --- |
| T20/ODI/red-ball match engines | Inherited unchanged from Pass 11 |
| M4 persistence | Inherited unchanged; season persistence not yet implemented |
| Fictional world | Frozen `fictional-eight-01`, 160 players / 8 teams / 8 grounds |
| T20 competition contract | `LC_T20_LEAGUE_01` implemented |
| Season schedule contract | `LC_T20_SEASON_SCHEDULE_V1` implemented |
| Fixture scheduler | Deterministic circle algorithm, 14 rounds, 56 fixtures |
| Venue reversal | Rounds 8-14 reverse corresponding first-half venues |
| Match-day spacing | Three calendar days using pure deterministic date arithmetic |
| Team frequency | Exactly once per round; 14 fixtures per team |
| Venue balance | Exactly 7 home and 7 away per team |
| Fixture identity | Stable fixture and match IDs plus canonical schedule SHA-256 |
| Fixture randomness boundary | 56 independent canonical match seeds; no shared mutable RNG |
| World/ground trust | Frozen world hash and all home-ground references validated |
| League points/table policy | Contract pinned; reducer/table calculation not implemented yet |
| Career day commands | Deferred to Pass 12B/12C |
| Player condition/availability | Deferred to Pass 12B |
| Training/recovery | Deferred to Pass 12C |
| AI/off-screen fixture execution | Deferred to Pass 12D |
| NRR/table reducer | Deferred to Pass 12E |
| Season persistence/archive | Deferred to Pass 12F |
| Full 56-match season acceptance | Deferred to Pass 12G |
| Tactical opponent AI | Deferred to M7; not disguised as fixture autopilot |
| Limited-overs DLS | Disabled |
| Model status | `SYNTHETIC_ALPHA` |
