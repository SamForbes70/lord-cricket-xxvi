# Captain V5: a realistic death-overs bowling plan

Owner-approved captain-policy change, 26 November 2026: fix the research model's too-tight death overs in the captain, as a new versioned policy `LC_T20_TACTICAL_CAPTAIN_V5`, not with a death-overs run term. Branch `pavilion/captain-v5`, based on `main` at `d9bb921`. No change to `synthetic-alpha-01`, the research packs, the engines, the generator, contracts or any persisted format (section 7). The research model `calibrated-t20-01` stays unselectable. No gate is claimed as accepted. The holdout (2025-08-30 onward) was not read.

**Why.** Stage C slice C5 ([C5_TACTICS_AND_REFIT.md](stage-c/C5_TACTICS_AND_REFIT.md), section 6) found the research model's death overs too tight: 8.47 runs an over against 9.75 real, 26.3% dots against 18.8%. It named two likely captain causes: about 74% executed yorkers at the death, and about a quarter of death balls batted at aggression 2.

## 1. Method

**Matches.** The frozen 100-seed corpus (`tests/fixtures/t20/seed_corpus.json`), suggested elevens, the same captain on both sides. Repeats 0 to 9 (repeat r > 0 appends `-c1r<r>` to the seed, the stage C convention): 1,000 matches for each cell. First innings only for the run and wicket tables, as in C5.

**Script.** `scripts/pavilion-captain-v5-measure.ts` runs the batch step's public view with a captain made of two parts, so the causes separate:

- `--bowling`: V4's death plan (a yorker at maximum effort) or V5's (section 3);
- `--batting`: `LC_T20_BATTING_POLICY_V1` (V4) or `LC_T20_BATTING_POLICY_V2` (V5);
- `--advance`: `OVER` (one ADVANCE command bowls the rest of the over, as the batch step did up to V4 and as every C5 measurement did) or `DELIVERY` (one ball, so the captain is asked before every ball, as the live game asks the computer opponent).

Bowler choice, field intent and the powerplay and middle-overs plans are identical in V4 and V5; the script checks that on every call and stops if they differ.

**Definitions** (as `scripts/stage-c/c4-analyse.py`). Phases are overs 1 to 6, 7 to 15 and 16 to 20. Runs an over include extras. A dot is a legal ball with no run of any kind and no wicket ("dot %, wicket balls excluded"); the innings dot % counts wicket balls as dots, as C5's aggregate does. Wicket, four and six % are per legal ball. Brackets are 95% match-bootstrap intervals (1,000 resamples, fixed seed). Head to head and tactical validation use 95% Wilson intervals for win shares and a normal interval for the paired run difference, as `scripts/pavilion-tactical-validation.ts` does.

**Real yardsticks.** Only the calibration split: full-member men's T20 internationals, first innings, fit period (to 2023-08-31, 835 innings) and selection period (2023-09-01 to 2025-08-24, 166 innings), read from the tracked `docs/pavilion/stage-c/c5-delivery-after.json` (`real.fit`, `real.selection`). Nothing was fitted to them in this pass.

## 2. Diagnosis (captain V4)

### 2a. The plan and the batting at the death (first innings, 1,000 matches)

| | `calibrated-t20-01` | `synthetic-alpha-01` |
| --- | --- | --- |
| Death balls planned as a yorker at maximum effort | 100% | 100% |
| Executed length (yorker / full / full toss) | 71.1 / 24.1 / 4.7% | 74.2 / 21.6 / 4.2% |
| Death balls batted at aggression 2, over at a time | **26.8%** (4.55 an over; 14.4% of death runs, 17.1% of death wickets) | **28.6%** (4.97 an over) |
| of which the policy itself wanted 3 or 4 (stale or default plan) | 14.9 points | 7.8 points |
| of which the policy held at 2: three or fewer wickets left | 4.9 + 1.6 points | 10.1 + 3.1 points |
| of which the policy held at 2: a tail-ender on strike | 5.5 points | 7.5 points |
| Death balls at aggression 4 | 65.5% (10.11 an over; 78.0% of death runs) | 63.5% (6.99 an over) |
| Death balls batted at aggression 2, ball by ball | 14.6% (4.00 an over) | 21.5% (4.85 an over) |

