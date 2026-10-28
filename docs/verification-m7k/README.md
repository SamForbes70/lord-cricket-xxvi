# M7K readiness evidence

Date: 26 October 2026 (Australia/Brisbane).
Baseline: `036c21239026a36ee9eaf4aac8e766ec74e2854e`.

Fresh `npm run m7j:test` exits zero: 12 TypeScript tests and five Python tests pass.
`CHECK_RESULTS.json` records commands, durations and exit codes for nine additional checks.
All nine checks exit zero; individual logs retain their actual output.
The build retains the existing bundle-size warnings.

A direct worksheet check compares all nine copied identity/evidence fields against every M7J register row.
It also checks the register hash, 69-case count, false confirmation flags and empty evidence references.
`worksheet-check.log` records its result.
`READINESS_COUNTS.json` summarises the worksheet, rather than independent adjudications.
The worksheet contains no original licensed match archive and no new umpire evidence.

The full 538-test suite, management season and browser suites were not rerun locally for this documentation-only pass.
Earlier acceptance results remain historical evidence; this directory does not count them as fresh runs.
No new gameplay acceptance, calibration, performance acceptance or promotion is claimed.
`SHA256SUMS` covers retained evidence except itself.


## Representative selection follow-up

`REVIEW_CHECK_RESULTS.json` records the fresh follow-up commands and their exit codes.
Four selector tests and five inherited Python tests pass; lint and byte-identical regeneration pass.
Linux CI now gates the selector tests and verifies reproducible output.
The new report selects 45 observed signatures covering every original row exactly once.
It flags match 1391336 for separate non-retirement dismissal review.
See `../M7K_REPRESENTATIVE_REVIEW.md` for the case list and evidence limitations.
