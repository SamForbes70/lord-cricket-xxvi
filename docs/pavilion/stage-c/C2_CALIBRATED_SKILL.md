# Stage C slice C2: the calibrated skill component (`calibrated-t20-01`), research only

**Status:** built and validated as research. It is not selectable in the game: no screen, set-up, career, save, UI or default can reach it. `synthetic-alpha-01` is unchanged (section 6). Nothing is marked passed; the owner accepts tolerances and measurements.

- Branch `pavilion/stage-c-research`, 25 November 2026.
- Model id `calibrated-t20-01`, pack SHA-256 `773d32f8373e99d3db98c0480ef2aa21968c549f95357cac260782bcae51bca9`.

**Owner decisions applied (25 November 2026):**
- **Engine:** option A. Only the in-memory request and context schemas widen; there is a registry keyed by model id; the research set-up is reached only through an explicit function argument.
- **Reference:** full-member men's T20 internationals.
- **Ratings:** not rescaled.
- **Variation:** carries a wicket against economy trade-off; stamina is for fatigue only.
- **Dismissal skill:** only through the measured links.

## 1. Gate results

**Game set-up for every gate:**
- 2,000 matches per model (frozen corpus seeds × 20 repeats);
- suggested elevens, and captain V3 on both sides;
- both models run on the same code.

**Real reference:** full-member men's T20 internationals.
- Calibration split: 1,001 matches. The pack was fitted to the fit period, up to 2023-08-31.
- Holdout, read once: 131 matches.

### 1a. Per-rating-point effects

These are causal: every player's skills are set to 30 and then 70, and the log change per point is reported. They are oriented so that a correct effect is positive.

| Effect | synthetic-alpha-01 | calibrated-t20-01 | Real range (fit period) | Verdict, calibrated |
| --- | ---: | ---: | --- | --- |
| Batter runs per ball | 0.013 | 0.017 | 0.015 to 0.017 | PASS |
| Batter boundary | 0.019 | 0.026 | 0.024 to 0.029 | PASS |
| Batter non-dot | 0.008 | 0.011 | 0.010 to 0.012 | PASS |
| Batter dismissal (fewer) | 0.005 | 0.003 | 0.000 to 0.024 | PASS (weak) |
| Bowler runs (fewer) | 0.002 | 0.013 | 0.012 to 0.014 | PASS |
| Bowler boundary (fewer) | 0.002 | 0.020 | 0.020 to 0.026 | PASS |
| Bowler non-dot (fewer) | 0.001 | 0.008 | 0.008 to 0.009 | PASS |
| Bowler dismissal (more) | 0.001 | 0.006 | 0.000 to 0.020 | PASS |
| Variation alone: dismissal / runs / boundary | 0 / 0 / 0 | +0.009 / +0.005 / +0.009 | trade-off required | PASS (more wickets, more runs) |

The real range runs from the lower to the higher of the point estimate and its match-bootstrap P10 to P90 interval, divided by the world-pack rating SD. Values in `c2-fit.json`.

### 1b. Criterion 1, raw: top / bottom quarter by the game's own rating

| Statistic | synthetic | calibrated | Real full members, true skill (P10 to P90); bracket | Verdict: synthetic, calibrated |
| --- | ---: | ---: | --- | --- |
| Strike rate | 1.26 | 1.34 | 1.36 (1.37 to 1.44); 1.20 to 1.39 | UNCLEAR, UNCLEAR |
| Average | 2.29 | 2.29 | none; 1.57 to 2.45 | UNCLEAR, UNCLEAR |
| Dismissal rate | 0.55 | 0.59 | 0.56 (0.57 to 0.72); 0.46 to 0.65 | UNCLEAR, **PASS** |
| Batting dot % | 0.85 | 0.84 | 0.72 (0.69 to 0.71); 0.70 to 0.79 | FAIL, FAIL |
| Batting boundary % | 1.32 | 1.44 | 1.77 (1.78 to 1.95); 1.43 to 1.80 | FAIL, UNCLEAR |
| Economy | 0.91 | 0.80 | 0.77 (0.73 to 0.77); 0.74 to 0.86 | FAIL, UNCLEAR |
| Wicket rate | 0.55 | 0.61 | 1.24 (1.00 to 1.40); 1.20 to 1.91 | FAIL, **FAIL (inverted)** |
| Bowling dot % | 0.93 | 1.00 | 1.42 (1.43 to 1.49); 1.27 to 1.45 | FAIL, **FAIL (inverted)** |
| Boundary % conceded | 0.81 | 0.67 | 0.59 (0.55 to 0.60); 0.56 to 0.69 | FAIL, UNCLEAR |

