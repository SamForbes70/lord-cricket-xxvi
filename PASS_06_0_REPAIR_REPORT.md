# Lord Cricket XXVI: Pass 06.0 Production Repair and Baseline Verification

**Release acceptance: PASS for the bounded Pass 05.1/Pass 06.0 supported source scope.**  
**Verification:** 2026-09-26T09:44:51.420Z (UTC). Native `node scripts/verify.mjs` returned exit 0.  
**Original supplied Pass 06 source commit:** `2ae271c3b5e304ee1fe087be2bfc37bb47fd2bb0`.  
**Exact repaired source commit and tree:** recorded in the companion verified baseline manifest and ZIP commit comment.  
**M0: PARTIALLY COMPLETE. M1: COMPLETE for verified supplied-delivery scoring scope only. M2: INCOMPLETE. The game is not playable.**

## Repair result

The container could not resolve the npm registry and its authorised cache was empty. Using the expressly approved isolated temporary branch `lcxxvi-npm-recovery-20260926` in the private `SamForbes70/desktop-tutorial` repository, two GitHub Actions runs fetched the exact pinned Linux x64 npm dependency cache and Playwright 1.56.0 browser binaries. SHA-256 manifests were checked locally before installation and testing. The original repository's `main` branch was not modified; the cricket source was not copied to the unrelated GitHub repository. `npm ci` installed the pinned dependencies offline. The original lockfile SHA-256 is unchanged: `44e63e6db495d897f28cda25e4338839abded362cdeaa84b6bd8a5f0ddcd17df`.

Fresh production execution exposed implementation and test defects formerly hidden by the blocked install. These were repaired without modifying frozen scorers, random algorithms, probability arithmetic, synthetic coefficients, fixture expectations or public deterministic version identifiers. This repair pass does not implement complete innings, a roster, career play or a match UI.

## Actual final verification

**Environment:** Linux x64, Node v22.16.0, npm 10.9.2, pinned TypeScript 5.9.3, Playwright 1.56.0, Chromium 141.0.7390.37, Firefox 142.0.1. Firefox ran with its content sandbox enabled. The root-owned test-container HOME was set to `/root` because the inherited HOME belonged to another user. The browser bundle was SHA-256 verified, and the default Playwright browser versions were used (no custom executable override in the acceptance run).

The following gates all executed **in the same final native repository verification run**, with logs and machine-readable exits under `docs/verification-pass06-native/`:

| Command | Result | Exit code | Elapsed |
|---|---|---:|---:|
| `npm ci` | **PASS** | 0 | 3,725 ms |
| `npm run schemas:check` | **PASS** | 0 | 1,092 ms |
| `npm run build` | **PASS** | 0 | 6,123 ms |
| `npm run typecheck` | **PASS** | 0 | 5,173 ms |
| `npm run lint` | **PASS** | 0 | 4,613 ms |
| `npm run fixtures:audit` | **PASS** | 0 | 1,192 ms |
| `npm run fixtures:engine` | **PASS** | 0 | 1,260 ms |
| `npm run vectors:check` | **PASS** | 0 | 1,786 ms |
| `npm run probability:check` | **PASS** | 0 | 1,739 ms |
| `npm run generator:check` | **PASS** | 0 | 1,747 ms |
| `npm test` | **PASS** | 0 | 8,208 ms |
| `npm run smoke` | **PASS** | 0 | 24,400 ms |

- **Schemas:** all 88 exact Zod-generated Draft 2020-12 JSON Schemas pass source byte drift checks, with independent strict AJV compilation in Vitest. The 84 previous schema files remain byte-identical.
- **Scoring:** the complete 87-case fixture corpus audits successfully. The production scorer matches all **45 authored delivery observations** and **45 ledger observations**, and rejects all **29 invalid resolutions**. The remaining 13 terminal/clock/persistence references remain explicitly **NOT_IMPLEMENTED**, not gameplay evidence.
- **Random:** 24 independently generated random-address and 8 state-hash reference vectors pass; compiled Chromium and Firefox main-thread and Web Worker outputs agree with Node.
- **Probability:** the independently generated 1,601-entry LUT, 15 mass/sample cases and 4 interval boundaries pass; compiled browser worker sampling agrees with Node.
- **Delivery generator:** 9 independent reference fixtures and 48 stage-address draws pass, along with the bounded generator/scorer integration tests and compiled Node/Chromium/Firefox main-thread/worker equivalence.
- **Vitest:** 342/342 passing tests across 8 files. **Playwright:** 12/12 passing smoke tests across Chromium and Firefox, including the disabled gameplay shell, compiled CLI and rejection/recovery checks.
- **Architecture:** all seven package dependency/ambient API boundaries pass. No unapproved major dependency upgrade or public random/probability/scoring version change was made.

