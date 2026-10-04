# Lord Cricket XXVI Pass 04 report

**Result: PASS for Deterministic Random Service. M0 remains partially complete.**

Authority: Lord_Cricket_XXVI_Technical_Design_V0_1(1).docx, V0.1, section 6 and the Pass 03 handoff. Baseline commit: 0b19ac6da32325192e74117ee8518ac4c33d1354. This pass implements deterministic primitives, not a probability model or playable match.

## Delivered

- Synchronous, stateless SHA256_COUNTER_V1 service in packages/simulation. Fixed six-position JSON address, UTF-8 encoding, SHA-256, first four bytes as unsigned big-endian, and exact division by 4294967296 for the half-open unit interval.
- All seven existing random domains, explicit stage and draw index, strict address validation and rejection of unsupported versions. Calls do not advance a shared counter.
- LC_CANONICAL_JSON_V1_SHA256 state hasher and explicit canonical byte encoder, preserving the existing valid-JSON encoding. Hidden own properties are now rejected instead of silently omitted.
- Pinned synchronous @noble/hashes 1.8.0 dependency and lockfile. Production imports only its SHA-256 and encoding helper subpaths; no Node crypto fallback.
- Three strict runtime request contracts and generated JSON Schemas, bringing the total to 71. The previous 68 schema files retain their bytes.
- Compiled batch `random` and `hash-state` commands, dedicated worker adapter, separate browser verification harness, updated capability shell, README and ADR 010.
- Frozen independent vectors, Python verification script, Node tests and Chromium/Firefox worker agreement tests.

## Actual verification

Final run: 2026-09-24T13:09:22.436Z. Linux x64, Node v24.19.0, npm 11.9.0.

Executed command in this container: `MOZ_DISABLE_CONTENT_SANDBOX=1 node scripts/verify.mjs`. The setting applies to the local Firefox test process and is recorded in the results manifest. Normal environments should keep the default browser sandbox. Logs are under docs/verification; previous Pass 03 logs are retained under docs/verification-pass03.

| Gate         | Command                   | Exit | Result | Seconds |
| ------------ | ------------------------- | ---- | ------ | ------- |
| installation | `npm ci`                  | 0    | PASS   | 3.431   |
| schemas      | `npm run schemas:check`   | 0    | PASS   | 0.802   |
| build        | `npm run build`           | 0    | PASS   | 7.232   |
| typecheck    | `npm run typecheck`       | 0    | PASS   | 3.451   |
| lint         | `npm run lint`            | 0    | PASS   | 2.347   |
| fixtures     | `npm run fixtures:audit`  | 0    | PASS   | 0.668   |
| scorer       | `npm run fixtures:engine` | 0    | PASS   | 0.775   |
| vectors      | `npm run vectors:check`   | 0    | PASS   | 0.365   |
| unit         | `npm test`                | 0    | PASS   | 3.378   |
| smoke        | `npm run smoke`           | 0    | PASS   | 8.437   |

**300 unit tests passed across six files**, including 44 new deterministic-service tests. **Six app/runtime smoke tests passed**: three existing shell/scoring checks, one batch random/hash check, and one complete vector suite in each browser.

| Runtime                | Verified result                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Node v24.19.0          | All 24 address vectors and eight canonical state vectors match; independent Node crypto checks also pass |
| Chromium 141.0.7390.37 | All 32 vectors match in main thread and dedicated worker                                                 |
| Firefox 142.0.1        | All 32 vectors match in main thread and dedicated worker                                                 |
| Python hashlib         | All 32 frozen byte/digest vectors independently verified                                                 |

The unit suite also matches three published NIST SHA-256 constants: abc, the standard multi-block message and one million a characters. Additional checks cover padding boundaries, endpoint unit conversion, unsigned high-bit results, Unicode and lone-surrogate escaping, maximum counters, invalid inputs, getter rejection, caller immutability, insertion-order independence, array-order sensitivity, repeated calls and domain/stage/index separation. Browser workers reject an unsupported request, then continue to return the same original draw after a prediction-domain request.

The production React shell was smoke-tested and its screenshot visually inspected. It still disables gameplay and names unimplemented capabilities.

## Scoring regression evidence

