# M7K verification and remaining acceptance gates

The engineering coverage is stronger, but M7K and release acceptance remain incomplete. Missing historical decisions, evaluation data and owner hardware results prevent a complete acceptance claim.

This report records work on 29 October 2026 in Australia/Brisbane. `RESULTS.json` contains machine-readable results. `SHA256SUMS` protects the retained evidence.

## Executable fixture and recovery coverage

All seven hand-authored engineering fixtures now run in both physical-end orientations. The cases cover dots, batting penalties, fielding penalties, retired-out, retired-not-out wide plus hit-wicket, and a no-ball/wide/free-hit sequence.

Fourteen unit cases compare explicit totals, player credits, wickets, ends and next actions. Each accepted prefix passes replay, archive import and recovery from an older checkpoint. Duplicate receipts and out-of-order commands reject without changing the caller state.

The browser suite checks each fixture and orientation in fresh Chromium and Firefox contexts. It tests every event prefix, empty checkpoints and already accepted receipts. Thirty browser tests pass, including damaged-checkpoint and unsupported-version rejection.

The existing transaction and journal suites also run in full unit discovery. They retain cross-innings award, interrupted-process recovery and version checks. Production smoke tests verify the unchanged v1 path separately.

These are synthetic engineering fixtures. Two existing conditional historical probes remain conditional. Neither set establishes complete historical incident acceptance.

## Historical evidence and untouched evaluation

The fresh archive download verifies all 69 registered events across 65 matches and 45 signatures. SF's recorded review remains preserved. No new incident-specific chronology, playing-condition adoption, award decisions or ground-end records were supplied.

`SOURCE_AUDIT.json` records the source audit summary. Raw licensed match data stays outside Git.

The refreshed T20 archive has SHA-256 `691f1f42b86c93fbdbc53936ed69479f9306bf39c4c56b4c0729360051075c6d`.
It contains 18 forward-dated candidates after 14 October 2026, before eligibility checks. The protocol requires at least 200 evaluation matches and 200 training matches. `FORWARD_INVENTORY.json` records metadata and hashes; this task opens no outcomes for fitting or evaluation.

Existing evaluation tooling and its rejection tests pass. Real untouched-cohort evaluation remains blocked by insufficient eligible data. Previously inspected development matches cannot fill that gap.

## Owner-PC and hardware acceptance

The latest uploaded owner-PC run tested clean commit `c5dc22a`. It passed 609 units, six match UI tests and three career tests. Firefox's career test exceeded its five-second save assertion.

Merged PR #12 corrects the wait and verifies a six-second delay, completed match progress, durable reload and portable import. Its four CI checks pass. An updated owner-PC collector result is still required; cloud execution cannot replace it.

Browser performance probes measure command acknowledgement, match execution, a complete league and IndexedDB save/load. Cloud observations do not establish the four-core, 8 GB reference-laptop gate. Total application memory, including workers and native allocations, remains unverified on qualifying hardware.

## Completion decisions

| Requested activity | Decision | Remaining evidence |
| --- | --- | --- |
| Owner-PC acceptance | INCOMPLETE | Return the collector ZIP from the updated Windows checkout. |
| Historical fixtures | BLOCKED | Supply incident-specific decisions and missing source context. |
| Candidate transition and recovery checks | PASS for available fixtures | Complete historical fixtures are still required for historical acceptance. |
| Untouched-cohort evaluation | BLOCKED | Supply at least 200 eligible, sealed forward matches and freeze the candidate before opening outcomes. |
| Reference-hardware performance | INCOMPLETE | Run qualifying hardware measurements, including total application memory. |

The owner-PC command remains `node scripts/owner-acceptance.mjs --owner-pc` from a clean, updated checkout.

## Production boundary

This change adds tests and verification records. Gameplay remains `synthetic-alpha-01` with `LC_T20_MATCH_V1`. Production code, frozen contracts, dependency pins and existing saves remain unchanged. Research promotion and release publication remain unauthorised.

## Fresh local verification

| Gate | Result |
| --- | --- |
| TypeScript units | PASS: 624 tests across 39 files, no failures or pending tests. |
| Python discovery | PASS: 93 tests. |
| Schemas, build, typecheck and lint | PASS: 167 schemas and all package boundaries. |
| Scoring and deterministic vectors | PASS: scorer, RNG, probability and generator checks. |
| Production smoke | PASS: 23 tests. |
| Production UI | PASS: six tests across Chromium and Firefox. |
| Candidate archives and recovery | PASS: 30 tests across Chromium and Firefox. |
| Performance probes | PASS: four tests; measurements remain cloud observations. |

The new sequence also enters the existing file-journal fixture suite. Its test count increases automatically with the added fixture.
`COMMANDS.json` records commands and exit codes. Retained logs and observation files support the counts above.
Performance observations partly overlap other verification on the shared host; they are unsuitable for reference-hardware acceptance.
CI and merge results are recorded separately in the pull request after the tested commit exists.
