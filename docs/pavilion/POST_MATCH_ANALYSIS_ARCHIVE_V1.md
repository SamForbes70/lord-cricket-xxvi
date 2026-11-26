# Post-match analysis reopened from the career archive (`LC_POST_MATCH_ANALYSIS_ARCHIVE_V1`)

Directive 02, item B4, second slice. [Post-match analysis V1](POST_MATCH_ANALYSIS_V1.md) appears at full time on the match screen only. The player can now reopen an analysis for any completed career T20 league fixture, their own or the computer's, from the career fixture list or from the Home match report. It is worked out on read from the fixture's stored event archive.

**Status:** implemented and integrated on branch `pavilion/post-match-archive` (draft pull request). Verified by automated tests only. Not human tested, not accepted.

**Owner decision (26 November 2026):** no new archive version. The archive keeps the committed events but not the commands, so the reopened view shows what changed and when, never who asked for it.

## Where the player finds it

- **Fixture list** (Season, Fixtures): each completed fixture has a "Post-match analysis" button beside "View replay". It opens the existing archived replay viewer with the analysis at the top, focused, above the ball-by-ball list. "Close replay" returns focus to the button.
- **Home match report:** after a managed fixture, the report (open or closed) has a "Post-match analysis" button. It moves to the fixture list and opens the same view.

## What it shows

1. **The toss**, as recorded: "The coin landed heads: Aster Harbour won the toss. Moonstone Bay batted first." The call and the choice are not credited to anyone.
2. **Phase by phase** and **Turning points**: the same table and the same fixed rules as V1. The projection shares V1's code for these parts, so `rulesVersion` is `LC_POST_MATCH_ANALYSIS_V1`; a unit test checks that a match played on the match screen gives identical phases and turning points through both routes.
3. **Plan and field changes in the record.** A line says how many changes the record has for each side, then one closed disclosure per side ("Changes for Aster Harbour (3)"). Each change shows when it happened (over and score), what changed ("Field changed: fielders moved to slip 1, away from deep cover.", "Batting plan changed: J. Reyes: aggression Balanced to Attack."), what happened in the next two overs of that innings, and V1's measured note for that kind of setting.
4. **What is and is not shown:** a closed disclosure with the limits below.

## What it leaves out, and why

- **"Your decisions and what followed" is not shown.** The archive records what happened, not who decided it: a plan change by the player and one by the computer captain are the same event. The panel says so in plain words ("The stored record keeps what happened, not who decided it. These changes are not credited to you or to the computer captain...").
- **No comparison with the suggested eleven.** The archive keeps the eleven each side fielded, but not the squad and ratings as they stood on match day (ratings change with training and over seasons, and availability is not recorded). A comparison would not be honest, so it is omitted and the footnote says so.
- **No batter or bowler picks.** The ball-by-ball list directly below shows who batted and bowled; repeating the picks without knowing who chose them adds nothing.
- **No count of computer decisions.** V1 says how many decisions the computer captain made for the managed side; that count comes from commands, which the archive does not keep.

## How the changes are rebuilt

From the events alone, the way the match engine applies them:

- A new bowler (`BOWLER_SELECTED`) resets the bowling plan to the default (stumps, good length, stock, normal effort) and the field to the default positions: the powerplay positions before 36 legal balls of the innings, the later positions after, with the outfielders (the eleven without the keeper and the bowler) placed in sorted order, as in the engine's `defaultSlots`. The position lists come from `@lcxxvi/data` (`T20_POWERPLAY_SLOTS`, `T20_LATER_SLOTS`).
- Batting plans are kept per batter for the match; the default is Balanced and normal intent.
- Each `FIELD_CHANGED`, `BATTING_PLAN_CHANGED` and `BOWLING_PLAN_CHANGED` event is compared with the setting in place just before it. A field change that moves positions lists the positions added and removed; one that keeps the positions but moves fielders between them says so. A change that left the setting as it was is not listed.
- Several changes of one kind for one side at the same ball (for example one per batter) are one line, as in V1. Within that line each setting is described from its value before the first change to its value after the last, so a batter's plan changed three times at one ball reads as one net change, and one changed and changed back is not listed.
- "What followed" uses V1's rule: the next 12 legal balls of that innings, the innings' rate before the change, and a note when another change for the same side came within those balls.

A unit test plays a career match with a field change, a bowling plan change, an unchanged field sent again, a swap of two fielders and a two-batter plan change with one batter changed twice at the same ball, stores it in the career, reopens it from the archive and checks each line against the engine's own state before the change.

## When there is no analysis

The analysis is shown only when everything lines up; otherwise the panel shows a one-line note ("Not available. ...") and nothing else:

- no archive for the fixture (a legacy V1 career, or a lazily loaded archive row that is missing);
- an archive that fails verification (hash, roster pack, replay or completion binding);
- an archive for a different match or fixture, or a replayed scorecard whose hash differs from the stored completion;
- events with a gap in their sequence, or events that do not add up to the scorecard stored with the fixture's completion (runs, wickets and legal balls per innings);
- a field reset that cannot be rebuilt (the eleven does not give nine outfielders).

Unit tests cover each of these; the browser test deletes one stored archive row and corrupts another and checks that only the note appears.

## Where it comes from

- `packages/projections/src/post-match-analysis.ts`: `projectArchivedPostMatchAnalysis`, a pure function of the events, the stored scorecard, both elevens with their keepers, names and the default field. It shares the event walk, phases and turning points with `projectPostMatchAnalysis` (V1 output is unchanged; checked on twelve fixtures against the V1 code on `main` and by the V1 tests).
- `apps/web/src/career/archived-post-match-analysis.ts`: takes the archive replay the fixture list already loads and verifies (`CareerApplicationService.replayFixtureArchive`) and the fixture's completion, and returns the analysis or a reason it is unavailable.
- `apps/web/src/career/ArchivedPostMatchAnalysisPanel.tsx`: presentation, reusing V1's phase table, turning points and decision rows and V1's styles.

Nothing is saved. No persisted format, archive, command, event, contract schema or save changes; the simulation, random stream, replays and results are untouched.

## Limitations

- **Thresholds and notes as in V1.** The measured notes still come from the captain V2 tactical validation; see V1's limitations.
- **Bowling plan and field changes last at most one over** in the engine (a new bowler resets them), so "what followed" over two overs can run past the change. The footnote says so.
- **Every change is listed, the computer's included.** In a played match the computer captain can change a bowling plan most overs, so a side's list can be long; it sits in a closed disclosure.
- **Legacy careers** whose fixtures were completed before event archives existed show the note, not an analysis.
- **Super overs, ODI, red-ball and rain-affected matches** are not covered, as in V1. Career league fixtures are T20.

## Playtest questions

Add to V1's list for the independent match playtests (Directive 02, E2):

1. Does the participant find the "Post-match analysis" button on the fixture list or the match report without being told?
2. Do they understand why the reopened view does not list "your decisions"? Ask them to say in their own words what the note means.
3. Do they open the analysis for a fixture they did not play (the computer's own fixtures)? What do they look for?
4. Do they read a listed change as their own, or as the computer's, when the panel does not say?
