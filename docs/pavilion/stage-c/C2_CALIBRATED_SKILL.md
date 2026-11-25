# Stage C slice C2: calibrated skill component (status: fit done, engine integration stopped for an owner decision)

**Status: research only, and partly blocked.** The fit of the skill parameters on the owner's reference cohort is done. Running the match engine under a second model id needs changes the owner's constraints forbid without a decision (section 3), so no registry, pack or engine code has been written. Nothing in the game has changed. The holdout has not been read.

Base: branch `pavilion/stage-c-research` after C1 (`038cee9`), 25 November 2026. Owner decisions: `C1_SKILL_DIFFERENTIATION.md`, "Owner decisions, 25 November 2026".

## 1. Fit on the reference cohort

**Data:**
- Reference: men's T20 internationals between two of the 12 full members (list in `c2-fit.json`).
- Fit period: on or before 2023-08-31 (835 matches).
- Validation period: 2023-09-01 to 2025-08-24 (166 matches), used to choose the pooling strength only.
- The M7G holdout is not read.

**Method:**
- Multiplicative batter and bowler effects over a phase baseline, fitted on the fit period.
- True between-player SDs by moments.
- Empirical-Bayes shrinkage with the noise term scaled by a pooling factor. The factor is chosen per outcome on the validation period.
- Script: `scripts/stage-c/c2-fit.py`. Output: `c2-fit.json`.

| Outcome (per ball faced) | True relative SD, batter (players) | True relative SD, bowler (players) | Pooling chosen | Validation loss change against phase-only (95%) | Predicts later matches? |
| --- | ---: | ---: | --- | --- | --- |
| Striker dismissal | 0.174 (342) | 0.104 (383) | 2 (stronger) | log loss -0.00015 (-0.00032 to +0.00003) | **No**: the interval includes zero |
| Boundary | 0.183 | 0.165 | 1 | log loss -0.0032 (-0.0044 to -0.0021) | Yes |
| Not a dot | 0.076 | 0.059 | 1 | log loss -0.0030 (-0.0043 to -0.0019) | Yes |
| Batter runs | 0.113 | 0.087 | 0.5 | squared error -0.026 (-0.035 to -0.018) | Yes |

The pooling factor was chosen on the validation period, so these intervals are optimistic. The untouched test is the holdout, once, at the end of C2.

**Correlations between a player's true effects.** Each correlation uses outcome A on one half of the matches and outcome B on the other, so the shared noise of a ball cancels. These are point estimates; no interval was computed.

| Pair | Correlation | Reading |
| --- | ---: | --- |
| Bowler wicket effect and bowler runs conceded | +0.18 | Wicket-taking bowlers concede slightly more runs |
| Bowler wicket effect and boundaries conceded | +0.38 | ...and clearly more boundaries: the trade-off the owner asked variation to carry (decision 3) |
| Batter boundary effect and dismissal effect | +0.21 | Boundary hitters are dismissed somewhat more |
| Batter runs effect and dismissal effect | +0.10 | Weak |

**What the parameters would mean on the game's scale.** The world's ratings are not rescaled (decision 2). The world-pack rating SDs from C1 are 7.65 for batting and 7.52 for bowling, so the implied log effect per rating point is:
- batter runs: about 0.015;
- batter boundary: about 0.024;
- bowler runs: about 0.012;
- bowler boundary: about 0.022.

For comparison, the game's measured slopes (C1 section 5) are 0.013, 0.019, 0.0015 and 0.0017.

[Inference] On the full-member reference, the batting coefficients need only modest increases. The bowling path needs a direct route into run value and boundaries, about 8 to 13 times today's effect.

## 2. Gates: what is measured so far

| Gate | State |
| --- | --- |
| Player effects predict later matches, interval excludes zero | Boundary, not a dot and runs: met on validation. Dismissal: **not met** (reported separately, as decided). |
| Criterion 1 on the full-member reference, raw and adjusted, never inverted | NOT RUN: needs the engine under the new model |
| Per-point effects within the real range | NOT RUN: needs the engine |
| Specialisation within 15% | NOT RUN: needs the engine |
| Tactical validation rerun (weakest eleven, worst bowler first, bowling plan, aggression) | NOT RUN: needs the engine |
| First-innings runs, wickets, dots and boundaries against the M7E targets | NOT RUN: needs the engine |
| `synthetic-alpha-01` unchanged | Holds trivially: no game file is changed on this branch |

## 3. Why the engine integration stopped, and the options

**What the constraint says.** The owner's constraint: if running the engine with the new id needs any change to a validated set-up or schema, stop and report the options. It does.