The two inversions remain because of deployment, not the model. The captain bowls the lowest-rated quarter only in overs 16 to 20 (C1 section 2). The causal per-point effects in 1a have the right sign.

### 1c. Criterion 1, adjusted for phase and opponent

| Effect, top-rated / bottom-rated quarter | synthetic | calibrated | Real full members (range) | Verdict: synthetic, calibrated |
| --- | ---: | ---: | --- | --- |
| Batter runs | 1.46 | 1.76 | 1.39 (1.39 to 1.45) | FAIL, FAIL (too steep) |
| Batter boundary | 1.72 | 2.26 | 1.68 (1.68 to 1.82) | PASS, FAIL (too steep) |
| Batter non-dot | 1.30 | 1.47 | 1.23 (1.23 to 1.27) | FAIL, FAIL (too steep) |
| Batter dismissal | 0.79 | 0.81 | 0.69 (0.67 to 1.00) | PASS, PASS |
| Bowler runs | 0.83 | 0.72 | 0.80 (0.77 to 0.80) | FAIL, FAIL (too steep) |
| Bowler boundary | 0.76 | 0.61 | 0.66 (0.61 to 0.68) | FAIL, FAIL (just) |
| Bowler non-dot | 0.89 | 0.80 | 0.86 (0.84 to 0.87) | FAIL, FAIL (too steep) |
| Bowler dismissal | 1.09 | 1.14 | 1.22 (1.00 to 1.36) | PASS, PASS |

No ratio is inverted. The calibrated model is now **too steep** where the synthetic one was too flat or close.
- The two gates disagree because of the rating-to-skill mapping. The per-point targets use the world-pack rating SD over keepers, batters and all-rounders (7.65). But the players who face 100 balls in the game span a far wider rating range (batting quarter means 134 against 283 on the four-skill score), so equal per-point effects produce a steeper quarter ratio than real.
- [Inference] Matching both gates needs a mapping fitted to the quarters of players who actually bat and bowl, which gives smaller per-point coefficients. That is the next iteration (section 5).

### 1d. Specialisation (game / real within 0.85 to 1.15)

| Ratio | Real full members | synthetic | calibrated |
| --- | ---: | --- | --- |
| Average, positions 1 to 7 / 8 to 11 | 2.25 | 1.82 (0.81) FAIL | 1.80 (0.80) FAIL |
| Strike rate, positions 1 to 7 / 8 to 11 | 1.18 | 1.19 (1.01) PASS | 1.24 (1.05) PASS |
| Economy, part-time / frontline | 1.08 | 1.12 (1.04) PASS | 1.22 (1.13) PASS |

### 1e. Tactical validation rerun

Script: `scripts/pavilion-tactical-validation.ts`. The good side's share of decided matches over 200 matches per experiment, with a 95% Wilson interval, and the paired run difference per innings with a 95% interval.

