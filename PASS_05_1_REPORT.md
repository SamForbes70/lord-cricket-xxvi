# Lord Cricket XXVI Pass 05.1 report

**Overall verdict: BLOCKED.** Pass 05.1 completed inspection, hardening, independent verification and packaging work, but the mandatory clean installation and its dependent production gates could not execute against the pinned dependency set. The baseline is therefore **not frozen as ready for Pass 06**.

## Scope

Pass 05.1 is verification and hardening only. It does not add the Conditional Delivery Generator, complete innings/match orchestration, fictional world data, empirical calibration, AI captaincy, match UI, durable saves or league management.

Authoritative sources are the supplied V0.1 technical design, the Pass 05 source archive, prior pass reports/ADRs and the frozen scoring/deterministic/probability evidence. The technical design requires deterministic random addressing, integer probability mass allocation, separation between model and scorer, and milestone delivery in order.

## Initial repository state

The supplied source archive contains no `.git` directory. Its packaged source identifier is `7804d87ab4b8b244a836effe5badd16359bfdc97` from `COMMIT.txt`. No separate working repository was supplied, so the extracted archive itself was used as the working baseline. No uncommitted user work was overwritten.

Initial inventory:

- package version `0.1.0`, lockfile version 3;
- 84 generated JSON Schemas;
- 87-case scoring corpus: 45 valid delivery observations, 29 invalid-resolution cases, 4 terminal reference cases, 5 clock cases and 4 persistence/NRR reference cases;
- 24 random-address vectors and 8 state-hash vectors;
- 15 probability distribution/sample vectors and 4 cumulative interval boundaries;
- `LC_SCORING_V1`, `SHA256_COUNTER_V1`, `LC_CANONICAL_JSON_V1_SHA256`, `LC_INTEGER_PROBABILITY_V1`, `LC_EXP_LUT_V1` and model `synthetic-alpha-01` / `SYNTHETIC_ALPHA`.

## Baseline integrity

The following frozen artefacts remain unchanged:

| Artefact | SHA-256 |
| --- | --- |
| `package-lock.json` | `345dcb447876aa6f94df9e01d650af7c7153aed3063e28fabf3522e153d7af6e` |
| Scoring corpus | `6c9f256e882a37dad72c0192c965d3314177bbc9c812568c653459268b460345` |
| Scoring index | `0ca2b7885349d506ca0313884c1c1572a269c9c6ebb647f61b308410bc57a19e` |
| Random/state vectors | `cefe36e74c45fea29ccdf4241146c06ec79e85aee71ef4170435c90a238b6da7` |
| Probability vectors | `976e1f4c5b5b8401c743e5b22b4db430e54fb6640424b5813634d77e90118f4d` |
| Complete model pack | `d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab` |
| Exponential LUT | `d0cb73226646dec41e482127fc745ef64213f1c71f898ed7ad8c345ce591f825` |

A pristine-archive comparison shows no changes to source packages, schemas, fixtures, lockfile, model pack or vectors. Pass 05.1 changes are documentation and verification evidence only.

## Defects and hardening changes

### DOC-DRIFT-001: stale capability documentation, corrected

**Found:** README and contract coverage retained earlier-pass statements, including a workspace description that said the simulation package had no probability sampler even though `LC_INTEGER_PROBABILITY_V1` is implemented.

**Why it mattered:** Pass 05.1 requires the repository documentation to describe current capability accurately, and stale wording could cause later agents to understate or duplicate existing functionality.

**Changed:** rewrote README as a current-state document; added `docs/CAPABILITY_MATRIX.md`; corrected the current contract-coverage introduction; added ADR 012; expanded the bounded Pass 06 handoff.

**Regression evidence:** pristine comparison confirms engine/model/schema/fixture bytes were not changed.

**Compatibility:** no deterministic output, schema or public version identifier changed.

### VERIFY-ENV-001: production dependency installation unavailable, open/blocking

`npm ci` was attempted. The registry diagnostic returns DNS `EAI_AGAIN`; `npm ci --offline` confirms the authorised local cache lacks required tarballs, including `zod@4.1.12` (`ENOTCACHED`). The lockfile was not regenerated and no dependency substitution was made.

The dependency vulnerability audit is blocked by the same registry DNS failure.

### VERIFY-RUNNER-002: verification orchestrator did not terminate cleanly in the hung-install environment

