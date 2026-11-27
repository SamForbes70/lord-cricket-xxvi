# Batting policy V3 (captain V6): tail-enders at the death

Owner-approved captain batting change, 27 November 2026: lower-rated batters attack less at the death, as a new versioned policy, measured on the per-ball harness. Branch `pavilion/batting-policy-v3`, based on `main` at `ba04017`. New ids: `LC_T20_BATTING_POLICY_V3` and `LC_T20_TACTICAL_CAPTAIN_V6`. No model was refitted or tuned: `calibrated-t20-01` and `synthetic-alpha-01` are unchanged, and `calibrated-t20-01` stays unselectable. No engine, generator, contract or persisted format changed (section 7). No gate is claimed as accepted. The holdout (2025-08-30 onward) was not read.

**Why.** The C5 re-measure on the per-ball harness ([C5_REMEASURE_BALL_BY_BALL.md](stage-c/C5_REMEASURE_BALL_BY_BALL.md)) found, for `calibrated-t20-01` under captain V5: 5 of 8 adjusted gates pass (C5 had 7 of 8), with the three batter scoring ratios too flat, and the first-innings death wicket rate too high (9.89% a ball against 8.87% fit and 9.14% selection), mostly catches. Its [Inference] was that lower-rated batters attacking at the death flatten the batter ratios and add catches. Under V5, no first-innings death ball was batted below aggression 3.

## 1. The rule, as written before measuring

**Cricket reasoning.** In the suggested elevens of the fictional world, positions 1 to 4 are specialist batters (batting skill 246 to 302), positions 5 to 7 all-rounders and keepers (192 to 251) and positions 8 to 11 bowlers (108 to 168), all below the existing tail-ender line `TAIL_BELOW = 175` that V1 and V2 already use. In the death overs of a T20 innings a tail-ender's job, while a recognised batter is at the other end, is to get that batter on strike: the recognised batter is the one with the power and timing to clear the rope, and a tail-ender's slog mostly buys mis-hits and catches. In the last over everyone swings, because there is nothing left to save. With two tail-enders together there is no one to give the strike to, so they attack, but a full slog every ball from overs 16 to 19 loses the last wickets before the overs run out.

**`LC_T20_BATTING_POLICY_V3`** (`adviseT20BattingV3`, `packages/ai/src/batting-policy.ts`): V2 everywhere except a tail-ender on strike in the first innings's death overs (overs 16 to 20, setting a total) with more than one over left (more than 6 balls):

| Situation (first innings, overs 16 to 19) | V2 | V3 |
| --- | --- | --- |
| Tail-ender on strike, recognised batter (skill 175 or more, or unknown) at the other end | 3 and ROTATE while more than 12 balls are left, then 4 | **2 and ROTATE** |
| Two tail-enders | 3 while more than 12 balls are left (4 with four or more wickets in hand), then 4 | **3 at most** |
| Last over (6 balls or fewer left) | as V1 (4) | unchanged |
| A recognised batter on strike, any chase, the powerplay and middle overs | | unchanged |

V3 never asks for more aggression than V2 (unit-tested over a grid of situations). The rule uses only the threshold the policy already has; no new number was introduced.

**Captain V6** (`LC_T20_TACTICAL_CAPTAIN_V6`, `adviseT20Captain`, `packages/ai/src/t20-captain.ts`) is captain V5 with batting policy V3. Bowler choice, the bowling plans and field intent are V5's, and the unit tests check that every non-batting field of the advice is identical. V5 stays available as `adviseT20CaptainV5` (and V4 as `adviseT20CaptainV4`).

**A second candidate, also written before measuring.** Candidate B (`scripts/pavilion-batting-v3-candidates.ts`, `candidateBBatting`; research only, not in the game): V2 except in the first-innings death with more than 6 balls left, where a striker at least 50 batting-skill points below the batter at the other end (about one class in this world) attacks at 3 at most and looks for the single (ROTATE). It is the "relative to the side" version: it also holds an all-rounder batting with a specialist, but leaves a tail-ender with a recognised partner at V2's 3 in overs 16 to 18.

**Choice between them, set before measuring.** Candidate A (V3 as above) is the one for the game unless candidate B passes strictly more of the 8 adjusted gates on the whole calibration split for `calibrated-t20-01`. Both were implemented and committed (`c6ae56e`) before any of their results were produced; no number in either was changed afterwards. Two candidates were tried, and both are reported below. This criterion is recorded here and was not committed before measuring.

