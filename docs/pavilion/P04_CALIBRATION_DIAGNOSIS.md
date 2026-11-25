# Project Pavilion P04: why T20 scoring is low, and a proposal for owner approval

Owner direction of 24 November 2026, item 2: "Investigate the causes rather than simply applying an arbitrary scoring multiplier ... Prepare the proposed new model and its migration design for explicit owner approval before changing the authoritative simulation."

**Status: diagnosis and proposal only.** This branch changes no model, no rules, no persisted format and no game behaviour. It adds one read-only measurement script and its output. Nothing below is approved; section 6 lists the decisions needed.

## 1. The gap

From `docs/M7E_REAL_CRICSHEET_HOLDOUT.md` (frozen game, 200 matches, against 652 real men's T20 first innings, August 2025 to October 2026):

| First innings | Game | Real |
| --- | ---: | ---: |
| Mean runs | 88.1 | 150.6 |
| Mean wickets | 7.5 | 7.2 |
| Dot balls | 63.9% | 39.3% |
| Boundary balls | 8.6% | 14.0% |
| Powerplay / middle / death runs per over | 4.15 / 4.33 / 5.66 | 7.35 / 7.18 / 9.10 |

The game takes about the right number of wickets but scores about 60 runs too few, mainly through far too many dot balls and too few boundaries.

## 2. What was measured

`scripts/pavilion-p04-counterfactuals.ts` replays the frozen 100-seed Pass 07B corpus (`tests/fixtures/t20/seed_corpus.json`) under four set-ups and records the first innings. Output: `docs/pavilion/p04/counterfactuals.json`. It is deterministic; the same command gives the same file.

```bash
node --import tsx scripts/pavilion-p04-counterfactuals.ts docs/pavilion/p04/counterfactuals.json
```

| Set-up | Runs | Runs per over | Wickets | All out | Runs added from over 11, by wickets down at over 10 (0-1 / 2-3 / 4-5 / 6+) |
| --- | ---: | ---: | ---: | ---: | --- |
| Corpus XI, fixture autopilot (as frozen) | 83.2 | 4.34 | 8.18 | 33 of 100 | 41.4 / 43.2 / 42.0 / 33.9 |
| Corpus XI, tactical captain | 84.9 | 4.38 | 8.26 | 36 of 100 | 39.3 / 43.0 / 45.2 / 40.1 |
| Balanced XI, fixture autopilot | 108.7 | 5.53 | 6.96 | 18 of 100 | 51.7 / 53.1 / 48.4 / 33.0 |
| Balanced XI, tactical captain | 111.0 | 5.65 | 7.14 | 19 of 100 | 58.2 / 56.3 / 49.8 / 30.8 |

Frozen corpus outcome mix per legal ball: dot 60.0%, single 18.2%, two 5.3%, four 4.9%, six 3.3%, wicket 7.1%. By phase, dots are 60.0% in the powerplay, 62.2% in the middle overs and 55.5% at the death.

"Balanced XI" is keeper, the four best batters, three all-rounders and the three best bowlers, batting in batting-skill order. "Tactical captain" is the existing `apps/batch` captain (`tacticalT20Step`) making both sides' choices.

## 3. Causes, in order of measured or likely size

### C1. The suggested eleven bats bowlers at 2 to 7 (measured: about 25 runs)

Squads are stored as keeper, keeper, six bowlers, three all-rounders, nine batters. Three places pick "keeper, then the first six bowling-capable players, then squad order":

- the corpus selector, `packages/simulation/src/t20-match.ts` around line 406;
- the game's suggested eleven, `apps/web/src/match/controller.ts` line 81, and the same code in `controller-odi.ts` and `controller-red5.ts`;
- [Inference: not yet traced line by line] the generated tournament roster in `apps/web/src/tournament/generated-roster.ts`.

So a quick match, a scenario and a default exhibition field an eleven with no specialist batters, and the bowlers bat at 2 to 7 in squad order. A balanced eleven adds about 25 runs a side (83 to 109) and cuts all-outs from 33 to 18 in 100. Career fixtures already use `selectBaselineXI` (`packages/simulation/src/offscreen-fixture.ts` line 138), which picks by selection score, so career play is less affected.

This is a selection defect, not a model property. It also means the B7 projected-total table and the B9 win-chance table, which were built from this corpus, describe games played by these unbalanced elevens.

### C2. Batting tempo never responds to the match (measured: small with today's captain)

The batting plan defaults to aggression 2 with intent NORMAL (`t20-match.ts` line 207) and the fixture autopilot never sets a plan. The existing tactical captain changes little (85 against 83 runs). Real T20 sides with wickets in hand accelerate hard from over 11; here, with 0 or 1 down at over 10, the frozen game adds only 41 runs in the last ten overs, and a balanced eleven with the captain adds 58. Real first innings average 9.1 an over at the death alone.

### C3. The delivery model is too dot-heavy and too dismissive of attacking shots (from a code read; size not yet isolated)

[Inference: from reading the resolution code and the outcome mix above; no counterfactual has isolated each part yet.]

- Ground-shot coverage by the field turns most hit balls into dots (60% dots against 39% real).
- Aerial shots are out about 17% of the time and edges about 37%, so attacking costs wickets faster than it earns runs. Raising aggression therefore does not buy the runs it does in real cricket.
- Player skill moves probabilities only weakly: ratings enter as (rating minus 50) times 200 basis points (`packages/simulation/src/probability.ts` lines 266 to 292) with coefficients of 0.25 to 0.5, so a strong batter and a weak one score much alike.
- Probability clamps were checked and are not the cause.

C1 and C2 together take the game from 83 to about 111 runs. The remaining gap of about 40 runs, and the dot and boundary mix, sit in C3: the delivery model itself.

## 4. Why not a multiplier

A run multiplier would raise totals but keep the wrong mix (too many dots, too few boundaries), keep the weak link between skill and outcome, and keep aggression unrewarding. That is the authenticity problem, not just the total. It would also hide C1, a defect that should simply be fixed.

## 5. Proposal: three stages, each a separate pull request and owner decision

### Stage A. Correct the selected eleven and batting order (no model change)

- One shared pure selector (keeper; best batters; all-rounders; enough bowlers to bowl 20 overs within quotas; batting order by batting skill) used by the T20, one-day and red-ball controllers and the tournament roster.
- The frozen corpus selector in `t20-match.ts` is **not** changed: it defines the frozen fixtures and their checksums. A new corpus version (for example a Pass 07C corpus) would use the new selector, and the frozen one stays for regression.
- Regenerate the B7 projected-total and B9 win-chance tables from the new corpus as new table versions.
- Saves: a saved match keeps the eleven it was saved with. Only new matches see the new suggestion. No persisted format change.
- Expected effect (measured above): about 109 to 111 runs, about 7 wickets.

### Stage B. A state-aware batting policy for the computer side and the autopilot (versioned)

- Set aggression and intent from overs left, wickets in hand, the required rate in a chase and the batters at the crease, instead of a fixed 2.
- Versioned as a policy id (the autopilot is part of what a replay re-executes, so a changed policy must not alter replays of older matches). Old saves replay with the old policy.
- This is also the foundation for item 3 (tactical agency): the player's own aggression choices only matter if the model rewards them, which leads to stage C.
- Measure before and after on the new corpus; no target score is tuned into the policy.

### Stage C. A new versioned, empirically calibrated delivery model (needs explicit approval before any authoritative change)

- **Model id:** a new id beside `synthetic-alpha-01` (for example `calibrated-t20-01`). `synthetic-alpha-01` stays frozen and addressable; every existing save, replay and fixture keeps it. A save records its model id and is replayed with that model forever.
- **Data:** Cricsheet `t20s_json` (Open Data Commons Attribution 1.0), owner-supplied and not redistributed in the repository; derived parameters carry attribution. The existing M7 research packs (M7D to M7K) are research-only (`gameplayIntegrationPermitted=false`) and would be the starting point, not shipped as is.
- **Splits, fixed before fitting and recorded by match id and date:** calibration (fit), validation (model choice and tuning) and a chronological holdout used once, at the end. No match appears in two splits. The M7G split (training to August 2025; holdout August 2025 to October 2026) is the template.
- **What is fitted:** outcome mix per ball by phase and wickets lost; the effect of batting and bowling skill; the effect of aggression (the reward and the risk); dismissal types; extras; partnership and new-batter effects.
- **Validation slices:** teams of differing strength, grounds and conditions, strong against weak players, formats (T20 first; one-day only after its own data and gates), and tactics (aggression levels, bowling plans).
- **Acceptance gates (proposed, to be approved):** the M7G and M7E targets on the holdout: mean runs within 5%; wickets within 0.5; dot and boundary fractions within 2 percentage points; P10, median and P90 within 10%; phase run rates reported. Plus: the skill effect has the right sign and a plausible size on held-out data; deterministic replay across browsers; save and replay compatibility for both model ids; presentation and analytics still consume no authoritative randomness.
- **Migration design:** the model id is chosen when a new match or career starts; an existing career keeps its model unless the owner approves an explicit opt-in conversion that starts a new season with the new model, with the old seasons' records left unchanged. Projections (B7 and B9) are rebuilt per model id and selected by the match's model id.
- **Out of scope until approved:** any change to `synthetic-alpha-01`, its rules fingerprint, the PRNG, or any persisted schema version.

## 6. Decisions needed from the owner

1. Approve stage A (selector fix for new matches, new corpus version, regenerated B7 and B9 tables)? This changes what new quick matches play like; it does not touch the model.
2. Approve stage B as a versioned policy, measured but not tuned to a target total?
3. Approve starting stage C: confirm the Cricsheet licence position for derived parameters, confirm the data split, and confirm the acceptance gates in section 5 (or set others).
4. For stage C, choose the default for existing careers: stay on `synthetic-alpha-01` (proposed) or offer an opt-in move at a season boundary.

Until these are answered, no authoritative simulation code is changed.

### Owner decisions, 24 November 2026

The owner answered in the session: "Q 1. Yes  Q2. Yes  Q3.  Yes  Q.4  as you recommend".

1. Stage A: **approved.**
2. Stage B: **approved**, as a versioned policy that is measured but not tuned to a target total.
3. Stage C: **approved to start.** This covers the licence position, the data split and the acceptance gates as proposed in section 5. Building and validating the model does not change the game. Making it selectable in the game is a separate owner decision, taken on the validation results.
4. Existing careers: **stay on `synthetic-alpha-01`**, and only new careers use a new model.

Stages are delivered as separate pull requests, in the order A, B, C. Each is merged only with owner approval.

## 7. Verification of this branch

Recorded in the pull request with revision and exit codes: `npx tsc -b`, `npm run lint`, the script run above, and the unit suite. The script reads the frozen corpus and world data only and writes one JSON file.
