# Stage C research slice C1: player skill differentiation

**Status: research only.** Nothing here changes the game. `synthetic-alpha-01`, its rules fingerprint, the random stream, every persisted schema and all game behaviour are unchanged, and nothing is wired into the game. No criterion is marked passed: the owner accepts tolerances and measurements (`DIRECTION_2026-11-25_CORRECTION.md`, decision 12). The holdout was not read.

Measured on `main` at `4e29882` (model `synthetic-alpha-01`, captain `LC_T20_TACTICAL_CAPTAIN_V3`), branch `pavilion/stage-c-research`, 25 November 2026.

## Headline

1. **Criterion 1 (skill differentiation) fails on current main** for strike rate, dot %, boundary % and all four bowling statistics against all men's T20 internationals. Two bowling ratios are **inverted** by rating (top-rated bowlers take fewer wickets per ball and bowl fewer dots than bottom-rated ones). Dismissal rate and average are unclear: inside the real bracket, outside the bootstrap interval or without one.
2. **The bowling inversion is the captain's deployment, not the model.** The lowest-rated quarter of bowlers bowls 100% of its balls in overs 16 to 20, against weaker batters. The model's own bowling effect has the right sign but is tiny. Raising every bowler's skills from 30 to 70 lowers runs per ball by only 6% and raises dismissals per ball by 5.5%.
3. **The model's per-point skill effect is too small.**
   - Bowling: about 0.0015 log units per rating point, against 0.012 to 0.027 implied by real data (8 to 18 times too small).
   - Batting runs: 0.013 a point against 0.017 to 0.033 (1.3 to 2.6 times too small).
   - Batting dismissals: 0.005 a point against 0.019 to 0.039 (4 to 8 times too small).
4. **The reference cohort matters as much as the model.** All men's T20 internationals include large mismatches between full members and associates. Matches between full members only show about half the spread. Against that cohort, the game's batting spread is close to real, but its bowling spread is not. The owner should choose the reference (question 1 below).
5. **Specialisation criterion:**
   - Strike rate (positions 1 to 7 against 8 to 11) passes.
   - Part-time against frontline economy passes.
   - Average (positions 1 to 7 against 8 to 11) fails: the game's ratio is 18% below real.

## 1. Data and splits

| Item | Value |
| --- | --- |
| Source | Cricsheet `t20s_json.zip`, https://cricsheet.org/downloads/t20s_json.zip, ODC-By 1.0 (https://cricsheet.org/licensing/) |
| Acquisition | `scripts/m7d-acquire.py`, 25 November 2026 12:57 UTC; raw files in `/home/user/lcx-data/` (outside the repository, not committed) |
| Archive SHA-256 | `956f29df9d2b95dd6fe12de5bc70d4522f23693e5e7e2ac4c1a004e1b541ad8e` (23,330,741 bytes, 5,849 matches) |
| Licence notice SHA-256 | `11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b` |
| Cohort | `gender == male`, `team_type == international`, `match_type == T20`, `overs == 20`: men's T20 internationals as Cricsheet classifies them, including associate members. 11 matches recorded as 50 overs are excluded. Cricsheet withholds Afghanistan men's matches. |
| Calibration | date on or before 2025-08-24 (the last M7G training date): **2,893 matches**, 2005-02-17 to 2025-08-24, 654,130 deliveries |
| Holdout | 2025-08-30 to 2026-10-14 (the M7G and M7E holdout): **724 matches**. Ids recorded only; not read. |
| Unused | 2025-08-25 to 2025-08-29: none. After 2026-10-14: 21 matches. |
| Sensitivity cohorts | full members only (both teams among the 12 full members): 1,001 matches. From 2021: 2,005 matches. |

Match ids per split: `c1-splits.json`. Every innings except super overs is used, since the statistics are per-ball rates.

[Inference] The M7E holdout (652 first innings) came from an earlier archive and a stricter innings filter, so its counts differ from the 724 matches here. The dates are the same.

**Game side:**
- the frozen 100-seed corpus, with each side the suggested eleven and both captains `tacticalT20Step`;
- 20 repeats, 2,000 matches and 453,750 deliveries. Repeat 0 uses the frozen seeds; repeat r adds `-c1r<r>` to each seed, in memory only.

Players with at least 100 balls: 1,390 batters and 1,422 bowlers (real); 88 batters and 48 bowlers (game).

## 2. Criterion 1: top-quarter / bottom-quarter ratios

