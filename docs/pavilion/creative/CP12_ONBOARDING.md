# CP12 onboarding and first session

Studio Production Directive 05, pass CP12 (onboarding and navigation), first slice. Branch `pavilion/cp12-onboarding`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a playtest**. No person has used the changed screens yet, and no screen reader has been run over them. Anything not measured directly is labelled [Inference].

Baseline: `main` at `f05ecf5` (CP02B merged). Defects addressed, from [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md): CD-046 (no front door at the bare address, no Continue or Settings on the title), CD-047 (custom match copy), CD-052 (the guided coach does not point at the control), and a follow-up to CD-028 (the sound question's heading came before the page's `h1`). The register's other CP12 rows are those three; CD-028 was already moved by CP09.

## Problem

Seen on `main` at `f05ecf5` in the "before" captures below, walking the first-launch path at 1366x768 and 390x844 with reduced motion requested:

- **No front door at the bare address** (CD-046). `http://127.0.0.1:4180/` opened "Start a Career" (`01-bare-address_before`): the route default in `apps/web/src/main.tsx` was `#career`. Only the launchers open `#title`, so a player who types the address, or uses a bookmark without the hash, skips the title screen and its quick and guided matches.
- **No Continue and no Settings on the title** (CD-046). A returning player with a career in progress saw the same title as a new player (`09-title-returning-career_before`): to resume they had to know that Career opens their last career, and an unfinished match could only be found through Custom match. Settings existed only inside a loaded career (its Settings tab) or at the foot of a match.
- **Heading order on first launch.** The sound question's `h2` ("Play with sound?") came before the wordmark `h1` in the document (measured heading order: `h2 Play with sound?`, then `h1 Lord Cricket XXVI`).
- **Focus dropped after the sound question.** Answering it by keyboard removed the focused button with the question, and focus fell back to the top of the document (measured: the active element was `body`).
- **Custom match copy** (CD-047). The setup said "You make decisions for both teams initially. After starting a match, you can optionally delegate". The code's real default (`aiTeamId` in `main.tsx`): a quick or guided match hands the opponent to the computer captain; a custom match starts with no computer side, unless a side was handed to the computer earlier in the same browser session (kept in `sessionStorage`), in which case the computer keeps that side. The old copy was right about the plain case but vague ("initially", "optionally delegate"), did not say how to hand a side over, and was wrong after a quick match in the same session.
- **The guided coach was a text banner** (CD-052). It explained the decision but did not say which control answers it or where it is (`05-guided-toss_before`, `06-guided-first-ball_before`), and it said the same when the computer captain, not the player, was making the decision.
- **No way back to the title from inside a career.** The career's "Away from the club" row led to Exhibition, Scenarios, Tournaments and Rain matches; the only way to the title screen was Choose career, then the club selection's Title screen link (`08-career-home_before`).

## What changed

Presentation and navigation only. No change to the engines, simulation, random stream, outcomes, worker protocol, commands, contracts or any saved format; no new preference field and no new stored key (local, session or IndexedDB). Deterministic replay is untouched: nothing here issues a match or career command. No new runtime dependency, no network, no new binary asset except the screenshots in `cp12/screens/`.

1. **The title screen is the front door** (CD-046). The route default in `RootApp` is now `#title`. Every explicit route (`#career`, `#exhibition`, `#tournaments`, `#scenarios`, `#rain`, `#roster-career`, `#title`) behaves exactly as before, and any other hash still opens the career screen as it did.
2. **Continue** (CD-046; `apps/web/src/title-continue.ts`, new). The title reads, without writing, what the game already stores: the match worker's active-save pointer and the match save catalogue (`IndexedDbSaveRepository`), and the career's active-save pointers and catalogues (`IndexedDbPersistentWorldRepository`, `IndexedDbSeasonRepository`, in the order the career screen boots them), with each row's existing `updatedAt`. `chooseContinue` (pure, unit tested) picks:
   - the active match if it is unfinished (`#exhibition`, which already restores the active match);
   - the active career (`#career`, which already loads the active career);
   - whichever of the two was saved most recently, when both exist;
   - when no career is active but careers are saved (the player left them with Choose career), "Saved careers", which opens the saved-career list, newest first.
   It is a link, so it navigates exactly as the existing routes do and no handoff value is stored. The button names the save and where it stands ("Continue match · Aster Harbour v Copper Vale · In progress: ready for the next ball"; "Continue career · Aster Harbour 2027 · Season 1 · 0/56 fixtures · Mon 1 March 2027"). When it shows, Quick match takes the secondary style so there is one primary action. Storage that is blocked or fails gives no Continue rather than an error. The repositories are created once per page, so returning to the title does not open more database connections.
