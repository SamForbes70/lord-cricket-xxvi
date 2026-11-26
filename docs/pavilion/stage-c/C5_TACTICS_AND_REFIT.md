# Stage C slice C5: delivery V2, tactics, skill refit and full re-measure (research only)

**Status:** research only. `calibrated-t20-01` stays unselectable in the game and is not activated. `synthetic-alpha-01`, the live game, replays, saves and persisted formats are unchanged (section 9). No gate is claimed as accepted; the owner accepts results. The holdout (2025-08-30 onward) was not read.

**Why.** Studio Production Directive 01, priority 2: "Establish meaningful and measurable effects for batting intent, bowling plans, field placement, player selection, matchups and fatigue." The owner approved a four-step pass: delivery V2, tactical levers, a skill refit to the adjusted quarter ratios, and a full re-measure. Directive 02 (26 November 2026, Workstream A) added three points, folded in here:
- A1: the "before" column is the C4 model (delivery V1, skill V4) under captain V4, with the full gate set. It is the C4 re-measure record.
- A3: rare dismissal kinds are checked against the calibration split and corrected through mechanisms (section 5).
- A4: matchups are measured where a yardstick exists (section 7d).

**Revisions.**
- Before: `main` at `4558fdb` (captain V4; skill `LC_CALIBRATED_T20_SKILL_V4`, delivery `LC_CALIBRATED_T20_DELIVERY_V1`; model hash `27090e93...`).
- After: this branch at `b5fca25`. The model has three components, and its hash covers all three:
  - `LC_CALIBRATED_T20_DELIVERY_V2`;
  - `LC_CALIBRATED_T20_TACTICS_V1` (new);
  - `LC_CALIBRATED_T20_SKILL_V5`.
- The SHA-256 values are in section 8.

**Commits on the branch.**

| Commit | Step |
| --- | --- |
| `2ba516b` | 1. Delivery V2 mechanisms, first fit |
| `199ef51` | 2. Tactics component; three delivery V2 values re-set |
| `84734bf` | 3. Skill V5; delivery V2 phase intercepts and attacking terms re-set |
| `fbf9e84` | Directive 02 A3: rare dismissal kinds; skill V5 touch-up |
| `b5fca25` | Pitch term halved, after a full run showed the spread of totals too wide (section 4d) |
| this commit | 4. Full re-measure and this write-up |

**All three components were changed in later commits before publication.** None was published between commits. Each later change is recorded in the iteration tables (section 4). [Inference] The phase rates, the skill steepness and the tactics all act on the same overs. So a delivery fit made without the later steps did not survive them, and the final values were set together.

## 1. Method

**Game.**
- The frozen 100-seed corpus, suggested elevens, captain V4 (the tactical captain) on both sides.
- Repeats 0 to 19: 2,000 matches for each model state.
- Delivery-branch files: `c4-delivery-balls.ts`. Skill files: `c1-game-balls.ts`.
- Forced runs hold one choice for both sides on every ball, 200 matches each:
  - aggression 0 to 4;
  - C5: length GOOD, FULL or YORKER, or effort CONSERVE, NORMAL or MAXIMUM. The other part of the plan stays the captain's.
- Tactical validation (`scripts/pavilion-tactical-validation.ts --model=calibrated-t20-01`): 200 matches for each experiment. Each seed is played twice, with the poor management on each side.
- C5 adds three single-lever bowling-plan experiments. The eight existing experiments are unchanged.

**Real side.**
- Full-member men's T20 internationals, first innings, calibration split only:
  - fit period: matches to 2023-08-31 (835 innings);
  - selection period: 2023-09-01 to 2025-08-24 (166 innings).
- `c5-real-yardsticks.py` gives the dismissal kinds by phase and the spread of totals. A "full" innings is one that ended all out or after 120 legal balls. An innings that ended early without being all out was shortened.
- `c5-real-adjusted.py` gives the adjusted quarter ratios by period. It uses the same estimator as `c1-analyse.py`.

**Choices.**
- Values were fitted on the fit period.
- The selection period only chose between candidates or checked a choice.
- Delivery rule: among iterations with fit distance at most 2.5 (main: 3.69), choose the smallest selection distance. Distance is the sum of absolute gaps in dot %, boundary % and the three phase run rates.
- [Inference] I set the 2.5 threshold after iteration 7, having seen the results. It is a judgement, not a rule fixed in advance.

**No real yardstick for tactics or matchups.**
- Cricsheet records neither the field, nor the length or pace of a ball, nor a bowler's style or a batter's hand.
- The tactics values are therefore design choices. They are bounded (no term above 0.7 of a logit unit, enforced by a unit test) and labelled in the pack (`basis`).
- The only real proxy for the cost of attacking is the middle-to-death phase comparison from C4: 0.13 (fit) and 0.16 (selection) extra wickets a ball for each extra run a ball. It is confounded.

## 2. What changed

### 2a. Delivery V2 (`packages/data/src/calibrated-t20-delivery-pack.ts`)

Each item is a parameter of an existing branch. There is no run or result multiplier.

