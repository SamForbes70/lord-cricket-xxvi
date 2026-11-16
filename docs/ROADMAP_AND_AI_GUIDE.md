# Lord Cricket XXVI: Comprehensive Architecture, Full Roadmap & AI Continuation Playbook

*Last reconciled on 16 November 2026 (Australia/Brisbane) with Stages 1–10 owner-accepted on `main`.*

This guide gives engineers and AI agents a single authoritative map of **what has been built**, **the complete remaining roadmap (Stages 10 to 17 and the empirical research track)**, and **exact rules and commands to continue development safely**.

---

## 1. What Has Been Built (Stages 1 through 10 — Owner Accepted)

### 1.1 Stage 1 / V0.1 Foundation (`main` `f7ee054`, accepted 13 November 2026)

- **Frozen Scoring & Match Kernels (`packages/domain`, `packages/simulation`, `packages/data`)**:
  - `LC_T20_MATCH_V1` authoritatively simulates T20 matches inside a dedicated Web Worker (`apps/web/src/match/match.worker.ts`) using seeded splitmix/SHA-256 random addressing (`packages/simulation/src/determinism.ts`) and integer-mass probability lookup tables (`packages/simulation/src/probability.ts`, `packages/data/src/probability-pack.ts`).
  - Five-day Red Ball (`packages/simulation/src/red-ball-match.ts`, `red-ball-clock.ts`, `red5-weather.ts`) and 50-over ODI (`packages/simulation/src/odi-match.ts`) exhibition engines share the deterministic boundary rules.
  - Cross-language Python checks (`scripts/check-determinism-vectors.py`, `scripts/reference_probability.py`, `scripts/check-generator-vectors.py`) verify bit-exact agreement with TypeScript.
- **8-Team Fictional World & Single-Season Management**:
  - 8 frozen fictional clubs, 160 players, and 8 grounds (`packages/data/src/world.ts`), 14-round / 56-fixture T20 season scheduler (`packages/simulation/src/season-scheduler.ts`), career fatigue/readiness & daily training (`career-condition.ts`), off-screen fixture autopilot (`offscreen-fixture.ts`), and `CareerApplicationService` (`apps/web/src/career/service.ts`).
  - Supports validated world editing (`apps/web/src/world/WorldEditor.tsx`) and imported `8 MiB` roster packs (`apps/web/src/career/RosterCareerApp.tsx`).
- **Deterministic Tactical Captain AI & Delegation (`packages/ai`)**:
  - Public-information-only deterministic captains for `T20` (`t20-captain.ts`), `ODI` (`odi-captain.ts`), and `RED_BALL` (`red5-captain.ts`, `red5-utility.ts`), plus 6-category T20 granular delegation (`delegation-journal.ts`).
- **Crash-Safe IndexedDB Persistence, Recovery & Portable Archives (`packages/persistence`)**:
  - Writer leases, 3 checkpoint generations with inspect/recover workflows, durable managed-match bindings (`managed-binding:<matchGameId>`) across closed tabs (`docs/MANAGED_MATCH_RECOVERY.md`), sealed ball-by-ball replay archives (`CAREER_MATCH_EVENTS_V1`), and `.lcxxvi` portable archive export/import (`packages/persistence/src/archive.ts`).
- **Offline PWA & Accessibility**:
  - Safe precached offline shell (`apps/web/src/offline-update.ts`), `/engineering.html` emergency recovery console, `1366x768` + `150%` text-scale layouts, keyboard navigation, and automated contrast audits.

### 1.2 Stage 2: Persistent Multi-Season World (`S02-01`, `main` `161e781`, accepted 14 November 2026)

