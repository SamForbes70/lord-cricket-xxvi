# Lord Cricket XXVI Pass 05 report

**Implementation: DELIVERED. Current full release gate: BLOCKED, not PASS.**

**Scope:** Integer Probability Model. **M0: PARTIALLY COMPLETE** pending the validated fictional world pack. **Next:** Pass 06, Conditional Delivery Generator.

Authority: supplied `Lord_Cricket_XXVI_Technical_Design_V0_1(1).docx`, Sections 6 to 9 and Appendix F, plus the Pass 04 handoff. Implementation continues the archived Pass 04 source. This is a versioned categorical stage sampler, not a playable match, complete delivery generator or calibrated cricket model.

## Delivered

- `LC_INTEGER_PROBABILITY_V1` ordered, signed fixed-point feature/coefficient multiplication at scale 10,000. Each product is rounded nearest with ties away from zero; accumulate intercept and terms in source order using `BigInt`; clip once to [-80,000,80,000]. Non-integral and out-of-range request inputs are rejected at the strict boundary.
- Pinned, offline-generated 1,601-entry integer exponential LUT for logit deltas [-16,0] in 0.01 steps, with integer scale 10^12. Runtime code does not call `Math.exp` or perform floating-point categorical normalisation. The model and complete LUT are SHA-256 pinned and verified before use.
- Explicit category eligibility, zero-weight support, failure for an empty positive mask, and `BigInt` weighted mass division to **exactly 2^32**. Largest-remainder allocation gives ties to the earlier caller-supplied category index; masked categories retain position and zero mass. An unsigned integer draw is compared with cumulative intervals in [0,2^32), skipping zero-mass entries.
- Strict versioned normalise/sample requests and pack/feature schemas. The sample request includes a validated `SHA256_COUNTER_V1` address and must match the declared stage name. The caller owns the global attempt ordinal and unique variable draw indices; the service owns no mutable counter.
- `synthetic-alpha-01` model pack with the V0.1 Appendix F2 neutral legality weights and coefficient adjustments; all seven Appendix F3 format/phase contact rows and coefficient adjustments. Typed `legalityCategories()` and `contactCategories()` builders use the pinned pack. Effective movement is an already-resolved input: pitch/fatigue generation and the complete conditional tree are deferred.
- 13 additive strict Zod contracts and checked-in Draft 2020-12 structural schema mirrors, bringing the source total to **84**. The prior 71 schema files remain unchanged. Generated Zod schema parity and AJV checks are **not claimed as passing today** because dependencies were unavailable.
- New compiled CLI command paths (`probability`, `sample-category`), shared browser worker adapter, production React capability disclosure with `SYNTHETIC_ALPHA` badge, expanded Node/Chromium/Firefox test sources, frozen Python reference vectors, ADR 011, reproducible checks and updated next-pass handoff.
- Unchanged Pass 02 scoring corpus and Pass 04 deterministic vector corpus. Preserved prior verification history separately in `docs/verification-pass04/`.

## Model pinning

| Item | Pinned value |
| --- | --- |
| Model ID / status | `synthetic-alpha-01` / `SYNTHETIC_ALPHA` |
| Probability version | `LC_INTEGER_PROBABILITY_V1` |
| RNG version | `SHA256_COUNTER_V1` |
| LUT version | `LC_EXP_LUT_V1` |
| LUT SHA-256 | `d0cb73226646dec41e482127fc745ef64213f1c71f898ed7ad8c345ce591f825` |
| Complete model-pack SHA-256 | `d47d5caca955b7a374b0052d712b1674bca6d855e222194ce9f0587d8580b7ab` |

Model hash covers the full table, coefficients, baselines, feature rules and manifest. These are synthetic design coefficients, not fitted to observations.

## Actual verification on 25 September 2026

**Environment:** Linux x64, Node v22.16.0, globally installed TypeScript 5.8.3 and Python 3. npm installation did not complete in this restricted container; current production installation/build/type-check/ESLint/Vitest/Playwright gates **cannot be reported as passing**. The first npm installation attempt returned `npm error Exit handler never called!`, while an npm registry ping separately returned DNS `EAI_AGAIN`. A later npm installation attempt also failed. The normal `verify.mjs` run was attempted but timed out before completing; the recorded fallback manifest explicitly identifies the failed installation and blocked dependent gates.

