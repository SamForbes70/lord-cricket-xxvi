# CP09 audio

Studio Production Directive 05, pass CP09 (audio), first slice. Branch `pavilion/cp09-audio`, draft pull request. This is a **self-assessment by the agent that built it: not acceptance, not a listening test**. The container has no audio output, so no sound in this pass has been heard by anyone: every statement about how it sounds is [Inference] from the synthesis parameters. Anything not measured directly is labelled [Inference].

Baseline: `main` at `bfe629b` (CP10 merged). Defects addressed: the cue classification fault recorded by CP10 ([CP10_COMMENTARY.md](CP10_COMMENTARY.md), "Audio cue classification"), CP04's note that moments have no sound of their own ([CP04_MATCH_MOMENTS.md](CP04_MATCH_MOMENTS.md), remaining work item 3), and the two sound rows of [CREATIVE_DEFECT_REGISTER.md](CREATIVE_DEFECT_REGISTER.md): CD-028 (P2, the first-run "Play with sound?" question cut off below the fold) and CD-043 (P2, no music; cues only; not listened to), the second only in part.

## Problem

On `main` at `bfe629b`:

- **Fours, sixes and runs made no sound of their own.** `projectMatchAudioCues` read a delivery's boundary and runs from commentary fact slots named `boundary` and `runs`, which the commentary has never written. Every ball that was not a wicket or a milestone was classified as a dot: a four sounded like a defensive block, and its caption read "0.3 · 4" instead of "FOUR!". The four and six crowd swells and the bat knock for runs were unreachable in play.
- **Some balls made no sound at all.** A delivery that carries only a maiden, all-out or winning-runs tag is filed by the commentary under the MILESTONE category; the cue projection returned nothing for it, so the winning hit was silent until the result cue.
- **Moments were silent.** CP04's broadcast moments (four, six, wicket, fifty, hundred, maiden, five wickets, hat-trick, result) had no sound, so Full and Brief moments sounded the same, and the moment that sums up a batched advance had nothing to mark it.
- **The sound question was below the fold** on first launch at 1366x768 (CD-028, `cp01/screens/01-title-first-launch_1366x768.webp`).

## What changed

Presentation only. No change to the engines, outcomes, random stream, commands, worker protocol, contracts, schemas or saved formats; no new runtime dependency, no recorded, downloaded or purchased audio, no network use. The audio preferences are the existing `LC_AUDIO_PRESENTATION_V1` object in browser storage, unchanged: no field was added.

1. **Cues from the delivery record** (`packages/projections/src/audio-cues.ts`). `projectMatchAudioCues` takes the committed `events` as well as the commentary. A delivery's sound (dot, bat knock, four, six) is decided by its `DELIVERY_RECORDED` record, matched by sequence: `boundary` FOUR or SIX, else `batRuns` above 0 for the bat knock (byes, leg byes, wides and no-ball penalties make no bat-on-ball knock), else the dot tap. Wickets, milestones, overs, innings and the result keep their existing rules and priorities. Captions and narration still use the commentary's text; only the choice of sound moved. The three match controllers (T20, one-day, red-ball) pass `s.events`. The projection is pure: no clock, no `Math.random`, the same inputs give the same cues with the same identifiers.
2. **Event-field slots for readers of the feed alone** (`packages/projections/src/commentary.ts`). Each delivery entry now carries a `runs` slot (the bat runs) and, for a boundary, a `boundary` slot ("4" or "6"), both `EVENT_FIELD` copies of the delivery record, so the projection called without events gives the identical answer (a unit test checks the two agree on five corpus matches). The commentary's words are unchanged.
3. **Balls filed under MILESTONE sound as balls**: a maiden, all-out or winning-runs tag no longer silences the ball.
4. **Moment stings** (`apps/web/src/match/moment-sound.ts`, `CricketAudioManager.playMomentSting`). When a moment appears, a short synthesised sting plays 0.16 s after it, so the ball's own cue is heard first. Rising figures for runs and milestones, falling for wickets; quieter than the ball cues. Full moments get the figure; Brief moments get one soft note; Off gets nothing. Under reduced motion (the system setting or the match's "Highlight motion: Reduced motion") a Full moment gets the Brief note. A batched advance shows one moment at its end, so it plays one sting. The sting follows the same rules as the cues: silent while muted or at zero effects volume, never before the player's first click or key press (a moment seen before then is not saved up to play later), not in a background tab. It is not a cue: no caption, nothing queued. The audio panel records the last sting's kind, mode and decision in `data-moment-sting` for tests.
5. **Sound question on first launch** (CD-028, `apps/web/src/TitleScreen.tsx`, `apps/web/src/floodlit.css`). The question is a compact bar at the top of the title screen, above the hero and the modes, with the same heading, words and buttons.

