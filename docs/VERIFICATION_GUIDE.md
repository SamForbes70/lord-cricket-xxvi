# Verification and evidence guide

## Select the correct layer

| Change | Starting evidence | Integration evidence |
| --- | --- | --- |
| Contracts or schema dispatch | `npm run schemas:check`, relevant unit tests | Core gates and supported save fixtures |
| Scoring, RNG or generator | Fixture and independent Python vector checks | Core gates, deterministic replay and cross-format browser checks |
| Career orchestration | Career service and roster-season unit tests | `npm run management:acceptance` and management browser suites |
| IndexedDB or portable archives | Persistence validation unit tests | Real Chromium/Firefox persistence, archive and interruption cases |
| Match presentation or controls | Relevant UI checks | Both browsers, keyboard, narrow viewport, terminal state and replay |
| Analytics | Accepted-event reconciliation | All formats, completed matches, rebuild/cancellation and replay |
| Documentation only | Source review, relative-link checks, whitespace/diff review | Required hosted PR checks; do not claim local application tests were rerun |

## Core command

Run `npm ci` using Node >=22.12 and the committed lockfile, then `npm run verify:09:core`. This includes schema checks, build, type checking, lint and dependency boundaries, scoring fixtures, RNG/probability/generator reference vectors and Vitest. Python 3 is required for the independent reference checks.

`npm run management:acceptance` exercises the complete fictional 56-fixture season. Its successful result does not establish multi-season progression, which remains future scope.

## Browser suites

Install Chromium and Firefox with `npx playwright install chromium firefox`; Linux hosts may also require the browser system dependencies. Do not reinterpret a launch or missing-library error as a product assertion failure.

`npm run test:ui` uses `playwright.ui.config.ts`, built Vite output, both browsers and a preview server on port 4180. Run `npm run build` first. The configuration does not reuse an existing server. It retains traces on failure and writes JSON evidence under `docs/verification-pass09/`; review generated changes before committing.

`npm run smoke -- --workers=1` runs the default smoke configuration. Format and milestone scripts such as `test:m4`, `test:m5a`, `test:m5b`, `test:m6f` and `test:m6g` use separate configurations. Inspect each configuration's web server/build command before assuming the main build supplies its fixture bundle.

A reload, replacement tab, new context and browser process restart are distinct tests. Session-storage loss can be shown with a new tab in a retained context. Full restart acceptance needs retained IndexedDB and the intended browser profile/origin. Record which boundary was actually exercised.

## Hosted checks

[The workflow](../.github/workflows/verify.yml) runs on pull requests and pushes to main:

- `pass07a`: Ubuntu 24.04, Node 22, synthetic diagnostic tests, research review provenance, core verification, research archive browser acceptance, production performance observations and layout regressions.
- `windows-browser-acceptance`: Windows, Node 22 and `scripts/owner-acceptance.mjs --skip-install`, with a 45-minute job timeout.

Both jobs collect structured evidence even on failure. Uploaded artifacts have seven-day retention. Retain durable release evidence in the approved repository/report process before expiry; a temporary artifact URL is not a permanent acceptance record.

Check names alone do not describe every assertion. Inspect the workflow and collector on the tested revision. Record the PR head, tested merge revision when applicable, base and conclusion. Rerun when integration changes the relevant code; never borrow another branch's green badge.

## Evidence record

For each meaningful run, record:

1. Source revision, branch/base, working-tree changes and date.
2. OS, Node/Python/browser versions and relevant configuration.
3. Exact command, exit status, assertion totals and elapsed time where useful.
4. PASS, FAIL, BLOCKED or NOT RUN, with the actual diagnostic.
5. Logs, traces or report location and hashes for distributables when required.
6. What remains untested and the next action.

Do not combine overlapping suite counts into a misleading total. Hosted Windows is not the owner's PC; performance observations are not automatically reference-hardware acceptance. Synthetic model checks are not empirical calibration.

## Release and owner acceptance

[Acceptance reconciliation](ACCEPTANCE_RECONCILIATION.md) retains the successful owner observations and outstanding checklist. [Issue #1](https://github.com/SamForbes70/lord-cricket-xxvi/issues/1) remains open for residual local evidence. Use the [local collector](LOCAL_ACCEPTANCE_COLLECTOR.md) and [Windows handoff](codex-migration/WINDOWS_ACCEPTANCE_HANDOFF.md) for that evidence.

Release readiness also requires supported import/update/offline behaviour, accessibility, hardware budgets, packaging and capability reconciliation from the backlog. Passing a development suite does not by itself close those gates.