**Go-live test, set before measuring.** V6 replaces V5 in the live game (as V5 replaced V4 in the same pull request) unless, on `synthetic-alpha-01`, V6 loses to V5 head to head with the 95% interval of its share of decided matches wholly below 50%, or a tactical-validation experiment that showed good management winning under V5 (interval above 50%) no longer does.

## 2. Method

As the C5 re-measure ([C5_REMEASURE_BALL_BY_BALL.md](stage-c/C5_REMEASURE_BALL_BY_BALL.md), section 1), with the captain the only change:

- **Matches.** The frozen 100-seed corpus, suggested elevens, the same captain on both sides, repeats 0 to 19 (2,000 matches; repeat r > 0 appends `-c1r<r>` to the seed). The batch harness asks the captain before every ball (`tacticalT20Step`, `ADVANCE { scope: "DELIVERY" }`).
- **Before.** The C5 re-measure's own files for `calibrated-t20-01` (`/home/user/lcx-data/c5rm/`, captain V5 at `5fc98e3`). A check: `c4-delivery-balls.ts ... 1 0 --captain=V5` on this branch reproduced the first 100 matches of `c5rm/g-0.json` column for column, and the paired summaries reproduce every c5rm death figure (9.73 runs an over, 9.89% wickets, 17.9% dots, 8.24 caught per 100 balls). For `synthetic-alpha-01` the C5 re-measure has no V5 ball-by-ball files, so V5 and V6 were both run on this branch (`--captain=V5` and `--captain=V6`).
- **Scripts.** `scripts/stage-c/c1-game-balls.ts` (for the gates) and `scripts/stage-c/c4-delivery-balls.ts` (death figures) take a new `--captain=V4|V5|V6|V6B` option; the default is the current captain. `scripts/pavilion-tactical-validation.ts` takes `--captain=V4|V5|V6` (default V6). `scripts/pavilion-captain-v5-measure.ts` now imports `adviseT20CaptainV5` under its old name, so it measures what it measured before.
- **Gates.** `c1-analyse.py` (P10 to P90 match-bootstrap brackets) and the real ranges of `c2-report.py`, as in the C5 re-measure; the fit and selection periods with `c5-adjusted-quick.py` and `c5-real-adjusted.json`.
- **Death figures.** New `scripts/pavilion-batting-v3-summary.py`: first innings, overs 16 to 20, the definitions of `c5-summary.py`, 1,000 match-bootstrap resamples, and the change after minus before **paired** by match (same seeds). It also splits death balls by the striker's class (tail-ender or recognised) from the `c1-game-balls.ts` files.
- **Strength.** New `scripts/pavilion-batting-v3-h2h.ts`: each corpus seed twice, V6 (or candidate B) on one side and V5 on the other, then swapped; each ball takes the batting side's captain (V5 and V6 bowl and field identically). Tactical validation: all 11 experiments, 200 matches each, both models.

## 3. Results: the 8 adjusted gates (`calibrated-t20-01`)

Real range: the full-member calibration split (`c2-report.py`). Game: P10 to P90 match-bootstrap brackets from `c1-analyse.py`. These brackets are the P10 to P90 percentiles of the match bootstrap (100 replicates), not 95% intervals; this page first labelled them 95% (corrected 27 November 2026, see `stage-c/C6_REFIT.md` section 3). No verdict used them. "V5" is the C5 re-measure.

| Effect | Real range | V5 (C5 re-measure) | **V6 (candidate A)** | Candidate B |
| --- | --- | --- | --- | --- |
| Batter runs | 1.388 to 1.447 | 1.315 (1.295 to 1.331) FAIL | **1.347 (1.330 to 1.363) FAIL** | 1.320 (1.303 to 1.336) FAIL |
| Batter boundary | 1.684 to 1.816 | 1.594 (1.553 to 1.633) FAIL | **1.632 (1.590 to 1.670) FAIL** | 1.598 (1.556 to 1.631) FAIL |
| Batter non-dot | 1.226 to 1.266 | 1.210 (1.203 to 1.221) FAIL | **1.236 (1.226 to 1.246) PASS** | 1.216 (1.209 to 1.228) FAIL |
| Batter dismissal | 0.666 to 1.000 | 0.780 (0.768 to 0.802) PASS | 0.810 (0.795 to 0.838) PASS | 0.779 (0.768 to 0.803) PASS |
| Bowler runs | 0.766 to 0.802 | 0.781 (0.775 to 0.787) PASS | 0.780 (0.774 to 0.786) PASS | 0.779 (0.773 to 0.785) PASS |
| Bowler boundary | 0.614 to 0.681 | 0.656 (0.649 to 0.663) PASS | 0.654 (0.647 to 0.661) PASS | 0.654 (0.646 to 0.661) PASS |
| Bowler non-dot | 0.841 to 0.865 | 0.852 (0.848 to 0.856) PASS | 0.851 (0.847 to 0.855) PASS | 0.851 (0.847 to 0.855) PASS |
| Bowler dismissal | 1.000 to 1.364 | 1.142 (1.116 to 1.168) PASS | 1.149 (1.123 to 1.174) PASS | 1.144 (1.115 to 1.173) PASS |
| **Total** | | **5 of 8** | **6 of 8** | **5 of 8** |

