# Lord Cricket XXVI

**An evidence-based, deterministic, browser-native statistical cricket management game built as a strict TypeScript monorepo.**

> **Quick status (16 November 2026, Australia/Brisbane):** V0.1 (`f7ee054`) and Stages 2 through 9 (`Persistent Multi-Season World`, `Player Lifecycle & Youth Pathway`, `Contracts, Budgets & Recruitment`, `Tactical Briefings & Feedback`, `Live Field & Highlight Pacing`, `Contextual Text Commentary`, `Optional Sound & Narration`, and `Historical Statistics & Leaderboards`) are **implemented, verified, merged to `main`, and owner-accepted**. **Stage 10 (`Match & season awards`, `S10-01`) is `tested` on `feat/stage10-match-season-awards`** awaiting owner acceptance. The authoritative production gameplay model remains `synthetic-alpha-01` / `SYNTHETIC_ALPHA` (fictional teams/players, no empirical calibration claim yet).

---

## Table of Contents

1. [Quick Start & Packaging](#quick-start--packaging)
2. [What Has Been Built (V0.1 + Stages 2 to 9)](#what-has-been-built-v01--stages-2-to-9)
3. [Architecture & Engineering Invariants](#architecture--engineering-invariants)
4. [Full Future Roadmap (Stages 10 to 17 & Research Track)](#full-future-roadmap-stages-10-to-17--research-track)
5. [Complete Instructions for AIs to Continue Building](#complete-instructions-for-ais-to-continue-building)
6. [Verification Gates & Evidence](#verification-gates--evidence)
7. [Maintained Documentation Index](#maintained-documentation-index)

---

## Quick Start & Packaging

Requirements: **Node.js `>=22.12.0`**, **npm**, and **Python 3** (for deterministic vector checks and `verify:09:core`).

```sh
npm ci
npm run build
node start.mjs
```

Then open **`http://127.0.0.1:4180/`** in a modern browser. Because the game uses Web Workers (`apps/web/src/match/match.worker.ts`, `determinism.worker.ts`), serve `apps/web/dist` over HTTP (`node start.mjs` or `npm run dev`) rather than opening `index.html` directly via `file://`.

- **Development server**: `npm run dev`
- **Shareable offline zips**: `npm run package:game` (writes playable and source zips to `release-packages/`)
- **Full core verification**: `npm run verify:09:core`
- **Browser E2E verification**: `npx playwright install chromium firefox && npm run test:ui`

---

## What Has Been Built (V0.1 + Stages 2 to 9)

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

- **2D SVG Live Cricket Field (`LC_FIELD_PRESENTATION_V1`)**: Responsive named-position field across `T20`, `ODI`, and `RED_BALL` with dynamic `RHB`/`LHB` off/leg mirroring, live powerplay infield/outfield legality diagnostics, and keyboard-accessible preset controls.
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

---

## Architecture & Engineering Invariants

| Package / App | Responsibility | Key Boundary Rules (`scripts/check-boundaries.mjs`) |
| --- | --- | --- |
| `packages/contracts` | Zod + strict AJV 2020-12 JSON Schemas (`334` schemas) & versioned protocol types | Only imports `zod`; no ambient browser/clock/RNG APIs |
| `packages/domain` | Frozen delivery scoring kernel (`scoring-kernel.ts`), resolution validator, innings ledger | Only imports `@lcxxvi/contracts` (+ `@lcxxvi/contracts/m7j`); zero ambient APIs |
| `packages/data` | Frozen fictional 8-team/160-player/8-ground pack, probability LUTs, rules | Only imports `@lcxxvi/contracts`; zero ambient APIs |
| `packages/simulation` | Authoritative `T20`/`ODI`/`RED_BALL` engines, splitmix/SHA-256 RNG, lifecycle, economy, rollover | Imports `@lcxxvi/contracts`, `@lcxxvi/data`, `@lcxxvi/domain`, `@noble/hashes`; deterministic only |
| `packages/ai` | Deterministic public-observation captains (`t20`, `odi`, `red5`) | Only imports `@lcxxvi/contracts`; zero hidden rating/seed reads |
| `packages/projections` | Pure rebuildable UI/analytics projections (season, historical stats, briefings, field, commentary, audio cues) | Only imports `@lcxxvi/contracts`; zero ambient browser/clock/RNG APIs |
| `packages/persistence` | IndexedDB repositories, leases, checkpoints, bindings, `.lcxxvi` export/import | Imports `@lcxxvi/contracts`; sole package permitted `indexedDB`/`window`/`document` |
| `apps/web` | React + Vite + Web Worker UI, match/career controllers, Web Audio synth, PWA shell | Presentation & command dispatch only; never simulates deliveries directly |
| `apps/batch` | Headless Node batch runner & diagnostics | Consumes workspace packages |

---

## Full Future Roadmap (Stages 10 to 17 & Research Track)

See [`docs/ROADMAP_AND_AI_GUIDE.md`](docs/ROADMAP_AND_AI_GUIDE.md) and [`docs/MASTER_BUILD_LEDGER.md`](docs/MASTER_BUILD_LEDGER.md) for the complete stage-by-stage technical specifications and dependency graph:

| Stage | Deliverable | Status | Scope & Dependencies |
| --- | --- | --- | --- |
| **Stage 10** | **Match & season awards** (`S10-01`) | **Tested** (`feat/stage10-match-season-awards`, awaiting owner acceptance) | Transparent versioned Player of the Match heuristic (`T20`/`ODI`/`RED_BALL`, batting, bowling, attributable fielding; losing-side winner & no-result support; explicit `GAME_AWARD` disclaimer; idempotent persistence & `.lcxxvi` round-trip) + 5 qualified season awards (`Player of the Season`, `Leading Run-Scorer`, `Leading Wicket-Taker`, `Best Fielder`, `Emerging / Youth Player`) integrated into Match Result, Archived Replay, Roll of Honour, Statistics, and PlayerPage. |
| **Stage 11** | **Player & manager stories** | Planned (`deps: 4, 9, 10`) | Structured career milestones, form streaks, contract tension & press/board moments derived from committed career facts without fabricated biographies. |
| **Stage 12** | **Fictional scenario mode** | Planned (`deps: 5, 6, 7`) | Player-facing isolated scenario challenges (chase targets, collapses, red-ball fourth-innings saves) with clear win objectives and personal-best records, strictly separated from career saves. |
| **Stage 13** | **Historical scenarios & provenance** | Partial / Blocked (`deps: 12 + data review`) | Player-facing sourced historical scenarios layered over `scripts/research/m7k-historical-fixture.ts`, gated on source permissions and rules adjudication review. |
| **Stage 14** | **Empirical evaluation & rules expansion** | Blocked (`RES-001`..`RES-003`) | Empirical calibration promotion (`M7F`–`M7K` offline research -> calibrated model version), Super Overs, DLS/rain-adjusted limited-overs targets, and DRS reviews; blocked externally on approved licensed dataset, adjudications, and untouched holdout cohort. |
| **Stage 15** | **Custom competitions & community packs** | Partial (`deps: 4, 9, 13`) | Custom league structures, tours/bilateral series, auction/draft packs, international release rules, and validated crest/kit/ground asset packs extending existing `8 MiB` roster import & world editing. |
| **Stage 16** | **Product-quality acceptance** | Partial | Real multi-participant observed playtests ([`docs/PLAYTEST_SCRIPT_STAGE05.md`](docs/PLAYTEST_SCRIPT_STAGE05.md)), measured reference-hardware & owner-PC runs (`<= 768 MiB`), long-career storage soak benchmarks, and formal screen-reader walkthrough transcripts. |
| **Stage 17** | **Release-candidate preparation** | Partial | Updated post-expansion release manifest (`RELEASE_RECORD.json`), signed/reproducible `npm run package:game` Windows/Linux/macOS bundle checks, and explicit owner deployment authorisation. |

---

## Complete Instructions for AIs to Continue Building

If you are an AI coding agent or engineer continuing Lord Cricket XXVI, follow this exact workflow:

1. **Read the governance chain in order before editing**:
   - [`AGENTS.md`](AGENTS.md) -> [`docs/ROADMAP_AND_AI_GUIDE.md`](docs/ROADMAP_AND_AI_GUIDE.md) -> [`docs/AI_CONTINUATION.md`](docs/AI_CONTINUATION.md) -> [`docs/MASTER_BUILD_LEDGER.md`](docs/MASTER_BUILD_LEDGER.md) -> [`docs/NEXT_PASS.md`](docs/NEXT_PASS.md) -> [`docs/OWNER_DECISIONS_2026-11-13.md`](docs/OWNER_DECISIONS_2026-11-13.md).
2. **Always rebuild TypeScript project references after pulling or switching branches**:
   ```sh
   npx tsc -b
   ```
   *(Future engineers and AIs take note: skipping `npx tsc -b` leaves stale compiled `dist/` files that cause confusing runtime/type errors — as our Hungarian-to-English phrasebook warns, "**My hovercraft is full of Eels**" whenever someone trusts an outdated `dist/` folder without rebuilding first.)*
3. **Respect every hard invariant**:
   - **Never mutate frozen engines or saves silently**: `packages/domain/src/scoring-kernel.ts`, `LC_T20_MATCH_V1`, deterministic RNG stream addresses, probability LUTs, and existing save formats (`V1`, `V2`, `V3`) are protected compatibility boundaries. Any new persisted state needs a new explicit schema version ID and non-destructive slot upgrade.
   - **Respect package boundaries (`scripts/check-boundaries.mjs`)**: No `Date`, `Date.now()`, `Math.random()`, `window`, `document`, `fetch`, or `indexedDB` inside `contracts`, `domain`, `data`, `simulation`, `ai`, or `projections`. Pass timestamps/seeds explicitly as arguments.
   - **Update schemas whenever contracts change**: Run `npm run schemas` to regenerate `packages/contracts/schemas/*.json`, then commit the generated JSON Schemas and confirm `npm run schemas:check` passes.
   - **No skipped browser tests (`test.skip`)**: Hosted Windows CI treats skipped tests as `INCOMPLETE_BROWSER_EVIDENCE`.
   - **Never read hidden state in AI or presentation**: Tactical captains, briefings, AI contract recruitment, commentary, and audio cues must read strictly public match/career observations (`0` hidden future-ability/ceiling/seed reads).
4. **Required verification before claiming a stage is `tested`**:
   ```sh
   npm run verify:09:core
   MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/<your-stage>.spec.ts tests/ui/accessibility-release-audit.spec.ts
   npx vitest run tests/unit/release-record.test.ts
   ```
5. **Branch, PR & Handover Discipline**:
   - Branch cleanly from `main` (e.g., `feat/stage10-match-season-awards`). Never push unreviewed commits directly to `main`.
   - Record exact commands, environments, revision SHAs, and results (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`) in `docs/verification-stageXX-<slug>/REPORT.md`, and update `docs/MASTER_BUILD_LEDGER.md`, `docs/CURRENT_STATUS.md`, `docs/HANDOVER.md`, `docs/NEXT_PASS.md`, and `docs/CAPABILITY_MATRIX.md`.
   - Deliver a handover report and wait for explicit owner stage acceptance before starting dependent stages.

---

## Verification Gates & Evidence

Key verification scripts in `package.json`:

- `npm run schemas:check` — Validates all Zod contracts against committed JSON Schemas (`325` schemas as of Stage 9).
- `npm run build` — Runs `tsc -b`, Vite production web build, and Vite runtime bundle build.
- `npm run typecheck` — Checks workspace `tsc -b` and `tsconfig.tools.json`.
- `npm run lint` — Runs ESLint and `scripts/check-boundaries.mjs` across all 7 workspace packages.
- `npm run verify:09:core` — Full offline gate: schemas, build, typecheck, lint + boundaries, scorer fixtures (`45` + `29` rejections), Python determinism/probability/generator vectors, and Vitest unit suite.
- `npm run test:ui` — Full Chromium + Firefox Playwright UI suite (`1366x768`, keyboard nav, `150%` text scale).
- `npm run management:acceptance` — Headless 56-fixture career acceptance with `14` `USER_MATCH` boundaries and `.lcxxvi` round-trip.

---

## Maintained Documentation Index

- **[Full Roadmap & AI Continuation Playbook](docs/ROADMAP_AND_AI_GUIDE.md)** — Complete architecture map, Stages 10–17 technical blueprint, and step-by-step AI guide
- **[AI-Only Continuation Guide](docs/AI_CONTINUATION.md)** & **[AI Inspection Prompt](docs/AI_INSPECTION_PROMPT.md)**
- **[Master Build Ledger (Stages 1–17)](docs/MASTER_BUILD_LEDGER.md)**
- **[Owner Decisions](docs/OWNER_DECISIONS_2026-11-13.md)** & **[Capability Matrix](docs/CAPABILITY_MATRIX.md)**
- **[Current Status](docs/CURRENT_STATUS.md)**, **[Handover](docs/HANDOVER.md)**, & **[Next Pass](docs/NEXT_PASS.md)**
- **[Engineering Guide](docs/ENGINEERING_GUIDE.md)**, **[Verification Guide](docs/VERIFICATION_GUIDE.md)**, & **[Documentation Index](docs/README.md)**
- **Offline Empirical Research (`M7B`–`M7K`, not selectable in gameplay)**: See [`docs/M7G_RESEARCH_AND_PROMOTION_GATES.md`](docs/M7G_RESEARCH_AND_PROMOTION_GATES.md), [`docs/M7J_RUNBOOK.md`](docs/M7J_RUNBOOK.md), and [`docs/M7K_PLAN.md`](docs/M7K_PLAN.md) (Cricsheet ODC-By 1.0 reference data stays external to the repo).
