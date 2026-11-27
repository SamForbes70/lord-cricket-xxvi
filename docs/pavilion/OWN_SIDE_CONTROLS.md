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
- **Not covered: tournament fixtures.** The page sets the computer opponent when a fixture launches, but after a reload it no longer knows the match is a tournament fixture. A lock there needs the worker to report that binding, as it already does for career fixtures (`careerFixture`). This is remaining work.
- **Test changes:** `tests/ui/roster-career.spec.ts`, `tests/ui/player-identity-v3.spec.ts`, `tests/ui/managed-recovery.spec.ts` and `tests/ui/match-navigation.spec.ts` used to switch a career match to manual control. They now check the lock and play against the computer captain through `tests/ui/computer-opponent-helpers.ts`, which clicks the player's decisions and waits for the computer's. `tests/ui/scenario-mode-stage12.spec.ts` checks the lock in a scenario.
- The first CI run (`3f0da3b`, run 45913872561) failed 13 tests in `managed-recovery.spec.ts` and `match-navigation.spec.ts` on Windows Chromium and Firefox. Those specs still switched to manual control, and I had missed them.
- The engine, the worker and saved data are unchanged.

| Check | Command | Result |
| --- | --- | --- |
| Type check | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b`; `npm run typecheck` | PASS (exit 0) |
| Career specs after the fix (`62d7499`) | same command with `tests/ui/managed-recovery.spec.ts tests/ui/match-navigation.spec.ts tests/ui/roster-career.spec.ts tests/ui/player-identity-v3.spec.ts` | PASS, 17 passed (19.9 min) |
| `npm run lint` at `62d7499` | | PASS (exit 0) |
| Affected specs | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.ui.config.ts tests/ui/roster-career.spec.ts tests/ui/player-identity-v3.spec.ts tests/ui/scenario-mode-stage12.spec.ts --project=chromium --reporter=line --trace off` at `127bf30` | PASS, 9 passed (2.3 min) |
