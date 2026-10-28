# M7K representative cases for independent review

Status: selection complete; independent adjudication pending.

The selector groups 69 register rows into 45 distinct observed signatures.
Each signature includes reason, disposition, innings, pre-free-hit state and every retained observed scoring component.
These signatures describe register observations, rather than verified event sequences.
Pre-wicket counts, legal-ball counts, target state and actual playing conditions need separate review.
The grouping cannot establish identical chronology or complete rule coverage.

Selection prefers training rows, then sorts source identities deterministically.
Previously inspected holdout rows remain development evidence when selected.
Selection never creates an untouched evaluation cohort.
Every original row maps to one selected signature; all confirmation flags remain false.

## Inherited routing discrepancy

Match `1391336`, innings 1, over index 6, attempt index 5 records `hit the ball twice`.
M7J routes `UNSUPPORTED_WICKET_TYPE` to retirement handling regardless of the observed wicket kind.
The case therefore inherits a retirement evidence request that does not describe its observed dismissal.
The new selection flags this discrepancy without changing the historical register or accepting the dismissal.
A separate laws and playing-conditions review must determine this case's treatment before a scorer fixture exists.
This finding also shows why disposition counts alone cannot establish scorer support.

## Review questions

| Observed class | Evidence needed before acceptance |
| --- | --- |
| Retirement | Establish dismissal kind, player, dead-ball timing, reason, final status and return permissions. |
| Hit the ball twice | Establish the actual act, appeal, umpire decision and applicable dismissal provisions. |
| Five-run penalty | Establish signal, reason, beneficiary, award timing, extras attribution and destination innings. |
| Wide with hit wicket | Establish player identity, ends, dismissal sequence and applicable playing conditions. |
| Multiple no-ball extras | Establish historical playing conditions and mandatory penalty value; distinguish additional extras and data errors. |
| Free-hit dismissal | Establish preceding no-ball, legal-ball sequence, free-hit eligibility and actual dismissal. |
| Multiple dismissals | Establish first dead-ball event and whether any later record represents separate administration. |
| Boundary with run out | Establish boundary type, completed runs, grounding, overthrow timing and umpire signals. |

The generic 2026 Laws alone cannot decide historical cases under unidentified competition conditions.
Original match JSON supplies source context, but cannot alone certify umpire chronology or adjudication.
Public scorecards alone may also omit that chronology.
A reviewer must cite independently checked primary evidence and preserve contradictory or inconclusive findings.
No external reviewer has supplied decisions during this pass.
[Source context](verification-m7k/source-context/README.md) verifies all 69 source hashes across the 45 observed signatures.
Its player identities and neighbouring source addresses support further independent review.

## Selected source identities

Over and attempt values below are zero-based source indices, rather than display ball labels.
Each short signature resolves to a full hash and source-event hash in the JSON evidence.