| Experiment (poor side) | synthetic-alpha-01 | calibrated-t20-01 |
| --- | --- | --- |
| Weakest eleven | 57.4% (50.4 to 64.1); +3.3 runs (-0.4 to 7.1) | **68.0% (61.2 to 74.1); +9.5 runs (5.5 to 13.5)** |
| Weakest bowler first | 48.7% (41.8 to 55.7); -0.1 (-3.8 to 3.6) | **56.3% (49.4 to 63.1); +4.0 (0.0 to 8.0)** |
| Full length, maximum effort | 51.5% (44.6 to 58.4); +0.5 (-3.4 to 4.3) | 50.3% (43.4 to 57.1); +0.4 (-3.8 to 4.6) |
| Two-slip field all innings | 55.4% (48.4 to 62.2); +3.0 (-0.8 to 6.9) | 53.5% (46.6 to 60.3); +2.4 (-2.1 to 6.8) |
| Aggression 4 every ball | 52.5% (45.6 to 59.4); +3.9 (-0.5 to 8.2) | 58.3% (51.3 to 64.9); +4.7 (0.4 to 9.1) |
| Aggression 0 every ball | 59.9% (52.9 to 66.5); +4.8 (1.7 to 7.8) | 59.6% (52.6 to 66.2); +3.9 (0.7 to 7.1) |
| Old selection rule | 81.2% (75.2 to 86.1); +13.1 (9.4 to 16.9) | 83.2% (77.4 to 87.8); +14.7 (11.0 to 18.4) |
| Batting order reversed | 72.0% (65.3 to 77.9); +7.6 (4.1 to 11.2) | 72.4% (65.8 to 78.2); +7.9 (4.0 to 11.7) |

**Reading the rerun:**
- Selection by skill now matters clearly.
- Bowler choice now matters a little; its interval just reaches 50%.
- Bowling plan and field still make no measurable difference. They are not part of the skill component.
- Aggression is about where it was. The aggression trade-off is a separate Stage C target.
- The synthetic column is a fresh run on current `main` (captain V3), so it differs slightly from `TACTICAL_VALIDATION.md` (captain V2).

### 1f. First innings against the M7E targets (not tuned to)

| | Runs | Wickets | Dot % | Boundary % | P10 / P50 / P90 runs |
| --- | ---: | ---: | ---: | ---: | --- |
| M7E holdout target | 150.6 | 7.24 | 39.3 | 14.0 | 83 / 151 / 212 |
| synthetic-alpha-01 | 111.7 | 7.89 | 58.7 | 12.1 (within 2 points) | 78 / 112 / 144 |
| calibrated-t20-01 | 106.2 | 8.02 | 60.1 | 11.4 | 70 / 107 / 140 |
| Holdout, all (read once) | 147.6 | 7.07 | 41.1 | 14.7 | 78 / 149 / 211 |
| Holdout, full members (read once) | 169.0 | 6.68 | 34.7 | 18.6 | 114 / 169 / 223 |

Both models fail the M7E aggregate targets, as expected: the skill component does not address the dot-heavy delivery model (C1, P04 cause C3).
- The calibrated model scores 5.5 runs fewer.
- [Inference] The cause is centring. The new terms are centred on world-pack means, but the bowlers the suggested eleven picks are rated above those means. That is a centring choice to revisit, not a tuned total.

### 1g. Holdout, read once, after the pack was frozen

Full members only: 131 matches, so the intervals are wide. Game values are as above. File: `c2-holdout.json`.

**Raw:**
- PASS: economy (0.80 against 0.81) and boundary % conceded (0.67 against 0.64).
- UNCLEAR: strike rate, average, dismissal rate and batting dot %.
- FAIL: batting boundary % (1.44 against 1.90).
- Inverted: wicket rate and bowling dot %, by deployment.

**Adjusted:**
- PASS: bowler boundary, batter dismissal and bowler dismissal.
- FAIL, too steep: batter runs (1.76 against 1.47), batter boundary (2.26 against 1.85), batter non-dot, bowler runs (0.72 against 0.85) and bowler non-dot.

**Specialisation:**
- Average: 0.75, FAIL.
- Strike rate: 0.98, PASS.
- Economy: 1.14, PASS.

**Dismissal on the holdout:** real dismissal-rate spread is not measurable (true SD 0), consistent with C2's finding that dismissal skill does not predict later matches.

## 2. What was built

**Contracts** (`packages/contracts/src/probability.ts`, `generator.ts`):
- `CALIBRATED_T20_MODEL_ID` and `PROBABILITY_MODEL_IDS`.
- `ProbabilityContextSchema.modelId` and `GenerateDeliveryRequestSchema.modelId` accept an explicit enum of the two ids.
- The generator request gains an optional `bowling.variationRating`. Decision 3 needs a variation rating in the engine, and the request had none. It is required for the calibrated model and refused for `synthetic-alpha-01`.
- Every persisted schema is unchanged: the set-up, match versions, replay case (`T20ReplayCaseSchema` keeps its literal), the probability pack and the saves.