All 45 frozen delivery observations and all 45 ledger observations still match. The production scorer rejects all 29 invalid fixtures. The Pass 02 corpus and index remain byte-for-byte unchanged. The remaining four aggregate-result, five clock and four persistence/NRR cases are reference-only and are still reported as NOT_IMPLEMENTED. This pass does not convert those schema checks into implementation claims.

## Self-critique, failures and resolution

Initial compilation exposed a missing explicit TypeScript parameter annotation and required JSON import attributes under NodeNext. Both were corrected before final verification. Schema-count assertions were updated from 68 to 71 for the three new contracts.

Review identified that canonical JSON could silently omit non-enumerable own properties. The boundary now rejects them, including decorated arrays. Ordinary valid JSON retains the same canonical bytes and hash version. Tests confirm getters are not invoked.

The first Firefox smoke attempt timed out while creating a page. Browser diagnostics showed denied user-namespace setup and crashing content processes. A scoped local-test setting allowed the browser to run; the final Firefox suite passed. The application does not disable browser sandboxing. npm proxy and colour-setting warnings remain non-fatal in the raw logs.

Expected digests were frozen independently using Python hashlib, not generated by production TypeScript. Canonical state strings were specified manually. Cross-runtime agreement alone would not establish correctness if all runtimes shared the same error, so standard constants and independent byte expectations are part of the gate.

The service cannot identify accidental reuse of an address for two different variables, nor prove that a caller supplied a global attempt ordinal instead of legal-ball count. Those remain explicit orchestration responsibilities. Distinct addresses are not a promise of distinct 32-bit results. No distribution-quality or performance target is claimed.

## Remaining boundaries

No probability sampler, integer softmax/LUT model, full conditional delivery generator, fictional world pack, playable match, event hash-chain validator, complete replay coordinator, durable save or deployment was added. The worker adapter owns no live match state. Hashing an object does not validate cricket legality or authenticate its origin. Full-MatchState projection and archive resource limits remain later work.

Tests cover the listed Linux Node/Chromium/Firefox versions only. WebKit/Safari, other operating systems and the design's complete-match replay corpus were not tested. No empirical model calibration, dependency security audit or FIPS certification is claimed.

**M0 is still partially complete**, with the validated world pack outstanding. Full match-engine milestones remain open.

## Integrity and reproduction

- Lockfile SHA-256: `96df2a1421744fbbda0973cf55a2e5b000ab90ae60eeadf2949b100e9d84eed9`
- Scoring corpus SHA-256: `6c9f256e882a37dad72c0192c965d3314177bbc9c812568c653459268b460345`
- Determinism vectors SHA-256: `cefe36e74c45fea29ccdf4241146c06ec79e85aee71ef4170435c90a238b6da7`

```sh
npm ci
npx playwright install chromium firefox
node scripts/verify.mjs
npm run batch -- random tests/fixtures/determinism/random-request.json
npm run batch -- hash-state tests/fixtures/determinism/hash-request.json
```

Python 3 is required for the independent vector gate. On this specific restricted container, use the documented MOZ_DISABLE_CONTENT_SANDBOX setting for the verification command. The archive contains source, lockfile, schemas, frozen fixtures, reports, logs and browser evidence. Dependencies, build output and Git internals are excluded. COMMIT.txt identifies the packaged source commit.

## Next pass

**Pass 05: Integer Probability Model.** Implement versioned integer logits/LUT boundaries and categorical mass normalisation to exactly 2^32, with largest-remainder/category-order tie-breaking and independent boundary vectors. Consume only the implemented random service. Keep provisional parameters SYNTHETIC_ALPHA and preserve all scoring/determinism gates. See docs/NEXT_PASS.md for the bounded handoff.

## References

- Authoritative user-supplied V0.1 technical design, section 6.
- [NIST NSRL Test Data](https://www.nist.gov/itl/ai/ai-standards-and-guidelines-group/nsrl-test-data), SHA-256 example constants.
- [noble-hashes source](https://github.com/paulmillr/noble-hashes), installed 1.8.0 source/declarations and package-lock integrity.
- docs/decisions/010-portable-random-and-state-hash.md and docs/verification/results.json.
