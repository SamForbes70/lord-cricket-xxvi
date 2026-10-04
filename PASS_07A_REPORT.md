# Lord Cricket XXVI | Pass 07A complete M0 | Implementation, smoke and independent testing report

**Acceptance: PASS** on 2026-09-27T02:26:12.151Z; 16/16 mandatory gates executed and passed on the final code snapshot, after the final implementation and verification-script fixes. **M0: COMPLETE. M1: verified for the supported supplied-delivery scoring scope. M2: INCOMPLETE.** The application is not playable. This PASS does not imply statistical realism or a release-ready game.

## 1. Source authority, preserved baseline and mandate

Authority: the original *Lord Cricket XXVI Technical Design V0.1*, especially sections 1, 4 to 6, 16, 22 to 25 and Appendices A, B, E and G, and the previously reviewed Pass 07A specification. Input is the **actual** repaired/verified Pass 06.0 archive, not a reconstructed repository. Original archive SHA-256: `95e71cb5aae066885f73594d788e6df2edc54b4a1a6a49c12b365cc104af5648`. Original packaged upstream commit: `484ac3ed56a1ffbd99c858fb34c8487e3a529b35`. That archive excluded Git internals; Pass 07A imported it into an isolated local Git working tree. The final Pass 07A local commit is identified in the separate final baseline manifest, not conflated with the upstream packaged commit.

The original architecture remains: domain scorer independent of random generation, fixed-address stateless SHA-256 sampling, integer categorical probability, additive frozen synthetic model/stage packs, and typed validation boundaries. Pass 07A only delivers the immutable fictional world and strict fixture-only T20 pre-toss bootstrap. It does **not** bowl a ball, run a complete innings, persist a game or enable the Play button.

## 2. Deliverables implemented

* Static `packages/data/worlds/fictional-eight-01.json` with 160 original fictional players, eight disjoint 20-player squads and eight grounds. Each player has independent T20/ODI/RED_BALL skill profiles, eight non-negative shot-sector weights with a strictly positive total, accepted `stock` variation and FICTIONAL provenance. Every exposure counter is zero. No real-player dataset was imported or inferred.
* Versioned, **offline-only** generator `scripts/generate-fictional-world.py` using fixed seed `lcxxvi-fictional-eight-v1-20260927`, deterministic six-position SHA256_COUNTER_V1 `WORLD_GENERATION` addresses and rejection sampling for bounded draws. The published JSON is a static runtime asset, never regenerated in a match. Generator `--check` reproduces the world, manifest and 12 independent random vectors byte for byte.
* Separate strict `DefaultWorldManifestSchema` and exact default-world `validateDefaultWorld` semantic validator: full cross-reference, provenance and raw/canonical hash checks, 160 unique globally assigned players, two keepers and six bowling-capable players minimum per squad, right/left batting and bowling variety, eight unique home-ground mappings, complete ratings and approved rules/model/stage identifiers. The existing generic WorldPack import boundary was left unchanged.
* Two additional strict contracts `T20TeamSelectionSchema` and `T20MatchSetupRequestSchema`. `LC_T20_SETUP_V1` verifies the exact pinned world bytes, two different team XIs of precisely 11 own-squad players each, a selected eligible wicketkeeper and captain per XI, at least five bowling-capable players per XI, selected ground, approved `LC_T20_01` rules, original synthetic model and stage pack hashes. Unsupported predictions and game capabilities are explicitly rejected. The result is a deep-copied, transitively frozen **fixture-only** pre-toss setup, not a playable match or mutable MatchState.
* Compiled CLI commands `validate-world` and `setup-t20` plus additive test suites, three additive generated JSON Schema mirrors, production Node/Chromium/Firefox worker smoke tests, independent audit, 40 authored negative fixtures, current documentation and ADR 015/016. CI now invokes the complete 07A gate, not merely the inherited 12-gate pipeline.

## 3. World composition and ground mappings

| Stable team ID | Fictional team | Players | Keepers | Bowling-capable | Home ground |
| --- | --- | ---: | ---: | ---: | --- |
| `team-01` | Aster Harbour | 20 | 2 | 9 | Aster Quay |
| `team-02` | Copper Vale | 20 | 2 | 9 | Copperfield |
| `team-03` | Northlight Ridge | 20 | 2 | 9 | Northlight Park |
| `team-04` | Westmere Isles | 20 | 2 | 9 | Westmere Oval |
| `team-05` | Ember Plains | 20 | 2 | 9 | Ember Meadow |
| `team-06` | Silver Fen | 20 | 2 | 9 | Silverfen |
| `team-07` | Larchwood | 20 | 2 | 9 | Larchwood Ground |
| `team-08` | Moonstone Bay | 20 | 2 | 9 | Moonstone Fields |

Independent audit found 160 assigned unique player IDs for 160 player objects and exact eight squads/grounds. The approved model remains `SYNTHETIC_ALPHA`, with no fabricated matches or empirical skill calibration.

## 4. Cryptographic and schema integrity

