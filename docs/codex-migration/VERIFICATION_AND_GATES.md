# Verification and outstanding acceptance gates

## Current, independently executed by ChatGPT recovery session (21 October 2026)
- Owner ZIP CRC: PASS, 24 entries.
- Owner SHA-256 release manifest: PASS, 23/23 entries.
- Source ZIP CRC and equivalence to restored checkout: PASS, 894/894 entries.
- Git bundle verify: PASS, complete history, historical commit `5b8b9da990d657197fb56bbfd33152f87b875f5c`, 22 original commits.
- Deterministic Python vectors: PASS, 24 random addresses and eight state hashes.
- Python probability oracle: PASS, 1,601 lookup entries, 15 probability vectors and four boundary checks.
- Python generator vectors: PASS, nine independently hashed fixtures.
- Python M7 research suite: PASS, 72/72, after `python scripts/m7j-restore-fixtures.py` to populate derived and ignored research fixtures.
- Playable owner build: PASS, HTTP 200 for index page, JavaScript main worker and engineering page; served byte-identical hashes for checked assets.
- `npm ci --offline`: BLOCKED, missing cached `zod@4.1.12` tarball.
- `npm ci` online: BLOCKED with npm CLI `Exit handler never called!` in recovery container. This is an environment limitation, not evidence of application source failure.
- Fresh npm build/typecheck/lint, TypeScript tests and actual browser Playwright acceptance: NOT RUN in this recovery session due to install blockage.

## Historical M7J release report (not revalidated here)
- Reported 538/538 TypeScript unit tests, 72/72 Python tests, 167 strict JSON schemas, full 56 fixture season acceptance, builds/lint/typecheck passed.
- Reported browser acceptance BLOCKED (`ERR_BLOCKED_BY_ADMINISTRATOR`), manual M3 acceptance PENDING, hardware performance NOT MEASURED, empirical model promotion NOT APPROVED.

## Recommended on-PC tests
```
npm ci
npm run schemas:check
npm run build
npm run typecheck
npm run lint
npm run fixtures:engine
npm run vectors:check
npm run probability:check
npm run generator:check
npm run management:acceptance
npm run season:persistence:rules
npm run red5:rules
npm run m7j:test
npm test
npm run test:m6g
```
Running `npm test` as one large suite may cause contention; shard large suites based on historical report (main 509, red-ball 19, persistence 10) to establish trustworthy totals. Playwright browser tests require installed browser binaries and an authorised desktop host.

Use `docs/verification*` and the Pass reports for historic proof. Treat `docs/codex-migration/verification/` as 21 October recovery results only.
