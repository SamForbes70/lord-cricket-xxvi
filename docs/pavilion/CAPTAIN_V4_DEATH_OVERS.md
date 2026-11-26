# Captain V4: the best bowlers keep overs for the death

Owner-approved captain-policy fix, 25 November 2026. Branch `pavilion/captain-death-overs`, based on `main` at `4e29882`. Model `synthetic-alpha-01`; no rule, engine or persisted format changes.

## Tables

All on the frozen 100-seed T20 corpus (`tests/fixtures/t20/seed_corpus.json`), suggested elevens, both sides on the captain, 200 innings. Rating is control + movement + variation (T20). Quarters are of the 48 distinct bowlers who bowled, ranked by rating.

**Share of each quarter's overs by phase** (powerplay overs 1 to 6, middle 7 to 15, death 16 to 20):

| Rating quarter (range) | V3 overs | V3 powerplay / middle / death % | V4 overs | V4 powerplay / middle / death % |
| --- | ---: | --- | ---: | --- |
| Lowest (129 to 169) | 419.5 | 0 / 0 / **100** | 518.2 | 0 / 100 / **0** |
| Second (169 to 192) | 974.8 | 15.4 / 64.6 / 20.0 | 1002.8 | 27.2 / 60.2 / 12.6 |
| Third (192 to 203) | 1136.7 | 26.4 / 62.3 / 11.3 | 1088.3 | 34.5 / 45.9 / 19.5 |
| Highest (204 to 229) | 1193.3 | 62.8 / 35.4 / **1.7** | 1091.8 | 50.5 / 11.5 / **38.0** |

