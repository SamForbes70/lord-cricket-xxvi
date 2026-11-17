# Lord Cricket XXVI: Comprehensive Architecture, Full Roadmap & AI Continuation Playbook

*Last reconciled on 16 November 2026 (Australia/Brisbane) with Stages 1–10 and the Windows Double-Click / `.NET` Portable Launcher owner-accepted on `main` (`773/773` unit tests across `73/73` files, `334` strict JSON Schemas).* 

> **Stabilisation in progress (16 November 2026).** The owner directed: "Get what we currently have as excellent, then we will finish the full game." No new stages (including Stage 11) until the plan in [AUDIT_2026-11-16.md](AUDIT_2026-11-16.md) is complete and reviewed. Current state and the open pull requests: [HANDOVER.md](HANDOVER.md). Stages 2 to 10 landed on `main` with hosted CI failing; the stabilisation pull requests make it green.

This guide gives engineers and AI coding agents a single authoritative blueprint of:
1. **What has been built and verified (Stages 1 through 10 + Windows Native Launcher)**,
2. **The complete remaining roadmap with concrete execution plans (Stages 11 to 17 & the Empirical Research Track)**, and
3. **The complete AI maintenance, upkeep, and verification playbook**.

---

## 1. What Has Been Built (Stages 1 through 10 + Windows Launcher — Owner Accepted)

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
- **Evidence**: [verification-stage02-persistent-world/REPORT.md](verification-stage02-persistent-world/REPORT.md).

### 1.3 Stage 3: Player Lifecycle & Youth Pathway (`S03-01`, `main` `1fc2175`, accepted 14 November 2026)

- **Contracts & Fictional Model**: `packages/contracts/src/player-lifecycle.ts` (`LC_PLAYER_LIFECYCLE_STATE_V1`, `LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1`, `LC_PERSISTENT_WORLD_V2_LIFECYCLE`, `LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE`, `LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE`). Explicit `parameterProvenance: "FICTIONAL_GAMEPLAY_PLACEHOLDER"`.
- **Lifecycle Rules (`packages/simulation/src/player-lifecycle.ts`)**: Exploit-proof separation between daily readiness edits and permanent off-season progression driven by elapsed calendar days and match appearances; `+1` annual ageing; deterministic retirement respecting `18..22` squad size, `>= 1` keeper, and `>= 5` bowling-capable floors; youth academy intake (`17..20`), pre-Round-1 promotion, and queued graduation; verified across a 20-season diagnostic horizon (`0` role shortages).
- **UI & Replay**: Youth Academy & Retired Alumni views, per-season roster snapshot replay (`V2`), and non-destructive Stage 2 `V1` -> Stage 3 `V2` slot upgrade.
- **Evidence**: [verification-stage03-player-lifecycle/REPORT.md](verification-stage03-player-lifecycle/REPORT.md).

### 1.4 Stage 4: Contracts, Budgets & Recruitment (`S04-01`, `main` `3e6a026`, accepted 15 November 2026)

- **Contracts & Economy (`packages/contracts/src/squad-economy.ts`, `packages/simulation/src/squad-economy.ts`)**: `LC_PERSISTENT_WORLD_V3_ECONOMY` & `LC_SQUAD_ECONOMY_MODEL_FICTIONAL_V1`; symmetrical `$2,500k` annual domestic club wage cap across all 8 clubs; 1 to 3 season contracts; persistent 3-round pre-season negotiation window; free-agent bidding with cap reservations and counter-offers; `50%` annual-wage buyout cap charge against release-and-sign circumvention; `commandId` idempotency; SHA-256 hash-chained transaction ledger (`verifyEconomyLedgerChain`); symmetrical public-only AI recruitment (`0` hidden future-ability reads); cross-season transfer projection fixes (`packages/projections/src/persistent-world.ts`); 12-season economy diagnostic (`0` overspent clubs, `0` role shortages).
- **UI & Upgrade**: **Contracts & Recruitment** workspace (`CareerApp.tsx`, `PlayerPage.tsx`), V3 `.lcxxvi` archive support (`LC_PERSISTENT_WORLD_PORTABLE_V3_ECONOMY`), and non-destructive `V2 -> V3` slot upgrade.
- **Evidence**: [verification-stage04-squad-economy/REPORT.md](verification-stage04-squad-economy/REPORT.md).