"Top" is the better quarter, so a ratio below 1 is correct for dismissal rate, dot % (batting), economy and boundary % conceded.
- **Game, by rating:** quarters of the game's batting score (timing + power + defence + rotation) or bowling score (control + movement + variation), as `packages/data/src/eleven.ts` defines them.
- **Real, true skill:** quarters estimated by method of moments, with a match bootstrap middle 80% (400 replicates).
- **Real, bracket:** split-half (rank on one half of the matches, measure on the other) to in-sample (rank and measure on the same balls). The true value should lie between them.

**Verdict rule:**
- PASS if the game value is inside the real middle 80% and the order is right.
- FAIL if it is outside both the middle 80% and the bracket, or the order is inverted.
- UNCLEAR otherwise.

| Statistic | Game, by rating (P10 to P90) | Real all: true skill (P10 to P90) | Real all: bracket | vs all | Real full members: true skill (P10 to P90) | Full members: bracket | vs full members |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Batting strike rate | 1.26 (1.24 to 1.28) | 1.68 (1.72 to 1.79) | 1.42 to 1.69 | FAIL | 1.36 (1.37 to 1.44) | 1.20 to 1.39 | UNCLEAR |
| Batting average | 2.29 (2.21 to 2.36) | none | 1.78 to 2.87 | UNCLEAR | none | 1.57 to 2.45 | UNCLEAR |
| Dismissal rate | 0.55 (0.54 to 0.57) | 0.57 (0.62 to 0.71) | 0.44 to 0.65 | UNCLEAR | 0.56 (0.57 to 0.72) | 0.46 to 0.65 | UNCLEAR |
| Batting dot % | 0.85 (0.84 to 0.85) | 0.65 (0.61 to 0.64) | 0.65 to 0.74 | FAIL | 0.72 (0.69 to 0.71) | 0.70 to 0.79 | FAIL |
| Batting boundary % | 1.32 (1.28 to 1.35) | 2.55 (2.64 to 2.84) | 1.90 to 2.62 | FAIL | 1.77 (1.78 to 1.95) | 1.43 to 1.80 | FAIL |
| Economy | 0.91 (0.89 to 0.92) | 0.68 (0.64 to 0.66) | 0.67 to 0.78 | FAIL | 0.77 (0.73 to 0.77) | 0.74 to 0.86 | FAIL |
| Wicket rate | **0.55, inverted** (0.54 to 0.56) | 1.39 (1.24 to 1.48) | 1.16 to 2.00 | FAIL | 1.24 (1.00 to 1.40) | 1.20 to 1.91 | FAIL |
| Bowling dot % | **0.93, inverted** (0.93 to 0.94) | 1.48 (1.51 to 1.55) | 1.31 to 1.50 | FAIL | 1.42 (1.43 to 1.49) | 1.27 to 1.45 | FAIL |
| Boundary % conceded | 0.81 (0.80 to 0.83) | 0.51 (0.47 to 0.50) | 0.49 to 0.65 | FAIL | 0.59 (0.55 to 0.60) | 0.56 to 0.69 | FAIL |