## Cue table

Every sound in the game. Durations are the synthesis lengths in code. **Loudness** is the nominal peak of the loudest tone at the default volumes (effects 75, crowd 55, interface 50), from the gain values in code: channel volume x 0.4 (capped at 0.65) x tone level, in dB below full scale [Inference: computed, not measured with a meter; noise swells add to the tones]. All of it is off until the player turns sound on (muted by default, owner decision of 16 November 2026), and none of it plays before a click or key press. "Sound: on/off" on the title screen and the match's "Sound" button and "Mute all audio" box switch all of it.

| Event | Sound | Duration | Loudness at defaults | Setting that controls it |
| --- | --- | --- | --- | --- |
| Dot ball, or runs with none off the bat (byes, leg byes, wides) | `BAT_BALL_DOT`: triangle tap 210 to 120 Hz | 65 ms | about -16 dBFS | Effects volume |
| Runs off the bat, not a boundary | `BAT_BALL_SINGLE`: triangle knock 340 to 165 Hz | 95 ms | about -14 dBFS | Effects volume |
| Four | `BOUNDARY_FOUR`: knock 440 to 190 Hz, then a band-passed crowd swell | 110 ms knock, 650 ms swell (about 700 ms) | about -15 dBFS | Crowd volume |
| Six | `BOUNDARY_SIX`: sawtooth strike 520 to 210 Hz, then a larger crowd swell | 140 ms strike, 900 ms swell (about 940 ms) | about -15 dBFS | Crowd volume |
| Wicket (any dismissal, including a hat-trick or five-for ball) | `WICKET_FALL`: two stump tones and a crowd hush | about 780 ms | about -13 dBFS | Effects volume |
| Batter fifty, hundred, 150, 200; stand of 50, 100, 150; bowler three-for or five-for (not on a wicket ball) | `MILESTONE_CHIME`: C, E, G sine triad and soft applause | about 610 ms | about -18 dBFS | Crowd volume |
| End of an over (including a maiden) | `OVER_BELL`: 660 and 880 Hz bell | 240 ms | about -17 dBFS | Effects volume |
| Innings change | `INNINGS_CHANGE`: G, B, D chord | 520 ms | about -18 dBFS | Crowd volume |
| Result | `MATCH_COMPLETE`: C, E, G, C fanfare and ovation | about 1,050 ms | about -17 dBFS | Crowd volume |
| Match audio panel control changed | `UI_CLICK`: sine tick 740 to 420 Hz | 35 ms | about -23 dBFS | Interface volume |
| Menu button (title screen) | sine click 880 to 520 Hz (`ui-sound.ts`) | 60 ms | about -24 dBFS | Interface volume |
| Live match in play | crowd murmur, a two-second deterministic loop (`ui-sound.ts`), fades in and out | continuous while the match is live | about -28 dBFS | Crowd volume |
| Commentary narration | browser speech reads the cue's line | the line's length | the browser's speech volume x commentary volume | "Speech narration" (off by default) and Commentary narration volume |
| Moment: Four | sting D, G rising | full 220 ms; brief 140 ms (G) | full about -21 dBFS; brief about -25 dBFS | Effects volume; Match moments (Full, Brief, Off); reduced motion gives the brief note |
| Moment: Six | sting C, E, high C | full 340 ms; brief 160 ms | full about -21; brief about -25 | as above |
| Moment: Wicket | sting A, F falling (triangle) | full 310 ms; brief 160 ms | full about -21; brief about -25 | as above |
| Moment: Hat-trick | sting C, A, F falling (triangle) | full 460 ms; brief 160 ms | full about -20; brief about -25 | as above |
| Moment: Fifty | sting C, G | full 330 ms; brief 160 ms | full about -21; brief about -25 | as above |
| Moment: Hundred | sting C, E, G, high C | full 570 ms; brief 160 ms | full about -20; brief about -25 | as above |
| Moment: Five wickets | sting G, B, D, high G | full 550 ms; brief 160 ms | full about -20; brief about -25 | as above |
| Moment: Maiden over | sting 660, 990 Hz, softer | full 280 ms; brief 160 ms | full about -24; brief about -25 | as above |
| Moment: Result | sting G, C, E, G | full 790 ms; brief 160 ms | full about -20; brief about -25 | as above |

