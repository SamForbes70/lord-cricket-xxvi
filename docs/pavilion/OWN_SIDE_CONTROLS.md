# Own-side tactical controls

Written 26 November 2026. Branch `pavilion/own-side-controls`.

## The defect

On the match screen the Tactics panel showed "Aggression for ..." controls for the two batters at the crease, and they were enabled for whichever side was batting. In a match where the computer captain runs one side (a career match, a quick match, an exhibition with a computer opponent, a scenario, a tournament, tour or auction match) the player could set the opposition's batter plan. The computer captain then set its own batter's plan back on the same ball, so the control appeared to do nothing, and for a moment the player was acting for the opponent. This is the same kind of fairness problem as the decision panel race fixed in #160.

The same held for the rest of the plan controls: the bowling plan (effort, line, length, "Apply bowling plan"), the named field ("Field for ...", "Apply named field"), the live field diagram's keyboard and pointer placement ("Apply field on diagram") and the tactical assistant's presets were all enabled for the computer's side.

## Evidence

- `apps/web/src/main.tsx` (`Tactics`, before this change): every control sat inside one fieldset disabled only by `busy || fatal`; nothing compared the batting or bowling side with `aiTeamId`.
- `act()` resolves a `SET_BATTING_PLAN` to the batting side and sends it with actor `USER:<that side>`; the worker's controller (`execute` in `apps/web/src/match/controller.ts`) only checks that the actor matches the side, so it accepted a person's command for the computer's side.
- Two independent investigations reproduced it, and `tests/ui/post-match-analysis-archive.spec.ts` had to be changed in #165 because the shared helper could set an opponent batter's plan, which the computer captain undid on the same ball.

