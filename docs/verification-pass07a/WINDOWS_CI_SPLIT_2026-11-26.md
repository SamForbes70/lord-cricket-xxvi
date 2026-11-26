# Hosted Windows CI split by browser, 26 November 2026

## Problem

The `windows-browser-acceptance` job ran `scripts/owner-acceptance.mjs --skip-install` as one serial run and took 87 to 130 minutes per pull request. Measured from the job logs of four green runs on 26 November 2026 (jobs 139819793864, 139796913178, 139778663446 and 139760336068; the step times come from the `<step>: running` and `<step>: PASS` lines):

| Step | Fastest run | Slowest run |
| --- | --- | --- |
| Whole job | 87 min | 130 min |
| `match-ui` (both browsers, serial) | 66.6 min | 96.3 min |
| `unit` | 10.5 min | 18.6 min |
| `career` | 5.0 min | 7.6 min |
| `performance-observations` | 2.0 min | 3.5 min |
| Everything else in the collector | about 2 min | about 3 min |

The `match-ui.json` report of the fastest run (artefact of run 45793980978) splits the UI suite into 27.3 min of Chromium tests and 39.0 min of Firefox tests. Firefox is about 59% of every browser suite. The slowest files are `managed-recovery.spec.ts` (5.0 min Chromium, 6.9 min Firefox), `scorecard-export.spec.ts` and `analytics-formats.spec.ts`.

## What changed

The Windows work now runs as three parallel legs of one matrix job, `windows-acceptance`, plus a small aggregating job that keeps the old check name.

| Leg | What it runs |
| --- | --- |
| `windows-acceptance (core)` | Both launcher script checks, `npm ci`, Chromium installation, `schemas-check`, `build`, `typecheck`, `lint`, `fixtures-engine`, `frozen-world`, `unit`, `persistence-m4` (Chromium only, as before), then the EXE build, smoke test and `windows-game` package |
| `windows-acceptance (chromium)` | `npm ci`, Chromium installation, `build`, then `match-ui`, `career`, `research-browser` and `performance-observations` with `--project=chromium`, and the two research and performance builds they serve |
| `windows-acceptance (firefox)` | The same as the Chromium leg with `--project=firefox` |
| `windows-browser-acceptance` | Runs on Ubuntu after the three legs, even when one fails, and fails unless the whole acceptance run is accounted for (below) |

`scripts/owner-acceptance.mjs` takes a new `--scope=core|chromium|firefox` option. The step list itself is unchanged: `scripts/acceptance-scope.mjs` selects each leg's steps from it, adds Playwright's own `--project` filter to the four browser suites, and keeps every timeout (the 140-minute `match-ui` budget and the 30-minute `unit` limit apply per leg). A step that is not assigned to a leg stops the run with `UNASSIGNED_ACCEPTANCE_STEP`, so a new step cannot be left out of hosted CI by accident. Without `--scope` the script runs exactly as before, and the owner-PC gate (`--owner-pc`) is refused with any other scope.

`build` runs in every leg because the browser suites serve the production build; the core leg still owns it as a check. No test is skipped, retried, quarantined or filtered by name.

## Evidence

- Each leg writes its own `acceptance.json`. The full run keeps `LC_OWNER_ACCEPTANCE_EVIDENCE_V1` with no new field; a leg writes `LC_OWNER_ACCEPTANCE_EVIDENCE_V2`, which adds only `scope`. The plan output follows the same rule (`LC_OWNER_ACCEPTANCE_PLAN_V1` and `_V2`).
- `scripts/ci-evidence.mjs --kind=windows --scope=<leg>` checks the leg's report as before (fresh files, this commit, every command `PASS` with exit code 0, upstream job status) and also that the report names the same leg. A browser leg must have its own browser's two observation files; the core leg has none. Its log chunks and job summary are the same as before, in `LC_CI_EVIDENCE_V2`, which adds only `scope`. The Linux job and a full Windows run still produce `LC_CI_EVIDENCE_V1`.
- Each leg also passes a compact record (`LC_CI_LEG_SUMMARY_V1`: commands with status, exit code, time and passed count, observation names, checksums of the report and of the full evidence) to the aggregating job as a job output, because artefact uploads remain best effort.
- `scripts/ci-evidence.mjs --combine` (the `windows-browser-acceptance` job) fails unless: all three legs succeeded; each record is present, from this commit and `PASS`; each leg ran exactly the steps its plan names, in order; together the legs ran every step of the full plan; each browser leg wrote its own observations, so all four exist; and Chromium and Firefox passed the same, non-zero number of tests in each of `match-ui`, `career`, `research-browser` and `performance-observations` (126, 12, 15 and 2 each at `d9bb921` by `npx playwright test --list`). It retains the leg records in its log and summary as `LC_CI_EVIDENCE_AGGREGATE_V1`.
- Artefacts: `windows-browser-acceptance-core`, `-chromium` and `-firefox` replace the single `windows-browser-acceptance` artefact (same folder, same seven-day retention); `windows-game` is unchanged and comes from the core leg.