- **Contracts & Schemas**: `packages/contracts/src/persistent-world.ts` (`LC_PERSISTENT_WORLD_V1`, `LC_COMPLETED_SEASON_RECORD_V1`, `LC_PERSISTENT_CAREER_PROJECTION_V1`, `LC_PERSISTENT_WORLD_PORTABLE_V1`, `LC_PERSISTENT_WORLD_ROLLOVER_RECEIPT_V1`).
- **Simulation & Projections**: Stable `worldId`/`teamId`/`playerId`/`groundId` across seasons, rotated home/away parity, derived per-season seeds, immutable Roll of Honour, and all-time club/player T20 career projections (`packages/simulation/src/persistent-world.ts`, `packages/projections/src/persistent-world.ts`).
- **Storage**: Dedicated `PERSISTENT_WORLD_SAVES_V1`, `PERSISTENT_WORLD_CHECKPOINTS_V1`, and `PERSISTENT_WORLD_ROLLOVER_RECEIPTS_V1` stores; atomic single-transaction rollover with idempotent receipt replay; `${seasonNumber}:${fixtureId}` replay keys; `160 MiB` `.lcxxvi` bound; non-destructive V0.1 Season 1 -> Season 2 copy-forward.

### 1.3 Stage 3: Player Lifecycle & Youth Pathway (`S03-01`, `main` `1fc2175`, accepted 14 November 2026)

- **Contracts & Fictional Model**: `packages/contracts/src/player-lifecycle.ts` (`LC_PLAYER_LIFECYCLE_STATE_V1`, `LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1`, `LC_PERSISTENT_WORLD_V2_LIFECYCLE`, `LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE`, `LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE`). Explicit `parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"`.
- **Lifecycle Rules (`packages/simulation/src/player-lifecycle.ts`)**: Exploit-proof separation between daily readiness edits and permanent off-season progression driven by elapsed calendar days and match appearances; `+1` annual ageing; deterministic retirement respecting `18..22` squad size, `>= 1` keeper, and `>= 5` bowling-capable floors; youth academy intake (`17..20`), pre-Round-1 promotion, and queued graduation; verified across a 20-season diagnostic horizon (`0` role shortages).
- **UI & Replay**: Youth Academy & Retired Alumni views, per-season roster snapshot replay (`V2`), and non-destructive Stage 2 `V1` -> Stage 3 `V2` slot upgrade.

### 1.4 Stage 4: Contracts, Budgets & Recruitment (`S04-01`, `main` `3e6a026`, accepted 15 November 2026)

- **Contracts & Economy (`packages/contracts/src/squad-economy.ts`, `packages/simulation/src/squad-economy.ts`)**: `LC_PERSISTENT_WORLD_V3_ECONOMY` & `LC_SQUAD_ECONOMY_MODEL_FICTIONAL_V1`; symmetrical `$2,500k` annual domestic club wage cap across all 8 clubs; 1 to 3 season contracts; persistent 3-round pre-season negotiation window; free-agent bidding with cap reservations and counter-offers; `50%` annual-wage buyout cap charge against release-and-sign circumvention; `commandId` idempotency; SHA-256 hash-chained transaction ledger (`verifyEconomyLedgerChain`); symmetrical public-only AI recruitment (`0` hidden future-ability reads); cross-season transfer projection fixes (`packages/projections/src/persistent-world.ts`); 12-season economy diagnostic (`0` overspent clubs, `0` role shortages).
- **UI & Upgrade**: **Contracts & Recruitment** workspace (`CareerApp.tsx`, `PlayerPage.tsx`), V3 `.lcxxvi` archive support (`LC_PERSISTENT_WORLD_PORTABLE_V3_ECONOMY`), and non-destructive `V2 -> V3` slot upgrade.

### 1.5 Stage 5: Tactical Briefings & Feedback (`S05-01`, `main` `4fa82d8`, accepted 15 November 2026)

- **Contracts & Projections (`packages/contracts/src/tactical-briefing.ts`, `packages/projections/src/tactical-briefing.ts`)**: `LC_TACTICAL_BRIEFING_V1` pre-match briefings (pitch tendency, `SYNTHETIC_ALPHA` limit disclosure, XI role balance, fatigue/readiness, public opponent scouting), plain-language upside/trade-off cards for all 7 tactical controls, contextual legal presets (`T20`/`ODI`/`RED_BALL`), incremental + rebuildable post-spell (`SpellOutcomeReview`) and batting-stint (`BattingStintReview`) factual summaries, persistent `showTacticalBriefings` toggle, and observed playtest protocol ([PLAYTEST_SCRIPT_STAGE05.md](PLAYTEST_SCRIPT_STAGE05.md)).

