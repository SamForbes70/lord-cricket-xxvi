# Unified advance: the same match whichever button is pressed

Written 27 November 2026. Branch `pavilion/unify-advance-captains`. Owner's Directive 03, "Match integrity": unify tactical decision processing across all match advancement modes, make outcomes identical when the starting conditions and decision policies are identical, and stop results changing because of presentation speed.

## Problem

The computer captain (and any choice the player delegated) acted through the page. After each worker reply the page sent `AI_STEP`, one command per request, until the computer had nothing more to do for the drawn view. How often that happened depended on the button:

| Button | Before this change |
| --- | --- |
| Next delivery | One ball per command; the computer was asked before every ball |
| Finish over | Since #168, one ball per command and an `AI_STEP` between balls, but only when a computer side or a delegation existed |
| Next decision, Finish innings, Finish match | One `ADVANCE { scope: "OVER" }` per command, continued directly in the reply handler; the computer was asked only when it was the side to decide (`resumeAfterAi`) |
| Next key moment | One ball per command, continued in the reply handler without the computer's plan steps |
| Passages (captain's highlights) | One ball per command with `AI_STEP` between balls |

Each ball's random draws are keyed by its attempt ordinal (`generate()` in `packages/simulation/src/t20-match.ts`), so with identical plans the balls are identical. Against a computer side the plans were not identical: in the batch modes its batting, bowling and field plans changed only at over ends or at its own decisions. The same seed could therefore give a different result depending on the button pressed. The unit test below shows one: a T20 with seed `unified-advance-t20` is won by 8 wickets when the computer is asked before every ball and by 6 wickets when "Finish match" is played the old way.

Per-ball steps from the page were also slow: each ball was a page and worker round trip plus a durable save, and each `AI_STEP` another.

## Design

One worker request, `ADVANCE_WITH_CAPTAINS` (`apps/web/src/match/protocol.ts`, field `advanceVersion: "LC_ADVANCE_WITH_CAPTAINS_V1"`), carries a scope (`DELIVERY` or `OVER`), the tactical captain's team (`aiTeamId`) and the two flags `AI_STEP` already carried (`matchAware`, `clubStyle`). The loop itself is `advanceWithCaptains` in `apps/web/src/match/advance-with-captains.ts`, a pure module with no IndexedDB or worker globals, so the unit tests run exactly the code the worker runs.

1. **Seats.** The computer acts for the tactical captain's side, then for each side with delegated categories, in the order the page's `dueAiStep()` used (`captainSeats`).
2. **Settle before every ball and after the last.** Each seat is asked for its proposal with the same function `AI_STEP` now uses (`proposeCaptainCommand`, which calls `proposeOpponentT20Command`, `proposeOpponentODICommand` or `proposeOpponentRed5Command` with the same arguments). When a seat has a command it is committed and the first seat is asked again, which is what happened when each committed `AI_STEP` changed the revision. Settling ends when no seat has a command.
3. **Bowl one delivery** as `ADVANCE { scope: "DELIVERY" }` with actor `SYSTEM`.
4. **Stop** when the scope ends (one ball, or the over number or innings changes), when a decision is due that no seat makes (the player's), at the end of the match, when the engine cannot bowl (`advanceReason`, for example an illegal field for a new striker), when the player asks it to stop, at a command limit (120 per request) or on an error. Settling also runs after the last ball, so the computer's plans are in place before the reply.
5. **No seat, no change.** With no computer side and nothing delegated there is nobody to ask between balls, so an `OVER` advance stays one engine `ADVANCE { scope: "OVER" }`, as before #168 and as #168 kept for that case. It bowls the same balls and saves one command instead of about six.

Every engine command is committed on its own through the worker's atomic save path before the next is chosen (`advanceRequest` in `apps/web/src/match/match.worker.ts`): the controller applies it, then `repository.commit` writes the snapshot, events and one command record, exactly as a `COMMAND` or `AI_STEP` did. Computer commands are saved with origin `AI` and actor `AI:<team>`; deliveries with origin `HUMAN` and actor `SYSTEM`, the same request shape the page sent. Command ids keep the `ui-N` form: the first is the request's own id, the rest follow it, and the reply's `commandIdFloor` moves the page's next id past them, as a reload already does.

The page now sends every advance through this request:

| Button | Request |
| --- | --- |
| Next delivery | One `ADVANCE_WITH_CAPTAINS { scope: "DELIVERY" }` |
| Finish over | One `ADVANCE_WITH_CAPTAINS { scope: "OVER" }` (the page's per-ball over run from #168 is removed) |
| Next decision, Finish innings, Finish match | The existing batch, each step one `ADVANCE_WITH_CAPTAINS { scope: "OVER" }` |
| Next key moment | The existing batch, each step one `ADVANCE_WITH_CAPTAINS { scope: "DELIVERY" }`; the page still finds the key moment between replies |
| Passages | Each step one `ADVANCE_WITH_CAPTAINS { scope: "DELIVERY" }` |

So the decision sequence is the same in every mode: settle, ball, settle, ball, and a stop at the player's own decisions. The modes differ only in where the page stops sending.

Kept as they were:

- **Routine picks (B2)** are still made by the page, between requests: an advance stops at the player's decision, the page sends the recommended pick as the player's command, and the batch carries on.
- **Held panel clicks** are still held while a request is in flight and applied against the next drawn view. During "Finish over" a held click also sends `STOP_ADVANCE`, so the over stops before its next ball and the click applies from that ball, as the #168 over run did.
- **"Stop simulation"** still ends a batch after the request in flight, and now also sends `STOP_ADVANCE`, so a long request stops before its next ball. A request always bowls at least its first ball.
- **`AI_STEP`** is unchanged and still answers the computer's choices that follow the player's own commands (the toss, a decision after a manual pick, plans after a manual plan change). After an advance the page marks every seat the worker settled as already asked for that revision, so it does not ask again.

### Why this design

The alternative was to keep the loop in the page and make every mode wait for `AI_STEP` between balls, as #168 did for "Finish over". That multiplies page round trips and still leaves the order of decisions to React effects. Inside the worker the order is fixed in one place and the page round trip per ball disappears. [Inference] It also makes the remaining per-ball cost (the save) the only one, which is where any further speed-up would come from.

### Speed

`peek()` was added to the three match controllers: a read-only view of the live session. The loop asks the seats with it instead of copying the whole session per ball (`snapshot()` is a `structuredClone`). Before that change the loop measured 149 ms a ball for a T20 "Finish match" against the computer; after it, 80 ms.

## Equivalence evidence

**Unit tests** (`tests/unit/unified-advance.test.ts`, `tests/unit/unified-advance-red-ball.test.ts`, harness `tests/unit/unified-advance-harness.ts`). One seed, fixed teams and the in-memory controllers the worker uses. The player's decisions follow a fixed policy (the fixture autopilot's choice, sent as the player's command); the computer's are its captain policy. Each match is played through the same `advanceWithCaptains` with the scopes each button sends, and the whole event log (type, payload and state hash of every event) and the scorecard must be identical.

| Test | Modes compared | Result |
| --- | --- | --- |
| T20, computer captain for the second team | one ball per request; one over per request; an irregular mix of the two | identical (197 deliveries, 51 computer commands) |
| same | the old batch (over per command, computer only at its decisions) | different, as expected: won by 6 wickets against 8 |
| T20, computer captain for the first team, club style and match-aware on, other side delegates batting plans and field | ball, over, mix | identical |
| T20, no computer side | ball; over (one engine command per over); the old batch | identical, and the over mode saves fewer commands |
| ODI, computer captain for the second team | ball, over | identical |
| Five-day red-ball, computer captain for the second team | ball, over | identical |

The tests also check, for every request, that the worker asked the seats before every ball it bowled (`consultedBeforeBall` has one entry per ball) and that it settled after the last (`settledRevision` equals the final revision), so the page's own `AI_STEP` has nothing left to do.

**Browser tests.**

- `tests/ui/finish-over-per-ball.spec.ts` (rewritten): a quick match against the computer, pressing each of Next delivery, Finish over, Next key moment, Next decision, Finish innings and Finish match. For every button it records the page's messages and the worker's replies: no bare `ADVANCE` command is sent; every advance is `ADVANCE_WITH_CAPTAINS` naming the computer's team with the expected scope; each reply reports the computer's seat consulted before every ball and settled after the last. At the end the saved command log is read from IndexedDB: every `ADVANCE` is a single delivery by `SYSTEM`, and the computer's commands are saved with origin `AI`.
- `tests/ui/unified-advance-equivalence.spec.ts` (new): the scenario "Hold the line" (fixed seed, the computer bats) played from its checkpoint twice, once with "Finish match" and once with repeated "Next delivery", picking the first available bowler each time. The saved deliveries, every event (type and payload), every command (ids and revisions aside) and the scenario outcome must be identical. Each attempt has its own game id, which the state hashes include, so the state hashes are not compared here; the unit tests compare them.
- Both specs **fail against the old page** (main `ba04017`, Chromium): the first because "Next delivery" sent bare `ADVANCE` commands, the second because 12 of the saved deliveries differed between "Finish match" and "Next delivery".

## Timings

Chromium on Linux, local container (4 cores, 16 GB), `tests/perf/unified-advance-timing.spec.ts` with `playwright.perf.config.ts`. Each run is a whole exhibition match from the first press to the result, with the player's choices made by the spec. "ai" means the second team is the computer captain; "manual" means manual decisions for both teams. Matches use a fresh random seed each run, so they differ in length: compare milliseconds per delivery as well as totals. Raw lines: `docs/pavilion/unified-advance/timings-before.jsonl` (main `ba04017`) and `timings-after.jsonl` (`6d1cdbb`). [Inference] Another agent's browser run was using the same machine during some of these runs, so differences of 20 to 30 per cent between single runs are within noise.

| Format | Mode | Opponent | Before: seconds (deliveries, ms per ball) | After: seconds (deliveries, ms per ball) |
| --- | --- | --- | --- | --- |
| T20 | Finish match | ai | 18.1 (218, 83) | 19.6 (245, 80) |
| T20 | Finish match | manual | 24.7 (242, 102) | 19.3 (222, 87) |
| T20 | Finish over | ai | 84.4 (244, 346) | 26.4 (220, 120) |
| T20 | Finish over | manual | 27.1 (229, 119) | 17.8 (219, 81) |
| ODI | Finish match | ai | 26.8 (378, 71) | 54.0 (495, 109) |
| ODI | Finish match | manual | 50.8 (548, 93) | 18.0 (224, 80) |
| ODI | Finish over | ai | 146.8 (444, 331) | 69.4 (509, 136) |
| ODI | Finish over | manual | 38.9 (376, 103) | 34.7 (396, 88) |
| Five-day | Finish match | ai | 147.4 (907, 163) | 176.3 (943, 187) |
| Five-day | Finish match | manual | 144.4 (976, 148) | 125.7 (1001, 126) |
| Five-day | Finish over | ai | 462.9 (1115, 415) | 192.4 (971, 198) |
| Five-day | Finish over | manual | 108.1 (791, 137) | 54.2 (572, 95) |

Reading the table:

- **"Finish over" against the computer is about two to three times faster per ball** (T20 346 to 120 ms, ODI 331 to 136 ms, five-day 415 to 198 ms): the page round trip and the separate `AI_STEP` per ball are gone.
- **"Finish match" against the computer is about the same to 50 per cent slower per ball** (T20 83 to 80, ODI 71 to 109, five-day 163 to 187 ms). Before, it saved one command per over and skipped the computer's steps between balls; it now saves one per ball plus the computer's commands, which is the price of asking the computer before every ball.
- **Manual matches** take the same path as before (one engine command per over); the differences are within the run-to-run noise.

The five-day manual match in `tests/ui/analytics-formats.spec.ts` (RED_BALL, 10-minute limit) is recorded in the validation table below.

## What is not covered

- **Persistence is still one durable write per engine command.** [Inference] Writing a whole request in one IndexedDB transaction would remove most of the remaining per-ball cost, and the saved rows would keep their shape. But it would change the recovery guarantee: today every command is durable before the next is chosen, so a crash mid-over keeps every ball already bowled; with one write per request a crash would lose the whole request. It would also change how often a checkpoint generation rotates. Under the working agreements that needs its own version and owner decision, so it is not done.
- **Each command still builds a full view** in the controller (`handle()` projects commentary, the field and the assistant from every event) because the saved command record holds that response. [Inference] Skipping the view for commands in the middle of a request would cut the cost further, but it changes the stored `responseJson`; it is left for a decision.
- **The super-over panel, the rain screen (`apps/web/src/rain/RainApp.tsx`) and the batch harness** are separate paths. Super overs already ask the tactical captain per choice; the rain screen has no computer captain.
- **`AI_STEP` remains** for the computer's answers to the player's own commands. The algorithm is the same (`proposeCaptainCommand` is shared, and the seat order is the same), and the unit tests play the page's `AI_STEP` loop between requests, but the two code paths are not merged.
- **`resumeAfterAi`** in the page is no longer reached in practice, because the worker makes the computer's decisions inside the advance. It is left in place and harmless.
- **The browser equivalence test** uses one T20 scenario. ODI and five-day equivalence is shown by the unit tests only.

## Limits and compatibility

- No change to the engines, rules, probability models, random streams or captain policies. `ai-opponent.ts` is unchanged; the proposal call moved into a shared helper with the same arguments.
- No change to any persisted format: the saved snapshot, event and command rows have the same shape, origins and actors as before; command ids keep the `ui-N` form; the delegation journal is untouched. Saved matches, replays, verification, recovery and export read them as before. The new request type exists only between the page and the worker, which are built together.
- Results against a computer side differ from before for the batch modes and for "Next key moment", because the computer now acts before every ball in them too. That is the purpose of the change. Matches with no computer side and nothing delegated are unchanged in every mode.
- A request commits at most 120 engine commands. An over with every plan changing each ball is far below that.

## Validation

Commands and results are recorded in the pull request description for the final head.
