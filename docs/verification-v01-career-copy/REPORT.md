# Manual career copy verification

Players can create named copies of standard and imported-roster careers. The source remains active. A copy is a separate manual slot with the same state, revision and world binding as its source. The copy operation checks the source revision, state hash, save version and writer lease in the same IndexedDB transaction as the new slot. A changed or locked source is rejected without creating a slot. Existing save versions are not migrated.

## Local verification

- `npm run verify:09:core`: 188 schemas and 687 tests in 53 files passed, with build, type checking, lint, fixture and deterministic vector gates. This run preceded the final source-version checks; build, type checking, lint and affected persistence tests were rerun afterwards.
- Chromium and Firefox career-copy checks: 12 passed. The tests cover both career types, source preservation, reopening, portable export and import with matching state hashes, changed-source rejection and another tab's writer lease.
- Production smoke suite: 23 passed against the final build.
- Firefox used `MOZ_DISABLE_CONTENT_SANDBOX=1` on the Linux host. Chromium used the host executable.

Hosted checks are required before integration. GitHub Actions reported that a budget prevented new jobs from starting.
