# CP03 match broadcast: the live T20 match screen

Studio Production Directive 05, passes CP02 (a first slice of the token foundation) and CP03 (the live match screen). Branch `pavilion/cp03-match-broadcast`, draft pull request. This is a self-assessment by the agent that built it: **not acceptance, not a playtest**. Nothing here has been seen by a person yet. Anything not measured directly is labelled [Inference].

The baseline is the CP01 creative audit on branch `pavilion/cp01-creative-audit` (`docs/pavilion/creative/CP01_CREATIVE_AUDIT.md` and `CREATIVE_DEFECT_REGISTER.md` there, revision `976ee76`), and the principles in `docs/pavilion/creative/CP01_COMPETITIVE_BENCHMARK.md` on branch `pavilion/cp01-benchmark`. Those files are not on `main` yet, so they are named here rather than linked.

## Problem

CP01 scored live match presentation 6 of 15. At 1366x768 the decision panel started at y=600 of 768; six advance buttons sat in one row with "Next key moment" as the gold primary; the 2D field was about 1,200 px down the page with 7.84 px labels; the field legality card measured 1.06:1 to 1.66:1; a legacy orange `h2:focus` box was drawn round every heading the game focuses; the bowler card and the "this ball" line named different bowlers at every over break; and the highlight card could show a key moment from overs earlier (CD-001, CD-002, CD-004, CD-011 to CD-015, CD-018, CD-020, CD-021, CD-023).

## What changed

