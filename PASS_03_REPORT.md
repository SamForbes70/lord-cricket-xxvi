# Lord Cricket XXVI Pass 03 report

**Result: PASS for Scoring Kernel and Reducers. M0 remains partially complete.**

Authoritative design: Lord_Cricket_XXVI_Technical_Design_V0_1(1).docx, V0.1. This pass continues the Pass 02 scoring-fixture handoff from commit 418e1ed. It does not claim a playable match or completion of the full match-engine milestone.

## Delivered

- Pure `LC_SCORING_V1` supplied-delivery scorer, validated recorded-event boundary reducer and atomic innings/scorecard ledger reducer.
- Team, batter and bowler accounting; legal-ball and balls-faced distinctions; extras; wicket attribution; physical ends; free hits; over completion; supplied-target termination; selection ordering and quota checks.
- Strict ledger validation, dismissal records, safe integer counters, immutable transitions, duplicate/out-of-order delivery rejection, batter and bowler selection functions.
- Four new runtime contracts and generated JSON Schemas: batting line, bowling line, innings ledger and scoring request. Total: 68. Existing 64 schema files are unchanged.
- Real fixture adapter and engine gate, CLI `score-delivery`, updated React capability shell, README and ADRs 008/009.
- No additional third-party dependency. The lockfile adds the batch app's existing workspace-domain dependency.

## Actual verification

Final run: 2026-09-24T12:20:59.741Z. Linux x64, Node v24.19.0, npm 11.9.0. Executed using `node scripts/verify.mjs`; complete logs and machine-readable results are in `docs/verification/`.

| Gate         | Command                   | Exit | Result | Seconds |
| ------------ | ------------------------- | ---- | ------ | ------- |
| installation | `npm ci`                  | 0    | PASS   | 3.027   |
| schemas      | `npm run schemas:check`   | 0    | PASS   | 0.663   |
| build        | `npm run build`           | 0    | PASS   | 2.240   |
| typecheck    | `npm run typecheck`       | 0    | PASS   | 3.459   |
| lint         | `npm run lint`            | 0    | PASS   | 2.410   |
| fixtures     | `npm run fixtures:audit`  | 0    | PASS   | 0.848   |
| scorer       | `npm run fixtures:engine` | 0    | PASS   | 0.816   |
| unit         | `npm test`                | 0    | PASS   | 4.714   |
| smoke        | `npm run smoke`           | 0    | PASS   | 7.768   |

Unit results: **256 passed across 5 files**. App smoke results: **3 passed**, covering the production browser shell, compiled batch capabilities/validation and compiled scoring CLI. Browser checks include command acceptance/rejection, disabled gameplay, text scales, narrow viewport overflow and absence of page errors. The captured shell image was visually inspected.

Fixture evidence: **45/45 delivery observations match**, **45/45 ledger observations match**, and **29/29 invalid resolutions are rejected by the production scorer**. These comparisons reuse the frozen independently authored Pass 02 expectations. The corpus and its index are byte-for-byte unchanged. Its `scorerImplemented:false` field describes historical authorship, not current capability.

The corpus contains 87 references in total. Four aggregate red-ball terminal cases, five clock cases and four persistence/NRR cases remain reference-only. Their schema checks are not implementation evidence; the engine report explicitly labels their comparisons `NOT_IMPLEMENTED`.

Corpus SHA-256: `6c9f256e882a37dad72c0192c965d3314177bbc9c812568c653459268b460345`.

Lockfile SHA-256: `f7c8c7cb1552c96d013eeed769ad01b420922c09b9d8305ef5a1bd1e6082597d`.

## Self-critique and fixes

Review identified and fixed an incorrect assumption that a zero legal-ball remainder meant an empty over. A wide before the first legal ball can already contribute bowler runs. Tests now cover that sequence and distinguish byes-only maidens from overs containing wides.

Dismissal records now reconcile exactly with bowler wicket credits. The validator rejects a later dismissal or excess non-boundary running after the winning run. Recorded-event validation no longer invents bat contact from trajectory metadata. Schema inventory tests were updated for the four explicit additions.

The first full verification failed only at browser launch because Chromium was absent. Playwright installation restored the required binary; mirror retries recovered truncated initial downloads. The final complete verification passes. Non-fatal npm proxy and colour-environment warnings remain in the raw logs.

Repeated scoring produces identical serialised results in the tested Node runtime, and transitions leave caller input unchanged. This is not cross-runtime replay or hash-chain proof. Boundary and ledger paths share a reduction function, so their agreement alone is not independent evidence; the unchanged golden outputs and separate progression/invariant tests provide that evidence.

## Remaining boundaries

The reducer accepts supplied innings ledgers and delivery resolutions. It does not generate deliveries or initialise a playable world. Recorded events lack the original stroke/contact evidence and cannot authenticate a fabricated internally consistent event. A future replay dispatcher must treat OVER_COMPLETED as a notification of the already-applied atomic boundary, not a second state mutation.

Full-MatchState event dispatch, aggregate red-ball arbitration, match clock, declarations, follow-on, runtime rule-pack loading, rain adjustments, persistence, command receipt idempotency, state hashing and cross-runtime replay remain outstanding. Field identity checks do not implement complete field-position legality. No random service, probability sampler, fictional roster generation, playable match or deployment was added.

M0 remains partial because the validated world pack is outstanding. Only the supported delivery-scoring and innings-reducer gate is claimed complete.

## Next pass

**Pass 04: Deterministic Random Service.** Implement the design's versioned SHA256_COUNTER_V1 addressing, canonical state-hash boundary and independent vectors, with cross-runtime byte agreement. Preserve the scoring corpus and rerun all scorer/reducer comparisons. See `docs/NEXT_PASS.md`.

## Reproduce

```sh
npm ci
npx playwright install chromium
node scripts/verify.mjs
npm run batch -- score-delivery tests/fixtures/scoring/request-no-ball-four.json
```

The source archive includes tracked source, lockfile, schemas, fixtures, reports, raw verification logs and browser evidence. It excludes dependencies, build output and Git internals. COMMIT.txt records the packaged source commit.