### 1.5 Stage 5: Tactical Briefings & Feedback (`S05-01`, `main` `4fa82d8`, accepted 15 November 2026)

- **Contracts & Projections (`packages/contracts/src/tactical-briefing.ts`, `packages/projections/src/tactical-briefing.ts`)**: `LC_TACTICAL_BRIEFING_V1` pre-match briefings (pitch tendency, `SYNTHETIC_ALPHA` limit disclosure, XI role balance, fatigue/readiness, public opponent scouting), plain-language upside/trade-off cards for all 7 tactical controls, contextual legal presets (`T20`/`ODI`/`RED_BALL`), incremental + rebuildable post-spell (`SpellOutcomeReview`) and batting-stint (`BattingStintReview`) factual summaries, persistent `showTacticalBriefings` toggle, and observed playtest protocol ([PLAYTEST_SCRIPT_STAGE05.md](PLAYTEST_SCRIPT_STAGE05.md)).
- **Evidence**: [verification-stage05-tactical-briefings/REPORT.md](verification-stage05-tactical-briefings/REPORT.md).

### 1.6 Stage 6: Live Field & Highlight Pacing (`S06-01`, `main` `031abd3`, accepted 15 November 2026)

- **Contracts & UI (`packages/contracts/src/field-presentation.ts`, `packages/projections/src/field-presentation.ts`, `apps/web/src/match/LiveFieldPanel.tsx`)**: Responsive 2D SVG live cricket field (`T20`, `ODI`, `RED_BALL`) with `RHB`/`LHB` off/leg mirroring, named positions, powerplay legality checks, keyboard-accessible field preset controls, illustrative highlights (`EVERY_BALL`, `KEY_MOMENTS`, `FAST`), `reducedMotion` support, isolated FNV-1a presentation jitter (`ILLUSTRATIVE_SECTOR_AND_LENGTH`), clean fallback without sector data, and byte-identical final state/event hashes across pacing modes.
- **Evidence**: [verification-stage06-live-field-highlights/REPORT.md](verification-stage06-live-field-highlights/REPORT.md).

### 1.7 Stage 7: Contextual Text Commentary (`S07-01`, `main` `3762ed3`, accepted 15 November 2026)

- **Contracts & Adapter (`packages/contracts/src/commentary.ts`, `packages/projections/src/commentary.ts`)**: Shared `LC_COMMENTARY_ADAPTER_V1` across `T20`, `ODI`, and `RED_BALL` with FNV-1a presentation variation, sliding repetition cooldowns (`window = 3`), format-gated free-hit rules (`T20`/`ODI` only), milestone tags, `factSlots` provenance tracing, `Standard`/`Detailed`/`Brief`/`Off` verbosity modes synced between Match Header and Career Settings, and zero network calls.
- **Evidence**: [verification-stage07-contextual-commentary/REPORT.md](verification-stage07-contextual-commentary/REPORT.md).

### 1.8 Stage 8: Optional Sound & Narration (`S08-01`, `main` `d02e899`, accepted 16 November 2026)

- **Contracts, Synth & Manager (`packages/contracts/src/audio.ts`, `packages/projections/src/audio-cues.ts`, `apps/web/src/match/audio-manager.ts`, `AudioControlsPanel.tsx`)**: `LC_AUDIO_PRESENTATION_V1` & `LC_AUDIO_PROVENANCE_V1` with 10 original MIT procedural Web Audio synthesis profiles + SHA-256 attribution manifest, 4-channel volume mixer + mute + optional spoken narration + live ARIA captions, user-gesture gating, reload cue deduplication, fast-forward expiry, background-tab suppression, graceful decode fallback, and verified byte-identical simulation hashes.
- **Evidence**: [verification-stage08-optional-sound/REPORT.md](verification-stage08-optional-sound/REPORT.md).

