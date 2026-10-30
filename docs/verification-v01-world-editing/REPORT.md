# V01-005: New-game names and colours verification

## Scope

This change stages names and team colours for a new career or exhibition. It validates and hashes a versioned copy of the fictional world. Stable IDs, roster membership, player skills, pitch data and rules remain tied to the frozen world. Match engines still use that frozen world; the copy changes presentation. See [ADR 034](../decisions/ADR-034-NEW-GAME-WORLD-COPIES.md).

Edited careers and matches use new save and portable archive versions. A save stores its copy atomically and rejects a missing, changed or damaged copy. Recovery retains the associated copy. V1 saves retain their original readers and are not migrated. An older application may reject a new V2 archive. The editor can download and reopen its validated copy. Arbitrary roster imports are outside this slice.

## Environment and baseline

The work started at `fba9d508215865264ed8835a9da551868ffbb35c` on Linux with Node v24.19.0 and npm 11.9.0. The browser checks used Playwright Chromium and Firefox on this host. These results do not replace a human Windows playthrough. No simulation or domain package, frozen world data, or dependency lockfile was changed.

## Checks

- `npm run build`: passed.
- `npm run schemas:check`, `npm run typecheck` and `npm run lint`: passed; 169 schemas and all seven dependency boundaries verified.
- `npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=/workspace/v01-edit-unit-final.json`: 654 tests in 43 files passed.
- `npm run smoke -- --reporter list`: 23 production smoke checks passed, including all 100 frozen T20 replay cases in Chromium and Firefox.
- `npm run fixtures:audit`, `npm run fixtures:engine`, `npm run vectors:check`, `npm run probability:check` and `npm run generator:check`: passed. The scorer matched 45 delivery and 45 ledger cases and rejected 29 invalid cases. Vector checks covered 24 random addresses, eight state hashes and nine generator fixtures.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 94 passed.
- `npx playwright test --config playwright.m4.config.ts --reporter list`: seven Chromium match-persistence checks passed, including atomic edited saves, immutable copies and recovery.
- `npm run season:persistence:bundle` followed by `npx playwright test --config playwright.m6f.portable.config.ts --reporter list`: two checks passed in Chromium and Firefox. They cover aborted transactions, copy integrity and recovery.
- `npx playwright test --config playwright.m6g.portable.config.ts --reporter list`: all 18 career checks passed in Chromium and Firefox, including six edited-world checks. They cover full seasons, match saves, portable imports, keyboard access and long names at 150% on a narrow viewport.
- `npx playwright test --config playwright.ui.config.ts --reporter list`: all 10 match-interface checks passed in Chromium and Firefox, including the two edited-exhibition checks. Each of those exercises T20, ODI and red-ball exhibitions, a saved match action, reload and portable import.

The retained logs record the commands and results. The initial unit run exposed two stale schema-inventory counts; the updated checks also assert the new schema names. An early import test submitted a file before the worker enabled the control; the test now waits for readiness. The first narrow-screen check exposed an overflowing career import control; the layout was fixed and the expanded check now passes in both browsers. Initial failure logs are retained with the passing reruns.

The fixture audit explicitly reports that its terminal-clock persistence and net-run-rate comparison is not implemented. This work does not claim historical validation or promotion of a research model.
