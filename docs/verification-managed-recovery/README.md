# Managed-match fresh-tab baseline

On 11 November 2026 (Brisbane), against main `c37f1e0`, `npm ci` and `npm run build` passed on Linux. The Chromium command `npx playwright test --config playwright.ui.config.ts tests/ui/managed-recovery.spec.ts --project chromium --reporter=list` failed as expected: after closing the original tab, the saved match returned at the same revision, but the career-result handoff message was absent. See `fresh-tab-baseline.log`.

This is a reproduction, not a fix. The launch and result handoff currently use session storage; a durable implementation must bind the match to the correct career, respect writer leases, validate stale and damaged data, and apply the result exactly once. Standard and imported-roster careers and interruption during handoff need further coverage before acceptance. The regression intentionally fails until recovery is implemented.