### 1.9 Stage 9: Historical Statistics & Leaderboards (`S09-01`, `main` `9e4ea36`, accepted 16 November 2026)

- **Contracts & Projections (`packages/contracts/src/historical-stats.ts`, `packages/projections/src/historical-stats.ts`)**: `LC_HISTORICAL_STATISTICS_PROJECTION_V1` (`325` strict JSON Schemas at Stage 9), exact incremental-vs-rebuild parity, duplicate-fixture rejection (`${seasonNumber}:${fixtureId}`), explicit isolation from exhibitions/scenarios/imported non-career histories, archived-event fielding extraction (catches, stumpings, run-outs), multi-dimensional filters (season, competition, club, opponent, venue, batting position band/slot, active/retired status), 12 qualified batting/bowling/fielding leaderboards with explicit denominators/nulls/ties, and clickable **`View replay`** links on Statistics and Player pages.
- **Evidence**: [verification-stage09-historical-stats/REPORT.md](verification-stage09-historical-stats/REPORT.md).

### 1.10 Stage 10: Match & Season Awards (`S10-01`, `main` `8517205`, accepted 16 November 2026)

- **Contracts & Schemas (`packages/contracts/src/awards.ts`)**: `LC_AWARDS_HEURISTIC_GAME_V1` and `LC_CAREER_AWARDS_LEDGER_V1` (+9 strict JSON Schemas, `334` total).
- **Pure Projections (`packages/projections/src/awards.ts`)**: Deterministic **Player of the Match** across `T20`, `ODI`, and `RED_BALL` (batting impact, bowling impact, attributable fielding from sealed delivery logs, `+5` win bonus allowing exceptional losing-side winners, explicit `UNAVAILABLE` status for abandoned/no-result fixtures, zero RNG draws) and **5 Season Awards** (`PLAYER_OF_THE_SEASON`, `LEADING_RUN_SCORER`, `LEADING_WICKET_TAKER`, `BEST_FIELDER`, `EMERGING_YOUTH_PLAYER`) with minimum qualification rules, deterministic tie-breakers, and explicit `GAME_AWARD` heuristic disclaimers (`not an official ICC/real-world formula`).
- **Persistence & UI (`packages/persistence/src/*`, `apps/web/src/*`)**: Idempotent `CAREER_AWARDS_LEDGER_V1` storage in IndexedDB `projections` store and optional hash-checked `awards/ledger.json` in `.lcxxvi` archives; integrated into Match Result, Archived Replay, Career Roll of Honour, Statistics Season Awards (resolving active, free-agent, youth, and retired player names), and `PlayerPage` (`Awards & honours`).
- **Evidence**: [verification-stage10-match-season-awards/REPORT.md](verification-stage10-match-season-awards/REPORT.md).

### 1.11 Windows Double-Click & Zero-Dependency `.NET` Portable Launcher (`main`, accepted 16 November 2026)

- **Repo-Root & Portable Batch/PowerShell Launchers**: `Play-Lord-Cricket.bat`, `tools/windows/launch-repo.ps1`, `tools/windows/start-windows.ps1`, `tools/windows/Stop-Lord-Cricket.bat`, `tools/windows/Create-Desktop-Shortcut.ps1`, and `tools/windows/serve-portable.mjs`.
- **Native `.NET Framework 4.x` C# Executable (`tools/windows/LordCricketLauncher.cs` + `build-exe.ps1`)**: Compiles `LordCricketXXVI.exe` using Windows' built-in `csc.exe` (`npm run package:windows-exe` or `Build-Exe.bat`) with an embedded `HttpListener` static server (`127.0.0.1:4180`), `/__lcxxvi-health` & `/__lcxxvi-shutdown` endpoints, standalone Edge/Chrome `--app=` window launch, and a Windows notification-area tray icon.
- **Verification**: `tests/unit/windows-launcher.test.ts` (`3/3` passing).