| Mechanism | What it does | Final value |
| --- | --- | --- |
| Attacking into a spread field | Above aggression 2, a ground or aerial shot is less often a dot and more often a single or two. The feature is the attacking levels above 2 times the field's spread, at 2,000 bp for each boundary rider. | dot -5,000, one +2,500, two +2,000 |
| Skied slog | Added to the aerial catch chance for each aggression level above 2 | +300 |
| Hard running | Aggression raises the run-out chance | +8,000 on the aggression feature; run-out intercept -57,000 |
| Stumping | Larger stumping fraction for a miss by a batter advancing (aggression above 2) to spin | 70 / 1,000 of the keeping sigmoid (was 3 / 1,000) |
| Pitch | Seam plus turn of the current pitch, about a centre of 5,600 each: more false shots and fewer boundaries on a bowler-friendly pitch, in both innings | misses, pads and edges +4,500; dot +3,000; four and six -3,750 |
| Rare dismissals (A3) | Hit-wicket contact intercept in every phase; bowled and lbw intercepts | hit wicket -16,000; bowled -26,000; lbw -21,000 |
| Refitted V1 values | Phase contact intercepts, ring and deep cover, attacking run values, the aerial catch chance and the ground two weight | in the pack |

[Inference] The attacking feature was first per-sector deep cover (iterations 1 to 3). That cover is patchy with four boundary riders in eight sectors, so ground-shot dots at the death barely differed from the middle overs. It is now a field-level count of fielders back.

### 2b. Tactics V1 (`packages/data/src/calibrated-t20-tactics-pack.ts`; design choices)

| Lever | Mechanism | Trade-off |
| --- | --- | --- |
| Length (executed) | Yorker: misses +500, aerial -1,500, dot +500, four -1,000, six -2,000, bowled +5,000, lbw +3,000; and +1,000 misses for each attacking level. Full: edges +1,000, aerial +500, dot -500, four +300. Good: dot +1,500, four -1,000, and +1,000 edges for each attacking level. Short: pad -2,000, six +1,500, bowled -5,000, lbw -6,000, and +1,000 aerial for each attacking level. | Yorkers save boundaries and hit the stumps, but a missed yorker is a full toss (the existing execution model). A good length punishes the slog with edges. |
| Effort | Maximum effort: misses and edges +1,000, fours and sixes +1,000, accuracy -1,500 on the intended length's weight. Conserve effort is the reverse. | Pace beats the bat more often but goes further off it. The existing wide and no-ball and fatigue costs stay. |
| Slip cordon | An edge is covered by the keeper's area (6,000) plus 2,000 for each slip, at most 10,000. That cover sets both the catch chance and the ring cover on the edge's run value. | Slips take catches; with no slips an edge runs away. |

Before C5 every edge had the keeper's 10,000 cover, so slips could not matter.

### 2c. Skill V5 (`packages/data/src/calibrated-t20-pack.ts`)

| Term (bp, on `(rating - world mean) x 200`) | V4 | V5 |
| --- | ---: | ---: |
| Contact, miss: control | +16,000 | +21,000 |
| Runs 0: control | +13,000 | +24,000 |
| Runs 0: rotation | -2,500 | -13,000 |
| Runs 4 and 6: timing, power | -1,800 each | +1,200 each |
| Runs 4 and 6: control, movement | -7,000 each | -13,000 each |
| Variation terms | unchanged | unchanged |

## 3. Results, before and after

**Conditions.**
- Before: `main` (`4558fdb`).
- After: `b5fca25`.
- 2,000 matches each, first innings.
- Brackets are 95% match-bootstrap intervals (`c5-summary.json`).
- Real values: fit period / selection period.

### 3a. First-innings aggregates

| | Real fit / selection | Before | After |
| --- | --- | --- | --- |
| Runs | 158.9 / 166.0 | 161.7 (160.4 to 162.9) | 158.5 (156.8 to 160.1) |
| Wickets | 6.40 / 6.87 | 6.57 (6.48 to 6.67) | 6.67 (6.58 to 6.78) |
| Dot % (wicket balls included) | 35.3 / 37.2 | 34.8 (34.6 to 35.1) | 36.2 (35.8 to 36.6) |
| Boundary % | 15.7 / 17.9 | 16.9 (16.7 to 17.0) | 16.3 (16.1 to 16.6) |
| P10 / P50 / P90 runs | 118 / 160 / 202 (full innings 121 / 163 / 203); 110 / 172 / 219 | 125 / 162 / 198 | 108 / 159 / 208 |
| SD of totals | 36.0 (full innings 32.9) / 45.5 | 28.7 | 37.7 |
| Stumped, % of wickets | 2.7 / 2.2 | 0.2 (0.1 to 0.3) | 1.9 (1.7 to 2.2) |

### 3b. Phase rates (overs 1 to 6, 7 to 15, 16 to 20)