| Gate | Current result | Evidence |
| --- | --- | --- |
| `npm ci` | **FAIL** | `docs/verification/installation.log` from actual failed attempt |
| Zod schema drift / workspace build / full type-check / ESLint | **BLOCKED** | Dependency installation incomplete; `docs/verification/results.json` |
| Existing scoring fixture audit and executable scorer comparison | **BLOCKED** | Existing corpus byte-identical to Pass 04; historical Pass 04 gates were previously green, not rerun today |
| Existing random/vector reference | **PASS** | Python independently verifies 24 addresses and 8 state hashes |
| Independent probability reference | **PASS** | Python `Decimal` and `Fraction`: 1,601 LUT entries, 15 category/sample vectors, 4 interval endpoints, fixed manual identities |
| Structural probability schema mirror | **PASS** | 13 new Draft 2020-12 schema files byte-stable against the independent generator |
| Independent Python JSON Schema metaschemas | **PASS** | All 84 schemas conform to Draft 2020-12; 8 positive and 3 negative boundary inputs checked |
| Transpiled production algorithm with dependency shims | **PASS** | Actual `probability.ts`: all 15 independent category/draw vectors, 4 endpoint checks, pinned hashes, 4 error guards |
| Isolated strict probability TypeScript check | **PASS (limited)** | Production probability source plus actual generated pack checked using contract-shaped TypeScript stubs; not the full workspace |
| Offline package architecture boundary check | **PASS** | 23 package source files, no new forbidden dependencies or nondeterministic calls |
| Pass 04 source regressions | **PASS (byte integrity only)** | Old 71 schemas, scoring corpus/index and random vectors unchanged |
| Vitest and Node/Chromium/Firefox smoke execution | **BLOCKED** | Source tests added, but not executed on the unavailable production dependencies |

All machine-readable evidence is under `docs/verification/`; `offline-results.json` contains seven offline test gates and source-file hashes, while `results.json` distinguishes successful reference gates from unavailable production gates. No claim is made about browser agreement **in this new pass** until the Playwright tests execute successfully.

## Self-critique and remaining work

The algorithm is exercised on the actual transpiled TypeScript source with strict external-dependency shims, which is useful evidence but **does not substitute** for executing the pinned Zod parsers, SHA package, full workspace compiler, AJV, ESLint, Vitest or real browser worker. The Python schema mirror must be checked against Zod-generated output once `npm ci` succeeds; run `npm run schemas`, inspect any real differences, then rerun all gates. Build and smoke coverage remains open.

Finite 2^32 discretisation can allocate zero mass to an extremely unlikely but positive-weight category; this is explicit and tested. Exact category order affects remainder ties, so callers must freeze stage category order. Addresses are stateless, but this service cannot tell whether a caller reused one address for a second variable or substituted legal-ball count for global delivery-attempt index. Future stage orchestration must own those invariants.

Neither artificial baseline probabilities nor tactic coefficients are empirically calibrated. There is no match-level distribution or benchmark report, full delivery tree, red-ball match clock, weather generator, fictional roster, event hash-chain verification, durable persistence, replay coordinator, DLS engine or playable game in Pass 05. The existing supplied-delivery scoring engine remains the sole implemented scoring authority.

## Reproduction

After registry access is restored:

```sh
npm ci
npx playwright install chromium firefox
node scripts/verify.mjs
npm run batch -- probability tests/fixtures/probability/request-normalise.json
npm run batch -- sample-category tests/fixtures/probability/request-sample.json
```

Independent checks that ran without workspace dependencies in this container:

```sh
python3 scripts/offline-verify.py
node scripts/offline-probability-check.mjs
python3 scripts/check-determinism-vectors.py
python3 scripts/reference_probability.py
```

The offline checker requires a local or global TypeScript installation; its optional independent schema validator requires Python `jsonschema`. The normal installer, schema generator and browser tests require the pinned npm dependencies and browser binaries. Never interpret a successful offline check as approval to enable gameplay.

**Next pass:** Conditional Delivery Generator. Implement staged legality, length, contact, sector, masked dismissal, fielding and running with strict per-variable draw allocation and hand off validated resolutions to `LC_SCORING_V1`. Continue to mark M0 partial until a validated world pack exists.