**Pack** (`packages/data/src/calibrated-t20-pack.ts`):
- Additive skill terms on top of the unchanged `synthetic-alpha-01` packs, with pinned SHA-256, `RESEARCH_ONLY` and `gameplayIntegrationPermitted: false`.
- Each term is a coefficient on `(rating - centre) x 200` bp, with the centre at the world-pack mean of the skill.

| Stage, category | Terms (bp) |
| --- | --- |
| Contact MISS | control +3,000 |
| Contact AERIAL, EDGE | variation +8,000 (wicket chances and boundaries: the trade-off) |
| Runs 0 | control +6,000, rotation -2,000 |
| Runs 4 and 6 | timing +2,000, power +2,000, control -8,000, movement -8,000, variation +3,000 |
| Bowled, lbw | synthetic-alpha-01's control and defence terms cancelled exactly (decision 2) |

**Registry and engine:**
- Registry: `packages/simulation/src/model-registry.ts`. It verifies the pack hash at load.
- Probability service: accepts registered id and hash pairs and echoes them.
- Generator: adds the pack's terms only when the model has a skill pack.
- T20 engine: reads the model from `setup.versions.model` and `versions.modelHash`.
- Research entry point: `validateT20ResearchMatchSetup(request, worldBytes, manifest, "calibrated-t20-01")` is the only way in. `modelStatus` stays `SYNTHETIC_ALPHA`, because that set-up type is a persisted literal.
- A calibrated session cannot be rehydrated: rehydration goes through `validateT20MatchSetup`.

**Fit:**
- `scripts/stage-c/c2-fit.py` gives the targets.
- The coefficients were matched to the per-point targets over three dose-response iterations (`scripts/stage-c/c2-dose.sh`), fit period only.
- The holdout was not read until section 1g.

**Tests:** `tests/unit/stage-c-calibrated-model.test.ts`, 9 tests covering the registry, the pack, the generator guards, the research set-up, and calibrated determinism and difference.

## 3. Schema mirrors that changed

Regenerated with `node --import tsx scripts/generate-schemas.ts`. All five are in-memory request or context schemas:

| File | Change |
| --- | --- |
| `GenerateDeliveryRequestSchema.json` | `modelId` const becomes an enum of the two ids; optional `bowling.variationRating` (integer 0 to 100) |
| `ProbabilityContextSchema.json` | `modelId` const becomes the enum |
| `NormaliseCategoriesRequestSchema.json` | same (extends the context) |
| `SampleCategoryRequestSchema.json` | same (extends the context) |
| `ProbabilityRequestSchema.json` | same, in both union members |

- `packages/persistence` references none of them (`grep`, re-confirmed).
- `apps/web/src/determinism.worker.ts` forwards in-memory probability requests only. The game sends only `synthetic-alpha-01`.
- All five files are among the hashes recorded in the historical Pass 07A inventory (`tests/fixtures/t20/pass07a-inventory.json`), so they now differ from it.
- That inventory's check (`npm run t20:inventory`) already exits 1 on `main` `4e29882`. `package-lock.json` drifts, and the check expects 98 schema files where `main` has 409. It is not in CI.
- The inventory file itself is unchanged.

## 4. Data and reproduction

**Data:**
- Cricsheet `t20s_json.zip`, archive SHA-256 `956f29df9d2b95dd6fe12de5bc70d4522f23693e5e7e2ac4c1a004e1b541ad8e`, licence SHA-256 `11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b`.
- Raw files are outside the repository.