| | Real fit | Before | After |
| --- | --- | --- | --- |
| Runs an over: powerplay | 7.68 | 7.86 (7.77 to 7.93) | 7.82 (7.70 to 7.93) |
| Runs an over: middle | 7.66 | 8.33 (8.27 to 8.40) | 7.89 (7.81 to 7.98) |
| Runs an over: death | 9.75 | 8.50 (8.41 to 8.60) | 8.47 (8.34 to 8.60) |
| Wicket % a ball: powerplay | 4.24 | 5.15 (5.01 to 5.31) | 5.09 (4.94 to 5.23) |
| Wicket % a ball: middle | 4.49 | 4.82 (4.69 to 4.96) | 4.47 (4.35 to 4.58) |
| Wicket % a ball: death | 8.87 | 7.53 (7.31 to 7.73) | 8.38 (8.15 to 8.60) |
| Dot %, wicket balls excluded: powerplay | 42.4 | 37.9 (37.5 to 38.2) | 38.0 (37.6 to 38.5) |
| Dot %: middle | 27.5 | 23.8 (23.5 to 24.1) | 28.1 (27.7 to 28.5) |
| Dot %: death | 18.8 | 29.1 (28.7 to 29.4) | 26.3 (25.7 to 26.8) |
| Four %: powerplay | 14.5 | 14.6 (14.3 to 14.9) | 14.6 (14.3 to 14.9) |
| Four %: middle | 8.2 | 12.2 (12.0 to 12.4) | 11.2 (11.0 to 11.5) |
| Four %: death | 11.1 | 10.2 (9.9 to 10.4) | 8.7 (8.4 to 8.9) |

**The C4 description no longer holds under captain V4.**
- C4 (captain V3) found the death overs too free: 10.24 an over.
- Under captain V4, `main` has the death overs too tight (8.50, 29.1% dots), and the middle overs too free (8.33, 12.2% fours).
- [Inference] Captain V4 saves the best bowlers for the death, and the C4 phase intercepts were fitted under captain V3.
- After C5, the middle overs and death wickets are close to real. The death run rate is not (section 6).

### 3c. Dismissal kinds (% of first-innings wickets)

| | Real fit | Real selection | Before | After |
| --- | ---: | ---: | ---: | ---: |
| Caught (game) or caught plus caught and bowled (real) | 63.9 | 69.8 | 67.4 | 67.5 |
| Bowled | 18.3 | 16.0 | 19.5 | 15.5 |
| Lbw | 6.7 | 5.8 | 4.4 | 6.8 |
| Run out | 8.3 | 6.0 | 7.6 | 8.1 |
| Stumped | 2.7 | 2.2 | 0.2 | 1.9 |
| Hit wicket | 0.19 | 0.18 | 0.9 | 0.1 |

**Dismissal kinds by phase, per 100 legal balls** (real fit; after):
- Death:
  - caught 5.6 (incl. caught and bowled); 6.5;
  - bowled 1.74; 0.76;
  - run out 1.07; 0.87;
  - lbw 0.35; 0.11.
- Powerplay:
  - bowled 0.86; 1.07;
  - caught 2.77; 3.17.
- The game has no caught-and-bowled branch: a catch is never the bowler's.

### 3d. Criterion 1, adjusted for phase and opponent (top-rated / bottom-rated quarter)

The real range is the full-member calibration split, as in C3 (`c2-report.py`).

| Effect | Real range | Before | After |
| --- | --- | --- | --- |
| Batter runs | 1.39 to 1.45 | 1.23 FAIL | **1.42 PASS** |
| Batter boundary | 1.68 to 1.82 | 1.39 FAIL | **1.78 PASS** |
| Batter non-dot | 1.23 to 1.27 | 1.14 FAIL | 1.28 FAIL (just too steep) |
| Batter dismissal | 0.67 to 1.00 | 0.88 PASS | 0.84 PASS |
| Bowler runs | 0.77 to 0.80 | 0.87 FAIL | **0.78 PASS** |
| Bowler boundary | 0.61 to 0.68 | 0.81 FAIL | **0.65 PASS** |
| Bowler non-dot | 0.84 to 0.86 | 0.91 FAIL | **0.86 PASS** |
| Bowler dismissal | 1.00 to 1.36 | 1.13 PASS | 1.13 PASS |
| **Total** | | **2 of 8** | **7 of 8** |

Against the fit period alone (`c5-real-adjusted.json`, the fitting target), the final model passes 6 of 8. Batter runs (1.42 against an upper bound of 1.41) and batter non-dot (1.28 against 1.26) are both just too steep. On the last 800-match skill iteration (s12) it passed 8 of 8. The pitch halving that came after that iteration steepened batting slightly.

### 3e. Criterion 1, raw (top / bottom quarter by the game's rating)

| Statistic | Real true skill P10 to P90; bracket | Before | After |
| --- | --- | --- | --- |
| Strike rate | 1.37 to 1.44; 1.20 to 1.39 | 1.21 UNCLEAR | **1.44 PASS** |
| Average | none; 1.57 to 2.45 | 1.73 UNCLEAR | 2.29 UNCLEAR |
| Dismissal rate | 0.57 to 0.72; 0.46 to 0.65 | 0.70 PASS | 0.63 PASS |
| Batting dot % | 0.69 to 0.71; 0.70 to 0.79 | 0.86 FAIL | 0.74 UNCLEAR |
| Batting boundary % | 1.78 to 1.95; 1.43 to 1.80 | 1.53 UNCLEAR | 2.09 FAIL (too steep) |
| Economy | 0.73 to 0.77; 0.74 to 0.86 | 0.83 UNCLEAR | **0.76 PASS** |
| Wicket rate | 1.00 to 1.40; 1.20 to 1.91 | 1.39 PASS | 1.44 UNCLEAR |
| Bowling dot % | 1.43 to 1.49; 1.27 to 1.45 | 1.62 FAIL | 1.65 FAIL (too steep) |
| Boundary % conceded | 0.55 to 0.60; 0.56 to 0.69 | 0.85 FAIL | 0.69 UNCLEAR |
| **Total** | | 2 PASS, 4 UNCLEAR, 3 FAIL | 3 PASS, 4 UNCLEAR, 2 FAIL |