The "1.6" and "3.1" points are balls where both holds applied. Source: `docs/pavilion/captain-v5/measure-*-OVER-V4-V4.json` and `measure-*-DELIVERY-V4-V4.json` (`deathFirstInnings`).

**A third cause, found while measuring: the harness asked the captain once an over.** `apps/batch/src/tactical-match.ts` returned the fixture autopilot's `ADVANCE { scope: "OVER" }` once its plans matched. The batting plan is set for the striker only, so a batter who took strike later in the over (or came in after a wicket) batted on an older plan, or the engine's default of aggression 2. In the research model that accounts for 14.9 of the 26.8 points of death balls at aggression 2. The live game is not affected the same way: its passages advance one ball at a time and ask the opponent before each ball (`apps/web/src/main.tsx`), although a person who presses "Finish over" bowls the rest of the over on the plans in force.

Aggression by phase in the first innings (V4, ball by ball; % of legal balls at levels 2 / 3 / 4; no ball was at 0 or 1): research powerplay 28 / 72 / 0, middle 79 / 21 / 0, death 15 / 4 / 81; live death 22 / 7 / 71 (`aggressionSharePercentByPhase`). Under V5 the research death is 0 / 19 / 81 and the live death 0 / 29 / 71. Second-innings aggression follows the required rate and was not changed.

### 2b. Separating the causes (first innings, death overs, 1,000 matches each)

| Cell | `calibrated-t20-01`: runs an over | wickets % | dots % | `synthetic-alpha-01`: runs an over | wickets % | dots % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V4, over at a time (as C5 measured) | 8.49 (8.32 to 8.68) | 8.56 | 26.2 | 6.31 (6.17 to 6.44) | 10.29 | 51.9 |
| V4, ball by ball | 8.97 (8.80 to 9.16) | 9.38 | 22.9 | 6.41 (6.28 to 6.55) | 10.66 | 51.8 |
| V5 plan, V4 batting | 9.23 (9.05 to 9.42) | 9.57 | 21.7 | 6.65 (6.51 to 6.79) | 10.83 | 50.3 |
| V4 plan, V5 batting | 9.30 (9.14 to 9.48) | 9.78 | 20.1 | 6.49 (6.36 to 6.64) | 11.11 | 51.4 |
| V5 (both) | 9.60 (9.43 to 9.77) | 10.03 | 18.7 | 6.77 (6.63 to 6.92) | 11.34 | 49.8 |
| Real, fit / selection | 9.75 / 9.84 | 8.87 / 9.14 | 18.8 / 23.6 | | | |

Increments in the research model, death runs an over: stepping +0.48; the bowling plan +0.26; the batting policy +0.33; plan and batting together +0.63, close to the sum (+0.59), so the two act nearly independently. In the live model: stepping +0.10, plan +0.24, batting +0.08, both +0.36.

[Inference] In the research model the three causes are of similar size, and each also raises the death wicket rate. In the live model the plan matters most: `synthetic-alpha-01` has only small length terms (a yorker adds misses and removes aerial shots; a short ball adds aerial shots and edges) and no effort term on contact, so batting intent matters less there.

## 3. Design

### 3a. The death-overs bowling plan (`t20DeathBowlingPlanV5`, `packages/ai/src/t20-captain.ts`)

The plan set the engine accepts is length (YORKER, FULL, GOOD, SHORT), effort (CONSERVE, NORMAL, MAXIMUM) and line; the variation is fixed at `stock`. There is no slower-ball variation, so a slower ball is conserved effort. Line is left as V4 left it. The ball's place in the over sets the plan:

| Ball of the over | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Pace | yorker, normal | good length, conserve (slower ball into the pitch) | yorker, maximum | short, maximum (bouncer) | full, conserve (slower full ball) | good length, maximum (hard length) |
| Pace, tail-ender on strike | as pace | | | | | yorker, maximum |
| Spin | good, normal | full, conserve (flighted) | good, maximum (quicker) | full, normal | good, conserve | full, maximum (darted) |

