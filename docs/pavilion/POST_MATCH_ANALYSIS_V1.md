# Post-match analysis V1 (`LC_POST_MATCH_ANALYSIS_V1`)

Directive 02, item B4, first slice. The owner's success measure is that players "understand the consequences of their management decisions". After a T20 match the player now sees a short analysis of the match and of their own decisions, built only from the match record.

**Status:** implemented and integrated on branch `pavilion/post-match-analysis` (draft pull request). Verified by automated tests only. Not human tested, not accepted.

## What the player sees

At full time in any T20 match played on the match screen (a managed career match, a quick match or an exhibition, a scenario), a "Post-match analysis" section appears in the result panel, under Player of the Match and above the replay check. It has four parts.

1. **Phase by phase.** A table with one row per innings: runs and wickets in the powerplay (overs 1 to 6), the middle overs (7 to 15) and the death overs (16 to 20), with the overs bowled in each. A phase the innings never reached says "Not reached".
2. **Turning points.** Up to four passages, chosen by the fixed rule below, each stated as a fact, for example "Moonstone Bay lost 4 wickets for 8 runs in overs 5 to 7."
3. **Your decisions and what followed.** The managed side's eleven compared with the suggested eleven, then each decision the player made, in match order: the toss call, bat or bowl, batting plan changes, bowling plan changes and field changes. Each shows when it was made (over and score), what was changed, what happened in the next two overs of that innings, and a one-line note on what the tactical validation measured for that kind of decision. Batter and bowler picks sit in a closed disclosure ("Batter and bowler picks (n)"): each batter with what they made, each bowler with the overs they were given and the runs and wickets in those overs. If the computer captain made decisions for the managed side, the panel says how many and that they are not listed.
4. **What is and is not measured.** A closed disclosure that explains the measured notes and the limits listed below.

In a match where the player runs both sides, decisions are listed under each side ("For Aster Harbour"). If the player changed a setting for the computer's side (the aggression control allows that), it is listed under that side as theirs.

Screenshots (local only, not committed): `pma-career-1366-summary.png`, `pma-career-1366-picks-open.png`, `pma-exhibition-390.png` and `pma-exhibition-390-turning.png` in the agent's scratch folder, listed in the pull request.

## Where it comes from

- `packages/projections/src/post-match-analysis.ts`: `projectPostMatchAnalysis`, a pure function of the committed event chain, the accepted commands, the scorecard, each side's eleven and (optionally) the suggested eleven. It refuses events whose sequence has a gap and an event chain that does not add up to the scorecard.
- `apps/web/src/match/controller.ts`: at full time the match worker derives the analysis from the live session and adds it to the screen's view as `postMatchAnalysis`. It is cached per session and never stops the view: on any error the panel is simply absent.
- `apps/web/src/match/PostMatchAnalysisPanel.tsx` and `post-match-analysis.css`: presentation.

Nothing is saved. The analysis is worked out again from the match record each time the completed match is shown. No persisted format, command, event, contract schema or save changes; the simulation, random stream, replays and results are untouched.

## The rules (fixed for V1)

All values are in `POST_MATCH_ANALYSIS_RULES`. They are presentation choices, not calibration. Changing any of them needs a new version identifier.

- **Overs.** A delivery belongs to the over given by the legal balls bowled before it, so wides and no-balls stay in the over in which they were bowled (the same rule as the match analytics).
- **Phases.** Powerplay overs 1 to 6, middle 7 to 15, death 16 to 20.
- **Windows.** Turning points look at every run of three consecutive overs in an innings (fewer if the innings was shorter).
- **Collapse.** The window with the most wickets in each innings, if it has three or more (ties: fewer runs, then earlier).
- **Surge and squeeze.** The innings' own rate is its runs divided by its legal balls. For each window, the excess is the window's runs minus what that rate gives for the window's legal balls. The largest excess of 12 runs or more is a surge; the largest shortfall of 12 runs or more is a squeeze, unless it overlaps that innings' collapse. The comparison is done in whole numbers so the text is the same on every platform.
- **Stand.** The largest stand in the match (runs between the fall of one wicket and the next, or the end of the innings), if it reached 40.
- **Death overs.** When both innings batted in overs 16 to 20 and the two sides' rates there differ by 12 runs or more over five overs, both sides' death-over scoring is listed.
- **Choosing.** Collapses first, then the stand, then surges and squeezes by size, then the death-overs comparison; at most four, then shown in match order.
- **What followed.** The next 12 legal balls (two overs) of the same innings after the decision, with the innings' rate before the decision. If the innings ended sooner, the text says so. If another plan or field change by the same side came within those balls, the text says that too. Several plan commands at the same ball (for example one per batter) count as one decision.
- **Selection.** The eleven fielded against `suggestedEleven` on the squad's ratings. Fitness, form and availability are not part of that comparison.

