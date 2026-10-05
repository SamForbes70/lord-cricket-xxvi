# ADR 023: Pass 12C training directives and temporary readiness

## Status
Accepted for Pass 12C.

## Decision
Pass 12C adds a versioned training layer on top of the accepted Pass 12B career-condition boundary without changing any match engine or base player skill. The prior `LC_T20_CAREER_DAY_STATE_V1` contract remains unchanged. Training uses `LC_T20_CAREER_DAY_STATE_V2`, with an explicit deterministic V1-to-V2 migration that preserves career identity, fatigue, availability binding, applied match completions and revision while adding neutral readiness and `REST` assignments.

`LC_T20_CAREER_TRAINING_V1` pins four mutually exclusive daily directives: `REST`, `BATTING_PRACTICE`, `BOWLING_PRACTICE` and `FIELDING_PRACTICE`. Each of the 160 frozen fictional players always has exactly one directive. Assignments persist until changed and are part of the career-state hash.

At `ADVANCE_DAY`, a resting player recovers 2,000 fatigue basis points. A practicing player recovers 1,400 basis points. Recovery is clamped at zero and is driven only by explicit elapsed career days. There is no wall-clock or application-open-time recovery.

Readiness is temporary and separate from base skills and form. Batting, bowling and fielding readiness each have the declared range -3 to +3 rating points. Relevant practice adds one point per day up to +3. Every non-practiced readiness area moves one point toward zero per day. `REST` moves all three readiness values one point toward zero. The V0.1 training reducer does not create negative readiness itself, but the signed contract and decay rule remain valid for future versioned inputs. No training operation mutates the frozen world pack or permanent player attributes.

Training changes use an optimistic revision boundary. A stale revision or wrong effective date is rejected. Repeating the already-active directive at the current revision is a no-op and does not create a spurious revision.

`LC_T20_MATCH_CONDITION_DELTA_V1` remains the exactly-once input for match fatigue. Pass 12C provides the equivalent V2 application path, still bound to the exact Pass 12A fixture, fixture date and participating squads. Match fatigue does not alter readiness.

## Why
The management game needs a controllable daily trade-off before AI fixture execution and table progression are added. Keeping readiness temporary prevents a single 14-round alpha season from becoming a permanent player-development system and avoids double-counting recent performance through both form and training.

## Deliberate exclusions
Pass 12C does not implement permanent attribute growth, form, injuries, physio, training facilities, coaches, workload optimisation, automated manager training plans, AI fixture execution, league table/NRR, season statistics, career IndexedDB persistence or management UI.

## Compatibility
All Pass 12B V1 career contracts remain valid and byte-stable. Pass 12C is additive: V2 is a new explicit state version, and migration is deterministic. T20, ODI, red-ball, random, probability, scoring, worker and M4 match-persistence implementations are unchanged.
