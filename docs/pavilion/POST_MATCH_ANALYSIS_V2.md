# Post-match analysis V2 (`LC_POST_MATCH_ANALYSIS_V2`)

Directive 03 (27 November 2026), match entertainment: "post-match explanations naming the correct model and policy versions". [Post-match analysis V1](POST_MATCH_ANALYSIS_V1.md) said "the current model" without naming it, and its footnote cited the tactical validation of 25 November 2026, measured under captain V2. The live game has since moved to captain V5 and then V6 ([BATTING_POLICY_V3.md](BATTING_POLICY_V3.md), #172). V2 names the versions and replaces the measured notes with figures measured under the versions it names.

**Status:** implemented on branch `pavilion/post-match-analysis-v2` (draft pull request). Verified by automated tests only. Not human tested, not accepted.

## What changed

- **New version, V1 kept.** `projectPostMatchAnalysisV2` (`packages/projections/src/post-match-analysis-v2.ts`) calls V1's `projectPostMatchAnalysis` and adds to its output. V1's code, rules and output are unchanged; a unit test checks that V2's phases, turning points, decisions and command counts equal V1's, and that V1 still carries its own notes.
- **Same rules.** Phases, turning points, decisions and "what followed" use V1's fixed rules (`POST_MATCH_ANALYSIS_RULES`). V2 records this as `rulesVersion: "LC_POST_MATCH_ANALYSIS_V1"`.
- **Versions named.** A new visible section, "Model and versions", under the decisions:
  1. the model recorded in this match's own setup;
  2. the computer captain: plainly not recorded (see below), with this build's captain named as this build's, not the match's;
  3. the evidence behind the notes: its date, model, captain and batting policy, and the number of matches per experiment.
- **New measured notes.** Each decision's note now quotes the experiments measured under captain V6 and batting policy V3, with their figures and 95% intervals. The effect label on each decision (`CLEAR`, `MIXED`, `NONE_DETECTED`, `NOT_MEASURED`) is derived from those intervals in code, not set by hand.
- **Footnote rewritten.** It names the evidence, its versions and date, and says that each experiment held one poor setting for a whole match or innings, so a single change during a match was not measured.
- **The match screen shows V2.** The match worker (`apps/web/src/match/controller.ts`) now builds V2 at full time; the panel is `apps/web/src/match/PostMatchAnalysisPanel.tsx`. The panel's `data-version` is `LC_POST_MATCH_ANALYSIS_V2`.

## What a finished match records

Checked in the contracts and the engine:

| Version | Recorded? | Where |
| --- | --- | --- |
| Model | Yes | `setup.versions.model` and `setup.versions.modelHash` (`MatchVersionsSchema`, `packages/contracts/src/core.ts`), pinned when the match is set up and checked by the engine (`packages/simulation/src/t20-match.ts`). A saved or resumed match keeps its setup. |
| Rules | Yes | `setup.versions.rules` and `rulesHash` (`LC_T20_01`) |
| Computer captain (`LC_T20_TACTICAL_CAPTAIN_V*`) | **No** | Commands carry only `actorId: "AI:<team>"` (`T20CommandSchema`, `packages/contracts/src/t20-match.ts`). No event, setup field or saved record holds a captain id. BATTING_POLICY_V3.md, section 7, says the same: "no captain id is persisted". |
| Batting policy (`LC_T20_BATTING_POLICY_V*`) | **No** | As for the captain. |
| Which code made a computer command | **No** | On the match screen the computer's commands come from the tactical captain (`adviseT20Captain`), from the fixture autopilot step for some picks (`fixtureAutopilotStep`), and from the opponent mode adjustments in `apps/web/src/match/ai-opponent.ts`. All are stored as `AI:<team>`. |

A unit test plays a match and checks that the stored setup, commands and events contain no `TACTICAL_CAPTAIN` or `BATTING_POLICY` identifier.

**How V2 names them.**
- Model: "Model: synthetic-alpha-01, as recorded in this match's setup." If the setup is not available it says so.
- Captain, when the record credits the computer with any decision: "Computer captain: not recorded. The match record keeps the computer's N decisions as commands, without the captain or batting policy version that chose them. This build's computer captain is LC_T20_TACTICAL_CAPTAIN_V6 with batting policy LC_T20_BATTING_POLICY_V3; a match started in an earlier build, or saved and resumed, can hold decisions from an earlier captain."
- Captain, when no decision is credited to the computer (for example a two-player match): "No decision in this match is credited to the computer, so no computer captain version applies."
- If the match's model is not the evidence's model (or is not recorded), the evidence line adds that the notes do not describe this match's model. Only `synthetic-alpha-01` is selectable in the game today, so this is a guard, not a case a player meets.

V2 does not guess a match's captain from the date or the build. This build's captain comes from `@lcxxvi/ai` (`T20_TACTICAL_CAPTAIN_ID`, `T20_BATTING_POLICY_V3_ID`) and is labelled as this build's.

## Evidence for each note

All figures come from one committed file, `docs/pavilion/batting-policy-v3/tactical-validation-v6-synthetic.json` (`LC_PAVILION_TACTICAL_VALIDATION_V1`, model `synthetic-alpha-01`, captain `LC_T20_TACTICAL_CAPTAIN_V6`, advanced ball by ball), reported in [BATTING_POLICY_V3.md](BATTING_POLICY_V3.md), section 5 (27 November 2026, merged in #172). Each experiment is 200 matches: 100 corpus seeds, each played twice with the poor setting on each side. The good side is the suggested eleven with captain V6 making every choice; the poor side is identical except in the setting under test. "Share" is the good side's wins of decided matches, with its 95% Wilson interval. A unit test checks every quoted value against the file.

| Decision | Experiments (poor side) | Share, 95% interval | Run difference an innings, 95% interval | V2 effect |
| --- | --- | --- | --- | --- |
| Selection (eleven against the suggested eleven) | Old selection rule | 80.8% (74.8 to 85.7) | +13.2 (9.4 to 17.1) | MIXED |
| | Weakest eleven | 56.0% (48.9 to 62.8) | +3.1 (-0.7 to 6.8) | |
| Batter picks (batting order) | Same eleven batting in reverse order | 73.7% (67.1 to 79.4) | +8.1 (4.2 to 11.9) | CLEAR |
| Batting plan (aggression) | Aggression 0 every ball | 65.8% (58.9 to 72.1) | +6.0 (3.1 to 9.0) | MIXED |
| | Aggression 4 every ball | 53.0% (46.1 to 59.9) | +4.5 (0.3 to 8.6) | |
| Bowler choice | Weakest available bowler every over | 49.7% (42.8 to 56.7) | -0.2 (-3.8 to 3.4) | NONE_DETECTED |
| Bowling plan | Full length at maximum effort | 51.0% (44.1 to 57.9) | +0.8 (-2.9 to 4.5) | NONE_DETECTED |
| | Good length throughout | 52.3% (45.3 to 59.1) | +0.6 (-3.1 to 4.2) | |
| | Maximum effort throughout | 51.0% (44.1 to 57.9) | +0.8 (-2.9 to 4.4) | |
| | Conserve effort throughout | 49.5% (42.6 to 56.4) | -0.6 (-4.0 to 2.9) | |
| Field | Two-slip powerplay field for all 20 overs | 56.1% (49.1 to 62.9) | +3.7 (-0.1 to 7.5) | NONE_DETECTED |
| Batting intent, toss, bat or bowl | None | | | NOT_MEASURED |

Effect rule (`postMatchEffectV2`): CLEAR when every experiment for that decision has a share interval wholly above 50%, NONE_DETECTED when none has, MIXED otherwise, NOT_MEASURED when there is no experiment.

**What the notes now say differently from V1.**

| Decision | V1 note (captain V2 run, 25 November) | V2 note (captain V6 run, 27 November) |
| --- | --- | --- |
| Selection | "a clear effect" | Old rule: clear (80.8%). Weakest eleven: cannot be told apart from no effect (56.0%, 48.9 to 62.8). [Inference] V1's "clear" already rested on the old-rule and order experiments; its own weakest-eleven figure (51.8%) was not clear either. |
| Batting plan | "a small effect at most (about 3 runs an innings)" | Blocking every ball: clear (65.8%). Attacking every ball: no measurable difference in results (53.0%), 4.5 runs an innings fewer (0.3 to 8.6). Intent not measured. |
| Batter picks | "a clear effect" | Reverse order: clear (73.7%). Single batter picks not measured on their own. |
| Bowler choice, bowling plan, field | "no detectable effect" | Unchanged in substance, now with each figure; field: only the two-slip field held all innings was measured. |
| Toss, bat or bowl | "Not measured." | Unchanged. |

No figure, threshold or label was chosen after seeing a match's analysis. No note says a decision caused, won or lost anything.

## Is the analysis persisted?

**No.** Checked:
- **Match view:** `postMatchAnalysis` is a field of the view the match worker sends to the page (`apps/web/src/match/protocol.ts`), worked out at full time from the live session and cached in memory per session. Nothing writes the view to storage.
- **IndexedDB:** the stores are `games`, `snapshots`, `events`, `commands`, `worldPacks`, `modelPacks`, `rulePacks`, `projections` and `settings` (`packages/persistence/src/index.ts`), plus the career and season databases. The `projections` store holds the scenario ledger, super-over records and tournament runs only. No store holds a post-match analysis.
- **Archives and exports:** the career event archive and the `.lcxxvi` exports keep events and scorecards; none contains the analysis.
- **Contracts:** no schema in `packages/contracts` names a post-match analysis.

So V2 widens no persisted format and needs no saved-data version. No command, event, contract schema, save, archive, engine, generator, random stream or probability table changed. The simulation and replays are untouched.

## Not changed: the archived view

The analysis reopened from the career archive ([POST_MATCH_ANALYSIS_ARCHIVE_V1.md](POST_MATCH_ANALYSIS_ARCHIVE_V1.md), `LC_POST_MATCH_ANALYSIS_ARCHIVE_V1`) still shows V1's measured notes, from the captain V2 run. Changing what it shows needs its own new version (`LC_POST_MATCH_ANALYSIS_ARCHIVE_V2`), so it is left for a separate change. The archive replay rebuilds the match's session with its setup (`apps/web/src/career/archived-post-match-analysis.ts`), so the model could be named there too; the captain version is no more recorded in the archive than in the live match.

## Limitations

- **The captain version is not in the record.** V2 can only say so. Recording it would need a new command or setup version; that is a persisted-format change for the owner to decide, not part of this slice.
- **Whole-match experiments, single decisions.** Every experiment held one poor setting for a whole match or innings. The panel lists single changes during a match. The notes say what the setting did over whole matches; what one change does was not measured. The footnote says so.
- **The evidence is synthetic.** `synthetic-alpha-01` makes no empirical claim; 200 simulated matches per experiment are not human play.
- **Not every setting was measured.** One field change (the two-slip field held all innings) and four bowling plans; no batting intent, toss or bat-or-bowl experiment. Selection is compared with the suggested eleven on ratings, while the experiments measured two particular poor elevens.
- **A newer captain needs a new version.** If the live captain or model changes again, the notes need a new measurement and a new analysis version; the evidence constants in `post-match-analysis-v2.ts` are fixed for V2.
- **Super overs, ODI, red-ball and rain-affected matches** are not covered, as in V1.

## Playtest questions

Add to V1's list for the independent match playtests:

1. Does the participant read the "Model and versions" section? Ask what they think "Computer captain: not recorded" means.
2. Do the notes with percentages read as information or as noise? Ask which note, if any, would change what they try next match.
3. Do they read "no detectable effect" as "this setting does nothing" or as "not shown to matter in simulated matches"?

## Verification

Recorded in the pull request description, with the exact commands and the commit tested.