**Phase and opponent adjusted** (multiplicative batter and bowler effects over a phase baseline; ratio of the top-rated to the bottom-rated quarter's mean effect in the game, and (1 + 1.271 SD) / (1 - 1.271 SD) of the true-effect SD in the real data):

| Effect | Game, by rating (P10 to P90) | Real all (P10 to P90) | Real full members | Real from 2021 |
| --- | --- | --- | --- | --- |
| Batter runs per ball | 1.46 (1.43 to 1.48) | 1.96 (1.94 to 2.02) | 1.39 | 2.10 |
| Batter dismissal | 0.79 (0.77 to 0.82) | 0.45 (0.46 to 0.55) | 0.69 | 0.44 |
| Batter boundary | 1.72 (1.67 to 1.78) | 2.72 (2.68 to 2.88) | 1.68 | 3.11 |
| Bowler runs per ball | 0.83 (0.82 to 0.84) | 0.59 (0.57 to 0.60) | 0.80 | 0.59 |
| Bowler dismissal | 1.09 (1.06 to 1.11) | 1.75 (1.57 to 1.84) | 1.21 | 1.88 |
| Bowler boundary | 0.76 (0.75 to 0.77) | 0.44 (0.41 to 0.47) | 0.66 | 0.45 |

After adjustment no ratio is inverted. Against all T20 internationals every adjusted game ratio is too flat. Against full members, batting is about right, but bowling dismissals are too flat.
- [Inference] The game's adjusted bowling ratios still overstate what the model does. They include deployment within a phase: the bottom-rated quarter bowls only the last overs, when batters are on maximum aggression.
- The dose-response in section 5 is the causal measure.

**Distributions** (players with at least 100 balls, 10th / 50th / 90th percentile):

| Statistic | Real all | Real full members | Game |
| --- | --- | --- | --- |
| Strike rate | 80.1 / 115 / 143 | 103 / 125 / 146 | 73.4 / 87.9 / 98.3 |
| Dismissal rate per ball | 0.039 / 0.057 / 0.090 | 0.041 / 0.057 / 0.089 | 0.050 / 0.069 / 0.098 |
| Average | 10.8 / 19.7 / 32.6 | 13.4 / 21.6 / 33.4 | 7.9 / 13.0 / 19.4 |
| Batting dot % | 34.2 / 42.7 / 54.1 | 32.6 / 38.8 / 47.0 | 55.9 / 60.4 / 67.5 |
| Batting boundary % | 6.7 / 13.5 / 20.1 | 10.6 / 15.6 / 20.8 | 8.8 / 10.8 / 12.9 |
| Economy | 5.87 / 7.35 / 9.06 | 6.83 / 8.08 / 9.42 | 5.28 / 5.66 / 6.19 |
| Wicket rate per legal ball | 0.035 / 0.054 / 0.075 | 0.035 / 0.051 / 0.070 | 0.050 / 0.058 / 0.097 |
| Bowling dot % | 33.5 / 42.2 / 51.8 | 30.7 / 38.3 / 45.9 | 57.0 / 58.6 / 62.6 |
| Boundary % conceded | 9.0 / 13.9 / 19.8 | 11.2 / 16.6 / 21.6 | 9.9 / 11.8 / 14.6 |

**Per season** (player-seasons with at least 100 balls; a real season is a calendar year; a game season is one 100-seed repeat, about 25 matches a team). True-skill ratios:

| | Real all | Real full members | Game |
| --- | --- | --- | --- |
| Strike rate | 1.60 (1,983 units) | 1.36 (753) | 1.28 (1,355) |
| Economy | 0.66 (2,136) | 0.73 (779) | 0.86 (939) |
| Wicket rate | 1.39 | 1.36 | 2.13 (deployment, see above) |

- Real dismissal rate within a season has no measurable true spread: the between-player variance equals the sampling variance at about 150 balls.
- [Inference] The 100-ball threshold also favours batters who get out less often.

## 3. Specialisation criterion (within 15% of real)

| Ratio | Real all (P10 to P90) | Real full members | Game (P10 to P90) | Game / real all | Verdict |
| --- | --- | --- | --- | --- | --- |
| Average, positions 1 to 7 / 8 to 11 | 2.22 (2.16 to 2.27) | 2.25 | 1.82 (1.77 to 1.86) | 0.82 | **FAIL** (also 0.81 against full members) |
| Strike rate, positions 1 to 7 / 8 to 11 | 1.23 (1.22 to 1.25) | 1.18 | 1.19 (1.17 to 1.20) | 0.97 | PASS |
| Economy, part-time / frontline | 1.21 (1.22 to 1.26) | 1.08 | 1.12 (1.11 to 1.13) | 0.92 | PASS |

**Position figures:**
- Real: positions 1 to 7 average 21.7 at 119.3; positions 8 to 11 average 9.8 at 96.8.
- Game: positions 1 to 7 average 16.2 at 93.3; positions 8 to 11 average 8.9 at 78.4.

**Bowler definitions.** Frontline: at least 18 legal balls per innings bowled, over the whole sample. Part-time: fewer than 12.
- Real: 1,372 frontline bowlers at 7.23 an over; 487 part-time at 8.74.
- Game: 32 frontline at 5.53; 14 part-time at 6.17.
- [Inference] The game's part-timers are not part-timers in the cricket sense. They are the sixth bowlers, whom the captain uses at the death, and players who cannot bowl never bowl. So this pass says little.
- The definition depends on outcomes, because an expensive bowler is taken off sooner. It is applied the same way to both sides.

## 4. Mechanism: how ratings reach outcomes, and why the effect is small

**Feature scale.**
- Every rating enters as a feature `(rating - 50) x 200` basis points (`packages/simulation/src/probability.ts` lines 266 and 290 to 294; `generator.ts` line 66).
- A term adds `coefficientBp x featureBp / 10000` bp of logit (`probability.ts` lines 40 to 52).
- So one rating point moves a category's logit by `coefficientBp x 2e-6`: 2,500 bp is 0.005 a point and 5,000 bp is 0.010 a point.

**Batter path.**
- Contact class (`probability.ts` lines 286 to 308; coefficients in `packages/data/src/probability-pack.ts` lines 47 to 70), per point:
  - timing: GROUND +0.007, EDGE -0.008;
  - defence: MISS -0.008, PAD -0.006;
  - power: AERIAL +0.005.
- Against pace or spin, ±0.004 (`generator.ts` lines 152 and 161 to 162).
- Run value (`generator.ts` lines 201 to 214):
  - timing +0.008 and power +0.010 a point on four and six;
  - rotation -0.006 a point on a dot.

**Bowler path.**
- control:
  - executed length: +0.012 a point on the intended length (`generator.ts` lines 129 to 145);
  - wides and no-balls: -0.014 and -0.010 a point (`probability-pack.ts` lines 32 to 46, `probability.ts` line 266);
  - bowled and LBW, after a miss or pad only: +0.006 a point on a -3.5 or -4.0 intercept (`generator.ts` lines 191 to 200, `delivery-pack.ts` lines 30 to 31).
- movement, through `effectiveMovementBp` (`generator.ts` lines 122 to 127): MISS +0.005, PAD +0.004 and EDGE +0.006 a point.
- variation and stamina: never read by the engine. The generator accepts only the `stock` variation (`t20-match.ts` lines 160 and 204), and fatigue grows by a fixed amount by style and effort (`t20-match.ts` lines 104 to 108). They are used only by the captain to rank bowlers (`packages/ai/src/t20-captain.ts` line 83), and they are a third of the bowling score.

**Why the effect is small:**
1. **Small coefficients on a narrow rating spread.** The coefficients are 0.004 to 0.010 logit a point. Across the balls faced, the selected players' mean batting rating has an SD of 11.5 and the bowlers' mean bowling rating 6.1. One SD therefore moves a logit by about 0.05 to 0.1. The real true-effect SDs are 0.13 to 0.36 (full members) or 0.20 to 0.36 (all).
2. **Bowling skill never touches run value or catches.** The bowler changes only the contact class and extras. Run value depends on the batter and on field coverage: four and six lose 0.7 logit at full coverage and a dot gains 0.5 (`generator.ts` lines 206 to 208). Catches depend on the fielder's coverage and catching (`generator.ts` lines 287 to 300; `delivery-pack.ts` lines 20 to 21).
3. **Offsetting effects.** More movement means more misses but also more edges, and 24% of edges go for four (`delivery-pack.ts` line 25). So movement buys dots and edged boundaries together.
4. **Deployment hides the rest.** The captain bowls the best bowlers first and leaves the weakest for the death overs against the tail, which inverts the raw by-rating wicket and dot ratios.

## 5. Effective skill slope: game against real

**Game, controlled dose-response** (`c1-game-dose-response.ts`):
- every player in both elevens has the named skills set to one level in an in-memory copy of the set-up;
- 100 corpus seeds per condition, suggested elevens, captain V3 on both sides.

| Condition | Runs per ball faced | Striker dismissals per ball | Boundaries per ball | First-innings bat runs |
| --- | ---: | ---: | ---: | ---: |
| Batting 30, bowling 50 | 0.624 | 0.0696 | 0.066 | 72.9 |
| Batting 50, bowling 50 | 0.816 | 0.0625 | 0.097 | 98.0 |
| Batting 70, bowling 50 | 1.048 | 0.0573 | 0.140 | 128.2 |
| Batting 50, bowling 30 | 0.838 | 0.0617 | 0.100 | 101.5 |
| Batting 50, bowling 70 | 0.788 | 0.0652 | 0.093 | 93.8 |

**Per rating point (log change):**
- **Game:** from the 30 and 70 conditions above.
- **Real:** the true-effect SD divided by the world pack's rating SD:
  - batting: 7.65, the mean of timing, power, defence and rotation over 112 keepers, batters and all-rounders;
  - bowling: 7.52, the mean of control, movement and variation over 72 bowling-capable players.
- [Inference] Treating one rating SD as one real true-skill SD is a design choice, not a measurement.

| Effect | Game | Real, full members | Real, all | Game is smaller by |
| --- | ---: | ---: | ---: | ---: |
| Batter runs per ball | 0.013 | 0.017 | 0.033 | 1.3 to 2.6 times |
| Batter boundary | 0.019 | 0.026 | 0.047 | 1.4 to 2.5 times |
| Batter dismissal (lower is better) | -0.005 | -0.019 | -0.039 | 4 to 8 times |
| Bowler runs per ball (lower is better) | -0.0015 | -0.012 | -0.027 | 8 to 18 times |
| Bowler dismissal | +0.0014 | +0.010 | +0.029 | 7 to 20 times |
| Bowler boundary (lower is better) | -0.0017 | -0.021 | -0.040 | 12 to 24 times |

For scale:
- The tactical validation's weakest eleven had bowlers about 12 points a skill weaker. At 0.0015 a point that is about 2% more runs, roughly 2 a side, which matches the "no measurable difference" found there.
- A per-ball regression on the game's own matches, which is confounded by batting order and deployment, gives +0.010 runs per ball per batting point and -0.0036 per bowling point (`c1-skill-differentiation.json`, `game.slopes`).

## 6. Proposal: the skill component of `calibrated-t20-01` (design only)

**Parameters.**
- Per legal ball, a multinomial over dot, 1, 2, 3, 4, 6 and wicket, conditioned on phase and wickets lost.
- Each outcome gets a batter term and a bowler term on a standardised latent skill: z equals the inverse normal of the player's rating percentile in the world pack.
- Each term has its own coefficient per outcome: the real true-effect SD.
- A shared factor carries the real correlation between a player's outcome effects ([Inference] for example, boundary hitters may be dismissed more).
- Composites map ratings to outcomes:
  - timing and power: boundaries;
  - defence: dismissals;
  - rotation: dots and singles;
  - control: dots and extras;
  - movement: dismissals;
  - variation: death-over boundaries.
- A pace or spin matchup term comes later.

**Fit.**
- Crossed batter and bowler random effects (a mixed logit, or the multiplicative prototype here), on phase and wickets-lost baselines.
- Fitted on the calibration fit period, dates on or before 2023-08-31 (1,816 matches).
- Model choices (cohort, terms, shrinkage) are made on the validation period, 2023-09-01 to 2025-08-24 (1,077 matches).
- The M7G holdout is used once, at the end.

**Selection by model id.**
- A new probability pack and stage pack with model id `calibrated-t20-01` and their own SHA-256 pins.
- The generator and probability service dispatch on the set-up's recorded model id and hash. Today both reject anything but `synthetic-alpha-01` (`probability.ts` lines 54 to 68, `generator.ts` lines 80 to 91), so a registry keyed by model id is needed.
- `synthetic-alpha-01`'s pack, hash, rules and replay vectors stay byte for byte. A match or career records its model at creation, and replays use that model forever.
- Enabling the new model in the game is a separate owner decision.

**Validation gates (proposed):**
1. Out of sample, on the validation period, player effects beat the phase-only baseline for each outcome, with a 95% match-bootstrap interval that excludes zero.
2. Criterion 1 on a simulated season soak with the captain: raw and adjusted by-rating ratios inside the real middle 80% of the chosen cohort, and never inverted.
3. Dose-response per point inside the real range in section 5.
4. Specialisation within 15%.
5. The existing aggregate gates (runs within 5%, wickets within 0.5, dots and boundaries within 2 points, quantiles within 10%) on the holdout.
6. The tactical validation rerun shows that the weakest eleven and worst-bowler-first lose measurably.
7. Determinism, replay and save compatibility for both model ids.

**Prototype result** (`c1-prototype-fit.py`, research only, the calibration split only):

| Outcome | True relative SD, fit period (batter / bowler) | Validation period | Out-of-sample change, fit effects on validation balls (95%) | Implied coefficient bp, full members / all (batter; bowler) |
| --- | --- | --- | --- | --- |
| Dismissal | 0.23 / 0.21 | 0.24 / 0.25 | log loss +0.00014 (0.0000 to +0.0003): **no gain** | 9,600 / 19,500; 5,100 / 14,300 |
| Boundary | 0.32 / 0.27 | 0.43 / 0.26 | log loss -0.0009 (-0.0016 to -0.0003) | 13,100 / 23,700; 10,600 / 20,100 |
| Not a dot | 0.15 / 0.11 | 0.18 / 0.12 | log loss -0.0012 (-0.0023 to -0.0002) | 5,200 / 11,200; 3,800 / 8,400 |
| Runs per ball | 0.22 / 0.18 | 0.30 / 0.18 | squared error -0.0086 (-0.0129 to -0.0036) | 8,300 / 16,700; 5,800 / 13,500 |

**Reading the prototype:**
- On the game's feature scale, the implied coefficients are 2 to 5 times `synthetic-alpha-01`'s 2,500 to 5,000 bp for batting, and much more for bowling. Bowling also needs a path into run value.
- Dismissal skill does not yet predict the later period. It needs stronger pooling, or per-innings measures, before it is fitted.
- The batter boundary spread grew from the fit period to the validation period (0.32 to 0.43), so a time trend or recency weighting may be needed.
- 72% of validation balls had a batter seen in the fit period.

## 7. Method notes and limits

- **Estimators.**
  - True skill is estimated by method of moments: the between-player variance minus the sampling variance, with normal quarter means of mean ± 1.271 SD.
  - Its match bootstrap is shifted from the point estimate (about 0.05 for strike rate). The ratio is convex in the SD, and resamples admit players with fewer distinct balls; the noise term uses effective balls, (sum of weights)² / sum of weights².
  - So verdicts use both the interval and the split-half to in-sample bracket. The bootstrap intervals of the bracket estimators are in the JSON for reference only.
- **Average.** It has no true-skill estimator, so its verdict rests on the bracket alone.
- **Real spread includes opponent strength.** T20 internationals include large mismatches. The crossed-effects fit adjusts for the opposing player and phase, not for venue or era.
- **Narrow game sample.** The game set-up uses one fixed eleven per team, so 88 batters and 48 bowlers, with a narrow bowling range (quarter means 157 against 213 bowling score).
- **The dose-response includes captain V3's reaction.** It reads the batters' skills when it sets aggression.
- **Deliveries and dismissals.** Balls faced include no-balls. Four runs that were not a boundary (54 deliveries in the whole archive) count as boundaries. Retired hurt and retired not out are not dismissals.

## 8. Reproduce

```bash
python3 -I scripts/m7d-acquire.py --out /home/user/lcx-data/t20s_json.zip --manifest /home/user/lcx-data/acquisition.json
python3 -I scripts/stage-c/c1-real-extract.py --archive /home/user/lcx-data/t20s_json.zip --manifest /home/user/lcx-data/acquisition.json \
  --splits docs/pavilion/stage-c/c1-splits.json --balls /home/user/lcx-data/c1-real-calibration-balls.json
for k in 0 1 2 3; do node --import tsx scripts/stage-c/c1-game-balls.ts /home/user/lcx-data/c1-game-balls-$k.json 5 $((k*5)) & done; wait
for c in bat30 bat50 bat70 bowl30 bowl70; do node --import tsx scripts/stage-c/c1-game-dose-response.ts /home/user/lcx-data/c1-dose-$c.json $c & done; wait
python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json \
  --game /home/user/lcx-data/c1-game-balls-{0,1,2,3}.json --out docs/pavilion/stage-c/c1-skill-differentiation.json
python3 -I scripts/stage-c/c1-prototype-fit.py --real /home/user/lcx-data/c1-real-calibration-balls.json \
  --dose /home/user/lcx-data/c1-dose-{bat30,bat50,bat70,bowl30,bowl70}.json --out docs/pavilion/stage-c/c1-prototype-fit.json
```

Each step is deterministic given the archive. Python needs numpy. The game scripts take about 5 minutes on 4 cores.

**Files:**
- `c1-splits.json`: match ids per split;
- `c1-skill-differentiation.json`: all aggregates and bootstrap intervals;
- `c1-prototype-fit.json`: variance components, out-of-sample check and implied coefficients.

The JSON files carry the archive and licence SHA-256 and this notice.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/. Only derived aggregates and match identifiers are in this repository; no raw Cricsheet file is committed.

## 9. Questions for the owner

1. **Reference cohort for the skill criteria.** All men's T20 internationals include large mismatches, which roughly double the spread. Full members only is closer to eight comparable clubs but has a third of the matches. Domestic franchise data (for example, Cricsheet's IPL or BBL archives, the same licence) would match a league better but needs your approval as a source. Which should the criterion use?
2. **What one rating point means.** The proposal maps rating percentiles to the real skill distribution. Should the world's ratings keep their present spread, with only the model's coefficients changing, or should the ratings be rescaled too?
3. **Bowling variation and stamina.** They are rated and used by the captain but have no effect in the engine. Should `calibrated-t20-01` give them effects (variation in the death overs, stamina through fatigue), or should they leave the bowling score?
4. **Dismissal skill.** It shows no out-of-sample gain at the ball level yet. Is it acceptable to fit it with stronger pooling, or to let it follow from boundary aggression, rather than to measure it independently?