### 1.6 Stage 6: Live Field & Highlight Pacing (`S06-01`, `main` `031abd3`, accepted 15 November 2026)

- **Contracts & UI (`packages/contracts/src/field-presentation.ts`, `packages/projections/src/field-presentation.ts`, `apps/web/src/match/LiveFieldPanel.tsx`)**: Responsive 2D SVG live cricket field (`T20`, `ODI`, `RED_BALL`) with `RHB`/`LHB` off/leg mirroring, named positions, powerplay legality checks, keyboard-accessible field preset controls, illustrative highlights (`EVERY_BALL`, `KEY_MOMENTS`, `FAST`), `reducedMotion` support, isolated FNV-1a presentation jitter (`ILLUSTRATIVE_SECTOR_AND_LENGTH`), clean fallback without sector data, and byte-identical final state/event hashes across pacing modes.

### 1.7 Stage 7: Contextual Text Commentary (`S07-01`, `main` `3762ed3`, accepted 15 November 2026)

- **Contracts & Adapter (`packages/contracts/src/commentary.ts`, `packages/projections/src/commentary.ts`)**: Shared `LC_COMMENTARY_ADAPTER_V1` across `T20`, `ODI`, and `RED_BALL` with FNV-1a presentation variation, sliding repetition cooldowns (`window = 3`), format-gated free-hit rules (`T20`/`ODI` only), milestone tags, `factSlots` provenance tracing, `Standard`/`Detailed`/`Brief`/`Off` verbosity modes synced between Match Header and Career Settings, and zero network calls.

### 1.8 Stage 8: Optional Sound & Narration (`S08-01`, `main` `d02e899`, accepted 16 November 2026)

- **Contracts, Synth & Manager (`packages/contracts/src/audio.ts`, `packages/projections/src/audio-cues.ts`, `apps/web/src/match/audio-manager.ts`, `AudioControlsPanel.tsx`)**: `LC_AUDIO_PRESENTATION_V1` & `LC_AUDIO_PROVENANCE_V1` with 10 original MIT procedural Web Audio synthesis profiles + SHA-256 attribution manifest, 4-channel volume mixer + mute + optional spoken narration + live ARIA captions, user-gesture gating, reload cue deduplication, fast-forward expiry, background-tab suppression, graceful decode fallback, and verified byte-identical simulation hashes.

### 1.9 Stage 9: Historical Statistics & Leaderboards (`S09-01`, accepted 16 November 2026)

- **Contracts & Projections (`packages/contracts/src/historical-stats.ts`, `packages/projections/src/historical-stats.ts`)**: `LC_HISTORICAL_STATISTICS_PROJECTION_V1` (`325` total strict JSON Schemas), exact incremental-vs-rebuild parity, duplicate-fixture rejection (`${seasonNumber}:${fixtureId}`), explicit isolation from exhibitions/scenarios/imported non-career histories, archived-event fielding extraction (catches, stumpings, run-outs), multi-dimensional filters (season, competition, club, opponent, venue, batting position band/slot, active/retired status), 12 qualified batting/bowling/fielding leaderboards with explicit denominators/nulls/ties, and clickable **`View replay`** links on Statistics and Player pages.

---

## 2. Complete Future Roadmap (Stages 10 to 17 & Research Track)

### Stage 10 — Match and season awards (`S10-01`, **`accepted` on `main`**, 16 November 2026)