- Pace: two yorkers an over (three to a tail-ender), two slower balls, one bouncer and one hard length. One bouncer matches the T20 playing condition of one short ball an over. Spin: no bouncer and no yorker; pace changes on good and full lengths.
- A tired bowler (fatigue 7,000 bp or more) conserves on every ball, as in V4.
- Pace or spin comes from the current bowler's public bowling style (`bowlerStyle` in the public view, from `t20BowlerStyleOf`: FAST and MEDIUM are pace, as in the generator). Unknown is treated as pace.
- [Inference] The mix is cricket judgement about how a modern side bowls at the death: yorkers are a minority of balls, mixed with slower balls, hard lengths and the odd bouncer, with the yorker kept for tail-enders. Cricsheet records neither length nor pace, so no real data in the repository can check it. It was written once, before any V5 measurement, and was not changed after seeing results.
- Unchanged from V4: the powerplay (good length) and middle-overs (full) plans and V4's effort rule there, bowler choice (including the best bowlers' death-over reservation; the evidence gives no reason to change it), and field intent.

### 3b. Batting policy V2 (`adviseT20BattingV2`, `packages/ai/src/batting-policy.ts`)

V1 everywhere except in the first innings's death overs, where V1 held the striker at aggression 2 in two cases:

- three or fewer wickets left with more than 18 balls to go (overs 16 and 17);
- a tail-ender on strike with a recognised batter at the other end (overs 16 to 18).

V2 attacks at 3 in those cases, not 4. [Inference] With so few balls left a wicket costs little, but a side seven down still does not slog every ball. The tail-ender still looks for the single (ROTATE). Chases are unchanged, because a low required rate justifies low aggression. Written once, not tuned.

### 3c. The batch step asks before every ball

`tacticalT20Step` now takes options `{ advise, advance }`. From V5 the default is the current captain and `advance: "DELIVERY"`: when the captain has nothing to change it bowls one ball, so V5's ball-by-ball plan is bowled and every striker bats on the current advice, as in the live game. `{ advise: adviseT20CaptainV4, advance: "OVER" }` reproduces V4's harness exactly: on all 100 corpus seeds, under both models, its event hashes equal `main`'s `tacticalT20Step` (checked by playing both and comparing the 100 final event hashes).

**Defect fixed on the way.** After a bowling-plan change within an over, the engine's copy of the plan carries the event's `type`, which the command schema refuses. V4 fixed this in the web opponent. The batch step and the tactical validation script still copied the whole plan, and V5's within-over changes reach it (reproduced: the batch step failed with `unrecognized_keys: type` on a V5 match). Both now drop only that key; any other payload is unchanged.

## 4. Results, before (V4) and after (V5), first innings, 1,000 matches each

"Before" is V4 as measured to date (over at a time); the ball-by-ball V4 row shows how much of the change is the harness alone.

### 4a. `calibrated-t20-01` (research)

