# Stage C C3 re-measure: pack V3 under captain V4

**Status:** research only. `calibrated-t20-01` stays unselectable in the game, and `synthetic-alpha-01` is unchanged (no game, model, rule or schema file is changed on this branch). Nothing is marked passed.

These are the gates that C3 left NOT RUN pending captain V4 (#146):
- criterion 1, raw and adjusted;
- the head-to-head tactical validation;
- specialisation;
- first-innings aggregates.

**Conditions compared:**
- **Before:** pack `LC_CALIBRATED_T20_SKILL_V3` (`8e776867...`) under captain V3, run at `c57dbd6`.
- **After:** the same pack under captain V4, run at `475ea3d` (`pavilion/stage-c-research` with `main` merged, including #146).

**Game:** 2,000 matches per model and condition (frozen corpus seeds × 20 repeats), suggested elevens, the named captain on both sides.

**Real reference:** full-member men's T20 internationals, calibration split. The holdout was not used.

## 1. Results

### 1a. Criterion 1, raw (top / bottom quarter by the game's own rating)

| Statistic | Calibrated, captain V3 | **Calibrated, captain V4** | Synthetic, captain V4 | Real (P10 to P90); bracket |
| --- | --- | --- | --- | --- |
| Strike rate | 0.99 FAIL (inverted) | **1.16 FAIL** | 1.26 UNCLEAR | 1.36 (1.37 to 1.44); 1.20 to 1.39 |
| Average | 1.67 UNCLEAR | **2.05 UNCLEAR** | 2.26 UNCLEAR | none; 1.57 to 2.45 |
| Dismissal rate | 0.59 PASS | **0.57 PASS** | 0.56 UNCLEAR | 0.56 (0.57 to 0.72); 0.46 to 0.65 |
| Batting dot % | 0.95 FAIL | **0.90 FAIL** | 0.84 FAIL | 0.72 (0.69 to 0.71); 0.70 to 0.79 |
| Batting boundary % | 0.93 FAIL (inverted) | **1.20 FAIL** | 1.31 FAIL | 1.77 (1.78 to 1.95); 1.43 to 1.80 |
| Economy | 0.68 FAIL | **0.87 FAIL** | 1.10 FAIL (inverted) | 0.77 (0.73 to 0.77); 0.74 to 0.86 |
| Wicket rate | 0.62 FAIL (inverted) | **1.42 UNCLEAR** | 1.21 PASS | 1.24 (1.00 to 1.40); 1.20 to 1.91 |
| Bowling dot % | 1.07 FAIL | **1.17 FAIL** | 1.04 FAIL | 1.42 (1.43 to 1.49); 1.27 to 1.45 |
| Boundary % conceded | 0.53 FAIL | **0.87 FAIL** | 1.28 FAIL (inverted) | 0.59 (0.55 to 0.60); 0.56 to 0.69 |

**Captain V4 removes every raw inversion for the calibrated model.** Under V4 the remaining failures are all too flat, not inverted.

`synthetic-alpha-01` under V4 inverts economy and boundaries conceded. Its bowling skill has almost no effect, so saving the best bowlers for the death overs makes them look expensive.

### 1b. Criterion 1, adjusted for phase and opponent

| Effect (top-rated / bottom-rated quarter) | Calibrated, captain V3 | **Calibrated, captain V4** | Synthetic, captain V4 | Real (range) |
| --- | --- | --- | --- | --- |
| Batter runs | 1.35 FAIL | **1.20 FAIL** | 1.30 FAIL | 1.39 (1.39 to 1.45) |
| Batter boundary | 1.58 FAIL | **1.31 FAIL** | 1.45 FAIL | 1.68 (1.68 to 1.82) |
| Batter non-dot | 1.21 FAIL | **1.13 FAIL** | 1.22 FAIL | 1.23 (1.23 to 1.27) |
| Batter dismissal | 0.82 PASS | **0.86 PASS** | 0.86 PASS | 0.69 (0.67 to 1.00) |
| Bowler runs | 0.79 PASS | **0.87 FAIL** | 0.99 FAIL | 0.80 (0.77 to 0.80) |
| Bowler boundary | 0.69 FAIL | **0.81 FAIL** | 0.98 FAIL | 0.66 (0.61 to 0.68) |
| Bowler non-dot | 0.86 PASS | **0.91 FAIL** | 1.00 FAIL (inverted) | 0.86 (0.84 to 0.87) |
| Bowler dismissal | 1.14 PASS | **1.09 PASS** | 0.96 FAIL (inverted) | 1.22 (1.00 to 1.36) |

**Under V4 the calibrated adjusted ratios are all on the flat side of real.** Two pass (both dismissal ratios) against four under V3, and none is inverted.
- The causal per-point effects are unchanged and still all PASS (section 1e).
- The game's rating-quarter gaps are also unchanged under V4 (37.2 points a batting skill, 18.6 a bowling skill).
- [Inference] Under V3, the captain's deployment added some steepness within each phase. With it gone, the C3 mapping (real quarter log ratio divided by the game's rating gap) gives effects too small to reproduce the real quarter ratios. A plausible reason: the real adjusted ratio also contains role and usage effects that phase and opponent adjustment does not remove. The game has no such effects, so per-point targets derived this way understate what the quarter test needs. The C2 mapping overshot under captain V3; the right mapping lies between the two.

### 1c. Specialisation (game / real within 0.85 to 1.15)

| Ratio | Real | Calibrated, captain V3 | **Calibrated, captain V4** | Synthetic, captain V4 |
| --- | ---: | --- | --- | --- |
| Average, positions 1 to 7 / 8 to 11 | 2.25 | 1.43 (0.64) FAIL | **1.72 (0.77) FAIL** | 1.85 (0.82) FAIL |
| Strike rate, positions 1 to 7 / 8 to 11 | 1.18 | 0.99 (0.84) FAIL | **1.13 (0.96) PASS** | 1.20 (1.02) PASS |
| Economy, part-time / frontline | 1.08 | 1.38 (1.28) FAIL | **1.14 (1.05) PASS** | 0.92 (0.85) PASS (edge) |

### 1d. Head-to-head tactical validation

Good side's share of decided matches over 200 matches per experiment (95% Wilson interval); paired run difference per innings (95% interval).

| Experiment (poor side) | Calibrated, captain V3 | **Calibrated, captain V4** | Synthetic, captain V4 |
| --- | --- | --- | --- |
| Weakest eleven | 68.9% (62.1 to 74.9); +8.4 (4.5 to 12.3) | **68.5% (61.7 to 74.6); +9.0 (4.9 to 13.0)** | 55.8% (48.9 to 62.6); +3.3 (-0.6 to 7.2) |
| Weakest bowler first | 54.3% (47.3 to 61.1); +4.2 (0.2 to 8.2) | **54.6% (47.6 to 61.4); +3.9 (0.3 to 7.5)** | 47.2% (40.3 to 54.2); -0.5 (-4.4 to 3.3) |
| Full length, maximum effort | 48.2% (41.3 to 55.2); +0.1 | **50.5% (43.6 to 57.4); +0.6 (-3.1 to 4.3)** | 51.0% (44.1 to 57.9); +0.1 |
| Two-slip field all innings | 54.4% (47.4 to 61.2); +2.9 | **51.8% (44.8 to 58.7); +2.7 (-1.0 to 6.3)** | 55.6% (48.6 to 62.4); +3.2 |
| Aggression 4 every ball | 59.1% (52.1 to 65.7); +4.8 (0.6 to 8.9) | **57.3% (50.3 to 64.0); +3.6 (-0.1 to 7.2)** | 51.3% (44.4 to 58.1); +3.7 |
| Aggression 0 every ball | 61.9% (55.0 to 68.4); +5.9 (2.6 to 9.3) | **66.2% (59.3 to 72.4); +6.0 (2.9 to 9.0)** | 63.5% (56.5 to 69.9); +5.4 |
| Old selection rule | 66.5% (59.6 to 72.8); +7.1 (3.4 to 10.8) | **68.7% (61.9 to 74.8); +7.2 (3.8 to 10.5)** | 82.7% (76.9 to 87.4); +13.4 |
| Batting order reversed | 66.2% (59.3 to 72.4); +4.7 (0.8 to 8.6) | **67.5% (60.7 to 73.7); +5.0 (1.5 to 8.4)** | 74.1% (67.6 to 79.7); +8.3 |

**Reading the rerun:**
- Under V4, skill-based selection still decides matches with the calibrated model: 68.5%, against 55.8% for synthetic.
- Bowling the weakest bowler first now costs runs whose interval excludes zero (+3.9, from 0.3 to 7.5). The win share (54.6%) still includes 50%.
- Bowling plan and field: no measurable effect under either model.
- The synthetic column is the committed captain V4 measurement, `docs/pavilion/captain-v4/tactical-validation-v4.json`: the same harness and model, reused rather than re-run.

### 1e. First innings against the M7E targets (not tuned to) and per-point effects

| | Runs | Wickets | Dot % | Boundary % | P10 / P50 / P90 |
| --- | ---: | ---: | ---: | ---: | --- |
| M7E target | 150.6 | 7.24 | 39.3 | 14.0 | 83 / 151 / 212 |
| Calibrated, captain V3 | 106.0 | 8.01 | 60.1 | 11.3 | 72 / 107 / 138 |
| **Calibrated, captain V4** | **106.1** | **8.00** | **59.8** | **11.2** | 74 / 106 / 136 |
| Synthetic, captain V4 | 111.6 | 7.87 | 58.7 | 12.1 (within 2 points) | 79 / 112 / 144 |

All aggregates fail for the calibrated model under both captains, as before. This is outside the skill component (P04 cause C3; C4 works on the delivery mix).

**Per-point effects under captain V4** (calibrated): batter runs / boundary / non-dot 0.00922 / 0.01391 / 0.00536; bowler 0.01353 / 0.02187 / 0.00815; variation +0.0095 wickets / +0.0053 runs. **All 9 PASS**, essentially unchanged from captain V3.

## 2. Verdict summary

| Gate | Calibrated, captain V3 | Calibrated, captain V4 |
| --- | --- | --- |
| Per point (9) | 9 PASS | 9 PASS |
| Criterion 1 raw (9) | 1 PASS, 1 UNCLEAR, 7 FAIL (3 inverted) | 1 PASS, 2 UNCLEAR, 6 FAIL (0 inverted) |
| Criterion 1 adjusted (8) | 4 PASS, 4 FAIL | 2 PASS, 6 FAIL (all too flat) |
| Specialisation (3) | 0 PASS | 2 PASS (strike rate, economy), average FAIL |
| Aggregates (4) | 0 PASS | 0 PASS |

## 3. Commands and revisions

**Worktrees:**
- `/home/user/lcx-c3before`: detached at `c57dbd6`.
- `/home/user/lcx-c3rm`: branch `pavilion/stage-c-c3-remeasure` from `475ea3d`.

`npx tsc -b` exits 0 in both. The batch was 28 jobs, all exit 0.

```bash
# per condition (before in lcx-c3before, after in lcx-c3rm)
node --import tsx scripts/stage-c/c1-game-balls.ts <dir>/cal-balls-<k>.json 5 <5k> --model=calibrated-t20-01   # k = 0..3
node --import tsx scripts/pavilion-tactical-validation.ts <dir>/tv/calibrated-t20-01-<experiment>.json <experiment> --model=calibrated-t20-01
# after only: synthetic game balls under captain V4, and per-point
node --import tsx scripts/stage-c/c1-game-balls.ts <dir>/syn-balls-<k>.json 5 <5k>
bash scripts/stage-c/c2-dose.sh <dir>/dose-cal calibrated-t20-01 ; bash scripts/stage-c/c2-dose.sh <dir>/dose-syn synthetic-alpha-01
python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json --game <dir>/<model>-balls-{0,1,2,3}.json --out <dir>/<model>-analysis.json
python3 -I scripts/stage-c/c2-report.py --synthetic <synthetic analysis> --calibrated <calibrated analysis> --dose-synthetic <...> --dose-calibrated <...> \
  --fit docs/pavilion/stage-c/c2-fit.json --targets docs/pavilion/stage-c/c3-mapping.json --tactical <dir with both models' tactical files> \
  --balls-synthetic <...> --balls-calibrated <...> --out docs/pavilion/stage-c/c3rm-<before|after>-....json   # exit 0
```

**Outputs:**
- `c3rm-before-captain-v3.json` and `c3rm-after-captain-v4.json`: all gates.
- `c3rm-after-captain-v4-calibrated-analysis.json`: the full calibrated analysis under V4.

Each carries ODC-By attribution and the source SHA-256 values.

**Before-condition synthetic references:** the captain V3 synthetic files from C2 (`c1-skill-differentiation.json`, the C2 tactical runs and the C2 synthetic dose).

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.

## 4. Question for the owner

Under captain V4, the per-point gate and the adjusted quarter gate disagree in the other direction from C2. Should the next iteration fit the rating-to-skill mapping directly to the adjusted quarter ratios under captain V4, on the calibration split? The per-point check would then become a sign and range check rather than the fitting target.
