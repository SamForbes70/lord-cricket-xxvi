# CP12B Quick match and Custom match start a new match

A follow-up to [CP12_ONBOARDING.md](CP12_ONBOARDING.md), carrying out a recommendation the owner approved. Branch `pavilion/quick-match-new`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a playtest**.

Baseline: `main` at `183ce1e` (CP12 merged).

## Problem

On `main` at `183ce1e`, Quick match, Guided first match and Custom match on the title screen opened `#exhibition`, and the match screen's boot always restores the active match (the worker's `initialise` reads the active-save pointer and calls `restoreSave`). With an unfinished match active:

- **Quick match and Guided first match** resumed the unfinished match. The auto-start lives in the setup form (`Setup` in `apps/web/src/main.tsx`), which is only shown when no match is open, so the one-click start never ran, and its session flag (`lcxxvi-quick-match`) lingered for up to a minute.
- **Custom match** also resumed the unfinished match instead of showing the setup.
- The same happened with a finished match still active: the old result was shown and no new match started.

CP12 recorded this under self-critique and remaining work: the Quick match button promised "one click" but resumed the earlier match.

## What changed

Navigation only. No change to the engines, simulation, random stream, outcomes, worker protocol, commands, contracts or any saved format; no new preference field and no new stored key (local, session or IndexedDB). No new dependency and no network.

1. **A request held in page memory** (`apps/web/src/new-match-request.ts`, new). Quick match, Guided first match and the Custom match card call `requestNewMatch()` as they navigate; nothing is written to storage. The request lapses after a minute, the same window the quick match flag already has, and is taken once.
2. **The match screen takes the request at boot** (`MatchApp` in `main.tsx`). If the boot restored an open exhibition (unfinished or finished), the page sends `BOOT` with `fresh: true`, which is the path the existing New exhibition and New match buttons already use: the worker releases the lease, clears the active-save pointer and starts with no match. The restored save is not deleted or changed, and nothing is sent to it first (the request is sent before any routine pick or computer step). The setup then shows, and for Quick match its existing auto-start begins a new T20 at the toss.
3. **Where the earlier match went.** When the set-aside match was unfinished, a status note on the match screen names it: "Your unfinished match, Aster Harbour v Copper Vale, is kept in Saved games below. Load it there to carry on." The note clears on the next new match, load, import, delete or scenario start. On the title, when Continue is offering an unfinished match, a line under the match buttons says: "Quick match and Custom match start a new match. Your unfinished match stays in Saved games."
4. **What still resumes.** Continue, the career's Exhibition link, a typed or bookmarked `#exhibition`, a reload, and a new tab all resume the active match exactly as before, because none of them makes the request.
5. **Not set aside.** A career match (bound to a career fixture) is left open, because the worker refuses a fresh boot over it; the note says "Your career match is still in progress, so a new match cannot start yet. Finish it, or abandon it below." A tournament or scenario launch waiting in the same boot keeps its own existing handling.
6. `docs/HOW_TO_PLAY.md` says that the three title actions always start a new match and where the unfinished one is kept.

### Is the unfinished match lost?

No. It stays in the match save catalogue and appears under Saved games on the match screen, with Load (tested: it loads at the same revision and phase). What changes is that it is no longer the active match, so Continue on the title, which only offers the active match, resumes the new match instead. The player is told this before (the title note, shown whenever Continue offers an unfinished match) and after (the note on the match screen). Loading the earlier match from Saved games makes it active again, and Continue then offers it.

## Evidence

`tests/ui/title-new-match-cp12b.spec.ts` (new), Chromium:

- An unfinished quick match past the toss exists; the title shows Continue (`data-kind` MATCH) and the note.
- Quick match then opens a match at the toss with a lower revision than the earlier match (a new match), the match-screen note, and "Saved games (2)" with one Current and one Load.
- Continue then resumes the new match ("In progress: at the toss").
- Load in Saved games returns the earlier match at its recorded revision and phase; Continue then resumes that match.
- Custom match opens the setup (Confirm XIs and start, no decision tray), the note, and Saved games open with the earlier match, which loads at its recorded revision and phase.
- A plain visit to `#exhibition` still resumes the active match, with no note.

The spec was also run against a build with the two source changes reverted (`TitleScreen.tsx` and `main.tsx` at `183ce1e`, the new module present but unused): both tests failed, as expected.

`tests/unit/new-match-request.test.ts` (new): the request is absent until asked for, taken once, lapses after a minute and ignores a future stamp.

## Checks

Linux container, Node 22, Chromium and Firefox from `/opt/pw-browsers`. Browser runs used untracked copies of `playwright.ui.config.ts`, `playwright.m4.config.ts` and `playwright.m6g.config.ts` on ports 4231 to 4234 with `--trace off`.

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build of compiled packages | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `ff33cdd` | PASS (exit 0) |
| Typecheck | `npm run typecheck` | `ff33cdd` | PASS (exit 0) |
| Lint and package boundaries | `npm run lint` | `ff33cdd` | PASS (exit 0) |
| Build | `npm run build` | `ff33cdd` | PASS (exit 0) |
| Unit suite | `npx vitest run --maxWorkers=2` | `ff33cdd` | PASS (exit 0): 150 files, 1,292 tests |
| Chromium, full `tests/ui` | `npx playwright test --config <local ui copy> --project chromium --trace off` | `ff33cdd` | PASS (exit 0): 141 passed (48.4 min) |
| Chromium, full `tests/m4` | `npx playwright test --config <local m4 copy> --trace off` | `ff33cdd` | PASS (exit 0): 17 passed |
| Chromium, full `tests/m6g` | `npx playwright test --config <local m6g copy> --trace off` | `ff33cdd` | PASS (exit 0): 12 passed |
| Firefox, full `tests/m6g` | `npx playwright test --config <local m6g copy, Firefox project> --trace off` | `ff33cdd` | PASS (exit 0): 12 passed |
| Firefox, 12 specs on the changed screens | `npx playwright test --config <local ui copy> --project firefox --trace off <specs>` | `ff33cdd` | PASS (exit 0): 34 passed |
| Firefox, full `tests/ui` and `tests/m4` | | | NOT RUN |
| Hosted CI (Linux, Windows core, Chromium, Firefox) | | | NOT RUN locally; see the pull request |

`ff33cdd` is the code commit; the commit after it adds only this record, the CP12 note, the ledger row and the `HOW_TO_PLAY.md` line. The 12 Firefox specs: `title-new-match-cp12b`, `title-front-door-cp12`, `title-guided`, `e5-recommended-plain-language`, `pavilion-result-settings`, `match`, `match-navigation`, `accessibility-release-audit`, `own-side-controls`, `audio-cp09`, `tournament-opponent-lock`, `pavilion-routine-picks`.

Specs changed: none. No existing browser test depended on Quick match or Custom match resuming an unfinished match: every spec that clicks Quick match starts from a fresh browser context with no saved match, and the specs that reopen a match after a quick match do so through `#exhibition` or Continue, which still resume.

## Remaining work

- Custom match moves the active-save pointer as soon as it opens the setup (the existing New exhibition behaviour), so a player who opens it and goes back without starting has no Continue for the earlier match until they load it from Saved games. Deferring the switch until Start would need the setup to show while a match is open: a larger change.
- The title note appears only when Continue is offering the match. When a career is newer than an unfinished match, Continue offers the career and the title does not mention the match; the match-screen note still names it after a new match starts.
- During the fresh boot the restored match is drawn for a moment before the setup or new match replaces it [Inference: not measured; it was not visible in the test runs].
- Not run: hosted CI (see the pull request), a human playtest and a screen-reader walkthrough.
