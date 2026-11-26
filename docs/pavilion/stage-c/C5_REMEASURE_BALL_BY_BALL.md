# Stage C C5 re-measure: ball-by-ball harness, captain V5 (research only)

**Status:** research only, measurement only. No model, policy, captain or coefficient was changed or tuned. `calibrated-t20-01` stays unselectable in the game and is not activated. `synthetic-alpha-01`, the live game, replays, saves and persisted formats are unchanged. No gate is claimed as accepted; the owner accepts results. The holdout (2025-08-30 onward) was not read.

**Why.** Captain V5 (pull request #166) changed the batch harness (`apps/batch/src/tactical-match.ts`) so that the computer captain is asked before every ball instead of once an over. [CAPTAIN_V5_DEATH_OVERS.md](../CAPTAIN_V5_DEATH_OVERS.md) section 2a found that the once-an-over step left a batter who took strike later in the over on an older plan, or on the engine's default of aggression 2, and that this accounted for 14.9 of the 26.8 points of death balls batted at aggression 2 in C5's figures. This page re-runs the C5 measurements ([C5_TACTICS_AND_REFIT.md](C5_TACTICS_AND_REFIT.md)) on the per-ball harness with V5 captains on both sides, and compares them with the C5 "after" results.

## 1. What changed, and what did not

| | Before (C5 "after") | Now (this re-measure) |
| --- | --- | --- |
| Revision | `b5fca25` | `main` at `5fc98e3` (merge of #166) |
| Captain | V4 | V5 (current `adviseT20Captain`) |
| Harness | `ADVANCE { scope: "OVER" }` once the plans matched: the captain was asked once an over | `ADVANCE { scope: "DELIVERY" }`: the captain is asked before every ball |
| Model | `calibrated-t20-01`, model hash `64e09b4b...` | the same: `git diff --stat b5fca25 5fc98e3 -- packages/data packages/simulation` is empty, and `node --import tsx scripts/stage-c/c5-pin-packs.ts` prints model hash `64e09b4b00d2b3b9565a7e18b86e219933487713cbbd2a2b62e24885e6592802` (delivery `2ea31526...`, skill `07949faa...`, tactics `006d7af8...`) |
| Seeds, sample sizes | as in C5 section 1 | identical: repeats 0 to 19 (2,000 matches) for the game files; 200 matches per forced run and per tactical experiment; the 100-seed dose conditions |

So every difference below comes from the captain (V4 to V5) and the harness (over to ball), taken together. CAPTAIN_V5_DEATH_OVERS.md section 2b separates those two causes for the death overs; this re-measure does not.

### 1a. Which scripts use the per-ball harness

| Script | How it drives a match | Per ball since #166? |
| --- | --- | --- |
| `scripts/stage-c/c1-game-balls.ts` | `tacticalT20Step(session)` with default options | yes: the default `advance` is `DELIVERY` |
| `scripts/stage-c/c4-delivery-balls.ts` | `tacticalT20Step` (also inside its forced-aggression and forced-plan wrappers); the forced wrappers call `adviseT20Captain`, which is V5 | yes |
| `scripts/stage-c/c2-dose.sh` | runs `scripts/stage-c/c1-game-dose-response.ts`, which calls `tacticalT20Step(session)` | yes |
| `scripts/pavilion-tactical-validation.ts` | its own `step`, but #166 added `--advance` (default `DELIVERY`) and `--captain` (default `V5`) | yes |

**No script needed a change, so none was changed.** Checks:
- A 10-match probe of `tacticalT20Step` on `calibrated-t20-01` (corpus seeds 1 to 10, suggested elevens) issued 2,327 `ADVANCE { scope: "DELIVERY" }` and no `ADVANCE { scope: "OVER" }`; the most commands in one match was 418, well inside the scripts' 3,000-command guard. The probe was a temporary file, deleted after the run.
- In the re-measured game files, no first-innings death ball was batted at aggression 2 (aggression 3: 19.1%, 4: 80.9%, of legal balls). C5's files had 27.1% at aggression 2. This matches CAPTAIN_V5_DEATH_OVERS.md section 2a ("Under V5 the research death is 0 / 19 / 81").

## 2. Results: the 8 adjusted gates (criterion 1, adjusted for phase and opponent; top-rated / bottom-rated quarter)

Real range: the full-member calibration split (`c2-report.py`, as in C5 section 3d). Game brackets are 95% match-bootstrap intervals from `c1-analyse.py` (`crossedEffectsBootstrap`).

| Effect | Real range | Before (C5 after) | Now | Change |
| --- | --- | --- | --- | --- |
| Batter runs | 1.388 to 1.447 | 1.424 (1.402 to 1.447) PASS | **1.315 (1.295 to 1.331) FAIL** (too flat) | PASS to FAIL |
| Batter boundary | 1.684 to 1.816 | 1.778 (1.727 to 1.837) PASS | **1.594 (1.553 to 1.633) FAIL** (too flat) | PASS to FAIL |
| Batter non-dot | 1.226 to 1.266 | 1.282 (1.269 to 1.294) FAIL (too steep) | 1.210 (1.203 to 1.221) FAIL (too flat) | FAIL, other side |
| Batter dismissal | 0.666 to 1.000 | 0.835 (0.815 to 0.867) PASS | 0.780 (0.768 to 0.802) PASS | |
| Bowler runs | 0.766 to 0.802 | 0.781 (0.774 to 0.786) PASS | 0.781 (0.775 to 0.787) PASS | |
| Bowler boundary | 0.614 to 0.681 | 0.651 (0.642 to 0.661) PASS | 0.656 (0.649 to 0.663) PASS | |
| Bowler non-dot | 0.841 to 0.865 | 0.856 (0.852 to 0.860) PASS | 0.852 (0.848 to 0.856) PASS | |
| Bowler dismissal | 1.000 to 1.364 | 1.127 (1.099 to 1.155) PASS | 1.142 (1.116 to 1.168) PASS | |
| **Total** | | **7 of 8** | **5 of 8** | |

Against each period alone (`c5-real-adjusted.json`, read by `c5-adjusted-quick.py`, which uses `c1-analyse.py`'s estimator without bootstraps):

| Period | Before (C5 after) | Now | Gates failing now |
| --- | --- | --- | --- |
| Fit (to 2023-08-31) | 6 of 8 | 5 of 8 | batter runs 1.315 against 1.336 to 1.410; batter boundary 1.594 against 1.605 to 1.781; batter non-dot 1.210 against 1.212 to 1.257 |
| Selection (2023-09-01 to 2025-08-24) | 6 of 8 | 4 of 8 | batter runs 1.315 against 1.392 to 1.537; batter boundary 1.594 against 1.680 to 1.978; bowler non-dot 0.852 against 0.802 to 0.851; batter dismissal 0.780 against 0.789 to 1.000 |

All four bowler gates hold on the whole split. All three batter scoring gates now fail on the flat side.

[Inference] The batter ratios flattened because the bottom-rated batters now attack at the death. Under captain V4 and the over-at-a-time step, tail-enders were often held at aggression 2 (CAPTAIN_V5_DEATH_OVERS.md section 2a: 5.5 points of death balls were a tail-ender on strike held at 2, and 14.9 points were stale or default plans). Under V5, ball by ball, no death ball is played at 2. That raises the bottom quarter's scoring rate more than the top quarter's, and the adjusted estimator corrects for phase and opponent but not for the batting plan. The batter dismissal ratio moving from 0.835 to 0.780 fits the same reading: the bottom quarter is now dismissed relatively more often. This was not separately tested here.

## 3. Results: death overs against the real yardsticks (first innings, overs 16 to 20)

Game: 2,000 matches each, 95% match-bootstrap intervals (`c5rm-summary.json`). Real: full-member men's T20 internationals, calibration split, from `c4-analyse.py`'s real side (`c5rm-delivery.json`, `real`) and `c5-real-yardsticks.json` (wickets, kinds).

Note: `c5-real-adjusted.json` holds only the adjusted quarter-ratio targets (section 2). It has no death-over yardsticks, so the death figures are compared with the files named above.

| Death overs | Real fit / selection | Before (C5 after) | Now |
| --- | --- | --- | --- |
| Runs an over | 9.75 / 9.84 | 8.47 (8.34 to 8.60) | **9.73 (9.62 to 9.84)** |
| Wicket % a ball | 8.87 / 9.14 (`c5-real-yardsticks.json`: 8.92 / 9.14) | 8.38 (8.15 to 8.60) | 9.89 (9.63 to 10.13) |
| Dot %, wicket balls excluded | 18.8 / 23.6 | 26.3 (25.7 to 26.8) | **17.9 (17.5 to 18.3)** |
| Four % | 11.1 / 11.3 | 8.7 (8.4 to 8.9) | 9.1 (8.9 to 9.4) |
| Six % | 7.4 / 8.5 | 7.0 | 9.1 |
| Dots per over (dot % x 6, wicket balls excluded) | 1.13 / 1.42 | 1.58 | 1.08 |
| Wickets per over (wicket % x 6) | 0.53 / 0.55 | 0.50 | 0.59 |

Change, now minus before (paired by the same seeds): death runs an over +1.26 (1.08 to 1.43); death wicket % +1.51 (1.20 to 1.80).

**Reading.**
- Death runs an over now match the fit period (9.73 against 9.75), inside the gap between the two real periods. C5's main failure ("death overs are too tight", C5 section 6, item 1) is gone on this harness.
- Death dots now sit just below the fit period (17.9 against 18.8; the interval 17.5 to 18.3 excludes it) and well below the selection period (23.6).
- The death wicket rate is now too high: 9.89% (9.63 to 10.13) against 8.87% (fit) and 9.14% (selection). C5 had it slightly low (8.38%).
- The boundary mix is off: too few fours (9.1% against 11.1%) and too many sixes (9.1% against 7.4%).

**Death dismissal kinds, per 100 legal balls** (real fit, from `c5-real-yardsticks.json`; before; now):
- caught (real includes caught and bowled): 5.60; 6.54; **8.24**;
- bowled: 1.74; 0.76; **0.43**;
- run out: 1.07; 0.87; 1.09;
- lbw: 0.35; 0.11; 0.08;
- stumped: 0.14; 0.12; 0.08.

[Inference] The extra death wickets are almost all catches (aggression 4 on 81% of death balls, with the skied-slog term). Death bowled and lbw were already low in C5 and are lower now.

## 4. Other C5 tables, before and now

### 4a. First-innings aggregates and phases

| | Real fit / selection | Before (C5 after) | Now |
| --- | --- | --- | --- |
| Runs | 158.9 / 166.0 | 158.5 (156.8 to 160.1) | 162.7 (161.2 to 164.3) |
| Wickets | 6.40 / 6.87 | 6.67 (6.58 to 6.78) | 7.13 (7.03 to 7.22) |
| Dot % (wicket balls included) | 35.3 / 37.2 | 36.2 (35.8 to 36.6) | 34.8 (34.4 to 35.1) |
| Boundary % | 15.7 / 17.9 | 16.3 (16.1 to 16.6) | 16.8 (16.6 to 17.1) |
| P10 / P50 / P90 runs | 118 / 160 / 202; 110 / 172 / 219 | 108 / 159 / 208 | 115 / 163 / 211 |
| SD of totals | 36.0 / 45.5 | 37.7 | 37.9 |
| Stumped, % of wickets | 2.7 / 2.2 | 1.9 (1.7 to 2.2) | 1.9 (1.7 to 2.1) |
| Runs an over: powerplay / middle | 7.68 / 7.66 (fit) | 7.82 / 7.89 | 7.79 (7.69 to 7.91) / 7.81 (7.73 to 7.90) |
| Wicket % a ball: powerplay / middle | 4.24 / 4.49 (fit) | 5.09 / 4.47 | 5.26 (5.11 to 5.42) / 4.49 (4.37 to 4.62) |
| Dot %: powerplay / middle | 42.4 / 27.5 (fit) | 38.0 / 28.1 | 38.2 / 28.4 |

Wickets (7.13) are now above both real periods (6.40 and 6.87). Powerplay wickets (5.26%) were already high in C5 and are slightly higher.

### 4b. Dismissal kinds (% of first-innings wickets)

| | Real fit | Real selection | Before | Now |
| --- | ---: | ---: | ---: | ---: |
| Caught (game) or caught plus caught and bowled (real) | 63.9 | 69.8 | 67.5 | 69.6 |
| Bowled | 18.3 | 16.0 | 15.5 | 13.6 |
| Lbw | 6.7 | 5.8 | 6.8 | 6.4 |
| Run out | 8.3 | 6.0 | 8.1 | 8.5 |
| Stumped | 2.7 | 2.2 | 1.9 | 1.9 |
| Hit wicket | 0.19 | 0.18 | 0.1 | 0.1 |

Bowled is now 4.7 points below the fit period (C5: within 3 points for every rare kind).

### 4c. Criterion 1, raw (top / bottom quarter by the game's rating)

| Statistic | Real true skill P10 to P90; bracket | Before | Now |
| --- | --- | --- | --- |
| Strike rate | 1.37 to 1.44; 1.20 to 1.39 | 1.44 PASS | 1.21 UNCLEAR |
| Average | none; 1.57 to 2.45 | 2.29 UNCLEAR | 2.14 UNCLEAR |
| Dismissal rate | 0.57 to 0.72; 0.46 to 0.65 | 0.63 PASS | 0.56 UNCLEAR |
| Batting dot % | 0.69 to 0.71; 0.70 to 0.79 | 0.74 UNCLEAR | 0.86 FAIL |
| Batting boundary % | 1.78 to 1.95; 1.43 to 1.80 | 2.09 FAIL | 1.69 UNCLEAR |
| Economy | 0.73 to 0.77; 0.74 to 0.86 | 0.76 PASS | 0.80 UNCLEAR |
| Wicket rate | 1.00 to 1.40; 1.20 to 1.91 | 1.44 UNCLEAR | 1.49 UNCLEAR |
| Bowling dot % | 1.43 to 1.49; 1.27 to 1.45 | 1.65 FAIL | 1.57 FAIL |
| Boundary % conceded | 0.55 to 0.60; 0.56 to 0.69 | 0.69 UNCLEAR | 0.76 FAIL |
| **Total** | | 3 PASS, 4 UNCLEAR, 2 FAIL | **0 PASS, 6 UNCLEAR, 3 FAIL** |

### 4d. Specialisation (game / real within 0.85 to 1.15)

| Ratio | Real | Before | Now |
| --- | ---: | --- | --- |
| Average, positions 1 to 7 / 8 to 11 | 2.25 | 1.87 (0.83) FAIL | 1.78 (0.79) FAIL |
| Strike rate, positions 1 to 7 / 8 to 11 | 1.18 | 1.38 (1.17) FAIL | 1.19 (1.00) PASS |
| Economy, part-time / frontline | 1.08 | 1.23 (1.14) PASS | 1.12 (1.04) PASS |

### 4e. Per-point effects (sign and range rule, `c3-per-point-gate.py --sign-range`)

| Effect (oriented) | C3 range | Before | Now |
| --- | --- | ---: | ---: |
| Batter runs | 0.0078 to 0.0092 | 0.0156 | 0.0151 |
| Batter boundary | 0.0127 to 0.0155 | 0.0237 | 0.0230 |
| Batter non-dot | 0.0052 to 0.0062 | 0.0094 | 0.0091 |
| Batter dismissal (fewer) | 0 to 0.0126 | 0.0034 | 0.0044 |
| Bowler runs (fewer) | 0.0120 to 0.0146 | 0.0260 | 0.0247 |
| Bowler boundary (fewer) | 0.0212 to 0.0270 | 0.0422 | 0.0405 |
| Bowler non-dot (fewer) | 0.0080 to 0.0097 | 0.0146 | 0.0137 |
| Bowler dismissal (more) | 0 to 0.0206 | 0.0053 | 0.0070 |
| Variation: wickets / runs | both positive | +0.0057 / +0.0031 | +0.0056 / +0.0031 |

Now: 9 of 9 PASS under the sign and range rule (unchanged); 2 of 8 effects lie inside the C3 range (unchanged). With every player alike in the dose conditions, the captain's choices do not depend on skill, so these barely move.

### 4f. Forced aggression (both sides, every ball, 200 matches each)

| Forced aggression | Before: runs / wickets / dot % | Now: runs / wickets / dot % |
| ---: | --- | --- |
| 0 | 98.6 / 2.37 / 49.8 | 96.5 / 2.25 / 50.2 |
| 1 | 118.2 / 3.35 / 45.3 | 117.0 / 3.26 / 45.6 |
| 2 | 140.1 / 4.62 / 42.5 | 140.2 / 4.64 / 42.3 |
| 3 | 163.5 / 6.78 / 35.8 | 164.3 / 7.01 / 35.1 |
| 4 | 165.0 / 8.68 / 34.5 | 166.5 / 8.90 / 32.7 |

Extra wickets per extra run, step by step: before 0.05 / 0.06 / 0.08 / 0.19; now 0.05 / 0.06 / 0.09 / 0.15. Going from 3 to 4 still buys about 2 runs for about 1.9 wickets.

## 5. Bowling-plan effect

### 5a. Levers, forced for both sides (differences of two 200-match runs on the same seeds; intervals bootstrap each run separately, so they are wide)

| Lever | Before: runs; wickets; death runs an over | Now: runs; wickets; death runs an over |
| --- | --- | --- |
| Yorker minus good length | -6.6 (-14.4 to -0.3); +0.18 (-0.20 to 0.62); -0.57 (-1.27 to -0.05) | -5.8 (-14.0 to 1.1); +0.12 (-0.28 to 0.58); **-0.46 (-1.05 to -0.02)** |
| Full minus good length | +1.1 (-7.4 to 7.5); +0.17 (-0.19 to 0.58); +0.16 (-0.55 to 0.70) | +1.3 (-6.8 to 7.9); +0.12 (-0.23 to 0.57); +0.13 (-0.46 to 0.57) |
| Maximum minus conserve effort | +3.4 (-4.5 to 9.6); +0.05 (-0.35 to 0.47); +0.26 (-0.42 to 0.77) | +3.7 (-4.4 to 10.5); +0.13 (-0.25 to 0.58); +0.31 (-0.24 to 0.81) |
| Maximum minus normal effort | +2.2 (-5.5 to 8.6); 0.00 (-0.38 to 0.42); +0.09 (-0.58 to 0.59) | +2.3 (-5.4 to 8.5); +0.06 (-0.32 to 0.50); +0.09 (-0.52 to 0.58) |

Only the yorker lever's death-overs effect is still clearly non-zero, and only just. Its innings-runs interval now includes zero.

### 5b. Tactical validation, 200 matches each (good side's share of decided matches, 95% Wilson interval; paired run difference per innings, 95% interval)

| Experiment (poor side) | Before (C5 after) | Now |
| --- | --- | --- |
| Weakest eleven | 85.8% (80.2 to 90.0); +21.2 (15.8 to 26.6) | 86.2% (80.7 to 90.4); +22.0 (16.4 to 27.6) |
| Old selection rule | 86.9% (81.5 to 90.9); +20.5 (15.9 to 25.1) | 86.2% (80.6 to 90.3); +20.6 (15.5 to 25.7) |
| Batting order reversed | 81.0% (74.9 to 85.9); +16.1 (11.7 to 20.5) | 80.7% (74.6 to 85.7); +17.9 (13.1 to 22.8) |
| Aggression 4 every ball | 42.6% (35.9 to 49.6); -2.1 (-7.5 to 3.2) | 46.4% (39.6 to 53.4); -1.4 (-7.0 to 4.2) |
| Aggression 0 every ball | 88.9% (83.8 to 92.5); +30.9 (25.0 to 36.8) | 92.4% (87.8 to 95.3); +34.8 (28.5 to 41.0) |
| Weakest bowler first | 67.7% (60.8 to 73.9); +9.6 (4.8 to 14.5) | 66.8% (60.0 to 73.0); +13.6 (8.4 to 18.8) |
| Full length, maximum effort | 55.7% (48.6 to 62.5); +0.8 (-4.0 to 5.7) | 54.4% (47.4 to 61.3); +0.7 (-4.3 to 5.8) |
| Good length throughout | 47.4% (40.6 to 54.4); +1.0 (-3.6 to 5.6) | 51.6% (44.5 to 58.6); -0.7 (-5.5 to 4.1) |
| Maximum effort throughout | 51.0% (44.1 to 57.9); -0.6 (-5.4 to 4.1) | 54.5% (47.4 to 61.4); +0.7 (-4.6 to 6.0) |
| Conserve effort throughout | 47.2% (40.4 to 54.2); -1.9 (-6.3 to 2.5) | 48.1% (41.1 to 55.2); +0.4 (-4.6 to 5.4) |
| Two-slip field all innings | 59.9% (52.9 to 66.5); +8.6 (3.0 to 14.2) | 62.9% (55.9 to 69.4); +9.5 (4.0 to 15.0) |

**Reading.** Selection, batting order, bowler choice, blocking and the field still decide matches clearly. No bowling-plan experiment differs from an even contest: every interval contains 50%, as in C5. Full attack (aggression 4 every ball) is still not worse than the V5 captain with any confidence (46.4%, 39.6 to 53.4).

### 5c. Matchups (no real yardstick)

| (`c5-matchups.py`, 88 batters) | Before (C5 after) | Now |
| --- | --- | --- |
| Relative runs a ball, spin against pace, top minus bottom tilt quarter | +4.6% (-0.1 to +8.7%) | -2.5% (-6.3 to +1.4%) |
| Relative dismissals | -12.3% (-22.3 to -2.5%) | -6.0% (-13.9 to +3.7%) |
| Left minus right handed (null check) | +1.9% (-1.1 to +5.1%) | -2.6% (-5.2 to +0.1%) |

The matchup effect is no longer distinguishable from zero on this harness. [Inference] Captain V5 prefers pace bowlers at the death, so who faces spin and in which phase has changed. The tilt quarters may now differ in how many of their balls against pace come at the death, which the response does not correct for. Not tested here.

## 6. What passes and what fails

**Passes now:**
- Adjusted criterion 1, all four bowler gates (runs, boundary, non-dot, dismissal) and batter dismissal: 5 of 8.
- Death runs an over: 9.73 (9.62 to 9.84) against 9.75 (fit) and 9.84 (selection).
- Per-point sign and range rule: 9 of 9.
- Specialisation: strike-rate and economy ratios (2 of 3; C5 had 1 of 3).

**Fails now:**
- Adjusted criterion 1, batter runs (1.315), batter boundary (1.594) and batter non-dot (1.210): all too flat. C5 passed the first two. Total 5 of 8 against 7 of 8 in C5 (fit period 5 of 8 against 6 of 8; selection period 4 of 8 against 6 of 8).
- Death wicket rate too high: 9.89% (9.63 to 10.13) against 8.87% and 9.14%.
- Death dots slightly below the fit period: 17.9% (17.5 to 18.3) against 18.8%; well below the selection period's 23.6%.
- Death boundary mix: fours too few (9.1% against 11.1%), sixes too many (9.1% against 7.4%).
- First-innings wickets too many: 7.13 against 6.40 (fit) and 6.87 (selection). Powerplay wickets still high (5.26% against 4.24%).
- Bowled share of wickets 13.6% against 18.3% (fit); death bowled 0.43 per 100 balls against 1.74.
- Raw criterion 1: 0 PASS, 6 UNCLEAR, 3 FAIL (C5: 3 PASS, 4 UNCLEAR, 2 FAIL).
- Specialisation: average ratio 1.78 against 2.25.
- Bowling plans still do not decide matches (section 5b); full attack is still not shown to be worse than the captain.

[Inference] C5's skill V5 fit (the adjusted batter ratios) and its death-over phase intercepts were both set under the once-an-over harness and captain V4. On the harness the game actually uses, the death overs now score at the real rate, but the batter ratios have flattened and death wickets have overshot. Any refit would be a new step that needs the owner's decision; none is proposed or made here.

## 7. Commands, revisions and results

**Revision.** All runs and checks ran on branch `pavilion/c5-remeasure-ball-by-ball` at `5fc98e3` (identical to `main`; the only commit on the branch adds this page and the `c5rm-*.json` outputs, no code). Linux container, 4 cores, Node 22, `NODE_OPTIONS=--max-old-space-size=4096` for `tsc`. Raw ball files are outside the repository in `/home/user/lcx-data/c5rm/` (job list `jobs.txt`, per-job exit codes and times `exits.log`, analysis exit codes `analyse-exits.log`). The "before" files are C5's, unchanged, in `/home/user/lcx-data/c5/after/`.

| Command | Result |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | PASS (exit 0) |
| `node --import tsx scripts/stage-c/c5-pin-packs.ts` (print only, no `--write`) | PASS (exit 0); hashes as in section 1 |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/g-$k.json 5 $((k*5))` (k = 0 to 3) | PASS (exit 0 each; about 485 s each) |
| `node --import tsx scripts/stage-c/c1-game-balls.ts <dir>/cal-balls-$k.json 5 $((k*5)) --model=calibrated-t20-01` (k = 0 to 3) | PASS (exit 0 each; about 515 s each) |
| `node --import tsx scripts/pavilion-tactical-validation.ts <dir>/tv/calibrated-t20-01-<experiment>.json <experiment> --model=calibrated-t20-01` (11 experiments; defaults `--captain=V5 --advance=DELIVERY`) | PASS (exit 0 each; 173 to 214 s each) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/f-$a.json 2 0 --aggression=$a` (a = 0 to 4) | PASS (exit 0 each) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/lev/<lever>.json 2 0 --effort=<E>` or `--length=<L>` (6 runs) | PASS (exit 0 each) |
| `bash scripts/stage-c/c2-dose.sh <dir>/dose calibrated-t20-01` | PASS (exit 0; 167 s) |
| All 31 game jobs, four at a time | 2,326 s wall time |
| `python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json --game <dir>/cal-balls-{0,1,2,3}.json --out <dir>/cal-analysis.json` | PASS (exit 0) |
| `python3 -I scripts/stage-c/c2-report.py ... --calibrated <dir>/cal-analysis.json --dose-calibrated <dir>/dose/per-point.json --tactical <dir>/tvall --balls-calibrated <dir>/cal-balls-{0,1,2,3}.json --out docs/pavilion/stage-c/c5rm-report.json` (synthetic inputs as in C5) | PASS (exit 0); verdicts in sections 2 and 4 |
| `python3 -I scripts/stage-c/c3-per-point-gate.py --dose <dir>/dose/per-point.json --mapping docs/pavilion/stage-c/c3-mapping.json --sign-range --pack-version "LC_CALIBRATED_T20_SKILL_V5 + LC_CALIBRATED_T20_DELIVERY_V2 + LC_CALIBRATED_T20_TACTICS_V1" --pack-sha256 64e09b4b... --out docs/pavilion/stage-c/c5rm-per-point.json` | PASS (exit 0) |
| `python3 -I scripts/stage-c/c4-analyse.py --game <dir>/g-{0,1,2,3}.json --forced <dir>/f-{0,1,2,3,4}.json --real /home/user/lcx-data/c1-real-calibration-balls.json --out docs/pavilion/stage-c/c5rm-delivery.json` | PASS (exit 0) |
| `python3 -I scripts/stage-c/c5-summary.py --before <C5 after>/g-{0,1,2,3}.json --after <dir>/g-{0,1,2,3}.json --levers-before <C5 after>/lev --levers-after <dir>/lev --forced-before <C5 after>/f-{0..4}.json --forced-after <dir>/f-{0..4}.json --out docs/pavilion/stage-c/c5rm-summary.json` | PASS (exit 0) |
| `python3 -I scripts/stage-c/c5-matchups.py --game <dir>/cal-balls-{0,1,2,3}.json --world packages/data/worlds/fictional-eight-01.json --out docs/pavilion/stage-c/c5rm-matchups.json` | PASS (exit 0) |
| `python3 -I scripts/stage-c/c5-adjusted-quick.py --game <files> --targets docs/pavilion/stage-c/c5-real-adjusted.json --period fit` and `--period selection`, on both the C5 after and the new game files | PASS (exit 0, 4 runs); results in section 2 (not committed: raw outputs in `<dir>/adjq-*.json`) |
| `NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --maxWorkers=2` (the repository has no `test:unit` script; `npm test` is `vitest run`) | FAIL (exit 1): 1,158 of 1,160 tests passed, 132 of 133 files; the 2 failures are both in `tests/unit/windows-launcher.test.ts` ("start.mjs exited early with code 1"; package script exit 1). The fresh worktree had no built web app (`apps/web/dist/index.html` absent), which those tests serve and package. |
| `npx vite build --config apps/web/vite.config.ts`, then `npx vitest run tests/unit/windows-launcher.test.ts` | PASS (exit 0 both; 4 of 4 tests). [Inference] The two failures above were the missing build in the new worktree, not a defect; the full suite was not re-run after the build. |
| `node scripts/check-pass07b-inventory.mjs` | PASS (exit 0; `"status":"PASS"`) |
| `c5-real-yardsticks.py`, `c5-real-adjusted.py` | NOT RUN: real-side only, unchanged by the harness; C5's committed outputs were used |
| `npm run lint`, `npm run typecheck`, browser suites | NOT RUN: no code changed |
| Holdout evaluation | NOT RUN, by design |

`<dir>` is `/home/user/lcx-data/c5rm`. The synthetic inputs to `c2-report.py` are the C3 re-measure's captain V4 files (`/home/user/lcx-data/c3rm/after/syn-analysis.json`, `dose-syn/per-point.json`, `syn-balls-{0,1,2,3}.json`) and `tactical-validation-v4.json`, exactly as in C5. **The `synthetic-alpha-01` columns of `c5rm-report.json` were therefore not re-measured on the per-ball harness**; only the `calibrated-t20-01` columns are new.

**Files added:** `C5_REMEASURE_BALL_BY_BALL.md` (this page), `c5rm-report.json`, `c5rm-per-point.json`, `c5rm-delivery.json`, `c5rm-summary.json` (its "before" side is C5's after files, so its `leversBefore` and `forcedAggressionBefore` repeat C5's after values), `c5rm-matchups.json`. No C5 file was changed.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/. Only derived aggregates are committed.

## 8. Open questions for the owner

1. Should the C5 gate record be read on this harness from now on? It is the harness the live game resembles (its passages ask the opponent before each ball). On it, 5 of 8 adjusted gates pass, not 7.
2. The batter scoring ratios and the death wicket rate moved in opposite directions to the death run rate. Whether to refit (skill steepness, death intercepts) is the owner's decision. This page changes nothing.
3. The synthetic reference columns in the gate report still come from captain V4, over at a time. Re-measuring them would take about 8 more game jobs (about 15 minutes of wall time on 4 cores).
