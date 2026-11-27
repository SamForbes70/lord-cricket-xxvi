# CP01 creative audit: baseline of the current game

Studio Production Directive 05 (Creative Production), pass CP01. A critical look at how the game looks, sounds and feels today, with baseline evidence captured from a clean build. Nothing in this pass changes game code.

This is a **self-assessment by the agent that captured the evidence. It is not acceptance**, it is not a playtest and no person has reviewed these findings yet. Every finding below points at a screenshot or a measurement taken on the revision named here; anything not observed directly is labelled [Inference].

The directive's own text is not in the repository. The 100-point rubric and the CP02 to CP13 pass numbers are used as relayed in the owner's instruction for this pass; the subject given to each later pass in the [defect register](CREATIVE_DEFECT_REGISTER.md) is a proposal [Inference] until the directive's pass list is recorded.

## Source revision and environment

| Item | Value |
| --- | --- |
| Revision audited | `976ee76fe5190653b51afbca91a72ac8cd9c7ad7` (`origin/main`, merge of #174), checked against `git ls-remote` on 27 November 2026 |
| Clone | fresh `git clone`, `npm ci` (exit 0, 211 packages), `npm run build` (exit 0, Vite 7.1.7) |
| Typecheck | `npx tsc -b` exit 0 (`NODE_OPTIONS=--max-old-space-size=4096`) |
| Lint | `npm run lint` exit 0 (includes the new capture script) |
| Server | `LCXXVI_PREVIEW_PORT=4185 node scripts/ui-preview-server.mjs` (the same `vite preview` that `playwright.ui.config.ts` starts, on port 4185) |
| Browser | Playwright 1.56.0 Chromium from `/opt/pw-browsers`, headless, Linux container, `--enable-precise-memory-info` |
| Capture script | [`scripts/cp01-capture.mjs`](../../../scripts/cp01-capture.mjs), parts `main`, `onboarding`, `scale150`, `perf`, `a11y`, `video` |
| Evidence | 126 WebP screenshots in [`cp01/screens/`](cp01/screens/) (9.5 MB). Video and raw PNGs kept outside the repository (agent scratchpad), not committed |

## Method

1. Walked every journey that exists, in the order a new player meets them: title, the modes reachable from it, career creation, the Clubhouse and its five places, a full managed T20 against the computer captain, the remaining 13 rounds simulated, the six-step season review, the season rollover and the load screen. Quick match and the guided first match were captured from fresh browser profiles.
2. Screenshots at deviceScaleFactor 1 by resizing one page: every screen at 1366x768 and 1920x1080; the key screens (title, Clubhouse, toss, live match, match conclusion, post-match analysis, season review) also at 1280x720, 2560x1440 and 390x844. Long screens also as full-page captures at 1366 (and 1920 for the Clubhouse, live match and conclusion).
3. 150% check: a separate context with a **1280x720 viewport at deviceScaleFactor 1.5**, which is what a 1920x1080 display at Windows 150% scaling presents to the page. CSS zoom was not used.
4. Performance: three cold loads of `#title`; three cycles round the five Clubhouse places; Finish over and Next delivery timed against the computer captain in a quick match; `performance.memory` heap readings.
5. Accessibility, manual because neither `axe-core` nor `@axe-core/playwright` is installed: a contrast walk over visible text (foreground against the composited solid background colours; gradients and images are not measured), a keyboard Tab walk recording the focus ring of each stop, and running animations counted with `prefers-reduced-motion` set and unset.
6. One video (WebM, 1366x768): title to Career to Clubhouse to Squad, Office, Season and back (screen transitions), then a quick match with 10 Next delivery presses and 3 Finish over presses.
7. Styling architecture read from source with grep counts (commands in the appendix).

Each journey is rated against the twelve criteria the directive names. To keep this readable, a journey lists only the criteria where something notable was observed; criteria not listed showed nothing beyond the game-wide findings in the next section.

## Game-wide findings

These recur on most screens; journeys below refer back to them.

- **G1 Screen chrome takes a third of a laptop screen.** On the Clubhouse places the header and two navigation rows end at about y=290 of 768 (38%), and Season adds a third row to about y=335 (44%) before any content. ([08-clubhouse_1366x768](cp01/screens/08-clubhouse_1366x768.webp), [14-season-fixtures_1366x768](cp01/screens/14-season-fixtures_1366x768.webp))
- **G2 Three different page headers.** The Clubhouse has a crest masthead with save badge; matches use a "LORD CRICKET XXVI" bar with an eyebrow that changes ("CAREER MATCHDAY", "THE FICTIONAL CRICKET EXHIBITION"); Tournaments and Scenarios use a third layout with spaced-out buttons; Rain has no header and no way back except the browser. ([04-tournaments](cp01/screens/04-tournaments_1366x768.webp), [06-rain](cp01/screens/06-rain_1366x768.webp), [19-career-match-toss](cp01/screens/19-career-match-toss_1366x768.webp))
- **G3 Light-theme leftovers.** A legacy `h2:focus` rule (`apps/web/src/styles.css`, `outline: 2px solid #a65015`) draws an orange box round every heading the game focuses programmatically, on nearly every match and player screen. Native "Choose File" inputs are unstyled. The exhibition heading renders in Georgia serif. The field legality card is near-white with pale text. ([19-career-match-toss](cp01/screens/19-career-match-toss_1366x768.webp), [12-player-page](cp01/screens/12-player-page_1366x768.webp), [03-exhibition-setup](cp01/screens/03-exhibition-setup_1366x768.webp), [23-live-field](cp01/screens/23-live-field_1366x768.webp))
- **G4 Internal values reach the player.** Raw ids (`p001`, `acad-s001-team01-1`), save revisions ("rev 0", "revision 29"), enum casing ("KEEPER", "FIELDING PRACTICE", "NORMAL (recommended)", "STUMPS", "stock", "slip 1"). ([11-youth-academy](cp01/screens/11-youth-academy_1366x768.webp), [24-crop-tactics-panel](cp01/screens/24-crop-tactics-panel_1366.webp), [34-load-existing-career](cp01/screens/34-load-existing-career_1366x768_full.webp))
- **G5 Wide screens waste space; nothing scales up.** Content is capped near 1440 CSS px; at 2560x1440 about 45% of the width is empty backdrop and body text stays at desktop size, so the game looks small. ([01-title_2560x1440](cp01/screens/01-title-first-launch_2560x1440.webp), [21-live-match_2560x1440](cp01/screens/21-live-match_2560x1440.webp))
- **G6 Dashes in player-facing text.** Em and en dashes appear in UI strings ("Pre-match tactical briefing (optional) [em dash] Aster Quay", "Overs 0.0[en dash]5.5", "Elmholt [em dash] First slip", commentary "[em dash] 2 runs"); 58 such characters in 13 `.tsx` files (some are in comments). ([08-clubhouse_1366x768_full](cp01/screens/08-clubhouse_1366x768_full.webp), [23-live-field](cp01/screens/23-live-field_1366x768.webp))
- **G7 Every screen ends with a "Copy name / Save career copy" form** with an empty unlabelled-looking input, including Squad, Player and Settings. ([09-squad_1366x768_full](cp01/screens/09-squad_1366x768_full.webp))
- **G8 Selected-tab styling varies.** The current place shows as a gold pill, a gold outline or a dark green pill depending on whether it has focus and which row it is in. ([08-clubhouse](cp01/screens/08-clubhouse_1366x768.webp), [09-squad](cp01/screens/09-squad_1366x768.webp), [15-season-statistics](cp01/screens/15-season-statistics-league-table_1366x768.webp))
- **G9 No horizontal page scroll at any captured size.** The page-level overflow was 0 px on all 126 captures, including 390x844 and the 150% context. Overflow is contained inside tables instead (see Squad).

## Journeys

### 1. First launch, title and main menu

Evidence: [01-title-first-launch_1366x768](cp01/screens/01-title-first-launch_1366x768.webp), [1920x1080](cp01/screens/01-title-first-launch_1920x1080.webp), [2560x1440](cp01/screens/01-title-first-launch_2560x1440.webp), [390x844](cp01/screens/01-title-first-launch_390x844.webp), [1280x720 at 1.5x](cp01/screens/01-title-first-launch_1280x720_at1.5x.webp), [02-title-main-menu_1920x1080](cp01/screens/02-title-main-menu_1920x1080.webp).

- Visual hierarchy, emotional impact: the strongest screen in the game. A painted ground, a condensed wordmark with gold "XXVI", eight crests, one clear gold primary action.
- Navigation: the bare address (`/`) opens the career screen, not this title; the title is only at `#title`. There is no Continue on the title even when a career exists, and no Settings.
- Professional appearance, brand consistency: the two flat vector cricketers sit on top of a painterly matte painting; the styles do not belong together. There is no logo mark, app icon or favicon (`index.html` has `<link rel="icon" href="data:,">`).
- Information density, responsiveness: at 1366x768 the "Play with sound?" question is cut off below the fold, so its buttons are not visible on first launch. At 1920x1080 and above the lower third of the screen is empty. At 390 px the wordmark wraps to two lines and the figures are hidden; it still reads well.
- Sound: the sound question is honest and off by default; nothing plays on the title (no music exists).

### 2. Other modes: custom match, tournaments, scenarios, rain

Evidence: [03-exhibition-setup](cp01/screens/03-exhibition-setup_1366x768.webp) ([full](cp01/screens/03-exhibition-setup_1366x768_full.webp)), [04-tournaments](cp01/screens/04-tournaments_1366x768.webp), [05-scenarios](cp01/screens/05-scenarios_1366x768.webp), [06-rain](cp01/screens/06-rain_1366x768.webp).

- Brand consistency: exhibition setup mixes a serif uppercase heading ("TAKE THE CAPTAIN'S CHAIR."), Barlow buttons, a native file input and a painted match-up banner. Its copy says "You make decisions for both teams initially", which differs from the quick match, where the computer takes the other side.
- Visual hierarchy: scenario cards are well structured (difficulty chip, objective, gold Play button), but every card uses the same procedural stadium art, so six cards look identical above the fold.
- Navigation: Rain is a bare full-width form with no header and no route back. Tournaments' header buttons are spread across the bar with large gaps.

### 3. New career and club selection

Evidence: [07-new-career-club-selection_1366x768](cp01/screens/07-new-career-club-selection_1366x768.webp), [full](cp01/screens/07-new-career-club-selection_1366x768_full.webp), [1920x1080](cp01/screens/07-new-career-club-selection_1920x1080.webp).

- Emotional impact: a good hero (the Aster Quay painting, "START A CAREER").
- Player and club identity: each club card is a crest, a name and a ground. Nothing tells the player how the clubs differ (strength, style, finances, board expectation, rival), so the choice carries no weight.
- Navigation: six mode buttons sit in the hero before the club choice; "Imported roster career" and "Title screen" compete with the main task.

### 4. Clubhouse (career home)

Evidence: [08-clubhouse_1366x768](cp01/screens/08-clubhouse_1366x768.webp), [full](cp01/screens/08-clubhouse_1366x768_full.webp), [1920x1080 full](cp01/screens/08-clubhouse_1920x1080_full.webp), [2560x1440](cp01/screens/08-clubhouse_2560x1440.webp), [390x844](cp01/screens/08-clubhouse_390x844.webp), [1280x720 at 1.5x](cp01/screens/08-clubhouse_1280x720_at1.5x.webp), [29-clubhouse-after-match](cp01/screens/29-clubhouse-after-match_1366x768.webp), [32-clubhouse-season-complete](cp01/screens/32-clubhouse-season-complete_1366x768.webp).

- Visual hierarchy: the fixture hero (both crests, date, ground art, Play match in gold) is clear. Below it, the board objective, league position, condition and progress cards form a 3 plus 1 grid that leaves an orphaned Progress card and a hole.
- Readability: "Players to watch" runs over the brightest part of the painting (white text on sky and pavilion); the measured contrast walk cannot see this because the background is an image.
- Information density and accuracy of presentation: "League position #1" and "0W 0L 0T 0NR 0 pts NRR [en dash]" before a ball is bowled; "0.0% fatigue" as a hero number; "rev 0" in the save badge; two small kit-colour swatches under the crest read as stray marks. The grey "v" between club names measured 2.59:1.
- Emotional impact: no squad faces, no news, no inbox, no form guide, no recent result on first view; the screen tells you what to do next but not what is happening at your club.
- Responsiveness: fits 390 px (place tabs wrap to two lines) and 2560 px (small, see G5).

### 5. Squad, training and youth academy

Evidence: [09-squad_1366x768](cp01/screens/09-squad_1366x768.webp), [full](cp01/screens/09-squad_1366x768_full.webp), [1920x1080](cp01/screens/09-squad_1920x1080.webp), [10-training](cp01/screens/10-training_1366x768.webp), [11-youth-academy](cp01/screens/11-youth-academy_1366x768.webp).

- Professional appearance: the table collides with itself. "AVAILABLE" and "0.0%" run together ("AVAILABLE0.0%") at both 1366 and 1920; the Training column's REST control is clipped at the right edge at both sizes; Form wraps to four lines ("No innings or spell yet") while the Player column takes half the width.
- Information density: Bat, Bowl and Field readiness show 0 for every player at the start, so three columns carry no information.
- Player identity: portraits, OVR chips and style tags are a real step up from a spreadsheet; the OVR chip border colour varies by band.
- Youth academy: the focus select's text is overprinted by the Queue checkbox ("FIELDING PR[box]Queue"); internal ids sit under each name; prospects have no portrait; key skills are abbreviated ("Tim 50 · Pow 50 · Ctl 18 · Cat 53").
- Training: four preset buttons with plain descriptions work, but "20 changes" on each preset is jargon.

### 6. Player page

Evidence: [12-player-page_1366x768](cp01/screens/12-player-page_1366x768.webp), [full](cp01/screens/12-player-page_1366x768_full.webp), [1920x1080](cp01/screens/12-player-page_1920x1080.webp).

- Player identity: the best player presentation in the game: a large portrait, OVR, role chip, four discipline bars, personality traits marked "flavour, not a rating".
- Consistency: the name appears twice (a focused "PLAYER: ULEN ELMCROFT" heading with the orange focus box, then the card); the id `p001` and "KEEPER" in capitals sit under it; "Game award [em dash] transparent deterministic ... (not an official ICC or broadcast formula)" uses a dash and names a real governing body in player-facing text.
- Statistical visualisation: every skill bar uses the same gradient regardless of value, so 20 and 78 look alike in colour.

### 7. Office: contracts and recruitment

Evidence: [13-office-contracts-recruitment_1366x768](cp01/screens/13-office-contracts-recruitment_1366x768.webp), [full](cp01/screens/13-office-contracts-recruitment_1366x768_full.webp), [1920x1080](cp01/screens/13-office-contracts-recruitment_1920x1080.webp).

- Information density: the page is 8,366 px tall at 1366: wage budget, squad contracts, the free-agent market, league budgets and a transaction ledger, all as tables, one after another.
- Consistency: the two top cards are misaligned (the right card starts about 30 px lower); money is written "$1665k" and "$2,500k" on the same card.
- Emotional impact: recruitment is a ledger, not a negotiation; there is no player card, comparison or moment when a signing lands.

### 8. Season: fixtures, statistics (league table), stories

Evidence: [14-season-fixtures](cp01/screens/14-season-fixtures_1366x768.webp), [15-season-statistics-league-table](cp01/screens/15-season-statistics-league-table_1366x768.webp) ([full](cp01/screens/15-season-statistics-league-table_1366x768_full.webp)), [16-season-stories](cp01/screens/16-season-stories_1366x768.webp), [31-league-table-season-end](cp01/screens/31-league-table-season-end_1366x768.webp).

- League table: crests, the managed row highlighted, NRR; numbers in Pts use a different face from the rest of the row. Columns are spread evenly across 1290 px so the eye travels a long way between team and points.
- Navigation: the "Stories" tab opens a screen headed "CAREER". Season navigation is 451 ms median, the slowest place (see Performance).
- Fixtures: a clear table with a "Managed fixture" marker; result and replay columns show "[en dash]".

### 9. Settings, save and load

Evidence: [17-settings-save-load](cp01/screens/17-settings-save-load_1366x768.webp) ([full](cp01/screens/17-settings-save-load_1366x768_full.webp)), [34-load-existing-career](cp01/screens/34-load-existing-career_1366x768_full.webp).

- Interaction consistency: a grid of selects, a checkbox and sliders whose labels wrap unevenly ("Commentary narration volume (65%)" breaks onto two lines and pushes its slider down). Export, Inspect checkpoints and a native file input sit in a separate card.
- Navigation: the load screen keeps the "START A CAREER" hero above "CONTINUE CAREER"; the save card reads "0/56 · ACTIVE ... revision 29".
- Accessibility: settings include text scale, layout density, reduced motion, highlight motion and audio captions, which is a good base.

### 10. Match preparation and team selection

Evidence: [18-match-day-team-selection_1366x768](cp01/screens/18-match-day-team-selection_1366x768.webp), [full](cp01/screens/18-match-day-team-selection_1366x768_full.webp), [20-decision-panel-selection_1366x768](cp01/screens/20-decision-panel-selection_1366x768.webp).

- What exists: after "Advance to match day", the Clubhouse hero shows the fixture, a pitch and conditions card (seam 62/100, spin 65/100) and an optional tactical briefing. No separate team-selection screen was shown on this run: the XI is the suggested eleven (the post-match analysis records "The eleven matched the suggested eleven"). A "selection call" panel exists in code (`HomeScreen.tsx`) but did not appear on this fixture.
- Interaction: the opening-bowler choice is a grid of name-only buttons; four disabled "Not a bowler" options fill the top row; there is no portrait, rating, figure or recommendation beside the names.

### 11. Toss

Evidence: [19-career-match-toss_1366x768](cp01/screens/19-career-match-toss_1366x768.webp), [1920x1080](cp01/screens/19-career-match-toss_1920x1080.webp), [390x844](cp01/screens/19-career-match-toss_390x844.webp), [37-quick-match-toss](cp01/screens/37-quick-match-toss_1366x768.webp).

- Emotional impact: "Ready for the toss" in large type over the ground art is a good frame, but the toss itself is two small buttons and a line of text; no coin, no captains, no moment. The result arrives as a new heading.
- Visual hierarchy: a "Scheduled career match ... only after the match is complete" banner takes the top content row of every match screen.

### 12. Live T20 match

Evidence: [21-live-match_1366x768](cp01/screens/21-live-match_1366x768.webp), [1920x1080](cp01/screens/21-live-match_1920x1080.webp), [2560x1440](cp01/screens/21-live-match_2560x1440.webp), [1280x720](cp01/screens/21-live-match_1280x720.webp), [390x844](cp01/screens/21-live-match_390x844.webp), [1280x720 at 1.5x](cp01/screens/21-live-match_1280x720_at1.5x.webp), [full 1366](cp01/screens/21-live-match_1366x768_full.webp), [full 1920](cp01/screens/21-live-match_1920x1080_full.webp), [23-live-field](cp01/screens/23-live-field_1366x768.webp), [24-crop-tactics-panel](cp01/screens/24-crop-tactics-panel_1366.webp), [25-crop-scorecard-commentary-live](cp01/screens/25-crop-scorecard-commentary-live_1366.webp), [40-focus-live-match](cp01/screens/40-focus-live-match_1366x768.webp); video (not committed): transitions and T20 with Next delivery and Finish over.

Decision panel and controls:
- Hierarchy: the decision panel starts at y=600 of 768 at 1366; at 1280x720 and at 150% scale the advance buttons are at the bottom edge. Six advance buttons sit in a row (Next delivery, Next key moment, Finish over, Next decision, Finish innings, Finish match); the gold primary is "Next key moment", not the ball-by-ball action; "Finish over" carries a gold outline when focused, so two buttons look primary.
- Consistency: a bowler card shows the bowler for the next over while the "this ball" line names the bowler of the last ball, so at an over break the two disagree ("Isen Kelholt to Nerin Ashwell" next to a bowler card for Arven Valebridge).

Scoreboard and "this ball":
- Sporting authenticity and emotional impact: the score bug (crest, 26/1, 4.0 / 20 overs), the "this ball" stage ("1 RUN", "WICKET" in red) and the recent-balls strip (dots, W, Wd) read like a broadcast. The strip has no over separators, so twelve balls run together across two overs. Run rate and "Likely total about 110" are useful. The right half of the score bug is painting with "Match phase: Innings 1", which repeats the line above it.

Field and highlight:
- The 2D field is about 1,200 px down the page at 1366, below tactics and the opposition panel. Its labels render at 7.84 px (smallest text measured anywhere), "OFF SIDE" and "LEG SIDE" are nearly invisible, and slip markers overlap their labels.
- The highlight card can be stale: with "Key moments" pacing it still showed "FOUR · 1.5" at over 3.6. Its recent-ball chips print ball and runs together ("2.5 0", "3.1 1").
- The field legality card is near-white with pale text: measured 1.06:1 (heading), 1.65:1 (status) and 1.66:1 (phase text), all far below 4.5:1, on both the live and the completed match.
- Two ways to set the field (a named-field form of nine selects and a diagram editor with four buttons) sit in different panels.

Tactics: a three-column form of selects with enum values in mixed casing ([24-crop-tactics-panel](cp01/screens/24-crop-tactics-panel_1366.webp)); no visual of the plan.

Scorecard and commentary: batter rows show "OUT" or "NOT OUT" with no mode of dismissal or bowler, which a cricket follower expects. Commentary interleaves ball descriptions with plan log lines ("Bowling plan for Rilan Ternford: stumps line, full length (conserve effort)") and numbers every line (353 at full time); several lines use dashes. ([39-crop-pitch-lengths-scorecard-commentary](cp01/screens/39-crop-pitch-lengths-scorecard-commentary_1366.webp))

Page length: the live match is 5,718 px tall at 1366 and the completed match 12,783 px, one column, reached by a "Go to" row of jump buttons.

Responsiveness: 390 px fits with no overflow; the "this ball" strip wraps to two rows. At 150% the layout is the 1280 layout, sharper.

### 13. Match conclusion and post-match analysis

Evidence: [27-match-conclusion_1366x768](cp01/screens/27-match-conclusion_1366x768.webp), [1920x1080](cp01/screens/27-match-conclusion_1920x1080.webp), [2560x1440](cp01/screens/27-match-conclusion_2560x1440.webp), [390x844](cp01/screens/27-match-conclusion_390x844.webp), [full 1366](cp01/screens/27-match-conclusion_1366x768_full.webp), [28-post-match-analysis-panel](cp01/screens/28-post-match-analysis-panel_1366x768.webp), [28-post-match-analysis_1366x768](cp01/screens/28-post-match-analysis_1366x768.webp), [38-crop-manhattan-worm](cp01/screens/38-crop-manhattan-worm_1366.webp), [38-crop-partnership-tables](cp01/screens/38-crop-partnership-tables_1366.webp), [39-crop-wagon-wheel](cp01/screens/39-crop-wagon-wheel_1366.webp), [39-crop-pitch-lengths-scorecard-commentary](cp01/screens/39-crop-pitch-lengths-scorecard-commentary_1366.webp).

- Emotional impact: the result is a heading ("MOONSTONE BAY WON BY 45 RUNS") plus the last ball shown as "WICKET". There is no win or loss moment, no man of the match card with a portrait (only a gold name), no crowd. A stale line remains under full time: "Routine pick: Ulen Elmcroft comes in to bat."
- Navigation: "Return result to career" is the right gold action, placed in the banner at the top.
- Post-match analysis: careful, factual and honest ("not a claim that one caused the other"); phase table and turning points read well. It is all text and one table; nothing is drawn.
- Statistical visualisation: a Manhattan per innings (bars in one green, no wicket markers, no axis values), a worm with innings 1 in dark green on a dark green panel, a wagon wheel labelled "Sector 1" to "Sector 8" rather than cricket regions, and pitch-length bars in cream with near-white labels that cannot be read. Score progression and partnership tables put a narrow first column on the far right of an empty half-width cell, so numbers float in the middle of the row.

### 14. League table, season review and career progression

Evidence: [30-season-review-step1](cp01/screens/30-season-review-step1_1366x768.webp) (also [1920](cp01/screens/30-season-review-step1_1920x1080.webp), [2560](cp01/screens/30-season-review-step1_2560x1440.webp), [390](cp01/screens/30-season-review-step1_390x844.webp)), [step2](cp01/screens/30-season-review-step2_1366x768.webp), [step3](cp01/screens/30-season-review-step3_1366x768.webp), [step4](cp01/screens/30-season-review-step4_1366x768.webp), [step5](cp01/screens/30-season-review-step5_1366x768.webp), [step6](cp01/screens/30-season-review-step6_1366x768.webp), [31-league-table-season-end](cp01/screens/31-league-table-season-end_1366x768.webp), [32-clubhouse-season-complete](cp01/screens/32-clubhouse-season-complete_1366x768.webp), [33-career-progression-season2](cp01/screens/33-career-progression-season2_1366x768.webp).

- Narrative: the data is rich and well written. On this run Aster Harbour lost the title on net run rate in the final round ("level on points and wins ... They went top in the final round"), and the review says so in one sentence above a plain table without crests.
- Emotional impact: the most dramatic event of the season gets the same panel as a fixture list. No trophy, no champion's crest, no club colours, no awards ceremony.
- Readability: "·" is used for "none" in the cricketers table, the same mark the match uses for a dot ball; names are in small gold capitals with no portraits.
- Career progression: after "Start Season 2" the page stayed scrolled to the middle of the Clubhouse, and the new season opens on the same "#1, 0.0% fatigue, 0/56" cards; there is no new-season moment, no summary of development, retirements or promotions on arrival.

### 15. Onboarding, guided first match and quick match

Evidence: [35-guided-first-match-coach](cp01/screens/35-guided-first-match-coach_1366x768.webp), [36-guided-after-toss](cp01/screens/36-guided-after-toss_1366x768.webp), [37-quick-match-toss](cp01/screens/37-quick-match-toss_1366x768.webp).

- What exists: quick match goes from the title to the toss in one click (about 1.2 s measured from the click to the toss decision); the guided first match adds a coach strip ("THE TOSS: Call heads or tails...") with "End the guide". There is no onboarding for career mode itself, and no tutorial for tactics or the field.
- Hierarchy: the coach strip is a text banner of the same weight as the decision panel under it; it does not point at the control it explains.

## Accessibility measurements

| Check | Result | Evidence |
| --- | --- | --- |
| Contrast walk, title | 24 text elements, 0 below threshold | metrics (scratchpad) |
| Club selection | 32, 0 | |
| Clubhouse | 382, 1 ("v" separator 2.59:1) | [08-clubhouse](cp01/screens/08-clubhouse_1366x768.webp) |
| Squad, Office | 328 and 155, 0 | |
| Live match (first three viewports) | 117, 4 (field legality card, 1.06:1 to 1.66:1) | [23-live-field](cp01/screens/23-live-field_1366x768.webp) |
| Completed match | 159, 4 (same card) | |
| Pitch-length bars (visual) | cream bars with near-white text; outside the walk's three-viewport window, observed in the screenshot | [39-crop-pitch-lengths](cp01/screens/39-crop-pitch-lengths-scorecard-commentary_1366.webp) |
| Keyboard focus | 65 Tab stops (title 11, Clubhouse 24, live match 30), every one with a visible outline | [40-focus-title](cp01/screens/40-focus-title_1366x768.webp), [40-focus-clubhouse](cp01/screens/40-focus-clubhouse_1366x768.webp), [40-focus-live-match](cp01/screens/40-focus-live-match_1366x768.webp) |
| Reduced motion unset | title: `fl-fade-in`; 10 deliveries: 569 animation instances (`fl-score-pulse`, `fl-fade-in`, `fl-stage-glow`, `fl-stage-pop`, `fieldShotDraw`, transitions) | |
| Reduced motion set | title 0, deliveries 0 | |
| Distinct computed text sizes | title 11, Clubhouse 21, Squad 20, live match 30 (7.84 px to 54.4 px), completed match 31 | |
| Page errors and console errors | none in any part | |

The contrast walk measures solid colours only; text over the ground paintings (Clubhouse hero, scoreboard) was judged by eye. No screen reader was used: NOT RUN.

## Performance measurements

Headless Chromium in a shared Linux container, against `vite preview` on the same machine. These are local container numbers, not the owner's PC.

| Measure | Result |
| --- | --- |
| Time to interactive title (cold, 3 runs: goto to Quick match enabled) | 604, 639, 657 ms (median 639) |
| DOMContentLoaded (same runs) | 263, 359, 290 ms |
| First contentful paint | not reported by the browser in this mode (null) |
| Transfer on first load | 732 to 776 KB |
| Clubhouse navigation, median of 3 (click to selected and content drawn) | Squad 135 ms, Office 180 ms, Season 451 ms, Settings 99 ms, Clubhouse 233 ms |
| Finish over against the computer captain | median 56 ms per ball (8 overs, 189 to 254 ms per over) |
| Next delivery | median 115 ms per ball (12 balls; one outlier 2,084 ms) |
| Finish innings from about over 8 of innings 1 to full time | 15.2 s |
| Quick match click to toss | about 1.2 s (single probe) |
| JS heap used (`performance.memory`) | title 19.0 MB; Clubhouse 52.2 MB; live match 27.2 MB; after full time 28.3 MB |
| Bundle | `main` 1,502.5 KB (361.5 KB gzip); workers: match 904.6 KB, tournament 772.1 KB, rain 748.4 KB, t20 605.8 KB; CSS 79.0 KB (17.3 KB gzip); `dist` 4.8 MB |

Observation [Inference]: Finish over completes an over in about a quarter of a second with no pacing, so an over passes with no sense of the six balls; this is a presentation choice, not a speed problem.

## Styling architecture

| Item | Finding |
| --- | --- |
| Token file | `apps/web/src/floodlit.css` `:root`: 28 custom properties (`--fl-bg` to `--fl-shadow`, colours, two font stacks, radius, shadow) and the Pavilion aliases `--paper`, `--ink`, `--pine`, `--brass`, `--rule`, `--surface`, `--display` re-pointed to the night palette |
| Other stylesheets | `styles.css` (1,163 lines, 0 custom properties), `pavilion.css` (262 lines, 8 custom properties), `legacy.css` (124), `career/career.css` (101), `match/post-match-analysis.css` (44), `match/pitch-inspection.css` (30); 2,318 lines in all |
| Load order | `main.tsx` imports `styles.css`, `pavilion.css`, the fonts, then `floodlit.css` last so it overrides; Tournaments and Scenarios also import `career.css` |
| Arbitrary colours | 369 hex literals in CSS, **251 unique** (styles.css 93, floodlit.css 65, pavilion.css 59, career.css 31, legacy.css 13, post-match 8, pitch 3 unique per file); 54 unique `rgb()`/`rgba()` values; 161 hex literals in `.ts`/`.tsx` (109 unique: crests, cricketer paint, ground art, charts) |
| Font sizes | 143 `font-size` declarations, **60 unique values**; 7 distinct `fontSize` values in `.tsx`; no type-scale tokens |
| Inline styles | 51 `style={{ }}` in `.tsx` |
| Fonts | Inter 400, 600, 700 and Barlow Condensed 500, 600, 700 from `@fontsource`, bundled (SIL Open Font Licence). Georgia serif still declared in `styles.css` (three rules), `legacy.css`, `pavilion.css` (`--display`) and `career.css` (`.big-stat`) |
| Themes | one dark theme (`color-scheme: dark`); no light theme; no `forced-colors`, `prefers-contrast` or `prefers-color-scheme` rules |
| Motion | 7 `@keyframes`; reduced motion handled in `styles.css`, `floodlit.css` (four blocks), `pavilion.css`, `main.tsx` (scroll) and `LiveFieldPanel.tsx`; measured fully off under the preference |
| Focus | `floodlit.css` gold `:focus-visible` (3 px); legacy `styles.css` orange `#a65015` focus rules still apply to `h2:focus` |
| Art | one raster painting, `apps/web/src/art/aster-quay.webp` (247 KB); the other seven grounds and the scenario cards use the procedural SVG stadium in `world/ground-art.ts`; crests (`world/crest.ts`, `TeamCrest.tsx`) and portraits and figures (`PlayerPortrait.tsx`, `CricketerFigure.tsx`, `cricketer-paint.ts`) are procedural SVG |
| Art provenance | `docs/design/GROUND_ART_PROMPTS.md` records the Aster Quay painting only as "Existing painting from #90" with the service, model, date and terms-checked columns blank. Update, 27 November 2026: the owner confirmed it can be shipped in a distributed game (CD-032 resolved). |
| Audio | `packages/projections/src/audio-cues.ts`: 10 cue kinds (bat and ball dot and single, four, six, wicket, milestone, over bell, innings change, match complete, UI click), synthesised in the browser from waveforms and noise (`ORIGINAL_AUDIO_PROVENANCE_MANIFEST`: "synthesized offline in-repo ... No third-party commercial sound recordings"); optional browser speech narration; no music; muted by default |
| Commentary | `packages/projections/src/commentary.ts` (1,882 lines) and `commentary-context.ts`; text only |

Audio was not listened to: the container has no audio output. Its quality is NOT RUN.

## Baseline score (self-assessment, not acceptance)

| Category | Points | Score | Evidence for the score |
| --- | --- | --- | --- |
| Original visual identity | 10 | 5 | Coherent Floodlit night palette, gold accent, eight procedural crests and one strong painting give a recognisable look ([01-title](cp01/screens/01-title-first-launch_1366x768.webp), [07](cp01/screens/07-new-career-club-selection_1366x768.webp)). Held back by no logo mark or icon, flat figures clashing with painted art, one painting for eight grounds and identical scenario art ([05](cp01/screens/05-scenarios_1366x768.webp)), serif leftovers ([03](cp01/screens/03-exhibition-setup_1366x768.webp)) |
| Interface design and consistency | 15 | 6 | Tokens exist but 251 unique hex colours and 60 font sizes sit outside them; three header patterns (G2); light-theme leftovers (G3); table collisions and clipping ([09](cp01/screens/09-squad_1920x1080.webp), [11](cp01/screens/11-youth-academy_1366x768.webp)); misaligned cards ([13](cp01/screens/13-office-contracts-recruitment_1366x768.webp)); varying selected states (G8). Credit for no page overflow at any size and visible focus everywhere |
| Live match presentation | 15 | 6 | Broadcast score bug, "this ball" stage and recent-balls strip are good ([21](cp01/screens/21-live-match_1366x768.webp)). Decision panel at the fold, six advance buttons, field 1,200 px down with 7.8 px labels, stale highlight, illegible legality card, 5,718 px single column ([23](cp01/screens/23-live-field_1366x768.webp), [full](cp01/screens/21-live-match_1366x768_full.webp)) |
| Player and club identity | 10 | 5 | Portraits, OVR, style tags, personality and a good player card ([12](cp01/screens/12-player-page_1366x768.webp)). Club cards say nothing about the club ([07](cp01/screens/07-new-career-club-selection_1366x768.webp)); prospects lack faces and show ids ([11](cp01/screens/11-youth-academy_1366x768.webp)); selection buttons are names only ([20](cp01/screens/20-decision-panel-selection_1366x768.webp)) |
| Career experience and emotional rewards | 10 | 4 | Board objective, six-step season review, stories and milestones exist and are well written ([30 step 3](cp01/screens/30-season-review-step3_1366x768.webp)). Losing the title on NRR in the last round is a table; no ceremony, no new-season moment, misleading "#1" before play ([33](cp01/screens/33-career-progression-season2_1366x768.webp), [08](cp01/screens/08-clubhouse_1366x768_full.webp)) |
| Sound and musical identity | 10 | 2 | Ten original synthesised cues with a clean provenance statement, mixer and captions ([17](cp01/screens/17-settings-save-load_1366x768_full.webp)). No music, no crowd bed beyond cues, muted by default; not listened to (NOT RUN), so this score rests on inventory only |
| Commentary and narrative | 10 | 4 | 1,882-line contextual commentary with milestones and partnerships; stories and season narrative. Ball lines mixed with plan logs, numbered to 353, repetitive templates, dashes, no voices or personalities ([39](cp01/screens/39-crop-pitch-lengths-scorecard-commentary_1366.webp)) |
| Statistical visualisation | 10 | 4 | Manhattan, worm, wagon wheel, phase table, partnerships, spell review exist ([38](cp01/screens/38-crop-manhattan-worm_1366.webp)). Charts are small, unlabelled, single-colour, with no wicket markers; "Sector 1 to 8"; tables misaligned; pitch-length bars unreadable ([39](cp01/screens/39-crop-wagon-wheel_1366.webp)) |
| Onboarding and accessibility | 5 | 3 | Quick match in one click, guided coach, text scale, reduced motion fully honoured, 65 of 65 focus stops visible ([35](cp01/screens/35-guided-first-match-coach_1366x768.webp), [40](cp01/screens/40-focus-live-match_1366x768.webp)). Legality card fails contrast badly; sound question below the fold; 7.8 px text; no career onboarding |
| Performance and creative technical quality | 5 | 3 | Interactive title in about 0.64 s, navigation 99 to 451 ms, about 56 ms a ball, no errors. 1.5 MB main bundle, 12,783 px match page, Season place 451 ms |
| **Total** | **100** | **42** | |

## Top 10 highest-value improvements: T20 match and Clubhouse

Ordered by player value for effort. Each is concrete enough to start; none changes a rule, engine or persisted format.

1. **Match screen in two columns at 1280 px and wider.** Left: score bug, "this ball" stage, batters and bowler, decision panel. Right, sticky: the 2D field with the latest shot. Move the "Scheduled career match" banner into the header line. Target: at 1366x768 the score, the field and the advance buttons are all visible without scrolling. (CD-011, CD-012, CD-013)
2. **One primary advance action.** Make "Next delivery" and "Finish over" the visible pair (Finish over gold), fold Next key moment, Next decision, Finish innings and Finish match into a "Skip ahead" menu, and pin the tray to the bottom of the viewport on the match screen. (CD-012)
3. **Fix the field legality card and the chart colours.** Replace the near-white legality surface with `--fl-surface-2` and token text; give pitch-length bars a dark fill; colour Manhattan bars by side with a wicket dot per wicket; draw innings 1 in a light colour on the worm. Target: every text element 4.5:1 or better by the same walk. (CD-001, CD-020, CD-021)
4. **Field diagram that reads at a glance.** Minimum 11 px labels, OFF and LEG in the muted token at 4.5:1, avoid label overlap at slip and gully, show the last ball's line and runs on the field, and always show the latest ball rather than the last key moment (or say which ball it is). (CD-014, CD-015)
5. **A wicket, boundary and result moment.** A short (under 1 s, off under reduced motion) full-width banner for four, six, wicket, fifty, hundred and the result, with the batter's portrait, figures and the crowd cue; a result card with both crests, margin and Player of the Match portrait. (CD-016, CD-024)
6. **Scorecard that a cricket follower recognises.** Dismissal text ("c Yewwell b Ternford", "lbw b Norwick"), bowler figures in O-M-R-W, fall of wickets in one line, over separators in the recent-balls strip, and commentary without the plan log lines (put plan changes in a separate "Captain's notes" list). (CD-017, CD-018, CD-019)
7. **Clubhouse that says what is happening at the club.** Replace the 3 plus 1 card grid with: next fixture hero (unchanged), a "last result" card with score and top performers, a form guide (last five), a squad strip of five faces (in form, injured, tired, out of contract, prospect), and the board objective with a progress bar. Hide league position and fatigue until a match has been played. (CD-005, CD-006)
8. **Remove the light-theme leftovers in one sweep.** Retire the `styles.css` orange focus rules in favour of the gold `:focus-visible`, style file inputs as Floodlit buttons, replace Georgia with the display token, and run a lint for dashes in UI strings. (CD-002, CD-003, CD-004, CD-030)
9. **Squad and academy tables without collisions.** Fixed column widths for Availability and Fatigue (or one "Fit" chip), Training as an icon select that fits, Form as a sparkline or "No games" chip, hide all-zero readiness columns until they change, portraits and human labels for prospects, no internal ids. (CD-007, CD-008, CD-009)
10. **Shorter chrome and one header system.** One compact masthead (crest, club, season and round, save state as an icon) on every screen including matches, Tournaments, Scenarios and Rain; merge the "Away from the club" row into a menu; target content starting by y=180 at 1366x768. (CD-010, CD-026, CD-027)

## Not captured or not run

- Audio quality: NOT RUN (no audio output in the container). Speech narration: NOT RUN.
- Screen reader walkthrough: NOT RUN.
- Firefox and Windows: NOT RUN (Chromium on Linux only).
- A separate pre-match team-selection screen: not shown on this run (see journey 10); the "selection call" panel was not triggered.
- Recruitment negotiation rounds, contract renewal, youth promotion and an auction, tour or tournament match: screens captured at their start only; the flows were not played through.
- The analytics panel as an element during the live match (`.analytics-overs` was not rendered before the end of the match); the charts were captured from the completed-match page instead.
- First contentful paint: the browser returned no paint entry in this mode.
- The page-level contrast walk excludes text over images and gradients and anything beyond three viewport heights.
- No human feedback was gathered; nothing here is player opinion.

## Appendix: commands

```bash
git clone /home/user/lord-cricket-xxvi /home/user/lcx-cp01 && cd /home/user/lcx-cp01
git remote set-url origin https://github.com/SamForbes70/lord-cricket-xxvi && git fetch origin
git checkout -b pavilion/cp01-creative-audit origin/main        # 976ee76
npm ci && npm run build                                          # both exit 0
NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b                # exit 0
LCXXVI_PREVIEW_PORT=4185 node scripts/ui-preview-server.mjs &
CP01_BASE=http://127.0.0.1:4185 CP01_OUT=<scratch>/cp01 node scripts/cp01-capture.mjs perf       # exit 0
CP01_BASE=http://127.0.0.1:4185 CP01_OUT=<scratch>/cp01 node scripts/cp01-capture.mjs main       # exit 0, 3 items not captured, 2 recaptured by onboarding
CP01_BASE=http://127.0.0.1:4185 CP01_OUT=<scratch>/cp01 node scripts/cp01-capture.mjs a11y       # exit 0
CP01_BASE=http://127.0.0.1:4185 CP01_OUT=<scratch>/cp01 node scripts/cp01-capture.mjs scale150 video   # exit 0
CP01_BASE=http://127.0.0.1:4185 CP01_OUT=<scratch>/cp01 node scripts/cp01-capture.mjs onboarding # exit 0
npm run lint                                                     # exit 0
# style counts
grep -rhoE "#[0-9a-fA-F]{3,8}\b" apps/web/src --include=*.css | tr A-F a-f | sort -u | wc -l     # 251
grep -rhoE "font-size:\s*[^;]+" apps/web/src --include=*.css | sort -u | wc -l                   # 60
```

The perf part ran alone; `main` and `a11y` ran at the same time, which does not affect screenshots or contrast but means no timing is taken from them. Screenshots were converted from PNG to WebP (quality 78) with Pillow.
