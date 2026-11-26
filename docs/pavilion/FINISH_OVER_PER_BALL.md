# Finish over: the computer captain decides every ball

Owner direction, 26 November 2026: "Finish over" should let the computer decide per ball.

## Problem

"Finish over" sent one engine command, `ADVANCE { scope: "OVER" }`. The engine (`runAdvance` in `packages/simulation/src/t20-match.ts`, and the ODI and red-ball equivalents) bowled every remaining ball of the over inside that one command. The computer captain's step (`AI_STEP` in `apps/web/src/match/match.worker.ts`) runs between commands, so it could not act until the over ended. Batting plans are set per batter. A batter who took strike part way through the over therefore batted on an older plan, or on the engine default of aggression 2. Captain V5's measurement found the same fault in the batch harness (`docs/pavilion/CAPTAIN_V5_DEATH_OVERS.md`, section 2).

## Change

`apps/web/src/main.tsx` only. The engine, contracts, saved data and the worker are unchanged.

- "Finish over" now starts an over run. The page sends `ADVANCE { scope: "DELIVERY" }`, one ball at a time, until the over number or the innings changes.
- The next ball is sent only after the computer's step for the drawn view has been sent and answered. This uses the same `dueAiStep()` check and effect that a passage uses. Any delegated choices are made between balls in the same way.
- **When the run stops:** at a wicket, like the old command, if the player must choose the new batter. If the computer must choose, the run waits for its pick and carries on. The run also stops on an error, a read-only save, a finished match, an `advanceReason`, a new or loaded match, a passage starting or a held panel click. It has a limit of 40 commands.
- While the run lasts, the decision panel reports itself busy ("Applying…" and `aria-busy="true"`) and its controls are disabled. The offline-update coordinator treats the run as match activity.

Outcomes are unchanged when no plan changes. Each ball's random draws are keyed by the attempt ordinal, not by the command, so the same balls follow from the same plans. [Inference] With a computer opponent the results can differ from before, because its plans now apply from the ball on which it makes them. That is the intent.

## Not changed

- "Next delivery" was already one ball.
- **"Next decision", "Finish innings" and "Finish match"** still advance an over per command inside their batch. In those batches the computer acts only when it is the side to decide. Changing them to ball by ball would multiply the number of saved commands by about six for a whole match, so I left them out of this change. They are listed as remaining work.
- "Next key moment" already sends single deliveries. Its batch does not stop for the computer's plan steps either. This is also listed as remaining work.
- The rain screen (`apps/web/src/rain/RainApp.tsx`) has its own "Finish over" and has no computer captain.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Type check | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` and `npm run typecheck` (includes tests) | PASS (exit 0) |
| New spec | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.ui.config.ts tests/ui/finish-over-per-ball.spec.ts --project=chromium --reporter=line --trace off` | PASS, 1 test (19.2 s) |
| Every other spec in `tests/ui` that presses "Finish over" (20 files) | same command with those files, at `99c9533` (same code as this head; later commits are docs only) | PASS, 59 passed (44.5 min) |
| Inventory | `node scripts/check-pass07b-inventory.mjs` | PASS (exit 0) |
| New spec against the old page (main `5fc98e3`'s `main.tsx`) | same command | FAIL as expected: an `ADVANCE` with scope `OVER` was sent |

The spec records the page's messages to the match worker. It checks that every advance is a single delivery and that an `AI_STEP` was sent between consecutive balls and after the last one.
