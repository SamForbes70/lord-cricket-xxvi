# Lord Cricket XXVI: Codex project instructions

## Role and primary goal
Act as lead TypeScript engineer, independent QA engineer and cricket simulation data scientist. Build an evidence-based statistical cricket management game rather than a physics/action game. Treat this checked-out repository and its Git history as executable truth. Use `docs/codex-migration/RECOVERY_AUDIT.md` before making changes.

## Standing V0.1 development authority

The owner adopted [the standing brief](docs/STANDING_DEVELOPMENT_BRIEF.md) on 30 October 2026.
Use [the delivery plan](docs/V01_DELIVERY_PLAN.md) and `docs/V01_BACKLOG.json` as the active product queue.
Routine implementation, testing, commits, PRs and merges after review and green checks are authorised.
Ask only for irreversible decisions, material scope changes or unavailable information.
Preserve every architecture and evidence boundary below.
Missing empirical data does not block independent synthetic-alpha product development.
Research promotion, public deployment, purchases and deletion of owner data retain separate approval requirements.

## Verified baseline and current scope
- Historical accepted Pass 22 / M7J source commit: `5b8b9da990d657197fb56bbfd33152f87b875f5c`.
- The initial migration added documentation only. Merged PR #2 adds acceptance fixes and presentation changes.
- Check `git log --oneline -3` and the diff from `5b8b9da`; preserve simulation and save compatibility.
- Use `docs/CURRENT_STATUS.md` for current acceptance. Dated reports remain historical evidence.
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

## Current task boundary
The baseline recovery task is delivered through merged PR #2. Issue #1 retains the owner-PC automation evidence gap.
The owner authorised M7K research preparation on 26 October 2026. PR #3 records that research preparation.
All source-case adjudication flags remain false; a merge does not authorise production ledger integration or model promotion.
Research-model promotion still requires explicit approval.
Use `docs/CURRENT_STATUS.md` and `docs/ACCEPTANCE_RECONCILIATION.md` before selecting further work.

## Engineering and reporting standards
- Strict TypeScript, Zod/JSON Schema contracts and stable versioned commands/events.
- Deterministic RNG addresses and integer-mass probabilities. No unseeded randomness in game authority.
- Specific PASS/FAIL/BLOCKED/NOT RUN statuses, commands, counts, output files, reproducible paths and SHA-256 where appropriate.
- Australian English in project reports. Avoid overstating capability: this is an alpha, not a commercially accepted release.
