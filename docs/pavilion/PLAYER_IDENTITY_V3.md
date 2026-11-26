# Player identity V3 (`LC_PLAYER_IDENTITY_V3`)

Entertainment track, third slice, 26 November 2026. It follows [player identity V2](PLAYER_IDENTITY_V2.md) (#152), whose proposed next slice the owner approved: a live milestone line in the match, introductions for tournament, tour and auction matches where their records allow, and a link from the chip to the player page. This slice is **implemented** on the branch `pavilion/player-identity-3`. It is not integrated, human tested or accepted, and it makes no claim about enjoyment. It must merge after #152.

## What the player sees

- **Live milestone, managed career T20 match.** Once a batter has faced or a bowler has bowled in the innings, the chip that V2 turned back into the style alone now states a league milestone when one is genuinely close or has just been reached:
  - league runs: "8 more for 100 league runs", "One more for 250 league runs", "Reached 500 league runs";
  - league wickets: "2 more for 10 league wickets", "One more for 25 league wickets", "Reached 50 league wickets";
  - firsts: "4 more for first league fifty", "First league fifty", "First league wicket".

  The chip's title and screen-reader text add the sum behind it, for example: "League runs: 480 before this match, 12 in this innings, 492 in all. 8 runs short of 500." When no milestone is close the chip is exactly the V2 chip. Before the first ball it is the V2 introduction, unchanged.
- **Chip link.** In a managed career match (standard careers) every chip is a button. It opens that player's page in career inspection, the same read-only mode as the existing "Inspect career" button: the match screen stays loaded behind it, and "Return to match" brings back the same ball, revision and worker. Its screen-reader name ends "Opens *name*'s player page; the match is kept." The back button on the page reads "Back to squad" for the managed team's players and "Back to statistics" for the opposition.
- **Exhibitions, quick matches, scenarios, tournaments, tours, auctions and roster careers:** unchanged. The chip is the V1 style chip, with no record, no live line and no link.

## Fact and suggestion

Everything this slice adds is **fact**: the live line is arithmetic on recorded numbers. There is no suggestion or prediction in it: it never says a player "should" or "will" reach anything, only how many are still needed or that the mark was passed.

| Part | Source | Rule |
| --- | --- | --- |
| Pre-match total | The V2 `CareerIntroSummary` (league runs and wickets before this match, from the career's historical statistics) | Unchanged from V2; held in memory only. |
| This innings | The match's own scorecard line for the player, as the worker reports it after each accepted command: the batting line's runs, or the bowling line's wickets | The same lines the career records when the result is returned (`completion.scorecard`), so a run-out is not a bowler's wicket in either. Only innings 1 and 2 count. |
| League marks | `PLAYER_IDENTITY_V3_RULES` | Runs: 100, 250, 500, then every 500 (1000, 1500 and so on). Wickets: 10, 25, 50, then every 25 (75, 100 and so on). Smaller than the E6 career steps (500 runs, 25 wickets) that the player page and the V2 walk-out line use, so that a mark can come up within a season. |
| First league fifty | The pre-match fifties and hundreds, and this innings' runs | Only for a batter with no league fifty or hundred before this match. Close from 40 in this innings; reached at 50. |
| First league wicket | The pre-match wickets, and this innings' wickets | Only for a bowler with no league wicket before this match. Shown only once taken: "one wicket short" would apply to every bowler without one, so it is never shown as close. |
| Close | `PLAYER_IDENTITY_V3_RULES` | Shown when **10 runs or fewer**, or **2 wickets or fewer**, are needed. |
| Reached | The same | Shown for the rest of the innings when the mark was passed in this innings: the pre-match total was below it and the total now is at or above it (for a first fifty, 50 or more in this innings). A mark passed before the match is never "reached" again. If two league marks are passed in one innings, the higher is stated. |
| Which one | The same | One line per chip: a league mark reached, then a first fifty or first wicket reached, then a league mark close, then a first fifty close. |

Every number in the text is listed in its `facts`, and a unit test checks this across a sweep of totals. The visible text is at most 32 characters (unit test).

## Navigation from the match screen

The match is never left. The chip calls the existing inspection route: the root keeps the hidden match screen mounted (`lcxxvi-inspecting-match`, already used by "Inspect career"), and the career opens with `inspectionOnly`, which disables every career change. Which player to open is handed over in memory (`requestInspectPlayer` in `apps/web/src/match/career-intro-handoff.ts`) and taken once when the career finishes loading. Nothing new is written to sessionStorage, localStorage, IndexedDB or any export. The button is disabled while a command or a simulated batch is running, as "Inspect career" is, and is not offered once the result is in. Roster careers are left out: their career screen has no player page to open.

The browser spec checks that the career checkpoint (save id, revision, checkpoint serial) is unchanged after opening the page, and that the match comes back on the same revision and phase with one match worker.

## Tournament, tour and auction matches: no introductions from records

Not built, because the records do not exist. A tournament run stores, for each match, only the team totals, the result text and the final event hash (`TournamentResultSchema` in `packages/contracts/src/custom-competition.ts`); tours store their definitions and auctions their bids. No player's runs or wickets in those matches are kept anywhere. Two ways round that were rejected:

- **Your own played matches only.** Their saves exist (`auto:` games), but a record built only from the matches you played yourself would be misread as the player's tournament record.
- **Replaying the simulated matches.** The engine is deterministic and each result carries `lastEventHash`, so the scorecards could be rebuilt and checked. That is a recomputation of every earlier match in the run (a run holds up to 64 results) on every launch, not a recorded statistic, and it was outside this slice.

Those matches therefore keep the V1 style-only chip (unit test and browser spec).

## Determinism and the match engine

`packages/projections/src/player-identity-v3.ts` is pure: no clock, no `Math.random`, no simulation random stream, and it imports only the V1 and V2 identity modules (unit tests check all three). It reads the scorecard the page already shows; nothing crosses into the worker and no command changes. `npm run vectors:check`, `npm run probability:check`, `npm run fixtures:engine` and `npm run world:check` pass on this branch (see the pull request). No persisted format changes.

## Layout

The live line replaces the style text inside the same chip, so the active-players panel gains no line. The browser spec checks that the active panel, the decision heading and "Next delivery" end above 768 px at 1366 by 768, and that no chip or page overflows at 390 px. A milestone is rarely close in round 1 of a new career, so the screenshots marked "illustrative" were taken in a scratch build with the thresholds widened to 500 runs and 25 wickets (never committed) to show the longest text in place; the same layout checks passed there.

## Limitations

- The marks (100, 250, 500 runs; 10, 25, 50 wickets; first fifty and first wicket) were chosen so that a line can come up within a season. [Inference, not measured] How often it appears in a season has not been measured. The first-fifty line repeats something the scoreboard already shows (the innings score) with the career fact that it would be the first.
- The player page's milestones and the V2 walk-out line still use the E6 steps (500 runs, 25 wickets), so a batter on 240 walks out with "240 runs, best 61" and, after the first ball, the live line reads "10 more for 250 league runs". Both are true; they use different steps.
- **Reload.** As in V2, the summary is in memory. After a reload the chips lose the record, the live line and the link until the career launches the match again ("Play match" resumes it). A player page requested just before a reload is dropped and the career opens at its home screen.
- The opened page reflects the career before this match: it does not include the runs or wickets being scored now.
- The live total counts only the current innings' line. In a T20 a player bats once and bowls in one innings, so that is the whole match; super overs do not occur in career matches.
- The inspection view shows the existing "read-only because another tab owns its writer lease" notice, as "Inspect career" already does: it is the match screen holding the lease.
- Thresholds (10 runs, 2 wickets) and the marks are design choices, not calibration.

## How to judge it (playtest questions)

Use the career-season evaluation (`CAREER_SEASON_EVALUATION.md`) and the V1 and V2 questions, with these additions. Record what is observed; do not score enjoyment on the participant's behalf.

1. When a chip reads "8 more for 100 league runs" or "4 more for first league fifty", does the participant notice it without prompting? Do they mention it before the next ball, or slow down to watch?
2. When a milestone is reached, does the participant comment on it? Do they look for it afterwards (player page, statistics)?
3. Does anyone read a close milestone as a prediction or a promise? Note the words they use.
4. Does the participant discover that the chip opens the player page? Do they use it, and do they return to the match without hesitation?
5. After returning, does the participant check that the match is where they left it? Does anyone believe the match was reset or changed?
6. Does the dotted underline make the chip look like a link, or like an error?