| | Real fit / selection | V4, over at a time | V4, ball by ball | V5 |
| --- | --- | --- | --- | --- |
| Runs | 158.9 / 166.0 | 158.0 (155.7 to 160.3) | 161.0 (158.6 to 163.4) | 163.4 (161.0 to 165.7) |
| Wickets | 6.40 / 6.87 | 6.75 (6.61 to 6.87) | 7.02 (6.88 to 7.14) | 7.17 (7.03 to 7.29) |
| Dot % (wicket balls included) | 35.3 / 37.2 | 36.3 | 35.4 | 34.6 |
| Runs an over: powerplay | 7.68 / 8.30 | 7.78 (7.64 to 7.93) | 7.93 (7.79 to 8.08) | 7.93 (7.79 to 8.08) |
| Runs an over: middle | 7.66 / 8.27 | 7.86 (7.74 to 7.98) | 7.85 (7.73 to 7.97) | 7.85 (7.73 to 7.97) |
| Runs an over: death | 9.75 / 9.84 | 8.49 (8.32 to 8.68) | 8.97 (8.80 to 9.16) | **9.60 (9.43 to 9.77)** |
| Wicket %: powerplay | 4.24 / 4.77 | 5.09 (4.88 to 5.28) | 5.22 (5.00 to 5.41) | 5.22 (5.00 to 5.41) |
| Wicket %: middle | 4.49 / 5.09 | 4.53 (4.36 to 4.69) | 4.51 (4.34 to 4.68) | 4.51 (4.34 to 4.68) |
| Wicket %: death | 8.87 / 9.14 | 8.56 (8.24 to 8.88) | 9.38 (9.04 to 9.72) | 10.03 (9.67 to 10.38) |
| Death dot % (wicket balls excluded) | 18.8 / 23.6 | 26.2 (25.4 to 27.0) | 22.9 (22.2 to 23.7) | **18.7 (18.1 to 19.3)** |
| Death four % | 11.1 / 11.3 | 8.8 (8.4 to 9.2) | 9.2 (8.8 to 9.6) | 9.2 (8.8 to 9.5) |
| Death six % | 7.4 / 8.5 | 7.0 (6.6 to 7.3) | 7.7 (7.4 to 8.0) | 8.9 (8.5 to 9.3) |

(The powerplay and middle rows are identical in the two ball-by-ball columns because the first 15 overs are played identically: the same seeds, the same choices.)

### 4b. `synthetic-alpha-01` (live)

| | V4, over at a time | V4, ball by ball | V5 |
| --- | --- | --- | --- |
| Runs | 111.6 (110.1 to 113.2) | 112.2 (110.7 to 113.9) | 113.0 (111.5 to 114.7) |
| Wickets | 7.94 (7.81 to 8.05) | 8.03 (7.91 to 8.15) | 8.13 (8.00 to 8.24) |
| Dot % (wicket balls included) | 58.6 | 58.5 | 58.2 |
| Runs an over: powerplay / middle / death | 6.19 / 5.29 / 6.31 (6.17 to 6.44) | 6.23 / 5.29 / 6.41 (6.28 to 6.55) | 6.23 / 5.29 / 6.77 (6.63 to 6.92) |
| Wicket %: powerplay / middle / death | 5.87 / 5.89 / 10.29 | 5.95 / 5.85 / 10.66 | 5.95 / 5.85 / 11.34 (10.98 to 11.72) |
| Death dot % | 51.9 (51.3 to 52.5) | 51.8 (51.2 to 52.4) | 49.8 (49.2 to 50.5) |
| Death four % / six % | 7.5 / 7.0 | 7.7 / 7.4 | 8.1 / 8.1 |

The live model makes no claim to match real cricket, so no real column is given.

### 4c. V5's death plan as bowled (research model, first innings)

Planned length: yorker 12.9%, full 39.0%, good 42.7%, short 5.4%. Effort: conserve 33.3%, normal 28.2%, maximum 38.5%. Executed: yorker 13.4%, full 38.8%, good 37.3%, short 8.4%, full toss 2.1% (V4: 71.1% yorkers, 4.7% full tosses).

Runs an over by plan, V5 plan with V4 batting (so the batting policy is the same in every cell). Pace only: yorker at maximum 8.33, yorker at normal 9.46, bouncer 10.26. Pace and spin together: full at conserve 9.18, good at conserve 9.01, good at maximum 9.81. Spin only: good at normal 9.41, full at normal 8.90, full at maximum 9.09. In the research model the yorker at full pace remains the tightest ball and the bouncer the dearest, as the tactics pack intends.

**[Inference] About two-thirds of death balls are bowled by spinners.** The cells only a spinner bowls (full at normal, full at maximum, good at normal) each hold about 11% of death balls, which puts spin near 67%. The fictional world has 50 spin bowlers and 22 pace bowlers, and V4's skill ranking (kept) often puts a spinner among a side's best. That is why yorkers are 13% of death balls rather than the pace plan's third. Changing it would mean changing the world or bowler choice, which this pass does not do.

### 4d. Head to head, V5 against V4 (100 seeds, each twice with V5 on each side, ball by ball)