### 3f. Specialisation (game / real within 0.85 to 1.15)

| Ratio | Real | Before | After |
| --- | ---: | --- | --- |
| Average, positions 1 to 7 / 8 to 11 | 2.25 | 1.51 (0.67) FAIL | 1.87 (0.83) FAIL |
| Strike rate, positions 1 to 7 / 8 to 11 | 1.18 | 1.18 (1.00) PASS | 1.38 (1.17) FAIL |
| Economy, part-time / frontline | 1.08 | 1.16 (1.07) PASS | 1.23 (1.14) PASS |

### 3g. Per-point effects: a sign and range check

Rule (owner, after the C3 re-measure): the per-point effects are no longer a fitting target. PASS means the effect has the correct sign and is at most twice the upper end of the C3 range (`c3-per-point-gate.py --sign-range`). The C3 range itself is still reported.

| Effect (oriented) | C3 range | Before | After | Inside the C3 range (after) |
| --- | --- | ---: | ---: | --- |
| Batter runs | 0.0078 to 0.0092 | 0.0087 | 0.0156 | no (1.7 times the upper end) |
| Batter boundary | 0.0127 to 0.0155 | 0.0130 | 0.0237 | no (1.5 times) |
| Batter non-dot | 0.0052 to 0.0062 | 0.0053 | 0.0094 | no (1.5 times) |
| Batter dismissal (fewer) | 0 to 0.0126 | 0.0057 | 0.0034 | yes |
| Bowler runs (fewer) | 0.0120 to 0.0146 | 0.0144 | 0.0260 | no (1.8 times) |
| Bowler boundary (fewer) | 0.0212 to 0.0270 | 0.0232 | 0.0422 | no (1.6 times) |
| Bowler non-dot (fewer) | 0.0080 to 0.0097 | 0.0084 | 0.0146 | no (1.5 times) |
| Bowler dismissal (more) | 0 to 0.0206 | 0.0087 | 0.0053 | yes |
| Variation: wickets / runs | both positive | +0.0064 / +0.0036 | +0.0057 / +0.0031 | |

- After: 9 of 9 PASS under the sign and range rule; 2 of 8 effects lie inside the C3 range.
- [Inference] Matching the adjusted quarter ratios needs per-point effects about 1.5 to 1.8 times the C3 range. This is the gap the C3 re-measure found: the C3 mapping's per-point targets understate what the quarter test needs under captain V4.
- The 2-times bound was chosen for this pass. It is not derived from data.

## 4. Iterations (hand tuning, logged)

All choices used the fit period. The selection period chose between candidates or checked a choice. The holdout was not read.

### 4a. Delivery V2, step 1 (400 matches each, skill V4, no tactics)

Fit and selection distance: sum of absolute gaps in dot %, boundary % and the three phase run rates. Main scores 3.69 and 5.26. "Wicket gap" is the sum of absolute gaps in the three phase wicket rates. "W/run" is the extra wickets per extra run from forced aggression 2 to 4.

| It. | Change | Runs | Wkts | Dot % | Bdy % | P10 / P90 | Phase rpo | Fit | Sel. | Wkt gap | W/run |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | five mechanisms added; ring dot up, deep saves more fours | 155.8 | 7.18 | 35.6 | 15.5 | 119 / 195 | 7.81 / 7.85 / 8.23 | 2.39 | 6.54 | 1.80 | 0.19 |
| 2 | stronger attacking terms, run outs by aggression, pitch, stumping | 158.0 | 6.67 | 35.4 | 15.5 | 118 / 200 | 7.86 / 7.63 / 8.85 | 1.44 | 6.30 | 1.58 | 0.10 |
| 3 | ring dot +16,000, fewer twos, run out up, catch-by-aggression 0 | 151.6 | 6.47 | 37.8 | 15.0 | 113 / 191 | 7.44 / 7.22 / 8.71 | 4.96 | 6.60 | 1.53 | 0.08 |
| 4 | spread-field feature made field-level; ring dot +14,000 | 156.9 | 6.52 | 35.3 | 15.6 | 117 / 198 | 7.79 / 7.45 / 8.93 | 1.33 | 6.49 | 1.59 | 0.09 |
| 5 | attacking four +3,500; fewer powerplay misses; ring single -6,000 | 161.9 | 6.40 | 35.7 | 16.9 | 120 / 205 | 8.21 / 7.56 / 9.24 | 2.72 | 3.89 | 1.40 | 0.07 |
| 6 | attacking four back to +2,500 | 160.0 | 6.42 | 35.8 | 16.4 | 121 / 202 | 8.08 / 7.52 / 9.11 | 2.38 | 4.56 | 1.33 | 0.08 |
| 7 | iteration 4 values, stumping 70 / 1,000 | 157.1 | 6.49 | 35.2 | 15.6 | 117 / 199 | 7.80 / 7.45 / 8.95 | 1.37 | 6.51 | 1.56 | 0.09 |