There is no win probability anywhere in the analysis.

## Fact and inference

Everything in the panel is a recorded fact: counts and sums of recorded deliveries, the commands as accepted, and the scorecard. The panel never says a decision caused, won or lost anything; the introduction says that a decision listed next to what came after it is the order of events, not a claim of cause. A unit test and the browser test check the text for causal wording and for en or em dashes.

The one interpretive element is the measured note on each decision. It repeats `TACTICAL_VALIDATION.md` (200 simulated matches per area under `synthetic-alpha-01`, measured on `main` at `c5d91c6` with captain V2):

| Decision | Note shown |
| --- | --- |
| Selection, batter picks (batting order) | a clear effect on results |
| Batting plan (aggression) | a small effect at most, within the margin of error |
| Bowler choice, bowling plan, field | no detectable effect; shown as a record only |
| Batting intent, toss, bat or bowl | not measured |

[Inference] Because bowling choices, plans and fields show no measured effect, the runs and wickets after them are noise as far as the current model is concerned. The panel says so rather than leaving the player to read meaning into them.

## Limitations

- **Routine picks look like the player's own.** The routine-picks setting sends the same command a click sends, so the match record cannot tell them apart. The footnote says so.
- **Intent shares the batting plan note.** The plan note quotes the aggression measurement; intent was not measured, and the footnote says that.
- **Captain V4 and the stage C model are not reflected.** The measured notes come from the captain V2 run. The captain V4 rerun (`CAPTAIN_V4_DEATH_OVERS.md`) and any later model need the notes reviewed.
- **The suggested-eleven comparison uses ratings alone.** In a career, an injured or unavailable player can make the eleven differ from the suggestion for reasons the comparison does not know. A career eleven from an imported roster may have no comparison ("No suggested eleven to compare with").
- **Super overs** are not included; the analysis covers the 20-over match. ODI, red-ball and rain-affected matches have no analysis yet.
- **Shown at full time only.** The career home screen's match report (`match-report.ts`) is a separate, earlier feature built from the scorecard alone. It does not show this analysis, because the career keeps only the scorecard in its completion record. Since the second slice, a completed career fixture's analysis can be reopened from the fixture list or the match report, rebuilt from the stored event archive without the commands: see [POST_MATCH_ANALYSIS_ARCHIVE_V1.md](POST_MATCH_ANALYSIS_ARCHIVE_V1.md) for what that view shows and omits.
- **Thresholds are untested with players.** 12 runs, 40 runs and three wickets were chosen to keep the list short; they are not tuned.

## Playtest questions

For the independent match playtests (Directive 02, E2). Record what the participant does and says; do not record enjoyment as a score unless the protocol asks for it.

1. Without prompting, does the participant open or read the post-match analysis? How long do they spend on it?
2. Ask them to name one decision they made and what happened after it. Do they use the panel to answer?
3. Do they read the "what followed" lines as cause and effect? Ask: "Did your field change make a difference?" and note whether they cite the panel.
4. Do they notice and understand the measured notes, especially "no detectable effect"? Does that change what they try in the next match?
5. Do the turning points match what they remember as the key moments of the match? Is anything missing or wrong?
6. Is the panel too long, particularly at phone width? Do they open the picks list?
7. After reading it, do they choose to play another match, and do they mention anything from the analysis when they do?

## Verification

Recorded in the pull request description, with the exact commands and the commit tested.
