# Close-finish captaincy playtest

Open Scenario challenges. Play **Death-overs chase** to bat or **Nineteen to defend** to bowl. Both are curated T20 checkpoints. Captain’s highlights lives inside the scenario banner; the match controls below remain available. A plan button commits that plan and plays a bounded passage. After a wicket, selection, pressure checkpoint or result, read the score change beside the choice that started the passage. The player can also stop after the in-flight command.

## Before/after observation

One automated Chromium pass per version and role on the same host, using a new profile each time. The baseline production build used the same application and package source as main at 1da44ea. Each pair started at the same seed, score, wickets and legal-ball count. The clock ran from clicking the scenario launch button until the first enabled tactical choice or player selection was reached. Times include loading, worker startup and automation polling, and are descriptive single samples.

| Position | Version | Time to first choice | Routine advances | Tactical choices and player selections |
| --- | --- | ---: | ---: | ---: |
| Chase 23 from 24, 68/5 | Baseline | 2.44 s | 5 | 2 |
| Same chase | Highlights | 2.13 s | 2 | 2 |
| Defend 19 from 30, opposition 52/4 | Baseline | 2.76 s | 7 | 5 |
| Same defence | Highlights | 3.82 s | 3 | 5 |

The script chose the first eligible player when required. It attacked with the striker in the chase, or selected good length, off line and conserved effort in defence. After that it retained the plan. The baseline used Finish over. Highlights used Keep the plan and, for subsequent bowling selections, the combined bowler-and-play action. The tactical count treats a bowling plan as one intervention even when several form controls specify it. The routine count includes advances with no tactical change, including Keep the plan. Neither count includes launch, outcome inspection or replay.

All four scripted attempts lost. One observed chase passage read “Attack the boundary: 3 runs, 1 wicket in 9 legal balls. Boundaries: 0.” A defensive passage with Ari Mossthorne conceded one run in six legal balls without a boundary. The headline finding is fewer routine advances while retaining the observed choices. These trials do not establish balance, enjoyment, or a reliable timing difference. Automated replays verified both starting scores.

## Human playtest

Let the player choose a role and finish one attempt without coaching. Leave the result screen open and observe whether they choose Play again before prompting. Then ask: What was your plan? What did it cost you? What would you try differently? Record their own words and whether they replayed voluntarily. No human responses or voluntary replay observations were collected in the automated run.