| Frozen asset / identifier | Verified value |
| --- | --- |
| World pack | `fictional-eight-01` |
| World file UTF-8 SHA-256 | `0136173903ba42a199c84a17407cf711c2caf1b57c52472abb52e9be7a6d8257` |
| Canonical JSON world SHA-256 | `f4cbe33f4a2ea41385143cc03ab6d64e94a356f8af75e30483a68de87bdca252` |
| Generator Python source SHA-256 | `a3aaa4b64926ad9859f84222eb51274e7881df750308c2e9ae8fd1fa66e2f4da` |
| Fictional provenance SHA-256 | `97c7a43de0937ce85dcc03c3cddbd2a1be67b99b8af2f0099391bb7c39562982` |
| World seed | `lcxxvi-fictional-eight-v1-20260927` |
| Exact previous lockfile SHA-256 | `44e63e6db495d897f28cda25e4338839abded362cdeaa84b6bd8a5f0ddcd17df` |
| Original scoring corpus SHA-256 | `6c9f256e882a37dad72c0192c965d3314177bbc9c812568c653459268b460345` |
| Original random vector SHA-256 | `cefe36e74c45fea29ccdf4241146c06ec79e85aee71ef4170435c90a238b6da7` |
| Original probability vector SHA-256 | `976e1f4c5b5b8401c743e5b22b4db430e54fb6640424b5813634d77e90118f4d` |
| Original probability model ID/hash | `synthetic-alpha-01` / `d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab` |
| Original generator stage pack ID/hash | `synthetic-alpha-01-delivery-v1` / `34efa3037702e44a134ea38b414eab3e97c6f79f10b3e5458bc2ab05412e5d7a` |
| Original random service version | `SHA256_COUNTER_V1` |
| Published generator reference vectors | 12, independently recomputed using Python hashlib |
| Generated schemas | 91 current, including 3 additive; all 88 inherited schema bytes unchanged |

The independent source comparison reported `PASS` with no hash mismatches across the old schema set, lockfile, frozen scoring corpus/index, random and probability vectors, and original model/stage pack source. No npm dependency was added, no original scoring golden expectation was edited, and no existing engine, random, probability, generator or rules version was changed.

## 5. Actual final mandatory acceptance gates

Command: `npm run verify:07a`, invoked with the exact recovered Linux x64 pinned npm cache and Playwright 1.56 browser binaries. Its orchestrator runs all 12 inherited production checks, then four new world/immutability checks. Each gate records its real command, exit code, elapsed time and full unabridged log. The final run completed with exit code **0**.

| Gate | Executed command | Status | Exit | Seconds |
| --- | --- | --- | ---: | ---: |
| `installation` | `npm ci` | **PASS** | 0 | 1.353 |
| `schemas` | `npm run schemas:check` | **PASS** | 0 | 0.329 |
| `build` | `npm run build` | **PASS** | 0 | 2.234 |
| `typecheck` | `npm run typecheck` | **PASS** | 0 | 2.157 |
| `lint` | `npm run lint` | **PASS** | 0 | 1.834 |
| `fixtures` | `npm run fixtures:audit` | **PASS** | 0 | 0.354 |
| `scorer` | `npm run fixtures:engine` | **PASS** | 0 | 0.391 |
| `vectors` | `npm run vectors:check` | **PASS** | 0 | 0.657 |
| `probability-vectors` | `npm run probability:check` | **PASS** | 0 | 0.632 |
| `generator-vectors` | `npm run generator:check` | **PASS** | 0 | 0.591 |
| `unit` | `npm test` | **PASS** | 0 | 2.725 |
| `smoke` | `npm run smoke` | **PASS** | 0 | 8.260 |
| `world-content` | `npm run world:check` | **PASS** | 0 | 2.061 |
| `world-negative` | `npm run world:negative` | **PASS** | 0 | 1.185 |
| `t20-setup` | `npm run t20:setup` | **PASS** | 0 | 1.225 |
| `world-smoke` | `npm run world:smoke` | **PASS** | 0 | 3.770 |

**Current runtime:** Linux x64; Node v22.16.0; npm 10.9.2; Playwright 1.56.0; Chromium 141.0.7390.37 and Firefox 142.0.1. `MOZ_DISABLE_CONTENT_SANDBOX` was not set; the Firefox content sandbox remained enabled. The dedicated browser checks ran production-compiled browser/worker code, not just TypeScript source or off-line stubs. Inherited scripts continue to report M0 partial when run **alone**, because those 12 checks cannot close M0 without the separate four world checks. The combined 16-gate `pass07a-results.json` is the authoritative M0 acceptance record.

### Regression and unit evidence

