# Stage C slice C3: rating-to-skill mapping from the players who actually play (research only)

**Status:** research only. `calibrated-t20-01` stays unselectable in the game, and `synthetic-alpha-01` is unchanged (section 5). Nothing is marked passed.

**What changed from C2.** The owner decided, on 25 November 2026, to fit the rating-to-skill mapping to the players who actually bat and bowl in the game. C2 used the world's whole rating spread. Nothing else changed:
- no centring on the selected elevens;
- no rescaling of world ratings;
- the full-member reference, the variation trade-off and the measured-links-only dismissal rule all stay;
- fit period up to 2023-08-31, selection period 2023-09-01 to 2025-08-24;
- the holdout, read once in C2, was not used.

**Pack:** `LC_CALIBRATED_T20_SKILL_V2`, SHA-256 `90ba2058f2d664258cc1d3f8b19109d2a99c0adf97f9757829240ebc00e6ffc5`. Sections 1 to 5 record V2.

## Revision V3: batting aimed at the upper end of the real range

**Status:** per-point gates re-run, 9 of 9 PASS. The adjusted, raw, specialisation and tactical gates are **NOT RUN, pending captain V4 (#146)**.

**Why a new version.** V2 is already consumed: it is published in PR #145, and `c3-report.json`, `c3-skill-differentiation.json` and the tactical runs below were produced with it. So the revision is a new version, `LC_CALIBRATED_T20_SKILL_V3`, SHA-256 `8e7768676be4fa31cbfb77d1aea7bd62c91267d3ab0e17e3862751a1a26b20f0`, under the same research-only model id `calibrated-t20-01`. V2's files stay as V2's record.

**Owner decision.** Aim the batting per-point effect at the upper end of the measured real range. The same targets are used (`c3-mapping.json`: fit period, full-member reference, quarters of the game's regular players). Only the calibration split was used; the holdout was not.

| Per-point effect (oriented) | Real range | V2 (position in range) | **V3 (position in range)** | V3 verdict |
| --- | --- | ---: | ---: | --- |
| Batter runs | 0.00778 to 0.00923 | 0.00899 (83%) | **0.00917 (96%)** | PASS |
| Batter boundary | 0.01272 to 0.01551 | 0.01279 (3%) | **0.01380 (39%)** | PASS |
| Batter non-dot | 0.00516 to 0.00615 | 0.00563 (48%) | **0.00536 (20%)** | PASS |
| Batter dismissal (fewer) | 0 to 0.01263 | 0.00482 | **0.00454** | PASS |
| Bowler runs (fewer) | 0.01195 to 0.01458 | 0.01358 | **0.01354** | PASS |
| Bowler boundary (fewer) | 0.02119 to 0.02698 | 0.02173 | **0.02185** | PASS |
| Bowler non-dot (fewer) | 0.00801 to 0.00965 | 0.00824 | **0.00816** | PASS |
| Bowler dismissal (more) | 0 to 0.0206 | 0.00636 | **0.00629** | PASS |
| Variation trade-off: wickets / runs | both positive | +0.0095 / +0.0054 | **+0.0093 / +0.0054** | PASS |

**The three batting targets pull against each other.** Batter runs is now at the top of its range. That bound is what stops the boundary effect going higher.
- In the real data, nearly all of a better batter's extra runs come from boundaries, not singles.
- In this model, raising the boundary effect further raises runs per ball past 0.00923.
- Trading singles for boundaries (iterations 5 and 6) pushed non-dot below its floor.
- V3 therefore sits at 96% of the runs range, 39% of the boundary range and 20% of the non-dot range.

**Terms changed from V2** (bp, on `(rating - world mean) x 200`):

| Stage, category | V2 | V3 |
| --- | --- | --- |
| Runs 0 | control +6,000, rotation +2,600 | control +6,000, rotation **+3,000** |
| Runs 4 and 6 | timing -1,300, power -1,300 (bowling terms as V2) | timing **-800**, power **-800** (bowling terms unchanged) |
| Contact | as C2 | unchanged |

**Search.** Five dose-response iterations, numbered 5 to 9 after V2's four:

| Iteration | Change | Result |
| ---: | --- | --- |
| 5 | single -2,000, boundary +200 | overshoot: boundary 0.0193, non-dot 0.0038 |
| 6 | single -1,200, boundary -300 | still over |
| 7 | no single term, boundary -400, rotation 3,700 | non-dot 0.0049, below its floor |
| 8 | boundary -700, rotation 3,000 | runs 0.00924, just over |
| 9 | boundary -800 | V3 |

**Commands** (on `ab70a31` plus this revision, pack hash `8e776867...`):

```bash
node --import tsx scripts/stage-c/c2-pin-pack.ts --write   # prints 8e7768676be4fa31cbfb77d1aea7bd62c91267d3ab0e17e3862751a1a26b20f0
bash scripts/stage-c/c2-dose.sh /home/user/lcx-data/c3-dose-it9 calibrated-t20-01   # exit 0
python3 -I scripts/stage-c/c3-per-point-gate.py --dose /home/user/lcx-data/c3-dose-it9/per-point.json \
  --mapping docs/pavilion/stage-c/c3-mapping.json --pack-version LC_CALIBRATED_T20_SKILL_V3 \
  --pack-sha256 8e7768676be4fa31cbfb77d1aea7bd62c91267d3ab0e17e3862751a1a26b20f0 --out docs/pavilion/stage-c/c3-v3-per-point.json   # exit 0
```

`c3-v2-per-point.json` records V2 on the same gate script, using V2's iteration-4 dose run, for comparison.

**NOT RUN, pending captain V4 (#146):**
- criterion 1 adjusted and raw;
- specialisation;
- the tactical validation rerun;
- first-innings aggregates.

Those gates depend on the captain's bowler deployment. They are re-run once #146 is merged.

## 1. Gate results

**Game:** 2,000 matches (frozen corpus seeds × 20 repeats), suggested elevens, captain V3 on both sides.

**Real reference:** full-member men's T20 internationals, calibration split.

The `synthetic-alpha-01` column is unchanged from C2.

### 1a. Per-rating-point effects

These are causal: every player's skills are set to 30 and then 70. Effects are oriented so that a correct effect is positive. The target ranges are new in C3 (section 2).

| Effect | synthetic | C2 calibrated | **C3 calibrated** | C3 real range | C3 verdict |
| --- | ---: | ---: | ---: | --- | --- |
| Batter runs | 0.013 | 0.017 | **0.009** | 0.0078 to 0.0092 | PASS |
| Batter boundary | 0.019 | 0.026 | **0.013** | 0.0127 to 0.0155 | PASS (edge) |
| Batter non-dot | 0.008 | 0.011 | **0.006** | 0.0052 to 0.0061 | PASS |
| Batter dismissal (fewer) | 0.005 | 0.003 | **0.005** | 0 to 0.013 | PASS |
| Bowler runs (fewer) | 0.002 | 0.013 | **0.014** | 0.0119 to 0.0146 | PASS |
| Bowler boundary (fewer) | 0.002 | 0.020 | **0.022** | 0.0212 to 0.027 | PASS |
| Bowler non-dot (fewer) | 0.001 | 0.008 | **0.008** | 0.0080 to 0.0097 | PASS |
| Bowler dismissal (more) | 0.001 | 0.006 | **0.006** | 0 to 0.021 | PASS |
| Variation alone: dismissal / runs | 0 / 0 | +0.009 / +0.005 | **+0.010 / +0.005** | trade-off | PASS |

### 1b. Criterion 1, adjusted for phase and opponent (top-rated / bottom-rated quarter)

| Effect | synthetic | C2 | **C3** | Real full members (range) | C3 verdict |
| --- | ---: | ---: | ---: | --- | --- |
| Batter runs | 1.46 | 1.76 | **1.35** | 1.39 (1.39 to 1.45) | FAIL, just too flat |
| Batter boundary | 1.72 | 2.26 | **1.55** | 1.68 (1.68 to 1.82) | FAIL, too flat |
| Batter non-dot | 1.30 | 1.47 | **1.22** | 1.23 (1.23 to 1.27) | FAIL, by 0.006 |
| Batter dismissal | 0.79 | 0.81 | **0.82** | 0.69 (0.67 to 1.00) | PASS |
| Bowler runs | 0.83 | 0.72 | **0.79** | 0.80 (0.77 to 0.80) | **PASS** |
| Bowler boundary | 0.76 | 0.61 | **0.69** | 0.66 (0.61 to 0.68) | FAIL, just too flat |
| Bowler non-dot | 0.89 | 0.80 | **0.86** | 0.86 (0.84 to 0.87) | **PASS** |
| Bowler dismissal | 1.09 | 1.14 | **1.13** | 1.22 (1.00 to 1.36) | PASS |

No ratio is inverted. C2 overshot every runs, boundary and non-dot ratio; C3 lands within 0.01 to 0.14 of the real range on each, but in two cases just on the flat side.
- 4 of 8 pass, against 2 of 8 in C2.
- [Inference] The quarter-gap mapping slightly underestimates the batting targets. The per-point effects sit in the lower half of their ranges, so aiming at the upper end would close most of the remaining batting gap.

### 1c. Criterion 1, raw (as measured; not adjusted for the captain's deployment)

| Statistic | synthetic | C2 | **C3** | Real full members, true skill (P10 to P90); bracket | C3 verdict |
| --- | ---: | ---: | ---: | --- | --- |
| Strike rate | 1.26 | 1.34 | **0.98** | 1.36 (1.37 to 1.44); 1.20 to 1.39 | **FAIL (inverted)** |
| Average | 2.29 | 2.29 | 1.67 | none; 1.57 to 2.45 | UNCLEAR |
| Dismissal rate | 0.55 | 0.59 | 0.59 | 0.56 (0.57 to 0.72); 0.46 to 0.65 | PASS |
| Batting dot % | 0.85 | 0.84 | 0.94 | 0.72 (0.69 to 0.71); 0.70 to 0.79 | FAIL |
| Batting boundary % | 1.32 | 1.44 | **0.92** | 1.77 (1.78 to 1.95); 1.43 to 1.80 | **FAIL (inverted)** |
| Economy | 0.91 | 0.80 | 0.68 | 0.77 (0.73 to 0.77); 0.74 to 0.86 | FAIL (too steep) |
| Wicket rate | 0.55 | 0.61 | 0.62 | 1.24 (1.00 to 1.40); 1.20 to 1.91 | FAIL (inverted) |
| Bowling dot % | 0.93 | 1.00 | 1.06 | 1.42 (1.43 to 1.49); 1.27 to 1.45 | FAIL |
| Boundary % conceded | 0.81 | 0.67 | 0.52 | 0.59 (0.55 to 0.60); 0.56 to 0.69 | FAIL (too steep) |

**Why raw batting is newly inverted** (measured on the C3 run):

| Batters by rating | Strike rate | Balls in overs 16 to 20 | Mean bowling score of bowlers faced | Strike rate: powerplay / middle / death |
| --- | ---: | ---: | ---: | --- |
| Bottom quarter | 88.3 | 70% | 177 | 73.3 / 67.7 / 97.0 |
| Top quarter | 86.9 | 5% | 201 | 82.9 / 86.9 / 127.2 |

- Within every phase the top quarter outscores the bottom quarter, and the adjusted ratio is 1.35.
- The raw inversion comes from the mix of conditions. Tail-end batters bat mostly at the death, against the weakest bowlers, because the captain saves them for those overs. C3's stronger bowling effect makes those overs dearer.
- The same deployment makes the raw bowling ratios too steep (economy 0.68) or inverted (wicket rate).
- The captain fix on the separate branch is expected to remove this. [Inference] Not measured here, as instructed.

### 1d. Specialisation (game / real within 0.85 to 1.15)

| Ratio | Real full members | synthetic | C2 | **C3** |
| --- | ---: | --- | --- | --- |
| Average, positions 1 to 7 / 8 to 11 | 2.25 | 0.81 FAIL | 0.80 FAIL | **0.62 FAIL** |
| Strike rate, positions 1 to 7 / 8 to 11 | 1.18 | 1.01 PASS | 1.05 PASS | **0.83 FAIL** |
| Economy, part-time / frontline | 1.08 | 1.04 PASS | 1.13 PASS | **1.29 FAIL** |

All three fail. Each has the same deployment cause as 1c: positions 8 to 11 and part-time bowlers are concentrated in the death overs.

### 1e. Tactical validation rerun

Good side's share of decided matches (95% Wilson interval); paired run difference per innings (95% interval).

| Experiment (poor side) | synthetic | C2 | **C3** |
| --- | --- | --- | --- |
| Weakest eleven | 57.4% (50.4 to 64.1); +3.3 | 68.0% (61.2 to 74.1); +9.5 | **67.7% (60.9 to 73.8); +9.1 (5.2 to 12.9)** |
| Weakest bowler first | 48.7% (41.8 to 55.7); -0.1 | 56.3% (49.4 to 63.1); +4.0 | **53.8% (46.8 to 60.7); +3.7 (-0.3 to 7.7)** |
| Full length, maximum effort | 51.5%; +0.5 | 50.3%; +0.4 | 48.7% (41.7 to 55.7); +0.2 (-3.9 to 4.3) |
| Two-slip field all innings | 55.4%; +3.0 | 53.5%; +2.4 | 55.6% (48.6 to 62.4); +3.1 (-1.1 to 7.2) |
| Aggression 4 every ball | 52.5%; +3.9 | 58.3%; +4.7 | 57.1% (50.1 to 63.9); +4.8 (0.6 to 9.0) |
| Aggression 0 every ball | 59.9%; +4.8 | 59.6%; +3.9 | 62.6% (55.7 to 69.1); +6.2 (3.0 to 9.4) |
| Old selection rule | 81.2%; +13.1 | 83.2%; +14.7 | **66.1% (59.2 to 72.5); +6.9 (3.2 to 10.6)** |
| Batting order reversed | 72.0%; +7.6 | 72.4%; +7.9 | **67.5% (60.7 to 73.7); +4.6 (0.7 to 8.5)** |

**Reading the rerun:**
- Choosing the weakest eleven still loses clearly (68%).
- Bowler choice weakens to an unclear effect (54%; its interval includes 50%).
- Batting-related choices matter less than in C2, because the batting slope is now about half: old selection rule 66% against 83%, reversed order 68% against 72%.
- Bowling plan and field: still no effect. Aggression: unchanged.

### 1f. First innings against the M7E targets (not tuned to)

| | Runs | Wickets | Dot % | Boundary % |
| --- | ---: | ---: | ---: | ---: |
| M7E target | 150.6 | 7.24 | 39.3 | 14.0 |
| synthetic-alpha-01 | 111.7 | 7.89 | 58.7 | 12.1 |
| C2 calibrated | 106.2 | 8.02 | 60.1 | 11.4 |
| **C3 calibrated** | **106.1** | **8.01** | **60.1** | **11.3** |

All fail, as in C2. The skill component does not address the dot-heavy delivery model.

## 2. The mapping

**Game side** (`c3-mapping.json`):
- Batters with at least 100 balls faced and bowlers with at least 100 legal balls, under captain V3.
- Quartered by the game's batting score and bowling score.
- Top-minus-bottom quarter-mean gap: **37.2 points a batting skill** (scores 134 against 283) and **18.6 points a bowling skill** (157 against 213).
- The same players appear in both models' runs.

**Real side:**
- The fit-period full-member true relative SD with its match-bootstrap P10 to P90 (`c2-fit.json`).
- Quarter log ratio: ln((1 + 1.271 SD) / (1 - 1.271 SD)).
- Target per point = that log ratio divided by the game gap.

**Effect on the targets:**
- Batting halves against C2 (runs 0.0148 to 0.0078 a point), because the game's regular batters span far more rating than the world SD implied (tail-end bowlers bat).
- Bowling barely moves (runs 0.0116 to 0.0120).

**Refit.**
- Four dose-response iterations on the fit-period targets only.

| Stage, category | Terms (bp, on `(rating - world mean) x 200`) |
| --- | --- |
| Runs 0 | control +6,000, **rotation +2,600** |
| Runs 4 and 6 | **timing -1,300, power -1,300**, control -9,000, movement -9,000, variation +3,000 |
| Contact | unchanged from C2 |

- The batting terms are negative: `synthetic-alpha-01`'s own batting terms (timing and power +4,000 and +5,000 on boundaries, rotation -3,000 on dots) are already steeper than real.
- The net batting effect per point is still positive (1a). Net rotation is about -400 bp on dots, still the right sign.

## 3. Files

**Changed:**
- `packages/data/src/calibrated-t20-pack.ts`: version V2, new terms and a new pinned hash.
- `scripts/stage-c/c2-report.py`: a `--targets` option.

**New:**
- `scripts/stage-c/c3-mapping.py`;
- `docs/pavilion/stage-c/c3-mapping.json`, `c3-skill-differentiation.json` and `c3-report.json` (ODC-By attribution and SHA-256 values);
- this page.

```bash
python3 -I scripts/stage-c/c3-mapping.py --synthetic-analysis docs/pavilion/stage-c/c1-skill-differentiation.json \
  --calibrated-analysis docs/pavilion/stage-c/c2-skill-differentiation.json --fit docs/pavilion/stage-c/c2-fit.json --out docs/pavilion/stage-c/c3-mapping.json
node --import tsx scripts/stage-c/c2-pin-pack.ts --write
bash scripts/stage-c/c2-dose.sh /home/user/lcx-data/c3-dose-it4 calibrated-t20-01
for k in 0 1 2 3; do node --import tsx scripts/stage-c/c1-game-balls.ts /home/user/lcx-data/c3-game-balls-$k.json 5 $((k*5)) --model=calibrated-t20-01 & done; wait
node --import tsx scripts/pavilion-tactical-validation.ts <out.json> <experiment> --model=calibrated-t20-01
python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json --game /home/user/lcx-data/c3-game-balls-{0,1,2,3}.json --out docs/pavilion/stage-c/c3-skill-differentiation.json
python3 -I scripts/stage-c/c2-report.py ... --targets docs/pavilion/stage-c/c3-mapping.json --out docs/pavilion/stage-c/c3-report.json
```

The C2 artefacts (`c2-report.json`, `c2-holdout.json`, `c2-skill-differentiation.json`) are kept as C2's record. Their pack was V1, hash `773d32f8…`.

**Holdout:** not used for any choice, and not looked at again in C3.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.

## 4. Findings

1. **Per point:** the mapping fix removes C2's overshoot, and all eight per-point effects are inside the C3 ranges.
2. **Adjusted:** both bowler non-boundary ratios now pass. Batting and bowler boundary ratios are just on the flat side; aiming at the upper end of the batting per-point ranges should close most of the batting gap.
3. **Raw and specialisation:** these now fail through the captain's deployment of tail-end batters and weak bowlers at the death. Re-measure once the captain fix lands.
4. **Tactics:** selection by skill still decides matches. Bowler choice is weaker than in C2 and not clearly non-zero.

## 5. Proof that synthetic-alpha-01 is unchanged

The working tree was verified before the commit, on base `009e52a`, with `NODE_OPTIONS=--max-old-space-size=4096`:

| Command | Exit |
| --- | ---: |
| `npx tsc -b` | 0 |
| `npm run lint` | 0 |
| `npm run schemas:check` | 0 |
| `npx vite build --config apps/web/vite.config.ts` | 0 |
| `npm run fixtures:audit` | 0 |
| `npm run fixtures:engine` | 0 |
| `npm run vectors:check` | 0 |
| `npm run probability:check` | 0 |
| `npm run generator:check` | 0 |
| `npm run red5:fixtures` | 0 |
| `npm run offscreen:fixtures` | 0 |
| `npm run projection:fixtures` | 0 |
| `npm run season:persistence:fixtures` | 0 |
| `npm test` (123 files, 1,031 tests passed) | 0 |

No fixture, golden vector, replay, checksum, world pack, `probability-pack.ts`, `delivery-pack.ts`, schema mirror or persistence file changed in C3 (`git status`).

**NOT RUN:** `npm run verify:07b` (it rewrites tracked evidence files and needs browsers) and the browser suites.
