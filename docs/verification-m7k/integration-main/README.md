# M7K integration with merged main

Integration base: `b4aceda9182eea1f727c48bbf764042f24b1f199`.
Research head before integration: `5baea6afed9116f39dc6ee468b7846b75da2681a`.
The roadmap combines current acceptance and the scenario harness with the detailed M7K plan.
The CI workflow retains both the six summary tests and the four research-selector tests.
No source-case approval flag changes.

Fresh local checks pass:

- The full TypeScript suite passes 542 tests across 31 files.
- The full `test_m7*.py` set passes 76 tests, including the four selector tests.
- The six synthetic-summary Python tests pass separately.
- The focused four-selector run also passes; it is included in the 76-test total.
- All 31 inherited evidence hash entries verify.
- Selection regeneration reproduces 45 signatures covering all 69 cases byte for byte.
- The source-batch verifier reproduces all 11 event checks across seven matches byte for byte.
- Schema, build, typecheck, lint, scoring fixture, RNG, probability and generator checks exit zero.

`COMMANDS.json` records exact local invocations, timestamps, elapsed times and log hashes.
`EVIDENCE_CHECK.json` records provenance and disabled approval checks.
`SOURCE_BATCH_COMMAND.json` records the extra source-data check and unchanged compiled worker hash.
Original research data remain outside the checkout; only derived evidence is retained here.
The original source ZIP is not redistributed.
This run establishes integration consistency, not independent legal adjudication or model promotion.
Full browser/Windows checks run separately in fresh CI on the integration commit.
`SHA256SUMS` covers this directory except itself.
