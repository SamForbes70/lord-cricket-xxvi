# Match diagnostic export verification

Players can preview and download a local diagnostic for T20, ODI and red-ball matches. The preview identifies the format, event count, revision, file size, checksum, engine, model and rules hashes, and whether a seed and recent failure are present. The file contains the canonical event payloads, version manifest, seed and the most recent rejected command when available. Nothing is uploaded automatically. The user interface does not receive the seed as a preview field. The download contains private match information and the interface asks the player to review it before sharing.

The preview is invalidated by subsequent match actions. The worker also checks the preview checksum, match identity, event hash and revision before export. If active checkpoints cannot be recovered, a diagnostic can report the recovery failure without deleting the original save. In that case the match seed and event data are unavailable. Failure information is limited to the current worker session; a stopped worker cannot produce a diagnostic.

## Local verification

- `npm run verify:09:core`: 188 schemas and 691 tests in 55 files passed, including build, type checking, lint, fixtures and deterministic vectors. This run preceded the final preview version and hash display; the diagnostic unit tests, build and lint passed again afterwards.
- Chromium and Firefox: 10 browser checks passed. They cover all three match formats, opt-in download, checksums, seed disclosure, event payloads, stale preview invalidation, rejected commands and recovery from damaged checkpoints.
- A further six Chromium and Firefox checks compared exported event payloads with the saved checkpoint in each format.
- Production smoke: 23 passed against the final build.
- Firefox used `MOZ_DISABLE_CONTENT_SANDBOX=1` on the Linux host. Chromium used the host executable.

This branch depends on scorecard PR #28 and needs hosted checks before integration.