- **Verification evidence**: [verification-stage10-match-season-awards/REPORT.md](verification-stage10-match-season-awards/REPORT.md) (`334` strict JSON Schemas, `770/770` unit tests across `72/72` files, Chromium + Firefox Stage 10 + accessibility UI suites).
- **Delivered**:
  - Versioned contracts (`packages/contracts/src/awards.ts`: `LC_AWARDS_HEURISTIC_GAME_V1`, `LC_CAREER_AWARDS_LEDGER_V1`) + generated JSON Schemas.
  - Pure **Player of the Match** heuristic (`packages/projections/src/awards.ts`) scoring batting impact, bowling impact, and attributable fielding contributions from sealed delivery events; supports **losing-side winners** on exceptional performances and explicit **no-result / abandoned** handling.
  - **Season Awards** (`PLAYER_OF_THE_SEASON`, `LEADING_RUN_SCORER`, `LEADING_WICKET_TAKER`, `BEST_FIELDER`, `EMERGING_YOUTH_PLAYER`) with explicit minimum qualification thresholds, tie-break rules, and clear **`GAME_AWARD` / heuristic disclaimer** (`not an official ICC/real-world formula`).
  - Idempotent award persistence in `CAREER_AWARDS_LEDGER_V1` + `.lcxxvi` `awards/ledger.json`, replayable without re-computing RNG, and displayed across **Match Result**, **Archived Replay**, **Career / Roll of Honour**, **Statistics**, and **PlayerPage** (`Awards & honours`).

### Stage 11 — Player and manager stories (`deps: Stages 4, 9, 10`)

- **Goal**: Narrative and career milestones anchored strictly to verified game events.
- **Required Deliverables**:
  - Event-driven milestone, streak, selection/contract pressure, and board-review cards derived deterministically from committed seasons, awards, contracts, and historical stats (`0` invented off-screen backstories or hallucinated match claims).
  - Optional player-facing career news feed / season digest respecting existing accessibility and `Off`/concise presentation controls.

### Stage 12 — Fictional scenario mode (`deps: Stages 5, 6, 7`)

- **Goal**: Isolated tactical puzzle / match scenarios using the authoritative `T20`, `ODI`, and `RED_BALL` engines.
- **Required Deliverables**:
  - Scenario manifest schema (`LC_SCENARIO_CHALLENGE_V1`): curated starting match states (e.g., T20 final-3-over chase, ODI middle-overs rebuild, red-ball day-5 survival/collapse), explicit win/draw objectives, deterministic seed lock, and personal-best completion records stored outside career saves.
  - Strict isolation from career historical statistics (Stage 9 boundary preserved).

### Stage 13 — Historical scenarios and provenance (`deps: Stage 12 + source permissions/rules review`)

- **Goal**: Player-facing historical scenario packs built on verified historical fixtures.
- **Current state**: Offline intake & ledger tooling exist (`scripts/research/m7k-historical-fixture.ts`).
- **Remaining gates**: Explicit dataset/source permissions, rare-event rule adjudication review (`OWNER_DECISIONS_2026-11-13.md`), and Stage 12 scenario runner.

### Stage 14 — Empirical evaluation and rules expansion (`BLOCKED_EXTERNAL` on `RES-001`..`RES-003`)

- **Goal**: Promote calibrated empirical probability models alongside expanded cricket laws.
- **Required Deliverables**:
  - Offline research (`M7F`–`M7K`) promoted to a versioned, empirically validated gameplay model only after satisfying untouched holdout validation, rare-event adjudication resolution, and explicit owner promotion approval.
  - **Super Overs**, **DLS / rain-adjusted limited-overs targets**, and **DRS player reviews** implemented as versioned, deterministic rules extensions.

### Stage 15 — Custom competitions and community packs (`deps: Stages 4, 9, 13`)

- **Goal**: User-authored tournaments, tours, and custom competition rule packs.
- **Required Deliverables**:
  - Custom competition definitions (league formats, knockout playoffs, bilateral/multi-team tours, optional auction/draft rules, international availability/release rules) plus validated crest, kit, and ground asset packs extending the `8 MiB` roster import pipeline.

### Stage 16 — Product-quality acceptance (`Partial`)

- **Goal**: Replace declared/automated-only proxy gates with measured human & hardware evidence.
- **Open Items**:
  - Observed multi-participant playtests using [`docs/PLAYTEST_SCRIPT_STAGE05.md`](PLAYTEST_SCRIPT_STAGE05.md).
  - Measured reference-laptop and owner-PC collector benchmarks confirming `<= 768 MiB` peak memory (`docs/PERFORMANCE_BUDGETS.md`).
  - Long-career IndexedDB storage soak tests (10+ to 25+ seasons, export/import size & timing).
  - Formal human screen-reader walkthrough transcript.

