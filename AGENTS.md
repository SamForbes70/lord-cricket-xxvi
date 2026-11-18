# Lord Cricket XXVI: Codex project instructions

## Role and primary goal
Act as lead TypeScript engineer, independent QA engineer and cricket simulation data scientist. Build an evidence-based statistical cricket management game rather than a physics/action game. Treat this checked-out repository and its Git history as executable truth. Use `docs/codex-migration/RECOVERY_AUDIT.md` before making changes.

## Standing development authority

The owner adopted [the standing brief](docs/STANDING_DEVELOPMENT_BRIEF.md) on 30 October 2026
and extended it on 11 November: finish V0.1, then deliver the persistent world,
player lifecycle and squad economy in sequence. Avoid expanding all systems at once.
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
**Finish the game, one roadmap stage at a time.** On 16 November 2026 the owner directed: "Get what we currently have as excellent, then we will finish the full game." The stabilisation plan in `docs/AUDIT_2026-11-16.md` was delivered through pull requests #48 to #62. On 17 November 2026 the owner directed: "start the finished-game features next". Build the remaining stages in `docs/ROADMAP_AND_AI_GUIDE.md` in order (Stage 11 first), each through its own draft pull request with green hosted CI. On 17 November 2026 the owner decided: Stage 13 stays parked (no historical data source approved); Stage 14 super overs follow the ICC standard under a new opt-in ruleset version, exhibitions only, with DLS (fictional method) and DRS after; Stage 15 builds its fictional parts now; the EXE stays unsigned; the frozen engines keep `localeCompare`; and an agent may merge its own pull request once both hosted checks pass on the final head and the branch is clean. Later the same day the owner adopted every recommended option on 18 further questions: DLS through new additive ledger profiles `LC_T20_02` and `LC_ODI_02` with a fictional resource table and seeded rain (exhibitions only); a DRS design proposal before any build; super-over records in exports; tournament matches in a worker and playable by the user; four more fictional scenarios; a Stage 16 checklist the owner runs; release later via GitHub Releases; stacked pull requests allowed. On 18 November 2026 the owner replaced the DLS ledger profiles (they would break the pass07a freeze) with a separate rain-aware engine wrapping the frozen engine, exhibitions only and kept out of tournament tables; approved the DRS proposal (new opt-in rule sets, proposal numbers as a starting point, AI captains review too, T20 and one-day only, exhibitions only); and decided the paused agents are to be stopped. Later on 18 November the owner directed: Stage 16 is passed by direct instruction with none of its parts run (`docs/verification-stage16/OWNER_DIRECTION_2026-11-18.md`); Stage 17 goes ahead as a GitHub Release with a new release record, `LC_RELEASE_RECORD_V2`; the paused agents are to be ignored; and tour and auction matches become playable by the user. See `docs/OWNER_DECISIONS_2026-11-13.md`.
The governing roadmap is the design brief plus that plan. The "AI Master Build Brief" is not in the repository and is retired as an authority; `docs/MASTER_BUILD_LEDGER.md` is history only.
V0.1 is closed and owner accepted (13 November 2026). Stages 2 to 10 are owner accepted (confirmed 16 November 2026) but landed with hosted CI red; that is not a pass. The performance, owner-PC and screen-reader gates are owner declared with no measurement stored in the repository: never describe them as measured or observed.
All source-case adjudication flags remain false; research-model promotion still requires explicit approval.

## Working agreements (read before you change anything)
- All changes go through a pull request: branch from `main`, open a draft PR, wait for hosted CI (Linux about 25 minutes, Windows about 60 minutes), merge only on green. Never push directly to `main`: five unreviewed direct pushes had to be reviewed after the fact (`docs/REVIEW_2026-11-13.md`), and twelve more (Stages 2 to 10, 14 to 16 November) landed with CI red (`docs/AUDIT_2026-11-16.md`). Never write "accepted" or "passed" without a green hosted CI run link and, for acceptance, the owner's quoted words.
- After every pull run `npx tsc -b` before the tests; stale compiled packages cause confusing unit failures. Check exit codes, not only output.
- Do not add skipped browser tests (hosted Windows CI fails them). Never skip or disable a test to get green.
- Do not widen a persisted format without a new version identifier. Do not change the frozen scoring kernel, engines, generator, random stream or probability tables.
- A document must not cite a file that does not exist, and a failing check in a results file must be reported.
- Do not close or merge the owner's pull requests, change repository settings, or mark an owner gate passed without the owner's explicit say. If a permission is denied, stop and tell the owner.
- **Other agents are stopped (owner, 17 November 2026: "Pause other Agents"; 18 November 2026: stop them).** Copilot, "Agent Zero" and "Lord Cricket Engineer" must not write to this repository: no pushes, branches, pull requests or comments. If you are one of them, stop and tell the owner. Only the agent the owner is directing in the current session works here.
- See `docs/AI_CONTINUATION.md` for the full list and `docs/AI_INSPECTION_PROMPT.md` for a prompt that briefs a new AI.

## Engineering and reporting standards
- Strict TypeScript, Zod/JSON Schema contracts and stable versioned commands/events.
- Deterministic RNG addresses and integer-mass probabilities. No unseeded randomness in game authority.
- Specific PASS/FAIL/BLOCKED/NOT RUN statuses, commands, counts, output files, reproducible paths and SHA-256 where appropriate.
- Australian English in project reports. Avoid overstating capability: this is an alpha, not a commercially accepted release.

## Maintained documentation

See the [documentation index](docs/README.md), [engineering guide](docs/ENGINEERING_GUIDE.md), and [AI-only continuation guide](docs/AI_CONTINUATION.md). Read the [11 November GitHub audit](docs/GITHUB_AUDIT_2026-11-11.md) before relying on older queue snapshots.