Controls already correct and left alone: the decision panel (batter and bowler picks, toss, bat or bowl), which only offers the side whose decision it is and is busy while the computer acts (#160); the captain's highlights panel (`CloseFinish`), which sets plans only for the player's side; and the super-over panel, which already compares with `aiTeamId`.

## The fix

Input layer only. `apps/web/src/match/side-control.ts` holds the rule: the person may set plans for a side unless the computer captain runs it (`aiTeamId`). With no computer side ("Manual decisions for both teams") every control stays enabled, as before.

- Tactics panel: the opposition's aggression controls, or its bowling plan and field controls, are disabled. A note says "Set by the opposition captain" and names the side, and each disabled control points to it with `aria-describedby`. The "Recommended" tags are not shown on controls the person cannot use.
- Live field: the diagram and its keyboard controls are not editable for the computer's fielding side, with the same note.
- Tactical assistant: presets for the computer's side are disabled, with the same note.
- `act()` refuses to send a batting plan, bowling plan or field command for the computer's side, whichever panel it comes from.

## Compatibility

The engine, worker and controller are unchanged and still accept such commands. A saved match, recovery or replay that already holds a person's command for the computer's side rehydrates exactly as before. There is no new guard in the worker or controller, so none can reject a command during rehydration or replay. `tests/unit/own-side-controls.test.ts` proves it: it plays a T20 match through the controller with three person-sent batting plans for the computer's side, then checks that rehydration and a controller restore give the same event hash, events, scorecard and saved session.

No simulation, randomness, result or persisted format changes. Matches where the player runs both sides behave as before.

## Not changed

The match settings' "Tactical captain" selector still lets the player switch the computer side to manual control, including in a career match. That is a match-mode setting rather than a plan control, so changing it is left to the owner.

## Tests

- `tests/unit/own-side-controls.test.ts`: the rule, and rehydration of a saved match with an opposition plan command.
- `tests/ui/own-side-controls.spec.ts`: in a career match and in an exhibition with a computer opponent, each side's controls in both innings; with manual control of both teams, every control is enabled.

## Opposition lock in career and scenario matches

Owner decision, 26 November 2026: in a career match (the player's league fixture) and in a scenario challenge, the other side is always the computer captain.

- `apps/web/src/main.tsx`: the "Tactical captain" select is disabled in those matches, and `changeAiOpponent` ignores any change. The note beside it reads "In a career match the opposition is always the computer captain." or "In a scenario the opposition is always the computer captain."
- Exhibitions and quick matches are unchanged. The player can still choose either side, or neither.
- **Tournament fixtures (added 27 November 2026, branch `pavilion/tournament-opponent-lock`).** The player's own tournament, tour or auction match is locked the same way. The note reads "In a tournament match the opposition is always the computer captain." See "Opposition lock in tournament fixtures" below.
- **Test changes:** `tests/ui/roster-career.spec.ts`, `tests/ui/player-identity-v3.spec.ts`, `tests/ui/managed-recovery.spec.ts` and `tests/ui/match-navigation.spec.ts` used to switch a career match to manual control. They now check the lock and play against the computer captain through `tests/ui/computer-opponent-helpers.ts`, which clicks the player's decisions and waits for the computer's. `tests/ui/scenario-mode-stage12.spec.ts` checks the lock in a scenario.
- The first CI run (`3f0da3b`, run 45913872561) failed 13 tests in `managed-recovery.spec.ts` and `match-navigation.spec.ts` on Windows Chromium and Firefox. Those specs still switched to manual control, and I had missed them.
- The engine, the worker and saved data are unchanged.

| Check | Command | Result |
| --- | --- | --- |
| Type check | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b`; `npm run typecheck` | PASS (exit 0) |
| Career specs after the fix (`62d7499`) | same command with `tests/ui/managed-recovery.spec.ts tests/ui/match-navigation.spec.ts tests/ui/roster-career.spec.ts tests/ui/player-identity-v3.spec.ts` | PASS, 17 passed (19.9 min) |
| `npm run lint` at `62d7499` | | PASS (exit 0) |
| Affected specs | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.ui.config.ts tests/ui/roster-career.spec.ts tests/ui/player-identity-v3.spec.ts tests/ui/scenario-mode-stage12.spec.ts --project=chromium --reporter=line --trace off` at `127bf30` | PASS, 9 passed (2.3 min) |

## Opposition lock in tournament fixtures

When this lock was added for careers and scenarios, tournament fixtures were left out: the page set the computer opponent when a fixture launched, but after a reload it did not know the match was a tournament fixture. It must not guess that from the game id (`tour-<runId>-m<n>`).

- **What the worker reports.** Every worker response that goes through `decorate`, and the reply to each committed command, now carries `tournament`: the stored run and fixture the open match belongs to, or null (`TournamentBinding` in `apps/web/src/match/protocol.ts`: `runId`, `competitionId`, `fixtureId`, the fixture's two teams home first, and `auctionPlayerTeamId`). It is a page-worker message only and is never stored.
- **From which stored data.** `findTournamentBinding` (`apps/web/src/tournament/tournament-binding.ts`) reads the stored tournament runs (`listTournamentRuns`), finds each run's competition (curated pack, `listUserCompetitions`, or a tour from `listUserTours`), expands it into fixtures with the same `viewTournament` the Tournaments screen uses, and binds the match only when its setup carries exactly one fixture's game id, match id, seed, teams (home first) and ground. The run's stored auction (`listTournamentAuctions`) gives the team the player bid for, when there is one. Only the tournament's own save lineage counts (`auto:<gameId>` or a recovered copy), as for a career binding; a manual copy or an import plays as an exhibition. The result is cached per save and match, so the records are read once per opened match.
- **Which side is the computer's.** The page takes the player's team from the per-browser choice made on the Tournaments screen (`lcxxvi-tournament-team:<runId>` in localStorage), else the team bid for in the auction: the same order the Tournaments screen uses. The computer captain plays the fixture's other team. The page sets that as the tactical captain's side, disables the "Tactical captain" select and `changeAiOpponent` ignores changes.
- **Survives a reload.** The page no longer depends on this tab's remembered opponent (`lcxxvi-optional-ai-team` in sessionStorage): the worker reports the binding again after the match is restored. `tests/ui/tournament-opponent-lock.spec.ts` removes that sessionStorage entry before reloading and checks the lock again.
- **Not locked when the player's team is unknown.** If neither the browser's choice nor the auction names one of the fixture's teams (for example, site data was partly cleared, so the localStorage choice is gone, in a run without an auction), the page does not know which side is the player's, so it does not lock. The Tournaments screen also cannot launch such a match until a team is chosen again.
- **Unchanged:** stored records and saved games (no persisted format changes), the engines, the computer captain's per-ball steps in the worker (`ADVANCE_WITH_CAPTAINS`, which still takes the page's computer side), and the tournament banner and "TOURNAMENT MATCHDAY" heading, which still key on the match id as before.
- **Tests:** `tests/unit/tournament-binding.test.ts` (binding found only for an exact stored fixture; auction team; computer side) and `tests/ui/tournament-opponent-lock.spec.ts` (lock on launch, after a few steps, and after a reload without the remembered opponent). No existing spec changed the tournament opponent select, so none needed changing.