Iteration 6 was chosen by the rule in section 1 and committed (`2ba516b`).

### 4b. Tactics, step 2 (400 matches each)

| It. | Change | Runs | Wkts | Dot % | Phase rpo | Fit | Sel. | Wkt gap | W/run |
| ---: | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| t1 | tactics component as first designed | 156.5 | 6.20 | 36.8 | 7.69 / 7.73 / 8.47 | 3.15 | 4.79 | 2.18 | 0.08 |
| t2 | attacking costs more (aerial catch +300 a level; misses and edges -1,000 a level); death misses -17,000; yorker run penalty eased | 155.9 | 6.65 | 37.1 | 7.59 / 7.71 / 8.50 | 3.59 | 4.46 | 1.03 | 0.13 |
| t3 | death misses -19,000; yorker misses +500; full-length four +800 | 155.7 | 6.62 | 37.0 | 7.56 / 7.61 / 8.70 | 3.11 | 4.69 | 1.14 | 0.12 |

- t1 was rejected because full attack beat the captain: 34.0% good-side wins (27.7 to 40.9) against aggression 4 on every ball.
- t3 brought that to 41.9% (35.3 to 48.9), and was committed (`199ef51`).

### 4c. Skill V5, step 3 (800 matches each; adjusted ratios against the whole calibration split, as in C3)

| It. | Change | Adjusted passes | First-innings runs | Phase rpo |
| ---: | --- | ---: | ---: | --- |
| s0 | V4 (start) | 2 / 8 | 156.4 | 7.55 / 7.72 / 8.65 |
| s1 | miss control +20,000; dot control +19,000, rotation -6,000; boundary timing and power +1,500; boundary control and movement -13,000 | 5 / 8 | 152.4 | 7.30 / 7.90 / 7.77 |
| s2 | rotation -9,000; dot control +20,000; timing and power +1,000 | 7 / 8 | 152.3 | 7.34 / 7.91 / 7.70 |
| s3 | timing and power +300 | 8 / 8 | 151.9 | 7.28 / 7.89 / 7.71 |
| s4 | rotation -10,500; death aerial +1,500, edge -6,000, misses -21,000; powerplay misses -3,500 | 5 / 8 | 157.1 | 7.44 / 7.91 / 8.58 |
| s5 | death aerial 0; attacking four +3,500, dot -3,500; spread-field dot -7,000, single +2,500; yorker four -1,000; full four +300 | 4 / 8 | 159.7 | 7.71 / 7.95 / 8.74 |
| s6 | dot control +22,000, rotation -12,000, timing and power +2,500; deep four -35,000; attacking four +4,500 | 6 / 8 | 159.0 | 7.91 / 7.86 / 8.55 |
| s7 | timing and power +1,200; deep four -30,000; attacking four +3,500 | 6 / 8 | 159.6 | 7.79 / 7.98 / 8.59 |
| s8 | miss control +21,000; dot control +24,000; timing and power +1,700 | 8 / 8 (fit 8 / 8; selection 7 / 8) | 159.6 | 7.75 / 8.02 / 8.54 |

- s3 already passed 8 of 8, but with first innings at 152 and the death overs at 7.7 an over.
- From s4 the phase intercepts were re-set together with the skill terms.
- s8 was committed (`84734bf`).

### 4d. Directive 02 A3 and the spread of totals

| It. | Change | Result |
| ---: | --- | --- |
| r1 | hit-wicket intercept -16,000 in every phase; bowled -26,000; lbw -21,000; aerial catch chance 1,800 | kinds: bowled 16.6, lbw 7.1, hit wicket 0.1, run out 7.9 (% of wickets); powerplay wickets 5.22 a ball |
| r2 | powerplay misses -5,000 | powerplay wickets 5.03; first innings 159.4 |
| s9 | (skill check at r2) | 7 / 8: batter boundary 1.88, too steep |
| s10 | timing and power +700 | 7 / 8 (fit 8 / 8): batter runs 1.375, too flat |
| s11 | timing and power +1,200 | 7 / 8 (fit 8 / 8): batter runs 1.385 |
| s12 | rotation -13,000 | 8 / 8, fit 8 / 8 (selection 6 / 8). Committed `fbf9e84` |

- The first full after-run on `fbf9e84` was stopped after 1,000 first innings. The spread of totals was too wide: SD 39.6 runs, with a between-ground SD of 18.5 (main: 4.9).
- The pitch coefficients were halved (`b5fca25`). The final run gives SD 37.7 and a between-ground SD of 12.3.
- An earlier full after-run, on `84734bf`, was stopped when Directive 02 arrived. Neither stopped run is reported as a result.

## 5. Rare dismissals (Directive 02, A3)

- Sources: `c5-real-yardsticks.json` (fit and selection periods) and section 3c.
- After C5, bowled, lbw, run out, stumped and hit wicket are each within 3 points of the fit period's share of wickets. Hit wicket was 5 times too common on `main`.
- The game has no caught-and-bowled branch. Its caught share (67.5%) matches real caught plus caught and bowled (63.9% fit, 69.8% selection).
- By phase, death bowled (0.76 against 1.74 per 100 balls) and death lbw (0.11 against 0.35) are still low, and death caught is high (6.5 against 5.6).