| Signature prefix | Match | Innings | Over index | Attempt index | Reason | Rows represented |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| `968baf766798` | 1535418 | 1 | 2 | 1 | MULTI_WICKET_UNSUPPORTED | 1 |
| `8172bb0d9bc8` | 1554537 | 1 | 18 | 1 | MULTI_WICKET_UNSUPPORTED | 1 |
| `92883a2f964d` | 1459387 | 1 | 13 | 5 | MULTI_WICKET_UNSUPPORTED | 1 |
| `45ed92d93e88` | 1534056 | 2 | 17 | 1 | MULTI_WICKET_UNSUPPORTED | 1 |
| `cc5733dccc4f` | 1199508 | 1 | 18 | 5 | BOUNDARY_DISMISSAL_OR_ALLOWANCE | 1 |
| `a017bb45b418` | 1283040 | 2 | 1 | 0 | BOUNDARY_DISMISSAL_OR_ALLOWANCE | 1 |
| `87cd8851ffd2` | 412698 | 1 | 17 | 6 | FREE_HIT_MASK | 1 |
| `4a50d91cc0ff` | 306991 | 1 | 2 | 7 | FREE_HIT_MASK | 1 |
| `3e8091293ada` | 533293 | 2 | 19 | 2 | FREE_HIT_MASK | 1 |
| `d7cc63bde7e2` | 489212 | 2 | 15 | 5 | FREE_HIT_MASK | 2 |
| `decf08ec1f90` | 1142915 | 1 | 19 | 5 | WIDE_WICKET_MASK | 2 |
| `9c453e9f2d08` | 1534043 | 1 | 16 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `48244f5a48e3` | 1391336 | 1 | 6 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `617b5172675c` | 1487633 | 1 | 18 | 6 | UNSUPPORTED_WICKET_TYPE | 2 |
| `4a71bb69b845` | 1443776 | 1 | 13 | 5 | UNSUPPORTED_WICKET_TYPE | 2 |
| `0a24be3afa9e` | 1383082 | 1 | 17 | 4 | UNSUPPORTED_WICKET_TYPE | 1 |
| `aa6ed9476a31` | 1457222 | 1 | 17 | 6 | UNSUPPORTED_WICKET_TYPE | 3 |
| `f6005a04fc9d` | 1275277 | 1 | 14 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `beef26ab9768` | 1459374 | 1 | 17 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `07381b799a31` | 1321284 | 1 | 14 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `f3a2d42aafd2` | 1208612 | 1 | 18 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `eb59ffd8d38f` | 1534054 | 2 | 18 | 2 | UNSUPPORTED_WICKET_TYPE | 2 |
| `6ffc8c093f16` | 1283034 | 2 | 8 | 0 | UNSUPPORTED_WICKET_TYPE | 1 |
| `3ba5014c1286` | 1534051 | 2 | 3 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `ee79844df53a` | 1275051 | 2 | 18 | 0 | UNSUPPORTED_WICKET_TYPE | 2 |
| `dafb7330ba15` | 1472527 | 2 | 16 | 6 | UNSUPPORTED_WICKET_TYPE | 2 |
| `9b54bb17fdf6` | 1512744 | 2 | 17 | 5 | UNSUPPORTED_WICKET_TYPE | 1 |
| `7c9229cd7518` | 1554553 | 2 | 17 | 0 | UNSUPPORTED_WICKET_TYPE | 1 |
| `955a71facf0e` | 1538440 | 1 | 9 | 3 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `46f785d380cf` | 1381453 | 1 | 13 | 2 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `e7110681a0e7` | 1286673 | 1 | 17 | 3 | UNSUPPORTED_EXTRA_TYPE | 2 |
| `1941dbbaa332` | 1298156 | 1 | 10 | 6 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `6b7337389759` | 1367728 | 2 | 9 | 5 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `b45a99c4b256` | 1494767 | 2 | 15 | 0 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `bae3af639c8f` | 1321477 | 2 | 17 | 0 | UNSUPPORTED_EXTRA_TYPE | 2 |
| `47d314a851e6` | 1415725 | 2 | 14 | 5 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `ca7e967b238e` | 660185 | 2 | 10 | 3 | UNSUPPORTED_EXTRA_TYPE | 1 |
| `a16a97234218` | 222678 | 1 | 1 | 4 | INVALID_LEGALITY_CHANNEL | 3 |
| `dd08c9641b10` | 222678 | 1 | 16 | 4 | INVALID_LEGALITY_CHANNEL | 1 |
| `dadd08caa743` | 237242 | 1 | 19 | 1 | INVALID_LEGALITY_CHANNEL | 1 |
| `99bf0804c3d9` | 401076 | 1 | 19 | 4 | INVALID_LEGALITY_CHANNEL | 4 |
| `14cb8cab6d93` | 287857 | 2 | 11 | 1 | INVALID_LEGALITY_CHANNEL | 4 |
| `92b708471f71` | 222678 | 2 | 17 | 1 | INVALID_LEGALITY_CHANNEL | 1 |
| `6a00c3f5dce7` | 222678 | 2 | 17 | 6 | INVALID_LEGALITY_CHANNEL | 1 |
| `be0cfa185b1c` | 1050219 | 2 | 19 | 0 | INVALID_LEGALITY_CHANNEL | 6 |

## Reproduction and exit criteria

Run `python3 scripts/m7k-select-review-cases.py` from the repository root.
Run `python3 -m unittest discover -s tests -p test_m7k_review_selection.py -v` for selection regression checks.
The selector rejects duplicate, missing, approved or metadata-inconsistent source mappings.
It checks the inherited register's input hash before selection.
Output: `verification-m7k/LC_M7K_REPRESENTATIVE_REVIEW.json`.

K1 preparation passes when coverage is complete and selected identities retain their original hashes.
K1 adjudication remains blocked until independent evidence supplies decisions, expected credits, ends and next actions.
Missing evidence remains missing; no generated worksheet can satisfy that gate.
Production ledger integration and model promotion remain gated as specified in `M7K_PLAN.md`.
