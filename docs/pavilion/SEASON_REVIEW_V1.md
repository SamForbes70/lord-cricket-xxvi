# Season review V1 (`LC_SEASON_REVIEW_V1`)

Directive 02, items C6 ("a rewarding season end") and D4 ("match, milestone and championship presentations"), first slice. The owner's success criterion includes that a player "finishes a season wanting to begin another". When the last league fixture of a career season is complete, the existing season finale (E9) now walks the player through a season review built only from what the season recorded.

**Status:** implemented and integrated on branch `pavilion/season-review` (draft pull request). Verified by automated tests only. Not human tested, not accepted. It makes no claim about enjoyment.

## What existed before

- **E9 season finale** (`apps/web/src/career/SeasonFinale.tsx`): on the Clubhouse, once per browser when the season is complete, three steps: the final table with "*Club* are champions", the board's verdict on the season objective (E2), and the season awards (Stage 10: Player of the Season, Leading Run-Scorer, Leading Wicket-Taker, Best Fielder, Emerging Youth Player). It can be replayed or skipped; "seen" is a per-browser `localStorage` flag, never part of the save.
- **End-of-season business:** "Close season & advance to Season N" rolls over: players age and develop (the lifecycle records each player's skill changes in a transition record), contracts that were not renewed expire to free agency, queued academy prospects are promoted, and the board's objective for the new season is worked out from the new squads.
- **Elsewhere:** Stage 11 story cards (career milestones at 500 runs and 25 wickets, board reviews, contract tension), the Statistics page (season and career tables), and the player page.

Nothing at the season end said how the title was won, what your club's season looked like, how your own cricketers did, or what the rollover was about to do.

## What the player sees

The finale keeps its place, its "seen once" behaviour, its replay button and its skip button ("Skip the review"). Its steps are now, in order (a step with nothing to show is left out):

1. **Champions.** The heading "*Club* are champions" and the final table as before, with two sentences above it:
   - how the title was won: "Copper Vale won the title with 20 points from 14 matches (10 won), 2 points clear of Aster Harbour. They were top from round 9 to the end." When level on points the sentence says which tie-break separated them (wins, net run rate, head-to-head points), in the league table's own order;
   - your club's season: "Aster Harbour finished 2nd with 9 won, 5 lost and 18 points. Their highest place was 1st, after round 3; their lowest was 5th, after round 1."
2. **Board verdict.** Unchanged from E9.
3. **The season in results.** Two lists, labelled and in round order:
   - your club: biggest win defending, quickest chase, heaviest defeats (batting second and defending), ties, the longest winning and losing runs, the worst collapse suffered and the best collapse forced;
   - league bests of the season: highest total, highest score and best bowling. From the second season on, a best that beats or equals every earlier season of this career's league says so ("A league record: the best before was 3/25 by *name* in Season 1.").
4. **Season awards.** "The league": the Stage 10 awards as before, plus **best economy in the league**. Then your club's own awards: **club player of the season**, **club top run scorer**, **club top wicket taker** and **club best economy**, each with its rule in small print under it.
5. **Your cricketers' seasons.** A table of every player who played a league match for your club this season (matches, runs, highest score, wickets, economy, best figures), then "League milestones this season" (for example "Passed 250 league runs (312 in all).", "First league fifty (best 67).", "First league wicket.", "First league season."), then "Development before this season": the skill changes recorded when the previous season closed, for players then at your club, split into improved and declined. In the first season it says that no season has closed yet, so none is recorded.
6. **Looking ahead to Season N.** Three sentences: which contracts at your club end with this season (and that a contract not renewed by the close ends then, the player joining the free-agent pool); how many prospects from this season's academy intake are waiting and which are queued for promotion at the close; and that closing the season ages and develops players and sets the board's next objective from the squads after those changes. A note points to the Office (renewals) and the Squad page (academy).

Navigation: "Continue: *next step*" and "Back" buttons; after either, keyboard and screen-reader focus moves to the new step's heading. A visually hidden label after the "SEASON REVIEW · 3 OF 6" line names the step. Tables have captions (visually hidden), column headers with `scope`, player names as row headers, and abbreviations with titles. An empty figure is a dot to the eye and "none" to a screen reader. Single-season (V0.1) saves show steps 1 to 5; they have no next season.

Screenshots (local only, not committed) are listed in the pull request.

## Where it comes from

- `packages/projections/src/season-review.ts`: `projectSeasonReview`, a pure function of the season's completed fixtures (scorecards with fall of wickets, selected elevens, results), the applied results that build the live table, earlier seasons' completed fixtures, the lifecycle transition whose `toSeasonNumber` is this season, and the club's current contracts and academy. It reads no clock, no `Math.random` and no simulation random stream. It returns sentences together with the facts behind them; a unit test checks that every number in a sentence is one of its facts, and that the result does not depend on the order of its inputs.
- `apps/web/src/career/HomeScreen.tsx`: builds the review only while the finale is open, from data the Clubhouse already holds. If it cannot be built, the finale falls back to the E9 steps.
- `apps/web/src/career/SeasonFinale.tsx` and `apps/web/src/pavilion.css`: presentation.

Nothing is saved. No persisted format, archive, command, event, contract schema or save changes. The simulation, the random stream, replays and results are untouched (`npm run vectors:check`, `probability:check`, `fixtures:engine` and `world:check` pass on this branch). The existing awards step still asks for the awards ledger to be brought up to date, as E9 did; that is unchanged.

## The rules (fixed for V1)

All values are in `SEASON_REVIEW_V1_RULES`. They are presentation choices, not calibration. Changing any of them needs a new version identifier.

| Part | Rule |
| --- | --- |
| Table after each round | `seasonTableAfter` over the applied results up to that round: the league's own ranking (points, wins, net run rate, head-to-head points). |
| Top from round | The first round from which the champion was first after every later round. "Top after every round" if from round 1; "went top in the final round" if only after round 14. |
| Highest and lowest place | Over the positions after each round; the first round at which each was reached. |
| Biggest win defending | Your largest win by runs. |
| Quickest chase | Your chase win with the most balls to spare (balls to spare = 120 less the legal balls of the chase); ties to more wickets in hand, then the earlier fixture. |
| Heaviest defeats | The same two rules for your defeats. |
| Ties | Every tie involving your club. |
| Runs of results | The longest run of consecutive wins, and of consecutive defeats, in round order, if 3 or more. A tie or no result ends a run. Equal runs: the earlier. |
| Collapse | From the scorecard's fall of wickets: at least 4 consecutive wickets for 25 runs or fewer, counted from the score at the wicket before the first of them (or from 0). Most wickets, then fewest runs, then the earlier fixture. "Suffered" when your club batted; "forced" when it bowled. |
| League bests | Highest innings total; highest individual score (ties to fewer balls); best bowling in an innings (most wickets, then fewest runs). Ties within a season: the earlier fixture. Compared with every earlier season of the career's league only when one exists: "a league record" if better, "equals the league record" if the same. |
| League best economy | Fewest runs an over with at least 20 overs bowled in the league season; ties to more overs, then player id. Compared by cross-multiplication, so no rounding decides it. |
| Club awards | Counted only in your club's matches, for your club. Player of the season: one point a run and 20 a wicket; ties to more wickets, then more runs. Top run scorer: most runs, ties to fewer balls faced. Top wicket taker: most wickets, ties to fewer runs conceded. Best economy: as the league's, with at least 10 overs. Final tie-break always player id. |
| Season lines | Your club's matches only: matches from the selected elevens, batting and bowling from the scorecard. |
| League milestones | The `LC_PLAYER_IDENTITY_V3` league marks, imported from `PLAYER_IDENTITY_V3_RULES`: runs 100, 250, 500, then every 500; wickets 10, 25, 50, then every 25. A mark passed this season is one above the player's league total before the season and at or below the total after it (all clubs, all league seasons of this career). If two are passed, the higher is stated. Also: first league fifty (V3's 50) or first league hundred (100), first league wicket, and "First league season" for a player with no earlier league match (not shown in Season 1, when it is true of everyone). |
| Development | The lifecycle's development reports for the rollover into this season, for players whose report names your club. Improved or declined by the sum of batting, bowling, fielding and keeping changes; stamina is listed but not counted. Largest change first. |
| Contracts ending | Your club's contracts with `expiresAfterSeasonNumber` at or before this season: the same test the Contracts screen uses for "expiring". |
| Academy | Your club's prospects generated in this season and not yet promoted: the ones the rollover considers for promotion; "queued" is the player's own setting. |