By period (`c5-adjusted-quick.py`, point values, no intervals):

| Period | V5 | V6 | Candidate B |
| --- | --- | --- | --- |
| Fit (to 2023-08-31) | 5 of 8 | **8 of 8** (batter runs 1.347 against 1.336 to 1.410; boundary 1.632 against 1.605 to 1.781; non-dot 1.236 against 1.212 to 1.257) | 6 of 8 (fails batter runs 1.320, boundary 1.598) |
| Selection (2023-09-01 to 2025-08-24) | 4 of 8 | **6 of 8** (fails batter runs 1.347 against 1.392 to 1.537 and boundary 1.632 against 1.680 to 1.978; bowler non-dot 0.851 is at the top of 0.802 to 0.851) | 4 of 8 (fails batter runs, boundary, bowler non-dot 0.851, batter dismissal 0.779) |

**Reading.** V6 moves all three batter scoring ratios towards the real range, by about a third of the gap for runs and boundaries, and brings non-dot inside it. Batter runs and boundary still fail on the whole split and the selection period. C5 (captain V4, over at a time) passed 7 of 8; V6 does not get back there. By the rule in section 1, candidate A is chosen: B does not pass more gates (it passes the same 5 as V5).

[Inference] The gap that remains is not all at the death. Under V6 the bottom-rated quarter (mostly positions 8 to 11) still bats at 2 to 4 in the first innings's death, and V3 does not touch the chase, where tail-enders are already held by V1's rules.

## 4. Results: first-innings death overs, both models

First innings, overs 16 to 20, 2,000 matches each. Brackets: 95% match-bootstrap intervals; "Change" is after minus before, paired by match. Real: full-member men's T20 internationals, calibration split, fit / selection, from the C5 re-measure (section 3). Files: `batting-policy-v3/summary-calibrated-v6.json`, `summary-calibrated-v6b.json`, `summary-synthetic-v6.json`.

### 4a. `calibrated-t20-01` (research)

| Death overs | Real fit / selection | V5 (C5 re-measure) | **V6** | Change V6 minus V5 | Candidate B |
| --- | --- | --- | --- | --- | --- |
| Runs an over | 9.75 / 9.84 | 9.73 (9.61 to 9.85) | **9.26 (9.13 to 9.39)** | -0.48 (-0.52 to -0.44) | 9.57 (9.45 to 9.68) |
| Wicket % a ball | 8.87 / 9.14 | 9.89 (9.65 to 10.13) | **9.23 (9.01 to 9.45)** | -0.66 (-0.74 to -0.57) | 9.64 (9.40 to 9.88) |
| Dot %, wicket balls excluded | 18.8 / 23.6 | 17.9 (17.5 to 18.4) | **21.8 (21.3 to 22.4)** | +3.9 (3.6 to 4.1) | 18.8 (18.4 to 19.2) |
| Four % | 11.1 / 11.3 | 9.1 (8.9 to 9.4) | 8.7 (8.4 to 9.0) | -0.45 (-0.56 to -0.34) | 9.0 (8.7 to 9.3) |
| Six % | 7.4 / 8.5 | 9.1 (8.9 to 9.4) | 8.6 (8.4 to 8.9) | -0.50 (-0.59 to -0.42) | 8.9 (8.6 to 9.1) |
| Caught per 100 balls (real: caught and caught and bowled) | 5.60 (fit) | 8.24 (8.02 to 8.46) | **7.74 (7.54 to 7.96)** | -0.50 (-0.57 to -0.42) | 8.05 (7.83 to 8.27) |
| Bowled per 100 balls | 1.74 (fit) | 0.43 | 0.42 | -0.01 (-0.02 to 0.01) | |
| Run out per 100 balls | 1.07 (fit) | 1.09 | 0.94 | -0.15 (-0.19 to -0.11) | |
| Lbw / stumped per 100 balls | 0.35 / 0.14 (fit) | 0.08 / 0.08 | 0.07 / 0.08 | no clear change | |
| Aggression 2 / 3 / 4, % of legal balls | | 0 / 19.1 / 80.9 | **13.8 / 14.9 / 71.3** | | 0 / 27.3 / 72.7 |
| First-innings runs | 158.9 / 166.0 | 162.7 (161.0 to 164.4) | 160.8 (159.1 to 162.5) | -1.9 (-2.1 to -1.7) | 162.0 |
| First-innings wickets | 6.40 / 6.87 | 7.13 (7.04 to 7.22) | 6.97 (6.88 to 7.06) | -0.17 (-0.19 to -0.14) | 7.06 |

