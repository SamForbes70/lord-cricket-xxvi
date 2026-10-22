# Layout and CI acceptance follow-up

22 October 2026, Australia/Brisbane. Follow-up to the baseline at `68f0e0a`, on PR #2's existing branch. This is presentation and verification work, not M7K or model promotion.

## Fixed layout failures

Career styles applied `min-width:760px` to **every** table, including exhibition scorecards. Those three table/header/cell rules are now scoped to `.career-shell`. Career tables keep their existing scroll wrappers; exhibition scorecards use their own responsive styles. No overflow-hiding rule masks the problem.

The tactical captain banner now uses a responsive grid with a smaller supporting-text hierarchy. Match-only heading margins and score/active-strip padding give the decision controls room at 150% without reducing score or decision text size. A new `match-shell` class scopes those spacing changes to the exhibition.

The existing browser regression is stronger: it checks both delivery buttons inside the desktop viewport, and the buttons/decision area inside the narrow viewport. It still checks full document width after substituting a long name, and now records numeric bounds. No previous assertion was removed to achieve a pass.

| Measurement, at 150% | Before | Final rebuilt application |
| --- | ---: | ---: |
| Chromium decision-header bottom, 1366×768 | 780.296875px | **679.078125px** |
| Chromium delivery-button bottom, 1366×768 | Not recorded in the original gate | **750.078125px**, fully inside 768px |
| Firefox decision-header bottom, 1366×768 | 734.433334px | **666.199951px** |
| Firefox delivery-button bottom, 1366×768 | Not recorded in the original gate | **733.200012px**, fully inside 768px |
| Chromium/Firefox document width at 390×844 | **795px** in the production diagnostic probe | **390px**, including the long-name stress case |

Before metrics are in [before-metrics.json](verification/2026-10-22-layout/before-metrics.json); final metrics are in [Chromium](verification/2026-10-22-layout/browser/chromium-layout.json) and [Firefox](verification/2026-10-22-layout/browser/firefox-layout.json) records. Final screenshots cover desktop 100%/150%, narrow 150% and long-name 150% in the same evidence directory.

## Fresh local validation: Linux

| Status | Command | Result |
| --- | --- | --- |
| PASS | `npm run build` | Production web/runtime built; existing bundle-size warnings remain. `build-final.log` |
| PASS | `npm run typecheck`, `npm run lint` | Type checking, ESLint and all seven package boundaries passed after the final regression edits. `typecheck-regressions`, `lint-regressions` |
| PASS | `npm run schemas:check` | 167 schemas verified. `schemas` |
| PASS | `npm run fixtures:engine` | 45 delivery and 45 ledger observations matched, 29 invalid cases rejected. The fixture tool's historical aggregate comparisons remain `NOT_IMPLEMENTED`. `fixtures` |
| PASS | `npm run vectors:check`, `npm run probability:check`, `npm run generator:check` | Frozen hash/random, independent LUT/mass and generator checks passed. `vectors`, `probability`, `generator` |
| PASS | `npm test -- --maxWorkers=2` | **538/538**, all 30 files, no skips; 39.879 seconds including npm/runner overhead. `unit` |
| PASS | `npx playwright test --config playwright.ui.config.ts --reporter list --output /tmp/lcxxvi-layout-ui-final --trace on` | **6/6**: three tests in each browser. Full keyboard-only T20/replay, 100%/150%, reduced motion, narrow layout, long names, save-control visibility and tactics rejection all executed. `ui-final` |

The browser command used `LCXXVI_CHROMIUM_EXECUTABLE=/usr/bin/chromium`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`, writable XDG cache/config locations and the supported Firefox execution-permission flow documented in the baseline. Screenshot output was set through `LCXXVI_UI_EVIDENCE_DIR=docs/codex-migration/verification/2026-10-22-layout/browser`. Chromium 154.0.8037.57 and Firefox 142.0.1 ran on Linux. These are automated results, not human or local Windows acceptance.

The earlier `ui` and targeted `layout-regressions` runs are retained as intermediate evidence; the final six-test result above is not a sum including reruns. Each `*.result.json` records command, working directory, UTC start time, elapsed time, exit code and log hash. `SHA256SUMS` covers the retained evidence.

## CI diagnosis and correction

The downloaded artifact from failed [PR run 39748872660](https://github.com/SamForbes70/lord-cricket-xxvi/actions/runs/39748872660) shows **15/16 gates passed**. Its full browser smoke suite passed **23/23**, including all 100 frozen T20 cases in both browser main threads and workers. The sole failure was the `unit` subprocess: the historical verification wrapper killed `npm test` at **90,018ms** with `spawnSync npm ETIMEDOUT`, before a final test result. See `ci-before/results.json`, `ci-before/unit.log` and `ci-before/smoke.log` in this follow-up's evidence directory.

The unit gate now caps Vitest at two workers and permits 300 seconds, matching the larger recovered suite. A timeout or nonzero exit still fails verification. No tests are excluded. Expected-count metadata is corrected from 390/15 to the current 538 unit/23 smoke tests. The inherited orchestrator retains its existing outer bound.

The Linux workflow now executes the two browser layout regressions after the existing verifier, and uploads their measurements/screenshots on failure or success. A new **Windows** job installs Playwright-managed Chromium/Firefox, builds the app, runs all six match UI tests and all four portable career tests, and uploads screenshots/traces. It has read-only repository permissions and a 20-minute limit. A failed UI test does not suppress an independent career run after a successful build.

CI results are tied to the exact tested revision in [PR #2 checks](https://github.com/SamForbes70/lord-cricket-xxvi/pull/2/checks); Actions logs/artifacts and the PR description record the rerun verdict. The historical failure above is preserved, not relabelled as passed.

## Preserved boundaries and outstanding work

The production match worker still has SHA-256 `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4`, identical to the baseline. Simulation packages, model/rule/RNG/event contracts, deterministic goldens, schemas, dependency declarations and lockfile are unchanged. Presentation bundle hashes legitimately change. File hashes for this fix are in `source-and-worker-hashes.json`.

**NOT RUN here:** the owner's local Windows PC and human M3 playthrough. Accessing this chat from Windows does not attach that PC to the execution tools. The hosted Windows CI job supplies automated Windows evidence; it does not supply a human playthrough or reference-PC performance result. [WINDOWS_ACCEPTANCE_HANDOFF.md](WINDOWS_ACCEPTANCE_HANDOFF.md) gives reproducible local commands and the human result fields.

**BLOCKED:** direct owner-release comparison. No owner ZIP/bundle was present in the mounted archive/upload locations when checked. The original bytes and manifest are still needed; no original release or personal IndexedDB data have been fabricated or cleared. When supplied, extract outside the checkout and compare actual files/responses, retaining expected presentation differences from this fix.

Keep PR #2 unmerged and gameplay `SYNTHETIC_ALPHA`. Do not begin M7K or promote research models. The remaining acceptance work is the Windows/local human record and owner-archive comparison, plus any demonstrated failures from the new CI runs.
