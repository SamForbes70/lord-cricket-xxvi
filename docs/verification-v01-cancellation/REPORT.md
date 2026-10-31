# Match advance cancellation

The stop control requests cancellation after the in-flight command commits.
The client sends no next command after that acknowledgement.
A worker failure ends the sequence and reports recovery guidance.
The existing save retains the last committed revision.

`npm run verify:09:core` passed 185 schema checks and 680 tests across 52 files.
It also passed build, type check, lint, fixture audit, scorer and vector gates.
Ten focused Chromium and Firefox checks passed for cancellation, format advances and layouts.
The cancellation test delayed a command, requested a stop and reloaded the committed revision.
Firefox used the cloud host sandbox override.
An earlier type check failed on the test delay helper; the corrected helper passed the core run.
Hosted checks remain required. The full V01-009 command-sequence reporting criterion remains under review.