```bash
python3 -I scripts/stage-c/c2-fit.py --real /home/user/lcx-data/c1-real-calibration-balls.json --out docs/pavilion/stage-c/c2-fit.json
node --import tsx scripts/stage-c/c2-pin-pack.ts            # prints the pinned pack hash
bash scripts/stage-c/c2-dose.sh /home/user/lcx-data/c2-dose-calibrated calibrated-t20-01
bash scripts/stage-c/c2-dose.sh /home/user/lcx-data/c2-dose-synthetic synthetic-alpha-01
for k in 0 1 2 3; do node --import tsx scripts/stage-c/c1-game-balls.ts /home/user/lcx-data/c2-game-balls-$k.json 5 $((k*5)) --model=calibrated-t20-01 & done; wait
node --import tsx scripts/pavilion-tactical-validation.ts <out.json> <experiment> --model=calibrated-t20-01   # per experiment, both models
python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c1-real-calibration-balls.json --game /home/user/lcx-data/c2-game-balls-{0,1,2,3}.json --out docs/pavilion/stage-c/c2-skill-differentiation.json
python3 -I scripts/stage-c/c2-report.py --synthetic docs/pavilion/stage-c/c1-skill-differentiation.json --calibrated docs/pavilion/stage-c/c2-skill-differentiation.json \
  --dose-synthetic <synthetic per-point.json> --dose-calibrated <calibrated per-point.json> --fit docs/pavilion/stage-c/c2-fit.json \
  --tactical <tactical dir> --balls-synthetic <c1 game balls> --balls-calibrated <c2 game balls> --out docs/pavilion/stage-c/c2-report.json
# holdout, once:
python3 -I scripts/stage-c/c1-real-extract.py ... --split holdout --balls /home/user/lcx-data/c2-holdout-balls.json
python3 -I scripts/stage-c/c1-analyse.py --real /home/user/lcx-data/c2-holdout-balls.json --game <c2 game balls> --out /home/user/lcx-data/c2-holdout-analysis.json
python3 -I scripts/stage-c/c2-holdout.py --analysis ... --holdout-balls ... --report docs/pavilion/stage-c/c2-report.json --out docs/pavilion/stage-c/c2-holdout.json
```

**Outputs:** `c2-fit.json`, `c2-skill-differentiation.json`, `c2-report.json` and `c2-holdout.json`, each with ODC-By attribution and the SHA-256 values.
- `c1-skill-differentiation.json` was regenerated with one addition, the full-member adjusted bootstrap. Every other value is unchanged (checked by comparison).
- The new `--model=` flag (default `synthetic-alpha-01`) was added to `c1-game-balls.ts`, `c1-game-dose-response.ts` and `scripts/pavilion-tactical-validation.ts`. Their outputs without the flag are unchanged.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.

## 5. Findings and next steps

1. **The skill component works where it was aimed.**
   - Causal per-point effects are inside the real range for all eight effects.
   - The variation trade-off is present.
   - Skill-driven selection now decides matches (weakest eleven 68%, against 57% before).
   - Bowler choice now registers.
2. **It overshoots on the quarter-ratio test (1c).**
   - Next step: fit the rating-to-skill mapping to the rated spread of the players who actually bat and bowl, rather than the world-pack SD, on the fit period. Then re-check 1a and 1c together.
   - [Inference] That would roughly halve the batting coefficients.
3. **Raw wicket-rate and bowling-dot inversions** come from the captain's deployment. The fix is in the captain's bowling plan, not the model.
4. **Batting dot %, average by position, and all aggregates** are outside the skill component. They belong to the delivery-model work (P04 cause C3) and the aggression trade-off.

## 6. Proof that synthetic-alpha-01 is unchanged

The working tree was verified before the commit, on base `e144b76`, with `NODE_OPTIONS=--max-old-space-size=4096`. All exit 0:
- `npx tsc -b`
- `npm run lint`
- `npm run schemas:check`
- `npx vite build --config apps/web/vite.config.ts`
- `npm run fixtures:audit`
- `npm run fixtures:engine`
- `npm run vectors:check`
- `npm run probability:check`
- `npm run generator:check`
- `npm run red5:fixtures`
- `npm run offscreen:fixtures`
- `npm run projection:fixtures`
- `npm run season:persistence:fixtures`
- `npm test`: 123 test files, 1,031 tests passed

**Files that must not change:** `git status` shows no change to any fixture, golden vector, replay, checksum file, world pack, `probability-pack.ts`, `delivery-pack.ts` or persistence code.

**NOT RUN:** `npm run verify:07b` (it rewrites tracked evidence files and needs browsers) and the browser suites.