3. **Settings** (CD-046). A Settings link sits beside the Sound switch, outside the "Game modes" navigation (which keeps its five modes). It opens `#settings`, which the career screen handles: with an active career it opens that career's Settings screen (file actions included); with none it shows the same settings grid on its own page, under the shared masthead with a back link to the title (`14-settings-no-career_after`). The grid is the career's existing one, factored into one constant in `CareerApp.tsx`, so both write the same values already kept in this browser. The page says plainly which settings apply where (career text scale and density are separate from the match's own).
4. **Heading order and focus on first launch.** The sound question moved from a bar above the hero into the hero, after the wordmark and tagline and before the actions, on a solid backing so it reads over the ground art. The `h1` now comes first (measured: `h1 Lord Cricket XXVI`, then `h2 Play with sound?`). It is still wholly in view on first launch (bottom 412 px of 768 at 1366x768; 464 px of 844 at 390x844). Answering it moves focus to the first action (Continue when shown, otherwise Quick match).
5. **Custom match copy** (CD-047). With no computer side: "Pick the format, the ground and both XIs. A custom match starts with you deciding for both teams. Once it starts, Tactical captain in Match settings hands either side to the computer captain. To play the computer straight away, use Quick match on the title screen." When a side was handed to the computer earlier in the session, the copy names it and says the computer keeps it if that side plays. The behaviour itself is unchanged.
6. **The coach points at the control** (CD-052). Each coach tip now names the control that answers it (`coach-tips.ts`, a new optional `control`); the coach adds "Your move: Call heads or Call tails, in the Next decision panel just below" with a down arrow, a small notch on its lower edge points at the decision tray, and the tray carries a gold outline while it is the player's decision. When the computer captain holds the decision, the coach says so instead and the outline is off. Nothing animates.
7. **Title screen link inside the career.** "Title screen" joins the "Away from the club" row, before Choose career.
8. `docs/HOW_TO_PLAY.md` describes Continue, Settings, the plain address and the current career navigation rows.

## Evidence

Captured with `scripts/cp12-capture.mjs` (new) at 1366x768 and 390x844, Chromium, reduced motion requested, from a build of `main` at `f05ecf5` ("before") and of this branch ("after"). Files are in [`cp12/screens/`](cp12/screens/) as `<name>_before_<size>.webp` and `<name>_after_<size>.webp`; measurements in [`cp12/cp12-metrics.json`](cp12/cp12-metrics.json). Captures 10 to 14 exist only "after": `main` has no Continue or Settings, so those steps are recorded there as not captured.

| Defect | Captures |
| --- | --- |
| CD-046 front door | `01-bare-address` (before: Start a Career; after: the title screen) |
| CD-046 Continue | `09-title-returning-career`, `10-continue-career`, `11-title-returning-match`, `12-continue-match` |
| CD-046 Settings | `13-settings-with-career`, `14-settings-no-career`; the link in `03-title-after-sound` |
| Heading order, CD-028 follow-up | `02-title-first-launch` |
| CD-047 | `04-exhibition-setup` |
| CD-052 | `05-guided-toss`, `06-guided-first-ball` |
| Title link in the career | `08-career-home` |
| Unchanged first career | `07-career-club-selection` |

Measured by the capture script:

- Bare address: before, hash empty and `h1` "Start a Career"; after, `h1` "Lord Cricket XXVI".
- Title headings on first launch: before `h2 Play with sound?`, `h1 Lord Cricket XXVI`; after `h1 Lord Cricket XXVI`, `h2 Play with sound?`.
- Sound question box: before top 18, bottom 78 px (1366x768) and bottom 149 px (390x844); after top 331, bottom 412 px and top 333, bottom 464 px. In view in both.
- Focus after answering by keyboard: before `body`; after the Quick match button.
- Keyboard order on the title (Tab from the top, first launch, after): Turn sound on, Keep sound off, Quick match, Guided first match, the five mode cards, Settings, Sound. With a career saved (and the question answered), Continue is the first stop.
- Continue: with a career just started, "Continue career, Aster Harbour 2027, Season 1 · 0/56 fixtures · Mon 1 March 2027", landing on `#career` with the career navigation; after one more ball in the guided match, "Continue match, Aster Harbour v Copper Vale, In progress: ready for the next ball", landing on `#exhibition` at phase READY.
- Horizontal overflow 0 px in every capture, before and after. No page or console errors. No running animations on any captured screen with reduced motion requested.

## Accessibility

- The title has one `h1`, now first; the sound question's `h2` follows it, so heading navigation meets the wordmark first.
- Continue and Settings are links (they navigate); Quick match, Guided first match and Sound stay buttons. Keyboard order follows the visual order: the question, Continue, the two match buttons, the modes, Settings, Sound.
- Focus is placed on the first action after the sound question is answered, instead of being lost.
- The coach's arrow is `aria-hidden`; its words carry the instruction ("Your move: Next delivery, in the Next decision panel just below"). The tray outline is a static outline, not colour alone: the words name the control.
- The Settings page uses the shared masthead (back control, eyebrow, one `h1`) and the career's existing labelled controls.
- Nothing new animates, so reduced motion needs no new rule; Continue's hover and focus are colour and outline only.

## Checks

Linux container, Node 22, Chromium and Firefox from `/opt/pw-browsers`. Browser runs used untracked copies of `playwright.ui.config.ts`, `playwright.m4.config.ts` and `playwright.m6g.config.ts` on ports 4222 to 4224 with `--trace off`; captures used a preview server on port 4221.

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build of compiled packages | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `3d2a20c` | PASS (exit 0) |
| Typecheck | `npm run typecheck` | `3d2a20c` | PASS (exit 0) |
| Lint and package boundaries | `npm run lint` | `3d2a20c` | PASS (exit 0) |
| Build | `npm run build` | `3d2a20c` | PASS (exit 0) |
| Unit suite | `npx vitest run --maxWorkers=2` | `3d2a20c` | PASS: 149 files, 1,288 tests |
| Chromium, full `tests/ui` | `npx playwright test --config <local ui copy> --project chromium --trace off` | `3d2a20c` | PASS: 139 passed (43.9 min) |
| Chromium, full `tests/m4` | `npx playwright test --config <local m4 copy> --trace off` | `3d2a20c` | PASS: 17 passed |
| Chromium, full `tests/m6g` | `npx playwright test --config <local m6g copy> --trace off` | `3d2a20c` | PASS: 12 passed |
| Firefox, 19 specs on changed screens | `npx playwright test --config <local ui copy> --project firefox --trace off <specs>` | `3d2a20c` | PASS: 47 passed |
| Firefox, full `tests/m6g` | `npx playwright test --config <local m6g copy, Firefox project> --trace off` | `3d2a20c` | PASS: 12 passed |
| Firefox, full `tests/ui` and `tests/m4` | | | NOT RUN |
| Hosted CI (Linux, Windows core, Chromium, Firefox) | | | NOT RUN locally; see the pull request |

`3d2a20c` is the code commit; the commit after it adds only this record and the register and ledger rows. The 19 Firefox specs: `title-front-door-cp12`, `title-guided`, `e5-recommended-plain-language`, `clubhouse-navigation`, `season-objective`, `season-finale`, `fixture-preview`, `match-report`, `player-identity`, `training-presets`, `match`, `settings-scale`, `pavilion-result-settings`, `accessibility-release-audit`, `career-copy`, `audio-cp09`, `own-side-controls`, `tournament-opponent-lock`, `match-navigation`.

Specs changed, and why each still tests the same behaviour:

- `tests/ui/clubhouse-navigation.spec.ts`, `season-objective.spec.ts`, `season-finale.spec.ts`, `fixture-preview.spec.ts`, `match-report.spec.ts`, `player-identity.spec.ts`, `training-presets.spec.ts`, `e5-recommended-plain-language.spec.ts` (the career dates test), `tests/m6g/new-game-editing.spec.ts` (three tests), `tests/m6g/player-page.spec.ts` and `tests/m6g/management.spec.ts` (two tests): each opened `/` to reach the career start screen, which the bare address no longer shows. Each now opens `/#career`, the same screen by its explicit route; every assertion after it is unchanged, including the management spec's check that the start screen is headed "Start a Career" and its keyboard order check.
- `tests/ui/clubhouse-navigation.spec.ts`: the exact list of links in "Away from the club" now includes "title screen" before "choose career"; it is still an exact `toEqual` of the whole row, so it is as strict as before.
- `tests/unit/guided-coach.test.ts`: one test added (each decision names its control; none after the match). Existing assertions unchanged.
- New: `tests/ui/title-front-door-cp12.spec.ts` (bare address, heading order, sound question in view, focus after answering, no Continue on a first launch, Continue to the career then to the match, Settings with and without a career, custom match copy, coach pointer) and `tests/unit/title-continue.test.ts` (`chooseContinue`).

## Self-critique (as an independent creative director)

- Continue picks one thing. A player with both a match and a career in progress sees only the newer; the other is one click away (Career, or Custom match), but the title does not say it is there.
- Continue appears after an asynchronous read, so on a returning visit the match buttons move down once it arrives [Inference: not measured; the read is local and was not visibly slow in the captures].
- The Settings page without a career is honest about the split, but the split itself is a design debt: the career and the match keep separate text scale and layout values, so "Settings" is still two places for display. Unifying them would need a preference change, which this pass may not make.
- Quick match and Custom match open the active match when one is unfinished, instead of starting a new one (seen while capturing: Quick match after an unfinished guided match resumed the guided match). That is existing behaviour of the match screen, now at least signposted by Continue; the quick match button still promises "one click".
- The coach's notch assumes the decision tray is directly below the coach. It is in every captured layout and in the code order, but it is a visual convention, not a programmatic link.
- The bare address change means a bookmark of `/` made for the career now lands on the title; Continue (or Career) is then one more click.

## Limitations and remaining work

- Quick match or Custom match with an unfinished match: decide whether they should offer "start a new match" (needs the existing new-exhibition flow from the title, a navigation and behaviour question for the owner).
- Continue reads the career catalogues with the same full-row reads the career screen uses at boot; with many long careers the title pays that cost on each visit [Inference: not measured].
- The imported roster career (`#roster-career`) is not considered by Continue.
- `docs/HOW_TO_PLAY.md`'s "You want to" table still names some older career tabs (Home, Contracts); only the paragraph above it was updated.
- Not run: hosted Windows CI, a human playtest and a screen-reader walkthrough.
