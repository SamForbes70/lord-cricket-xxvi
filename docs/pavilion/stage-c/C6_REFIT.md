# Stage C slice C6: `calibrated-t20-02`, a separately versioned refit (research only)

**Status:** research only, fitted and measured. Section 1 is the pre-registered fit statement, committed and pushed in `3c80975` before any candidate was run, and is unchanged since. Sections 2 to 9 were added after the fit. No gate is claimed as accepted; the owner accepts results.

**Research only.** `calibrated-t20-02` is a new research model. It is not selectable in the game: the model registry marks it `gameplay: false`, and only `validateT20ResearchMatchSetup` (research scripts and tests) can select it. `synthetic-alpha-01` stays the live model. `calibrated-t20-01` is not modified: its packs, hashes and model hash (`64e09b4b...`) are unchanged. The held-out Cricsheet period (from 30 August 2025, "A5") is not read for fitting, selection or anything else.

**Authority.** Studio Production Directive 03 (27 November 2026, `docs/pavilion/DIRECTIVE_03_2026-11-27.md`): "Recalibrate batter scoring, boundary and dot-ball skill differentiation" and "Address remaining phase-specific wicket and scoring discrepancies", with "Reserve genuinely independent final validation evidence" and "Promote the calibrated engine only after explicit acceptance and versioned compatibility testing". This is a research refit only. It promotes nothing.

