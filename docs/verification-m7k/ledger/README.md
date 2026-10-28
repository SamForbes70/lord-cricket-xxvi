# M7K isolated research ledger and evaluation tools

SF confirmed review of all presented material on 28 October 2026 and directed implementation to continue.
`OWNER_REVIEW.json` records the statement and its limits.
The implementation remains outside gameplay packages, workers, save contracts and production entrypoints.
No model becomes selectable in the game.

## Implemented code

| Component | Implementation |
| --- | --- |
| Ledger | `scripts/research/m7k-ledger.ts` supplies versioned commands, ordered events, hashes and receipts. |
| Ordinary scoring | Delivery transitions call the unchanged `scoreDelivery` and `reduceScoringBoundary`. |
| Reconciliation | Every transition reconciles team runs, extras, batter lines, bowler lines, wickets, balls, status and occupied ends. |
| Administration | Penalties consume no ball or bowler credit; retirements have separate status and return permissions. |
| Cross-innings awards | Fielding awards remain pending until allocation; `transferAward` produces both candidate states atomically in memory. |
| Replay | Every prefix rebuilds through the same validators; checkpoints cannot replace or override event history. |
| Recovery | Accepted tails recover events beyond a checkpoint; identical repeated receipts do not create new events. |
| File persistence | `scripts/research/m7k-journal.ts` flushes accepted events before publishing an atomic checkpoint replacement. |
| Browser archive | A separate developer bundle imports candidate archives in fresh Chromium and Firefox contexts. |
| Evaluation | `scripts/m7k-evaluate.ts` validates protocol metadata before reading externally supplied results. |

The ledger supports the frozen T20 ordinary-scoring profile only.
Its identity is `LC_M7K_LEDGER_RESEARCH_V1` with model `m7k-ledger-research-01`.
Its archive identity is `LC_M7K_ARCHIVE_RESEARCH_V1`.
Unknown identities and historical v1 archives reject explicitly.
`gameplayIntegrationPermitted` remains false.

## Fixtures and human confirmation

Six executable fixtures contain hand-authored synthetic expectations for totals, credits, physical ends and next actions.
They cover a dot, batting penalty, fielding penalty, retired out, retired not out and wide plus hit wicket.
`tests/fixtures/m7k/engineering-oracles.json` labels their origin explicitly.
Their NORTH/SOUTH coordinates describe synthetic tests, rather than historical ground ends.
Tests also cover replacements, permitted returns, winning runs, tenth wickets, final balls, quotas and rejected commands.

SF's statement confirms the presented review material and directs work to continue.
It supplies no incident-specific corrected event sequence, missing physical-end identity or detailed expected scorecard.
The historical source registers retain their original flags and hashes.
These engineering fixtures do not establish acceptance of the 69 source incidents or complete K1 adjudication coverage.
Production integration still requires complete source-derived fixture records.

## Replay and persistence limits

The file journal supports one writer in a separate research directory.
Tests interrupt before journal acceptance and after acceptance but before checkpoint publication.
A stale caller rejects after recovery detects a durably accepted event.
Damaged checkpoint files, truncated journals, conflicting receipts and incompatible versions reject explicitly.
Filesystem durability depends on the host's filesystem and synchronisation guarantees.

The journal is a developer harness, rather than an IndexedDB gameplay repository.
Concurrent writers, portable career import and production migrations remain outside this implementation.
`transferAward` atomically constructs two in-memory states; separate journal writes do not form a durable cross-innings transaction.
A match-level transaction mechanism remains necessary before production ledger acceptance.
Post-closure penalty records retain explicit ordering; they do not revise a production match result.

## Evaluation tooling and remaining cohort gate

The evaluation protocol requires at least 200 training matches and 200 evaluation matches.
It rejects shared source identities, shared hashes, overlapping dates and declared previously inspected evaluation matches.
It rejects evaluation opening before the declared protocol freeze.
It requires rights and untouched-cohort declarations, source hashes, candidate identity and rules identity.
These metadata checks cannot authenticate declarations or reconstruct absent source data.

Reports compare both innings and competition groups, with target bands derived from training targets.
They report run and wicket means, dot and boundary fractions, score quantiles and unsupported-event counts.
They compare strength, fatigue and tactical ablation results supplied by the external runner.
Bootstrap samples resample whole paired matches, preserving both innings within each draw.
A declared conditional chase threshold produces separate checks by target band.
Failed bands remain visible; no report promotes a model.

The tool summarises supplied candidate results; it does not fit a model or invent fictional rating effects.
Its synthetic tests exercise the report and rejection paths, rather than establish empirical realism.
Phase-level extraction and independent verification of source hashes remain upstream requirements.
A new untouched cohort and its frozen candidate results have not been supplied.
Real-cohort evaluation is NOT RUN; candidate feasibility and promotion remain unaccepted.

## Verification

`COMMANDS.json` records exact commands, environment overrides, UTC timestamps, durations, exit codes and log hashes.
The original browser attempt fails because the test injected an inline script into the protected gameplay page.
The corrected harness serves an isolated page with external scripts and a restrictive content policy.
The gameplay content policy remains unchanged.
Both attempts remain in the evidence.
`SHA256SUMS` covers this directory after verification completes.

Run candidate unit checks with:

```sh
npx vitest run tests/unit/m7k-ledger.test.ts tests/unit/m7k-journal.test.ts tests/unit/m7k-evaluation.test.ts
```

Run browser acceptance with:

```sh
npx vite build --config vite.m7k.config.ts
npx playwright test --config playwright.m7k.config.ts
```

Run the evaluator with separately supplied protocol and results files:

```sh
node --import tsx scripts/m7k-evaluate.ts --protocol=protocol.json --results=results.json --training-targets=training-targets.json --out=report.json
```


## Fresh results

PASS: 589 TypeScript tests across 34 files, including 47 new research checks.
PASS: 84 research Python tests.
PASS: 167 schemas, build, typecheck, lint, scoring fixtures and deterministic RNG, probability and generator vectors.
PASS: four candidate archive tests across Chromium and Firefox.
PASS: 23 historical browser smoke tests, including the 100-match corpus in both browsers.
After the file-handle adjustment, all 47 affected research tests, lint and typecheck pass again.
`POSTFIX_COMMANDS.json` records those final checks separately.
`BOUNDARY_CHECK.json` verifies protected source paths and the unchanged simulation-worker hash.
Fresh gameplay smoke artefacts remain at `/workspace/m7k-ledger-gameplay-smoke-artifacts`, outside Git.
Hosted Windows results for this change remain pending until CI completes.
Real untouched-cohort evaluation is NOT RUN.
