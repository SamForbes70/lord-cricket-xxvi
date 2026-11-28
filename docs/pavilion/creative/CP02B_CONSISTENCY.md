# CP02B consistency and polish

Studio Production Directive 05, a CP02 (tokens) and CP03 (screen structure) follow-up pass. Branch `pavilion/cp02-consistency`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a playtest**. No person has used the changed screens yet. Anything not measured directly is labelled [Inference].

Baseline: `main` at `bfe629b` (CP10 merged); `main` at `a6429d9` (CP09 audio, #189) was merged in before the pull request was opened. Defects addressed, from [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md): CD-026, CD-027, CD-030, CD-031, a CD-022 follow-up, the Text scale bug recorded as remaining work in [CP08_STATISTICAL_VISUALISATION.md](CP08_STATISTICAL_VISUALISATION.md), and the small items CD-041, CD-042, CD-044, CD-048 and CD-049.

## Problem

Seen on `main` at `bfe629b` in the "before" captures below:

- **Four header patterns** (CD-026, CD-027). The match screen had a one-line bar whose eyebrow changed with the mode ("THE FICTIONAL CRICKET EXHIBITION", "CAREER MATCHDAY"); Tournaments and Scenarios had a career-style bar with two or three cross links spread across it; Rain and player reviews had no bar at all and no way back except the browser's Back button.
- **Dashes** (CD-030). 45 en or em dashes in 10 `.tsx` files: an en dash as the empty-cell mark in 38 table cells, en dashes in ranges (openers "1 to 2", squad size "18 to 22" written with a dash), and em dashes inside sentences (the audio caption "Ready", the free agent line).
- **Internal values on screen** (CD-031). Prospect ids ("acad-s001-team01-1") under academy names, player ids ("p001") on the player page and in the Office tables, "rev 0" on the save badge, "revision 0" and "ACTIVE" in the saved-career list, "revision" in the saved-games list, and enum spellings in the squad ("AVAILABLE", "BATTING PRACTICE"), the academy ("ALLROUNDER", "FIELDING PRACTICE") and the match tactics ("stock", "NORMAL (recommended)", "STUMPS", "GOOD").
- **Plain tables** (CD-022 follow-up). The match scorecard, the Statistics tables and the Office tables still used the base table style: the first column takes 48% of the width and every other cell is right-aligned, so figures float in wide empty columns.
- **Text scale did not reach tokenised text.** Measured with a probe on the match screen: `--type-sm`, `--type-md` and `--type-xl` stayed 14, 16 and 22 px at Text scale 150%. Root cause: the type tokens are `calc(<rem> * var(--text-scale))` declared on `:root`. A custom property's `var()` is resolved on the element that declares it and descendants inherit the resolved value, so the tokens were fixed at `:root`, where `--text-scale` is 1. Setting `--text-scale` on the match screen changed nothing below it. CP08 worked round it inside the analytics panel only.
- **Small ones.** The "Copy name / Save career copy" form sat at the foot of every career screen (CD-041); the Stories tab opened a screen headed "Career" (CD-042); the player page showed the name twice and its award note said "not an official ICC or broadcast formula" (CD-044); the season review used "·", the dot-ball mark, for "none" (CD-048); in Settings a wrapped label ("Commentary narration volume (65%)") pushed its slider out of line and sliders were a fixed short width (CD-049).

## What changed

Presentation only. No change to the engines, simulation, random stream, outcomes, worker protocol, commands, contracts or any saved format, and no new preference field. Stored values (enum spellings, ids, revisions, the stored award `provenanceNotice`) are untouched; only what the screen prints changed. No new runtime dependency, no network, no new binary asset except the screenshots in `cp02b/screens/`.

1. **One masthead** (`apps/web/src/ModeMasthead.tsx`, `masthead.css`, new; CD-026, CD-027). Every screen outside the career now has the same bar: a back control, the game's name as the eyebrow, and the screen's own title as the page's one `h1`. Tournaments, Scenarios and Rain go back to the Title screen (the hub that lists every mode); the rain match goes back to the rain matches list; the match screen reads "Exhibition match", "Tournament match" or "Scenario challenge" with a back link to the Title screen, Tournaments or Scenarios, and "Career match" with no back link (a career match leaves through its own result flow). The match screen keeps CP03's single broadcast line (`compact`). The ad hoc cross links on Tournaments and Scenarios are gone; the Title screen and the career's "Away from the club" row carry them.
2. **No dashes** (CD-030). Empty cells show `NoValue` (`apps/web/src/NoValue.tsx`): the word "none" in muted text, which a screen reader reads the same way. Ranges read "1 to 2"; sentences use a colon or comma. `career/format.ts`'s `metric()` returns "none". A unit test (`tests/unit/cp02b-ui-strings.test.ts`) scans every `.ts` and `.tsx` file under `apps/web/src` (string literals, JSX text and comments) for U+2013 and U+2014 and fails on any. The test for the audio caption (`tests/ui/audio-stage8.spec.ts`) looked for the old caption (with an em dash after "Ready") being gone; it now looks for the new "Ready: match audio captions" being gone, so it still checks the same thing rather than passing because the old text no longer exists.
3. **Words, not internal values** (`apps/web/src/display-labels.ts`, new; CD-031). `enumLabel` turns a stored spelling into sentence case ("BATTING_PRACTICE" to "Batting practice", "OFF" to "Off stump"); `roleLabel`, `availabilityLabel`, `careerPhaseLabel` ("In progress", "Season complete") and `matchPhaseLabel` build on it. Applied to the squad table (availability, training), the academy (role, focus; prospect id removed), retired alumni (reason; id removed), the Office contract and free-agent tables (role; ids removed), the player page (role; id removed), the saved-career list (phase; revision removed), the saved-games list (phase; revision removed), the match tactics (Variation "Stock ball", Effort, Line, Length) and the tactical briefing tables (role, bowling style, intent). Option `value`s are unchanged, so every `selectOption("BATTING_PRACTICE")` and the worker commands are unaffected. The save badge reads "0/56 fixtures"; its revision moves to a `data-revision` attribute, and `tests/ui/career-replay-and-recovery.spec.ts` now checks that attribute for exact equality (it used to check that the badge text contained "rev 1", which "rev 10" would also satisfy).
4. **Shared table style** (CD-022 follow-up). `data-table` (CP08) on the match scorecard (batting and bowling, with `scope` on headers and `num` on figures), every Statistics table, every Office table, the archived replay table and the academy table. A `lead-1` or `lead-2` modifier right-aligns every column after the first one or two, so the long statistics tables need no class per cell. Row headers now keep the row's own rule and stripe instead of the gold header rule the base style gives every `th`.
5. **Text scale reaches every token.** `tokens.css` declares the type scale on `:root, .text-scale-root`; the match screen, the career screens and the club selection carry `text-scale-root` with their `--text-scale`, so each token is recalculated where the setting is. Measured on the match screen after the change: 21, 24 and 33 px at 150% (14, 16 and 22 px at 100%). CP08's re-declaration in `analytics-charts.css` is removed as redundant. The career screens had the same root cause (their Text scale also skipped tokenised text such as table headings), so they get the same fix [Inference: the match screen was the reported case; the career screens were checked only through the browser suite and the captures]. A browser regression test (`tests/ui/settings-scale.spec.ts`) measures a token probe and the masthead title at 100% and 150% and checks no horizontal overflow at 390 px.
6. **Small ones.** CD-041: the manual copy form is a "Career copy" panel on Settings, next to the export and checkpoint actions; its label, button name and behaviour are unchanged, and three specs now open Settings before using it. CD-042: the Stories screen is headed "Stories". CD-044: the player hero no longer repeats the name under the "Player: name" heading; every award note on screen (match, career report, statistics, player page) reads "Game award: the game's own transparent points rule for matches and seasons, not a formula used by any real governing body or broadcaster." The stored notice keeps its recorded wording; the awards spec now checks the new sentence and that "ICC" is absent. CD-048: the season review uses `NoValue` ("none"). CD-049: Settings use a subgrid, so each setting's label row is shared across its grid row and every select and slider in a row starts on one line; sliders fill the column (`career/settings.css`).

## Evidence

Captured with `scripts/cp02b-capture.mjs` (new) at 1366x768 and 390x844, Chromium, from a build of `main` at `bfe629b` ("before") and of this branch ("after"). Files are in `cp02b/screens/` as `<name>_before_<size>.webp` and `<name>_after_<size>.webp`.

| Defect | Captures |
| --- | --- |
| CD-026, CD-027 | `01-match-setup`, `02-tournaments`, `03-scenarios`, `04-rain`, `05-rain-match` |
| CD-030 | `16-office` ("18 to 22 allowed"), `17-statistics` (NRR "none"), `18-stories` |
| CD-031 | `12-squad`, `13-academy`, `14-player-page`, `16-office`, `21-load-career`, `30-tactics` |
| CD-022 follow-up | `32-scorecard`, `17-statistics`, `16-office` |
| Text scale | `31-match-text-150` |
| CD-041 | `11-clubhouse-foot` (form gone), `20-settings-file` (Career copy panel) |
| CD-042 | `18-stories` |
| CD-044 | `14-player-page`, `15-player-awards` |
| CD-048 | `40-season-review-squad` |
| CD-049 | `19-settings` |

Measured by the capture script (`metrics-*.json`, not committed):

- Type tokens on the match screen at Text scale 100% and 150%: before 14/16/22 and 14/16/22 px; after 14/16/22 and 21/24/33 px.
- Internal ids or revisions in visible text (`p001`, `acad-...`, `rev N`, `revision N`): before on squad, academy, player page, Office and the saved-career list; after none on any captured screen.
- En or em dashes in visible text: before on match setup, player page, Office, Statistics, Stories, tactics and scorecard; after only in text built by `packages/projections` (field legality ranges such as overs 1 to 6, spell summaries, award explanations, the historical statistics note), which is outside this pass's `.tsx` scope (remaining work).
- Horizontal overflow: 0 px in every capture, before and after, including the match screen at 390 px with Text scale 150%. No page or console errors.

## Accessibility

- Each mode screen has one `h1`, the screen's own title; the back control comes first in the bar, after the match screen's existing "Skip to next decision" link, so focus order is back, title area, then content. The arrow on the back control is `aria-hidden`; its accessible name is its text.
- "none" is real text, so screen readers say the same word sighted players see (the season review previously hid "·" and read "none" from a hidden span).
- Scorecard headers carry `scope`; row headers keep `scope="row"`.
- Larger Text scale now enlarges tokenised text too; no horizontal overflow at 390 px and 150% in the captures or the new test.
- Nothing new animates; the back control's hover is a colour change only, so reduced motion needs no rule.

## Checks

Linux container, Node 22, Chromium 1243 and Firefox 1495 from `/opt/pw-browsers`. Browser runs used an untracked copy of `playwright.ui.config.ts` on port 4213 with `--trace off`.

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build of compiled packages | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `3a7c24f` and merge `5822402` | PASS (exit 0) |
| Typecheck | `npm run typecheck` | `3a7c24f` and `5822402` | PASS (exit 0) |
| Lint and package boundaries | `npm run lint` | `3a7c24f` and `5822402` | PASS (exit 0) |
| Build | `npm run build` | `3a7c24f` and `5822402` | PASS (exit 0) |
| Unit suite | `npx vitest run --maxWorkers=2` | working tree of `3a7c24f` | PASS: 147 files, 1,277 tests |
| Unit suite after merging `main` | `npx vitest run --maxWorkers=2` | `5822402` | PASS: 148 files, 1,283 tests |
| Chromium, full `tests/ui` | `npx playwright test --config <local copy> --project chromium --trace off` | working tree of `3a7c24f` | FAIL then fixed: 131 passed, 2 failed. Both failures were specs reading text this pass changed on purpose: the lifecycle spec read the prospect id printed under the name (now read from the row's test id, and the spec checks the id is not printed) and the briefing spec looked for "ROTATE" (now "Rotate"). Both passed on rerun (3 passed) and are fixed in `2d10e4e` |
| Chromium, 23 specs on changed screens plus CP09 audio | same, with the spec list | `5822402` | PASS: 63 passed |
| Firefox, the same 23 specs | `npx playwright test --config <local copy> --project firefox --trace off` | `5822402` | PASS: 63 passed |
| Chromium, full `tests/ui` after the merge | | `5822402` | NOT RUN (the merge added CP09 audio only; its spec is in the 23) |
| Hosted CI (Linux, Windows core, Chromium, Firefox) | | | NOT RUN locally; see the pull request |

The 23 specs: `audio-stage8`, `audio-cp09`, `awards-stage10`, `career-copy`, `career-replay-and-recovery`, `match-navigation`, `settings-scale`, `player-lifecycle-stage3`, `tactical-briefing-stage5`, `rain-stage14`, `scenario-mode-stage12`, `tournament-stage15`, `match`, `title-guided`, `squad-economy-stage4`, `historical-stats-stage9`, `season-review`, `player-identity-v1`, `player-identity-v3`, `accessibility-release-audit`, `pavilion-result-settings`, `e5-recommended-plain-language`, `own-side-controls`.

Specs changed, and why each still tests the same behaviour: `audio-stage8` (the caption it checks has gone now reads "Ready: ..."), `awards-stage10` (checks the neutral award sentence and that "ICC" is absent), `career-copy`, `match-navigation` and `career-replay-and-recovery` (open Settings before using the moved copy form; the recovery spec checks the revision as an exact `data-revision` value), `player-lifecycle-stage3` and `tactical-briefing-stage5` (as above), `settings-scale` (new Text scale regression test). The new unit test was not run against `main`; by the same search it would fail there (45 dashes in `.tsx` files at `bfe629b`).

## Self-critique (as an independent creative director)

- The masthead is consistent, but the career keeps its own richer bar (crest, season, save badge). That is deliberate (the career is a different place), but a player moving from Tournaments into the career still sees two bar shapes.
- Removing the Tournaments and Scenarios cross links makes "go to Career" two clicks (back to the Title screen, then Career) where it was one.
- "none" in a column of numbers is clearer than a dash but wider; in the season review squad table it is the most common cell value early in a season and reads as noise [Inference].
- The Office tables now size to content, which makes them narrower but taller where the renewal controls stack; the Office still needs CD-036's tabs.
- `enumLabel` is generic sentence case. It reads well for the values seen here, but a future enum could produce an awkward phrase; specific labels are listed in one place to fix that.
- The academy table now sizes its columns to content, and in the 1366 capture the focus select and the Queue checkbox no longer overlap (part of CD-009). That was a side effect of the shared table style, not a designed fix, and portraits for prospects are still missing.

## Limitations and remaining work

- Dashes and enum spellings in text built by `packages/projections` (field legality, spell summaries "accepted plan targeted GOOD", award explanations, the historical statistics note) are not covered by this pass or its unit test, which scans `apps/web/src` only.
- Office offer status ("PENDING_ROUND") and offer kind still show stored spellings; an existing spec matches "PENDING_ROUND", so changing it needs that spec updated with care.
- The roster career (`RosterCareerApp.tsx`) is a single screen and keeps its copy form in place; it does not yet carry `text-scale-root`.
- "Inning s 1" wraps mid-word in the match phase card at 390 px and 150% (seen before and after; not caused by this pass).
- CD-009 is only partly addressed (see above); CD-050 (one selected state in navigation) remains open.
- Not run: Firefox for the full `tests/ui` suite (only the specs touching changed screens), hosted Windows CI, a human playtest and a screen-reader walkthrough.
