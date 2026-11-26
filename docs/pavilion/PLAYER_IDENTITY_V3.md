# Player identity V3 (`LC_PLAYER_IDENTITY_V3`)

Entertainment track, third slice, 26 November 2026. It follows [player identity V2](PLAYER_IDENTITY_V2.md) (#152), whose proposed next slice the owner approved: a live milestone line in the match, introductions for tournament, tour and auction matches where their records allow, and a link from the chip to the player page. This slice is **implemented** on the branch `pavilion/player-identity-3`. It is not integrated, human tested or accepted, and it makes no claim about enjoyment. It must merge after #152.

## What the player sees

- **Live milestone, managed career T20 match.** Once a batter has faced or a bowler has bowled in the innings, the chip that V2 turned back into the style alone now states a league milestone when one is genuinely close or has just been reached:
  - "8 more for 500 league runs", "One more for 500 league runs", "Reached 500 league runs";
  - "2 more for 25 league wickets", "One more for 25 league wickets", "Reached 25 league wickets".

  The chip's title and screen-reader text add the sum behind it, for example: "League runs: 480 before this match, 12 in this innings, 492 in all. 8 runs short of 500." When no milestone is close the chip is exactly the V2 chip. Before the first ball it is the V2 introduction, unchanged.
- **Chip link.** In a managed career match (standard careers) every chip is a button. It opens that player's page in career inspection, the same read-only mode as the existing "Inspect career" button: the match screen stays loaded behind it, and "Return to match" brings back the same ball, revision and worker. Its screen-reader name ends "Opens *name*'s player page; the match is kept." The back button on the page reads "Back to squad" for the managed team's players and "Back to statistics" for the opposition.
- **Exhibitions, quick matches, scenarios, tournaments, tours, auctions and roster careers:** unchanged. The chip is the V1 style chip, with no record, no live line and no link.

## Fact and suggestion

Everything this slice adds is **fact**: the live line is arithmetic on recorded numbers. There is no suggestion or prediction in it: it never says a player "should" or "will" reach anything, only how many are still needed or that the mark was passed.

| Part | Source | Rule |
| --- | --- | --- |
| Pre-match total | The V2 `CareerIntroSummary` (league runs and wickets before this match, from the career's historical statistics) | Unchanged from V2; held in memory only. |
| This innings | The match's own scorecard line for the player, as the worker reports it after each accepted command: the batting line's runs, or the bowling line's wickets | The same lines the career records when the result is returned (`completion.scorecard`), so a run-out is not a bowler's wicket in either. Only innings 1 and 2 count. |
| Milestones | The E6 steps (`PLAYER_IDENTITY_RULES`): every 500 runs, every 25 wickets | The same steps as the player page and the V2 walk-out line. |
| Close | `PLAYER_IDENTITY_V3_RULES` | Shown when **10 runs or fewer**, or **2 wickets or fewer**, are needed. |
| Reached | The same | Shown for the rest of the innings when the pre-match total was below a step and the total now is at or above it. A step passed before the match is never "reached" again. |

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

`packages/projections/src/player-identity-v3.ts` is pure: no clock, no `Math.random`, no simulation random stream, and it imports only the E6, V1 and V2 identity modules (unit tests check all three). It reads the scorecard the page already shows; nothing crosses into the worker and no command changes. `npm run vectors:check`, `npm run probability:check`, `npm run fixtures:engine` and `npm run world:check` pass on this branch (see the pull request). No persisted format changes.

## Layout

The live line replaces the style text inside the same chip, so the active-players panel gains no line. The browser spec checks that the active panel, the decision heading and "Next delivery" end above 768 px at 1366 by 768, and that no chip or page overflows at 390 px. A milestone is rarely close in round 1 of a new career, so the screenshots marked "illustrative" were taken in a scratch build with the thresholds widened to 500 runs and 25 wickets (never committed) to show the longest text in place; the same layout checks passed there.

## Limitations

- Milestones are every 500 runs and 25 wickets, so the live line is rare. [Inference, not measured] With 14 league matches a season, a regular batter is unlikely to pass more than one 500-run mark in a season. Smaller marks (a first fifty, 100 runs) were not added; the scoreboard already shows the innings score.
- **Reload.** As in V2, the summary is in memory. After a reload the chips lose the record, the live line and the link until the career launches the match again ("Play match" resumes it). A player page requested just before a reload is dropped and the career opens at its home screen.
- The opened page reflects the career before this match: it does not include the runs or wickets being scored now.
- The live total counts only the current innings' line. In a T20 a player bats once and bowls in one innings, so that is the whole match; super overs do not occur in career matches.
- The inspection view shows the existing "read-only because another tab owns its writer lease" notice, as "Inspect career" already does: it is the match screen holding the lease.
- Thresholds (10 runs, 2 wickets) are design choices, not calibration.

## How to judge it (playtest questions)

Use the career-season evaluation (`CAREER_SEASON_EVALUATION.md`) and the V1 and V2 questions, with these additions. Record what is observed; do not score enjoyment on the participant's behalf.

1. When a chip reads "8 more for 500 league runs", does the participant notice it without prompting? Do they mention it before the next ball, or slow down to watch?
2. When a milestone is reached, does the participant comment on it? Do they look for it afterwards (player page, statistics)?
3. Does anyone read a close milestone as a prediction or a promise? Note the words they use.
4. Does the participant discover that the chip opens the player page? Do they use it, and do they return to the match without hesitation?
5. After returning, does the participant check that the match is where they left it? Does anyone believe the match was reset or changed?
6. Does the dotted underline make the chip look like a link, or like an error?
