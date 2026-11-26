# Stage C slice C4: the delivery outcome mix (research only)

**Status:** research only. `calibrated-t20-01` stays unselectable in the game. `synthetic-alpha-01`, the live game, replays, saves and persisted formats are unchanged (section 7). No acceptance gate is claimed as passed. The owner accepts results.

**Why.** Studio Production Directive 01 (26 November 2026) puts first: "Complete Stage C empirical calibration, addressing excessive dot balls, low scoring, skill differentiation, tactical effectiveness and unrealistic bowling deployment." C3 (#145) dealt with skill differentiation. C3 section 1f showed the delivery model was still far too dot-heavy: 60.1% dots and 106 runs a first innings.

**What C4 adds.**
- A new versioned delivery-outcome component, `LC_CALIBRATED_T20_DELIVERY_V1` (`packages/data/src/calibrated-t20-delivery-pack.ts`), SHA-256 `baf16852b40bb6b348d48d38dedff192572383ede64126dafbd0b4e8984b3c9c`. Only `calibrated-t20-01` reads it.
- A skill pack revision, `LC_CALIBRATED_T20_SKILL_V4`, SHA-256 `4fa5d84597d105afdae72dc4d0681a7b883055824bfe449a342a82d3ef4fe43e`. It keeps the C3 per-point gates passing at the new dot level (section 5). V3 (`8e776867...`) stays the record of the C3 gate files.
- The calibrated model hash now covers both components: SHA-256 of `{ deliveryPackSha256, skillPackSha256 }`, `27090e93a46178d1f2d4569ab7f773f0f2c007a1f4e96db1ee3dffeb6504c7a8`. A research set-up records it in `versions.modelHash`.

There is no run multiplier and no forced outcome. Every value is a parameter of an existing branch of the delivery model.

## 1. Method

**Game side.** `scripts/stage-c/c4-delivery-balls.ts` plays the C3 set-up: the frozen 100-seed corpus, suggested elevens, the tactical captain on both sides, repeats 0 to 19 (2,000 matches). For each delivery it records the bat-contact branch (no contact, ground, aerial, edge), the field outcome, runs, dismissal kind, and the striker's aggression and intent at the time. With `--aggression=k` every batting plan is replaced by aggression k (both sides, every ball), for the aggression trade-off (200 matches a level).

**Real side.** Men's T20 internationals between two full members, first innings, from the calibration-split table that C1 extracted (`c1-real-extract.py`, dates up to 2025-08-24). It is split into:
- fit period: up to 2023-08-31 (835 innings), used to set values;
- selection period: 2023-09-01 to 2025-08-24 (166 innings), used to choose between candidates.

The holdout (2025-08-30 onward) was not read. The M7E targets quoted in the brief come from the holdout era; they appear below for reference only and informed no choice.

**Definitions** (as `c2-report.py`): a dot is a legal ball with no run of any kind; a boundary ball is a legal ball with 4 or 6 off the bat; phases are overs 1 to 6, 7 to 15 and 16 to 20. Per-ball mixes below exclude wicket balls from "dot".

**Analysis.** `scripts/stage-c/c4-analyse.py` writes `c4-before.json` and `c4-after.json`.

**Limit of the comparison.** Cricsheet does not record whether a ball was missed, defended, hit along the ground or in the air. So the real side gives outcome mixes only. The game's contact shares cannot be checked against real data. [Inference] The split between "fewer false shots" and "more singles from shots along the ground" is a modelling choice, not a measured one.

## 2. Where the dots and wickets came from (before)

**Before** = `LC_CALIBRATED_T20_SKILL_V3`, no delivery pack (C3 as merged in #145), 2,000 matches.

### 2a. Dots by branch (first innings, share of legal balls)

| Branch | Share of balls | Dot rate in branch | Dots per legal ball | Share of all dots |
| --- | ---: | ---: | ---: | ---: |
| No contact (miss, pad) | 18.9% | 93.1% | 17.6% | 33% |
| Ground shot | 51.9% | 52.6% | 27.3% | 51% |
| Aerial shot | 22.3% | 22.3% | 5.0% | 9% |
| Edge | 7.0% | 47.2% | 3.3% | 6% |
| **Total** | | | **53.1%** | |

The game never plays no shot: `attemptedStroke` is always true, so leaves fall in "no contact". There is no separate "defended" branch either; a defensive stroke is a ground shot.

**The largest single source is the ground shot.** Half of all balls were hit along the ground, and over half of those were dots. A covered ground shot added +5,000 bp of logit to a dot, and nearly every sector is covered by a ring fielder. A ground shot was worth 0.72 runs.

### 2b. Wickets by branch

| Branch | Wicket rate in branch | Share of wickets |
| --- | ---: | ---: |
| No contact (bowled, lbw) | 3.9% | 10.6% |
| Ground shot (run out) | 0.1% | 0.7% |
| Aerial shot (caught) | 16.2% | 51.7% |
| Edge (caught) | 37.1% | 37.0% |

Dismissal kinds, before against real (fit period): caught 88.5% against 63.9% (with caught and bowled); bowled 8.1% against 18.3%; lbw 1.7% against 6.7%; run out 0.9% against 8.3%; stumped 0.1% against 2.7%.

**Attacking cost too much.** An aerial shot was out 16.2% of the time and an edge 37.1%.

### 2c. The aggression trade-off (before)

Forced aggression for every ball, first innings:

| Aggression | Runs | Wickets | Dot % | Boundary % | Runs per ball | Wickets per ball |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 93.6 | 3.77 | 60.1 | 8.2 | 0.761 | 0.0314 |
| 1 | 97.3 | 5.14 | 61.1 | 9.2 | 0.798 | 0.0433 |
| 2 | 101.3 | 6.75 | 61.9 | 10.5 | 0.849 | 0.0580 |
| 3 | 102.1 | 8.23 | 62.9 | 11.8 | 0.902 | 0.0744 |
| 4 | 102.7 | 9.15 | 62.8 | 13.5 | 0.977 | 0.0889 |

- Each level bought about 0.04 to 0.08 runs a ball and cost 0.29 to 0.32 wickets for each extra run (0.19 from 3 to 4).
- Full attack scored only 9 runs more than full defence, and lost 5.4 more wickets.
- Dots rose with aggression, because each level added misses and edges (+2,500 bp each) as well as aerial shots.

Real reference for the trade-off: from the middle overs to the death, real first innings add 0.126 (fit) and 0.155 (selection) wickets a ball for each extra run a ball. [Inference] This is a phase comparison, not a controlled one: the field, the bowlers and the batters change too. It is the only real yardstick available without ball-tracking data.

## 3. The change: `LC_CALIBRATED_T20_DELIVERY_V1`

Each item is a parameter of an existing branch, for `calibrated-t20-01` only.

| Branch | synthetic-alpha-01 (unchanged) | Delivery V1 |
| --- | --- | --- |
| Contact, by phase | baseline weights, no phase term | additive intercepts: powerplay miss and pad +1,000, aerial -4,500, edge -2,000; middle miss and pad -5,000, edge -3,300; death miss and pad -13,000, aerial -4,500, edge -3,300 |
| Contact, per aggression level | miss +2,500, edge +2,500, aerial +4,500, ground -1,500 | miss and edge each -1,500 (net +1,000), hit wicket -1,000; aerial and ground unchanged |
| Run value after a ground shot (0, 1, 2, 3, 4, 6) | 4,400, 3,600, 900, 100, 1,000, 0 | 1,450, 5,900, 1,300, 60, 2,900, 0 |
| After an aerial shot | 1,800, 1,600, 900, 100, 2,400, 3,200 | 1,500, 1,600, 900, 100, 2,000, 3,800 |
| After an edge | 6,000, 1,300, 300, 0, 2,400, 0 | 4,500, 2,300, 500, 0, 2,400, 0 |
| Field coverage on run value | one depth-blind term: dot +5,000, boundary -7,000 | two terms. Ring cover: dot +8,000, single -4,000, two and three -6,000, four -2,000, six -5,000. Deep cover: dot -8,000, single +3,000, two +5,000, four and six -20,000 |
| Aggression on run value (ground and aerial) | none | dot -1,000, four and six +1,000 per level |
| Catch chance when covered | aerial 3,000, edge 4,500 | aerial 2,000, edge 3,000 |
| Dismissal intercepts | bowled -35,000, lbw -40,000, run out -65,000 | bowled -25,000, lbw -28,000, run out -52,000 |

**Field coverage.** Ring and deep cover use the existing positional and depth weights of `DELIVERY_STAGE_PACK` unchanged (`calibratedFieldCover` in `packages/simulation/src/generator.ts`). The chosen fielder for catches and run outs is unchanged. A ring fielder saves the single. A boundary rider gives the single or two but saves the four. The powerplay field (two out) and the later field (four out) now give different run values without any phase term on runs.

**Aggression.** Attacking still mainly turns ground shots into aerial ones. It now costs fewer extra misses and edges, and a harder-hit shot is a little less often a dot and more often a boundary.

**Fitting.** Ten hand iterations of 400 matches each, against the fit-period per-ball mix by phase (section 8). Iterations 9 and 10 are the only ones with skill pack V4 (iterations 1 to 8 used V3, and iteration 8 failed two per-point gates). Iteration 10 had the smaller distance on the selection period and was chosen.

## 4. Before and after (first innings, 2,000 matches each)

### 4a. Totals and mix

| | Runs | Wickets | Dot % | Boundary % | P10 / P50 / P90 runs |
| --- | ---: | ---: | ---: | ---: | --- |
| Real, fit period (835 innings) | 158.9 | 6.40 | 35.3 | 15.7 | 118 / 160 / 202 |
| Real, selection period (166 innings) | 166.0 | 6.87 | 37.2 | 17.9 | 110 / 172 / 219 |
| M7E (holdout era; reference only, not used) | 150.6 | 7.24 | 39.3 | 14.0 | |
| **Before** (skill V3, no delivery pack) | 106.0 | 8.01 | 60.1 | 11.3 | 72 / 107 / 138 |
| **After** (skill V4 + delivery V1) | **161.6** | **6.58** | **35.1** | **16.9** | 124 / 163 / 198 |

### 4b. Run rate by phase (runs per over, all balls)

| | Powerplay | Middle | Death |
| --- | ---: | ---: | ---: |
| Real, fit | 7.68 | 7.66 | 9.75 |
| Real, selection | 8.30 | 8.27 | 9.84 |
| M7E (reference only) | 7.35 | 7.18 | 9.10 |
| Before | 5.34 | 5.02 | 6.94 |
| **After** | **7.52** | **7.65** | **10.24** |

### 4c. Per-ball outcome mix by phase (% of legal balls; dot excludes wicket balls)

| | Dot | 1 | 2 | 3 | 4 | 6 | Wicket |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Real fit, all | 30.0 | 38.8 | 7.6 | 0.5 | 10.9 | 4.9 | 5.5 |
| Before, all | 53.1 | 21.7 | 5.7 | 0.6 | 6.7 | 4.6 | 7.0 |
| **After, all** | **29.6** | **38.1** | **9.0** | **0.5** | **12.4** | **4.5** | **5.6** |
| Real fit, powerplay | 42.4 | 27.4 | 5.0 | 0.8 | 14.5 | 3.6 | 4.2 |
| After, powerplay | 39.5 | 29.6 | 7.3 | 0.4 | 13.7 | 3.7 | 5.2 |
| Real fit, middle | 27.5 | 45.9 | 7.6 | 0.4 | 8.2 | 4.4 | 4.5 |
| After, middle | 27.3 | 44.1 | 9.0 | 0.5 | 10.4 | 3.3 | 5.1 |
| Real fit, death | 18.8 | 39.9 | 10.9 | 0.5 | 11.1 | 7.4 | 8.9 |
| After, death | 21.3 | 37.6 | 11.1 | 0.6 | 14.4 | 8.0 | 6.9 |

### 4d. Dots and wickets by branch, after

| Branch | Share of balls | Dot rate | Dots per legal ball | Wicket rate | Share of wickets |
| --- | ---: | ---: | ---: | ---: | ---: |
| No contact | 14.4% (was 18.9%) | 87.4% | 12.6% (was 17.6%) | 9.9% | 25.5% |
| Ground shot | 58.3% (was 51.9%) | 18.5% (was 52.6%) | 10.8% (was 27.3%) | 0.6% | 6.0% |
| Aerial shot | 21.8% (was 22.3%) | 15.3% | 3.3% | 11.2% (was 16.2%) | 43.8% |
| Edge | 5.5% (was 7.0%) | 52.0% | 2.9% | 25.1% (was 37.1%) | 24.8% |

A ground shot is now worth 1.39 runs (was 0.72). By phase, the no-contact share is 23.4% in the powerplay, 12.1% in the middle overs and 7.2% at the death.

Dismissal kinds after (real fit; real selection): caught 67.1% (63.9%; 69.8%), bowled 20.0% (18.3%; 16.0%), lbw 4.4% (6.7%; 5.8%), run out 7.5% (8.3%; 6.0%), stumped 0.1% (2.7%; 2.2%), hit wicket 0.9% (0.2%; 0.2%).

### 4e. The aggression trade-off, after

| Aggression | Runs | Wickets | Dot % | Boundary % | Runs per ball | Wickets per ball |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 143.2 | 3.46 | 34.2 | 12.7 | 1.172 | 0.0289 |
| 1 | 149.3 | 4.40 | 34.7 | 14.2 | 1.225 | 0.0368 |
| 2 | 155.7 | 5.45 | 35.7 | 15.6 | 1.282 | 0.0456 |
| 3 | 162.3 | 6.58 | 36.8 | 17.4 | 1.362 | 0.0561 |
| 4 | 170.5 | 7.64 | 37.4 | 19.6 | 1.469 | 0.0669 |

| Step | Before: wickets per extra run | After: wickets per extra run |
| --- | ---: | ---: |
| 0 to 1 | 0.32 | 0.15 |
| 1 to 2 | 0.29 | 0.16 |
| 2 to 3 | 0.31 | 0.13 |
| 3 to 4 | 0.19 | 0.10 |

- Full attack now scores 27 runs more than full defence (was 9), for 4.2 more wickets (was 5.4).
- Each step costs 0.10 to 0.16 wickets per extra run. The real middle-to-death proxy is 0.13 (fit) and 0.16 (selection). [Inference] That is a plausible size, but the proxy is confounded, so this is a sanity check, not a fit.
- Under the captain, aggression 4 balls (16% of first-innings balls, mostly at the death) score 10.95 an over with 19.4% dots and 7.4% wickets.

## 5. Skill pack V4 and the C3 per-point gates

Lowering the dot level from about 60% to about 35% flattens the per-point non-dot effects of the same logit terms. With skill V3 and the delivery pack (iteration 8), batter non-dot (0.00447) and bowler non-dot (0.00476) fell below their C3 ranges. V4 steepens the dot terms and eases the boundary terms. Four dose iterations on the C3 targets only (`c3-mapping.json`, calibration split):

| Term (bp, on `(rating - world mean) x 200`) | V3 | V4 |
| --- | --- | --- |
| Contact, miss: control | +3,000 | +16,000 |
| Runs 0: control, rotation | +6,000, +3,000 | +13,000, -2,500 |
| Runs 4 and 6: timing, power | -800, -800 | -1,800, -1,800 |
| Runs 4 and 6: control, movement | -9,000, -9,000 | -7,000, -7,000 |
| Variation terms | unchanged | unchanged |

Per-point gate on the final model (`c4-per-point.json`; its `packSha256` field holds the model hash `27090e93...`):

| Effect (oriented) | Real range | V3 alone (C3) | **V4 + delivery V1** | Position in range | Verdict |
| --- | --- | ---: | ---: | ---: | --- |
| Batter runs | 0.00778 to 0.00923 | 0.00917 | 0.00864 | 59% | PASS |
| Batter boundary | 0.01272 to 0.01551 | 0.01380 | 0.01294 | 8% | PASS |
| Batter non-dot | 0.00516 to 0.00615 | 0.00536 | 0.00527 | 11% | PASS |
| Batter dismissal (fewer) | 0 to 0.01263 | 0.00454 | 0.00560 | 44% | PASS |
| Bowler runs (fewer) | 0.01195 to 0.01458 | 0.01354 | 0.01438 | 93% | PASS |
| Bowler boundary (fewer) | 0.02119 to 0.02698 | 0.02185 | 0.02330 | 36% | PASS |
| Bowler non-dot (fewer) | 0.00801 to 0.00965 | 0.00816 | 0.00835 | 20% | PASS |
| Bowler dismissal (more) | 0 to 0.0206 | 0.00629 | 0.00858 | 42% | PASS |
| Variation: wickets / runs | both positive | +0.0093 / +0.0054 | +0.0062 / +0.0036 | | PASS |

9 of 9 PASS. Batter boundary (8%), batter non-dot (11%) and bowler runs (93%) sit near the edges of their ranges.

## 6. Commands

On commit `eb16768` (branch `pavilion/stage-c-c4`, built on `c57dbd6`, #145's head):

```bash
node --import tsx scripts/stage-c/c2-pin-pack.ts --write          # 4fa5d845...
node --import tsx scripts/stage-c/c4-pin-pack.ts --write          # delivery baf16852..., model 27090e93...
bash scripts/stage-c/c2-dose.sh /home/user/lcx-data/c4/dose-final calibrated-t20-01
python3 -I scripts/stage-c/c3-per-point-gate.py --dose /home/user/lcx-data/c4/dose-final/per-point.json \
  --mapping docs/pavilion/stage-c/c3-mapping.json --pack-version "LC_CALIBRATED_T20_SKILL_V4 + LC_CALIBRATED_T20_DELIVERY_V1" \
  --pack-sha256 27090e93a46178d1f2d4569ab7f773f0f2c007a1f4e96db1ee3dffeb6504c7a8 --out docs/pavilion/stage-c/c4-per-point.json
for k in 0 1 2 3; do node --import tsx scripts/stage-c/c4-delivery-balls.ts /home/user/lcx-data/c4/final/g-$k.json 5 $((k*5)) & done; wait
for a in 0 1 2 3 4; do node --import tsx scripts/stage-c/c4-delivery-balls.ts /home/user/lcx-data/c4/final/f-$a.json 2 0 --aggression=$a; done
python3 -I scripts/stage-c/c4-analyse.py --game /home/user/lcx-data/c4/final/g-{0,1,2,3}.json --forced /home/user/lcx-data/c4/final/f-{0,1,2,3,4}.json \
  --real /home/user/lcx-data/c1-real-calibration-balls.json --out docs/pavilion/stage-c/c4-after.json
```

The "before" files were made the same way on `c57dbd6` (skill V3, no delivery pack), into `/home/user/lcx-data/c4/base-*`, and analysed into `c4-before.json`. Raw ball files stay outside the repository.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/.

## 7. Proof that synthetic-alpha-01 is unchanged

- No change to `probability-pack.ts`, `delivery-pack.ts`, the world packs, fixtures, golden vectors, schemas, contracts or persistence (`git diff c57dbd6 --stat`).
- In `generator.ts` every new branch is behind `deliveryPackOf(req)`, which is null for `synthetic-alpha-01`. Its categories, terms and term order are as before.
- The calibrated model is still reachable only through `validateT20ResearchMatchSetup`; the registry marks it `gameplay: false`.

Verification on commit `eb16768`, Linux container, Node 22, `NODE_OPTIONS=--max-old-space-size=4096`:

| Command | Result |
| --- | --- |
| `npx tsc -b` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run typecheck` | PASS (exit 0) |
| `npm run schemas:check` | PASS (exit 0; 409 schemas) |
| `npm run vectors:check` | PASS (exit 0; 24 random-address and 8 state-hash vectors) |
| `npm run probability:check` | PASS (exit 0; model `d47d5cac...`, 15 mass and draw vectors) |
| `npm run generator:check` | PASS (exit 0; 9 generator fixtures) |
| `npm run fixtures:engine` | PASS (exit 0) |
| `npx vitest run --maxWorkers=2 tests/unit/stage-c-calibrated-model.test.ts tests/unit/generator.test.ts` | PASS (exit 0; 2 files, 32 tests) |
| `npx vitest run --maxWorkers=2` (whole unit suite, fresh worktree) | FAIL (exit 1): 122 of 123 files, 1,033 of 1,035 tests passed. The 2 failures are both in `tests/unit/windows-launcher.test.ts`: `start.mjs` and the game packager need a built web app, which the fresh worktree did not have |
| `npx vite build --config apps/web/vite.config.ts`, then `npx vitest run --maxWorkers=2 tests/unit/windows-launcher.test.ts` | PASS (both exit 0; 4 of 4 tests) |
| Browser suites, `npm run verify:07b` | NOT RUN (browsers; `verify:07b` rewrites tracked evidence) |

## 8. Fitting record (400 matches each; fit and selection distance = sum of absolute gaps in dot %, boundary % and the three phase run rates)

| Iteration | Change | Runs | Wkts | Dot % | Bdry % | Phase rates | Fit distance | Selection distance |
| ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 1 | first pack: lower miss, aerial, edge; ground singles; fewer catches; dismissal intercepts | 154.1 | 6.41 | 34.5 | 14.7 | 7.55 / 7.16 / 9.38 | 2.82 | 8.21 |
| 2 | coverage by fielder depth; aggression on run value | 162.9 | 6.41 | 32.0 | 15.9 | 7.96 / 7.25 / 10.52 | 4.96 | 9.28 |
| 3 | ring and deep cover instead | 150.1 | 6.42 | 33.8 | 14.1 | 7.55 / 6.63 / 9.64 | 4.35 | 9.74 |
| 4 | contact intercepts by phase | 147.8 | 6.55 | 37.4 | 14.8 | 7.19 / 6.79 / 9.36 | 4.84 | 6.48 |
| 5 | phase intercepts further; deep cover gives the single | 154.1 | 6.66 | 34.5 | 15.2 | 7.13 / 7.24 / 9.82 | 2.32 | 7.57 |
| 6 | edge and ground run values; deep saves more fours | 157.3 | 6.68 | 34.8 | 15.8 | 7.41 / 7.38 / 9.96 | 1.35 | 6.38 |
| 7 | more sixes from aerial shots; phase intercepts | 162.1 | 6.60 | 34.4 | 16.3 | 7.39 / 7.63 / 10.46 | 2.52 | 6.57 |
| 8 | ground fours, deep cover -20,000 | 159.7 | 6.61 | 34.3 | 15.9 | 7.45 / 7.49 / 10.17 | 1.93 | 6.82 |
| 9 | skill V4 (per-point gates pass) | 155.7 | 6.68 | 36.1 | 15.7 | 7.08 / 7.40 / 10.07 | 2.12 | 5.62 |
| 10 | powerplay miss and pad +1,000; ground four 2,900 | 160.5 | 6.67 | 35.3 | 16.6 | 7.53 / 7.54 / 10.20 | 1.65 | 5.01 |

Iteration 10 is `LC_CALIBRATED_T20_DELIVERY_V1`.

## 9. What is still off, and why

1. **Death overs score too freely and lose too few wickets.** 10.24 an over against 9.75 to 9.84; wickets 6.9% a ball against 8.9% to 9.1%; fours 14.4% against 11.1%. [Inference] The death no-contact share (7.2%) was pushed low to bring death dots down, and catches have no phase term, so death overs lose bowled, lbw and caught chances together.
2. **The powerplay takes too many wickets** (5.2% against 4.2% to 4.8%), from the higher no-contact share used to raise powerplay dots.
3. **More aggression still means slightly more dots** (34.2% at 0 to 37.4% at 4), because attack still adds some misses and edges and the field does not respond to it. In real death overs dots are lowest. Under the captain this is masked by the phase (aggression 4 balls show 19.4% dots).
4. **Spread of totals is too narrow:** P10 to P90 of 124 to 198 against 118 to 202 (fit) and 110 to 219 (selection). [Inference] Real totals also vary with ground, conditions and rain-shortened innings, which the corpus does not have. Real innings include rain-shortened ones; per-ball rates are not affected.
5. **Stumpings are almost absent** (0.1% of dismissals against 2.2% to 2.7%). C4 did not touch the stumping mechanism (misses against spin at aggression above 2).
6. **Selection-period drift.** The selection period has more sixes (6.6% against 4.9%) and higher powerplay and middle rates. Fitting was to the fit period, so the model sits between the two.
7. **Contact shares are not identified by real data** (section 1).
8. **Margins on the per-point gates are thin** at three effects (section 5).

## 10. NOT RUN

- The C3 criterion 1 adjusted and raw gates, the specialisation gate and the tactical validation rerun, with V4 and delivery V1. As in C3, they depend on the captain's bowler deployment and wait for captain V4 (#146).
- The holdout. It was not read and must not be read until the owner asks for the one final evaluation.
- Browser suites.

## 11. Proposed next step

1. Owner review of this slice and of the skill V4 revision.
2. Once captain V4 (#146) is merged: re-run the C3 adjusted, raw, specialisation and tactical gates on the C4 model.
3. A delivery V2 for the death overs and the aggression response: make the run value of attacking shots depend on deep cover (attack into a spread field yields singles and twos, not dots), and review the stumping branch. Fit and select on the same splits.
4. Only then, and on the owner's instruction, the single holdout evaluation.