## 6. What still fails, and why

1. **Death overs are too tight.**
   - 8.47 an over against 9.75 real; dots 26.3% against 18.8%; fours 8.7% against 11.1%.
   - The death wicket rate improved: 8.38% against 8.87% (main: 7.53%).
   - [Inference] Captain V4 bowls the best bowlers at the death. Skill V5 makes their control steeper (needed for the adjusted ratios). The captain also bowls about 74% executed yorkers at the death.
   - The death intercepts are already far out (misses -21,000). The remaining dots come largely from balls at aggression 2 at the death (about a quarter of death balls), where ground-shot dots run at about 37%.
   - Fixing this needs either a death-overs batting choice in the captain (which is shared with the live game, so it is out of scope here), or a phase term on run values. C4 avoided phase terms on run values.
2. **Powerplay wickets are slightly high:** 5.09% against 4.24% (fit) and 4.77% (selection). The excess is mainly caught behind with two slips.
3. **The spread of totals is now slightly too wide:** P10 to P90 108 to 208, against 118 to 202 (fit, all innings) and 121 to 203 (full innings). SD 37.7 against 36.0 and 32.9.
   - Main was too narrow (125 to 198, SD 28.7).
   - About a third of the extra spread is the pitch term (between-ground SD 12.3). The rest is a wider within-match spread under skill V5 and the attacking terms.
   - Next step: cut the pitch term further, or drop it.
4. **The aggression response is now non-linear.**

   | Forced aggression | Before: runs / wickets / dot % | After: runs / wickets / dot % |
   | ---: | --- | --- |
   | 0 | 143.9 / 3.46 / 34.0 | 98.6 / 2.37 / 49.8 |
   | 1 | 150.1 / 4.35 / 34.5 | 118.2 / 3.35 / 45.3 |
   | 2 | 156.2 / 5.39 / 35.5 | 140.1 / 4.62 / 42.5 |
   | 3 | 163.8 / 6.64 / 36.4 | 163.5 / 6.78 / 35.8 |
   | 4 | 172.3 / 7.58 / 36.9 | 165.0 / 8.68 / 34.5 |

   - Dots now fall as aggression rises, as the owner asked (main: they rose).
   - Extra wickets per extra run, step by step: before 0.14 / 0.16 / 0.13 / 0.09; after 0.05 / 0.06 / 0.08 / 0.19.
   - Going from 3 to 4 now buys 1.5 runs for 1.9 wickets. [Inference] The spread-field term saturates at aggression 3 to 4, while catches and run outs keep rising. A blocking innings (aggression 0) is very costly. Real cricket offers no ball-level yardstick for this.
5. **Batter non-dot ratio is just too steep** (1.28 against 1.23 to 1.27). Against the fit period, batter runs is also just too steep (section 3d).
6. **Raw criterion 1:** batting boundary % (2.09) and bowling dot % (1.65) are now too steep.
7. **Specialisation:** the strike-rate ratio by position is now too steep (1.38 against 1.18). The average ratio is still too flat (1.87 against 2.25).
8. **Contact shares and the tactics values have no real yardstick** (section 1).

## 7. Tactical validation (`--model=calibrated-t20-01`; good side's share of decided matches, 95% Wilson interval; paired run difference per innings, 95% interval)

### 7a. Head to head, 200 matches for each experiment

| Experiment (poor side) | Before (main) | After |
| --- | --- | --- |
| Weakest eleven | 77.6% (71.2 to 82.9); +10.2 (6.5 to 13.9) | 85.8% (80.2 to 90.0); +21.2 (15.8 to 26.6) |
| Old selection rule | 77.9% (71.6 to 83.1); +11.8 (7.9 to 15.6) | 86.9% (81.5 to 90.9); +20.5 (15.9 to 25.1) |
| Batting order reversed | 76.6% (70.3 to 82.0); +9.7 (6.1 to 13.4) | 81.0% (74.9 to 85.9); +16.1 (11.7 to 20.5) |
| Aggression 4 every ball | 42.4% (35.7 to 49.4); -1.9 (-6.0 to 2.1) | 42.6% (35.9 to 49.6); -2.1 (-7.5 to 3.2) |
| Aggression 0 every ball | 69.0% (62.3 to 75.1); +9.7 (6.1 to 13.3) | 88.9% (83.8 to 92.5); +30.9 (25.0 to 36.8) |
| Weakest bowler first | 62.9% (55.9 to 69.4); +5.6 (1.8 to 9.3) | 67.7% (60.8 to 73.9); +9.6 (4.8 to 14.5) |
| Full length, maximum effort | 51.8% (44.8 to 58.7); +0.5 (-3.1 to 4.2) | 55.7% (48.6 to 62.5); +0.8 (-4.0 to 5.7) |
| Good length throughout (C5) | 51.3% (44.3 to 58.2); +0.6 (-3.3 to 4.5) | 47.4% (40.6 to 54.4); +1.0 (-3.6 to 5.6) |
| Maximum effort throughout (C5) | 51.8% (44.8 to 58.7); -0.1 (-3.7 to 3.6) | 51.0% (44.1 to 57.9); -0.6 (-5.4 to 4.1) |
| Conserve effort throughout (C5) | 49.5% (42.5 to 56.5); -0.7 (-4.4 to 2.9) | 47.2% (40.4 to 54.2); -1.9 (-6.3 to 2.5) |
| Two-slip field all innings | 67.3% (60.5 to 73.5); +8.3 (4.3 to 12.3) | 59.9% (52.9 to 66.5); +8.6 (3.0 to 14.2) |

