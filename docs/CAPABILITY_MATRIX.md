# Capability matrix: Pass 12C / M6C

| Capability | Status and boundary |
| --- | --- |
| T20/ODI/red-ball match engines | Inherited unchanged from Pass 11 |
| M4 match persistence | Inherited unchanged; career/season persistence not yet implemented |
| Fictional world | Frozen `fictional-eight-01`, 160 players / 8 teams / 8 grounds |
| T20 competition contract | `LC_T20_LEAGUE_01` implemented |
| Season schedule | `LC_T20_SEASON_SCHEDULE_V1`, deterministic 14 rounds / 56 fixtures |
| Career condition V1 | Implemented and retained unchanged from Pass 12B |
| Career state V2 | Implemented with training policy/readiness and deterministic V1→V2 migration |
| Career-day progression | Explicit pure Gregorian `ADVANCE_DAY`; no ambient clock |
| Availability | Manual fixture-pack unavailable dates; no random injuries |
| Match fatigue input | Exactly-once, schedule/date/squad-bound V1 and V2 application paths |
| Training directives | `REST`, `BATTING_PRACTICE`, `BOWLING_PRACTICE`, `FIELDING_PRACTICE` |
| Rest recovery | 2,000 fatigue bp per elapsed career day |
| Practice recovery | 1,400 fatigue bp per elapsed career day |
| Temporary readiness | Batting/bowling/fielding signed range -3..+3; relevant practice +1/day, otherwise decay 1 toward zero |
| Permanent attribute growth | Disabled; training never mutates frozen base player skills |
| Training persistence | Directive persists until explicitly changed |
| Player form | Deferred and separate from readiness |
| AI/off-screen fixture execution | Deferred to Pass 12D |
| League table / NRR | Policy contract pinned; reducer deferred to Pass 12E |
| Season statistics | Deferred to Pass 12E |
| Season persistence/archive | Deferred to Pass 12F |
| Full 56-match season acceptance | Deferred to Pass 12G |
| Tactical opponent AI | Deferred to M7; fixture autopilot must not be presented as tactical AI |
| Limited-overs DLS | Disabled |
| Model status | `SYNTHETIC_ALPHA` |