* **390/390 unit tests passed across 10 files.** These include 28 focused world/manifest tests and 20 focused T20 setup tests; historic tests, including scorer and generator assertions, remain green.
* Historical Pass 02: 87-case corpus integrity passes. All 45 executable valid-delivery outcomes, 45 corresponding ledger observations and 29 invalid resolutions match production scorer behaviour. Four aggregate terminal, five clock and four persistence/NRR reference cases remain **NOT IMPLEMENTED**, even though their fixture structure is audited.
* Pass 04 random/state vectors, Pass 05 probability/interval vectors and Pass 06 conditional-generator fixtures all pass unchanged.
* Additional **40 authored negative fixtures** comprise 16 malformed worlds, 7 malicious or inconsistent manifests and 17 rejected setups. They cover cross-team duplicate memberships, insufficient keepers or bowlers, missing format profiles, non-integer/out-of-range skill ratings, dangling IDs, incorrect provenance, tampered raw/canonical hashes, wrong rule/model/stage versions, invalid XIs, foreign players and unsupported capabilities.
* The independent Python world audit validates all 160 players/three format profiles, checks exactly 8×20 unique squad assignments, every home-ground link, 12 fixed address vectors and byte-identical regeneration. The compiled production Node validator checks all 91 JSON Schemas with **strict AJV**, then successfully accepts the frozen world and two 11-player XIs.

### Smoke and browser evidence

**15/15 production smoke tests passed** using Chromium and Firefox: application shell command validation, correct M0 status and disabled gameplay, all 100/115/125/150 per cent text scales and narrow viewport; compiled batch command acceptance/rejection and supplied-delivery scorer; random/state/probability/conditional-generator outputs in Node/browser/dedicated worker; 12 published WORLD_GENERATION address vectors in Node/Chromium/Firefox; compiled `validate-world` and `setup-t20` accept the true signed world and reject tampering. The current React shell screenshot was captured and visually inspected. The three **additional** world smoke tests (Chromium 2, Firefox 1) also passed independently. No complete match, save, ODI session or league game was smoke-tested because those features do not exist yet.

## 6. Failed attempts, defect correction and self-critique

1. **07A integration test harness:** A new AJV test initially tried compiling an already registered schema twice; fixed the test to retrieve the cached schema first. TypeScript strict checking also found possibly undefined XI index assertions in tests; fixed with explicit non-null assertions after positive preconditions. These corrections only affect tests.
2. **Outdated schema-count expectations:** Two inherited unit tests still asserted 88 schemas after adding three new strict 07A contracts. Updated them to 91; independently proved the old 88 schema files remained byte-identical. No old JSON Schema was regenerated or weakened.
3. **Verification-script lint error:** The first 16-gate execution reported 15/16 PASS. ESLint correctly rejected two implicit global `performance` references in the new orchestrator. Imported `performance` from `node:perf_hooks`, reran the complete pipeline and obtained 16/16 PASS. The first failure remains documented; final success is a fresh run, not a partial merge of historical gate results.
4. **Documentation and CI drift:** Updated the README, current capability matrix, contract coverage map, disabled-play shell and CI workflow from Pass 06/M0 partial to a truthful current 07A/M0-complete view. CI runs `npm run verify:07a`, not just the inherited 12 gates. CI configuration was inspected; a new hosted CI execution is not claimed in this local report.
5. **Architecture review:** No old random/stage/model/scoring source was modified. Default-world strictness is confined to the frozen default pack; arbitrary user-import world acceptance remains subject to its separate generic schema and is not mistakenly advertised as this exact world. The T20 setup returns a cloned, deep-frozen fixture object, but immutable in-memory objects are not a durable save or a replay coordinator.

## 7. Residual risks and release boundary

* The generator creates original synthetic ratings and variety but has **not** passed empirical calibration, comparative season-balance analysis, playability testing or real-cricket statistical validation. The synthetic-alpha badge stays visible.
* `LC_T20_SETUP_V1` builds no toss, innings, running state, match clock, bowling/field decision cycle or event persistence. All those remain Pass 07B or later. A valid fixture snapshot proves neither cricket-law conformance beyond existing narrow scorer fixtures nor a playable match.
* This verification covers Linux x64, Node v22.16.0, Chromium 141 and Firefox 142. Safari/WebKit and non-Linux operating systems were not tested. The fresh online dependency vulnerability audit was not performed here because the verified dependency recovery is offline; absence of a reported advisory is not a vulnerability-clearance claim.
* The current browser shell is an engineering capability view, **not** a match UI. M2 full-match seeds, cross-runtime complete-match replay and terminal-result fixtures cannot be claimed until Pass 07B genuinely implements and executes them.

## 8. Milestone decision, reproduction and next handoff

**PASS 07A; M0 COMPLETE** under the source scope above and all 16 successfully executed gates. **M1: verified for supported supplied-delivery scoring only. M2: INCOMPLETE.** No DLS or real-player data is enabled. Use the separately hashed Pass 07A committed source archive, final manifest and all current verification logs to start **Pass 07B, seeded complete T20 match orchestration**, following `docs/NEXT_PASS.md`; recheck the exact world and source hashes before implementing M2.

Full logs and machine-readable gate results: `docs/verification-pass07a/`. Published world and immutable manifest: `packages/data/worlds/`. Negative mutation input: `tests/fixtures/world/negative-cases.json`. Source review: ADR 015 and ADR 016. Historic previous-pass reports remain in the repository.