Which cue plays when several happen at once is unchanged: a single ball plays its newest cue; a Finish over or longer advance plays the highest-priority cue of the batch (wicket 92, milestone 82 or 88, six 86, four 80, innings 75, over 55, runs 35, dot 20; the result 95). Moment stings are separate and at most one per drawn view.

## Evidence

### Cue derivation

- **Unit** (`tests/unit/audio-cp09.test.ts`): on five matches of the fixed 100-match T20 corpus (`tests/fixtures/t20/seed_corpus.json`, cases 0, 7, 23, 41 and 77, fixture autopilot), every delivery gets the cue its record calls for: every wicket ball `WICKET_FALL`, every chime-milestone ball `MILESTONE_CHIME`, and every other ball `BOUNDARY_SIX`, `BOUNDARY_FOUR`, `BAT_BALL_SINGLE` or `BAT_BALL_DOT` from its `boundary` and `batRuns`; the cues from events and from the commentary alone are identical; two projections are identical; `Math.random` is never called. A whole T20 played twice through the real controller with one seed gives identical `audioCues`, and they include boundary or bat-knock cues.
- **Browser** (`tests/ui/audio-cp09.spec.ts`): an exhibition T20 played over by over shows an audio caption "FOUR!" or "SIX!" (impossible on `main`, where every such ball was captioned as a dot), and with sound on the moment that appears records `full:PLAYED` (or `UNAVAILABLE` on a machine with no audio device); muted, the caption still shows and the sting records `MUTED_OR_ZERO_VOLUME`.
- The existing Stage 8 tests pass unchanged, including the one that compares the controller's cues with a projection from the commentary alone (it now agrees because of the event-field slots).

### Captures

[`cp09/screens/`](cp09/screens/), WebP, by `scripts/cp09-capture.mjs` against a served build of this branch, Chromium; figures in [`cp09/cp09-metrics.json`](cp09/cp09-metrics.json).

- `01-title-first-launch_1366x768` and `_390x844`: the sound question as a bar at the top, wholly in view (top 18 px, bottom 78 px of 768 at 1366x768; bottom 149 px of 844 at 390x844); no sideways scroll. Before: `cp01/screens/01-title-first-launch_1366x768.webp`, the question below the fold.
- `10-boundary-moment-sound-on_1366x768` and `11-crop-audio-panel_1366x768`: one Finish over with sound on; caption "FOUR! 0.3 · 4", the Four moment on screen, panel record `FOUR:full:PLAYED`, status "Audio active".

## Accessibility and comfort

- **Off by default, gesture first.** Unchanged default (muted). The match audio manager creates its audio context only after a click or key press, and a sting asked for before then is dropped, not saved. The menu click and crowd murmur (`ui-sound.ts`, unchanged) can create a context earlier when sound was left on, which Chromium and Firefox hold suspended until the first gesture [Inference: browser autoplay policy, not measured here].
- **Captions.** Boundary balls now caption as "FOUR! ..." and "SIX! ...", so a player with sound off or captions on learns what happened from the caption, as the cue table intended. Stings add no caption: the moment itself is on screen and is not a live region (CP04).
- **Reduced motion.** Reduced motion is about motion, but a Full moment under reduced motion is a static caption (CP04), so its sting is reduced to the single soft note to match [Inference: a judgement, not a stated requirement].
- **Loudness.** Stings sit about 3 to 8 dB under the ball cues at the default volumes [Inference: computed]. No sound is long or repeating except the crowd murmur, which is low and follows the crowd volume.
- **Title screen.** The question now comes before the wordmark in reading order, so a screen reader meets it first; its heading stays an `h2` (the wordmark is the `h1`), which puts a level-2 heading before the level-1 heading on first launch only [Inference: not checked with a screen reader; NOT RUN].
- No en or em dashes in any new UI string or this record. The existing provenance titles and the caption banner's "Ready" line keep their old wording, which tests match.

## Checks

Local, Linux container, Node 22, 28 November 2026, in a worktree of `main` at `bfe629b` with `node_modules` linked from the main checkout. Browser suites ran on untracked local copies of the configs on ports 4201 to 4203, results written outside the repository; Chromium from `/opt/pw-browsers/chromium`, Firefox 1495 from `/opt/pw-browsers`. Code revision `c279c89` (the browser runs used a build of the same tree before it was committed); the commit after it adds only this record, the captures, the ledger row and the register notes.

