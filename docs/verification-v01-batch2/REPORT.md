# V0.1 batch 2: player pages and pitch inspection

## Scope and result

This slice delivers V01-003 and V01-004 on the synthetic-alpha model.
Its baseline is main commit `c666902bb1cdb568712945093fabf22f69dec324`.
The backlog marks both items as delivered pending integration of this revision.
The next eligible slices are new-game names and colours, roster import, and settings.

Player pages open by stable player ID from Squad and Statistics.
They separate format-specific fictional base ratings, current T20 career condition, and recorded T20 season performance.
The format selection survives navigation and reload.
ODI and red-ball career statistics are identified as unavailable; an empty T20 season is not presented as recorded zeroes.
Returning from a player page restores focus to its source link.

Exhibition setup and the next career fixture show the selected ground's seam and spin assistance before a match starts.
These are the existing pitch values used by the generator; the panel explains the neutral value and pitch wear.
It labels unused conditions and unavailable forecasts and does not expose a new weather control.

## Verification

The following commands ran on 30 October 2026 on Linux x86-64 with Node `v24.19.0` and npm `11.9.0`.
The Playwright runs used the installed Chromium and Firefox browsers with their normal host sandboxing.
Logs in this directory retain the output with terminal styling and trailing spaces removed.
`MANIFEST.json` records their SHA-256 hashes.

| Command | Result |
| --- | --- |
| `npm run build` | PASS. Web and runtime production builds complete. Vite reports its existing large-chunk warning. |
| `npm run typecheck` and `npm run lint` | PASS. TypeScript and all seven dependency and ambient API boundaries pass. |
| `npm run schemas:check` | PASS. 167 schemas verified. |
| `npm run fixtures:audit` and `npm run fixtures:engine` | PASS. 45 delivery and ledger cases match; 29 invalid cases are rejected. The fixture report separately marks terminal, clock, persistence and NRR comparison as not implemented. |
| `npm run vectors:check` | PASS. 24 random-address and eight state-hash vectors verified. |
| `npm run probability:check` | PASS. 1,601 lookup entries, 15 mass/draw vectors and four boundaries verified. |
| `npm run generator:check` | PASS. Nine hashed fixtures and the length and legality mass oracles verified. |
| `npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=/workspace/v01-batch2-unit.json` | PASS. 645 tests in 41 files. |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | PASS. 94 tests. |
| `npx playwright test --config playwright.ui.config.ts --reporter list` | PASS. Eight tests across Chromium and Firefox, including the 150% desktop and narrow layouts, long names, and pitch inspection at two grounds in all three formats. |
| `npx playwright test --config playwright.m6g.portable.config.ts --reporter list` | PASS. Ten tests across Chromium and Firefox, including a complete season, portable export and fresh-context import. |
| `npx playwright test --config playwright.m6g.portable.config.ts tests/m6g/player-page.spec.ts --reporter list` | PASS. Eight focused tests across both browsers, including player navigation, source statistics, focus, next-fixture pitch and 150% narrow-screen layout. This later run adds the narrow-screen check to the ten-test full career run. |
| `npm run smoke -- --reporter list` | PASS. 23 tests, including the 100-case T20 replay corpus across Node, Chromium, Firefox and browser workers. |

The first full browser runs were interrupted after Firefox stalled inside the cloud process sandbox.
The host-sandbox reruns above completed; the interrupted logs are retained separately.

## Compatibility review and limits

The source diff changes presentation, a read-only career projection, tests and delivery records.
It changes no simulation package, schema, dependency lockfile or saved-game format.
The production match worker has SHA-256 `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4`, matching the prior baseline worker.
These checks do not replace owner-PC acceptance or reference-hardware performance measurements.
They do not approve empirical model promotion or resolve the separate historical and untouched-cohort evidence gates.

The final revision requires review and green Linux and hosted Windows CI before merge.
CI job results and any artifact-storage limit are recorded on the pull request.