## Fact and inference

Everything shown is a recorded fact or arithmetic on recorded facts: scorecards, fall of wickets, the applied results, the lifecycle's development reports, contracts and the academy as they stand. The review never says why something happened, never predicts a result and never calls a player or result "brilliant" or "disappointing"; a unit test checks the sentences for causal and predictive words and for en or em dashes.

What is chosen, not measured:

- Which events are told, and the thresholds (4 wickets for 25 runs; runs of 3; 20 and 10 overs for economy; 20 points a wicket). [Inference] These were picked to give a short list in a typical season; how often each appears has not been measured.
- The club player of the season rule is deliberately simple so a player can check it. It is not the Stage 10 Player of the Season formula, which uses match impact points and may name someone else from the same club.
- "Looking ahead" states the queue and the rule; it does not say a queued prospect will be promoted (the rollover also respects the squad size limit and other rules) or which contracts the player will renew.

## Limitations

- **Development is shown one season late by design.** At the finale the season has not closed, so this season's development does not exist yet. The review shows the changes recorded when the previous season closed. A view of the rollover's results after it happens is not built (see next slice).
- **The next objective is not predicted.** It is set from the squads after development, which do not exist until the close.
- **Fielding is not in the club awards or season lines.** Catches and run-outs are only attributable from the event archives (Stage 10's Best Fielder); the review uses scorecards only.
- **League bests and milestones count this career's league only.** Exhibitions, scenarios, tournaments, tours and auctions are not counted, as on the Statistics page.
- **Records and milestone totals use the earlier seasons as the loaded career holds them** (`completedSeasons`, the same source as the E7 fixture preview). They are not checked against the Statistics page's historical projection.
- **The finale is still once per browser.** "See the season finale again" reopens it; another browser shows it again.
- **Not shown for a roster career** (no finale there).

## Playtest questions

For the independent full-season evaluations (Directive 02, E3), with `CAREER_SEASON_EVALUATION.md`. Record what the participant does and says; do not score enjoyment on their behalf.

1. Does the participant read the review or skip it? How long do they spend, and on which step?
2. Can they say, unprompted, how the title was won and where their club finished against the objective?
3. In "The season in results", do the items match what they remember of the season? Is anything they remember missing, or anything listed that they consider unimportant?
4. Do they name any of their own cricketers after reading "Your cricketers' seasons"? Do they comment on a milestone?
5. Do they understand the club award rules, and do they find them fair? Do they notice the club player of the season can differ from the league's Player of the Season?
6. Is "Development before this season" understood as last close's changes, or misread as this season's?
7. After "Looking ahead", do they go to renew a contract or check the academy before closing the season?
8. Do they close the season and start the next one in the same sitting? What do they say when they do?
9. Is the review too long at phone width? Do they use Back?

## Verification

Recorded in the pull request description, with the exact commands and the commit tested.
