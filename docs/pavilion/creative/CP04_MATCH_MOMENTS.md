# CP04 match moments and CP11 result card

Studio Production Directive 05, passes CP04 (match events, motion and atmosphere) and CP11 (results, awards and championships), first slice. Branch `pavilion/cp04-moments-result`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a playtest**. No person has seen it yet. Anything not measured directly is labelled [Inference].

Baseline: `main` at `907ced6` (CP03 merged). The defects addressed are in [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md): CD-016 (no moment for big events), CD-017 (scorecard shows OUT with no dismissal), CD-024 (flat result), and a follow-up to CD-023. The principles are from [CP01_COMPETITIVE_BENCHMARK.md](CP01_COMPETITIVE_BENCHMARK.md): milestones land briefly without hiding the score (principle 10), and interruptions are rare and under the player's control (principle 6).

## Problem

A six, a wicket and a dot ball looked almost the same: the "This ball" panel changed its word and flashed. During Finish innings or Finish match that flash replayed for every over the batch passed through. The scorecard printed "Out" with no mode, bowler or fielder. Full time was a heading, two scores and a gold name. The "This ball" card under the field read "Recorded sector 8 (LHB display sector 1)", and the line under the field said "Bowler:" for the bowler of the next over while the card above it described the last ball.

## What changed

Presentation only. No change to the engines, outcomes, random stream, commands, contracts or saved formats; no new runtime dependency, audio asset or network use. The unified advance (`ADVANCE_WITH_CAPTAINS`) and the computer captain and human boundaries are untouched: the moments read the views the page already receives and send nothing.

