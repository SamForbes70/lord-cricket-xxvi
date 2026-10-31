# Scorecard export verification

Completed matches provide a UTF-8 CSV download and a printable scorecard for T20, ODI and red-ball. Both use the final scorecard projection and identify the format, rules and synthetic-alpha model. The export reports when the red-ball scorecard does not provide an extras breakdown. It does not infer whether an undismissed listed batter faced a ball.

CSV fields are quoted and embedded quotes are escaped. Cells that begin with spreadsheet formula characters, including after leading whitespace or controls, are prefixed with an apostrophe. The export includes a UTF-8 byte-order mark for spreadsheet compatibility.

## Local verification

- `npm run verify:09:core`: 185 schemas and 684 tests in 53 files passed. Build, type checking, lint, fixture and deterministic vector gates passed. This run preceded the two inherited test deadline increases and the print-layout change; the deadline tests, build and lint were rerun afterwards.
- `playwright test --config playwright.ui.config.ts tests/ui/scorecard-export.spec.ts`: 6 passed. Chromium and Firefox each played T20, ODI and red-ball matches, downloaded the scorecard, checked the total and model label, and rendered the print view.
- Production smoke: 23 passed against the final build.
- Firefox used `MOZ_DISABLE_CONTENT_SANDBOX=1` on the Linux host. Chromium used the host executable.

The browser checks emulate print media; they do not confirm output from a physical printer. This branch depends on PR #25 and requires hosted CI before integration.

A hosted Windows run stopped the match UI suite at its 15-minute process deadline after 49 checks had passed. The runner reported `ETIMEDOUT`; no assertion failure was reported. The match UI deadline is now 20 minutes and the hosted job limit is 45 minutes. The acceptance-plan unit tests and lint passed after this change. A new hosted run must complete the full suite.