## Branch protection

Read on 26 November 2026 with `gh api repos/SamForbes70/lord-cricket-xxvi/branches/main/protection`: no status check is required (`"contexts":[]`, `"checks":[]`), and the repository has no rulesets. [BRANCH_PROTECTION.md](../BRANCH_PROTECTION.md) asks the owner to require `pass07a` and `windows-browser-acceptance`, so the aggregating job keeps that exact name. No repository setting was changed.

## Expected time

Estimated by assigning the measured steps above to legs and splitting each browser suite by the measured 41 to 59 share:

| | Fastest measured run | Slowest measured run |
| --- | --- | --- |
| Core leg | about 15 min | about 23 min |
| Chromium leg | about 31 min | about 45 min |
| Firefox leg (sets the wall time) | about 46 min | about 67 min |
| Before | 87 min | 130 min |

So about 45 to 50% less wall time, plus under a minute for the aggregating job. Runner minutes rise about 6% (three set-ups, three `npm ci` and three builds). This is an estimate; the pull request's own hosted run is the measurement.

## Not done

Playwright browsers are not cached: downloading both browsers took 14 to 18 s in the measured runs, and restoring a cache on Windows takes about as long. Splitting Firefox further (sharding) would cut more time but changes how the suites share one preview server, so it is left for a later change.

## Combining with pull request #157

Pull request #157 (`ci/windows-connection-failed`) adds network diagnostics to the `match-ui` step and the UI preview server. This change does not touch `playwright.ui.config.ts`, and in `scripts/owner-acceptance.mjs` it changes only lines that #157 leaves alone, so the two merge without conflict. The scope module spreads each step, so #157's `networkDiagnostics` flag stays on `match-ui` in both browser legs, and each leg's diagnostics land in that leg's artefact.

## First hosted run (run 45826620776, head `8322c8e`)

| Job | Result | Time |
| --- | --- | --- |
| `windows-acceptance (core)` | success | 13.4 min (`unit` included) |
| `windows-acceptance (firefox)` | success | 47.2 min (`match-ui` 126 passed in 40.9 min, `career` 3.4, `research-browser` 0.4, `performance-observations` 1.4) |
| `windows-acceptance (chromium)` | failure | 28.4 min (`match-ui` 125 passed, 1 failed, 27.4 min; the later steps did not run because the collector stops at the first failure) |
| `windows-browser-acceptance` | failure, as designed | 5 s; it received all three leg records through the job outputs and named the failed Chromium leg, its unrun steps and missing counts |

Windows wall time for the run: 47 minutes, against 87 to 130 before.

The Chromium failure was `tests\ui\offline-assets.spec.ts:3` (test 63): after `page.goto("/#exhibition")` the page showed "The match worker stopped." because the request for `/assets/match.worker-BzDEGMt7.js` failed with `net::ERR_ABORTED` before it was sent (no connect, send or wait time in the trace's `0-trace.network`). In the same page load, `/`, the stylesheet, `main-BXzVXuU6.js` and the fonts were served with HTTP 200. The worker's `onerror` then set the fatal state, so the start button never appeared.

Checked against the split, and not caused by it:

- The served build is the same. `match-ui` serves `apps/web/dist`, written by `build` in both layouts; none of the steps the Chromium leg leaves out (`schemas-check`, `typecheck`, `lint`, `fixtures-engine`, `frozen-world`, `unit`, `persistence-m4`) writes there, and the research and performance builds write to `tests/m7k/dist` and `tests/acceptance/dist` and run after `match-ui` in both layouts.
- The test order is the same: Chromium is the first project with one worker, so test 63 had the same 62 tests before it, against one `vite preview` server on port 4180 started for the step.
- The environment is the same: the collector passes the same `LCXXVI_*` and `PLAYWRIGHT_JSON_OUTPUT_NAME` variables; the only new argument is `--project=chromium`. No earlier step uses port 4180 and each test has a fresh browser context, so no service worker carries over.
- No earlier hosted run of the single job failed this test: none of the 169 failed Windows jobs since the middle of November lists `offline-assets.spec.ts` among its failures.

The signature (Chromium only, on hosted Windows, one request failing before it is sent while the server serves the requests around it) matches the intermittent fault recorded in `WINDOWS_CONNECTION_FAILED_2026-11-26.md` on pull request #157 (about three in 380 runs on the single job). That pull request's Chromium NetLog would name the operating-system error. With one occurrence the link is likely but not proven. No retry, skip or test change was made.