### Stage 17 — Release-candidate preparation (`Partial`)

- **Goal**: Final release-candidate packaging and deployment sign-off.
- **Open Items**:
  - Re-sealed `RELEASE_RECORD.json` covering post-V0.1 capabilities and current SHA-256 manifests.
  - Cross-platform verification of `npm run package:game` launchers on Windows, Linux, and macOS.
  - Explicit owner deployment authorisation.

---

## 3. Complete Instructions for AIs to Continue Building

### 3.1 First 60 Seconds on a Fresh Checkout

```sh
git status && git log --oneline -10
npm ci
npx tsc -b
```

> **Why `npx tsc -b` matters:** Stale compiled `dist/` folders inside `packages/*` cause bizarre module/function-missing errors in Vitest and Node scripts. Remember our Hungarian phrasebook rule: if you skip `npx tsc -b` after pulling or changing a workspace package, **"My hovercraft is full of Eels."**

### 3.2 Package Dependency & Purity Boundaries (`scripts/check-boundaries.mjs`)

1. **`packages/contracts`**: Only imports `zod`. No ambient browser/clock/RNG APIs.
2. **`packages/domain`**, **`packages/data`**, **`packages/ai`**, **`packages/projections`**: Only import `@lcxxvi/contracts` (plus `@lcxxvi/contracts/m7j` for `domain`). **Never** call `Date`, `new Date()`, `Date.now()`, `Math.random()`, `window`, `document`, `fetch`, or `indexedDB`.
3. **`packages/simulation`**: Imports `@lcxxvi/contracts`, `@lcxxvi/data`, `@lcxxvi/domain`, and `@noble/hashes/sha2` + `@noble/hashes/utils`. **Zero** ambient clock/RNG/DOM calls.
4. **`packages/persistence`**: Only package permitted browser storage (`indexedDB`, `window`, `document`).
5. **`apps/web`**: Owns React UI, Web Audio synthesis, Web Workers, and user-facing interactions. **Never** compute authoritative match deliveries in React.

### 3.3 Frozen Compatibility Rules

- Do **not** modify `packages/domain/src/scoring-kernel.ts`, `LC_T20_MATCH_V1` probability LUTs, or frozen random-stream addresses without an explicit new simulation model version and owner approval.
- Never widen an existing persisted save schema (`LC_T20_SEASON_SAVE_V1`, `LC_PERSISTENT_WORLD_V1`, `V2_LIFECYCLE`, `V3_ECONOMY`) in place. Introduce a new versioned schema ID and non-destructive slot-copy upgrade.
- Never add `test.skip` or `.only` in Vitest or Playwright suites (hosted Windows CI rejects skipped browser tests).
- Whenever you add or change Zod schemas in `packages/contracts`, regenerate and commit JSON Schemas via:
  ```sh
  npm run schemas && npm run schemas:check
  ```

### 3.4 Mandatory Verification Pipeline Before Calling a Slice `tested`

```sh
# 1. Core gate (schemas, Vite builds, tsc, eslint + boundaries, scorer fixtures, Python vectors, all unit tests)
npm run verify:09:core

# 2. Browser UI gate (Chromium + Firefox)
MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/<new-stage>.spec.ts tests/ui/accessibility-release-audit.spec.ts

# 3. Release-record & doc-reference integrity check
npx vitest run tests/unit/release-record.test.ts
```

### 3.5 Git & Handover Protocol

1. Branch from `main`: `git checkout -b feat/stage10-match-season-awards`.
2. Write `docs/verification-stage10-awards/REPORT.md` containing exact commands, environments, revision SHAs, and PASS/FAIL/BLOCKED/NOT RUN tables.
3. Update `docs/MASTER_BUILD_LEDGER.md`, `docs/CURRENT_STATUS.md`, `docs/HANDOVER.md`, `docs/NEXT_PASS.md`, `docs/CAPABILITY_MATRIX.md`, and `docs/MANAGEMENT_UI.md`.
4. Never commit or push without owner permission when operating under explicit branch/PR approval rules; never mark an owner gate passed or promote a research model without explicit owner approval.
