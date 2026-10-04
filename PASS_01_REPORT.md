# Lord Cricket XXVI: Pass 01 report

**PASS: Repository and Contracts, within the requested Pass 01 scope.**

**M0: PARTIALLY COMPLETE. Next pass: Scoring Fixtures.**

Verified 24 September 2026. Source baseline: the supplied `Lord_Cricket_XXVI_Technical_Design_V0_1(1).docx`, Appendices A/B/G plus the architecture, deterministic protocol, command and persistence sections. The workspace was empty at inspection; this delivery creates a new local Git repository. No remote publication or deployment was performed. The packaged source commit is recorded in `COMMIT.txt` in the ZIP.

## Implemented

- TypeScript npm monorepo: apps/web, apps/batch and packages/contracts, domain, simulation, ai, projections, persistence and data.
- Strict TypeScript project references and compiled package exports, exact direct dependencies and a reproducible package-lock.json.
- Core Appendix A schemas and inferred types, Appendix B batting plan/command/setup manifest, and Appendix G tactics, field, condition and configuration contracts.
- **54 generated Draft 2020-12 JSON Schemas**, with drift checking and independent strict AJV compilation. Unknown fixed-object properties are rejected; no type coercion is used.
- All 15 named administrative event variants, delivery/event envelopes, 16 command variants, receipts, worker request/response shapes and error codes.
- Stable identity helper, canonical JSON codec, exact version/hash allow-list checks, and random address/hasher/engine interfaces. No random draw or sampler implementation.
- Three custom rule manifests marked CONTRACT_ONLY; neutral pitch/geometry, delegation and weather configuration, and the two specified T20 field templates.
- Runnable React shell with scope/capability display, disabled play, command structure checker and 100/115/125/150% text scaling. Runnable Node CLI with status and command validation.
- Contract test fixtures, architecture lint checks, CI workflow, README, five ADRs, contract coverage map and Scoring Fixtures handoff.

Future engine packages contain explicit ports, not simulated successful outcomes. The AI view type excludes seeds and hidden future weather. Storage has interfaces only, with no claim of durable saving.

## Actual verification results

Environment: v24.19.0, npm 11.9.0, Linux x64. Browser smoke: Chromium 141.0.7390.37, Playwright 1.56.0. All gate results below came from the final `node scripts/verify.mjs` run. Durations are development-environment command timings, not simulation performance benchmarks.

| Gate         | Command                 | Result | Exit code | Elapsed |
| ------------ | ----------------------- | ------ | --------- | ------- |
| installation | `npm ci`                | PASS   | 0         | 1.894 s |
| schemas      | `npm run schemas:check` | PASS   | 0         | 0.520 s |
| build        | `npm run build`         | PASS   | 0         | 3.624 s |
| typecheck    | `npm run typecheck`     | PASS   | 0         | 1.823 s |
| lint         | `npm run lint`          | PASS   | 0         | 1.360 s |
| unit         | `npm test`              | PASS   | 0         | 1.559 s |
| smoke        | `npm run smoke`         | PASS   | 0         | 3.727 s |

- Unit/contract tests: **38 passed, 0 failed**, across 3 files.
- App smoke tests: **2 passed, 0 failed**. The browser test exercised rendered production React, valid/invalid commands, disabled play, all four text scales, a 390 px viewport without horizontal overflow, and no page errors. The CLI test exercised capability reporting, valid command input, missing input file and unsupported action exit codes.
- Generated schemas: all **54** independently compiled under strict AJV 2020-12; checked-in generation output matched.
- Build: 105 web modules transformed. JavaScript bundle 255.93 kB, gzip 78.76 kB, as reported by Vite. No match runtime benchmark was performed.
- Production screenshot inspected; saved at docs/evidence/shell.png. It shows the invalid-input smoke-test state.

Full command output and machine-readable exit codes are under `docs/verification/`. Lockfile SHA256: `3b1f98a47db3f7074efd4f35afef5969185272bc83ea6dbb4cfec35a8119e256`.

## Failures found and corrected

1. The tsx CLI attempted a Unix IPC socket unavailable in this execution environment. Schema scripts now use `node --import tsx`, preserving TypeScript execution without that CLI socket.
2. ESLint rejected a deliberately sparse literal test array. The fixture now constructs the sparse array explicitly.
3. The initial AJV test helper recompiled already-registered schema IDs. It now reuses the registered validators.
4. The pinned Zod generator omitted tuple cardinality. Generated setup/match schemas could otherwise accept missing/extra team IDs. The generator now derives fixed bounds from the tuple definition, and a regression test verifies rejection in both validation paths.
5. Chromium was initially absent. Installation completed after the downloader retried a truncated archive; the final browser smoke test passed.
6. Self-review tightened array canonicalisation to reject accessors without invoking them and strengthened the package dependency check from text matching to recursive TypeScript AST inspection.

No failing requested gate remains in the final run. Installation still reports the supplied environment's npm http-proxy warning and a deprecation warning for the pinned ESLint 9.37.0. These did not fail installation or lint. Toolchain maintenance is a follow-up; no dependency security audit is claimed.

## Self-critique and remaining limits

The foundation is useful and runnable, but schema correctness is not cricket correctness. Several authoritative-design types specify shapes without complete payload definitions; those choices are documented in ADRs rather than presented as pre-existing requirements. The two-layer validation API must remain explicit: structural schemas cannot certify cross-object cricket invariants.

Positive sector totals, model variation membership, unique field identities and selected world/match references have semantic validators. Legal dismissals, command ownership and phase, scores, innings-result reconciliation, XI/keeper field eligibility, left-hand field transformation, event-chain hashes and durable revision handling remain unimplemented. This is the main limitation to carry into the next pass. The schema-only CLI and UI warn about it.

Testing is limited to the contract foundation and Chromium shell/CLI. There is no full administrative reducer corpus, browser replay comparison, accessibility audit, storage recovery test, scoring corpus, statistical calibration or release benchmark. Rule fixture IDs identify planned evidence; they do not mark those fixtures passed. The world/model schemas are present but no playable world or model pack is fabricated.

The supplied design's Appendix C and section 19 describe over/innings transition ordering with different emphasis. Pass 02 must resolve that explicitly before reducers, retain target-achieved precedence and avoid requesting another player after a terminal result.

## Scope exclusions and milestone state

Cricket scoring, random sampler, playable matches and fictional roster generation were **not implemented**, as requested. No calibrated statistics, DLS implementation, AI captain policy, scorecard projection, IndexedDB adapter, career season or save/import system is claimed.

M0 has the contracts, validators, rule descriptors and contract fixture infrastructure. It remains **partially complete** because the independent scoring fixture corpus and validated world pack are still outstanding. M1 through M8 are not complete. V0.1 is not release-ready.

## Next pass: Scoring Fixtures

Define independent expected values for Appendix D and the complete run-out batter/end matrix. Introduce a distinct DeliveryResolution contract and fixture IDs before a scorer. Cover extras, physical ends, sixth-ball transitions, catches, free hits and immediate winning extras. Keep persistence and NRR fixtures identified separately. Do not bring in stochastic generation to manufacture expected scores.

Reproduce this build with `npm ci`, `npm run build`, `npx playwright install chromium`, then `npm run verify`. Start the shell with `npm run dev`.