---

## 2. Complete Future Roadmap & Stage-by-Stage Implementation Blueprints (Stages 11 to 17 & Research Track)

Any AI agent or engineer implementing the next stages should follow the exact blueprints below, strictly one stage at a time, branching from `main`.

### Stage 11 — Player and manager stories (`Slice S11-01`, **IN PROGRESS** on `feat/stage11-career-stories`, `deps: Stages 4, 9, 10` satisfied)

> As built (17 November 2026): stories are derived on demand and never stored (no persisted format change). The projection takes the ordered match facts of `buildHistoricalMatchFactsFromCareer`, the awards ledger, contracts and the lifecycle. Form streaks and contract and board stories are told for the managed club; milestones, youth debuts, awards and retirements league-wide. Every number in a story's text appears in its `factProvenance`, which a unit test checks for every story.

- **Goal**: Surface factual, event-driven career milestones, form streaks, selection/contract pressure, and board/season review story cards derived deterministically from committed career data, with **zero fabricated biographies or hallucinated match claims**.
- **Implementation Plan**:
  1. **Contracts (`packages/contracts/src/career-stories.ts`)**:
     - Define `CAREER_STORIES_SCHEMA_ID = "LC_CAREER_STORIES_PROJECTION_V1"`.
     - Story categories (`CareerStoryCategorySchema`): `MILESTONE_BATTING`, `MILESTONE_BOWLING`, `MILESTONE_FIELDING`, `FORM_STREAK`, `YOUTH_BREAKTHROUGH`, `CONTRACT_TENSION`, `RETIREMENT_WATCH`, `AWARD_RECOGNITION`, `CLUB_BOARD_REVIEW`.
     - Each story card (`CareerStoryCardSchema`) must include: `storyId` (deterministic key, e.g., `${seasonNumber}:${roundNumber}:${category}:${subjectId}`), `seasonNumber`, `roundNumber`, `category`, `headline`, `summaryText`, `subjectPlayerId` (`nullable`), `subjectTeamId` (`nullable`), `linkedMatchKey` (`nullable`, `${seasonNumber}:${fixtureId}` for clickable replay navigation), and `factProvenance` (array of verified stat/award/contract fact key-value pairs proving every claim in `summaryText`).
     - Export from `packages/contracts/src/index.ts`, register in `scripts/generate-schemas.ts`, and run `npm run schemas`.
  2. **Pure Projections (`packages/projections/src/career-stories.ts`)**:
     - Implement `projectCareerStories(input)` reading strictly from `PersistentWorldSaveV1`, `HistoricalStatisticsProjection` (Stage 9), and `CareerAwardsLedger` (Stage 10).
     - Examples of deterministic triggers:
       - Career milestone thresholds crossed in the latest committed round (`500` / `1,000` / `2,000` runs; `25` / `50` / `100` wickets; `15` / `30` fielding dismissals).
       - 3-match form streaks (e.g., `3` consecutive `30+` scores or `2+` wickets, or `3` single-digit scores for a top-5 batter).
       - Contract expiry pressure (key starter in final contract year during rounds `10..14` or pre-season negotiation window).
       - Youth graduate debut or Emerging Youth Award contender.
       - Club board review (table position vs wage cap utilization at mid-season Round 7 and season end Round 14).
     - Never use `Math.random()` or `Date.now()`; use FNV-1a template selection (`packages/projections/src/commentary.ts` pattern) with a cooldown window so headlines never repeat monotonously.
  3. **UI Integration (`apps/web/src/career/service.ts`, `CareerApp.tsx`, `PlayerPage.tsx`)**:
     - Add `getCareerStories(filter?)` on `CareerApplicationService`.
     - Render a **Career Stories & Club Digest** panel on the Career Overview / Season Hub (with category filter + concise/off toggle) and a **Career Timeline & Milestones** feed on `PlayerPage.tsx`, with clickable `View replay` buttons when `linkedMatchKey` is present.
  4. **Verification**:
     - Unit suite `tests/unit/career-stories-stage11.test.ts` verifying every trigger category, fact-provenance accuracy (`0` unbacked numbers), deduplication across reloads, and rebuild parity.
     - Browser E2E suite `tests/ui/career-stories-stage11.spec.ts` on Chromium and Firefox.

