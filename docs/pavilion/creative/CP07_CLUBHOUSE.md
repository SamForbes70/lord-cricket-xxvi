# CP07 Clubhouse: the manager's home as a front page

Studio Production Directive 05 (Creative Production), pass CP07, first slice. Owner direction relayed for this pass: redesign the Clubhouse into the manager's home with a clear editorial hierarchy, showing what has happened, what matters now and what to consider next. Presentation only.

This is a **self-assessment by the agent that built it. It is not acceptance**: no person has reviewed the result, and no playtest was run. Inferences are labelled [Inference].

## Ledger

| Pass | Item | Status | Branch | Evidence |
| --- | --- | --- | --- | --- |
| CP07 (slice 1) | Clubhouse front page: lead fixture, last result, table and form guide, board objective, squad news, match preparation, compact career header | IMPLEMENTED (draft pull request, not merged, not accepted) | `pavilion/cp07-clubhouse` | This document; [screens](cp07/screens/) |

## Problem

The CP01 creative audit (branch `pavilion/cp01-creative-audit`, `docs/pavilion/creative/CP01_CREATIVE_AUDIT.md` section 4 and the defect register) found, at revision `976ee76`:

- **CD-005 (P1)** "League position #1" and "0.0% fatigue" shown as hero numbers before a ball is bowled; the season review rollover opens on the same cards.
- **CD-054 (P1)** "Players to watch" text set straight over the bright Aster Quay painting; the grey "v" between the club names measured 2.59:1.
- **CD-006 (P2)** a 3 plus 1 card grid with an orphaned Progress card; no last result, form, squad faces or news.
- **CD-010 (P2)** the header and two navigation rows end at y=290 of 768, so a third of a laptop screen is chrome.

The competitive benchmark (branch `pavilion/cp01-benchmark`, `docs/pavilion/creative/CP01_COMPETITIVE_BENCHMARK.md`) adds the principles applied here: one focal point, actionable information first, goals from the club's actual situation, no generic wall of dashboard cards, and no copying of any product's interface.

## The new hierarchy

Reading order is the same in the markup, for the keyboard and on a phone.

1. **Lead: the next match** (the one focal point). Kicker "Next match · Round N · T20"; both clubs on their own lines with crests aligned and the "v" in a narrow gutter; date and ground; the existing Advance, Simulate and Play buttons; then one context block: what the match means, the opponent's table place and form, and the head to head. The selection call, when there is one, stays in the lead because it is an action. The ground painting has its own region to the right (a banner above the text on a phone); no text is set on it.
2. **Rail** (what has happened, where we stand, what the board wants):
   - **Last time out**: result line, both scores with overs, and the existing Post-match analysis and Read the match report buttons. Straight after a match the full match report still opens across the page above everything, as before.
   - **The table**: before the club has played, "Season not started" and "14 rounds to play. The table and form guide open after your first match." After that, position "#N of 8", the gap to the top, the record and net run rate, and a five-result form guide (W green, L red, T and N neutral; each result has an accessible label such as "Round 1, home to Moonstone Bay: Lost"). The fixture count and multi-season progress lines moved here.
   - **The board**: the existing season objective card, unchanged.
3. **Squad news** (what to consider next): up to six faces with the most pressing development first: unavailable, tired, a milestone in reach, form rising, form falling. When the records have nothing to say yet, the heading is "Leading players" and it says so: "No form, fitness or milestone news yet, so these are the highest-rated players in the squad." A summary line gives availability, tiredness (only once a match is played) and how many contracts end this season. Each name opens the player page; Back returns to the Clubhouse.
4. **Match preparation**: players to watch, pitch and conditions, and the optional tactical briefing, unchanged in content, moved below the decisions.

Removed: the Condition card (hero fatigue percentage) and the Progress card ("0/56"). The fatigue figure is now a per-player note after a match, and progress is a small line in the table card.

The career masthead and the two navigation rows are compacted for every career place (smaller masthead, no stray kit swatches, tighter rows). The masthead markup in `CareerApp.tsx` is unchanged; it is CSS only.

## Data source of each element

