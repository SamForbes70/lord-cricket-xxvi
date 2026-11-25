# Project Pavilion: direction of 25 November 2026

The owner's development review of 25 November 2026 endorsed the current direction and set the priorities below. This page records that direction, how it maps onto the existing roadmap, and the expanded statistical acceptance criteria. It changes no code and marks no gate as passed.

Design principle, in the owner's words: "Make one match compelling. Make one team memorable. Make one season rewarding. Then expand the cricket universe."

## 1. Immediate priorities and where each stands

| # | Priority (owner) | Work | State on 25 November |
| --- | --- | --- | --- |
| 1 | Finish verifying and integrating the outstanding Pavilion pull requests in dependency order | #122 to #126, then #128, #129, #131 (approved order); #130, #119, #120 merged | In progress |
| 2 | Finish P04 stage A, including regenerating the projected-total (B7) and win-probability (B9) datasets | #132 (shared selector, approved to merge when green); dataset regeneration follows once #122 is on `main` | In progress |
| 3 | Investigate the bowling-allocation problem behind the six-bowler rule; an AI bowling strategy that keeps enough eligible bowling all innings | Branch `pavilion/p04-bowling-plan` | In progress (section 3) |
| 4 | P04 stage B: versioned, context-aware batting policy | Approved; after stage A | Not started |
| 5 | P04 stage C research and validation; no activation of a new authoritative model without explicit release approval | Approved to start | Not started |

## 2. Expanded statistical acceptance criteria

These are added to the existing calibration gates (section 5 of `P04_CALIBRATION_DIAGNOSIS.md`: mean runs, wickets, dots, boundaries, score quantiles). The aim is believable cricket, not higher totals.

**How every criterion is tested:**
- The reference is the Cricsheet men's T20 data (Open Data Commons Attribution 1.0, owner-supplied, not redistributed), split by date into calibration, validation and a final holdout used once. This is the same split rule as M7G.
- The game side is a fixed set of seeded matches or seasons on the model under test, with both captains on the policy under test.
- Each criterion reports the game value, the reference value and a bootstrap interval that resamples matches, not balls.

**The tolerances are proposals for the owner to confirm or change.** [Inference] They are judgements about what a player would notice, not measured thresholds.

