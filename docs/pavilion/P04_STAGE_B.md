# Project Pavilion P04 stage B: a versioned, context-aware batting policy

Owner approval of 24 November 2026 (P04 decision 2): "Approve stage B as a versioned policy, measured but not tuned to a target total". Delivered as option (a) from the 25 November review: the policy drives the computer captain in live matches and the batch tools. Career fixture simulation is unchanged here; it changes with stage C, under its own version.

## What changed

- **`LC_T20_BATTING_POLICY_V1`** (`packages/ai/src/batting-policy.ts`). This sets the striker's aggression (1 to 4) and intent from what a captain can see:
  - balls left;
  - wickets in hand;
  - the required rate in a chase;
  - the batting skill of the two batters at the crease.
- **The policy's rules:**
  - Setting a total: attack the powerplay with wickets in hand, build through the middle, go hard at the death.
  - Chasing: follow the required rate, easing off when three or fewer wickets remain.
  - Few wickets left with many balls to go: protect the innings.
  - A tail-ender with a recognised batter at the other end does not slog. They look for a single to give the strike away.
  - In the middle overs, when not attacking, rotate the strike.
- **`LC_T20_TACTICAL_CAPTAIN_V3`** takes its batting choices from the policy. Its bowling and field choices are V2's.
  - The batch captain (`apps/batch/src/tactical-match.ts`) and the computer opponent (`apps/web/src/match/ai-opponent.ts`) now pass the captain the two batters' public batting skills.
  - They now send the policy's intent. Before this, intent was always NORMAL.
- **Not changed:**
  - the delivery model (`synthetic-alpha-01`) and the rules;
  - the fixture autopilot and career simulation;
  - any persisted format.

  Choices are recorded as match commands, so replays of matches played under the old captain are unaffected.

## Measurement

`node --import tsx scripts/pavilion-p04b-measure.ts docs/pavilion/p04/stage-b.json`

The set-up:
- the frozen 100-seed corpus with the suggested elevens;
- bowling and fields on the tactical captain;
- the old rule kept, unchanged, in the script for comparison.

| First innings | Old rule (V2) | Captain V3 |
| --- | ---: | ---: |
| Mean runs | 104.2 | 106.4 |
| Mean wickets | 7.55 | 8.09 |
| All out (of 100) | 27 | 34 |
| Runs per over: powerplay / middle / death | 6.09 / 4.75 / 5.55 | 6.59 / 4.80 / 5.68 |
| Runs added from over 11, by wickets down at over 10 (0-1 / 2-3 / 4-5 / 6+) | 54.6 / 49.7 / 44.0 / 26.4 | 61.6 / 50.0 / 44.2 / 19.9 |

**Head to head:** each seed was played twice, with V3 batting for one side and then the other. V3 won 104 of 200 matches, the old rule 94, and 2 were ties or no result.

**Ablation:** with the same aggression and intent always NORMAL, the result was 105.7 runs, 8.17 wickets and 35 all-outs. Head to head, that version won 100 and the old rule 95, with 5 ties or no result. So rotating the strike makes no measurable difference in this model.

## What this shows

- **The policy is about even with the old rule.** A 104 to 94 split over 198 decided matches is within chance. [Inference] At even odds, the standard deviation of wins is about 7.
- **Behaviour is more cricket-like in shape.** The powerplay is faster, the value of wickets in hand is steeper (more runs late with wickets in hand, fewer with the tail in), and the death overs are a little faster.
- **The model, not the policy, limits the gain.** More aggression buys a few runs and costs more wickets (8.09 against 7.55; 34 all-outs against 27). This matches the stage A finding: under `synthetic-alpha-01`, aggression is weakly rewarded. Real T20 rewards it strongly. Making that trade-off authentic is stage C's job (a calibrated delivery model).
- **No target total was tuned in.** The rules were written once, from cricket judgement, and measured. No rule was changed to raise the total.

## Verification

Recorded in the pull request with the revision and exit codes:
- `npx tsc -b`
- `npm run lint`
- the unit suite, including `tests/unit/pavilion-batting-policy.test.ts`
- the measurement above