| Element | Source (all existing, read only) |
| --- | --- |
| Fixture, round, date, ground, crests | `service.nextManagedFixture()`, `service.teamName`, `service.groundName`, world team colours |
| Advance, Simulate, Play, pending match | unchanged handlers and accessible names (`simulateToNextUserFixture`, `simulateMatch`, `playMatch`) |
| Meaning, opponent place and form, head to head, players to watch | `buildFixturePreview` (E7) over recorded results of this and past seasons |
| Selection call | `service.selectionCall()` with `selectionAdvice` (unchanged) |
| Last result and scores | `buildMatchReport` over the last completed managed fixture (E1); the new score lines read `report.innings` |
| Position, record, NRR, gap to the top | `state.projection.table` through `clubStanding` (new pure function) |
| "Season not started" | the club's table row has `played === 0` |
| Form guide | `state.projection.appliedMatches` through `clubFormGuide` (new pure function, the same rule as the opponent form in E7) |
| Board objective | `seasonObjective` and `seasonObjectiveStatus` (E2, unchanged) |
| Squad availability and fatigue | `service.squadView()` (availability pack and recorded fatigue) |
| Tired | fatigue at or above `FRESHEN_UP_FATIGUE_BP` (20%), the existing "Freshen up" line; never before the club's first match |
| Form rising or falling | `playerForm` (E6) trend over the last five innings or spells |
| Milestones in reach | `playerMilestones` (E6) over career totals from `service.historicalStatistics()`, as the Squad screen does |
| Contract ends this season | `service.playerContract().expiresAfterSeasonNumber` equals the current season (economy careers only) |
| Leading players and style | `overallRating` (T20) and `playingStyle` (V1) |
| Faces | `PlayerPortrait` (procedural, existing) |

New code: `apps/web/src/career/clubhouse-front-page.ts` (pure: `clubFormGuide`, `clubStanding`, `squadStrip`, `ordinal`), unit tested in `tests/unit/clubhouse-front-page.test.ts`. Nothing is saved; no clock or random number is read.

## Dependencies recorded, not built

- **Injuries.** There is no injury model. Availability comes from a fixed availability pack whose default has no entries, so "Unavailable" notes appear only if a pack or lifecycle entry exists. An injury system would need new persisted state and a new version.
- **News feed or inbox.** No news, messages or events system exists, so there is no "news" column; nothing was invented to fill one.
- **Board confidence or job security.** Only the season objective exists. A board mood or confidence figure would need a new system.
- **Morale, happiness or player requests.** Not modelled; omitted.
- **Contract negotiation prompts.** Contracts exist (Office), but there is no per-player deadline or request event; the Clubhouse only counts contracts ending this season.
- **Live V3 milestones.** `LC_PLAYER_IDENTITY_V3` milestone lines need an in-match scorecard line; the Clubhouse uses the E6 career milestones, which need no match.
- **New-season moment** (CD-039) belongs to career progression (CP10 in the CP01 proposal) and is not in this slice.

## Before and after

Before: `origin/main` at `976ee76` (the same app code as the CP01 audit). After: this branch. Both built and captured with `scripts/cp07-clubhouse-capture.mjs` (adapted from the CP01 capture script), Chromium headless, deviceScaleFactor 1 unless stated. Committed after-set (WebP): [cp07/screens/](cp07/screens/). Two before images at 1366x768 are kept beside them for comparison.

Best two at 1366x768:

- Before any match: [before](cp07/screens/before/01-clubhouse-pre-season_1366x768.webp), [after](cp07/screens/01-clubhouse-pre-season_1366x768.webp)
- After one match: [before](cp07/screens/before/03-clubhouse-after-match_1366x768.webp), [after](cp07/screens/03-clubhouse-after-match_1366x768.webp)

## Measurements

Captured with `scripts/cp07-clubhouse-capture.mjs` against `vite preview` builds: before from the `976ee76` app code, after from `80ef74b` built in a fresh clone (`npm ci`, `npm run build`). Raw numbers: [before-metrics.json](cp07/before-metrics.json), [after-metrics.json](cp07/after-metrics.json).