Powerplay and middle overs are identical in all three columns (the first 15 overs are played the same way). Aggression by phase, first innings, V5 and V6 alike: powerplay and middle unchanged; second-innings death 1 / 2 / 3 / 4: V5 26.5 / 27.3 / 4.9 / 41.3, V6 27.5 / 26.8 / 4.9 / 40.7 (the chase rules are unchanged; targets differ).

**By the striker's class** (first-innings death, from the `c1-game-balls.ts` files):

| | V5 | V6 | Change |
| --- | --- | --- | --- |
| Tail-enders' share of death balls | 35.2% | 35.9% | +0.8 (0.4 to 1.1) |
| Tail-enders: runs a ball / dismissal % / boundary % | 1.26 / 9.36 / 12.1 | 1.05 / 7.58 / 9.5 | -0.21 / -1.78 / -2.5 |
| Recognised batters: runs a ball / dismissal % / boundary % | 1.79 / 9.41 / 21.6 | 1.79 / 9.48 / 21.7 | no clear change |

**Reading.**
- The death wicket rate falls from 9.89% to 9.23% (9.01 to 9.45), close to the selection period (9.14) and still above the fit period (8.87). Catches fall by half a wicket per 100 balls; the rest of the excess catches remain (7.74 against 5.60 real).
- Death runs an over fall from 9.73 to 9.26 (9.13 to 9.39), now **below both real periods** (9.75, 9.84). Death dots rise to 21.8%, between the two real periods (18.8 and 23.6).
- The change is all in the tail-enders' own balls: they score 0.21 runs a ball less and are out 1.8 points less often. Recognised batters score exactly as before. Rotating the strike did not give the recognised batters more of the death balls: the tail-enders' share rose slightly. [Inference] Fewer tail-enders were out, so they stayed in longer, which outweighed any singles that gave the strike away. Not separately tested.
- Candidate B moves everything in the same direction by about a third as much.
- The boundary mix is still off: fours 8.7% against 11.1%, sixes 8.6% against 7.4%.

### 4b. `synthetic-alpha-01` (live)

| Death overs | V5 | **V6** | Change V6 minus V5 |
| --- | --- | --- | --- |
| Runs an over | 6.67 (6.57 to 6.79) | 6.53 (6.42 to 6.64) | -0.14 (-0.17 to -0.12) |
| Wicket % a ball | 11.24 (10.98 to 11.51) | 10.78 (10.53 to 11.03) | -0.47 (-0.55 to -0.39) |
| Dot %, wicket balls excluded | 50.3 (49.8 to 50.8) | 50.9 (50.4 to 51.4) | +0.6 (0.5 to 0.7) |
| Four % / six % | 7.9 / 8.0 | 7.8 / 7.6 | -0.15 / -0.32 |
| Caught / bowled / run out / lbw per 100 balls | 10.09 / 0.93 / 0.06 / 0.10 | 9.63 / 0.91 / 0.06 / 0.10 | caught -0.45 (-0.53 to -0.38); others no clear change |
| Aggression 2 / 3 / 4, % of legal balls | 0 / 28.7 / 71.3 | 14.0 / 25.3 / 60.8 | |
| First-innings runs | 112.9 (111.7 to 114.0) | 112.6 (111.5 to 113.7) | -0.30 (-0.43 to -0.18) |
| First-innings wickets | 8.08 (8.00 to 8.16) | 7.99 (7.91 to 8.07) | -0.09 (-0.11 to -0.07) |

The live model makes no claim to match real cricket, so no real column is given. In it the change is small: a third of a run per innings and a tenth of a wicket.

## 5. Strength and what management decides

**Head to head** (`scripts/pavilion-batting-v3-h2h.ts`, 100 seeds each played twice, ball by ball; files `batting-policy-v3/h2h-*.json`):

