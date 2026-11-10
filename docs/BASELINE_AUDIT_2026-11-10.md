# Baseline audit: 10 November 2026

## Source and boundaries

- Main commit inspected: `19e15def6b5deb8a517c61ec4c16d1a1feef2015`.
- A direct Git clone failed because this environment had no GitHub credentials.
- The working tree combines the Pass 22 source archive with current GitHub blobs.
- All tracked non-document source files matched the main Git tree blob hashes.
- Documentation was not fully reconstructed. The unit suite's source context file was retrieved separately.
- This was not a normal Git checkout. Tests that depend on Git history need a proper clone.
- Gameplay remains `SYNTHETIC_ALPHA`. No research model was promoted.

## Verification

| Check | Result | Evidence and limits |
| --- | --- | --- |
| npm ci | PASS | Node 24.22.1 and npm 11.9.0 on Linux. |
| schemas:check | PASS | 188 schemas. |
| build, typecheck, lint | PASS | Executed in `npm run verify:09:core`. |
| scoring fixture audits | PASS | Fixture audit and scorer comparison passed. |
| independent random vectors | PASS | 24 random-address and eight state-hash vectors. |
| probability and generator checks | PASS | The independent LUT and nine generator fixtures passed. |
| unit tests | PASS | `npm test -- --maxWorkers=2`: 687 tests in 53 files. |
| season acceptance | PASS | 56 fixtures; 14 user and 42 off-screen fixtures. |
| season archive | PASS | Round-trip and deterministic continuation checks passed. |
| current-head interactive browser | BLOCKED | Chromium failed to start: Unix socket returned EPERM. |
| Owner Windows run-through | PASS BY OWNER REPORT | Sam confirmed a completed match and save/reload on Windows. |
| Reference hardware | NOT RUN | Hardware specifications and performance measurements were not supplied. |
| Windows package | PARTIAL | Built on Linux. Archive integrity and local HTTP startup passed. |

On 10 November, Sam confirmed the Windows run-through in response to the supplied `19e15de` test package.
He confirmed a completed match and a save and reload.
The package checksum, browser version and match details were not independently checked on his PC.
This does not establish portable archive import or reference-hardware acceptance.

The first core run reached its unit stage and failed because the source context file was absent from the reconstruction.
The unit suite passed after that file was recovered.
The listed core stages and final unit suite are separate runs.

## Recorded GitHub Actions

Main push run [41246774645](https://github.com/SamForbes70/lord-cricket-xxvi/actions/runs/41246774645) passed.
Both Linux `pass07a` and hosted Windows browser jobs passed.
These are recorded CI results, not a fresh owner-PC run.

PR #25 passed its recorded hosted checks and merged as `3846282`.
Main commit `3846282` passed its recorded post-merge CI run.
PR #24 also had a passing recorded run.
PR #27 and PR #31 had passing runs on their recorded heads.
PR #26 failed a Windows delegation test with `ERR_CONNECTION_FAILED`.
PR #28 timed out during its Windows match UI suite.
PR #30 failed the 150 percent career layout test in Chromium and Firefox.
The PR #30 action button extended below the 768 pixel viewport.
These results require final-head and merge-base review before integration.

## Completion queue

1. Verify each PR's head, merge base and required checks.
2. Reproduce and resolve the 150 percent career layout failure.
3. Investigate the PR #26 connection failure without treating it as a proven game defect.
4. Investigate the PR #28 suite timeout.
5. Complete match navigation recovery across a new browser session.
6. Integrate reviewed analytics and export work in dependency order.
7. Complete Version 0.1 acceptance, including reference hardware and owner-PC checks.
8. Re-estimate from the accepted baseline and remaining backlog.

The evidence does not support a reliable completion date.
