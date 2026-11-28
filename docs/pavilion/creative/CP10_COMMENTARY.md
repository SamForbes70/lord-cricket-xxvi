# CP10 commentary

Studio Production Directive 05, pass CP10 (commentary), first slice. Branch `pavilion/cp10-commentary`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a playtest**. No person has read the new commentary yet. Anything not measured directly is labelled [Inference].

Baseline: `main` at `2e6e785` (CP08 merged). The defect addressed is CD-019 (P2) in [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md): "Plan log lines interleaved with ball commentary; numbered to 353; dashes", proposed fix "Separate Captain's notes; drop numbering; vary templates". It is the only commentary row in the register. Code: commit `4e0a75a`.

## Problem

On `main` at `2e6e785`, measured on the 100-match T20 corpus (`tests/fixtures/t20/seed_corpus.json`, fixture autopilot) and seen in the captures below:

- **A log, not commentary.** The panel numbered every entry by its event sequence ("353. Result: ..."), and the computer captain's plan changes sat between the balls ("350. Bowling plan for Rilan Ternford: stumps line, full length (conserve effort).").
- **Dashes.** 6,137 of the 31,848 corpus lines held an em dash, between "defended solidly" and "no run", or "Over 5 complete" and "2 off it".
- **Sameness.** 531 different line shapes (names and numbers aside) for 22,051 deliveries; 8.7% of delivery lines opened with the same three words as one of the three before (`scripts/cp10-commentary-variety.ts`, below). Within a template family, 32.7% of lines reused a template from the family's previous three lines (`scripts/pavilion-commentary-variety.ts`): the cooldown window was shared by all families, so a run of other lines let a dot-ball template come straight back.
- **Little cricket.** A ball's length, trajectory and direction were mostly reduced to a tacked-on "tidy stop at point"; boundaries were "crisp stroke through cover" whatever the length; edges and lofted shots read the same as drives.
- **Small errors.** "mid-off off Rilan Ternford" (double "off"); "(13 needed from 0 balls)" at the end of a failed chase; "mid-wicket" where the wagon wheel says "Midwicket"; figures as "1.0-0-7-1"; claims the event does not record ("Front-foot no-ball", "oversteps"); milestone badges in contract casing ("BATTER FIFTY").

## What changed

Presentation only. No change to the engines, outcomes, random stream, worker protocol, commands, contracts, adapter version (`LC_COMMENTARY_ADAPTER_V1`) or any saved format; commentary is projected from the committed events every time the view is built and is not persisted. No new runtime dependency, no network, no model.

1. **Specific to the delivery** (`packages/projections/src/commentary-phrases.ts`, new). A cricket vocabulary keyed only on what the `DELIVERY_RECORDED` event holds: the executed length (yorker, full, good length, short, full toss), how the ball came off the bat (along the ground, in the air, off the edge, or no contact) and the recorded shot sector. A short ball to sector 5 is "pulled through midwicket"; a full ball to sector 2 "driven through the covers"; an edge to sector 0 "edged down to third man"; a six to sector 3 goes "over long-off". A ball with no bat contact is never given a stroke ("Nothing off the bat from X: a good-length ball from Y"). Bowling leads come from the executed length ("bangs it in short", "spears in a yorker"). No line, pace, spin, footwork or fielding position is invented, and the unrecorded "front-foot" and "oversteps" claims are gone.
2. **Sector names** follow ADR 013's convention, as the wagon wheel does: third man, point, cover, mid-off, mid-on, midwicket, square leg, fine leg (sectors 0 to 7). The commentary now says "midwicket", the wagon wheel's spelling; a unit test holds the two lists equal. The open ADR 004 orientation conflict (the field template and live field diagram) is not resolved here; see the CP08 record.
3. **Context from the running figures** (`packages/projections/src/commentary.ts`): caught and bowled when the catcher is the bowler; a duck, a golden duck (out first ball) or a diamond duck (out without facing); the bowler's second and fourth wicket (third and fifth already had milestone lines); back-to-back boundaries by one batter and the third or later boundary of an over; the batter's score after some boundaries; six, nine and twelve dot balls in a row in limited-overs cricket; openers, the new ball, batting position on the way in, "Change of bowling: X to bowl over 7", a bowler's last over of the allowance; and the end of the powerplay (T20 overs 1 to 6, one-day Powerplay 1, the rules the live field already shows) with the score (`commentary-context.ts`). Every one is worked out from events already committed.
4. **Variety without randomness.** Template choice still starts from a hash of the presentation key (match id), the event's sequence and hash and the template family. CP10 keeps a recency window per family, covering three quarters of the pool (never less than the feed's cooldown window), and a template used for one of those recent lines is passed over for the next unused one. Phrase variants inside a template are chosen by hashing the same event data. No `Math.random`, clock or ambient API (the package boundary check enforces this, and a unit test scans the sources).
5. **Style.** No en or em dashes anywhere in the commentary (text, brief and detailed). Figures as overs-maidens-runs-wickets ("4-0-18-3", "2.3-0-14-1" mid-over). No chase equation once the overs are used up. Australian spelling.
6. **Captain's notes apart** (`apps/web/src/match/CommentaryPanel.tsx`, `commentary-view.ts`, `commentary.css`, new). Batting plans, bowling plans and field changes leave the ball-by-ball list for a collapsed "Captain's notes (N)" list under it, latest first, each with when it was made ("After 7.4", "Innings 2, after 3.1", "Before the first ball"). Their wording is now plain: "Rilan Ternford will bowl full at the stumps, within themselves.", "Oren Kelwell will bat with a balanced approach, looking to rotate the strike." The feed itself still has one entry per event, as the existing tests require.
7. **Panel layout.** No list numbering. Each ball's number ("7.4") is a small label at the start of its line (wicket balls on the wicket fill, milestone balls on the six fill); the line's text is unchanged, with "Innings 1, " and ": " kept for screen readers and copied text. Over summaries, innings changes and the result are bands with a gold rule, so the overs read as groups; selections (who bats, who bowls) are quieter. Milestone badges read "Fifty", "50 stand", "Five wickets", "Winning runs". The Brief, Detailed and Off settings are unchanged.

