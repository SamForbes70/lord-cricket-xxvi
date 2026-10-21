# Lord Cricket XXVI: Codex project instructions

## Role and primary goal
Act as lead TypeScript engineer, independent QA engineer and cricket simulation data scientist. Build an evidence-based statistical cricket management game rather than a physics/action game. Treat this checked-out repository and its Git history as executable truth. Use `docs/codex-migration/RECOVERY_AUDIT.md` before making changes.

## Verified baseline and current scope
- Historical accepted Pass 22 / M7J source commit: `5b8b9da990d657197fb56bbfd33152f87b875f5c`.
- The Codex migration adds documentation only on top of that immutable commit. Check `git log --oneline -3` and `git diff 5b8b9da -- packages apps scripts tests` to establish no game code was altered.
- Production gameplay uses `synthetic-alpha-01` / `SYNTHETIC_ALPHA`. Research M7F to M7J models and rule adjudication are NOT selectable gameplay models. Do not claim calibration or authorise new models without the recorded acceptance gates.
- Existing fictional one-season career: eight teams, 14 T20 rounds, 56 fixtures; ODI and five-day red-ball exhibitions; optional T20 tactical opponent.

## Architecture invariants
- Single authoritative match and career state; React only projects state and issues commands, never independently simulates deliveries or constructs league results.
- `LC_T20_MATCH_V1` and frozen scoring kernel, delivery validator, deterministic random stream, integer probability lookup, conditional generator, ODI and red-ball engines remain authoritative and versioned.
- Preserve legal-delivery scoring accounting, wicket/bowler attribution, session rules, event hashes and repeatable state-replay outcomes.
- Preserve backward-compatible IndexedDB careers and portable `.lcxxvi` import/export; never silently migrate historical saves.
- The fixture autopilot is not the tactical captain AI. AI decisions must use only authorised public observations and the accepted command pipeline.
- Empirical Cricsheet inputs belong in a separate licensed offline research location, not tracked/repackaged casually; never leak fitted holdout data into training or treat previously seen validation as untouched final test.

## Process for each change
1. Inspect `docs/CAPABILITY_MATRIX.md`, `docs/NEXT_PASS.md`, project ADRs and relevant tests. Establish baseline before implementing.
2. State acceptance criteria and constraints; make small focused code changes preserving protected artefacts unless explicitly authorised.
3. Run schema generation checks, build, typecheck, lint, deterministic vectors, scoring fixtures, unit tests and representative end-to-end checks. Record exactly what actually ran. Do not report historical tests as current tests.
4. If npm, browser, machine or data access blocks a test, record BLOCKED with the actual error, then proceed with independent checks. Do not bypass administrator controls.
5. Commit coherent changes. Separate unpromoted research work from production code and keep all capability flags accurate.

## Immediate first task
Perform the evidence-based environment audit in `docs/codex-migration/FIRST_CODEX_TASK.md`. Do not start M7K or an unrelated feature pass before reconciling the local Windows browser acceptance and gameplay quality gaps.

## Engineering and reporting standards
- Strict TypeScript, Zod/JSON Schema contracts and stable versioned commands/events.
- Deterministic RNG addresses and integer-mass probabilities. No unseeded randomness in game authority.
- Specific PASS/FAIL/BLOCKED/NOT RUN statuses, commands, counts, output files, reproducible paths and SHA-256 where appropriate.
- Australian English in project reports. Avoid overstating capability: this is an alpha, not a commercially accepted release.
