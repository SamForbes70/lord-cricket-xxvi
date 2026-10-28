# Durable research transactions and remaining evidence gates

PR #8 merged as `931da3b` after all four Linux/Windows CI checks passed.
The research book now commits cross-innings transfers through one shared durable journal.
Real-process-exit tests recover both innings without duplicate credit.
Historical source acceptance and real untouched-cohort evaluation remain incomplete for the specific reasons below.

## One acceptance point for both innings

`scripts/research/m7k-book-journal.ts` stores a versioned two-innings book in a separate research directory.
It supports ordinary research commands and cross-innings transfers through the same journal.
A transfer appends one receipt containing the expected prior hash and the resulting pair hash.
The writer flushes that receipt before publishing its checkpoint.
Recovery replays the complete receipt into both innings before exposing either updated state.

The book validates reciprocal teams and matching player rosters across innings.
Failed transitions write no receipt and leave both innings unchanged.
Matching retries return the committed result without another credit.
Conflicting retries, stale writers, malformed journals and damaged checkpoints reject explicitly.
Missing or stale checkpoints recover from the complete journal.
A truncated journal fails closed rather than exposing a partial transfer.

An exclusive writer lock prevents simultaneous commits.
After a real writer-process exit, recovery restores both innings and verifies the dead local process before releasing its lock.
Live, foreign-host and unverifiable locks remain protected.
A PID reused by a live process also remains protected.
The research API does not provide distributed locking or gameplay IndexedDB integration.
Filesystem durability remains subject to the declared host's flush and atomic-rename guarantees.

Nine tests cover three injected interruption points, a real process exit, retries, writer conflicts, corruption and root validation.
The native Windows CI job also runs these tests.
The earlier single-innings journal remains available; cross-innings callers must use the shared book.

## Historical scorer probes

Two source-addressed probes exercise wide plus hit wicket under the frozen scorer's rules.
Match `1142915` starts from 227 runs, one wicket and 118 legal balls; the conditional result is 228/2.
Match `1453929` starts from 89 runs, six wickets and 109 legal balls; the conditional result is 90/7.
Both probes add one bowler run and one bowler wicket, without consuming a legal ball or batter ball.
Each probe tests both canonical end orientations and the required replacement action.
The fixture retains match, file and event hashes, plus the observed player names.

These are conditional scorer probes, rather than complete historical acceptance fixtures.
Their synthetic field identities and canonical ends do not attest historical ground directions or umpire chronology.
`conditional-source-probes.json` lists these assumptions explicitly.
SF's human confirmation remains recorded in the earlier owner review; this update requests no repeated approval.
Missing incident-specific records remain unknown rather than invented.
The inherited 69-case register and its source hashes remain unchanged.
Complete historical fixture coverage therefore remains unaccepted.

## Fresh archive inventory: 18 candidates before eligibility

The public [Cricsheet men's archive](https://cricsheet.org/downloads/t20s_male_json.zip) was retrieved again on 28 October 2026.
It is byte-identical to the retained archive, with SHA-256 `691f1f42b86c93fbdbc53936ed69479f9306bf39c4c56b4c0729360051075c6d`.
`SOURCE_FETCH.json` records the retrieval, notice hash and source URL.
The [inherited development report](../../M7E_REAL_CRICSHEET_HOLDOUT.md) includes held-out matches through 14 October 2026.

The metadata inventory finds 18 matches strictly after that date, spanning 17–25 October 2026.
The other retained non-official archive contains zero matches after that date.
These are upper bounds before checking innings completeness, rules and other eligibility criteria.
The current protocol requires at least 200 evaluation matches.
The selected available archives therefore cannot supply a qualifying new forward-time cohort.
A fresh all-format archive of men's matches played in the last 30 days contains 42 forward-dated matches.
Its metadata separates these into 18 T20, 11 ODI, nine ODM, one Test and three MDM matches.
The broader source therefore supplies the same 18 T20 candidates, rather than enough additional T20 matches.
`RECENT_SOURCE_FETCH.json`, `RECENT_FORWARD_INVENTORY.json` and `RECENT_FORMAT_COUNTS.json` retain this check.
This finding does not claim that no other qualifying dataset exists.

The inventory extracts dates and source hashes without outcome metrics, fitting or candidate evaluation.
It excludes matches sharing or spanning the cutoff date.
Even 200 metadata entries would require eligibility and seal review before evaluation.
A new archive with enough eligible unseen matches, or the original cohort manifest plus a separately sealed new cohort, remains necessary.
The project must freeze the actual candidate and protocol before opening evaluation outcomes.
Real untouched-cohort evaluation remains BLOCKED; no reused development cohort is relabelled as untouched.

Data source: [Cricsheet](https://cricsheet.org/), under [ODC-By 1.0](https://opendatacommons.org/licenses/by/1.0/).
These files contain derived metadata and limited conditional probes; no endorsement is implied.
Original match archives and licence notices remain outside Git.

## Verification and reproduction

Fresh verification passes 602 TypeScript tests across 36 files and 87 research Python tests.
The 167 schemas, build, typecheck, lint, scoring fixtures and deterministic-vector gates pass.
Four candidate browser tests pass across Chromium and Firefox.
`BOUNDARY_CHECK.json` verifies unchanged gameplay packages, applications, schemas, dependencies and source registers.
The simulation-worker SHA-256 remains `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4`.
The earlier 23-test gameplay smoke run and PR #8's hosted acceptance remain separately dated evidence.

`COMMANDS.json` records exact fresh commands, durations, exit codes and log hashes.
`COMPLETION_STATUS.json` distinguishes implemented work from unresolved evidence gates.
`SHA256SUMS` covers this directory.

```sh
npx vitest run tests/unit/m7k-book-journal.test.ts tests/unit/m7k-historical-probes.test.ts
python3 scripts/m7k-inventory-forward.py --archive /workspace/m7k-source-research/forward-inventory/t20s_male_json.zip --after-date 2026-10-14 --out /tmp/m7k-forward.json
cmp docs/verification-m7k/transactions/FORWARD_INVENTORY.json /tmp/m7k-forward.json
```