## Evidence

### Corpus measurements

`node --import tsx scripts/cp10-commentary-variety.ts` (after) and the same with `CP10_PROJECTION` pointing at a copy of `main`'s `commentary.ts` and `commentary-context.ts` (before), 100 T20 matches, 31,848 lines, 22,051 delivery lines, run on 27 November 2026:

| Measure | Before (`2e6e785`) | After (`4e0a75a`) |
| --- | --- | --- |
| Lines with an en or em dash | 6,137 | 0 |
| Distinct delivery line shapes (names and numbers aside) | 531 | 5,111 |
| Delivery lines opening with the same three words as one of the previous three | 8.7% | 0.9% |
| Delivery lines with the same shape as one of the previous three | 0.9% | 0% |
| Lines off the bat that name a direction, edge or aerial stroke | 99.0% | 99.7% |
| Feeds that differ when projected twice from the same events | 0 | 0 |

`node --import tsx scripts/pavilion-commentary-variety.ts` (the P07 measure: a template reused within its family's previous three lines): 32.7% before, 0.2% after. Every feed parses with `MatchCommentaryFeedSchema` in both. The "names a direction" share was already high before because most lines ended "tidy stop at point"; the change is that the direction is now the stroke itself ("cut through point"), not an appended phrase.

### Sample lines

Before (`main`: the first two from the CP01 audit capture `cp01/screens/39-crop-pitch-lengths-scorecard-commentary_1366.webp`, the rest from `cp10/before/lines-*.txt`):

- "353. Result: Moonstone Bay win by 45 runs." and, between two balls, "350. Bowling plan for Rilan Ternford: stumps line, full length (conserve effort)."
- "Innings 2, 16.4: Good running between Arven Valebridge and Isen Kelholt into mid-off off Rilan Ternford \u2014 2 runs." (the dash shown as its code point here)
- "Innings 1, 5.2: Elio Valethorne to Nave Elmford, defended solidly, no run, tidy stop at fine leg." (an em dash after "solidly" in the original)
- "Batting plan updated for Borin Jorfield: aggression 2, rotate intent."
- "That is over 20: 9 runs off it, Copper Vale on 104/4 (5 needed from 0 balls)."

After (this branch, from `cp10/screens/lines-*.txt`):

- "Innings 1, 4.4: Six! Nave Elmford drives Leron Briarstone over extra cover."
- "Innings 1, 5.5: Maximum! Nave Elmford helps it over fine leg. Back-to-back boundaries for Nave Elmford."
- "Innings 1, 5.6: Nave Elmford cuts in front of square through cover and they come back for two."
- "Innings 1, 4.2: Leron Briarstone to Nave Elmford, a good-length ball, and no bat on it. Dot ball."
- "Innings 2, 12.4: Pavan Zornstone chips off a leading edge towards mid-off and is caught by Ulen Elmcroft for 0 (1). A golden duck, first ball. That is Talor Elmholt's fourth wicket. 2 wickets left."
- "16 from the over: a costly one for Elio Valethorne. Aster Harbour 46/0. That ends the powerplay: 46/0 from the first 6 overs."
- "Nerin Orinbridge finishes the over with figures of 3-0-15-2. Copper Vale 88/8 (7 needed from 30 balls). Into the death overs."
- Captain's notes: "After 7.4 Galen Zornwick will bat with a balanced approach, looking to rotate the strike."

The full text of each captured panel is in `cp10/before/lines-*.txt` and `cp10/screens/lines-*.txt`.

### Captures

Captured with [`scripts/cp10-capture.mjs`](../../../scripts/cp10-capture.mjs), headless Chromium 1243 from `/opt/pw-browsers`, against `vite preview` (before on port 4198 from a detached worktree of `2e6e785`, after on 4197 from this branch): a T20 quick match against the computer played six overs at a time with Finish over, then Finish innings to full time; the same under reduced motion; and a career match as Aster Harbour against the computer captain, eight overs, where plan changes occur. Each run is a new match, so the before and after matches differ.

- Before: [`cp10/before/`](cp10/before/), 8 WebP at 1366x768 and 390x844.
- After: [`cp10/screens/`](cp10/screens/), 10 WebP: `80` first innings, `81` full time, `83` reduced motion, `84` career match, `85` career match with the captain's notes open.
- Best two: [`84-career-commentary_1366x768`](cp10/screens/84-career-commentary_1366x768.webp) beside [`before/84-career-commentary_1366x768`](cp10/before/84-career-commentary_1366x768.webp), and [`85-career-captains-notes_390x844`](cp10/screens/85-career-captains-notes_390x844.webp).

Horizontal page overflow was 0 px in every before and after capture. No page errors or console errors.

## Accessibility

- **Not a live region.** The panel has no `aria-live`, `role="log"` or `role="status"`, before or after; it never announces itself while play goes on, so Finish over cannot flood a screen reader. (The match's own status lines are unchanged.)
- **Screen-reader text.** The ball label is visual only in effect: the line is read as "Innings 1, 7.4: Wicket for ...", exactly the feed's text. The list is labelled "Ball-by-ball commentary, latest first". Captain's notes are a native `details` element, closed by default; each note reads "After 7.4 Oren Kelwell will bat ...". No screen reader was used: NOT RUN.
- **Contrast**, measured by the capture script in Chromium against the composited panel (WCAG relative luminance): line text 13.15:1, ball label 10.86:1 (white on `--surface-3`), over summary band 13.15:1, milestone badge 9.73:1. Before: line text 13.7:1. Wicket and milestone labels are white on `--colour-wicket-fill` and `--colour-six-fill`, both darker than `--surface-3` [Inference: not measured separately].
- **Not colour alone.** A wicket's label colour repeats what the words already say; over summaries have a rule and a band, not only a colour.
- **Reduced motion.** Measured with `reducedMotion: "reduce"`: 0 running animations and 0 of 88 panel parts with an animation or transition (before: 0 of 47). The latest-moment pulse in `pavilion.css` is unchanged and already off under reduced motion.
- **No en or em dashes** in any new UI string, commentary line or this record.

## Checks

Local, Linux container, Node 22, 27 and 28 November 2026, in a worktree of `main` at `2e6e785` with `node_modules` linked from the main checkout. Browser suites ran on untracked local copies of the configs with changed ports (4197 to 4199) and results written outside the repository; Chromium from `/opt/pw-browsers/chromium`, Firefox 1495 from `/opt/pw-browsers`. Code revision `4e0a75a`; the commit after it adds only this record, the captures, the ledger row and the register note.

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build graph | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `4e0a75a` | PASS (exit 0) |
| Typecheck incl. tests | `npm run typecheck` | `4e0a75a` | PASS (exit 0) |
| Lint and boundaries | `npm run lint` | `4e0a75a` | PASS (exit 0); the first run failed the ambient API check on a local variable named `window`, renamed to `span` before the commit |
| Build | `npm run build` | `4e0a75a` | PASS (exit 0) |
| Unit, CP10 (determinism, prefix stability, variety, specificity, dashes, panel layout) | `npx vitest run tests/unit/commentary-cp10.test.ts` | `4e0a75a` | PASS, 17 of 17 |
| Unit, full suite | `npx vitest run --maxWorkers=2` | `4e0a75a` | PASS, 1272 of 1272 (146 files) |
| Browser, Chromium, all of `tests/ui` | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.cp10-local.config.ts --project chromium --trace off` (copy of `playwright.ui.config.ts` on port 4199) | `4e0a75a` | PASS, 132 passed (43.3 min) |
| Browser, Firefox, commentary-related specs | `npx playwright test --config playwright.cp10-ff.config.ts --project firefox --trace off tests/ui/commentary-stage7.spec.ts tests/ui/audio-stage8.spec.ts tests/ui/tactical-formats.spec.ts tests/ui/settings-scale.spec.ts` (port 4198) | `4e0a75a` | PASS, 6 passed |
| Browser, Firefox, all of `tests/ui` | | | NOT RUN locally (hosted Windows CI runs it) |
| Browser, m4 persistence, Chromium | `LCXXVI_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --config playwright.cp10-m4.config.ts --project chromium-m4 --reporter=line --trace off` (copy of `playwright.m4.config.ts` on port 4197) | `4e0a75a` | PASS, 17 passed |
| Browser, m6g portable, Chromium | `npx playwright test --config playwright.cp10-m6g.config.ts --project chromium --reporter=line --trace off` (copy of `playwright.m6g.portable.config.ts` on port 4198, local Chromium path) | `4e0a75a` | PASS, 12 passed |
| Browser, m4 and m6g, Firefox | | | NOT RUN locally |
| Corpus measures | `node --import tsx scripts/cp10-commentary-variety.ts`, `node --import tsx scripts/pavilion-commentary-variety.ts` | `4e0a75a` | PASS (exit 0), figures above |
| Screen reader | | | NOT RUN |
| Hosted CI | | | NOT RUN at the time of writing; the pull request records its runs |

No test was changed, skipped or weakened.

## Self-critique (as an independent creative director)

What now works: the commentary reads like a commentator rather than a log. Strokes are named for the length and direction the engine recorded, so a short ball pulled through midwicket and a full ball driven through the covers no longer read the same. Wickets carry the small facts a follower looks for (caught and bowled, ducks, the bowler's haul, the stand broken). The captain's decisions are still there, but out of the way and in plain words. The ball numbers and over bands make the list scannable.

Fixed during this pass, after reading the corpus output: "edges off a thick edge" (now "edges thickly towards cover"); "blocked straight to third man" (fine regions now take dabs, steers and glances); "runs down to third man" read as the batter running (now "runs it down"); "Ridden to mid-on" (dropped); the batter's name twice in "Galen to Arven: Arven caught..."; "keeps X quiet" from two templates in one over (renamed one, widened the window); a four-dot streak note that came too often (now from six); the score note repeating the batter's name ("Up to 7 from 3 balls").

What still reads as amateur, in order:
1. The engine records no line, pace, spin, bounce or footwork, and no fielder for a dropped catch or a misfield, so the vocabulary is drawn from three facts per ball. It is honest, but a real commentator would say much more about how the ball behaved.
2. Some combinations are cricket-correct but unusual ("tucks round to square leg for four" off a good length; "lofts in the air over cover for one"). They describe what was recorded; whether they read naturally is for a person to judge.
3. Player names appear in full in every line; a commentator would use surnames after the first mention [Inference]. The world's names have no separate surname field.
4. The captain's notes do not say which side's captain made the change; the plan events do not carry it in the commentary entry.
5. "Caught by X" is still the default wording; the event does not say whether X is the wicketkeeper or a slip, so "caught behind" is never said.
6. The live narration (browser speech, off by default) reads the same text, with "Innings 1, 7.4:" in front; not listened to: NOT RUN.

## Limitations and remaining work

- **Sector convention (dependency, from CP08)**: the owner's decision on one versioned sector definition. Until then the live field diagram can draw a ball on the other side from the commentary and the wagon wheel.
- **Audio cue classification (found, not changed)**: `projectMatchAudioCues` looks for `boundary` and `runs` fact slots that the commentary has never produced, so boundary and run cues are not classified from commentary. That is CP09 (audio) scope and would change what plays; recorded, not fixed here.
- **Red-ball commentary**: the new vocabulary applies in all formats, but the over and wicket context lines stay off in red-ball matches, as P07 decided.
- **Other events** (reviews, super overs, rain-shortened match events) still use their existing wording or the generic fallback.
- **Human testing outstanding**: no person has read the new commentary. One match per capture; local container numbers only.
