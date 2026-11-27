# Stage C slice C6: `calibrated-t20-02`, a separately versioned refit (research only)

**Status:** pre-registration. This section was written and committed before any candidate was fitted. Results follow in later sections, added after the fit.

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
