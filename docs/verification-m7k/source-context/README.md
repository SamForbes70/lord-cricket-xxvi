# M7K complete source identity audit

All 69 registered event hashes match the retained Cricsheet archive.
The audit covers 65 matches and all 45 observed signatures.
The previous batch verified 11 events across seven matches.
K1 adjudication remains incomplete, with zero accepted fixtures.

## Provenance and scope

Data source: [Cricsheet](https://cricsheet.org/), under [ODC-By 1.0](https://opendatacommons.org/licenses/by/1.0/).
These derived summaries retain limited match metadata and source observations.
Cricsheet does not endorse this project.
Original match files and licence notices remain outside Git.

The audit reads the previously downloaded [men's T20I archive](https://cricsheet.org/downloads/t20s_male_json.zip).
Archive SHA-256: `691f1f42b86c93fbdbc53936ed69479f9306bf39c4c56b4c0729360051075c6d`.
[Batch 01](../source-batch-01/README.md) records its retrieval and licensing checks.
This audit makes no fresh-download or untouched-cohort claim.
All cases remain previously inspected development evidence.

`SOURCE_CONTEXT.json` records archive, register, selection, match-file and event hashes.
The audit rejects missing matches, duplicate identities, incomplete selection coverage and changed event hashes.
It also rejects approved adjudication flags and gameplay permission.
The selection input must name the exact register hash.

## Verified observations

| Register reason | Events |
| --- | ---: |
| Unsupported wicket type | 24 |
| Invalid legality channel | 21 |
| Unsupported extra type | 11 |
| Free-hit mask | 5 |
| Multiple wickets | 4 |
| Wide-wicket mask | 2 |
| Boundary dismissal or allowance | 2 |
| Total | 69 |

Each event retains its source indices, player identities, observed runs, extras and dismissal records.
The preceding and following delivery addresses include hashes and observed scoring components.
Repeated display labels remain distinct through source indices.
`observedPriorRunSum` sums earlier delivery totals in the same innings.
It excludes separate innings penalties and does not certify an accepted team score.
`observedInningsPenaltyRuns` retains any separate penalty field; null means the source omits that field.
`observedPriorWicketKinds` counts source records, including retirements, without assigning team wickets or bowler credits.

For Finch (`1142915`), the source records 227 earlier delivery runs, then one wide and hit wicket.
For Mughal (`1391336`), the source records 44 earlier delivery runs, then hit the ball twice.
These observations agree with the limited published corroboration in [historical evidence](../historical-evidence/README.md).
Agreement does not supply missing physical ends, match amendments or independent adjudication.

## Acceptance boundary

PASS: all 69 source event hashes and selection coverage.
PASS: deterministic output reproduction and synthetic negative tests.
K1 source adjudication: BLOCKED pending independent decisions and primary incident evidence.
Production ledger integration and gameplay promotion remain gated.
No approval flag, gameplay source, save contract or coefficient changes in this update.

A source array establishes recorded order, rather than actual umpire chronology.
A recorded no-ball does not prove historical free-hit eligibility.
A retirement record does not establish dismissal status or permitted return.
A penalty field does not establish the reason, beneficiary or destination innings.
An independent reviewer must resolve these questions before fixture acceptance.

## Reproduction and recorded results

Run from the repository root with the separately retained archive:

```sh
python3 scripts/m7k-audit-source-context.py --archive /workspace/m7k-source-research/t20s_male_json.zip --out /tmp/m7k-source-context.json
cmp docs/verification-m7k/source-context/SOURCE_CONTEXT.json /tmp/m7k-source-context.json
python3 -m unittest discover -s tests -p 'test_m7k_*.py' -v
```

CI runs synthetic source tests without downloading licensed match files.
Local `COMMANDS.json` records exact commands, UTC start times, durations, exit codes and log hashes.
`SHA256SUMS` covers this evidence directory.


## Fresh verification results

The final run passes 542 TypeScript tests across 31 files.
Research Python passes 84 tests, including eight new source audit tests.
The separate synthetic summary suite passes six tests.
Schema checks pass for 167 generated contracts.
Build, typecheck, lint, scoring fixtures, RNG vectors, probability vectors and generator vectors pass.
Chromium and Firefox smoke acceptance passes all 23 tests, including the 100-match corpus in each browser.
The final source audit reproduces `SOURCE_CONTEXT.json` byte-for-byte.

The first smoke attempt fails at browser launch because the default Playwright cache lacks browser executables.
That attempt passes six non-browser tests and records 17 launch failures.
The configured rerun uses the installed Chromium and Firefox and passes all 23 tests.
`COMMANDS.json` retains both attempts and the rerun's environment settings.
Fresh browser artefacts remain outside Git at `/workspace/m7k-source-context-smoke-artifacts`.
`BOUNDARY_CHECK.json` verifies unchanged application, package, dependency, register and worksheet paths against main `4aa71d9`.
