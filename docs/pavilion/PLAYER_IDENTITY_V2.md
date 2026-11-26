# Player identity V2 (`LC_PLAYER_IDENTITY_V2`)

Entertainment track, second slice, 26 November 2026. It follows [player identity V1](PLAYER_IDENTITY_V1.md) (#149), whose proposed next slice the owner approved: factual match introductions in managed career matches, and style-aware advice in the selection room. This slice is **implemented** on the branch `pavilion/player-identity-2`. It is not integrated, human tested or accepted, and it makes no claim about enjoyment.

## What the player sees

- **Match screen, managed career T20 match.** The V1 chip in each active player's row now carries the league record when a batter walks out or a bowler comes on:
  - "Walks out: 412 runs, best 77*", "Walks out: 0 runs in 1 innings", "Walks out: 12 from 500 runs" (a milestone in reach) or "Walks out: first league innings";
  - "On to bowl: 11 wickets, best 4/19", "On to bowl: 0 wickets in 2 matches", "On to bowl: 2 from 25 wickets" or "On to bowl: first league over".
  
  The chip's title and screen-reader text give the full introduction, for example: "New at the crease: Vero Jorcroft, Anchor (defence 70, timing 66). League record before this match: 412 runs in 17 innings, best 77*, 3 fifties. Latest league scores, oldest first: 9, 41*, 30." After the first ball the chip shows the style alone, as in V1.
- **Exhibitions, quick matches, scenarios, tournaments and roster careers** have no career record, so the chip is exactly the V1 style-only chip ("Walks out: Anchor").
- **Selection room** (Home, on match day from round 2). Under each option in "Who takes the spot?", up to three short lines, each with a label:
  - **Suggestion**: an inference from playing styles, such as "Adds a boundary hitter: the rest of your XI has none.", "Your XI already has 2 other spin specialists." or "Would be the XI's only spin bowler.";
  - **Rating**: the rating that names the option's style, when it is at least 5 higher than the other option's, such as "Rates 79 for movement; Talor Elmholt rates 73.";
  - **Record**: this season's recorded figures, leading with bowling figures for a bowler, such as "This season, latest figures, oldest first: 5/7."
  
  One line under both options says: "Suggestions read playing styles and recorded figures. They are not a prediction: the match uses ratings, not style labels."

## How it is derived

All rules are pure functions in `packages/projections/src/player-identity-v2.ts`. It reads no clock, no `Math.random` and no simulation random stream, and imports only the contracts' types and the V1 and E6 identity modules (unit tests check all three).

| Part | Source | Rule |
| --- | --- | --- |
| Career summary | The career's historical statistics (`service.historicalStatistics()`, the same projection the player page's story uses) | On "Play match", the career builds one `CareerIntroSummary` for the 22 named players: league matches, innings, runs, best score, fifties, hundreds, balls bowled, bowling matches, wickets, best figures, and the latest three scores and figures. A player the statistics do not list has no recorded league match. |
| Handover | Memory only | `apps/web/src/match/career-intro-handoff.ts` holds the summary for that match's `matchGameId`. It is not in the launch, the managed binding, sessionStorage, IndexedDB or any export. |
| Chip headline | The summary | A milestone in reach first (the E6 rule: within 50 runs of a multiple of 500, within 5 wickets of a multiple of 25), then "first league innings/over", then "runs, best" (three or more innings) or "runs in N innings", and "wickets, best" or "wickets in N matches". |
| Selection advice | V1 styles, T20 ratings, this season's completed scorecards (`playerForm`) | Style balance against the rest of the match-day XI (without either option), only when the two options' styles differ; only spin or pace bowler; the style's first rating when at least 5 higher; recorded form. Fixed order, at most three. |

## Fact, flavour and suggestion

- **Fact:** every number in an introduction comes from the summary and is listed in its `facts` (a unit test checks every number in the text against them). A service-level unit test checks the summary against the historical statistics for every named player, and that the fixture about to be played is not counted. Rating lines quote the world's ratings; record lines quote completed scorecards.
- **Derived label:** styles are V1's names for rating patterns. The headline's choice of fact is a display rule.
- **Suggestion:** the style-balance lines are inferences and are labelled "Suggestion" on screen. No line claims that a choice changes the result; a unit test checks the wording for outcome claims.
- **Flavour:** unchanged from V1 (personality traits on the player page). Fictional players only.

## Determinism and the match engine

The match engine, its random streams, replays and results are unchanged. Nothing new crosses into the worker: the summary stays on the page and only the chip's text uses it. No persisted format changes. The pull request records `npm run vectors:check`, `npm run probability:check`, `npm run fixtures:engine` and `npm run world:check` on this branch.

## Layout

The introduction stays inside the V1 chip, so the active-players panel does not gain a line at 1366 by 768: the new browser spec checks that the active panel, the decision heading and "Next delivery" end above 768 px in a managed match, and that nothing overflows at 390 px. The visible headline is kept under about 32 characters (unit test). The selection advice adds two to three short lines inside each option card.

## Limitations

- **Reload.** The summary is held in memory. After a page reload during a managed match the chips fall back to the V1 style-only form; returning to the career and pressing "Play match" resumes the same match and hands the summary over again. Persisting it was ruled out to keep every save format unchanged.
- League T20 records only, as in V1: exhibition, tournament, tour and auction matches are not counted, and roster careers have no historical statistics, so they keep the V1 chip.
- The record is as it stood before this match. The chip does not update with runs scored in the match, and a batter who bowled earlier in the same match is introduced with his pre-match record. [Player identity V3](PLAYER_IDENTITY_V3.md) adds a live line when a milestone is close or reached.
- The selection advice appears only when the existing selection room does (round 2 onwards, when a like-for-like reserve exists). It compares the two options only; it does not suggest other changes to the XI.
- [Inference] Style balance has no measured effect under `synthetic-alpha-01`: `TACTICAL_VALIDATION.md` found selection matters through ratings, and bowling skills barely move outcomes. The advice therefore says it is not a prediction, and the labels will mean more once stage C calibration lands.
- Thresholds (three latest matches, a 5-point rating gap, three reasons) are design choices, not calibration.

## How to judge it (playtest questions)

Use the career-season evaluation (`CAREER_SEASON_EVALUATION.md`) and the V1 questions, with these additions. Record what is observed; do not score enjoyment on the participant's behalf.

1. When a batter walks out or a bowler comes on in a career match, does the participant read the chip aloud or comment on it? Do they open the full introduction (hover or screen reader)?
2. Does a milestone in reach ("12 from 500 runs") change how the participant watches that player's innings? Note what they say.
3. In the selection room, does the participant read the advice before choosing? Do they follow a suggestion, go against it, or ignore it? Ask why afterwards.
4. Does the participant take a suggestion as a promise of a better result? If so, note the wording they relied on.
5. Does any participant think a number in an introduction or a record line is wrong? Check it against the player page and the statistics screen.
6. After a page reload, does the participant notice the introductions became shorter?