| Criterion | What is measured | Reference | Proposed acceptance |
| --- | --- | --- | --- |
| Player skill differentiation | Strike rate and average of the top and bottom quarters of batters by rated skill; economy and strike rate of the top and bottom quarters of bowlers | Spread of the same statistics across real players with at least 100 balls faced or bowled in a season | The game's top-to-bottom ratio lies within the middle 80% of the real ratio's bootstrap distribution, and the order is never inverted |
| Tactical risk and reward | Runs per ball and dismissals per ball at each aggression level, by phase and wickets lost | Real phase-by-wickets scoring and dismissal rates (aggression is not observed directly, so the test is on the trade-off's shape) | Each step up in aggression raises both runs and dismissal risk. No level is best in every match state, checked by the existing exploitation gates (no exploit). |
| Batting and bowling specialisation | Average and strike rate of positions 1 to 7 against 8 to 11; economy of specialist bowlers against part-time bowlers | Real averages by batting position; real economy of frontline against part-time bowlers | The ratios are within 15% of the real ratios |
| Value of wickets in hand | Runs added from over 11 to the end, by wickets lost after 10 overs | The same curve from real first innings | Strictly decreasing with wickets lost, and each band's mean within 10% of the real band's |
| Phase-specific aggression | Run rate and wicket rate in the powerplay, middle and death overs | Real: 7.35, 7.18 and 9.10 runs an over (M7E holdout) with matching wicket rates | Each phase's run rate within 0.5 an over and wicket rate within 10% of real. The death overs are the fastest-scoring phase. |
| Partnership distributions | Runs per partnership: median, 90th percentile and share of 50-plus stands, overall and by wicket | Real partnership distributions | Median and 90th percentile within 15%; share of 50-plus stands within 3 percentage points |
| Close finishes and upsets | Share of results decided in the last over or by 10 runs or fewer or 2 wickets or fewer. Win rate of the weaker side, grouped by rated strength gap. | Real close-finish share. Upsets have no direct real equivalent for fictional teams, so the gap-to-win-rate curve is judged for shape. | Close-finish share within 5 percentage points of real. The win rate falls steadily as the gap widens, and the clearly weaker side still wins between 20% and 40% of matches. The upset band is an owner judgement. |
| Realistic individual performances | Per 100 innings: ducks, 50s and 100s. Per 100 bowling innings: 3-wicket and 5-wicket hauls. Distribution of a bowler's economy for the match. | Real per-innings and per-spell distributions | Each rate within 25% relative, or 1 per 100 for rare events; economy quantiles within 0.5 an over |
| Career-level statistical distributions | Season and career batting averages, strike rates, wickets and economy across a 20-season career soak | Real season and career distributions for players with enough balls | Quantiles (10th, 50th, 90th) within 15%; no impossible careers (for example, a tail-ender averaging more than the top order over a career) |

**Order of work:**
- The criteria that need only ball-by-ball match data (phase, wickets in hand, partnerships, individual performances, specialisation) can be measured first, against stage A and stage B.
- Skill differentiation and the career distributions need the calibrated model (stage C) and a season soak, so they are measured there.
- Nothing is marked passed until the owner accepts the tolerances and the measurement.

## 3. The six-bowler rule and the bowling-allocation fix (priority 3)

**What was found:**
- Stage A's selector at first carried five bowling-capable players. On the corpus, the fixture autopilot then hit `LC_T20_NO_ELIGIBLE_BOWLER` when driven by the tactical captain, so the selector was raised to six.
- The cause was not the eleven. The tactical captain (`LC_T20_TACTICAL_CAPTAIN_V1`, and the one-day V1) picked its favourite available bowler with only a soft penalty for scarce quota.
- That can spend the quota so that, late in an innings, the only bowler with overs left bowled the previous over. The rules allow five-bowler elevens, so this is reachable in any match.
- Measured with five-bowler elevens on the 100-seed corpus, both sides on the captain: **90 of 100 matches stopped with no eligible bowler.**

**The fix, on branch `pavilion/p04-bowling-plan`:**
- `canCompleteBowling` (in `packages/ai`) says whether the remaining overs can still be bowled under the quota and the no-consecutive-overs rule. It is checked against an exhaustive search on over 5,000 cases.
- Captain V2 (T20 and one-day) keeps V1's preference order, but never picks a bowler after whom the innings cannot be completed. With the same elevens: **0 of 100.**
- The player's own bowler choices already had the same guard (`apps/web/src/match/bowler-plan.ts`, from 18 November). It now calls the same shared function.
- Policy choices are recorded as match commands, so replays and saves are unaffected.
- With the captain fixed, the suggested eleven's minimum of six bowlers becomes a cricket choice (a spare bowler) rather than a workaround. Whether to keep six is left to the owner.

## 4. Experience workstreams, placed on the existing roadmap

These four workstreams are not a parallel backlog. Each extends roadmap phases P06 to P15 (`P01_AUDIT.md`, item B10 to B16). They start once the current match improvements are consolidated, in the order of the design principle: one match, then one team, then one season.

| Workstream | Scope (owner) | Roadmap phases it extends | Starts after |
| --- | --- | --- | --- |
| **Pavilion Atmosphere** | Broadcast-quality presentation, lightweight event-driven animation, stadium environments, crowd reactions, sound, contextual spoken commentary | P06 animation; P07 commentary and sound (written commentary slices #124 to #126 already built) | Integration of #119 to #126; the human playtest of the consolidated build |
| **Pavilion Discovery** | Scouting uncertainty, youth development, emerging talent, recruitment competition, meaningful player development | P09 scouting; builds on the existing lifecycle and youth academy (Stage 3) and squad economy (Stage 4) | Stage C skill differentiation measured, so that development changes outcomes a player can see |
| **Pavilion Personality** | Temperament, ambition, leadership, confidence, mentoring, loyalty, player relationships | P08 personalities; uses the existing stories (Stage 11) | Discovery's first slice, so personalities attach to players the player has chosen |
| **Pavilion Legacy** | Club history, rivalries, managerial reputation, career progression, job offers, records, honours, emergent stories | P10 reputation; P11 news; P12 almanac; P14 connected competitions; P15 honours (awards from Stage 10) | One complete season is rewarding (career-season evaluation, section 5) |

P13 (scenarios) already exists as Stage 12 and stays under Atmosphere for presentation work.

**Every workstream keeps these rules:**
- Presentation is grounded in events.
- Presentation and analytics never use the authoritative random stream.
- Persisted formats are versioned before they are widened.
- Each slice is a separate pull request with owner approval.

## 5. Human acceptance

**Match playtest:**
- The match playtest protocol is in #128 (`docs/pavilion/PLAYTEST_PROTOCOL.md`).
- It is to be run by the owner, or by people the owner chooses, against the consolidated build.
- Automated tests are not a substitute and are not reported as evidence of enjoyment.

**Career-season evaluation:**
- A separate career-season evaluation is defined in `CAREER_SEASON_EVALUATION.md`.
- It covers recruitment, selection, training, league progression, player attachment, and the wish to start another season.

## 6. Architecture, governance and CI

**Unchanged:**
- Deterministic simulation, existing save compatibility, event-grounded presentation and independently versioned statistical models all stay.
- So do the branch, pull request, verification and owner-approval rules.

**CI optimisation, without weakening coverage.** The Windows browser job runs the Chromium and Firefox suites one after the other, taking 60 to 120 minutes.
- **First proposal:** split it into two parallel jobs, one per browser, each producing the same evidence. Same tests, about half the wall time.
- **Second:** cache the Playwright browser download.
- Each goes in its own pull request with before-and-after timings, after #131 (time limit) lands.
