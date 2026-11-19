# Lord Cricket XXVI

**An evidence-based, deterministic, browser-native statistical cricket management game built as a strict TypeScript monorepo.**

> **Status (19 November 2026, Australia/Brisbane).** Feature-complete for everything the roadmap allows without outside data, plus captain's highlights, rival captains, a match-day selection room and the Pavilion redesign (#90 to #93). Built and merged: V0.1, Stages 2 to 12, Stage 14's rules (super overs, rain-shortened matches and player reviews, exhibitions only) and Stage 15's fictional parts (tournaments, your own competitions, tours, auctions, crests, with your own matches playable). Stage 13 (historical scenarios) is parked and Stage 14's empirical calibration is `BLOCKED_EXTERNAL`: the model stays a fictional synthetic alpha. Stage 16 was passed by the owner's direct instruction with none of its four parts run (no owner-PC measurements, playtest, screen-reader walkthrough or long-career soak). Stage 17: the release record is sealed and the GitHub Release `alpha-2026-11-19` is prepared for the owner to publish. One page with the details: [docs/HANDOVER.md](docs/HANDOVER.md).

---

## Table of Contents

1. [Quick Start, Windows Double-Click & Packaging](#quick-start-windows-double-click--packaging)
2. [What Has Been Built](#what-has-been-built)
3. [Architecture & Engineering Invariants](#architecture--engineering-invariants)
4. [Roadmap Status (Stages 11 to 17 & Research Track)](#roadmap-status-stages-11-to-17--research-track)
5. [Complete Instructions for AIs to Maintain & Build Out the Roadmap](#complete-instructions-for-ais-to-maintain--build-out-the-roadmap)
6. [Verification Gates & Evidence](#verification-gates--evidence)
7. [Maintained Documentation Index](#maintained-documentation-index)

---

## Quick Start, Windows Double-Click & Packaging

### 1. Double-Click Launch on Windows 10/11 (Portable ZIP or Git Checkout)

- **From the Portable Game ZIP (`npm run package:game`) — Zero Prerequisites Required**:
  1. Extract `release-packages/lord-cricket-xxvi-game-<commit>.zip` to a folder on your Windows laptop (extract first; do not run from inside Windows Explorer's unextracted ZIP preview).
  2. Double-click **`Play-Lord-Cricket.bat`** (or `start-game.bat`).
  3. It automatically uses Node.js 18+ if installed, real Python 3 if installed (ignoring the Microsoft Store `WindowsApps` stub), or compiles and launches **`LordCricketXXVI.exe`** using Windows' built-in `.NET Framework 4.x` (`csc.exe`) compiler with **zero external downloads**.
  4. Opens **`http://127.0.0.1:4180/`** in a standalone Microsoft Edge / Google Chrome `--app=` desktop window.
  5. To stop a background server later, double-click **`Stop-Lord-Cricket.bat`** (or right-click the **`Lord Cricket XXVI`** Windows system-tray icon and click **Quit Server**). You can also double-click **`Build-Exe.bat`** to generate `LordCricketXXVI.exe` directly.
- **From a Git Repository Checkout on Windows**:
  - Double-click **`Play-Lord-Cricket.bat`** in the repository root. It verifies Node.js (`>=22.12.0`), runs `npm ci` automatically on first run if `node_modules` is missing, runs `npm run build` automatically whenever `apps/web/dist` is missing or older than source files (`apps/`, `packages/`), starts `start.mjs` on `http://127.0.0.1:4180/`, and opens the standalone `--app=` window.
  - Optional helpers in `tools/windows/`: `Stop-Lord-Cricket.bat` (stops the background server), `Create-Desktop-Shortcut.ps1` (creates a Windows Desktop / Start Menu shortcut), and `npm run package:windows-exe` (`build-exe.ps1`, compiles `LordCricketXXVI.exe` at repo root).

### 2. Developer CLI Quick Start (Windows, Linux, macOS)

Requirements for development & verification: **Node.js `>=22.12.0`**, **npm**, and **Python 3** (for deterministic vector checks and `verify:09:core`).

```sh
npm ci
npm run build
node start.mjs
```

Then open **`http://127.0.0.1:4180/`** (or run `node start.mjs --open`). Because the game uses ES module Web Workers (`apps/web/src/match/match.worker.ts`, `determinism.worker.ts`), serve `apps/web/dist` over HTTP (`127.0.0.1:4180`) rather than opening `index.html` via `file://`. IndexedDB saves are bound to the `http://127.0.0.1:4180` origin.

- **Development server**: `npm run dev`
- **Shareable offline zips**: `npm run package:game` (writes `lord-cricket-xxvi-game-<commit>.zip` and `lord-cricket-xxvi-source-<commit>.zip` to `release-packages/`)
- **Compile standalone Windows `.exe` (on Windows)**: `npm run package:windows-exe`
- **Full core verification**: `npm run verify:09:core`
- **Browser E2E verification**: `npx playwright install chromium firefox && npm run test:ui`

---

## What Has Been Built

**Play the captaincy journey** from **Scenarios → Death-overs chase** or **Nineteen to defend**. In career, take a selection decision from Home into the next fixture and bring its scorecard back to the club. [Controls, screenshots and playtest routes](docs/verification-captains-pavilion/PLAY.md)

### Core Simulation & Match Formats (Stage 1 / V0.1, `accepted`)

- **Single Authoritative Cricket Truth**: Pure deterministic TypeScript engines (`@lcxxvi/domain`, `@lcxxvi/simulation`) running inside a dedicated Web Worker, while React (`apps/web`) acts strictly as a projection and command layer.
- **Three Playable Formats**:
  - **T20 (`LC_T20_MATCH_V1`)**: Authoritative 20-over matches (including career fixtures and interactive mode).
  - **ODI**: 50-over limited-overs exhibitions with fielding circle/powerplay rules.
  - **Five-Day Red Ball**: Multi-day test-style exhibitions featuring declarations, follow-ons, new-ball rules, workload tracking, and deterministic 30-minute weather segments with uncertain forecasts.
- **Deterministic Randomness & Hashing**: Seeded splitmix/FNV/SHA-256 hash-chained delivery event logs (`LC_T20_MATCH_V1`), integer-mass probability tables, cross-checked against independent Python verification vectors (`scripts/check-determinism-vectors.py`, `scripts/reference_probability.py`, `scripts/check-generator-vectors.py`).
- **Tactical Captain AI & Granular Delegation**: Optional public-information-only deterministic tactical captains for all three formats plus 6-category granular T20 delegation (`DELEGATION_JOURNAL`), clearly separated from the baseline off-screen fixture autopilot.
- **Durable Saves, Crash Recovery & Portable Archives**:
  - IndexedDB storage (`@lcxxvi/persistence`) with writer leases, checkpoints (`3` generations inspectable/recoverable), durable managed-match bindings (`managed-binding:<matchGameId>`) surviving closed tabs, and `.lcxxvi` portable archive export/import.
  - Completed career fixtures seal ball-by-ball event logs (`CAREER_MATCH_EVENTS_V1`) for exact deterministic replay without recomputing outcomes.
- **World Editing, Imported Rosters, Offline PWA & Accessibility**:
  - Validated immutable presentation copies for team/player names and colours, `8 MiB` imported roster packs, precached offline shell with safe mid-match update deferral, `/engineering.html` recovery surface, and automated keyboard/contrast/`150%` zoom audits.

### Stage 2: Persistent Multi-Season World (`S02-01`, `accepted`)

- **Consecutive Seasons (`LC_PERSISTENT_WORLD_V1`)**: Transitions smoothly beyond Season 1 across 14-round, 56-fixture T20 seasons with stable `worldId`, `teamId`, `playerId`, and `groundId` identities, rotated home/away parity, and derived per-season seeds.
- **Immutable Roll of Honour & Cross-Season Replay**: Seals completed seasons into `LC_COMPLETED_SEASON_RECORD_V1`, stores cross-season replay archives keyed by `${seasonNumber}:${fixtureId}`, and exposes `LC_PERSISTENT_WORLD_PORTABLE_V1` `.lcxxvi` archives (`160 MiB` bound).
- **Crash-Safe Atomic Rollover**: Single-transaction IndexedDB rollover with idempotent receipts (`PERSISTENT_WORLD_ROLLOVER_RECEIPTS_V1`), checkpoint fallback recovery, and explicit non-destructive `Begin Season 2 in a new persistent save` upgrade for legacy V0.1 saves.

### Stage 3: Player Lifecycle & Youth Pathway (`S03-01`, `accepted`)

- **Exploit-Proof Off-Season Progression (`LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1`)**: Separates temporary daily readiness edits from permanent off-season skill growth driven strictly by elapsed calendar days and match appearances (`parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"`).
- **Ageing, Retirements & Club Role Floors**: Players age `+1` each season and retire deterministically while enforcing club viability invariants (`18..22` squad size, `>= 1` wicketkeeper, `>= 5` bowling-capable players), keeping retired players inspectable in **Retired Alumni** and **PlayerPage**.
- **Youth Academy & 20-Season Diagnostics**: Generates `17..20`-year-old academy prospects for pre-Round-1 promotion or queued off-season graduation; verified across a 20-season diagnostic horizon with `0` role shortages.
- **Per-Season Roster Snapshots (`LC_PERSISTENT_WORLD_V2_LIFECYCLE`)**: Archives preserve exact historical rosters (`LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE`) so replays remain exact even after transfers or retirements.

### Stage 4: Contracts, Budgets & Recruitment (`S04-01`, `accepted`)

- **Symmetrical Club Wage Caps & Contracts (`LC_PERSISTENT_WORLD_V3_ECONOMY`)**: `$2,500k` annual domestic wage cap across all 8 clubs, 1 to 3 season contracts, renewal negotiations, and contract buyouts (`50%` annual wage cap charge preventing release-and-sign cap circumvention).
- **3-Round Pre-Season Negotiation Window & Free-Agent Market**: Persistent multi-round bidding with cap reservations, counter-offers, `commandId` idempotency, and symmetrical AI club recruitment reading strictly public stats and squad role needs (`0` hidden future-ability reads).
- **SHA-256 Hash-Chained Financial Ledger & 12-Season Diagnostics**: Auditable contract ledger (`verifyEconomyLedgerChain`), cross-season club-transfer career projection tracking, non-destructive V2 -> V3 slot upgrade, and a 12-season economy diagnostic verified with `0` overspent clubs and `0` role shortages.

### Stage 5: Tactical Briefings & Feedback (`S05-01`, `accepted`)

- **Optional Pre-Match Briefings (`LC_TACTICAL_BRIEFING_V1`)**: Pitch seam/spin priors, pitch classification, format rules, explicit `SYNTHETIC_ALPHA` model-limit disclosure, XI role balance, squad fatigue/readiness, and public opponent scouting observations with zero hidden rating/ceiling/seed reads.
- **In-Match Tactical Assistant & Contextual Presets**: Plain-language upside and risk trade-offs for all 7 tactical controls plus one-click legal presets across `T20`, `ODI`, and `RED_BALL`.
- **Factual Post-Spell & Batting-Stint Reviews**: Incremental and rebuildable spell/stint outcome summaries paired beside the accepted plan without invented causal claims, plus a persistent `Tactical briefings` toggle (`Shown`/`Hidden`) that never alters worker `revision` or RNG draws.

### Stage 6: Live Field & Highlight Pacing (`S06-01`, `accepted`)

- **2D SVG Live Cricket Field (`LC_FIELD_PRESENTATION_V1`)**: Responsive named-position field across `T20`, `ODI`, and `RED_BALL` with dynamic `RHB`/`LHB` off/leg mirroring, live powerplay infield/outfield legality diagnostics, and keyboard-accessible field preset controls.
- **Illustrative Highlights & Pacing Modes**: `Every ball`, `Key moments`, and `Fast / skip` modes plus `Reduced motion` (`FULL`/`REDUCED`) driven by an isolated FNV-1a presentation seed (`ILLUSTRATIVE_SECTOR_AND_LENGTH`), clean fallback when sector telemetry is absent, and verified byte-identical final state and event hashes across all pacing modes.

### Stage 7: Contextual Text Commentary (`S07-01`, `accepted`)

- **Shared Fact-Checked Commentary Adapter (`LC_COMMENTARY_ADAPTER_V1`)**: Single pure projection adapter (`packages/projections/src/commentary.ts`) across `T20`, `ODI`, and `RED_BALL` with FNV-1a presentation variation, sliding repetition cooldowns, `factSlots` provenance tracing, format-gated free-hit rules (`T20`/`ODI` only), and milestone badges.
- **Four Verbosity Modes**: `Standard`, `Detailed`, `Brief`, and `Off` synced between Match Header and Career Settings with `0` network calls.

### Stage 8: Optional Sound & Narration (`S08-01`, `accepted`)

- **Original Procedural Web Audio & Captions (`LC_AUDIO_PRESENTATION_V1`, `LC_AUDIO_PROVENANCE_V1`)**: 10 original MIT-licensed Web Audio synthesis profiles with SHA-256 provenance manifest, 4-channel mixer (`Crowd`, `Effects`, `Commentary`, `Interface`), mute toggle, optional browser spoken narration, and live ARIA status captions (`role="status"`, `aria-live="polite"`).
- **Resilient Playback**: User-gesture gating, reload cue deduplication, fast-forward burst expiry, background-tab suppression, graceful decode fallback, and verified byte-identical simulation hashes.

### Stage 9: Historical Statistics & Leaderboards (`S09-01`, `accepted`)

- **Rebuildable Multi-Season Projections (`LC_HISTORICAL_STATISTICS_PROJECTION_V1`)**: Exact incremental-vs-rebuild parity over sealed season records and `CAREER_MATCH_EVENTS_V1` archives, deduplicating fixtures by `${seasonNumber}:${fixtureId}`, preserving retired alumni and cross-club transfers, and strictly isolating career stats from exhibitions, scenarios, and imported non-career histories.
- **Multi-Dimensional Filters & 12 Qualified Leaderboards**: Filter by Season scope, Competition, Club, Opponent, Venue, Batting position band/slot (`1..11`), and Player status (`All`/`Active`/`Retired`), displaying 12 leaderboards with explicit qualification thresholds, null denominators (`—` instead of `0`/`NaN`), shared-rank ties, extracted catches/stumpings/run-outs, and clickable **`View replay`** links to contributing matches.

### Stage 10: Match & Season Awards (`S10-01`, `accepted`)

- **Transparent Versioned Game Award Heuristic (`LC_AWARDS_HEURISTIC_GAME_V1`, `LC_CAREER_AWARDS_LEDGER_V1`)**: Deterministic **Player of the Match** across `T20`, `ODI`, and `RED_BALL` scoring batting impact, bowling impact, and attributable fielding (catches, stumpings, run-outs from sealed delivery archives), with losing-side winner support (`+5` win bonus overridable by exceptional losing performances), explicit `UNAVAILABLE` handling for abandoned/no-result fixtures, and zero extra RNG draws.
- **Five Season Award Categories**: `PLAYER_OF_THE_SEASON`, `LEADING_RUN_SCORER`, `LEADING_WICKET_TAKER`, `BEST_FIELDER`, and `EMERGING_YOUTH_PLAYER` (`age <= 21` or `isYouthGraduate`) with explicit qualification rules, deterministic tie-breakers, and clear **`GAME_AWARD`** heuristic disclaimers.
- **Idempotent Ledger Persistence & Full UI Integration**: Stored in IndexedDB (`CAREER_AWARDS_LEDGER_V1`) and optional hash-checked `awards/ledger.json` entries inside `.lcxxvi` portable archives without breaking earlier saves; surfaced across Match Result, Archived Match Replay, Career Roll of Honour, Statistics Season Awards (resolving active, free-agent, youth, and retired player names), and `PlayerPage` (`Awards & honours`).

### Windows Double-Click & Zero-Dependency `.NET` Portable Launcher (`accepted`)

- **Repo-Root & Portable Batch/PowerShell Launchers (`Play-Lord-Cricket.bat`, `tools/windows/*`)**: Double-clickable Windows entry points that probe `GET /__lcxxvi-health` for running instances, auto-build stale checkouts, open Microsoft Edge / Chrome in standalone `--app=http://127.0.0.1:4180/` window mode, and cleanly shut down via `POST /__lcxxvi-shutdown`.
- **Native `.NET Framework 4.x` C# Executable (`tools/windows/LordCricketLauncher.cs`)**: Compiles in < 2 seconds on any Windows 10/11 machine using built-in `csc.exe` (`npm run package:windows-exe` or `Build-Exe.bat`) into `LordCricketXXVI.exe`, providing a built-in `HttpListener` static server and Windows notification-area tray icon with zero external dependencies.

### Built since Stage 10 (17 and 18 November 2026)

- **Stage 11, player and manager stories (#64).** Story cards derived on demand from committed career facts (milestones, form streaks, youth debuts, awards, retirements, contract and board stories); nothing stored, no persisted format changed.
- **Stage 12, scenario challenges (#65, #72).** Eight fictional challenges (four T20, two one-day, two five-day) that start at a pinned checkpoint against the tactical captain, with personal bests kept outside every save.
- **Stage 14 rules, exhibitions only.** ICC-style super overs for tied T20 and one-day matches (#67, #68), carried in `.lcxxvi` exports (#73); rain-shortened T20 and one-day matches with revised targets from a fictional resource table (#76, #78, #79); player reviews (DRS) for T20 and one-day matches (#80). Each wraps the frozen engines under its own opt-in rule set and record version.
- **Stage 15, fictional tournaments.** Built-in competitions played match by match in a worker, with your own matches on the match screen (#69, #74); competitions you make yourself, shared as files (#81); built-in team crests (#82); tours against a touring XI picked from the other clubs (#83); squads rebuilt by an auction with fictional budgets (#84); tour and auction matches playable by you (#86).
- **Bowling plans (#86).** The T20 and one-day match screens refuse a bowler choice that would leave overs no one could bowl.
- **Captaincy and the Pavilion (#90 to #93, 19 November 2026).** Captain's highlights: limited-overs exhibitions, managed T20 fixtures and two close-finish scenarios played in bounded passages with plans. Rival captains with observable tendencies and an opt-in match-aware opponent. A match-day selection room in career. A redesign of club selection, career home and the scoreboard. [How to play it](docs/verification-captains-pavilion/PLAY.md).
- **Release (#85, #87).** Release record `LC_RELEASE_RECORD_V2` in `docs/release-2026-11-18/` and the GitHub Release `alpha-2026-11-19`.

---

## Architecture & Engineering Invariants

| Package / App | Responsibility | Key Boundary Rules (`scripts/check-boundaries.mjs`) |
| --- | --- | --- |
| `packages/contracts` | Zod + strict AJV 2020-12 JSON Schemas (`392` generated schema files) & versioned protocol types | Only imports `zod`; no ambient browser/clock/RNG APIs |
| `packages/domain` | Frozen delivery scoring kernel (`scoring-kernel.ts`), resolution validator, innings ledger | Only imports `@lcxxvi/contracts` (+ `@lcxxvi/contracts/m7j`); zero ambient APIs |
| `packages/data` | Frozen fictional 8-team/160-player/8-ground pack, probability LUTs, rules | Only imports `@lcxxvi/contracts`; zero ambient APIs |
| `packages/simulation` | Authoritative `T20`/`ODI`/`RED_BALL` engines, splitmix/SHA-256 RNG, lifecycle, economy, rollover | Imports `@lcxxvi/contracts`, `@lcxxvi/data`, `@lcxxvi/domain`, `@noble/hashes`; deterministic only |
| `packages/ai` | Deterministic public-observation captains (`t20`, `odi`, `red5`) | Only imports `@lcxxvi/contracts`; zero hidden rating/seed reads |
| `packages/projections` | Pure rebuildable UI/analytics projections (season, historical stats, awards, briefings, field, commentary, audio cues) | Only imports `@lcxxvi/contracts`; zero ambient browser/clock/RNG APIs |
| `packages/persistence` | IndexedDB repositories, leases, checkpoints, bindings, `.lcxxvi` export/import | Imports `@lcxxvi/contracts`; sole package permitted `indexedDB`/`window`/`document` |
| `apps/web` | React + Vite + Web Worker UI, match/career controllers, Web Audio synth, PWA shell | Presentation & command dispatch only; never simulates deliveries directly |
| `apps/batch` | Headless Node batch runner & diagnostics | Consumes workspace packages |

---

## Roadmap Status (Stages 11 to 17 & Research Track)

See [`docs/ROADMAP_AND_AI_GUIDE.md`](docs/ROADMAP_AND_AI_GUIDE.md) and [`docs/MASTER_BUILD_LEDGER.md`](docs/MASTER_BUILD_LEDGER.md) for the complete stage-by-stage technical specifications, file targets, contract schemas, and dependency graph:

| Stage | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| **Stage 11** | **Player & manager stories** (`S11-01`) | **Built** (#64) | Story cards derived from committed career facts; zero fabricated biographies. |
| **Stage 12** | **Fictional scenario mode** (`S12-01`) | **Built** (#65, #72) | Eight challenges. Not built: a red-ball "survive day five" challenge (no fixed seed reaches that position under the current model). |
| **Stage 13** | **Historical scenarios & provenance** (`S13-01`) | **Parked** (owner, 17 November 2026) | Needs an owner-approved, licensed historical data source. |
| **Stage 14** | **Empirical evaluation & rules expansion** (`S14-01`) | Rules **built** (exhibitions); calibration `BLOCKED_EXTERNAL` | Super overs, rain-shortened matches and player reviews are built. Calibration (`RES-001`..`RES-003`) needs an approved dataset, adjudications and an untouched holdout cohort. |
| **Stage 15** | **Custom competitions & community packs** (`S15-01`) | Fictional parts **built** | Tournaments, user-made competitions, tours, auctions, crests, playable generated-squad matches. Image imports are off (owner answer C1a). |
| **Stage 16** | **Product-quality acceptance** (`S16-01`) | **Passed by owner direction** (18 November 2026) | None of the four parts were run: see [`docs/verification-stage16/OWNER_DIRECTION_2026-11-18.md`](docs/verification-stage16/OWNER_DIRECTION_2026-11-18.md). |
| **Stage 17** | **Release-candidate preparation** (`S17-01`) | Record sealed; release prepared | GitHub Release `alpha-2026-11-19`; the owner publishes it (this agent's session cannot create releases). |

---

## Complete Instructions for AIs to Maintain & Build Out the Roadmap

If you are an AI coding agent or engineer maintaining or extending Lord Cricket XXVI, follow this exact workflow (and read [`docs/ROADMAP_AND_AI_GUIDE.md`](docs/ROADMAP_AND_AI_GUIDE.md) for detailed stage blueprints):

1. **Read the governance chain in order before editing**:
   - [`AGENTS.md`](AGENTS.md) -> [`docs/ROADMAP_AND_AI_GUIDE.md`](docs/ROADMAP_AND_AI_GUIDE.md) -> [`docs/AI_CONTINUATION.md`](docs/AI_CONTINUATION.md) -> [`docs/MASTER_BUILD_LEDGER.md`](docs/MASTER_BUILD_LEDGER.md) -> [`docs/NEXT_PASS.md`](docs/NEXT_PASS.md) -> [`docs/OWNER_DECISIONS_2026-11-13.md`](docs/OWNER_DECISIONS_2026-11-13.md).
2. **Always rebuild TypeScript project references after pulling or switching branches**:
   ```sh
   npx tsc -b
   ```
   *(Future engineers and AIs take note: skipping `npx tsc -b` leaves stale compiled `dist/` files that cause confusing runtime/type errors — as our Hungarian-to-English phrasebook warns, "**My hovercraft is full of Eels**" whenever someone trusts an outdated `dist/` folder without rebuilding first.)*
3. **Respect every hard invariant**:
   - **Never mutate frozen engines or saves silently**: `packages/domain/src/scoring-kernel.ts`, `LC_T20_MATCH_V1`, deterministic RNG stream addresses, probability LUTs, and existing save formats (`V1`, `V2`, `V3`) are protected compatibility boundaries. Any new persisted state needs a new explicit schema version ID and non-destructive slot upgrade or additive projection store key.
   - **Respect package boundaries (`scripts/check-boundaries.mjs`)**: No `Date`, `Date.now()`, `Math.random()`, `window`, `document`, `fetch`, or `indexedDB` inside `contracts`, `domain`, `data`, `simulation`, `ai`, or `projections`. Pass timestamps/seeds explicitly as arguments.
   - **Update schemas whenever contracts change**: Run `npm run schemas` to regenerate `packages/contracts/schemas/*.json`, then commit the generated JSON Schemas and confirm `npm run schemas:check` passes.
   - **No skipped browser tests (`test.skip`)**: Hosted Windows CI treats skipped tests as `INCOMPLETE_BROWSER_EVIDENCE`.
   - **Never read hidden state in AI or presentation**: Tactical captains, briefings, AI contract recruitment, commentary, audio cues, awards, and stories must read strictly public match/career observations (`0` hidden future-ability/ceiling/seed reads).
4. **Required verification before claiming a stage is `tested`**:
   ```sh
   npm run verify:09:core
   MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/<your-stage>.spec.ts tests/ui/accessibility-release-audit.spec.ts
   npx vitest run tests/unit/release-record.test.ts tests/unit/windows-launcher.test.ts
   node scripts/smoke-prebuilt.mjs
   ```
5. **Branch, PR & Handover Discipline**:
   - Branch cleanly from `main` (e.g., `feat/stage11-player-manager-stories`). Never push unreviewed commits directly to `main`.
   - Record exact commands, environments, revision SHAs, and results (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) in `docs/verification-stageXX-<slug>/REPORT.md`, and update `docs/MASTER_BUILD_LEDGER.md`, `docs/CURRENT_STATUS.md`, `docs/HANDOVER.md`, `docs/NEXT_PASS.md`, `docs/CAPABILITY_MATRIX.md`, and `docs/ROADMAP_AND_AI_GUIDE.md`.
   - Deliver a handover report and wait for explicit owner stage acceptance before starting dependent stages.

---

## Verification Gates & Evidence

Key verification scripts in `package.json`:

- `npm run schemas:check` — Validates all Zod contracts against committed JSON Schemas (`334` schemas as of Stage 10).
- `npm run build` — Runs `tsc -b`, Vite production web build, and Vite runtime bundle build.
- `npm run typecheck` — Checks workspace `tsc -b` and `tsconfig.tools.json`.
- `npm run lint` — Runs ESLint and `scripts/check-boundaries.mjs` across all 7 workspace packages.
- `npm run verify:09:core` — Full offline gate: schemas, build, typecheck, lint + boundaries, scorer fixtures (`45` + `29` rejections), Python determinism/probability/generator vectors, and Vitest unit suite (`773` tests across `73` files).
- `npm run test:ui` — Full Chromium + Firefox Playwright UI suite (`1366x768`, keyboard nav, `150%` text scale).
- `npm run management:acceptance` — Headless 56-fixture career acceptance with `14` `USER_MATCH` boundaries and `.lcxxvi` round-trip.
- `npm run package:game` — Builds the portable playable and source ZIPs in `release-packages/`.

---

## Maintained Documentation Index

- **[Full Roadmap & AI Continuation Playbook](docs/ROADMAP_AND_AI_GUIDE.md)** — Complete architecture map, Stages 11–17 implementation blueprints, maintenance runbooks, and step-by-step AI guide
- **[AI-Only Continuation Guide](docs/AI_CONTINUATION.md)** & **[AI Inspection Prompt](docs/AI_INSPECTION_PROMPT.md)**
- **[Master Build Ledger (Stages 1–17)](docs/MASTER_BUILD_LEDGER.md)**
- **[Owner Decisions](docs/OWNER_DECISIONS_2026-11-13.md)** & **[Capability Matrix](docs/CAPABILITY_MATRIX.md)**
- **[Current Status](docs/CURRENT_STATUS.md)**, **[Handover](docs/HANDOVER.md)**, & **[Next Pass](docs/NEXT_PASS.md)**
- **[Engineering Guide](docs/ENGINEERING_GUIDE.md)**, **[Verification Guide](docs/VERIFICATION_GUIDE.md)**, & **[Documentation Index](docs/README.md)**
- **Offline Empirical Research (`M7B`–`M7K`, not selectable in gameplay)**: See [`docs/M7G_RESEARCH_AND_PROMOTION_GATES.md`](docs/M7G_RESEARCH_AND_PROMOTION_GATES.md), [`docs/M7J_RUNBOOK.md`](docs/M7J_RUNBOOK.md), and [`docs/M7K_PLAN.md`](docs/M7K_PLAN.md) (Cricsheet ODC-By 1.0 reference data stays external to the repo).
