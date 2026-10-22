# Codex baseline recovery and environment acceptance

22 October 2026 (Australia/Brisbane). This run was performed on a Linux cloud host, not the owner's Windows PC.

**Verdict: the recovered engineering baseline builds and runs; full product acceptance remains FAIL/BLOCKED.** All 538 TypeScript unit tests, 72 Python tests and the headless 56-fixture season passed. Selected Linux browser suites finished with **35 passed / 2 layout failures**: Chromium 25/1 and Firefox 10/1. Windows, original-owner-archive and human acceptance remain outstanding. This report does not authorise M7K or research-model promotion.

## Scope and provenance

- Read `AGENTS.md`, `CODEX_START_HERE.md`, `FIRST_CODEX_TASK.md`, recovery/gate documents, capability matrix, next-pass plan, human/browser checklists and the relevant architecture and research ADRs.
- Initial checkout was clean on local branch `work`, at `b8e38e9614fc4340218033b8c42b5a0162e2cf3b`. Created separate branch `codex/baseline-recovery-acceptance` before changes.
- Historical M7J commit `5b8b9da990d657197fb56bbfd33152f87b875f5c` exists, is an ancestor of the source HEAD, and has 22 commits in its reachable history. Its recorded author date is 16 October 2026.
- `git diff 5b8b9da HEAD -- apps packages scripts tests` was empty before this branch's changes. All **10/10** critical file SHA-256 values match `PASS_22_M7J_BASELINE_MANIFEST.json`.
- The migration is application-code-preserving. Strictly calling it “documentation only” is imprecise: it also introduced `tools/windows/publish-private-github.ps1`. The complete migration path list and critical hashes are recorded in [recovery-and-build.json](verification/2026-10-22-cloud/recovery-and-build.json).
- Git HTTPS read access worked (`git ls-remote origin HEAD` returned the source HEAD). GitHub API requests initially returned `Forbidden`/HTTP 403 at the CONNECT proxy. Access later succeeded after the network draft update: [issue #1](https://github.com/SamForbes70/lord-cricket-xxvi/issues/1) was read and reconciled against this report (`github-issue-resolved`). It confirms the source commits, required gates, separate branch/PR, and explicit separation of **local Windows** from cloud results. The original failure log is retained.

## Runtime and evidence

Node **24.19.0**, npm **11.9.0**, Python **3.12.14**, Git **2.52.0**, Playwright **1.56.0**, system Chromium **154.0.8037.57** and Playwright Firefox **142.0.1**; Linux x86_64, five reported CPUs and approximately 34 GB reported memory. Node satisfies `>=22.12.0`. This is not a reference-hardware performance result. The lockfile's source/working SHA-256 values and byte identity are recorded in `recovery-and-build.json`.

Fresh results are under [verification/2026-10-22-cloud](verification/2026-10-22-cloud). Each `*.result.json` records the actual command argv, working directory, UTC start time, duration, exit code and log SHA-256. [SHA256SUMS](verification/2026-10-22-cloud/SHA256SUMS) covers the retained evidence. Historical release results are labelled separately below; previous chat/onboarding results are not counted as fresh runs.

Commands below run from the repository root. For Chromium suites using a configurable browser path, set `LCXXVI_CHROMIUM_EXECUTABLE=/usr/bin/chromium` for UI/core smoke, or `LCXXVI_CHROMIUM_PATH=/usr/bin/chromium` for M4/M5. M6F/M6G and the M7B host configuration already name the system executable. Browser runs used fresh temporary contexts, with no deletion of an owner's existing careers or browser profile.

## Fresh engineering gates

| Status | Command | Exact result / evidence prefix |
| --- | --- | --- |
| PASS | `npm ci --cache /workspace/.npm` | 209 packages installed; lockfile unchanged. `install` |
| PASS | `npm run schemas:check` | 167 JSON schemas verified. `schemas` |
| PASS | `npm run build` | TypeScript references, production web and runtime bundles built. Vite emitted its existing >500 kB chunk warnings. `build` |
| PASS | `npm run typecheck` | Passed before and after test edits. `typecheck`, `typecheck-final` |
| PASS | `npm run lint` | ESLint and all seven package boundaries passed before and after edits. `lint`, `lint-final` |
| PASS | `npm run fixtures:audit` | Historical fixture anchors checked. `fixtures-audit` |
| PASS | `npm run fixtures:engine` | 45 delivery and 45 ledger comparisons matched; 29 invalid cases rejected. Aggregate terminal/clock/persistence/NRR comparisons still report `NOT_IMPLEMENTED`; these are not counted as implemented subsystem tests. `fixtures-engine` |
| PASS | `npm run vectors:check` | 24 random-address and eight state-hash vectors. `vectors` |
| PASS | `npm run probability:check` | 1,601 LUT entries, 15 mass/draw vectors, four boundaries and rejection/oracle checks. `probability` |
| PASS | `npm run generator:check` | Nine hashed fixtures and exact length/legality mass oracles. `generator` |
| PASS | `npm test -- --maxWorkers=2 --exclude tests/unit/red5-match.test.ts --exclude tests/unit/red5-clock.test.ts --exclude tests/unit/season-persistence.test.ts` | **509/509**, 27 files, no skips. `unit-main` |
| PASS after test-budget fix | `npm run red5:rules -- --maxWorkers=1` | **19/19**, two files, no skips. `unit-red5-final` |
| PASS after hook-budget fix | `npm run season:persistence:rules -- --maxWorkers=1` | **10/10**, one file, no skips. `unit-season-final` |
| PASS | `npm run m7j:restore-fixtures` then `python3 -m unittest discover -s tests -p 'test_m7*.py' -v` | **72/72**. Restoration uses four tracked historical derived reports to populate ignored `reference/`; no original Cricsheet ZIP was acquired or refitted. `restore-fixtures`, `python` |
| PASS | `npm run management:acceptance` | 14 rounds, 56 unique fixture completions, 14 user boundaries, 42 off-screen matches, 56 condition applications; active round-10 export/import and deterministic continuation; final archive round-trip; duplicate 57th completion rejected. `management` |

TypeScript total is **509 + 19 + 10 = 538 distinct tests**, not a sum including repeated runs. Final selected unit gates contain no skipped tests.

Initial red-ball execution failed one test at the default five-second limit; assertions completed in approximately 5.7 seconds. A 60-second CLI retry passed all 19. The focused full-exhibition test now has that explicit budget. Initial persistence runs timed out in the **explicit 35-second `beforeAll`**, with all ten tests skipped. A CLI `--hookTimeout=120000` did not override that explicit value. The hook now has a 120-second budget; its final run executed and passed all ten tests (80.49 seconds for the file). Earlier failures and skips remain in `unit-red5`, `unit-season` and `unit-season-isolated` evidence. No assertions were removed or weakened.

Headless final state SHA-256:
`c6560218d3a277b63c957af03c1eaa25fb4031495df0a79687f0371acdaaa38f`

Headless immutable archive SHA-256:
`a10e0cd3bd2d53a4bc25061a0036688f46269d9b53c18b09a52e030105eb0b92`

## Fresh browser gates

Runs used system Chromium. The JSON result files contain full command arguments, including output and trace options.

| Status | Suite / command | Executed result |
| --- | --- | --- |
| PASS | `npx playwright test tests/smoke/app.spec.ts tests/smoke/determinism.spec.ts tests/smoke/probability.spec.ts tests/smoke/generator.spec.ts tests/smoke/world.spec.ts --config playwright.config.ts --project=chromium --workers 1` | **11/11**: engineering shell, batch rejection paths, scoring CLI, frozen random/hash/probability/generator/world agreement across Node, browser and worker. `browser-core-smoke-corrected` |
| FAIL | `npx playwright test --config playwright.ui.config.ts --project chromium --reporter list` | **2 passed / 1 failed**: complete keyboard-only T20 and replay passed; selections/tactics/invalid-field rejection passed; 150% layout failed. `browser-ui` |
| PASS | `npx playwright test --config playwright.m4.config.ts --reporter list` | **6/6**: exact durable reload/resume, second-tab writer exclusion, match save-copy/export/import, previous-checkpoint recovery, failed-save rollback, injected abort atomicity and duplicate-command rejection. `browser-match-persistence` |
| PASS | `npx playwright test tests/m5/odi-ui.spec.ts --config playwright.m5a.config.ts --reporter list` | **1/1** ODI start, progression and durable reload. `browser-odi` |
| PASS | `npx playwright test --config playwright.m5b.config.ts --project chromium-m5b --reporter list` | **1/1** five-day clock, declarations and durable reload. `browser-red5` |
| PASS | `npm run season:persistence:bundle` then `npx playwright test --config playwright.m6f.config.ts` | **1/1** real browser IndexedDB commit/abort/recovery/lease checks. `persistence-bundle`, `browser-season-idb` |
| PASS | `npx playwright test --config playwright.m6g.config.ts` | **2/2** career and keyboard tests. Career creates, navigates Home/Career/Squad/Fixtures/Statistics/Settings, saves training through reload, selects 150% scale, completes all 14 managed fixtures/56-fixture season, exports, imports in an empty context, compares final league table, then reloads imported state. `browser-career` |
| PASS | `npx playwright test --config playwright.m7b.host.config.ts` | **1/1** optional tactical captain submits durable decisions and retains selection/state through reload. `browser-ai` |
| PASS after network correction | `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install firefox` | Initial download failed with HTTP 403 `Domain forbidden`; a retry after GitHub API access demonstrated a runtime change downloaded Firefox 142.0.1/build 1495 successfully. `firefox-install`, `firefox-install-retry` |
| NOT RUN | Full `t20-corpus.spec.ts` browser corpus and aggregate historical verification orchestrators | Representative frozen-vector/browser/worker/batch gates ran as listed; these broader suites are not included in the counts. |
| NOT RUN | Owner's hands-on M3 checklist and Windows/browser acceptance | Automation is not human acceptance. No Windows desktop is attached. |

Selected final Chromium total: **25 passed / 1 failed**, across 26 tests. Baseline diagnostic runs are additional failures, not added to that total. An initial core-smoke command accidentally supplied positional test files after Playwright's variadic `--project` option: it failed before running tests. The corrected invocation ran all 11 selected tests; both logs are retained.

### Linux Firefox follow-up after access was restored

Firefox installed successfully, but its first launch in the restricted command sandbox stalled before test assertions. Diagnostic output included `Sandbox: writing /proc/self/uid_map: EROFS`, unwritable default caches and a compositor error. The career attempt was stopped: the runner recorded **one interrupted / one not run**, not a game-test failure (`firefox-career`, exit 130). A separate initial version probe was also stopped; neither is included in passed counts.

A bounded launch with the supported `require_escalated` execution-permission flow succeeded, returning **142.0.1**. It retained Firefox's sandbox and used writable cache/config paths; no browser protections were disabled. See `firefox-launch-diagnostic` and `firefox-launch-permission-check`. The subsequent suites used that same approved execution context with:

```sh
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
export XDG_CACHE_HOME=/workspace/.cache
export XDG_CONFIG_HOME=/workspace/.config
```

| Status | Command | Executed result |
| --- | --- | --- |
| PASS | `npx playwright test --config playwright.m6g.portable.config.ts --project firefox` | **2/2**: complete career/save/export/import/reload and keyboard focus. `firefox-career-permitted` |
| FAIL | `npx playwright test --config playwright.ui.config.ts --project firefox --reporter list` | **2 passed / 1 failed**: full keyboard T20/replay and selection/tactics checks passed. Desktop 100%/150% and reduced-motion delivery checks passed, then the 390px narrow-view horizontal-overflow assertion failed. Long-name checks after that assertion did not execute. `firefox-ui` |
| PASS | `npx playwright test tests/smoke/determinism.spec.ts tests/smoke/probability.spec.ts tests/smoke/generator.spec.ts tests/smoke/world.spec.ts --config playwright.config.ts --project=firefox-determinism --workers 1` | **4/4** browser/worker/Node frozen-vector agreement. `firefox-core` |
| PASS | `npx playwright test --config playwright.m7b.config.ts --project firefox` | **1/1** tactical captain durable decisions and reload. `firefox-ai` |
| PASS | `npx playwright test --config playwright.m5b.config.ts --project firefox-m5b --reporter list` | **1/1** red-ball clock/declaration/durable resume. `firefox-red5` |

Selected final Firefox total: **10 passed / 1 failed**, across 11 tests. These are Linux browser results, not local Windows or human acceptance. M4's separate six-case repository suite, M6F's isolated atomicity suite and the ODI browser suite were run in Chromium only; their Firefox equivalents were not run.

### Demonstrated test fixes

The untouched baseline selection test failed because it opened `/`, which now renders the management career, and then waited for `Confirm XIs and start`. Exhibition UI, match-persistence and ODI/red-ball tests now open the existing `/#exhibition` route, including secondary tabs. Their assertions are retained. Baseline failure is in `browser-ui-baseline` and its [page snapshot](verification/2026-10-22-cloud/browser/exhibition-route-baseline.md).

The untouched career keyboard test pressed Tab immediately after navigation, before React supplied a focusable element, then timed out waiting for `:focus`. It now waits for the visible Start a Career heading before pressing Tab. No DOM focus injection replaces keyboard navigation. Baseline failure is in `browser-keyboard-baseline` and its [page snapshot](verification/2026-10-22-cloud/browser/career-keyboard-baseline.md).

The existing career test additionally verifies the exported file in a **fresh browser context with empty IndexedDB**, compares the final league table and reloads it. This closes a browser export/import coverage gap without changing the archive format or game logic.

### Open product failures: exhibition desktop and narrow layouts at 150%

At **1366×768, 150% text scale**, the `.decision-top` bottom is **780.296875px**, exceeding the required viewport height by approximately **12.30px**. The score/active/target checks reached that point; the subsequent reduced-motion, narrow-view and long-name checks in the same test did **not execute**. Do not count them as passed. The full keyboard match separately verified presentation changes do not alter replay hashes.

Retained evidence: [clipped viewport](verification/2026-10-22-cloud/browser/exhibition-150-clipped.jpeg), [failure trace](verification/2026-10-22-cloud/browser/exhibition-layout-failure.trace.zip), [100% viewport](verification/2026-10-22-cloud/browser/chromium-desktop-100.png), [completed match](verification/2026-10-22-cloud/browser/chromium-complete.png) and [replay hash record](verification/2026-10-22-cloud/browser/chromium-completion.json). Trace viewer: `npx playwright show-trace docs/codex-migration/verification/2026-10-22-cloud/browser/exhibition-layout-failure.trace.zip`.

The automated match completed in 108 keyboard steps, revision 109, with disabled-bowler reasons observed. Its event hash is `6df9a4c0c4bd8b4f6f6f7097b4bb146fe59eba95a962ced11499b0cd2d3519af`; scorecard hash is `705b171087ce86dfc147626b1ffa4ea2a2d30c045572d778bdfd075d5f968366`. These are observations of this new worker-seeded match, not regenerated deterministic goldens.

Career evidence: [150% home](verification/2026-10-22-cloud/browser/career-home-150.png) and [completed season](verification/2026-10-22-cloud/browser/completed-season.png). These establish captured rendering, not independent human visual acceptance.

Firefox reached the later **390×844, 150%** narrow-view assertion, where `document.documentElement.scrollWidth <= innerWidth` returned **false**. The test did not record the numeric scroll width, so no exact overflow distance is claimed. Its [narrow viewport](verification/2026-10-22-cloud/browser/firefox-narrow-150-clipped.jpeg) and [failure trace](verification/2026-10-22-cloud/browser/firefox-narrow-layout-failure.trace.zip) show the clipped decision controls. [Desktop 150%](verification/2026-10-22-cloud/browser/firefox-desktop-150.png), [completed match/replay record](verification/2026-10-22-cloud/browser/firefox-completion.json) and [completed career](verification/2026-10-22-cloud/browser/firefox-completed-season.png) are retained separately. This is a second evidenced layout failure, not the Chromium desktop assertion repeated under a different name.

## Owner release and rebuilt application

**BLOCKED:** the original owner release ZIP/bundle is absent from this checkout and the mounted upload/download directories. Fresh owner-ZIP CRC, manifest and 894-entry source equivalence cannot be repeated here. The 21 October recovery report remains historical evidence; its archive-verification claims are not presented as new results.

**PASS, rebuilt application only:** `node start.mjs` served the locally built application on port 4180. Local requests returned HTTP 200 for `/`, main JS, match worker and `/engineering.html`; response hashes matched the actual rebuilt files and script MIME types were correct. `node scripts/smoke-prebuilt.mjs` separately checked index and every production asset using its temporary server, then stopped it. See [rebuilt-http-4180.json](verification/2026-10-22-cloud/rebuilt-http-4180.json) and `prebuilt-server`.

The following rebuilt responses also match hashes in the **historical** recovery HTTP evidence:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `main-UAgcvAPq.js` | 510846 | `0567122667cb7b1cef1fd71a938972f718e10b18c78198bb9dea9cdf1d809cd1` |
| `match.worker-CvFgBjcU.js` | 601438 | `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4` |
| `engineering.html` | 723 | `0ff8a7695df28a7cd0fddeea3c3290e655c441fc750a7744fbaa42b0f37fcc7d` |

The index matches the historically recorded 719-byte size; that old entry contains no index hash. This is not a direct comparison with a newly extracted owner release. There is no remote application API to validate: this architecture runs locally in browser workers and IndexedDB, with separate batch CLI boundaries tested above.

## Gameplay quality and promotion requirements

Production remains **`synthetic-alpha-01` / `SYNTHETIC_ALPHA`**. No gameplay source, probability coefficients, rules, save schema, seed addressing or model selection changed in this branch.

Historical findings reviewed, **not refitted or newly reproduced**:

- M7I recorded a synthetic-engine diagnostic of 83.81 mean innings runs over 32 matches. It remains a descriptive concern, not a population-matched real-cricket validation.
- M7F research matched aggregate averages better but failed score tails: P10 **118 vs 83**, P90 **182 vs 212**. M7G research passed seven aggregate sample tolerances while retaining exceptional-event and player/tactic gaps.
- M7H research failed the chase low tail: P10 **80 vs 71**. M7I's high-target P10 was **99 vs 46** in training and **49** in previously inspected development observations, despite closer pooled averages.
- M7I/M7J retain **69 exceptional source rows** for adjudication. They are not automatically repaired, accepted or integrated. M7J explicitly sets `gameplayIntegrationPermitted=false`.
- Repeatedly inspected M7C–M7J development holdout data cannot be relabelled as an untouched final test. Predictive player marginals do not establish fictional 0–100 skills or causal tactical effects.

Before any explicit proposal to promote a new model, require:

1. Approved source rights, retained attribution and source hashes; declared eligible population/exclusions and match-level chronological splitting without same-date leakage. Existing runbook minimums are 200 training and 200 holdout matches; a **new untouched forward-time evaluation cohort** is still required.
2. An immutable, separately versioned candidate fitted only to training data. Predeclare cohort, target-band, termination and phase analyses; do not tune on the final cohort. Report match-bootstrap uncertainty and unsupported-event rates.
3. Evaluate ADR-027's proposed descriptive bands: mean runs within 5%, mean wickets within 0.5, dot/boundary fractions within two percentage points, and score P10/P50/P90 within 10%. Meeting pooled bands alone is insufficient; conditional chase-tail, player-strength and identifiable tactical-effect acceptance must be agreed and independently demonstrated.
4. Independently adjudicated representative exceptional cases with chronology, playing conditions, beneficiary/end/attribution evidence. Any production rules-v2 integration requires versioned ledger/event contracts and complete invariant/replay/save fixtures; never coerce the 69 source rows by default.
5. New-game model/rules pins and explicit migration/rejection behaviour, retaining exact historical `synthetic-alpha-01` replay. Browser/IndexedDB tests, both open 150% layout failures, remaining cross-browser/Windows coverage, reference-hardware budgets and the owner's M3 human checklist must be resolved.
6. **Explicit owner approval** before exposing a research model in gameplay. No approval is inferred from these tests.

## Changes, remaining actions and next bounded pass

This branch changes only acceptance tests, two expensive test time budgets, this report and fresh evidence. Production source, dependency declarations, lockfile, schemas, scoring fixtures and deterministic goldens remain unchanged. Generated historical `docs/evidence` files overwritten by smoke tests were preserved into this run's evidence directory and restored to their original tracked bytes.

Environment draft additions saved: `api.github.com`, `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`, preserving the existing package-manager presets. Subsequent API reads, PR creation and Firefox download succeeded in this instance. Complete `install_script` and `start_skill` contents were refreshed to reproduce Firefox installation and document startup/permission requirements. These observed runtime successes do not establish environment publication or fresh-task restoration: review/save the draft and publish through environment settings when ready.

Issue #1 has been read and [draft PR #2](https://github.com/SamForbes70/lord-cricket-xxvi/pull/2) is open against `main`. It remains unmerged; issue #1 remains open. Required outside actions include providing the preserved owner release for direct comparison and completing the Windows/M3 hands-on checklist with tester/date/browser/build and observed results. No secret values are needed in chat.

The next bounded development task is to repair and independently validate the exhibition's 150% desktop and narrow layouts, then finish the skipped long-name/layout checks, remaining cross-browser/Windows and human acceptance. **Do not start M7K, change the scorer/model or promote research during that task without a new explicit instruction.** No merge is authorised or performed.