| Model | V5 wins | V4 wins | Ties or no result | V5 share of decided | Run difference (V5 minus V4), per match |
| --- | ---: | ---: | ---: | --- | --- |
| `calibrated-t20-01` | 91 | 98 | 11 | 48.1% (41.1 to 55.2) | -0.4 (-5.1 to 4.4) |
| `synthetic-alpha-01` | 99 | 98 | 3 | 50.3% (43.3 to 57.2) | -0.6 (-4.3 to 3.1) |

Neither captain beats the other measurably. V5 is a realism change, not a stronger captain.

### 4e. Tactical validation (`scripts/pavilion-tactical-validation.ts`, all eleven experiments, 200 matches each)

Good side's wins of decided matches, share with 95% interval; paired run difference per innings with 95% interval. "V4" is `main` (`d9bb921`), over at a time; "V4 ball by ball" is this branch with `--captain=V4`; "V5" is this branch's default.

**`calibrated-t20-01`:**

| Experiment (poor side) | V4 | V4 ball by ball | V5 |
| --- | --- | --- | --- |
| Weakest eleven | 169 of 197: 85.8% (80.2 to 90.0); +21.2 (15.8 to 26.6) | 166 of 197: 84.3% (78.5 to 88.7); +20.9 (15.4 to 26.4) | 166 of 196: 84.7% (79.0 to 89.1); +21.4 (15.7 to 27.1) |
| Old selection rule | 173 of 199: 86.9% (81.5 to 90.9); +20.5 (15.9 to 25.1) | 166 of 193: 86.0% (80.4 to 90.2); +19.8 (15.0 to 24.5) | 166 of 192: 86.5% (80.9 to 90.6); +20.1 (15.1 to 25.0) |
| Batting order reversed | 158 of 195: 81.0% (74.9 to 85.9); +16.1 (11.7 to 20.5) | 154 of 189: 81.5% (75.3 to 86.4); +16.5 (11.8 to 21.3) | 158 of 194: 81.4% (75.4 to 86.3); +17.6 (12.6 to 22.6) |
| Aggression 4 every ball | 84 of 197: 42.6% (35.9 to 49.6); -2.1 (-7.5 to 3.2) | 87 of 196: 44.4% (37.6 to 51.4); -2.1 (-7.2 to 3.1) | 92 of 197: 46.7% (39.9 to 53.7); -1.2 (-6.6 to 4.1) |
| Aggression 0 every ball | 176 of 198: 88.9% (83.8 to 92.5); +30.9 (25.0 to 36.8) | 180 of 198: 90.9% (86.1 to 94.2); +32.7 (26.8 to 38.7) | 183 of 199: 92.0% (87.3 to 95.0); +34.3 (28.2 to 40.4) |
| Weakest bowler first | 130 of 192: 67.7% (60.8 to 73.9); +9.6 (4.8 to 14.5) | 128 of 193: 66.3% (59.4 to 72.6); +11.3 (6.4 to 16.3) | 128 of 189: 67.7% (60.8 to 74.0); +12.4 (7.2 to 17.6) |
| Full length, maximum effort | 108 of 194: 55.7% (48.6 to 62.5); +0.8 (-4.0 to 5.7) | 104 of 192: 54.2% (47.1 to 61.1); +1.0 (-3.8 to 5.8) | 102 of 187: 54.5% (47.4 to 61.5); +0.7 (-4.2 to 5.6) |
| Good length throughout | 93 of 196: 47.4% (40.6 to 54.4); +1.0 (-3.6 to 5.6) | 97 of 188: 51.6% (44.5 to 58.6); +0.5 (-4.0 to 5.1) | 101 of 191: 52.9% (45.8 to 59.8); +0.0 (-4.6 to 4.6) |
| Maximum effort throughout | 100 of 196: 51.0% (44.1 to 57.9); -0.6 (-5.4 to 4.1) | 97 of 190: 51.1% (44.0 to 58.1); -0.3 (-5.0 to 4.5) | 94 of 184: 51.1% (43.9 to 58.2); +0.5 (-4.5 to 5.5) |
| Conserve effort throughout | 93 of 197: 47.2% (40.4 to 54.2); -1.9 (-6.3 to 2.5) | 87 of 192: 45.3% (38.4 to 52.4); -2.1 (-6.5 to 2.2) | 93 of 191: 48.7% (41.7 to 55.7); -0.5 (-5.1 to 4.1) |
| Two-slip field all innings | 118 of 197: 59.9% (52.9 to 66.5); +8.6 (3.0 to 14.2) | 123 of 191: 64.4% (57.4 to 70.8); +9.3 (4.1 to 14.5) | 119 of 189: 63.0% (55.9 to 69.5); +8.0 (2.6 to 13.5) |