**Where the engine pins the model:**
- **Set-up validation** pins the model hash:
  - `packages/simulation/src/world-setup.ts` lines 183 to 184 and 358 to 359 (the request and the world manifest must carry `MODEL_PACK_SHA256`);
  - the same file, lines 265 and 440 (the validated set-up is written with it);
  - `packages/simulation/src/t20-match.ts` line 87 (session creation refuses any other hash).
- **Contract schemas** pin the model id as a literal:
  - `GenerateDeliveryRequestSchema.modelId` (`packages/contracts/src/generator.ts` line 39);
  - `ProbabilityContextSchema.modelId` (`packages/contracts/src/probability.ts` line 31);
  - the pack schema's `manifest.modelId` (line 70);
  - `T20ReplayCaseSchema.modelId` (`packages/contracts/src/t20-match.ts` line 46).
- **The generator** also builds its request with the `synthetic-alpha-01` constants (`t20-match.ts` line 199).

**Options:**

| Option | What changes | Persisted formats | Effect on existing checks | Honesty of records |
| --- | --- | --- | --- | --- |
| A. Widen the two request schemas | The request schemas accept `synthetic-alpha-01` or `calibrated-t20-01`. A registry keyed by model id. Set-up validation accepts a registered hash only through a research-only function argument, never the request. | None: the request schemas are not persisted, and `T20ReplayCaseSchema` and the set-up schema are unchanged | Generated JSON schema mirrors change, so `schemas:check` needs regeneration. Every fixture, vector and replay stays byte for byte (to be proven). | Each session records its true model hash |
| B. Additive version 2 contracts | New `GenerateDeliveryRequestV2`, probability context V2 and generator `LC_CONDITIONAL_DELIVERY_V2` for the new model only. The V1 schemas stay literal. | None | Adds schemas, so the pinned schema counts in `tests/unit/contracts.test.ts` and `scoring-fixtures.test.ts` change (an existing test edit) | As A |
| C. Research generator hook | An optional in-memory generator argument to the T20 engine, used only by research scripts. No schema change. | None | Existing checks untouched | **Poor:** events would be produced by one model under a set-up that names another. Never persistable. |
| D. Separate research match simulator | A headless simulator outside the engine (as M7G did) using the new pack and the existing captains through their public views | None | None | Honest, but the field, plan and rule fidelity of the real engine is lost, so the tactical-validation rerun would be weaker evidence |

**Recommendation: A** [Inference]. It is the smallest change that keeps every record truthful. The persisted surfaces stay closed: `T20ReplayCaseSchema` keeps its literal and the set-up schema is unchanged. The new model can only be reached by a research function argument, never by a game set-up. Its cost is a regenerated schema mirror for two in-memory request contracts. B is the fallback if the owner prefers no existing schema to change at all.

## 4. Next steps once an option is chosen

1. The registry and a pinned `calibrated-t20-01` pack built from `c2-fit.json`:
   - per-outcome batter and bowler terms;
   - variation on the wicket and boundary trade-off;
   - stamina left for fatigue;
   - a bowler term on run value.

   Unit tests for both.
2. Proof that `synthetic-alpha-01` is unchanged: the full `npm test`, `schemas:check` (option B) or its reviewed regeneration (option A), `fixtures:engine`, `vectors:check`, `probability:check` and `generator:check`.
3. Season soak and gates on the full-member reference, the tactical-validation rerun with intervals, and the aggregates against the M7E targets.
4. The holdout once, for the final report.

## 5. Reproduce

```bash
python3 -I scripts/stage-c/c2-fit.py --real /home/user/lcx-data/c1-real-calibration-balls.json --out docs/pavilion/stage-c/c2-fit.json
```

The input comes from C1's `c1-real-extract.py` (C1 section 8). Archive SHA-256 `956f29df9d2b95dd6fe12de5bc70d4522f23693e5e7e2ac4c1a004e1b541ad8e`; licence SHA-256 `11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b`.

**Attribution.** Contains information from Cricsheet (https://cricsheet.org/), made available under the Open Data Commons Attribution License (ODC-By) 1.0, https://cricsheet.org/licensing/. Only derived aggregates are in this repository.

## 6. Questions for the owner

1. Which option in section 3 (A recommended, B as the fallback, or C or D)?
2. Dismissal skill does not predict later full-member matches even with stronger pooling. Should the new model:
   - give batters and bowlers a small dismissal term at the fitted SD, accepting that it is not yet shown out of sample; or
   - let dismissal differences come only through the correlations above (boundary hitters, wicket-taking bowlers)?