| Measure | Before (`976ee76`) | After (`80ef74b`) |
| --- | --- | --- |
| Top of the first content block, 1280x720, 1366x768, 1920x1080, 2560x1440, and 1280x720 at 1.5x | 290 px | 184 px |
| Top of the first content block, 390x844 | 444 px | 308 px |
| Horizontal overflow, every size and state captured | 0 px | 0 px |
| Contrast failures on the Clubhouse before any match (solid-colour walk, WCAG AA) | 1 of 382 text nodes: the "v", 2.59:1 | 0 of 255 |
| Contrast failures after one match | 0 | 0 |
| Lowest contrast in the lead | 2.59:1 ("v") | 8.74:1 |
| Text set on the painting | "Players to watch" and the fixture text over the painted wash | none: the painting has its own region |
| Running animations with reduced motion requested | 0 | 0 |

Clubhouse navigation time: click on a place to its content drawn (two animation frames), three cycles round the five places per run, Chromium headless, 1366x768. Two runs each, interleaved before, after, before, after, on an otherwise idle container; the six samples of both runs pooled.

| Clubhouse arrival | Before samples (ms) | Before median | After samples (ms) | After median |
| --- | --- | --- | --- | --- |
| Before any match | 204, 217, 219, 235, 260, 234 | 226 | 235, 279, 197, 234, 204, 218 | 226 |
| After one match | 251, 216, 234, 200, 201, 231 | 224 | 252, 216, 213, 208, 217, 198 | 215 |

No measurable change [Inference: the extra work, the career totals for milestones and the squad strip, is small against the render; the totals are memoised per saved state]. The other places were unchanged within noise (Squad 109 to 132 ms, Office 138 to 233 ms, Season 395 to 467 ms, Settings 83 to 100 ms medians). A first measurement taken while the browser specs were running is discarded.

## Accessibility

- **Contrast**: see the table above. Form guide letters are dark on the green or red fill (above 5:1 [Inference from the token colours; the walk measured no failure]). Text never sits on the painting; its inner edge fades into the panel colour.
- **Keyboard order** (focus walk, before any match): the five places, the five away links, Simulate match, Play match, then the six squad names, then the pitch disclosure and briefing. After a match: Advance to match day, Post-match analysis, Read the match report, the squad names, the pitch disclosure and briefing. Every one of 29 stops showed a visible focus ring. The markup order is the reading order at every width.
- **Structure**: the lead is an `article` labelled by its headline ("Aster Harbour v Moonstone Bay" as one `h3`); the table, squad news and preparation are labelled regions; the form guide is a list labelled "Form", each result with a full label ("Round 1, home to Moonstone Bay: Lost"); crests and portraits stay decorative.
- **Names**: Simulate match, Play match and Advance to match day keep their names and handlers. Squad names are buttons named "View <name>"; Back on the player page reads "Back to Clubhouse" and returns focus to the name.
- **Reduced motion**: nothing on the Clubhouse animates; the existing career reduced-motion rule still applies.
- **Screen reader**: NOT RUN.