The V4 column equals C5's published "after" column exactly.

**`synthetic-alpha-01`:**

| Experiment (poor side) | V4 | V4 ball by ball | V5 |
| --- | --- | --- | --- |
| Weakest eleven | 110 of 197: 55.8% (48.9 to 62.6); +3.3 (-0.6 to 7.2) | 109 of 197: 55.3% (48.4 to 62.1); +3.6 (0.0 to 7.3) | 109 of 195: 55.9% (48.9 to 62.7); +3.6 (-0.2 to 7.5) |
| Old selection rule | 163 of 197: 82.7% (76.9 to 87.4); +13.4 (9.9 to 16.9) | 162 of 197: 82.2% (76.3 to 86.9); +13.7 (10.2 to 17.3) | 160 of 194: 82.5% (76.5 to 87.2); +13.2 (9.6 to 16.9) |
| Batting order reversed | 146 of 197: 74.1% (67.6 to 79.7); +8.3 (4.7 to 11.9) | 141 of 195: 72.3% (65.6 to 78.1); +8.5 (4.8 to 12.2) | 141 of 195: 72.3% (65.6 to 78.1); +8.0 (4.4 to 11.7) |
| Aggression 4 every ball | 102 of 199: 51.3% (44.4 to 58.1); +3.7 (-0.7 to 8.1) | 108 of 197: 54.8% (47.8 to 61.6); +4.4 (0.1 to 8.6) | 107 of 199: 53.8% (46.8 to 60.6); +4.4 (0.1 to 8.7) |
| Aggression 0 every ball | 125 of 197: 63.5% (56.5 to 69.9); +5.4 (2.3 to 8.4) | 131 of 195: 67.2% (60.3 to 73.4); +6.2 (3.2 to 9.2) | 130 of 196: 66.3% (59.5 to 72.6); +6.1 (3.1 to 9.1) |
| Weakest bowler first | 92 of 195: 47.2% (40.3 to 54.2); -0.5 (-4.4 to 3.3) | 98 of 196: 50.0% (43.1 to 56.9); -0.7 (-4.3 to 2.9) | 96 of 197: 48.7% (41.8 to 55.7); -0.5 (-4.2 to 3.2) |
| Full length, maximum effort | 100 of 196: 51.0% (44.1 to 57.9); +0.1 (-3.8 to 4.0) | 100 of 194: 51.5% (44.6 to 58.5); +0.1 (-3.6 to 3.9) | 96 of 196: 49.0% (42.1 to 55.9); -0.6 (-4.2 to 3.1) |
| Good length throughout | 97 of 196: 49.5% (42.6 to 56.4); -0.1 (-4.1 to 4.0) | 100 of 195: 51.3% (44.3 to 58.2); +0.9 (-3.1 to 4.8) | 101 of 197: 51.3% (44.3 to 58.2); +0.1 (-3.7 to 3.9) |
| Maximum effort throughout | 98 of 196: 50.0% (43.1 to 56.9); -0.3 (-4.3 to 3.6) | 98 of 196: 50.0% (43.1 to 56.9); -0.1 (-3.9 to 3.7) | 97 of 197: 49.2% (42.3 to 56.2); +0.2 (-3.5 to 3.9) |
| Conserve effort throughout | 95 of 196: 48.5% (41.6 to 55.4); -1.3 (-5.1 to 2.5) | 96 of 195: 49.2% (42.3 to 56.2); -1.3 (-4.8 to 2.3) | 94 of 198: 47.5% (40.6 to 54.4); -1.0 (-4.6 to 2.6) |
| Two-slip field all innings | 109 of 196: 55.6% (48.6 to 62.4); +3.2 (-0.7 to 7.2) | 106 of 196: 54.1% (47.1 to 60.9); +2.8 (-1.1 to 6.7) | 106 of 197: 53.8% (46.8 to 60.6); +3.6 (-0.3 to 7.6) |