1. **Match moments** (`apps/web/src/match/match-moments.ts`, `MatchMomentBanner.tsx`, styles in `match-broadcast.css`). A short broadcast lower third over the "This ball" panel: a portrait (or the winner's crest at full time), the word, one sentence and the figures. It never covers the score bug or the decision panel, it blocks nothing (every control stays usable), and it clears itself after 3.2 s (Full), 1.8 s (Brief) or 5 s and 3.6 s for the result, at once on its Dismiss button, and when the next ball is bowled. The timer pauses while the pointer or keyboard focus is on it. Dots, singles, twos and threes get nothing.
2. **Existing moment fixed rather than duplicated.** The stage flash and lift from the earlier broadcast pass stay for single balls, but are switched off while a batched advance runs (`data-quiet`), so a Finish match no longer replays a flash for every over.
3. **Match moments setting**: Full, Brief or Off, under Match settings on the match screen and in the career's Settings. Brief is one slim line along the foot of the panel with no portrait, so the ball call stays readable.
4. **Result card** (CP11, `apps/web/src/match/result-card.ts`, the `ResultMoment` card in `main.tsx`). At full time the decision panel shows: "Victory for" or "Defeat for" the player's side (when the player captained one side); both scores with crests, the winner in gold; the margin explained in plain words ("Moonstone Bay reached the target with 4 wickets in hand and 2 balls to spare", "Aster Harbour finished 3 runs short of the target", "The scores finished level"); the player of the match with their procedural portrait and line; the best batting and bowling of each innings with the side's crest; up to two turning points from the post-match analysis; and, in a career match, a primary **Continue to career** button with a line saying the table and next fixture are waiting there. Exhibitions keep "Scorecard and match report" as the primary action. A defeat is explained by its margin and turning points; there is no judgement in the copy. The routine-picks switch is hidden at full time, where it no longer applies.
5. **Scorecard dismissal text** (CD-017, `apps/web/src/match/dismissal-text.ts`). Each batter's row prints how they were out from the innings ledger's recorded dismissal: `c Fielder b Bowler`, `c & b Bowler`, `c †Keeper b Bowler`, `b Bowler`, `lbw b Bowler`, `st †Keeper b Bowler`, `run out (Fielder)`, `hit wicket b Bowler`, `not out`, `did not bat`. The dagger marks the wicketkeeper, as printed scorecards do. The CSV export is unchanged.
6. **CP03 follow-ups.** The "This ball" card under the field reads in plain words ("Ball 6.4: A yorker, off the edge."), from the cue's recorded length and trajectory; the sector record is behind a "Tracking detail" disclosure. The field legend says "Bowling next:" when the current bowler differs from the last ball's bowler (an over break), "Bowler:" otherwise.

## Data source for each moment

Every moment is derived from the authoritative view the worker sends; nothing is predicted or simulated in the page. A baseline is a copy of counters from the last view the moments looked at, so the page can see what changed between two drawn views.

| Moment | Source in the view | Rule |
| --- | --- | --- |
| Four, six | `fieldPresentation.recentHighlights` (committed delivery cues), `boundary` | A cue newer than the baseline with `boundary` FOUR or SIX |
| Wicket, with how out | The cue's `dismissalKind`, and the innings ledger's `dismissals[playerId]` (kind, credited bowler, fielder) | A cue newer than the baseline with a dismissal; the batter is the striker except for a run out, which is matched by name in the ledger |
| Fifty, hundred | Innings ledger `batting[playerId].runs` | The batter's runs cross 50 or 100 between baseline and view (a hundred replaces the fifty if both are crossed) |
| Five wickets | Innings ledger `bowling[playerId].wickets` | The bowler's wickets cross 5 |
| Maiden over | Innings ledger `bowling[playerId].maidens` (the engine's own maiden count) | The counter increases |
| Hat-trick | Committed delivery cues | The bowler's last three deliveries of the innings (wides and no-balls included) each took a wicket credited to the bowler (bowled, lbw, caught, stumped, hit wicket). The cues hold the latest 24 deliveries; older ones are dropped first, so a bowler's latest three are complete whenever three are present |
| Result | `resultText` and `scorecard.result` | `resultText` becomes non-null |
| Batch tally | Innings ledgers (`runs`, `wickets`, `legalBalls`, batters' `fours` and `sixes`) | Differences between baseline and view, so nothing is lost if the page skips drawing an intermediate view |

## The batching rule

- **Single replies** (Next delivery, Finish over, a close-finish passage step): the moment is settled at once. Finish over is one reply covering the rest of the over, so it shows at most one moment, the over's most significant, with a tally such as "In those 2 balls: 8 runs, 1 six."
- **Batched advances** (Finish innings, Finish match, Next key moment, and any resume after the computer captain's own decision): no moment is shown while the batch runs, and the one on screen is cleared when it starts. The baseline is kept from the start of the batch. When the batch ends, at most one moment is shown: the most significant event of the whole batch, with a one-line tally from the ledgers ("In those 3 overs: 26 runs, 2 wickets, 2 fours, 1 six."). At full time the result moment takes precedence.
- **Order of significance:** result, hat-trick, five wickets, hundred, wicket, fifty, six, four, maiden; the latest of equals.
- Moments never queue: a new one replaces the one on screen, and nothing from a finished batch is replayed afterwards. A load, a new match or a rewind resets the baseline and shows nothing.

## The setting and where it is stored

"Match moments: Full / Brief / Off" is stored in the browser's `localStorage` under `lcxxvi-match-moments`, exactly as the other match presentation preferences (`lcxxvi-match-commentary`, `lcxxvi-highlight-pacing`, `lcxxvi-highlight-motion`). It is per browser, not part of any career save, match save or portable `.lcxxvi` archive, so no versioned format is widened. An unknown stored value reads as Full. Off also stops the moment's animations entirely.

## Player of the match rule

The card does not rank players. It shows the game's existing award, `LC_AWARDS_HEURISTIC_GAME_V1` (`view.matchAward`, worked out in the match worker from the scorecard and events, the same award the result section and career records already show; its formula is explained under "How this award is worked out" below the result). When the award is not made (no result), the card shows no player. Top performances use the ordering the career match report already uses (`packages/projections/src/match-report.ts`): most runs then fewer balls; most wickets then fewer runs conceded; one batter and one bowler per innings.

## Before and after evidence

Captured with [`scripts/cp04-capture.mjs`](../../../scripts/cp04-capture.mjs) (a cut-down copy of `scripts/cp03-capture.mjs`), headless Chromium from `/opt/pw-browsers`, against `vite preview`. A career match against the computer captain (Aster Harbour) played ball by ball until a boundary and then a wicket, then Finish over until a moment, then Finish innings to full time. Each run is a new career, so the scores differ between captures. A moment clears itself, so the script rests the pointer on it before each screenshot (which pauses its timer).

- Before (`907ced6`, `main`): [`cp04/before/`](cp04/before/), 16 WebP (the stage at the same events; no moment existed).
- After (`264e6c3`, this branch): [`cp04/screens/`](cp04/screens/), 21 WebP at 1366x768, 1920x1080 and 390x844: `41` four or six, `42` wicket, `43` Brief, `44` batched Finish over, `45` result card (with crops), `46` scorecard, `47` This ball card, `48` reduced motion.
- Best three: [`42-moment-wicket_1366x768`](cp04/screens/42-moment-wicket_1366x768.webp), [`45-crop-result-card_1366x768`](cp04/screens/45-crop-result-card_1366x768.webp), [`44-moment-finish-over_1366x768`](cp04/screens/44-moment-finish-over_1366x768.webp).

Horizontal overflow was 0 px in every after capture.

## Measurements

Quick match against the computer captain, 1366x768, headless Chromium, shared 4-core Linux container (local numbers, not the owner's PC). Before and after builds were served side by side and measured one after the other with nothing else running.

| Measure | Before `907ced6` | After (`988f74a`; the later commit changes only the result card's markup) |
| --- | --- | --- |
| Finish over, median ms per ball (8 overs) | 34 (an earlier run while builds were running: 48) | 38, 40 |
| Finish match, ms per ball, from the first READY to full time (Finish match pressed again after each stop at a decision) | 75 (198 balls, 11 presses); earlier run under load: 82 | 77 (194 balls, 13 presses), 78 (192 balls, 11 presses) |

[Inference] No material regression: the after medians are within the before runs' own spread (34 to 48 ms for Finish over). The derivation runs once per drawn view and walks at most 24 cues and the two ledgers.

Animations and transitions started during one Finish match (counted from `animationstart` and `transitionstart`, one quick match each):

| Build and setting | Balls | Presses of Finish match | All animation and transition starts | Starts inside a moment |
| --- | --- | --- | --- | --- |
| Before | 233 | 12 | 2,953 | 0 (no moments) |
| After, Match moments Full | 237 | 11 | 3,046 | 33 (11 moments, one per settled batch, three animated parts each) |
| After, Match moments Off | 192 | 7 | 1,638 | 0 |

The totals are dominated by button and control transitions as the panel toggles between busy and ready, so they scale with the number of stops, which differs from match to match. [Inference] The comparable figure is the moment column: Full adds at most one moment per batch, never one per ball.

## Accessibility

- **Reduced motion:** under `prefers-reduced-motion: reduce`, or the match's "Highlight motion: Reduced motion", the moment has no entrance, no word slide and no timer bar: a static caption. Measured with reduced motion set: 0 animation or transition starts from the start of a career match to the first moment, and the moment's computed `animation-name` is `none` on the panel and its timer.
- **Timing:** the moment pauses while hovered or focused and can be dismissed with a labelled button ("Dismiss moment"); nothing a player needs is only in a moment (the ball, scores and figures stay in the stage, the score bug, the batters panel and the scorecard).
- **Screen readers:** the moment is a labelled `aside` ("Match moment") and not a live region, so it does not add a second announcement to the existing audio captions and status lines [Inference: not tested with a screen reader]. Portraits and crests in the moment are decorative; the sentence names the player. Each top performance on the result card carries the side's name for screen readers. No screen reader was used: NOT RUN.
- **Contrast:** the moment's text uses the CP03 text tokens on `--surface-1` or darker (`--text-strong`, `--text-default`, `--text-muted`), whose ratios CP03 recorded; the coloured word uses the cricket tokens at 22 to 28 px [Inference: not re-walked with the contrast script].
- **No en or em dashes** in any new UI string (unit tested for the dismissal text).

## Checks

Local, Linux container (4 cores), Node 22, 27 November 2026. Browser suites ran in a clean clone (`git clone`, `npm ci`, `npm run build`) on local copies of the configs with changed ports; Chromium from `/opt/pw-browsers/chromium`, Firefox 1495 from `/opt/pw-browsers`. Code revision `264e6c3` unless stated; later commits add only this document, the ledger, the register, screenshots, and a unit test that writes its dash check as `\u2013` escapes (rerun: PASS, 16 of 16).

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build graph | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `264e6c3` | PASS (exit 0) |
| Typecheck incl. tests | `npm run typecheck` | `264e6c3` | PASS (exit 0) |
| Lint and boundaries | `npm run lint` | `264e6c3` | PASS (exit 0) |
| Build | `npm run build` (clean clone) | `264e6c3` | PASS (exit 0) |
| Unit, new derivations (moments, batching, dismissal text, result facts, plain ball words) | `npx vitest run tests/unit/match-moments-cp04.test.ts` | `264e6c3` | PASS, 16 of 16 |
| Unit, match screen | `npx vitest run --maxWorkers=1 tests/unit/match-moments-cp04.test.ts tests/unit/match-broadcast-cp03.test.ts tests/unit/match-ui.test.ts tests/unit/broadcast-stage.test.ts tests/unit/field-presentation-stage6.test.ts tests/unit/analytics-geometry.test.ts tests/unit/unified-advance.test.ts tests/unit/pavilion-key-moments.test.ts tests/unit/pavilion-routine-picks.test.ts tests/unit/guided-coach.test.ts tests/unit/scorecard-export.test.ts` | `264e6c3` | PASS, 60 of 60 (11 files) |
| Browser, Chromium, all of `tests/ui` | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.cp04.ui.config.ts tests/ui --project=chromium --reporter=line --trace off` (copy of `playwright.ui.config.ts` on port 4188) | `0eed06e` | PASS, 132 passed (40.9 min) |
| Browser, Chromium, all of `tests/ui` | same | `264e6c3` | CHROMIUM2_RESULT |
| Browser, Firefox, all of `tests/ui` | `npx playwright test --config playwright.cp04.ui.config.ts tests/ui --project=firefox --reporter=line --trace off` | `264e6c3` | PASS, 132 passed (1.1 h) |
| Browser, m6g portable, Chromium | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.cp04.m6g.config.ts --project=chromium --reporter=line` (copy of `playwright.m6g.portable.config.ts` on port 4193, with the local Chromium path) | `264e6c3` | PASS, 12 passed (2.7 min) |
| Browser, m6g portable, Firefox | `npx playwright test --config playwright.cp04.m6g.config.ts --project=firefox --reporter=line` | `264e6c3` | PASS, 12 passed (4.3 min) |
| Browser, m4 persistence, Chromium | `LCXXVI_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --config playwright.cp04.m4.config.ts --project=chromium-m4 --reporter=line` (copy of `playwright.m4.config.ts` on port 4192) | `264e6c3` | PASS, 17 passed (50 s) |
| Browser, m4 persistence, Firefox | `npx playwright test --config playwright.cp04.m4.config.ts --project=firefox-m4 --reporter=line` (the copy adds a Firefox project, which the original config does not have) | `264e6c3` | PASS, 17 passed (1.0 min) |
| Full unit suite (`npm run verify:09:core`) | not run locally | | NOT RUN (hosted CI runs it) |
| Screen reader | | | NOT RUN |
| Hosted CI | | | NOT RUN at the time of writing; the pull request records its runs |

No test was changed, skipped or weakened. The `0eed06e` to `264e6c3` change is the tally wording only ("In that over").

## Self-critique (as an independent creative director)

What now works: a wicket finally lands. The lower third over the ball panel, with the batter's portrait ringed in the wicket colour and "Walen Norbridge c Galen Zornden b Arven Valebridge, 3 (7)" in one line, reads like a broadcast caption and does not touch the score or the buttons. Finish over shows one moment with a tally instead of six flashes. The result card now ends the match: who won, how, who starred, where it turned, and one gold button back to the career.

Fixed during this pass after looking at the screenshots: the moment sat 8 px short of the stage at 390 px (margins collapse through the slot); dismissal text inherited the table header's capitals; a moment from an earlier ball stayed on screen after a quiet Finish over (it now clears when the next ball is bowled); the routine-picks switch sat between the result heading and the card; top performances did not say which side they were for (crests added).

What still looks amateur, in order:
1. At full time the result appears three times on the first screen for a few seconds (score bug, moment, decision heading). The moment should probably give way to the card at full time, or the score bug should show the margin only.
2. Brief mode covers the stage's own sentence; a better Brief would replace the stage's line rather than sit on it.
3. Moments have no sound of their own; the existing cue manager plays its four, six, wicket and milestone cues as before, which is right for this pass but means Full and Brief sound the same.
4. The score bug still repeats "Match phase: Innings 1". A partnership there would be better, but the live view has no partnership: the match analytics (and the scorecard's fall of wickets) are only produced at full time, and working it out in the page would be presentation-side cricket state. Recorded as a dependency.
5. The scorecard is still the light-theme form table that CP01 audited; only the dismissal line is new.
6. The result card's turning points are the analysis's sentences, which are accurate but flat ("lost 4 wickets for 21 runs in overs 7 to 9").

## Limitations and remaining work

- **Competition consequence and next fixture** are not on the match screen's card: the page holds no career state, and the table only moves when the result is applied to the career. Continue takes the player to the career, whose existing match report shows the table move and the Clubhouse the next fixture. Putting them on the card needs the career's projected table passed into the match page: a dependency, not built.
- **Partnership in the score bug:** needs a live partnership projection from the worker (see self-critique 4).
- The setting on the match screen and the career's Settings write the same key, but a match screen already open keeps its value until reloaded (the same as the existing highlight preferences).
- **Hat-trick** is never shown across innings, and a wide or no-ball between the three wickets breaks it (conservative rule).
- CD-019 (commentary clean-up) is not part of this slice.
- One career and one quick match per measurement; local container numbers only.
- Human testing outstanding.