## Corrected defects and why they mattered

1. **`schema-drift`:** two newly created Pass 06 JSON Schema mirrors differed from actual Zod output. They were regenerated with pinned Zod 4.1.12, leaving the other 86 files unchanged and, specifically, all 84 inherited schemas byte-identical. Exact generation and strict AJV compilation now pass.
2. **`generator-literal-narrowing`:** the contact variable was inferred as the `WIDE` literal after assignment, causing fourteen TS2367 errors even though non-wide branches are valid. It now uses an explicit complete contact-type union. Independent frozen draws and category outcomes remain unchanged.
3. **`contract-test-revision`:** a historical test asserted command `expectedRevision=84`, while the unchanged frozen command fixture actually contains `82`. The assertion was corrected to the fixture's value rather than modifying the fixture.
4. **`schema-count-test`:** historical tests expected 84 exported schemas. They now assert 88, including four Pass 06 additions.
5. **`ajv-duplicate-id`:** a test compiled the same `$id` twice into a shared AJV instance. The validator now reuses the compiled schema via `getSchema` before compilation.
6. **`lint`:** removed an unused type import and unused smoke mapper index, and explicitly imported `Buffer` for the supplemental offline verifier. ESLint and architecture checks now pass.
7. **`stale-capabilities`:** the batch smoke assertions, fixture audit successor label, README, runtime status, React disclosure, capability matrix and Pass 07 handoff now distinguish a production-verified **one-shot generator** from the absent complete-match engine.
8. **`browser-environment`:** the container's managed system Chromium blocks localhost, and the exact Playwright browser binaries were initially absent. The correctly pinned Chromium and Firefox builds were fetched via GitHub, hash-checked and used unchanged. Firefox's first launch was rejected because the root process inherited another user's HOME; ownership-correct HOME resolved this without disabling sandboxing. The optional executable path in the Playwright config is only a test diagnostic facility, not part of the accepted run.

## Source integrity and compatibility

`docs/verification-pass06-native/source-integrity.json` verifies the unchanged lockfile, scoring corpus and index, random vectors, probability vectors and original probability-pack source against the original Pass 06.0 manifest. Exactly two of the **four new Pass 06** schema mirrors were regenerated; the **84 inherited** schema files were not changed. The synthetic model remains `synthetic-alpha-01` with `SYNTHETIC_ALPHA` status, the stage pack remains `synthetic-alpha-01-delivery-v1`, and `LC_SCORING_V1`, `SHA256_COUNTER_V1`, `LC_INTEGER_PROBABILITY_V1` and `LC_CONDITIONAL_DELIVERY_V1` retain their identifiers and frozen behavioural vectors.

The final snapshot is recorded by its complete Git SHA and source archive checksum in the companion baseline manifest. Earlier Pass 01 through Pass 06 historical reports and failure evidence are retained separately rather than rewritten to pretend they passed at the time.

## Residual risks, exclusions and next pass

This is a **functional acceptance PASS for the specified bounded engine slice**, not a certification of statistical realism, all cricket laws or complete-match replay. The fictional world pack has not passed M0; complete seeded T20 match/scorecard/replay orchestration is not implemented, so M2 remains incomplete. Other operating systems and WebKit were not tested. An offline `npm audit` returned zero cached findings, but a **current online vulnerability audit was unavailable** from this execution container and is not represented as passed.

The Pass 07 handoff now defines bounded seeded T20 match orchestration and separately gated fictional roster/world acceptance. New full-match tests and replay fixtures are necessary before the game can be described as playable.