### Stage 12 — Fictional scenario mode (`Slice S12-01`, `deps: Stages 5, 6, 7` satisfied)

- **Goal**: Provide a player-facing **Scenario Challenges** mode (tactical chases, middle-order collapses, death-overs defences, red-ball day-5 survival/declarations) using the authoritative `T20`, `ODI`, and `RED_BALL` engines while keeping scenario state and records strictly isolated from career saves.
- **Implementation Plan**:
  1. **Contracts (`packages/contracts/src/scenario-mode.ts`)**:
     - Define `SCENARIO_CHALLENGE_SCHEMA_ID = "LC_SCENARIO_CHALLENGE_V1"` and `SCENARIO_RECORD_LEDGER_SCHEMA_ID = "LC_SCENARIO_RECORD_LEDGER_V1"`.
     - Include curated scenario definitions (`scenarioId`, `title`, `format`: `T20`|`ODI`|`RED_BALL`, `difficulty`: `STANDARD`|`HARD`|`ELITE`, `startingSnapshot` / seed + pre-applied delivery sequence, `objectiveSummary`, `winCondition` rules, `sourceType: "FICTIONAL_CURATED"`).
  2. **Curated Pack & Engine Boot (`packages/data/src/scenario-pack.ts`, `apps/web/src/match/match.worker.ts`)**:
     - Ship 6–8 curated fictional scenarios across `T20`, `ODI`, and `RED_BALL`.
     - Evaluate objective completion deterministically at innings/match end.
  3. **Isolated Persistence (`packages/persistence/src/season.ts`)**:
     - Store personal-best scenario completion records under `projections` key `SCENARIO_RECORDS_V1` (attempts, completions, best margin, seed hash).
     - Verify Stage 9 `projectHistoricalStatistics` explicitly ignores `SCENARIO` match completions.
  4. **UI (`apps/web/src/main.tsx`)**:
     - Add a **Scenarios** mode tab alongside Exhibition and Career, displaying scenario briefing, objective badge in the match header, and completion outcome.
  5. **Verification**:
     - `tests/unit/scenario-mode-stage12.test.ts` + `tests/ui/scenario-mode-stage12.spec.ts`.

### Stage 13 — Historical scenarios and provenance (`Slice S13-01`, `deps: Stage 12 + source permissions/rules review`)

- **Goal**: Layer sourced historical cricket scenarios over Stage 12's scenario runner and `scripts/research/m7k-historical-fixture.ts` with full provenance citations.
- **Gate**: Requires explicit owner sign-off on dataset/source licensing and rare-event rule adjudications (`OWNER_DECISIONS_2026-11-13.md`). Do not bundle unlicensed third-party match data in the repository.

### Stage 14 — Empirical evaluation and rules expansion (`Slice S14-01`, `BLOCKED_EXTERNAL` on `RES-001`..`RES-003`)