The V4 column equals the V4 rerun in [CAPTAIN_V4_DEATH_OVERS.md](CAPTAIN_V4_DEATH_OVERS.md) for the eight experiments it had.

## 5. What this shows

1. **The research model's death overs are now close to real on runs and dots.** 9.60 runs an over (9.43 to 9.77) against 9.75 (fit) and 9.84 (selection); dots 18.7% against 18.8% and 23.6%. Before: 8.49 and 26.2%.
2. **The causes were three, of similar size** (section 2b): the bowling plan, the batting holds and the over-at-a-time harness. Every C5 measurement was taken with that harness, so its death figures understate what the same captain does ball by ball, as the live game plays.
3. **Death wickets now run high.** 10.03% a ball against 8.87% (fit) and 9.14% (selection); first-innings wickets 7.17 against 6.40 and 6.87. Fours are still low (9.2% against 11.1%) and sixes a little high (8.9% against 7.4%). [Inference] More attacking at the death in this model buys runs with wickets at the rate C5 measured for the aggression response, and the spin-heavy death (section 4c) gives fewer boundaries along the ground.
4. **First-innings runs** rose to 163.4, between the fit (158.9) and selection (166.0) periods.
5. **The live game changes little.** Death runs an over 6.31 to 6.77 and death wickets 10.3% to 11.3%; first-innings runs 111.6 to 113.0. The live model has no tactics component, so the plan matters only through its small length terms.
6. **No change in strength or in what management decides.** V5 against V4 is level in both models. The tactical validation results stay within each other's intervals in every experiment; bowling plans still have no measurable effect on results. [Inference] The plan was made realistic, not stronger, as intended.

## 6. Compatibility

**How the game records the captain.** The tactical captain's choices reach a match only as commands (`SET_BOWLER`, `SET_BATTING_PLAN`, `SET_BOWLING_PLAN`), which the session records with their payloads. A saved match is rebuilt by `rehydrateT20Session` (`packages/simulation/src/t20-match.ts`), which re-executes the stored commands and asserts identical revision, events, state, receipts, execution manifest and hash chain. The captain is never asked again on load. No captain id is persisted: a search of `packages/persistence/src`, `packages/simulation/src`, `packages/contracts/src` and `apps/web/src` for the captain's policy ids finds none outside the captain itself (the only persisted captain ids are the career fixture policies, below). A saved match in progress resumes from its commands; only the choices after the resume come from the code then running, as for any earlier captain change (V3 to V4).

**Evidence** (`scripts/pavilion-captain-v5-replay-check.ts`):

- At V3 (`4e29882`) and V4 (`d9bb921`), the script played three seeds with the batch captain and with each computer-opponent mode, and saved two matches part-way through: over 11 of the first innings and over 17 of the second. Each was saved as the game stores it (the session object, as JSON).
  - V4: 14 sessions, SHA-256 `82838d43...`.
  - V3: 8 sessions, SHA-256 `cc17e508...`. Its club-style and match-aware opponents fail at that revision with the `type`-key defect V4 fixed, so they could not be saved.
- On this branch every saved session rehydrated with identical events and hash chain: **22 of 22**.
- Each saved in-progress match finished under V5, and its recorded commands were unchanged.
- The same set-ups played live under V5 differ from the saved matches in **18 of 18** finished matches, so the identical replays are not because V5 makes the same choices.
- Outputs: `docs/pavilion/captain-v5/replay-v3-4e29882-check.json` and `replay-v4-d9bb921-check.json`. The saved sessions (2.8 and 5.3 MB) stay outside the repository, in `/home/user/lcx-data/cap5/`.
- Unit tests (`tests/unit/pavilion-captain-v5.test.ts`) repeat this within the suite: V4 matches replay identically under V5 code, a match saved in the death overs resumes and finishes, and the V4 step settings advance a whole over.