A final `node scripts/verify.mjs` attempt became stuck around `npm ci`; the orphaned npm process was terminated. Mandatory commands were then executed individually with external hard limits and complete logs. This is recorded as tooling/environment evidence, not a passing full verification run.

## Actual verification results

Environment: Linux x64, Node v22.16.0, npm 10.9.2, Python 3.13.5. System Chromium reports 144.0.7559.96. Firefox could not be production-verified in this pass because the Playwright dependency/browser prerequisites were unavailable.

| Gate | Actual result | Exit | Evidence |
| --- | --- | ---: | --- |
| `npm ci` | **BLOCKED** | n/a | registry `EAI_AGAIN`; offline cache `ENOTCACHED` |
| `npm run schemas:check` | **BLOCKED** | 1 | `tsx` unavailable because clean install did not complete |
| `npm run build` | **BLOCKED** | 1 | pinned type packages unavailable |
| `npm run typecheck` | **BLOCKED** | 1 | pinned type packages unavailable |
| `npm run lint` | **BLOCKED** | 127 | ESLint unavailable |
| `npm run fixtures:audit` | **BLOCKED** | 1 | `tsx` unavailable |
| `npm run fixtures:engine` | **BLOCKED** | 1 | `tsx` unavailable |
| `npm run vectors:check` | **PASS** | 0 | 24 random addresses + 8 state hashes independently verified |
| `npm run probability:check` | **PASS** | 0 | 1,601-entry LUT, 15 probability vectors, 4 interval boundaries and manual mass identities pass |
| `npm test` | **BLOCKED** | 127 | Vitest unavailable |
| `npm run smoke` | **BLOCKED** | 1 | production Playwright dependency/browser harness unavailable |
| independent 84-schema metaschema check | **PASS** | 0 | 84 Draft 2020-12 schemas plus 8 valid/3 invalid probability payloads |
| 13-schema independent probability mirror | **PASS** | 0 | checked-in structural mirrors match independent generator |
| transpiled production probability source check | **PASS** | 0 | 15 vectors, 4 boundaries, pinned hashes and error guards |
| offline package architecture scan | **PASS** | 0 | 23 package source files; no forbidden imports/nondeterministic production calls found |
| dependency vulnerability audit | **BLOCKED** | 1 | npm audit endpoint unavailable via DNS |

Machine-readable details and elapsed times are in `docs/verification-pass051/results.json`; raw logs are under `docs/verification-pass051/logs/`.

## Architecture and security review

Current source inspection plus the offline architecture gate found no production-package use of `Math.random`, `Date.now`, `new Date`, `Math.exp`, `Math.log`, `performance.now` or `crypto.getRandomValues`. The scorer package has no dependency on simulation/random sampling. AI public-view types explicitly omit seed, draw addresses and future weather. The probability implementation uses the pinned integer LUT and `BigInt` mass arithmetic.

These source/offline findings do not replace the blocked production build, lint, Vitest or browser gates.

## Capability and milestone status

- **M0: PARTIALLY COMPLETE.** Contracts and fixtures exist; the validated fictional world pack has not passed.
- **M1: supported scoring scope implemented, current Pass 05.1 production regression gate BLOCKED.** Historical Pass 03/04 green evidence remains historical evidence only.
- **M2: INCOMPLETE.** No seeded complete T20 match, CLI scorecard and replay/terminal corpus has passed.

Lord Cricket XXVI is not playable in this baseline.

## Residual risks

The canonical Zod/generated-schema drift check, strict AJV compilation, full workspace compiler, ESLint architecture gate, executable scoring regression, Vitest suite and Node/Chromium/Firefox production worker comparisons remain unverified in Pass 05.1. The npm security audit is also unavailable. No claim is made about current browser portability beyond the independent/historical evidence.

The model remains `SYNTHETIC_ALPHA`: its coefficients are provisional and not empirically calibrated cricket statistics. Finite `2^32` mass discretisation can assign zero mass to extremely small positive weights; category order remains part of deterministic tie-breaking. Future orchestration must prevent random-address reuse and must use global attempt ordinals rather than legal-ball counts.

## Acceptance verdict

**BLOCKED.** The repository has been inspected and hardened, independent checks pass, and deterministic/scoring evidence is preserved, but mandatory production gates did not all execute successfully. The baseline is therefore not declared frozen or ready for Pass 06.

The bounded Pass 06 specification is in `docs/NEXT_PASS.md` for use once Pass 05.1 is rerun in an environment with the pinned dependencies and Chromium/Firefox production prerequisites available.