| Model | Candidate wins | V5 wins | Ties or no result | Candidate share of decided | Run difference (candidate minus V5), per match |
| --- | ---: | ---: | ---: | --- | --- |
| `calibrated-t20-01`, V6 | 97 | 93 | 10 | 51.1% (44.0 to 58.1) | -0.5 (-5.2 to 4.2) |
| `synthetic-alpha-01`, V6 | 99 | 100 | 1 | 49.7% (42.9 to 56.6) | -0.2 (-3.8 to 3.4) |
| `calibrated-t20-01`, candidate B | 95 | 97 | 8 | 49.5% (42.5 to 56.5) | -0.4 (-5.1 to 4.4) |

Neither candidate beats or loses to V5 measurably. V6 is a realism change, not a stronger captain.

**Tactical validation** (all 11 experiments, 200 matches each, ball by ball; good side's wins of decided matches with 95% Wilson interval; paired run difference per innings with 95% interval). `calibrated-t20-01` V5 is the C5 re-measure; `synthetic-alpha-01` V5 was re-run on this branch (`--captain=V5`) and reproduces the V5 page's section 4f column exactly. Files: `batting-policy-v3/tactical-validation-v6-*.json` and `tactical-validation-v5-synthetic.json`.

| Experiment (poor side) | `calibrated-t20-01` V5 | `calibrated-t20-01` V6 | `synthetic-alpha-01` V5 | `synthetic-alpha-01` V6 |
| --- | --- | --- | --- | --- |
| Weakest eleven | 86.2% (80.7 to 90.4); +22.0 | 85.8% (80.2 to 90.0); +21.8 (16.3 to 27.2) | 56.7% (49.7 to 63.5); +3.4 | 56.0% (48.9 to 62.8); +3.1 (-0.7 to 6.8) |
| Old selection rule | 86.2% (80.6 to 90.3); +20.6 | 86.3% (80.7 to 90.5); +20.6 (15.7 to 25.5) | 80.6% (74.5 to 85.5); +13.6 | 80.8% (74.8 to 85.7); +13.2 (9.4 to 17.1) |
| Batting order reversed | 80.7% (74.6 to 85.7); +17.9 | 80.4% (74.3 to 85.4); +17.1 (12.5 to 21.8) | 73.1% (66.4 to 78.8); +8.1 | 73.7% (67.1 to 79.4); +8.1 (4.2 to 11.9) |
| Aggression 4 every ball | 46.4% (39.6 to 53.4); -1.4 | 45.4% (38.6 to 52.4); -1.9 (-7.4 to 3.6) | 53.0% (46.1 to 59.9); +4.6 | 53.0% (46.1 to 59.9); +4.5 (0.3 to 8.6) |
| Aggression 0 every ball | 92.4% (87.8 to 95.3); +34.8 | 92.4% (87.8 to 95.3); +33.4 (27.3 to 39.5) | 66.3% (59.5 to 72.6); +6.2 | 65.8% (58.9 to 72.1); +6.0 (3.1 to 9.0) |
| Weakest bowler first | 66.8% (60.0 to 73.0); +13.6 | 65.7% (58.8 to 71.9); +13.3 (8.2 to 18.4) | 48.7% (41.8 to 55.7); +0.0 | 49.7% (42.8 to 56.7); -0.2 (-3.8 to 3.4) |
| Full length, maximum effort | 54.4% (47.4 to 61.3); +0.7 | 53.2% (46.1 to 60.1); +1.1 (-3.7 to 6.0) | 50.3% (43.3 to 57.2); +0.3 | 51.0% (44.1 to 57.9); +0.8 (-2.9 to 4.5) |
| Good length throughout | 51.6% (44.5 to 58.6); -0.7 | 52.6% (45.6 to 59.5); -0.1 (-4.8 to 4.7) | 51.5% (44.6 to 58.4); -0.2 | 52.3% (45.3 to 59.1); +0.6 (-3.1 to 4.2) |
| Maximum effort throughout | 54.5% (47.4 to 61.4); +0.7 | 54.0% (46.9 to 60.9); +0.7 (-4.1 to 5.5) | 50.5% (43.6 to 57.4); +0.7 | 51.0% (44.1 to 57.9); +0.8 (-2.9 to 4.4) |
| Conserve effort throughout | 48.1% (41.1 to 55.2); +0.4 | 48.1% (41.1 to 55.2); +0.8 (-4.0 to 5.5) | 49.5% (42.6 to 56.4); -0.2 | 49.5% (42.6 to 56.4); -0.6 (-4.0 to 2.9) |
| Two-slip field all innings | 62.9% (55.9 to 69.4); +9.5 | 65.1% (58.0 to 71.5); +9.2 (3.9 to 14.5) | 55.8% (48.9 to 62.6); +3.6 | 56.1% (49.1 to 62.9); +3.7 (-0.1 to 7.5) |

Every V6 result lies within the V5 interval of the same experiment, in both models. Selection, batting order, blocking, bowler choice (research model) and the field still decide matches; bowling plans still do not; full attack is still not shown to be worse than the captain in either model.

## 6. Does V3 go live?

**Yes: V6 is the live captain from this pull request**, as V5 was in its own. The test of section 1 was met on `synthetic-alpha-01`:

- head to head, V6 against V5: 49.7% of decided matches (42.9 to 56.6), not wholly below 50%;
- the three experiments in which good management won under V5 (old selection rule, batting order reversed, aggression 0 every ball) still win, with intervals above 50% and within their V5 intervals;
- the live model's first-innings runs fall by 0.3 (0.2 to 0.4) and wickets by 0.09 a match; death runs an over by 0.14 and death wickets by 0.47 points.

[Inference] For a player the change shows up only as the computer side's tail-enders taking singles in overs 16 to 19 with a recognised batter at the other end, which reads as ordinary cricket. Nothing measured makes the live game worse.

## 7. Compatibility

**How the game records the captain.** As for V5 ([CAPTAIN_V5_DEATH_OVERS.md](CAPTAIN_V5_DEATH_OVERS.md), section 6): the captain's choices reach a match only as commands (`SET_BOWLER`, `SET_BATTING_PLAN`, `SET_BOWLING_PLAN`), a saved match is rebuilt by re-executing its stored commands (`rehydrateT20Session`), and no captain id is persisted. So a match played under V5 replays with V5's choices, whatever the code now running; only choices made after a resume come from V6.

**Evidence.**
- `scripts/pavilion-captain-v5-replay-check.ts generate` at `ba04017` (`main`, captain V5, in a separate worktree) saved 14 sessions: 3 seeds with the batch captain and each of the three computer-opponent modes, and two matches stopped part-way (first innings ball 60, second innings ball 96). File `/home/user/lcx-data/bat3/replay/replay-v5-ba04017.json`, SHA-256 `cace23e90994062c8cc67c857a967df5179273d2bc506d8992c1dfdf9db2c25e` (outside the repository).
- `... check` on this branch: **14 of 14** rehydrated with identical events, commands and hash chain; both in-progress matches finished under V6 with their recorded commands unchanged. Played live under V6, 4 of the 12 finished set-ups differ from the saved V5 match (all four on seed 1), so the identical replays are not because V6 makes the same choices. Output: `batting-policy-v3/replay-v5-ba04017-check.json`.
- Unit tests (`tests/unit/pavilion-batting-policy-v3.test.ts`): V5 matches replay identically under V6 code and V6 plays at least one of the same set-ups differently; a V5 match saved in the first innings's death overs resumes and finishes under V6 with its recorded commands unchanged; and the live game's computer opponent (`apps/web/src/match/ai-opponent.ts`, advanced ball by ball) sends a tail-ender in at 2 with ROTATE in the first-innings death, which V5 never did.
- Older captains: the V5 suite (`pavilion-captain-v5.test.ts`) still replays V4 matches; it now names V5 explicitly (`adviseT20CaptainV5`).

**Where V6 is used.** `adviseT20Captain`, so the computer opponent in the live game and the batch harness. No web file changed: the opponent already calls `adviseT20Captain`. `apps/web/src/main.tsx` was not touched. Career fixtures use their own policies (`LC_FIXTURE_CAPTAIN_V1`, `V2`) and are unaffected; one-day and five-day captains are unchanged.

**Formats.** `git diff --stat origin/main` lists no file under `packages/data`, `packages/simulation`, `packages/contracts`, `packages/persistence`, `packages/projections` or `apps/web`. The research outputs of `c1-game-balls.ts` and `c4-delivery-balls.ts` gain a top-level `captain` field (raw research files, not committed and not a game format).

## 8. What passes and what fails

**`calibrated-t20-01` under V6 (research):**

- Adjusted criterion 1: **6 of 8 PASS** on the whole split (V5: 5 of 8; C5 with V4, over at a time: 7 of 8). Fit period 8 of 8; selection period 6 of 8. **FAIL:** batter runs 1.347 (1.330 to 1.363) against 1.388 to 1.447, batter boundary 1.632 (1.590 to 1.670) against 1.684 to 1.816; both still too flat. Newly passing: batter non-dot.
- Death wicket rate: 9.23% (9.01 to 9.45), still above both real periods (8.87 fit, 9.14 selection); the interval includes the selection value but not the fit value.
- Death runs an over: 9.26 (9.13 to 9.39), **now below** both real periods (9.75, 9.84). This was a match under V5 and is now a miss.
- Death dots: 21.8%, inside the real span (18.8 fit, 23.6 selection).
- Death catches 7.74 per 100 balls against 5.60; bowled 0.42 against 1.74; fours 8.7% against 11.1%; sixes 8.6% against 7.4%. Unchanged in kind.
- Raw criterion 1 (`report-v6.json`): 1 PASS, 5 UNCLEAR, 3 FAIL (V5: 0, 6, 3).
- Specialisation: strike-rate and economy ratios PASS, average ratio FAIL (0.78 of real), as under V5.
- Per-point sign and range rule (`per-point-v6.json`, dose re-run under V6): 9 of 9 PASS; 2 of 8 inside the C3 range, as before.
- First-innings aggregates: 160.8 runs (real 158.9 / 166.0), 6.97 wickets (6.40 / 6.87).

**Candidate B:** 5 of 8 adjusted gates (fit 6, selection 4); death 9.57 runs an over, 9.64% wickets. Not chosen.

**`synthetic-alpha-01` under V6 (live):** no gates apply (no empirical claim). Strength and tactical validation unchanged within intervals.

## 9. Limitations

- The rule reads only the striker's and partner's batting skill against the existing tail-ender line. It does not read form, the bowler, or how set the recognised batter is.
- Only the first innings's death changed. The chase is V2's (V1's tail-ender hold already applies there).
- The fictional world's tail is uniform: positions 8 to 11 are all bowlers below 175, so "tail-ender" and "bottom-rated quarter" nearly coincide here. A world with batting all-rounders at 8 would behave differently.
- Death runs an over now sit below the real range (9.26 against 9.75 and 9.84). V6 trades runs for wickets; it did not get both right.
- Death catches (7.74 per 100 balls against 5.60), the boundary mix and the first-innings wicket count remain off in the research model. Those are model terms; this pass did not touch the model.
- The choice rule between candidates was decided before measuring but written down only in this page, not committed beforehand.
- Synthetic model results make no claim about real cricket.

## 10. Commands, revisions and results

**Revisions.** Implementation committed at `c6ae56e` (branch `pavilion/batting-policy-v3` on `main` at `ba04017`) before any candidate was measured. The 24 game jobs of batch 1 ran at `c6ae56e`; the 37 jobs of batch 2 (tactical validation, head to head, dose) ran with the tests and head-to-head script added (`c22a2c8`, same captain and harness code). The full unit suite, build, typecheck, lint and inventory check ran on the tree `02e1dc59` (identical code to the final head; only this page and copied result files were added after). Linux container, 4 cores, Node 22. Raw ball files are outside the repository in `/home/user/lcx-data/bat3/` (job lists `jobs.txt`, `jobs2.txt`; per-job exit codes `exits.log`, `exits2.log`; analysis scripts `analyse.sh`, `analyse2.sh`, exits in `analyse-exits.log`).

| Command | Result |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` (fresh worktree, then after the change) | PASS (exit 0, both) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/probe/v5-r0.json 1 0 --captain=V5`, compared with the first 100 matches of `c5rm/g-0.json` | PASS (exit 0; identical, column for column) |
| `node --import tsx scripts/stage-c/c1-game-balls.ts <dir>/<c>/cal-balls-$k.json 5 $((k*5)) --model=calibrated-t20-01 --captain=<V6, V6B>` (k = 0 to 3) | PASS (exit 0, 8 jobs) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/<c>/g-$k.json 5 $((k*5)) --captain=<V6, V6B>` (k = 0 to 3) | PASS (exit 0, 8 jobs) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/syn-<v>/g-$k.json 5 $((k*5)) --model=synthetic-alpha-01 --captain=<V5, V6>` (k = 0 to 3) | PASS (exit 0, 8 jobs) |
| Batch 1, 24 jobs four at a time | 2,868 s wall time |
| `node --import tsx scripts/pavilion-tactical-validation.ts <dir>/tv/<model>-<experiment>.json <experiment> [--model=calibrated-t20-01] --captain=V6` (11 experiments, both models) and `--captain=V5` for `synthetic-alpha-01` | PASS (exit 0, 33 jobs) |
| `node --import tsx scripts/pavilion-batting-v3-h2h.ts <dir>/h2h/h2h-<c>-<model>.json --model=<model> [--candidate=V6B]` (V6 both models, V6B research model) | PASS (exit 0, 3 jobs) |
| `bash scripts/stage-c/c2-dose.sh <dir>/dose calibrated-t20-01` (under V6) | PASS (exit 0) |
| Batch 2, 37 jobs four at a time | 2,077 s wall time |
| `python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json --game <dir>/<c>/cal-balls-{0,1,2,3}.json --out <dir>/<c>/cal-analysis.json` (V6, V6B) | PASS (exit 0, both) |
| `python3 -I scripts/stage-c/c5-adjusted-quick.py --game <dir>/<c>/cal-balls-{0,1,2,3}.json --targets docs/pavilion/stage-c/c5-real-adjusted.json --period <fit, selection>` (V6, V6B) | PASS (exit 0, 4 runs) |
| `python3 -I scripts/stage-c/c2-report.py ... --calibrated <dir>/<c>/cal-analysis.json --dose-calibrated <dir>/dose/per-point.json --tactical <dir>/tvall --balls-calibrated <dir>/<c>/cal-balls-{0,1,2,3}.json --out docs/pavilion/batting-policy-v3/report-<c>.json` (synthetic inputs and real side as the C5 re-measure; V6B uses V6's dose and tactical inputs, only its criterion 1 rows are read) | PASS (exit 0, both) |
| `python3 -I scripts/stage-c/c3-per-point-gate.py --dose <dir>/dose/per-point.json --mapping docs/pavilion/stage-c/c3-mapping.json --sign-range ... --out docs/pavilion/batting-policy-v3/per-point-v6.json` | PASS (exit 0) |
| `python3 -I scripts/pavilion-batting-v3-summary.py --before ... --after ... [--balls-before ... --balls-after ...] --out docs/pavilion/batting-policy-v3/summary-<...>.json` (3 runs) | PASS (exit 0, 3) |
| `node --import tsx scripts/pavilion-captain-v5-replay-check.ts generate <dir>/replay/replay-v5-ba04017.json` at `ba04017` (separate worktree) | PASS (exit 0; 14 sessions) |
| `node --import tsx scripts/pavilion-captain-v5-replay-check.ts check <dir>/replay/replay-v5-ba04017.json` on this branch | PASS (exit 0; 14 of 14 identical, 0 failures) |
| `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `NODE_OPTIONS=--max-old-space-size=4096 npm run build` | PASS (exit 0) |
| `NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --maxWorkers=2` (after the build) | PASS (exit 0; 135 files, 1,176 tests) |
| `node scripts/check-pass07b-inventory.mjs` | PASS (exit 0; `"status":"PASS"`) |
| Forced-aggression and bowling-plan lever runs, matchups | NOT RUN: unaffected by the batting policy in the forced runs, or not needed for this question |
| Browser suites (`playwright`) | NOT RUN locally; hosted CI runs them |
| Holdout evaluation | NOT RUN, by design |

`<dir>` is `/home/user/lcx-data/bat3`; `<c>` is `v6` or `v6b`.

**Files added:** this page; `batting-policy-v3/` with `report-v6.json`, `report-v6b.json`, `per-point-v6.json`, `summary-calibrated-v6.json`, `summary-calibrated-v6b.json`, `summary-synthetic-v6.json`, `h2h-V6-calibrated-t20-01.json`, `h2h-V6-synthetic-alpha-01.json`, `h2h-V6B-calibrated-t20-01.json`, `tactical-validation-v6-calibrated.json`, `tactical-validation-v6-synthetic.json`, `tactical-validation-v5-synthetic.json` (each merged from the 11 per-experiment files) and `replay-v5-ba04017-check.json`.

## 11. Open questions for the owner

1. V6 trades death runs for death wickets in the research model: wickets move towards real, runs move below it (9.26 against 9.75). Is that the trade the owner wants, or should the death runs gap be looked at separately (for example the boundary mix, fours too few and sixes too many)?
2. Batter runs and batter boundary ratios still fail on the whole split and the selection period. The remaining gap is about two thirds of the original. [Inference] Further captain changes at the death will not close it alone; the next lever would be the model's skill steepness, which is a refit and needs the owner's decision. Nothing was refitted here.
3. Death catches remain high (7.74 per 100 balls against 5.60) and bowled low (0.42 against 1.74). Those are model terms, outside a captain change.
4. Should the C5 gate record now be read under captain V6? On it, 6 of 8 adjusted gates pass.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/. Only derived aggregates are committed.