## Validation

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build references | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `ff38f0b` | PASS (exit 0) |
| Typecheck incl. tests | `npm run typecheck` | `ff38f0b` | PASS (exit 0) |
| Lint and boundaries | `npm run lint` | `ff38f0b` | PASS (exit 0) |
| Build | `npm run build` | `ff38f0b`, again in the clean clone at `ff38f0b` and `80ef74b` | PASS (exit 0) |
| Unit tests | `npx vitest run tests/unit/clubhouse-front-page.test.ts tests/unit/match-report.test.ts tests/unit/fixture-preview.test.ts tests/unit/player-identity.test.ts tests/unit/ground-art.test.ts tests/unit/season-objective.test.ts tests/unit/training-presets.test.ts` | `ff38f0b` | PASS, 7 files, 44 tests (10 new) |
| Browser, Chromium | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.cp07.config.ts <23 specs> --project=chromium --reporter=line --trace off` (a local copy of `playwright.ui.config.ts` on port 4187) | `ff38f0b`, clean clone | PASS, 44 passed (31.2 min) |
| Browser, Firefox | the same with `--project=firefox` | `ff38f0b`, clean clone | PASS, 44 passed (45.4 min) |
| Full unit suite, full browser suite, hosted CI | | | NOT RUN locally; hosted CI runs on the pull request |

The 23 specs are every file in `tests/ui` that mentions the Clubhouse, Play match, Simulate match, Advance to match day or the Home test ids: awards-stage10, career-replay-and-recovery, career-stories-stage11, clubhouse-navigation, fixture-preview, historical-stats-stage9, managed-recovery, match-navigation, match-report, own-side-controls, persistent-world-stage2, player-identity-v1, player-identity-v2, player-identity-v3, player-identity, player-lifecycle-stage3, post-match-analysis-archive, post-match-analysis, season-finale, season-objective, season-review, squad-economy-stage4, tactical-briefing-stage5. No test was changed. `80ef74b` changes one CSS value (squad card minimum width) after the runs above; see the pull request for the check on the final head.


## Self-critique (as an independent creative director)

Looking at the after-set as if someone else had made it:

What works. There is one focal point: the next match, its two crests and the action buttons, all above the fold at every desktop size and at 150%. "Season not started" replaces the misleading "#1" and "0.0% fatigue". The painting is now shown whole and reads as a picture of the ground rather than a muddy backdrop. The rail answers "how are we doing" in three short blocks, and the table, form guide and board line agree with each other because they read the same table.

What still looks unfinished, in order of how much it bothers me:

1. **Pre-season the squad strip is a roster, not news.** With no matches there is nothing to report, so it falls back to the six highest-rated players with their style. It says so honestly, but it is the weakest block on the page until a few rounds are played. Better content needs systems that do not exist (injuries, morale, news).
2. **The headline gutter.** The "v" sits in a small gutter before the second crest. It aligns the crests and avoids an awkward wrap, but the first line has a blank gutter that reads as a slight indent. A crest-led "fixture card" treatment may be better in a later pass.
3. **Match preparation is a box in a box.** The pitch inspection keeps its own panel inside the section, and the briefing summary still contains an em dash from `TacticalBriefingPanels.tsx` (CD-030, the global dash clean-up, is a separate pass).
4. **Wide screens.** At 2560x1440 the page keeps the shell's 1440 px cap (audit G5); the front page is well proportioned inside it but small on the screen.
5. **Header.** The compact masthead still shows "rev N" in the save badge (audit G4) and the two navigation rows remain; folding "Away from the club" into a menu belongs to the shared navigation pass.
6. **The open match report** straight after a match is the existing full-width component; it pushes the next match below the fold until it is closed. That is deliberate (the result is the news of the moment) but it is long.

Fixed during the pass after looking at the screenshots: a ragged two-line headline with a floating "v"; large gaps in the rail caused by grid row stretching; six identical "Contract ends this season" cards (now one count in the summary, with the note kept as a second line on a face); "Top of the table" shown for a club level on points but fourth (now "Level on points with the top"); cramped four-across squad cards at 2560 px; a phone masthead that pushed the save badge onto its own row.


## Limitations

- Self-assessed; no human review, playtest or screen-reader walkthrough (NOT RUN).
- Firefox screenshots were not captured; Firefox ran the browser specs only.
- Timings are from a Linux container, not the owner's PC.
- The compact header affects every career place, including the imported-roster career; other places were not re-captured in this slice [Inference: no layout regression elsewhere, since only margins, padding and font sizes of the masthead and navigation changed, and the 23 browser specs that visit those places pass].
- Files changed outside the Clubhouse: `CareerApp.tsx` (a "HOME" origin for the player page and the `openPlayer` prop) and `MatchReportPanel.tsx` (score lines in the closed summary). `main.tsx` and `floodlit.css` are untouched; Clubhouse styles live in `apps/web/src/career/clubhouse.css`, which reads the floodlit variables through `--club-*` names.
- The Aster Quay painting is used as before; the owner confirmed on 27 November 2026 that it can ship (CD-032, recorded on `pavilion/cp01-creative-audit`).
