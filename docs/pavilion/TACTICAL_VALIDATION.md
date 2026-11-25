# Project Pavilion: does good management beat deliberately poor management?

Owner direction of 25 November 2026, "Tactical validation". The question is whether good selection, aggression, bowling plans and field settings materially improve results in the current game. Player development is a season-level experiment and is not yet included. The required reporting is effect sizes, uncertainty, limitations and reproducible evidence.

**Status:** measured on `main` at `c5d91c6`, which uses the `synthetic-alpha-01` model and captain V2. This changes no game behaviour.

## Method

`node --import tsx scripts/pavilion-tactical-validation.ts docs/pavilion/tactical-validation.json`

The script is deterministic: the same command gives the same file. It takes about 12 minutes on Linux.

**The two sides:**
- **Good management:** the suggested eleven, with the tactical captain choosing the bowler, batting aggression and bowling plan, and the engine's default field for each phase.
- **Poor management:** identical except in one decision area per experiment.

**The matches:** each of the 100 frozen corpus seeds is played twice, with the poor management on one side and then on the other, so team strength, the toss and the seed cancel out. That gives 200 matches per experiment.

**The measures:**
- the good side's share of decided matches, with a 95% Wilson interval;
- the mean runs per innings for each side;
- the paired mean run difference, with a 95% interval (normal approximation);
- the poor side's commands per match, which confirm that the change actually took effect.

## Results

| Area | Poor management | Good side wins (of decided) | Good win %, 95% interval | Run difference per innings, 95% interval |
| --- | --- | ---: | ---: | ---: |
| Selection | Old rule: no specialist batters, bowlers batting 2 to 7 | 155 of 197 | **78.7** (72.4 to 83.8) | **+9.8** (6.6 to 13.1) |
| Selection (order) | Same eleven, batting in reverse order | 138 of 198 | **69.7** (63.0 to 75.7) | **+8.6** (5.2 to 12.0) |
| Batting aggression | Aggression 0 every ball | 115 of 197 | 58.4 (51.4 to 65.0) | +2.6 (-0.3 to 5.4) |
| Batting aggression | Aggression 4 every ball | 113 of 199 | 56.8 (49.8 to 63.5) | +2.8 (-1.2 to 6.8) |
| Field setting | Two-slip powerplay field all 20 overs | 104 of 199 | 52.3 (45.3 to 59.1) | +2.2 (-1.2 to 5.7) |
| Selection | Weakest eleven (see the limitation below) | 102 of 197 | 51.8 (44.8 to 58.7) | +0.7 (-2.6 to 4.0) |
| Bowling plan | Full length at maximum effort all innings | 101 of 196 | 51.5 (44.6 to 58.4) | +1.1 (-2.3 to 4.6) |
| Bowling choice | Weakest available bowler first, every over | 99 of 198 | 50.0 (43.1 to 56.9) | +0.1 (-3.2 to 3.4) |

## What this shows

1. **Who bats where matters a lot.** Leaving out the specialist batters, or batting the tail first, loses 70 to 79% of decided matches. These are the only clear effects.
2. **Batting aggression matters a little.** Blocking every ball, or slogging every ball, costs about 3 runs an innings. The good side wins about 57 to 58%, and both intervals reach or nearly reach 50%.
   - [Inference] In real T20, blocking for 20 overs or slogging from ball one would usually lose heavily. The model's risk and reward for aggression are too weak. This agrees with `P04_CALIBRATION_DIAGNOSIS.md` cause C3 and with stage B.
3. **Bowling decisions make no measurable difference.** This covers who bowls, the length and effort, and the field.
   - Bowling the weakest bowler first gave exactly 99 wins each.
   - In the weakest-eleven experiment, the top five bowlers are about 15% weaker on paper (176 against 211 for team-01), and that made no difference either.
   - [Inference] In `synthetic-alpha-01`, bowler skill and bowling tactics barely move outcomes.
4. **Consequence for the game.** As things stand, a player's bowling choices, bowling plans, field settings, and the recruitment or development of bowlers would not change results in any way a player could notice. That is a direct threat to "tactical agency" and to a rewarding season. With owner approval of 25 November, realistic skill differentiation is stage C's first target.

## Limitations

- **The weakest eleven tests bowling skill, not batting skill.** Every squad has nine batters and about the same batting depth. The weakest eleven's top six batters are only about 3% weaker than the best eleven's, and one team's are slightly stronger. So this experiment does not show whether smaller differences in batting skill matter. The old-rule experiment shows that a large difference does: bowlers rated about 140 for batting against batters at about 260. A dedicated batting-skill experiment comes next.
- **The "good" side is the current captain V2, which is not optimal.** A better policy could show larger effects.
- **Poor management changes one decision area at a time.** Interactions between areas are not measured.
- **Run differences understate the gap in matches won by the chasing side.** A second innings stops when the target is reached.
- **The field experiment uses one legal alternative field.** The registry has 11 positions and the default already uses the two-slip field in the powerplay, so the room for a poor field is small.
- **Player development, meaning training over a season, is not yet measured.** The owner approved measuring it through the career training programme, after the career selection fix.
- **Only T20 is covered, and these are simulated matches, not human play.** This says nothing about enjoyment.