| Check | Command | Revision | Result |
| --- | --- | --- | --- |
| Build graph | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc -b` | `c279c89` | PASS (exit 0) |
| Typecheck incl. tests | `npm run typecheck` | `c279c89` | PASS (exit 0) |
| Lint and boundaries | `npm run lint` | `c279c89` | PASS (exit 0) |
| Build | `npm run build` | `c279c89` | PASS (exit 0) |
| Unit, CP09 (cue derivation on five corpus matches, events and slots agree, determinism, no `Math.random`, stings, gating) and Stage 8 | `npx vitest run tests/unit/audio-cp09.test.ts tests/unit/audio-stage8.test.ts` | `c279c89` | PASS, 13 of 13 |
| Unit, full suite | `npx vitest run --maxWorkers=2` | `c279c89` | PASS, 1278 of 1278 (147 files) |
| Browser, Chromium, all of `tests/ui` | `LCXXVI_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.cp09-ui.config.ts --project chromium --trace off --reporter=line` (copy of `playwright.ui.config.ts` on port 4201) | `c279c89` | PASS, 134 passed (39.5 min) |
| Browser, Firefox, audio and title specs | `npx playwright test --config playwright.cp09-ui.config.ts --project firefox --trace off tests/ui/audio-cp09.spec.ts tests/ui/audio-stage8.spec.ts tests/ui/e5-recommended-plain-language.spec.ts tests/ui/title-guided.spec.ts` | `c279c89` | PASS, 12 passed |
| Browser, Firefox, all of `tests/ui` | | | NOT RUN locally (hosted Windows CI runs it) |
| Browser, m4 persistence, Chromium | `LCXXVI_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --config playwright.cp09-m4.config.ts --project chromium-m4 --reporter=line --trace off` (copy of `playwright.m4.config.ts` on port 4202) | `c279c89` | PASS, 17 passed |
| Browser, m6g, Chromium | `npx playwright test --config playwright.cp09-m6g.config.ts --project chromium --reporter=line --trace off` (copy of `playwright.m6g.config.ts` on port 4203, local Chromium path) | `c279c89` | PASS, 12 passed |
| Browser, m4 and m6g, Firefox | | | NOT RUN locally |
| Captures | `CP09_BASE=http://127.0.0.1:4201 CP09_OUT=... node scripts/cp09-capture.mjs` | `c279c89` | PASS (exit 0), no page or console errors |
| Listening test | | | NOT RUN (no audio output in the container) |
| Screen reader | | | NOT RUN |
| Hosted CI | | | NOT RUN at the time of writing; the pull request records its runs |

No test was changed, skipped or weakened.

## Self-critique (as an independent creative director)

What now works: the match has the sounds it was designed with. A four gets its crowd swell, a six its bigger one, a run its knock, the winning hit its sound, and a moment a short sting that tells Full from Brief. The choice of sound comes from the scorer's record, so it cannot disagree with the scorecard, and it is the same on every replay.

What still falls short, in order:
1. **Nobody has listened to any of it.** The tones were chosen on paper; whether the stings read as broadcast graphics or as phone notifications, and whether they clash with the crowd swells, is for a person to judge.
2. **No music** (CD-043). A title theme and menu music are a composition task and a taste decision; synthesised sine figures are not a substitute. Not attempted.
3. **The sounds are thin.** Single oscillators and filtered noise; a bat on ball and a crowd are suggested rather than heard [Inference].
4. **Finish over and longer advances** still play only one cue for many balls (by design since Stage 8); a per-ball reveal with its own sounds belongs with CD-053.
5. **A sting and a ball cue overlap** on the same ball; the lead of 0.16 s separates their starts but not their tails.

## Limitations and remaining work

- **Human listening test outstanding** (ledger: IMPLEMENTED, human listening test outstanding): every cue and sting, at default and full volumes, on headphones and laptop speakers, in Chromium and Firefox, and the crowd murmur over a whole match.
- **CD-043 music**: original title and menu theme; needs an owner decision on approach (synthesised in code, or an original recording with a recorded licence).
- **Narration** (browser speech) reads the commentary lines unchanged; not listened to: NOT RUN.
- **Super overs, rain-shortened matches and scenarios** use the same controllers and so the same cue rules [Inference: not played through in this pass].