**Death overs per innings by rank within the eleven** (1 = the side's best bowler):

| Rank | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V3 | 0.00 | 0.21 | 0.11 | 0.75 | 1.48 | 1.27 |
| V4 | 1.62 | 1.05 | 0.85 | 0.25 | 0.00 | 0.00 |

**Economy (runs per over) and first-innings runs:**

| Captain | Powerplay | Middle | Death | Mean first-innings runs |
| --- | ---: | ---: | ---: | ---: |
| V3 | 6.13 | 5.13 | 6.31 | 113.4 |
| V4 | 6.14 | 5.18 | 6.21 | 113.2 |

**Head to head**, each seed twice with V4 on one side then the other: V4 won 99, V3 96, 5 ties or no result. V4 share of decided matches 50.8% (95% Wilson interval 43.8 to 57.7).

**Tactical validation rerun** (`scripts/pavilion-tactical-validation.ts`, all eight experiments; good side = the captain, 200 matches each):

| Experiment | Good side wins of decided, V3 | Good win %, 95% interval, V3 | Good side wins of decided, V4 | Good win %, 95% interval, V4 | Run difference, 95% interval, V4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bowling: weakest bowler first | 96 of 197 | 48.7 (41.8 to 55.7) | 92 of 195 | 47.2 (40.3 to 54.2) | -0.5 (-4.4 to 3.3) |
| Selection: weakest eleven | 113 of 197 | 57.4 (50.4 to 64.1) | 110 of 197 | 55.8 (48.9 to 62.6) | +3.3 (-0.6 to 7.2) |
| Selection: old rule | 160 of 197 | 81.2 (75.2 to 86.1) | 163 of 197 | 82.7 (76.9 to 87.4) | +13.4 (9.9 to 16.9) |
| Batting order reversed | 139 of 193 | 72.0 (65.3 to 77.9) | 146 of 197 | 74.1 (67.6 to 79.7) | +8.3 (4.7 to 11.9) |
| Aggression 4 every ball | 104 of 198 | 52.5 (45.6 to 59.4) | 102 of 199 | 51.3 (44.4 to 58.1) | +3.7 (-0.7 to 8.1) |
| Aggression 0 every ball | 118 of 197 | 59.9 (52.9 to 66.5) | 125 of 197 | 63.5 (56.5 to 69.9) | +5.4 (2.3 to 8.4) |
| Bowling plan full and maximum | 102 of 198 | 51.5 (44.6 to 58.4) | 100 of 196 | 51.0 (44.1 to 57.9) | +0.1 (-3.8 to 4.0) |
| Field: two slips all innings | 108 of 195 | 55.4 (48.4 to 62.2) | 109 of 196 | 55.6 (48.6 to 62.4) | +3.2 (-0.7 to 7.2) |

**One-day captain** (`LC_ODI_TACTICAL_CAPTAIN_V2`, the same 100 seeds, teams and grounds on the one-day template, suggested ODI elevens, both sides on the captain):

| Rating quarter | Overs | Overs 1 to 10 / 11 to 40 / 41 to 50 % |
| --- | ---: | --- |
| Lowest (137 to 171) | 503.5 | 0 / 96.5 / 3.5 |
| Second (176 to 193) | 1771.7 | 0 / 96.8 / 3.2 |
| Third (193 to 202) | 2269.8 | 40.9 / 54.7 / 4.4 |
| Highest (202 to 221) | 2347.3 | 45.5 / 51.3 / 3.2 |

## What this shows

1. **The defect is real.** Under V3 the lowest-rated quarter bowled all its overs in the death and each side's best bowler bowled none there; the fifth and sixth bowlers bowled most of overs 16 to 20.
2. **V4 reverses it.** The best bowler now bowls 1.6 of the death overs per innings and the top three 3.5; the fifth and sixth bowl only in the middle. The best bowlers still open (about half their overs in the powerplay). The best bowler bowls fewer overs in all (723 against 796) because a chase that ends early leaves its kept overs unused.
3. **Results barely move.** Death economy fell from 6.31 to 6.21 an over, V4 against V3 is 99 to 96, and the bowling experiments stay at chance. This matches stage C slice C1: under `synthetic-alpha-01` bowler skill barely moves outcomes. [Inference] The fix makes deployment cricket-like and removes the deployment bias C1 found in the game's bowling statistics; it will not change results until the model's bowling effect is larger.
4. **The one-day captain does not show the defect.** No quarter is loaded onto overs 41 to 50 (3.2 to 4.4% each), because innings rarely reach them: about 1.2 overs in 41 to 50 an innings. It is left unchanged.
5. **The other experiments are within chance of their V3 values.** The intervals overlap throughout.

## Design

`LC_T20_TACTICAL_CAPTAIN_V4` (`packages/ai/src/t20-captain.ts`):

- **Before the death:** `deathOverReserve` keeps overs back for overs 16 to 20. It goes best bowler first (skill = 2 control + 2 movement + variation + stamina / 2, ties by playerId) and keeps up to two overs each until the five death overs are covered. With six four-over bowlers that is two, two and one. The captain bowls the overs left over, best first after fatigue. Only when no one has an over to spare does it use a kept over, the least skilled reserved bowler's first.
- **In the death:** the best available bowler.
- **Every choice** still goes through `feasibleBowlerChoice`, so an innings that can be bowled is never stranded.
- **Unchanged from V3:** the batting policy `LC_T20_BATTING_POLICY_V1`, lengths, the effort rule and field intent. The advice's fields are unchanged.
- **Public view:** `previousOverBowler` may now carry that bowler's public bowling skills, so the plan counts them. Without them that bowler keeps nothing back.

**Callers:**

- `apps/batch/src/tactical-match.ts` passes the previous bowler's skills.
- `apps/web/src/match/ai-opponent.ts` passes them too, and every mode takes V4's choice:
  - the match-aware ("advanced") captain no longer bowls its best bowler first;
  - a captain whose temperament banks late overs now holds its top bowler back only within the death (overs 16 to 18). Before the death, V4 already keeps those overs, and the old rule (from over 13) would have spent one early.
  - Delegation categories and the person's control are unchanged: the opponent still proposes only for its own team or delegated categories, and never advances the ball.

**Replays:** captain choices are recorded as match commands. Three V3 batch matches and three V3 opponent matches saved on `4e29882` rehydrate with identical event hashes on this branch, while a live V4 run of the same setups differs. No persisted format changed.

**Also fixed (separate commit):** the web opponent copied the engine's bowling plan into `SET_BOWLING_PLAN`. After a change within the over that copy carries the event's `type`, which the command schema refuses, so the club-style and match-aware opponents failed on a second plan change in one over. Reproduced on `4e29882` in both modes on three seeds. It now sends the plan's five fields.

## Reproduce

```
node --import tsx scripts/pavilion-captain-death-overs-measure.ts docs/pavilion/captain-v4/death-overs.json
node --import tsx scripts/pavilion-odi-death-overs-measure.ts docs/pavilion/captain-v4/odi-death-overs.json
node --import tsx scripts/pavilion-tactical-validation.ts docs/pavilion/captain-v4/tactical-validation-v4.json
```

- The death-overs script runs the code's captain and a copy of V3's bowler choice and effort, kept unchanged in the script.
- On `4e29882` the two runs gave identical event hashes in all 100 matches, which checks the copy.
- `tactical-validation-v3.json` is the same validation script run on `4e29882`.

## Limitations

- Synthetic model only. Nothing here is a claim about real cricket results.
- The quarters are by rating, not by measured performance.
- One reservation rule (two, two, one), written once from cricket judgement and not tuned to any result.