**Baseline.** `calibrated-t20-01` under captain V6 (`LC_T20_TACTICAL_CAPTAIN_V6`, batting policy V3, draft PR #172) on the per-delivery harness. This branch is based on #172's head `1d1126d`. On it, `calibrated-t20-01` passes 6 of 8 adjusted gates on the whole calibration split (`docs/pavilion/batting-policy-v3/report-v6.json`): batter runs 1.347 against 1.388 to 1.447 and batter boundary 1.632 against 1.684 to 1.816 fail. First-innings death overs: 9.26 runs an over against 9.75 (fit) and 9.84 (selection); caught 7.74 per 100 balls against 5.60; bowled 0.42 against 1.74. Powerplay wickets 5.26% against 4.24%.

## 1. Pre-registered fit statement

### 1a. The model

`calibrated-t20-02` has three components, pinned and hashed as for `calibrated-t20-01` (`scripts/stage-c/c6-pin-packs.ts`, the counterpart of `c5-pin-packs.ts`):

| Component | Pack | Starting values |
| --- | --- | --- |
| Skill | `LC_CALIBRATED_T20_SKILL_V6` (`packages/data/src/calibrated-t20-02-pack.ts`) | every value of skill V5 |
| Delivery | `LC_CALIBRATED_T20_DELIVERY_V3` (`packages/data/src/calibrated-t20-02-delivery-pack.ts`) | every value of delivery V2, plus two new terms by phase, all 0 |
| Tactics | `LC_CALIBRATED_T20_TACTICS_V1`, shared with `calibrated-t20-01` and unchanged | design choices, not fitted |

Model hash: SHA-256 of `{ deliveryPackSha256, skillPackSha256, tacticsPackSha256 }`, as for `calibrated-t20-01`.

The two new delivery terms are parameters of existing branches, not multipliers or forced outcomes:
- `catchOpportunityPhaseBp`: added, by phase, to the chance that a covered aerial shot or edge becomes a catch chance (after the existing aggression term, clamped to 0 to 10,000).
- `dismissalPhaseBp`: added, by phase, to the bowled intercept after a miss and the lbw intercept after a pad.

With every new value at 0 and the skill values of V5, `calibrated-t20-02` plays exactly as `calibrated-t20-01`. This was checked before this commit: 100 matches (corpus repeat 0, captain V6) on this branch under both ids reproduce `/home/user/lcx-data/bat3/v6/g-0.json` (#172's `calibrated-t20-01` V6 file) column for column, 23,081 deliveries.

### 1b. Parameters fitted (12), and nothing else

| # | Parameter | Pack, field | Start | Fitted to (fit period) |
| ---: | --- | --- | ---: | --- |
| 1 | Timing and power on a four and a six (one value for the four terms) | skill, `runs["4"]` and `runs["6"]`, `TIMING` and `POWER` | +1,200 | batter runs and batter boundary adjusted ratios |
| 2 | Rotation on a dot | skill, `runs["0"].ROTATION` | -13,000 | batter non-dot adjusted ratio, only if it leaves the fit-period range |
| 3 to 5 | Catch-chance term, powerplay, middle, death (aerial and edge tied to one value per phase) | delivery, `catchOpportunityPhaseBp` | 0 | caught per 100 legal balls in that phase |
| 6 to 8 | Bowled intercept by phase | delivery, `dismissalPhaseBp[*].BOWLED` | 0 | bowled per 100 legal balls in that phase |
| 9 to 11 | Lbw intercept by phase | delivery, `dismissalPhaseBp[*].LBW` | 0 | lbw per 100 legal balls in that phase |

That is 11 free values (parameter 1 is one value used in four places). Every other value of every pack stays as in `calibrated-t20-01`. A unit test checks that the -02 packs differ from the -01 packs only in these fields and the manifests.

**Not fitted, reported only:** run outs, stumpings, hit wicket, the run values (so the death four and six mix has no dedicated parameter), the phase contact intercepts, the bowling terms, the tactics component. [Inference] Death runs an over should rise when fewer death balls end in a catch; that is a prediction, and death runs are in the objective but have no parameter of their own.

### 1c. Data and periods

- Real: full-member men's T20 internationals, the calibration table `/home/user/lcx-data/c1-real-calibration-balls.json` from `c1-real-extract.py` (dates up to 2025-08-24; `c6-objective.py` refuses a table with a later date). Fit period: matches up to 2023-08-31. Selection period: 2023-09-01 to 2025-08-24. The holdout (30 August 2025 onward) is not read.
- Ratio targets: `docs/pavilion/stage-c/c5-real-adjusted.json` (fit and selection periods, the `c1-analyse.py` estimator).
- Game, fitting: captain V6 on both sides, per-delivery harness, suggested elevens, the frozen 100-seed corpus with **repeats 20 to 27** (800 matches; seeds suffixed `-c1r20` to `-c1r27`). These seeds are used by no measurement: every measurement uses repeats 0 to 19, as in the C5 re-measure. Runner: `scripts/stage-c/c6-run-candidate.sh` (`c1-game-balls.ts`, four jobs of 200 matches).

### 1d. Objective (`scripts/stage-c/c6-objective.py`)

J = sum over terms of ((game - target) / scale)^2, first innings only, phases overs 1 to 6, 7 to 15 and 16 to 20.

| Term | Fit-period target | Scale |
| --- | --- | ---: |
| Batter runs and batter boundary adjusted ratios (log) | the upper end of the fit-period range (1.410 and 1.781). The owner aimed batting at the upper end of the real range in C3 V3; the upper end of the fit range also lies inside the whole-split and selection ranges | 0.02 |
| The other six adjusted ratios (log) | distance to the fit-period range, 0 inside | 0.02 |
| Runs an over, by phase | fit-period value | 0.25 |
| Wickets per 100 legal balls, by phase | fit-period value | 0.25 |
| Dot % (legal, no run, no wicket), by phase | fit-period value | 1.5 |
| Four % and six %, by phase | fit-period value | 1.0 each |
| Caught (real: caught plus caught and bowled), bowled and lbw per 100 legal balls, by phase | fit-period value | 0.25 each |
| First-innings runs; first-innings wickets | fit-period value | 4; 0.25 |

Selection-period J: the same terms against the selection-period values, except that all 8 ratios use the log distance to the selection-period range (0 inside).

### 1e. Fitting rule (`scripts/stage-c/c6-fit-step.py`, mechanical)

- Candidate c0 is `calibrated-t20-01` (equal to `calibrated-t20-02` with the start values) on the fitting seeds.
- Each next candidate comes from the last one by fixed rules, fit-period figures only:
  - bowled and lbw intercepts: add 10,000 x ln(real / game) bp, rounded to 100;
  - catch-chance term: add 2,400 x (real / game - 1) bp, rounded to 50;
  - timing and power: error e = mean of ln(batter runs / 1.410) and ln(batter boundary / 1.781); step -e / slope, with the secant slope of the last two candidates that differ in this value when it is positive, otherwise 0.000014 a bp (from C5 iterations s10 and s11); at most 4,000, rounded to 100;
  - rotation: changed only if the batter non-dot ratio is outside the fit-period range (1.212 to 1.257), or once two candidates differ in it; target the middle of that range (1.2345); default slope -0.00001 a bp; at most 3,000, rounded to 100.
- No value is set by hand. Candidates c1 to c6 at most. The fit stops early if a step changes no value.
- Every candidate is reported, with its parameters, fit J and selection J.

### 1f. Choice rule (selection period)

- Eligible: a `calibrated-t20-02` candidate whose six currently passing ratios (batter non-dot, batter dismissal and the four bowler ratios) are inside their fit-period ranges, and whose fit J is at most 1.5 times the smallest fit J among `calibrated-t20-02` candidates.
- Chosen: the eligible candidate with the smallest selection J (ties: smaller fit J).
- If the chosen candidate fails the per-point sign and range rule (`c3-per-point-gate.py --sign-range`, as in C5), the next one by selection J is taken.

### 1g. Measurement after the choice (not part of the fit)

The chosen candidate is pinned and measured exactly as the C5 re-measure's reproduce section (`C5_REMEASURE_BALL_BY_BALL.md` section 7), with captain V6 on both sides: `c1-game-balls.ts` and `c4-delivery-balls.ts`, repeats 0 to 19 (2,000 matches each); forced aggression 0 to 4 and the six bowling-plan lever runs (200 matches each); the 11 tactical-validation experiments (200 matches each); the dose conditions; `c1-analyse.py`, `c2-report.py`, `c3-per-point-gate.py --sign-range`, `c5-matchups.py`, the death and phase summary with paired 95% bootstrap intervals. `calibrated-t20-01` under V6 is the comparison, from #172's files plus its forced and lever runs, which #172 did not make and this branch adds with the same commands.

## 2. Every candidate fitted

Fitting seeds (corpus repeats 20 to 27, 800 matches), captain V6, per-delivery harness, `c6-run-candidate.sh`. Parameters in bp: timing and power / rotation; catch-chance term powerplay / middle / death; bowled powerplay / middle / death; lbw powerplay / middle / death. Ratios are batter runs / boundary / non-dot (quick estimator, no bootstrap). "Ratios in range" is fit period / selection period. Death: runs an over / wickets per 100 legal balls / caught / bowled per 100. Real fit period: death 9.75 / 8.92 / 5.60 / 1.74; powerplay wickets 4.24; first-innings runs 158.9.

| Cand. | Timing, power / rotation | Catch term | Bowled | Lbw | Batter runs / boundary / non-dot | Ratios in range | Death | PP wkts | 1st inns runs | J fit | J sel. | Eligible |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| c0 (`-01`) | 1200 / -13000 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 1.371 / 1.702 / 1.236 | 8 / 5 | 9.20 / 9.25 / 7.89 / 0.45 | 5.26 | 161.4 | 178.7 | 137.0 | not a candidate |
| c1 | 3800 / -13000 | -300 / 100 / -700 | -2200 / -1100 / 13400 | -100 / -2200 / 19700 | 1.492 / 2.133 / 1.259 | 4 / 4 | 9.62 / 8.20 / 5.71 / 1.24 | 4.67 | 168.3 | 150.4 | 93.9 | no |
| c2 | 1800 / -11100 | -350 / 50 / -750 | -2000 / -1400 / 16700 | 400 / -3200 / 21000 | 1.387 / 1.828 / 1.204 | 6 / 4 | 9.88 / 8.31 / 5.52 / 1.54 | 4.65 | 167.9 | 46.2 | 87.5 | no |
| c3 | 1700 / -12200 | -350 / 50 / -700 | -1900 / -1500 / 17900 | 0 / -3200 / 23200 | 1.396 / 1.831 / 1.220 | 6 / 6 | 9.80 / 8.56 / 5.67 / 1.61 | 4.66 | 167.4 | 42.4 | 74.8 | no |
| c4 | 1100 / -13100 | -350 / 50 / -750 | -1900 / -1500 / 18600 | 0 / -3400 / 24200 | 1.356 / 1.659 / 1.222 | 8 / 4 | 9.81 / 8.56 / 5.54 / 1.67 | 4.67 | 167.2 | 54.7 | 79.4 | yes |
| c5 | 1600 / -16100 | -350 / 50 / -700 | -1900 / -1500 / 19000 | -300 / -3300 / 23500 | 1.455 / 1.860 / 1.285 | 3 / 5 | 9.64 / 8.68 / 5.69 / 1.71 | 4.65 | 167.7 | 54.9 | 73.4 | no |
| **c6** | **1400 / -13700** | **-350 / 50 / -750** | **-1800 / -1500 / 19100** | **-300 / -3000 / 23400** | 1.396 / 1.746 / 1.245 | 8 / 6 | 9.77 / 8.54 / 5.55 / 1.71 | 4.67 | 167.3 | 41.0 | 75.4 | **yes, chosen** |

**Choice** (`c6-choose.py`, rule of section 1f; `c6/candidates.json`): smallest fit J 41.0 (c6), bound 61.5. Within the bound: c2 to c6. Of those, c2, c3 and c5 fail the "six held" condition (c2 batter non-dot 1.204; c3 bowler boundary 0.6750 against an upper end of 0.6749; c5 batter non-dot 1.285 and bowler boundary). Eligible: c4 (selection J 79.4) and c6 (75.4). **c6 is chosen.** It passes the per-point sign and range rule (section 3e), so the fallback was not needed. The fit stopped at the pre-registered maximum of six candidates.

**What the fit did, read plainly.**
- The dismissal terms converged in two steps and then moved by at most a few hundred bp. Their targets are nearly independent of the other parameters.
- The timing and power term did not converge cleanly. The default slope (from C5) understated the response about fourfold, so c1 overshot (batter boundary 2.13). After that the secant was dominated by noise: at 800 matches the batter boundary ratio moves about 0.1 between neighbouring values, and two steps hit the "wrong sign" fallback. c6 is the best of the oscillation, not a converged optimum. [Inference] A larger fitting sample would be needed to fit this term more tightly.
- Rotation was moved only because c1 pushed non-dot out of range, as the rule required.

The selection period was used only through selection J. The holdout was not read.

## 3. Results: `calibrated-t20-01` against `calibrated-t20-02`, both under captain V6

**Set-up for every table:** corpus repeats 0 to 19 (2,000 matches), suggested elevens, captain V6 on both sides, per-delivery harness, the seeds and sample sizes of the C5 re-measure's reproduce section. `calibrated-t20-01` is #172's own files (`/home/user/lcx-data/bat3/v6/`), which this branch reproduces column for column (section 1a). Real: full-member men's T20 internationals, calibration split.

**Intervals.** Adjusted ratios: `c1-analyse.py`'s match bootstrap (100 replicates); 95% is its P2.5 to P97.5, and P10 to P90 is also given. Note: the C5 re-measure and `BATTING_POLICY_V3.md` quoted the P10 to P90 bracket of this same output as a 95% interval (for example 1.347 (1.330 to 1.363), which is P10 to P90 in `bat3/v6/cal-analysis.json`). The verdicts did not use the intervals. Phase figures: 95% match-bootstrap percentiles, 1,000 replicates, with the difference paired by match (`c6-summary.py`).

### 3a. The 8 adjusted gates (whole calibration split; `c6/report-v6-02.json`, `batting-policy-v3/report-v6.json`)

| Effect | Real range | `-01` under V6: value (95%; P10 to P90) | `-02` under V6: value (95%; P10 to P90) | Verdict `-01`, `-02` |
| --- | --- | --- | --- | --- |
| Batter runs | 1.388 to 1.447 | 1.347 (1.320 to 1.375; 1.330 to 1.363) | **1.386 (1.355 to 1.413; 1.366 to 1.403)** | FAIL, **FAIL by 0.0013** |
| Batter boundary | 1.684 to 1.816 | 1.632 (1.577 to 1.697; 1.590 to 1.670) | **1.725 (1.647 to 1.787; 1.683 to 1.769)** | FAIL, **PASS** |
| Batter non-dot | 1.226 to 1.266 | 1.236 (1.219 to 1.251) | 1.245 (1.228 to 1.262) | PASS, PASS |
| Batter dismissal | 0.666 to 1.000 | 0.810 (0.784 to 0.842) | 0.785 (0.751 to 0.823) | PASS, PASS |
| Bowler runs | 0.766 to 0.802 | 0.780 (0.772 to 0.788) | 0.791 (0.782 to 0.799) | PASS, PASS |
| Bowler boundary | 0.614 to 0.681 | 0.654 (0.642 to 0.664) | 0.671 (0.659 to 0.683) | PASS, PASS |
| Bowler non-dot | 0.841 to 0.865 | 0.851 (0.845 to 0.856) | 0.859 (0.853 to 0.864) | PASS, PASS |
| Bowler dismissal | 1.000 to 1.364 | 1.149 (1.112 to 1.189) | 1.160 (1.123 to 1.209) | PASS, PASS |
| **Total** | | **6 of 8** | **7 of 8** | |

By period (`c5-adjusted-quick.py` point values): fit period `-01` 8 of 8, `-02` 8 of 8. Selection period `-01` 6 of 8, `-02` 5 of 8: `-02` fails batter runs (1.386 against 1.392 to 1.537), bowler non-dot (0.859 against 0.802 to 0.851) and batter dismissal (0.785 against 0.789 to 1.000); it passes batter boundary (1.725 against 1.680 to 1.978), which `-01` failed.

**Reading.** Batter runs moved from 1.347 to 1.386, about 90% of the way to the range, and the 95% interval now overlaps the range; the point value still fails, by 0.0013. Batter boundary is now inside its range. The six gates that passed still pass on the whole split. The bowler ratios moved up slightly (bowler boundary 0.671, close to its upper end of 0.681); the bowling terms were not changed, so [Inference] this comes through who bowls to whom when the batting is steeper.

### 3b. First-innings phases, with paired change (`c6/summary-paired.json`)

| | Real fit / selection | `-01` V6 | `-02` V6 | Change `-02` minus `-01` |
| --- | --- | --- | --- | --- |
| Runs | 158.9 / 166.0 | 160.8 (159.1 to 162.5) | 166.9 (165.1 to 168.6) | +6.1 (5.5 to 6.7) |
| Wickets | 6.40 / 6.87 | 6.97 (6.88 to 7.06) | 6.51 (6.41 to 6.61) | -0.46 (-0.51 to -0.41) |
| P10 / P50 / P90 runs | 118 / 160 / 202; 110 / 172 / 219 | 112 / 160 / 210 | 117 / 166 / 215 | |
| Powerplay runs an over | 7.68 / 8.30 | 7.79 (7.67 to 7.90) | 8.02 (7.90 to 8.13) | +0.23 (0.20 to 0.26) |
| Powerplay wicket % (legal balls) | 4.24 / 4.79 | 5.26 (5.11 to 5.42) | **4.64 (4.49 to 4.79)** | -0.62 (-0.69 to -0.57) |
| Powerplay dot % | 42.4 / 41.8 | 38.2 (37.7 to 38.7) | 37.7 (37.2 to 38.2) | -0.50 (-0.61 to -0.39) |
| Middle runs an over | 7.66 / 8.27 | 7.81 (7.72 to 7.89) | 7.98 (7.89 to 8.06) | +0.17 (0.14 to 0.19) |
| Middle wicket % | 4.51 / 5.12 | 4.49 (4.37 to 4.61) | 4.36 (4.24 to 4.48) | -0.13 (-0.17 to -0.08) |
| Middle four % | 8.25 / 8.64 | 11.09 | 11.48 | +0.39 (0.30 to 0.49) |
| Death runs an over | 9.75 / 9.84 | 9.26 (9.13 to 9.39) | **9.78 (9.64 to 9.91)** | +0.52 (0.45 to 0.59) |
| Death wicket % | 8.92 / 9.14 (all wickets); 8.87 (legal balls, `c4-analyse`) | 9.23 (9.01 to 9.45) | **8.49 (8.28 to 8.73)** | -0.73 (-0.90 to -0.55) |
| Death dot % (wicket balls excluded) | 18.8 / 23.6 | 21.8 (21.3 to 22.4) | 19.6 (19.1 to 20.2) | -2.19 (-2.50 to -1.88) |
| Death four % | 11.1 / 11.3 | 8.7 (8.4 to 9.0) | 9.3 (9.0 to 9.6) | +0.62 (0.42 to 0.79) |
| Death six % | 7.4 / 8.5 | 8.6 (8.4 to 8.9) | 9.2 (9.0 to 9.5) | +0.62 (0.48 to 0.78) |

### 3c. Dismissal kinds per 100 legal balls, by phase (first innings)

Real "caught" includes caught and bowled (the game has no caught-and-bowled branch).

| Phase, kind | Real fit / selection | `-01` V6 | `-02` V6 | Change |
| --- | --- | --- | --- | --- |
| Powerplay caught | 2.77 / 3.52 | 3.22 (3.09 to 3.34) | **2.77 (2.65 to 2.89)** | -0.45 (-0.50 to -0.40) |
| Powerplay bowled | 0.86 / 0.74 | 1.13 (1.05 to 1.20) | 0.93 (0.87 to 1.00) | -0.19 (-0.23 to -0.16) |
| Powerplay lbw | 0.37 / 0.37 | 0.40 | 0.38 | -0.02 (-0.04 to 0.00) |
| Powerplay run out / stumped | 0.18 / 0.06 (fit) | 0.30 / 0.23 | 0.31 / 0.25 | not fitted |
| Middle caught | 2.89 / 3.59 | 2.74 (2.64 to 2.84) | 2.84 (2.74 to 2.94) | +0.10 (0.07 to 0.13) |
| Middle bowled | 0.71 / 0.83 | 0.81 | 0.71 (0.67 to 0.76) | -0.10 (-0.12 to -0.08) |
| Middle lbw | 0.38 / 0.35 | 0.53 | 0.40 (0.37 to 0.44) | -0.13 (-0.16 to -0.10) |
| Death caught | 5.60 / 6.10 | 7.74 (7.54 to 7.96) | **5.52 (5.34 to 5.71)** | -2.22 (-2.36 to -2.08) |
| Death bowled | 1.74 / 1.48 | 0.42 (0.37 to 0.48) | **1.58 (1.46 to 1.69)** | +1.15 (1.06 to 1.25) |
| Death lbw | 0.35 / 0.31 | 0.07 (0.05 to 0.09) | **0.38 (0.34 to 0.44)** | +0.31 (0.27 to 0.36) |
| Death run out | 1.07 / 1.06 | 0.94 | 0.98 (0.90 to 1.07) | +0.04 (-0.01 to 0.08), not fitted |
| Death stumped | 0.14 / 0.18 | 0.08 | 0.06 | not fitted |

**Death split by striker class** (tail-ender: batting score below 175): tail-enders' share of death balls 35.9% to 30.9% (-5.0, -6.0 to -4.2); recognised batters 1.79 to 1.87 runs a ball (+0.07, 0.06 to 0.09), dismissal 9.48% to 8.44%. [Inference] With fewer death catches, recognised batters survive longer, so they face more of the death and the tail fewer; that, more than the steeper batting term, is where the extra death runs come from. Death aggression 4 rose from 71.3% to 76.0% of balls for the same reason (fewer tail-enders at the crease to hold back).

### 3d. Raw criterion 1 and specialisation (`report-v6-02.json`)

| Statistic | Real P10 to P90; bracket | `-01` V6 | `-02` V6 |
| --- | --- | --- | --- |
| Strike rate | 1.37 to 1.44; 1.20 to 1.39 | 1.26 UNCLEAR | 1.30 UNCLEAR |
| Average | none; 1.57 to 2.45 | 2.09 UNCLEAR | 2.24 UNCLEAR |
| Dismissal rate | 0.57 to 0.72; 0.46 to 0.65 | 0.60 PASS | 0.58 PASS |
| Batting dot % | 0.69 to 0.71; 0.70 to 0.79 | 0.82 FAIL | 0.81 FAIL |
| Batting boundary % | 1.78 to 1.95; 1.43 to 1.80 | 1.77 UNCLEAR | **1.87 PASS** |
| Economy | 0.73 to 0.77; 0.74 to 0.86 | 0.79 UNCLEAR | 0.81 UNCLEAR |
| Wicket rate | 1.00 to 1.40; 1.20 to 1.91 | 1.47 UNCLEAR | **1.38 PASS** |
| Bowling dot % | 1.43 to 1.49; 1.27 to 1.45 | 1.60 FAIL | 1.58 FAIL |
| Boundary % conceded | 0.55 to 0.60; 0.56 to 0.69 | 0.74 FAIL | 0.76 FAIL |
| **Total** | | 1 PASS, 5 UNCLEAR, 3 FAIL | **3 PASS, 3 UNCLEAR, 3 FAIL** |

Specialisation (game / real within 0.85 to 1.15): average ratio `-01` 0.78 FAIL, `-02` 0.82 FAIL; strike-rate ratio 1.06 PASS, 1.09 PASS; economy ratio 1.05 PASS, 1.03 PASS.

### 3e. Per-point sign and range rule (`c6/per-point-v6-02.json`; dose under V6)

| Effect (oriented) | C3 range | `-01` V6 | `-02` V6 |
| --- | --- | ---: | ---: |
| Batter runs | 0.0078 to 0.0092 | 0.0161 | 0.0162 |
| Batter boundary | 0.0127 to 0.0155 | 0.0244 | 0.0248 |
| Batter non-dot | 0.0052 to 0.0061 | 0.0095 | 0.0095 |
| Batter dismissal (fewer) | 0 to 0.0126 | 0.0032 | 0.0040 |
| Bowler runs (fewer) | 0.0119 to 0.0146 | 0.0247 | 0.0242 |
| Bowler boundary (fewer) | 0.0212 to 0.0270 | 0.0405 | 0.0398 |
| Bowler non-dot (fewer) | 0.0080 to 0.0097 | 0.0137 | 0.0134 |
| Bowler dismissal (more) | 0 to 0.0206 | 0.0070 | 0.0072 |
| Variation: wickets / runs | both positive | +0.0056 / +0.0031 | +0.0055 / +0.0031 |

`-02`: 9 of 9 PASS under the sign and range rule (at most twice the C3 upper end); 2 of 8 inside the C3 range, as for `-01`. The batting per-point effects barely moved (batter runs 0.0161 to 0.0162): the timing and power change (+200 bp) is small, and [Inference] most of the adjusted-ratio gain came from who faces the death balls (section 3c), which the dose conditions, with every player alike, do not see.

## 4. Tactical effects (measured, not engineered)

Nothing in the tactics pack changed. Every number below is a measurement of the refit model.

### 4a. Bowling-plan levers, forced for both sides (200 matches each; `c6/summary-levers.json`; intervals bootstrap each run separately, so they are wide)

| Lever | `-01` V6: runs; wickets; death runs an over | `-02` V6: runs; wickets; death runs an over |
| --- | --- | --- |
| Yorker minus good length | -5.6 (-14.0 to 1.4); +0.11 (-0.28 to 0.53); **-0.50 (-1.12 to -0.05)** | -6.7 (-14.3 to 0.2); +0.34 (-0.05 to 0.79); **-0.64 (-1.32 to -0.13)** |
| Full minus good length | +1.1 (-7.0 to 7.5); +0.11; +0.10 (-0.54 to 0.56) | +0.9 (-7.2 to 8.4); +0.17; +0.02 (-0.68 to 0.53) |
| Maximum minus conserve effort | +3.9 (-4.2 to 10.6); +0.12; +0.29 (-0.32 to 0.79) | +3.4 (-4.0 to 10.7); +0.15; +0.14 (-0.52 to 0.66) |
| Maximum minus normal effort | +2.5 (-5.4 to 9.1); +0.03; +0.07 | +2.0 (-5.3 to 9.1); +0.06; +0.04 |

Only the yorker's death-overs effect is clearly non-zero in both models, slightly larger in `-02`. Its wicket effect is now positive at the point (+0.34 an innings) but its interval still includes zero. [Inference] The larger death bowled term makes a yorker's existing bowled and lbw advantage count for more. Effort and full length: no measurable effect in either model.

### 4b. Forced aggression, both sides every ball (200 matches each)

| Aggression | `-01` V6: runs / wickets / dot % | `-02` V6: runs / wickets / dot % |
| ---: | --- | --- |
| 0 | 96.5 / 2.25 / 50.2 | 97.9 / 2.12 / 49.7 |
| 1 | 117.0 / 3.26 / 45.6 | 119.1 / 3.00 / 44.8 |
| 2 | 140.2 / 4.64 / 42.3 | 143.1 / 4.33 / 41.2 |
| 3 | 164.3 / 7.01 / 35.1 | 169.3 / 6.67 / 34.1 |
| 4 | 166.5 / 8.90 / 32.7 | 174.0 / 8.51 / 31.6 |

Going from 3 to 4 now buys 4.7 runs for 1.84 wickets (`-01`: 2.2 runs for 1.89). Full attack is less punishing because death catches are rarer.

### 4c. Tactical validation, 11 experiments, 200 matches each (`c6/tactical-validation-v6-02.json`; good side's share of decided matches, 95% Wilson interval; paired run difference per innings, 95% interval)

| Experiment (poor side) | `-01` V6 | `-02` V6 |
| --- | --- | --- |
| Weakest eleven | 85.8% (80.2 to 90.0); +21.8 (16.3 to 27.2) | 85.3% (79.7 to 89.6); +21.5 (16.0 to 26.9) |
| Old selection rule | 86.3% (80.7 to 90.5); +20.6 (15.7 to 25.5) | 89.6% (84.5 to 93.2); +21.8 (17.2 to 26.3) |
| Batting order reversed | 80.4% (74.3 to 85.4); +17.1 (12.5 to 21.8) | 81.8% (75.7 to 86.6); +17.1 (12.5 to 21.7) |
| Aggression 4 every ball | 45.4% (38.6 to 52.4); -1.9 (-7.4 to 3.6) | 44.1% (37.3 to 51.1); -2.5 (-7.9 to 2.8) |
| Aggression 0 every ball | 92.4% (87.8 to 95.3); +33.4 (27.3 to 39.5) | 92.5% (87.9 to 95.4); +35.7 (29.4 to 42.0) |
| Weakest bowler first | 65.7% (58.8 to 71.9); +13.3 (8.2 to 18.4) | 64.2% (57.2 to 70.7); +13.8 (9.0 to 18.5) |
| Full length, maximum effort | 53.2% (46.1 to 60.1); +1.1 (-3.7 to 6.0) | 53.4% (46.3 to 60.4); +2.1 (-2.4 to 6.7) |
| Good length throughout | 52.6% (45.6 to 59.5); -0.1 (-4.8 to 4.7) | 50.0% (43.0 to 57.0); -1.4 (-5.8 to 3.0) |
| Maximum effort throughout | 54.0% (46.9 to 60.9); +0.7 (-4.1 to 5.5) | 55.0% (47.9 to 61.9); +1.3 (-3.4 to 6.0) |
| Conserve effort throughout | 48.1% (41.1 to 55.2); +0.8 (-4.0 to 5.5) | 49.5% (42.4 to 56.6); +0.4 (-4.0 to 4.8) |
| Two-slip field all innings | 65.1% (58.0 to 71.5); +9.2 (3.9 to 14.5) | 66.8% (59.8 to 73.2); +9.3 (4.3 to 14.3) |

Every `-02` result lies within the `-01` interval of the same experiment. Selection, batting order, blocking, bowler choice and the field still decide matches. No bowling-plan experiment (length, effort) differs from an even contest. Full attack is still not shown to be worse than the captain (44.1%, 37.3 to 51.1, which includes 50%).

### 4d. Matchups (no real yardstick; `c6/matchups-v6-0{1,2}.json`, 88 batters)

| | `-01` V6 | `-02` V6 |
| --- | --- | --- |
| Relative runs a ball, spin against pace, top minus bottom tilt quarter | -2.2% (-5.6 to +1.7%) | -1.2% (-4.6 to +2.6%) |
| Relative dismissals | -7.5% (-16.0 to +1.8%) | **-10.4% (-19.7 to -1.2%)** |
| Left minus right handed (null check: the generator has no hand term) | -2.8% (-5.2 to +0.3%) | -2.8% (-5.7 to -0.3%) |

The matchup effect on scoring is not distinguishable from zero in either model. On dismissals `-02`'s interval now excludes zero, but the handedness null check also just excludes zero in `-02`, so [Inference] intervals of this width are at the edge of what this design can resolve, and neither result should be read as an established effect.

## 5. What passes and what fails (`calibrated-t20-02` under captain V6)

**Passes:**
- Adjusted criterion 1 on the whole split: 7 of 8 (`-01`: 6 of 8). Batter boundary now passes. Fit period 8 of 8.
- Death runs an over 9.78 (9.64 to 9.91) against 9.75 / 9.84 real: fixed (was 9.26).
- Death caught 5.52 against 5.60; death lbw 0.38 against 0.35; powerplay caught 2.77 against 2.77; middle kinds within 0.05 of real.
- Death wicket rate 8.49% (8.28 to 8.73) of legal balls, now just below the fit period's 8.87 (`-01` was above, 9.23).
- Powerplay wickets 4.64% (4.49 to 4.79), between the fit (4.24) and selection (4.79) periods (was 5.26).
- First-innings wickets 6.51, between 6.40 and 6.87 (was 6.97).
- Per-point sign and range 9 of 9; raw criterion 1 3 PASS (was 1); specialisation 2 of 3 (unchanged).

**Fails or open:**
- Batter runs adjusted ratio 1.386 against 1.388 to 1.447: FAIL by 0.0013 (95% interval 1.355 to 1.413 overlaps the range). Selection period 5 of 8 (was 6 of 8): batter runs, bowler non-dot (0.859 against at most 0.851) and batter dismissal (0.785 against at least 0.789).
- First-innings runs 166.9 against 158.9 (fit) and 166.0 (selection): up 6.1 runs, now above the fit period and at the selection period. Powerplay 8.02 an over and middle 7.98 an over are above the fit period (7.68, 7.66), below the selection period (8.30, 8.27).
- Death bowled 1.58 against 1.74 (fit), between fit and selection (1.48). Death boundary mix still off: fours 9.3% against 11.1%, sixes 9.2% against 7.4% (no parameter, as pre-registered).
- Powerplay dots 37.7% against 42.4%; middle fours 11.5% against 8.3% (unchanged in kind from `-01`; not fitted).
- Powerplay run outs (0.31 against 0.18) and stumpings (0.25 against 0.06) are high, not fitted.
- Raw criterion 1: batting dot %, bowling dot % and boundary % conceded FAIL. Specialisation: average ratio FAIL (0.82 of real).
- Bowling plans (length, effort) still do not decide matches; only the yorker's death-over run effect is measurable.

## 6. Limits

- **Death terms are large.** Bowled +19,100 bp and lbw +23,400 bp at the death, on top of a death miss intercept of -21,000 that delivery V2 set to bring death dots down. [Inference] The model now produces death bowled and lbw through rare misses that are very often fatal, not through more misses. Cricsheet cannot say which is right (it records no miss or leave), so this is a modelling choice with the real kinds as its only check.
- **Catch terms are tied across aerial shots and edges** because Cricsheet does not say which catches came from edges.
- **The timing and power term is noisy at 800 matches** (section 2). The chosen value is the best of six, not a converged estimate.
- **The fitted values interact with captain V6.** Like C5's values under captain V4, they may not survive a later captain change.
- **First-innings runs rose** by about 6. The objective weighed this (scale 4 runs) against the dismissal and ratio terms, and no parameter acts on totals directly.
- **The interval labels in earlier pages** (section 3, intervals) were P10 to P90, not 95%. Only labels are affected; no verdict used them.
- Synthetic-alpha-01 is not compared here: no calibration claim applies to it.

## 7. Research only, the holdout untouched, compatibility

- `calibrated-t20-02` is research only: `gameplay: false` in the registry; only `validateT20ResearchMatchSetup` reaches it; no screen, set-up, career, save, UI or default selects it. The unit test `tests/unit/stage-c-calibrated-02-model.test.ts` checks the registry, that `validateT20MatchSetup` still records `synthetic-alpha-01`, and that only `synthetic-alpha-01` is a gameplay model. **`synthetic-alpha-01` stays the live model.**
- **`calibrated-t20-01` is unchanged:** skill `07949faa...`, delivery `2ea31526...`, tactics `006d7af8...`, model `64e09b4b...` (`c5-pin-packs.ts` prints them; unit test pins them); its files reproduce #172's column for column.
- **The A5 holdout (30 August 2025 onward) was not read** for fitting, selection or measurement. Every real figure comes from the calibration table (dates up to 2025-08-24), which `c6-objective.py` refuses to read if it holds a later date. Promotion still needs the owner's explicit acceptance, the single A5 evaluation, and versioned compatibility testing.
- **Formats.** No persisted format changed. The five in-memory request and context schemas (`GenerateDeliveryRequestSchema`, `NormaliseCategoriesRequestSchema`, `ProbabilityContextSchema`, `ProbabilityRequestSchema`, `SampleCategoryRequestSchema`) now list `calibrated-t20-02` in their model-id enum, as C2 did for `calibrated-t20-01`. Set-ups record the model in `versions.model`, which is a free id in the persisted schema, unchanged. These five schema files are pinned in the frozen-artefact inventory, so `node scripts/check-pass07b-inventory.mjs` reports drift on them (section 8). The inventory file was not changed: per `docs/verification-pass07a/INVENTORY_REFRESH_2026-11-25.md`, a refresh is done on merged `main` with a new id, which is the owner's decision.
- Hashes (`c6-pin-packs.ts`): skill V6 `188c50996df1cc25976c7f35fbbf36c2d4c11eba1bcfaaaf0bdce6beccacdb6f`; delivery V3 `956f0d640253fc3c83fedf83b890095c65dcfa3c542d1bed508c46f3ffc4dd3b`; tactics V1 (shared) `006d7af87aa76d8c64bec76217c510df68447951ab60f9bf8e217e707d63f0e1`; model `be97f9a991e9263dc392dc0e91e1a70187fc60a21fd2ab85495de4b8b6965444`.

## 8. Commands, revisions and results

**Revisions.** Pre-registration and model code `3c80975` (pushed before any fit). Fit candidates c0 to c6 ran on `3c80975` with only the -02 pack values changed by `c6-apply-candidate.py` and re-pinned for each candidate. Chosen values committed in `c4b879a`; every measurement job and the checks below ran on `c4b879a` (the working tree then differed only in the two analysis-script label options and new output files). Linux container, 4 cores, Node 22. Raw files outside the repository in `/home/user/lcx-data/c6/` (`fit/`, `m02/`, `m01/`, job list `jobs.txt`, exit codes and times `exits.log`, analysis `analyse.sh` and `analyse-exits.log`, checks `checks.sh` and `checks.log`).

| Command | Result |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` (new worktree on #172's `1d1126d`; again on `c4b879a`) | PASS (exit 0, both) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <probe>.json 1 0 --captain=V6` and the same with `--model=calibrated-t20-02` (start values), compared with `bat3/v6/g-0.json` | PASS (exit 0; identical, 23,081 deliveries, both ids) |
| `node --import tsx scripts/stage-c/c5-pin-packs.ts` | PASS (exit 0; `calibrated-t20-01` model `64e09b4b...`, unchanged) |
| `node --import tsx scripts/stage-c/c6-pin-packs.ts --write` | PASS (exit 0; hashes in section 7) |
| `node --import tsx scripts/generate-schemas.ts` | PASS (exit 0; 409 schemas, 5 changed as section 7) |
| `bash scripts/stage-c/c6-run-candidate.sh /home/user/lcx-data/c6/fit/c<n> <params>` (c0 with `calibrated-t20-01`; c1 to c6) | PASS (every step exit 0; 187 to 366 s of games each) |
| `python3 -I scripts/stage-c/c6-fit-step.py --history ... --out params-c<n>.json` (n = 1 to 6) | PASS (exit 0 each) |
| `python3 -I scripts/stage-c/c6-choose.py --fit-dir /home/user/lcx-data/c6/fit --candidates c0 c1 c2 c3 c4 c5 c6 --out docs/pavilion/stage-c/c6/candidates.json` | PASS (exit 0; chosen c6) |
| `node --import tsx scripts/stage-c/c1-game-balls.ts <m02>/cal-balls-$k.json 5 $((k*5)) --model=calibrated-t20-02 --captain=V6` (k = 0 to 3) | PASS (exit 0 each; 753 to 810 s, four at a time) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <m02>/g-$k.json 5 $((k*5)) --model=calibrated-t20-02 --captain=V6` (k = 0 to 3) | PASS (exit 0 each; 787 to 836 s) |
| `node --import tsx scripts/pavilion-tactical-validation.ts <m02>/tv/calibrated-t20-02-<e>.json <e> --model=calibrated-t20-02 --captain=V6` (11 experiments) | PASS (exit 0 each; 191 to 248 s) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/f-$a.json 2 0 --aggression=$a --model=<m> --captain=V6` (a = 0 to 4; both models) | PASS (exit 0, 10 jobs) |
| `node --import tsx scripts/stage-c/c4-delivery-balls.ts <dir>/lev/<lever>.json 2 0 --effort=<E>` or `--length=<L>` (6 levers; both models) | PASS (exit 0, 12 jobs) |
| All 41 game jobs, four at a time | 3,356 s wall time |
| `bash scripts/stage-c/c2-dose.sh <m02>/dose calibrated-t20-02` | PASS (exit 0; 157 s) |
| `bash /home/user/lcx-data/c6/analyse.sh`: `c1-analyse.py`, `c2-report.py --calibrated-label calibrated-t20-02`, `c3-per-point-gate.py --model calibrated-t20-02 --sign-range`, `c4-analyse.py` (both models), `c5-summary.py`, `c6-summary.py`, `c5-matchups.py` (both), `c6-objective.py` (both), `c5-adjusted-quick.py` (fit, selection), tactical merge | PASS (exit 0, all 15 steps; `c3-per-point-gate.py` re-run once with the new `--model` label, exit 0) |
| `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run schemas:check` | PASS (exit 0) |
| `NODE_OPTIONS=--max-old-space-size=4096 npm run build` | PASS (exit 0) |
| `npm run vectors:check`, `npm run probability:check`, `npm run generator:check`, `npm run fixtures:engine` | PASS (exit 0 each) |
| `NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --maxWorkers=2` (after the build) | PASS (exit 0; 136 files, 1,182 tests) |
| `node scripts/check-pass07b-inventory.mjs` | **FAIL (exit 1): `FROZEN_INVENTORY_DRIFT packages/contracts/schemas/GenerateDeliveryRequestSchema.json`**, the first of the five in-memory schemas that now list `calibrated-t20-02` (section 7). The same command on the base `1d1126d` exits 0. The inventory was not refreshed here: that is the owner's decision. |
| Browser suites (`playwright`) | NOT RUN locally; hosted CI runs them |
| Holdout (A5) evaluation | NOT RUN, by design |

`<m02>` is `/home/user/lcx-data/c6/m02`; `<dir>` is `m02` or `m01`; the `calibrated-t20-01` game files are #172's `/home/user/lcx-data/bat3/v6/`.

**Files added:** this page; `scripts/stage-c/c6-*.{py,ts,sh}`; `packages/data/src/calibrated-t20-02-pack.ts`, `calibrated-t20-02-delivery-pack.ts`; `tests/unit/stage-c-calibrated-02-model.test.ts`; `docs/pavilion/stage-c/c6/` (candidate table and objectives, `report-v6-02.json`, `per-point-v6-02.json`, `delivery-v6-0{1,2}.json`, `summary-paired.json`, `summary-levers.json`, `matchups-v6-0{1,2}.json`, `objective-measure-0{1,2}.json`, `tactical-validation-v6-02.json`). Changed: `c2-report.py` and `c3-per-point-gate.py` gain a label option whose default keeps their output unchanged.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/. Only derived aggregates are committed.

## 9. Open questions for the owner

1. Batter runs fails by 0.0013 on the whole split (point value 1.386, 95% interval reaching 1.413). Is that a pass within sampling error, or a fail? A further fit of the timing and power term on a larger fitting sample could close it, at the cost of more first-innings runs.
2. First-innings runs rose by 6 to 166.9, at the selection period's level and above the fit period's. Accept, or fit a term for totals (for example the powerplay and middle run values, which no stage has fitted under captain V6)?
3. The death bowled and lbw terms are large (section 6). Accept them as the price of matching the real kinds, or prefer a design that raises death misses instead (more death dots)?
4. The five in-memory schema files need an inventory refresh before `check-pass07b-inventory.mjs` passes again. Refresh after merge, as the refresh note describes?
5. Earlier pages label P10 to P90 brackets as 95% intervals. Correct those pages in a separate documentation pull request?