**Career fixtures are not affected.** Off-screen career fixtures use their own versioned policies, `LC_FIXTURE_CAPTAIN_V1` and `V2` (`packages/simulation/src/fixture-policy-v2.ts`), chosen by the season state version. `scripts/check-boundaries.mjs` does not let `@lcxxvi/simulation` import `@lcxxvi/ai`. `LC_FIXTURE_CAPTAIN_V2` copies two of the tactical captain's constants (the fatigue weight and the reserve rule); neither changed. No fixture, quick-match corpus or checksum changed (section 7).

**Where V5 is used.** The computer opponent in the live game (`apps/web/src/match/ai-opponent.ts`) and the batch harness (`apps/batch/src/tactical-match.ts`; quality scenarios and the exploitation gates use it). The one-day and five-day captains are unchanged.

## 7. Proof that the models and formats are unchanged

- No file under `packages/data`, `packages/simulation`, `packages/contracts`, `packages/persistence` or `packages/projections` changed (`git diff --stat origin/main` lists none).
- The public captain view gains one optional in-memory field, `bowlerStyle`. It is a DTO, not a persisted format; the allow-list test in `tests/unit/m7-ai-analytics.test.ts` was updated to name it.

## 8. Limitations

- Bowling plans still have no measurable effect on results in either model (section 4e), so the plan is realism, not yet a decision that wins matches.
- The plan mix and the batting change are cricket judgement. Cricsheet has no ball length or pace, so no real yardstick exists for the mix.
- [Inference] The death is spin-heavy because of the fictional world (50 spin bowlers to 22 pace) and V4's skill ranking. With pace-led deaths, yorkers would be about a third of death balls.
- The plan is set by the ball's place in the over. It does not read the batter's strengths, the score or the field, beyond the tail-ender rule. A wide or no-ball repeats that ball's plan.
- The fatigue rule reads the fatigue of the bowler the captain would choose next, as V4's did, not the current bowler's. In T20 fatigue rarely reaches 7,000 bp, so it seldom applies.
- In the live game a person who presses "Finish over" bowls the rest of the over on the plans in force, so the varied plan and fresh batting plans apply only ball by ball.
- Death wickets and first-innings wickets are now high in the research model (section 5). This pass did not tune anything to correct them.
- Synthetic model results make no claim about real cricket.

## 9. Reproduce

```bash
# diagnosis and before/after: m in synthetic-alpha-01, calibrated-t20-01
node --import tsx scripts/pavilion-captain-v5-measure.ts measure-$m-OVER-V4-V4.json --model=$m --advance=OVER --bowling=V4 --batting=V4 --repeats=10
node --import tsx scripts/pavilion-captain-v5-measure.ts measure-$m-DELIVERY-<P>-<B>.json --model=$m --bowling=<P> --batting=<B> --repeats=10   # P, B in V4, V5
node --import tsx scripts/pavilion-captain-v5-measure.ts h2h-$m.json --h2h --model=$m
# tactical validation: V4 on main (d9bb921); V5 and V4 ball by ball on this branch
node --import tsx scripts/pavilion-tactical-validation.ts tactical-validation-v5-<model>.json [--model=calibrated-t20-01]
node --import tsx scripts/pavilion-tactical-validation.ts tactical-validation-v4-delivery-<model>.json --captain=V4 [--model=calibrated-t20-01]
# replay compatibility: generate at the old revision, check here
node --import tsx scripts/pavilion-captain-v5-replay-check.ts generate replay-v4-d9bb921.json   # at d9bb921 (and 4e29882 for V3)
node --import tsx scripts/pavilion-captain-v5-replay-check.ts check replay-v4-d9bb921.json
```

The OVER rows were produced before the script took `--advance` (the code then always advanced by over), so their files carry no `advance` field. Every job exited 0. All outputs are in `docs/pavilion/captain-v5/`.