**Reading.**
- Selection, batting order, bowler choice and batting intent now decide matches clearly.
- Field placement has a measurable effect in both models. [Inference] The C3 re-measure's "no effect" for the field predates C4's ring and deep cover.
- Full attack is still not worse than the captain's choices with any confidence.
- No bowling-plan change has a measurable effect on results. That fits their design as trade-offs, but it means the bowling plan is not yet a meaningful decision for the player.

### 7b. Bowling-plan levers, per innings (forced for both sides, 200 matches each; differences of two runs on the same seeds)

| Lever | Before: runs; wickets | After: runs; wickets; death runs an over |
| --- | --- | --- |
| Yorker minus good length | -2.1 (-7.9 to 2.2); -0.02 (-0.39 to 0.43) | **-6.6 (-14.4 to -0.3)**; +0.18 (-0.20 to 0.62); **-0.57 (-1.27 to -0.05)** |
| Full minus good length | -0.0 (-6.1 to 4.4); -0.03 | +1.1 (-7.4 to 7.5); +0.17 (-0.19 to 0.58); +0.16 |
| Maximum minus conserve effort | +0.5 (-5.5 to 5.3); +0.03 | +3.4 (-4.5 to 9.6); +0.05 (-0.35 to 0.47); +0.26 |
| Maximum minus normal effort | +0.4 (-5.3 to 5.2); 0.00 | +2.2 (-5.5 to 8.6); 0.00 |

- The intervals bootstrap each run separately. They ignore the shared seeds, so they are wide.
- Only the yorker lever is clearly non-zero.

### 7c. Field

The two-slip field held all innings costs about 8.6 runs an innings (3.0 to 14.2) after C5. The slip-cordon mechanism now also makes edges with no slips run away.

### 7d. Matchups (Directive 02, A4)

**No real yardstick.** Cricsheet records neither a bowler's style nor a batter's hand.

**Game effect** (`c5-matchups-after.json`, 2,000 matches, 88 batters with at least 60 balls against both pace and spin):
- Batters in the top quarter of (vsSpin - vsPace), mean +14 points, against the bottom quarter (mean -16 points):
  - relative runs a ball, spin against pace: +4.6% (-0.1 to +8.7%);
  - relative dismissals: -12.3% (-22.3 to -2.5%).
- Before (`main`): +4.3% (0.5 to 7.7%) and -12.1% (-21.6 to -2.3%).
- Handedness: left minus right +1.9% (-1.1 to +5.1%). The generator has no hand term, so this is a null check.
- [Inference] The matchup effect is small. A 30-point matchup gap changes scoring rate by about 5%. Whether that is realistic cannot be checked from Cricsheet alone.

### 7e. Fatigue

Not measured. In T20 a bowler gains 20 bp of fatigue a ball (pace), so four overs add about 480 bp out of 10,000. [Inference] Fatigue therefore has almost no effect in this format.

## 8. Commands, files and hashes

**Hashes (after).**
- Delivery V2: `2ea31526811177f0a973e4b4612b457d1ba374f8c64b1af34b94585659b388ad`.
- Skill V5: `07949faa30bab7713ae2aa6d3e00e6b443c4812fc3bbfb5e3e4e26d4fb680bfa`.
- Tactics V1: `006d7af87aa76d8c64bec76217c510df68447951ab60f9bf8e217e707d63f0e1`.
- Model: `64e09b4b00d2b3b9565a7e18b86e219933487713cbbd2a2b62e24885e6592802`, the SHA-256 of `{ deliveryPackSha256, skillPackSha256, tacticsPackSha256 }`.
- `node --import tsx scripts/stage-c/c5-pin-packs.ts --write` pins the chain.

**Commands.** "Before" ran in a worktree detached at `4558fdb`; "after" ran on this branch at `b5fca25`. Every job exited 0 (exit codes are logged beside the raw files).

