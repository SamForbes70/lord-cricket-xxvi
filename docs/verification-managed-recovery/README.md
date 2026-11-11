# Managed-match recovery verification

## Baseline (before the change)

On 11 November 2026 (Brisbane), against main `c37f1e0`, `npm ci` and `npm run build` passed on Linux. The Chromium command `npx playwright test --config playwright.ui.config.ts tests/ui/managed-recovery.spec.ts --project chromium --reporter=list` failed as expected: after closing the original tab, the saved match returned at the same revision, but the career-result handoff message was absent. See `fresh-tab-baseline.log`.

## After the change

The regression is replaced by behavioural specs in `tests/ui/managed-recovery.spec.ts`. Each asserts what happens to the career, not only that a banner appears:

- A standard match closed mid-play is restored in a fresh tab, finished, and its result applies once (the career shows one completed fixture before and after a reload, and the binding is `APPLIED`).
- A match completed in a lost tab is applied when the career opens, with no match page.
- Abandoning a match keeps it as an exhibition; playing the fixture again resumes it at the same revision.
- The same recovery for an imported-roster career.
- A retained browser profile closed and reopened (IndexedDB retained, `sessionStorage` lost).

`tests/m4/managed-binding-persistence.spec.ts` covers the first-commit guard, the match list filter and binding storage in a real IndexedDB. `tests/unit/managed-binding.test.ts` covers the binding rules and result regeneration.

Local results are Chromium on Linux. Hosted GitHub Actions on commit `233f049` passed the Linux job and the Windows job (UI and career suites in Chromium and Firefox, including all five recovery specs). Hosted Windows is not the owner's PC, which has not run these. The implementation notes are in `../MANAGED_MATCH_RECOVERY.md`.
