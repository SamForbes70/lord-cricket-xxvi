# CP08 statistical visualisation

Studio Production Directive 05, pass CP08 (statistical visualisation), first slice. Branch `pavilion/cp08-statistical-visualisation`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a playtest**. No person has seen it yet. Anything not measured directly is labelled [Inference].

Baseline: `main` at `8f5f7ef` (CP04 merged). The defects addressed are in [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md): CD-020 (P1, pitch-length bars), CD-021 (P2, Manhattan, worm and wagon wheel), CD-022 (P2, analytics and season review tables) and CD-018 (P3, recent-balls strip). CP03 had already darkened the pitch-length track, given the innings sky blue and vermilion, put a "W" over Manhattan bars with a wicket and drawn a divider in the strip; the before captures below are of `main` with those changes, so they show what was still wrong.

## Problem

On `main` at `8f5f7ef`, at 1366x768:

- **Manhattan**: two rows of plain bars with no runs axis or scale; wickets were a text "W" or "2W" over the bar, in the same vermilion as the second innings; colour was the only difference between innings.
- **Worm**: a line chart with no ticks ("Runs (0 to 154)", "Legal balls (0 to 120)"), no wicket markers, innings told apart by colour only, and a 41-row "Score progression" table under it with its first column 48% of the width and right-aligned.
- **Wagon wheel**: eight spokes in one colour labelled "Sector 1" to "Sector 8", no orientation (which way is the bowler, which side is off), and a sector list in a 5 rem column.
- **Pitch lengths**: bars in a translucent gold (1.4:1 against the panel) with labels drawn on top of the bar, in capitals ("FULL TOSS"), and a table whose first column was a half-width empty cell.
- **Tables**: the base stylesheet gives every first header cell 48% of the table and right-aligns every cell, so in the partnerships, fall of wickets and pitch tables the innings number floated mid-row; in the season review the "Pos" column was 602 px of a 1,254 px table while Club, P, W, L and Pts were 130 px each, all left-aligned (measured by the capture script).
- **Recent-balls strip**: a thin divider between overs but no over number.

## What changed

Presentation only. No change to the engines, outcomes, random stream, worker protocol, commands, contracts or any saved format; no new runtime dependency or chart library (SVG and CSS only); no network use. Every chart number is read from data the page already receives.