```bash
# per side (k = 0..3; a = 0..4)
node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/g-$k.json 5 $((k*5))
node --import tsx scripts/stage-c/c1-game-balls.ts <dir>/cal-balls-$k.json 5 $((k*5)) --model=calibrated-t20-01
node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/f-$a.json 2 0 --aggression=$a
node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/lev/<lever>.json 2 0 --effort=<E> | --length=<L>   # before: the same script copied in
node --import tsx scripts/pavilion-tactical-validation.ts <dir>/tv/calibrated-t20-01-<experiment>.json <experiment> --model=calibrated-t20-01
bash scripts/stage-c/c2-dose.sh <dir>/dose calibrated-t20-01
python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json --game <dir>/cal-balls-{0,1,2,3}.json --out <dir>/cal-analysis.json
# outputs in docs/pavilion/stage-c/
python3 -I scripts/stage-c/c2-report.py --synthetic <c3rm synthetic analysis> --calibrated <dir>/cal-analysis.json --dose-synthetic <c3rm synthetic dose> \
  --dose-calibrated <dir>/dose/per-point.json --fit docs/pavilion/stage-c/c2-fit.json --targets docs/pavilion/stage-c/c3-mapping.json \
  --tactical <dir>/tvall --balls-synthetic <c3rm synthetic balls> --balls-calibrated <dir>/cal-balls-{0,1,2,3}.json --out c5-report-{before,after}.json
python3 -I scripts/stage-c/c3-per-point-gate.py --dose <dir>/dose/per-point.json --mapping docs/pavilion/stage-c/c3-mapping.json --sign-range ... --out c5-per-point-{before,after}.json
python3 -I scripts/stage-c/c4-analyse.py --game <dir>/g-{0,1,2,3}.json --forced <dir>/f-{0..4}.json --real ... --out c5-delivery-{before,after}.json
python3 -I scripts/stage-c/c5-summary.py --before ... --after ... --levers-before ... --levers-after ... --forced-before ... --forced-after ... --out c5-summary.json
python3 -I scripts/stage-c/c5-real-yardsticks.py --real ... --out c5-real-yardsticks.json
python3 -I scripts/stage-c/c5-real-adjusted.py --real ... --out c5-real-adjusted.json
python3 -I scripts/stage-c/c5-matchups.py --game <dir>/cal-balls-{0,1,2,3}.json --world packages/data/worlds/fictional-eight-01.json --out c5-matchups-{before,after}.json
```

**Synthetic reference.** `synthetic-alpha-01` is unchanged, so the synthetic column of the gate reports reuses the C3 re-measure's captain V4 files: its analysis, dose and balls, and `docs/pavilion/captain-v4/tactical-validation-v4.json`.

Raw ball files stay outside the repository, in `/home/user/lcx-data/c5/`.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.

## 9. Proof that synthetic-alpha-01 is unchanged

- Only these game-code files changed against `4558fdb`:
  - the calibrated packs;
  - `packages/data/src/index.ts`, which exports the tactics pack;
  - `generator.ts`, `model-registry.ts`.
- No change to `probability-pack.ts`, `delivery-pack.ts`, the world packs, fixtures, golden vectors, schemas, contracts, persistence, the engines or the captain (`git diff --stat 4558fdb..HEAD`).
- In `generator.ts` every new branch is behind `deliveryPackOf(req)` or `tacticsPackOf(req)`. Both are null for `synthetic-alpha-01`.
- The calibrated model is still reachable only through `validateT20ResearchMatchSetup`, and the registry marks it `gameplay: false`.
- The branch merges cleanly with the current `main` (`ed3a20b`).

**Verification.** Commit `b5fca25` with the scripts and documents of the final commit (no game code changes in that commit). Linux container, Node 22, `NODE_OPTIONS=--max-old-space-size=4096`.

| Command | Result |
| --- | --- |
| `npx tsc -b` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run typecheck` | PASS (exit 0) |
| `npm run schemas:check` | PASS (exit 0) |
| `npm run vectors:check` | PASS (exit 0) |
| `npm run probability:check` | PASS (exit 0) |
| `npm run generator:check` | PASS (exit 0) |
| `npm run fixtures:engine` | PASS (exit 0) |
| `node scripts/check-pass07b-inventory.mjs` | PASS (exit 0) |
| `npx vite build --config apps/web/vite.config.ts` | PASS (exit 0) |
| `npx vitest run --maxWorkers=2` | PASS (exit 0; 125 files, 1,064 tests) |
| Stage C gate scripts: `c2-report.py`, `c3-per-point-gate.py` | ran (exit 0). Verdicts are in section 3 |
| `scripts/run-v01-batch7-gates.mjs` | NOT RUN: a synthetic V0.1 gate that writes evidence files. Synthetic is unchanged |
| Browser suites, `npm run verify:07b` | NOT RUN (browsers; `verify:07b` rewrites tracked evidence) |
| Holdout evaluation | NOT RUN, by design: a separate later step on the owner's instruction |

## 10. Proposed next step

1. Owner review, especially of:
   - the tactics values (design choices);
   - the sign and range rule (2 times the C3 upper end);
   - the delivery selection threshold, set after seeing iterations;
   - the decision to keep the pitch term at half strength.
2. **The death overs.** Measure death batting under captain V4 (a quarter of death balls are played at aggression 2). Then either:
   - propose a captain change (it would also change the live game, so it needs the owner's decision); or
   - allow a death-overs phase term on run values in the calibrated model.
3. **Aggression.** Make the 3-to-4 step worth taking (the spread-field term saturates), and check that blocking is not over-punished.
4. **Bowling plans.** If the owner wants them to decide matches, raise the length and effort sizes within stated bounds, or add a matchup between length and the batter's style. A real yardstick needs ball-tracking data, which Cricsheet lacks.
5. **Spread of totals.** Cut or drop the pitch term.
6. Then, on the owner's instruction only, the single holdout evaluation.

**Directive 02 split.** The pass was not split. All three Directive 02 points are in this one pull request, because the steps had to be fitted together (section 1). If the owner prefers two pull requests, the commits divide cleanly into two groups:
- `2ba516b` and `fbf9e84`: delivery and rare dismissals;
- `199ef51`, `84734bf` and `b5fca25`: tactics, refit and pitch.

A divided history would show intermediate states that were never measured as a whole.