Presentation only. No change to the engines, outcomes, random stream, saved formats, contracts or commands; no new runtime dependency; no network use. Every button keeps its handler and accessible name; the unified advance (#173) and the computer captain boundaries are untouched.

1. **Token foundation** (`apps/web/src/tokens.css`, imported at the top of `floodlit.css`). Semantic tokens for type, spacing, surfaces, text levels, accent, cricket colours, radii, elevation, motion and focus (table below). Type tokens multiply by `--text-scale`, which the match screen sets from the player's Text size choice, so that setting still works. Everything CP03 touched uses these tokens; other screens were not restyled.
2. **Light-theme leftovers.** The orange `#a65015` focus rules and the `h2:focus` box in `styles.css`, the blue `#1373ad` rings in `pavilion.css`, and the gold ring in `floodlit.css` are replaced by one `:focus-visible` ring built from the focus tokens. Headings and anchors the game focuses for screen readers (`tabindex="-1"`) draw no box; a keyboard user gets a gold underline on the heading instead. Georgia is gone from `styles.css`, `pavilion.css` (`--display`), `career/career.css` and `legacy.css`. Dashes removed from match UI strings where trivial (tactical briefing headings, spell review over ranges, analytics axis labels, field placement selects, the highlight disclaimer at render time).
3. **Two columns from 1280 px** (`apps/web/src/match/match-broadcast.css`). The match shell becomes a grid: score, situation, this ball, batters and bowler, decision and the jump bar on the left; the field panel on the right, `position: sticky`, so it stays in view while the player scrolls tactics, scorecard and commentary. No React restructuring: one `data-live` attribute on the match `<main>` switches it on. The masthead is one line and the career banner one compact line. Below 1280 px the page stacks as before; above 2200 px the match screen scales to 125%.
4. **Advance controls.** "Next delivery" (gold) and "Finish over" (gold outline) are the primary pair, with a line saying what they do from here ("Over 5: 6 legal balls to go"). "Next key moment", "Next decision", "Finish innings" and "Finish match" sit in a labelled "Skip ahead" group (`role="group"`), smaller and quieter. Same buttons, same order of handlers, same names.
5. **Field diagram** (`LiveFieldPanel.tsx`, new `field-label-layout.ts`). The diagram measures its drawn width and sizes marker codes and labels to at least 12 CSS px; a deterministic layout nudges overlapping markers apart (striker and keeper stay fixed) and places each label where it overlaps nothing, tested at 320 to 520 px for both hands. Night-field palette: fielding side in light discs, batters in gold, open slots as dashed rings, labels with a dark halo. The diagram now always shows the latest ball unless the player chose a recent ball or a replay is running, and a caption above it says which ("Latest ball 3.6 Dot ball", "Chosen ball", "Replay"). The legality card is dark (`--surface-2`) with token text.
6. **Bowler card and this ball.** The card's heading reads "Bowling next" whenever it shows a different bowler from the last ball (the over break case), "Bowler" otherwise; the stage marks the ball that completed an over ("Over 3.6 · end of over"); the recent-balls strip has a divider where each over starts. All derived from the view's field presentation and innings ledger (`broadcast-labels.ts`).
7. **Charts** (`AnalyticsPanel.tsx`). Innings colours sky blue then vermilion on the worm, the Manhattan and the legend; a "W" mark over any Manhattan bar with a wicket; pitch-length bars drawn to scale on a dark track with token text; wagon-wheel spokes visible on the dark panel.

## Tokens added

| Group | Tokens |
| --- | --- |
| Type | `--type-xs` 12 px, `--type-sm` 14, `--type-md` 16, `--type-lg` 18, `--type-xl` 22, `--type-2xl` 28, `--type-3xl` 36, `--type-display` clamp(40 to 56 px); `--leading-tight`, `--leading-normal`, `--tracking-caps`, `--font-display`, `--font-body`, `--text-scale` |
| Spacing | `--space-1` 4 px to `--space-8` 48 px |
| Surfaces | `--surface-page`, `--surface-sunken`, `--surface-1` to `--surface-3`, `--surface-raised`, `--surface-field`, `--surface-field-outer`, `--border-subtle`, `--border-strong`, `--border-accent` |
| Text | `--text-strong`, `--text-default`, `--text-muted`, `--text-faint`, `--text-on-accent` |
| Accent | `--accent`, `--accent-strong`, `--accent-soft` |
| Cricket semantics | `--colour-positive` / `--colour-negative` (sky blue / vermilion), `--colour-boundary` and `--colour-boundary-fill`, `--colour-six` and `--colour-six-fill`, `--colour-wicket` and `--colour-wicket-fill`, `--colour-extra`, `--colour-dot` |
| Shape and depth | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`, `--shadow-1`, `--shadow-2` |
| Motion | `--motion-fast`, `--motion-base`, `--motion-slow` (all 0 ms under reduced motion), `--ease-out`, `--ease-emphasis` |
| Focus | `--focus-ring-colour`, `--focus-ring-width`, `--focus-ring-offset` |

The cricket pairs follow the Okabe and Ito palette, lightened for a dark ground. Colour is never the only signal: balls carry 4, 6, W, Wd; the caption and stage name the event in words.

## Before and after evidence

Captured with [`scripts/cp03-capture.mjs`](../../../scripts/cp03-capture.mjs) (a cut-down copy of CP01's `scripts/cp01-capture.mjs`), headless Chromium 1243 from `/opt/pw-browsers`, against `vite preview` on port 4186 in a clean clone (`npm ci`, `npm run build`). A career match against the computer captain, played to 4.0 overs (live) and to full time (conclusion). Each run is a new career, so the scores differ between captures.

- Before (revision `976ee76`, `main`): [`cp03/before/`](cp03/before/), 23 WebP.
- After (revision `41db0c6`, this branch): [`cp03/screens/`](cp03/screens/), 23 WebP. Sizes 1280x720, 1366x768, 1920x1080, 2560x1440, 390x844 and 1280x720 at device scale 1.5; full-page captures at 1366 and 1920; crops of the field panel, the decision panel and the tactics panel; a scrolled capture showing the sticky field.
- Best three at 1366x768: [`21-live-match_1366x768`](cp03/screens/21-live-match_1366x768.webp), [`23-live-field_1366x768`](cp03/screens/23-live-field_1366x768.webp), [`25-live-scrolled-field-sticky_1366x768`](cp03/screens/25-live-scrolled-field-sticky_1366x768.webp).

Layout measured in the browser (career match, top of page, y in CSS px):

| Viewport | Score bug starts (before, after) | Decision panel (before, after) | Field diagram starts (before, after) | Horizontal overflow |
| --- | --- | --- | --- | --- |
| 1280x720 | 145, 96 | 600 to 751, 538 to 735 | 2,103, 181 | 0, 0 |
| 1366x768 | 145, 96 | 600 to 751, 539 to 736 | 2,084, 181 | 0, 0 |
| 1920x1080 | 145, 96 | 600 to 751, 528 to 725 | 2,084, 161 | 0, 0 |
| 2560x1440 | 145, 109 | 600 to 751, 598 to 822 (at 125%) | 2,084, 186 | 0, 0 |
| 390x844 | 215, 134 | 943 to 1,306, 769 to 1,114 | 3,613, 3,288 (stacked) | 0, 0 |

The score starts at y=96 at 1366x768 (target was by y=180). The whole decision panel, the field and the score are on the first screen at 1366x768, 1920x1080 and 2560x1440. At 1280x720 in a career match the primary pair is on screen but the last 15 px of the panel (the advance hint line) is below the fold; in a quick match (no career banner) it fits. The live page is longer in CSS px than before (5,723 against 5,313 at 1366; completed match 14,670 against 13,004) because the left column is narrower; the field no longer needs scrolling to reach.

## Measurements

Quick match against the computer captain, 1366x768, same machine and method as CP01 (shared Linux container, local numbers, not the owner's PC). One before run, three after runs:

| Measure | Before `976ee76` | After `ec44a8b`, `41db0c6`, `41db0c6` |
| --- | --- | --- |
| Finish over, median ms per ball (8 overs) | 71 | 40, 43, 66 |
| Next delivery, median ms per ball (12 balls) | 136 | 112, 119, 122 |
| JS heap used, mid match | 23.7 MB | 24.8, 24.9, 25.2 MB |
| JS heap used, after full time | 32.7 MB | 27.7, 30.7, 33.3 MB |

No regression is visible; the spread between runs is larger than any difference [Inference: container load dominates]. Heap mid match is about 1 to 1.5 MB higher, within run-to-run noise at full time. The field layout is computed only when the presentation or the drawn width changes.

## Accessibility

| Check | Before | After |
| --- | --- | --- |
| Contrast walk, live match, text in the first three viewports (CP01 method, solid backgrounds) | 119 checked, 1 below threshold (field legality heading 1.06:1) | 162 checked, 0 below threshold |
| Smallest text in the field diagram (rendered height) | 6 px | 14 px (glyph box of 12 px text) |
| Programmatically focused decision heading | 3 px outline | no outline (gold underline under keyboard focus) |
| Keyboard Tab order from the decision heading | routine picks, Next delivery, Next key moment, Finish over, Next decision, Finish innings, Finish match, jump bar | routine picks, Next delivery, Finish over, Next key moment, Next decision, Finish innings, Finish match, jump bar; every stop draws the 3 px gold ring |
| Animation and transition starts over about 18 deliveries, reduced motion set | 0 | 0 |
| Same, reduced motion not set | 1,892 | 1,565 |

The legality card's text on `--surface-2` (#163536): default text 11.8:1, muted 7.5:1, faint 5.1:1, positive sky blue 6.8:1, wicket vermilion 5.9:1 [computed from the token values with the WCAG formula]. The CP01 walk does not measure text over the ground painting or inside SVG; the field labels were judged in the screenshots. No screen reader was used: NOT RUN.

## Checks

Local, Linux container, Node 22, 27 November 2026. Code revision `41db0c6` unless stated (later commits add only this document and screenshots).

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build graph | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `41db0c6` | PASS (exit 0) |
| Typecheck incl. tests | `npm run typecheck` | `41db0c6` | PASS (exit 0) |
| Lint and boundaries | `npm run lint` | `41db0c6` | PASS (exit 0) |
| Build | `npm run build` | `41db0c6` | PASS (exit 0) |
| Unit, match screen | `npx vitest run --maxWorkers=2 tests/unit/match-broadcast-cp03.test.ts tests/unit/match-ui.test.ts tests/unit/broadcast-stage.test.ts tests/unit/field-presentation-stage6.test.ts tests/unit/analytics-geometry.test.ts tests/unit/unified-advance.test.ts tests/unit/pavilion-key-moments.test.ts tests/unit/pavilion-routine-picks.test.ts tests/unit/guided-coach.test.ts` | `41db0c6` | 41 of 42 passed; one timeout at 30 s (`field-presentation-stage6` replay test) while the Firefox suite loaded the machine; rerun alone `npx vitest run tests/unit/field-presentation-stage6.test.ts` PASS (5 of 5) |
| Unit, also red-ball unified advance | same list plus `tests/unit/unified-advance-red-ball.test.ts` | `7279597` | PASS (41 of 41) |
| Browser, Chromium, all of `tests/ui` | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.cp03.config.ts tests/ui --project=chromium --reporter=line --trace off` (local copy of `playwright.ui.config.ts` on port 4186, clean clone) | `7279597` | PASS, 131 passed (46.0 min) |
| Browser, Chromium, all of `tests/ui` | same | `41db0c6` | PASS, 131 passed (41.2 min) |
| Browser, Firefox, all of `tests/ui` | `npx playwright test --config playwright.cp03.config.ts tests/ui --project=firefox --reporter=line --trace off` | `41db0c6` | PASS, 131 passed (1.1 h). A first run failed 125 tests with `NS_ERROR_CONNECTION_REFUSED` after the preview server stopped during test 7 (no exit was logged); the rerun on the same build passed every test |

Every spec under `tests/ui` was run, since nearly all of them reach the match screen, the decision panel, the field or the advance buttons. No test was changed, skipped or weakened. Hosted CI: NOT RUN at the time of writing (the pull request records its runs).

## Self-critique (as an independent creative director)

What now looks professional: one focal point on the left (the ball call and the score), the field always beside it like a broadcast graphic, one gold action, and the skips visibly secondary. The night field with light fielding discs and gold batters reads at a glance; the caption says which ball the diagram shows. The bowler card no longer contradicts the stage at an over break.

What still looks amateur, in order:
1. The score bug's right half repeats "Match phase: Innings 1" over the painting; it should hold the chase or the partnership instead (left alone because a browser test measures that box).
2. The batters and bowler panel wraps chips under names at 1280 px and reads as a form, not a lower third.
3. The field panel scrolls inside itself at 1280x720 and 1366x768 because the highlight card, legality card and placement editor sit under the diagram; the editor belongs with Tactics.
4. Open field slots carry the same weight of label as occupied ones and add clutter on the off side.
5. The match screen below the jump bar (tactics, opposition, spell review, scorecard, commentary) is untouched and still the light-theme form layout of CP01's audit.
6. "Up to date" and the routine checkbox take a line each in the decision panel.

Fixed during this pass after looking at the screenshots: the skip group wrapped under the primary pair at 1366 (label taken out of the flow), the pressed recent-ball chip inherited the batters panel's "active" styling, the contextual preset card kept a light surface (1.06:1), a stale "Routine pick ... next over" line at full time, and the batters panel ignored the narrow two-column rule at 390 px.

## Limitations

- The decision controls are not pinned to the viewport: a pinned tray would either duplicate the buttons (two of each name, which breaks role and name lookups) or overlay content the browser tests click. With the two-column layout the decision is on the first screen at 1366x768; the jump bar and skip link return to it.
- Highlight disclaimers and other text built in `packages/projections` keep their dashes at source; the field panel strips the one it shows at render time.
- Only the match screen uses the new tokens; the other screens keep the 251 unique hex colours and 60 font sizes CP01 counted (CP02 proper).
- One before performance run; local container numbers only.
- The 2560 px scale-up (125%) applies to the match screen only.

## Ledger row

`docs/pavilion/creative/CREATIVE_PRODUCTION_LEDGER.md` is not on `main` (it is on the CP01 branch), so the row is recorded here for that ledger:

| Pass | Subject | Status | Revision | Evidence | Pull request | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CP03 (with a CP02 token slice) | Live T20 match screen as a broadcast; semantic tokens | IMPLEMENTED | `41db0c6` | `CP03_MATCH_BROADCAST.md`, `cp03/screens/`, `cp03/before/` | draft, branch `pavilion/cp03-match-broadcast` | Self-assessed, not accepted. Presentation only. Not merged, so not INTEGRATED |