1. **Charts drawn at their measured width** (`apps/web/src/match/AnalyticsPanel.tsx`). Each chart measures its container (`ResizeObserver`) and lays itself out in real CSS pixels, so tick labels stay 12 px at 390 px wide instead of shrinking with a fixed `viewBox`. Margins and label spacing grow with the match screen's Text scale.
2. **Manhattan (CD-021)**. One chart with both innings' bars side by side for each over, the first innings solid, the second striped (a hatch pattern: a non-colour cue), a runs axis with round ticks and gridlines, over numbers along the bottom (every over when they fit 26 px apart, otherwise every 2nd, 5th or 10th), axis titles, and one white marker per wicket stacked above the bar. A legend names each innings by its batting side ("Innings 1, Moonstone Bay"). A red-ball match (four innings) gets one chart per innings, sharing one runs axis. A one-line summary above the chart states each innings' biggest over and the overs in which wickets fell.
3. **Worm (CD-021)**. Over and runs axes with round ticks, the first innings a solid line, the second dashed (the third dotted, the fourth dash and dot), a marker at every wicket in a shape per innings (circle, square, triangle, diamond), and a legend drawing each line style and marker with the batting side's name. The summary states each innings' final score ("80/6 in 20 overs").
4. **Wagon wheel (CD-021)**. The eight recorded sectors are named in cricket terms (third man, point, cover, mid-off, mid-on, midwicket, square leg, fine leg) and grouped off side, straight and leg side; the wheel shows the bowler's end at the top, the wicketkeeper at the bottom, "Off side" and "Leg side" in the corners, a short pitch from the batter, the eight regions as faint wedges (off side tinted blue, leg side tinted vermilion), the runs as gold wedges, and each region's name and runs at the rim. For a left-handed batter the drawing is reflected and the off side moves to the left; "All batters" places every shot on its own batter's side and is drawn as for a right-hander. The list beside the wheel names each region with its side and its fours and sixes. An Innings filter narrows the wheel to one batting side. See "The wagon wheel's region names" below for where the names come from and the conflict found.
5. **Pitch lengths (CD-020)**. Solid gold bars (`--accent`) on a sunken track (`--chart-track`), the length name to the left of the bar and the count and share ("64 (72%)") to the right, so no text sits on a bar; names in sentence case ("Good length", "Full toss").
6. **Data tables (CD-022)** (`apps/web/src/data-table.css`). A shared `data-table` style: columns sized by their content, text columns left-aligned, numeric columns (`num`) right-aligned with tabular figures, row headers (a player's name) in body type rather than as another header, and a wrapper that hugs the table instead of framing empty space. Applied to the partnerships, fall of wickets, over-by-over and pitch-length tables in the analytics, and to the season review's final league table and squad table. The season review's Pos column is now 44 px, Club 125 px and the numeric columns 33 to 43 px, right-aligned (measured).
7. **Text alternatives**. Every chart is an `img` with an accessible name and `aria-describedby` pointing at its visible written summary. Data tables: the Manhattan and worm share an over-by-over table (runs and wickets in each over and the score after it, for each innings), and the pitch lengths have their table, each inside a disclosure ("Manhattan and worm as a table", "Pitch lengths as a table") so the page is not doubled in length; the wagon wheel's list is its text alternative; partnerships and fall of wickets stay as visible tables. Each worm legend entry also says, for screen readers, which line style and marker shape belong to that innings.
8. **Recent-balls strip (CD-018)** (`BroadcastStage.tsx`, `match-broadcast.css`). The strip's balls are grouped by over; each group is headed "Over 5" and divided from the previous one by the CP03 rule. Each ball also carries a screen-reader label ("4.3: four"); the chip itself is hidden from screen readers so it is not read as "4" alone. Over numbers count from 1, as the advance hint on the same screen does ("Over 5: 3 legal balls to go"); the stage's "Over 4.3" is the ball notation.
9. **Tokens** (`apps/web/src/tokens.css`). `--chart-series-1` to `--chart-series-4` (sky blue and vermilion from the existing positive and negative tokens, then Okabe and Ito yellow and reddish purple lightened for the dark ground), `--chart-marker`, `--chart-track`, `--chart-grid` and `--chart-axis`. Chart styles use tokens only (`apps/web/src/match/analytics-charts.css`). The old chart rules that targeted the replaced markup were removed from `styles.css`, `floodlit.css` and `match-broadcast.css`.

The pure layout (`apps/web/src/match/chart-layout.ts`) has unit tests in `tests/unit/chart-layout-cp08.test.ts`: round ticks, over label thinning, grouped bar positions and heights, wicket marker stacking and bounds, shared axes, worm lines and markers (including two wickets on one ball), the over-by-over totals, the sector names and sides, off side on the right for a right-hander and on the left for a reflected left-hander, wedge paths, label anchoring, and grouping the strip by over with wides and no-balls.

## Data source for each chart

Every chart reads the match analytics projection (`MatchAnalytics`, `packages/projections/src/match-analytics.ts`), which the match worker builds from accepted `DELIVERY_RECORDED` events and sends in the view. The page adds, groups and scales those numbers; it decides no cricket fact.

| Chart or table | Source in the view | What the page does with it |
| --- | --- | --- |
| Manhattan | `analytics.overSummaries` (runs, wickets per innings and over) | Places bars; one marker per wicket |
| Worm | `analytics.worm` (cumulative runs and wickets after each delivery), `finalRuns`, `finalWickets`, `finalLegalBalls` | Plots the points; a marker where the wicket count rises |
| Over-by-over table | `analytics.overSummaries` | Running total of each innings' overs, in order |
| Legends | `view.innings[i].innings.battingTeamId` and `view.teams` (names) | Names the batting side of each innings |
| Partnerships, fall of wickets | `analytics.partnerships`, `analytics.fallOfWickets`, `view.names` | Unchanged figures in the shared table style |
| Wagon wheel | `analytics.shotSectors` (bat runs, fours and sixes per innings, batter and recorded sector), `view.hands` | Sums by sector for the chosen innings and batter; reflects a left-hander (the existing `displaySector`) |
| Pitch lengths | `analytics.pitchLengths`, `analytics.unrecordedLengths` | Bars and shares of the total |
| Recent-balls strip | `fieldPresentation.recentHighlights` (each cue's `overBallLabel`) | Groups consecutive balls by the over in the label |
| Season review tables | `SeasonTeamTableRow` and `SeasonReview.squad`, as before | Alignment and widths only |

## The wagon wheel's region names

The engine records a shot as a sector from 0 to 7 relative to the batter. Whether those numbers map to fielding regions is not defined in one place, and the definitions that exist disagree:

- [ADR 013](../../decisions/013-conditional-delivery-provisional-pack-and-address-registry.md) records "off 0,1,2; straight 3,4; leg 5,6,7" as an explicit implementation convention, and the frozen generator uses it (`sectorCategories` in `packages/simulation/src/generator.ts` weights sectors 0 to 2 for an off-stump line). The match commentary names the same recorded sectors third man, point, cover, mid-off, mid-on, mid-wicket, square leg and fine leg (`SECTOR_LABELS` in `packages/projections/src/commentary.ts`).
- The default field template ([ADR 004](../../decisions/004-configuration.md), `packages/data/src/defaults.ts`) gives its fielders sectors in the other direction: fine leg 1, deep square leg 2, midwicket 3, mid-on and mid-off 4, cover 5, point 6, slips 7. The generator's `coveringFielder` uses those slot sectors to choose who fields a ball, and the live field diagram (`packages/projections/src/field-presentation.ts`) draws sector 0 on a right-hander's leg side.

The wagon wheel follows the first: the generator's own line weighting, the decision record that names the grouping, and the words the commentary already prints for the same balls. It does not invent a ninth convention, and its note says the regions are directions from the bat, not fielding positions measured on a field. **Dependency recorded, not resolved here:** the live field diagram can draw a ball on the opposite side from the wagon wheel and the commentary, and the engine's fielder choice uses the template's orientation. One versioned sector definition is an owner decision; changing the engine's behaviour would need a new model version, and changing the live field's drawing belongs to a later live-match pass.

## Before and after evidence

Captured with [`scripts/cp08-capture.mjs`](../../../scripts/cp08-capture.mjs) (cut down from `scripts/cp04-capture.mjs`), headless Chromium 1243 from `/opt/pw-browsers`, against `vite preview` on port 4194 in a worktree of `main`. A career match against the computer captain (Aster Harbour): three overs and three balls for the strip, then Finish innings to full time for the charts; a second new career simulated to the season review for its tables; a quick match under reduced motion. Each run is a new career, so the matches differ between captures.

- Before (`8f5f7ef`, `main`): [`cp08/before/`](cp08/before/), 35 WebP.
- After (this branch): [`cp08/screens/`](cp08/screens/), 35 WebP at 1366x768, 1920x1080 and 390x844: `50` live match, `51` recent-balls strip, `60` analytics in the viewport, `61` Manhattan, `62` worm, `63` partnerships and fall of wickets, `64` wagon wheel, `65` pitch lengths, `66` wagon wheel for a left-handed batter, `70` season review league table, `71` season review squad table.
- Best three: [`60-analytics-manhattan_1366x768`](cp08/screens/60-analytics-manhattan_1366x768.webp), [`64-wagon-wheel_1366x768`](cp08/screens/64-wagon-wheel_1366x768.webp), [`70-season-review-table_390x844`](cp08/screens/70-season-review-table_390x844.webp).

Horizontal page overflow was 0 px in every before and after capture at 1366x768, 1920x1080 and 390x844, and 0 px for a red-ball and a T20 exhibition at 390x844 with Text scale 150% (checked separately while building). No page errors or console errors in any capture.

## Accessibility

**Contrast**, measured by the capture script in Chromium against the composited panel behind each chart (`--surface-1`, `#10292b`), WCAG relative luminance; series 3 and 4 (red-ball innings 3 and 4 only) computed from the token values against the same panel:

| Element | Ratio | Requirement |
| --- | --- | --- |
| Labels, values, region names (`--text-default`, `--text-strong`) | 13.7:1, 15.28:1 | 4.5:1 text |
| Tick labels and axis titles (`--text-muted`) | 8.74:1 | 4.5:1 text |
| Innings 1 bars, line and markers (`--chart-series-1`, sky blue) | 7.92:1 | 3:1 graphics |
| Innings 2 (`--chart-series-2`, vermilion) | 7.41:1 | 3:1 graphics |
| Innings 3 and 4 (`--chart-series-3`, `--chart-series-4`) | 11.56:1, 7.83:1 | 3:1 graphics |
| Wicket markers (`--chart-marker`) | 15.28:1 | 3:1 graphics |
| Pitch and wagon bars (`--accent`) | 8.49:1 on the panel, 9.57:1 on the track | 3:1 graphics |
| Axis lines (`--chart-axis`) | 4.18:1 | 3:1 graphics |
| Stripes in the innings 2 bars (dark ink on vermilion) | 3.93:1 | Pattern visible |
| Gridlines, region wedges, track outline | 1.08:1 to 1.47:1 | Decorative; no information |

Before, the pitch-length bar fill measured 1.4:1 against the panel (its gold outline 8.49:1). Sky blue and vermilion are 1.07:1 against each other: they differ in hue (chosen from the Okabe and Ito palette to stay apart for the common colour-vision types), not lightness, which is why each innings also has its own bar pattern, line dash and marker shape [Inference: not tested with a colour-vision simulator].

**Not colour alone**: innings by pattern, dash and marker shape as well as colour, each named in the legend; wickets by a marker shape, not a colour; wagon wheel sides by their names and the "Off side" and "Leg side" labels; values printed beside every bar.

**Reduced motion**: the charts and the strip have no animation or transition. Measured with `reducedMotion: "reduce"` after a quick match: 0 running animations in the analytics, and 0 of 339 chart, list and strip parts with an animation name or a transition duration. The same was true before.

**Text scale**: the type tokens are resolved on `:root`, where `--text-scale` is 1, so the match screen's Text scale never reached any tokenised text. The analytics panel re-declares `--type-xs` and `--type-sm`, so chart text now grows with the setting; the rest of the match screen still has the issue (remaining work).

**Screen readers**: each chart is announced by its name and summary; the strip reads "Recent balls this innings", then each over's number and each ball as "4.3: four". No screen reader was used: NOT RUN.

**No en or em dashes** in any new UI string or in this record.

## Checks

Recorded in the pull request description, with the exact commands and revision.

## Self-critique (as an independent creative director)

What now works: the Manhattan reads like a broadcast graphic: two innings side by side, an axis, a dot for each wicket, the sides named. The worm finally says where the wickets fell. The wagon wheel is oriented (bowler at the top, off and leg marked) and speaks cricket instead of "Sector 4". The pitch bars and every table are readable and scan in a straight line. The strip says which over you are looking at.

Fixed during this pass: the first full Chromium run failed the analytics test in all three formats because the left-hander note had been reworded ("is reflected, so the off side..."), and the test looks for the existing sentence "The left-handed batter's display is reflected." The UI keeps that sentence and adds "The off side is on the left." after it; the test is unchanged. After looking at the screenshots: chart text shrank with the drawing at 390 px (now laid out at the measured width); at Text scale 150% the chart type stayed at 12 px while the page grew (chart type now follows the setting, and margins grow with it); the league table sat in a full-width bordered box with 900 px of empty space (the wrapper now hugs the table); abbreviation underlines cluttered the table headers; "15 17%" read as one number (now "15 (17%)"); the Manhattan summary read "most runs in an over 8, in over 1" (now "biggest over 8 runs (over 1)"); red-ball innings had different runs axes (now shared); wicket dots were 2.5 px at 390 px (now at least 3 px).

What still looks amateur, in order:
1. The wagon wheel's names rest on a convention that the field template and the live field diagram contradict (above). Until the owner settles one definition, the two screens can disagree about the same ball.
2. At 390 px with Text scale 150% the wagon wheel's radius falls to 52 px and its rim labels crowd; the list below carries every name and number, but the drawing itself is small.
3. The Manhattan's wicket markers sit above the bar, so a 0-run over with wickets shows dots on the axis with no bar; correct, but easy to miss.
4. The over-by-over and pitch tables are behind disclosures; a player who wants the numbers has one more click.
5. The tables keep the existing dark header band and gold header text; a quieter header would suit the new figures better.
6. The strip's "Over 4" beside the stage's "Over 3.3" for the same ball is cricket-correct but may read as a contradiction to a newcomer [Inference].

## Limitations and remaining work

- **Sector convention (dependency)**: an owner decision on one versioned sector-to-region definition; then the live field diagram's drawing (presentation) and, if the engine's fielder choice is to change, a new model version (engine).
- **Text scale on the rest of the match screen**: re-declare the type tokens where `--text-scale` is set (CP13 accessibility, or a CP02 token follow-up).
- **Analytics during the live match**: the charts appear at full time only, because the analytics projection is produced then; a live Manhattan or worm would need the worker to send it during play (a dependency, not computed in the page).
- **Other tables** (scorecard, statistics, office) do not use the shared style yet.
- `sectorEndpoint` in `analytics-geometry.ts` is no longer used by the page; it is kept with its existing unit test.
- One career per capture; local container numbers only.
- Human testing outstanding.