- **Goal**:
  1. **Rules Expansion (can be built modularly under a new opt-in ruleset version)**:
     - **Super Overs** for tied limited-overs matches (`T20`/`ODI`),
     - **DLS / Rain-Adjusted Targets** for interrupted limited-overs matches,
     - **DRS Player Reviews** (umpire's call / edge / pitch / impact margins using deterministic delivery trajectory metadata).
     - *Critical rule*: Must use a new match ruleset/schema version so `LC_T20_MATCH_V1` frozen vectors remain 100% bit-exact.
  2. **Empirical Calibration Promotion (`RES-001`..`RES-003`)**:
     - Remains `BLOCKED_EXTERNAL` until historical incident adjudications, an untouched holdout cohort, and an owner-approved dataset are provided (`docs/M7G_RESEARCH_AND_PROMOTION_GATES.md`).

### Stage 15 — Custom competitions and community packs (`Slice S15-01`, `deps: Stages 4, 9, 13`)

- **Goal**: Expand the existing World Editor and `8 MiB` roster pack importer to support custom tournament manifests (`LC_CUSTOM_COMPETITION_PACK_V1`: custom round-robin/group/knockout playoff structures, bilateral/tri-series tours, optional auction/draft rules, international call-up windows) and validated SVG/PNG crest, kit, and ground asset packs.

### Stage 16 — Product-quality acceptance (`Slice S16-01`)

- **Goal**: Collect and store real human & reference-hardware measurements in-repo:
  1. Multi-participant observed playtest sessions using [`docs/PLAYTEST_SCRIPT_STAGE05.md`](PLAYTEST_SCRIPT_STAGE05.md).
  2. Reference-laptop (`LCXXVI_ACCEPTANCE_DIR=... npx playwright test --config playwright.acceptance.config.ts`) and owner-PC (`node scripts/owner-acceptance.mjs --owner-pc`) runs verifying `<= 768 MiB` peak memory (`docs/PERFORMANCE_BUDGETS.md`).
  3. Multi-decade (`20+` seasons) IndexedDB storage and `.lcxxvi` export/import soak benchmarks.
  4. Human screen-reader (NVDA / VoiceOver) walkthrough transcript.

### Stage 17 — Release-candidate preparation (`Slice S17-01`)

- **Goal**: Re-seal `docs/release-v01/RELEASE_RECORD.json` (or `docs/release-v10/RELEASE_RECORD.json`) with updated SHA-256 manifests (`npm run release:record`), verify `npm run package:game` & `LordCricketXXVI.exe` across Windows, Linux, and macOS, and obtain explicit owner deployment sign-off.

---

## 3. Complete AI Maintenance & Upkeep Playbook

### 3.1 First 60 Seconds on Any Session

```sh
git status && git log --oneline -10
npm ci
npx tsc -b
```

> **Why `npx tsc -b` matters:** Workspace packages (`@lcxxvi/contracts`, `@lcxxvi/projections`, `@lcxxvi/persistence`, etc.) resolve via compiled `dist/` outputs in `packages/*/dist`. Skipping `npx tsc -b` after pulling or editing TypeScript files leaves stale `dist/` artifacts that cause confusing runtime/type failures. Remember our Hungarian phrasebook rule: if you skip `npx tsc -b` after pulling or changing a workspace package, **"My hovercraft is full of Eels."**

### 3.2 Runbook: Adding or Modifying a Contract & JSON Schema

1. Create or edit the Zod schema in `packages/contracts/src/<feature>.ts`.
2. Export the module from `packages/contracts/src/index.ts`.
3. Register every exported public schema in `scripts/generate-schemas.ts`.
4. Run:
   ```sh
   npm run schemas
   npm run schemas:check
   ```
5. Update schema count assertions in `tests/unit/contracts.test.ts` and `tests/unit/scoring-fixtures.test.ts` if they assert exact schema counts.

### 3.3 Runbook: Package Dependency & Purity Boundaries (`scripts/check-boundaries.mjs`)

`npm run lint` executes `node scripts/check-boundaries.mjs`, which AST-scans every `.ts` file in all 7 packages:
- **`packages/contracts`**: Only imports `zod`. Zero ambient APIs.
- **`packages/domain`**, **`packages/data`**, **`packages/ai`**, **`packages/projections`**: Only import `@lcxxvi/contracts` (plus `@lcxxvi/contracts/m7j` in `domain`). **Forbidden identifiers**: `window`, `document`, `indexedDB`, `fetch`, `Math.random`, `Date.now`, `new Date`, and dynamic `import(...)`.
- **`packages/simulation`**: Imports `@lcxxvi/contracts`, `@lcxxvi/data`, `@lcxxvi/domain`, and `@noble/hashes/sha2` + `@noble/hashes/utils`. Zero ambient clock/RNG/DOM calls.
- **`packages/persistence`**: Only package allowed `window`, `document`, `indexedDB`, `fetch`.

### 3.4 Runbook: Extending Persistence & `.lcxxvi` Archives Safely

- **Additive projections (like Stage 10 `CAREER_AWARDS_LEDGER_V1` or Stage 11 stories)**:
  - Store under a dedicated key in the existing IndexedDB `projections` object store via `CricketPersistenceRepository` (`packages/persistence/src/season.ts`) so no IndexedDB schema version bump is required.
  - Include as an **optional** hash-checked file entry in `packages/persistence/src/archive.ts` (`exportPersistentWorldArchive` / `importPersistentWorldArchive`) so older `.lcxxvi` archives without the entry still import cleanly.
- **Structural world changes**:
  - Never mutate `LC_T20_SEASON_SAVE_V1`, `LC_PERSISTENT_WORLD_V1`, `V2_LIFECYCLE`, or `V3_ECONOMY` in place. Define a new version identifier and provide a non-destructive copy-on-upgrade path.

### 3.5 Runbook: Windows Double-Click & Portable Packaging Upkeep

- **Files owning the Windows experience**:
  - `Play-Lord-Cricket.bat` (repo root, **must keep `
` CRLF line endings**)
  - `tools/windows/launch-repo.ps1`, `tools/windows/Stop-Lord-Cricket.bat` (`
`), `tools/windows/Create-Desktop-Shortcut.ps1`
  - `tools/windows/LordCricketLauncher.cs` (pure C# 5 / `.NET Framework 4.x` source; **do not use C# 6+ syntax** like `$"..."` string interpolation so built-in `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` compiles it with zero external SDKs)
  - `tools/windows/build-exe.ps1` (`npm run package:windows-exe`)
  - `tools/windows/start-windows.ps1` & `tools/windows/serve-portable.mjs` (bundled into `release-packages/lord-cricket-xxvi-game-<commit>.zip` by `scripts/package-game.mjs`)
  - `start.mjs` (serves `apps/web/dist` on `127.0.0.1:4180`, exposes `GET /__lcxxvi-health` and loopback-only `POST /__lcxxvi-shutdown`)
- **Verification after any packaging/server change**:
  ```sh
  npx vitest run tests/unit/windows-launcher.test.ts
  node scripts/smoke-prebuilt.mjs
  npm run package:game
  ```

### 3.6 Mandatory Verification Pipeline Before Calling Any Work `tested`

```sh
# 1. Full offline core gate (schemas, Vite builds, tsc, eslint + boundaries, scorer fixtures, Python vectors, all unit tests)
npm run verify:09:core

# 2. Browser UI gate (Chromium + Firefox; use MOZ_DISABLE_CONTENT_SANDBOX=1 in Linux containers)
MOZ_DISABLE_CONTENT_SANDBOX=1 npx playwright test --config=playwright.ui.config.ts tests/ui/<stage>.spec.ts tests/ui/accessibility-release-audit.spec.ts

# 3. Release-record & Windows launcher integrity checks
npx vitest run tests/unit/release-record.test.ts tests/unit/windows-launcher.test.ts
node scripts/smoke-prebuilt.mjs
```

> **Cleanup note:** Playwright UI runs write temporary artifacts into `test-results-ui/`. Always remove `test-results-ui/` (`rm -rf test-results-ui`) before committing or running `npm run package:game` so the working tree stays clean.
