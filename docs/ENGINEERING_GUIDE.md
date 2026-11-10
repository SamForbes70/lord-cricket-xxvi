# Engineering guide

## System map

| Location | Responsibility | Change discipline |
| --- | --- | --- |
| `apps/web/src/main.tsx` | Match UI, worker lifecycle, navigation and presentation | Project authoritative responses; never simulate in React |
| `apps/web/src/match/protocol.ts` | Validated UI/worker requests and response types | Keep version and pin checks coherent |
| `apps/web/src/match/match.worker.ts` | Serial command execution, save coordination and recovery | Acknowledge durable state only after successful persistence |
| `apps/web/src/match/controller*.ts` | Format-specific orchestration and views | Preserve authoritative engine behaviour |
| `apps/web/src/career/service.ts` | Standard career application service | Enforce season revisions, leases and completion identity |
| `apps/web/src/career/roster-season.ts` | Imported-roster career operations | Validate roster identity and immutable historical inputs |
| `packages/contracts` | Runtime schemas and shared types | Update generated schemas intentionally |
| `packages/domain` | Cricket scoring domain | Frozen scoring semantics require compatibility review |
| `packages/simulation` | Match engines, RNG, probability, generation and career simulation | Version result-changing behaviour; retain old dispatch |
| `packages/ai` | Public-observation tactical policy | No hidden engine knowledge or artificial bonuses |
| `packages/projections` | Statistics and analytics from accepted events | Reconcile with authoritative scorecards |
| `packages/persistence` | IndexedDB checkpoints, leases, archives and validation | Preserve originals during damage recovery |
| `packages/data` | World, rules and model inputs | Respect hashes, provenance and version pins |
| `apps/batch` | Headless execution and quality scenarios | Distinguish developer diagnostics from product claims |
| `scripts` | Audits, verification, schema generation and acceptance collection | Preserve command results and evidence boundaries |

## Match command lifecycle

1. React submits a validated request with request identity and expected revision.
2. The worker serialises work and routes it to the appropriate controller.
3. The authoritative engine accepts or rejects commands and produces events/state.
4. Persistence commits checkpoints, events and command receipts within its transaction boundary.
5. The UI receives a response and renders projections. A failed durable commit must not be presented as a saved successful action.

Scoring, event sequence, event hashes, random addressing and saved revisions are connected compatibility boundaries. A change that preserves the visible score but changes replay bytes may still break a supported save.

## Career lifecycle

The fictional T20 career has eight teams, 14 rounds and 56 fixtures. Managed fixtures can be interactive or simulated; other fixtures run off-screen. Fixture autopilot and the optional tactical captain are distinct mechanisms. Training currently changes temporary readiness and condition, not permanent multi-year skills.

A match result must bind to the intended season, schedule, fixture, selected teams and match identity. Standard career completion rejects conflicting results and recognises an existing completion. Imported-roster careers have their own validation path. Do not assume testing one proves the other.

## Persistence and compatibility

The IndexedDB database is `lord-cricket-xxvi`. Match and season storage use shared infrastructure, but their checkpoints and writer leases are separate. Operational lease identities are not simulation randomness. The existing match repository retains three checkpoint generations and validates recovery candidates. Portable `.lcxxvi` archives are validated, not trusted because a checksum matches.

World edits and imported rosters are versioned snapshots. New-game presentation edits must not rewrite historical outcomes. Current roster intake and archive size limits are documented in the capability matrix. Do not silently migrate older archives or overwrite damaged source saves.

### Known managed-match recovery defect

The launch and result handoff use `sessionStorage`. Closing the original tab can preserve the match checkpoint while losing its career link. Draft PR #37 reproduces the missing career handoff after restoring the same match revision. It does not implement durable recovery.

A durable fix needs a validated, versioned career-to-match binding; recovery of the correct match rather than a global last-match guess; lease and stale-revision checks; and idempotent result application after interruption. The existing worker resets the active pointer when BOOT requests a different career fixture. A recovery request must not accidentally take that new-match path and discard the active association.

## Local development

Prerequisites: Git, Node.js >=22.12, npm and Python 3. Use the committed lockfile.

```sh
npm ci
npm run dev
```

The normal development application is served by Vite. This is a localhost browser application, not a native executable. Existing browser profiles contain saves outside the repository; back them up through supported export controls.

## Verification commands

```sh
npm run verify:09:core
npm run management:acceptance
npx playwright install chromium firefox
npx playwright test --config playwright.ui.config.ts --reporter=list
npm run smoke -- --workers=1
```

`verify:09:core` runs schemas, build, type checking, lint, scoring fixtures, independent RNG/probability/generator checks and unit tests. Browser checks require the relevant build and installed browsers. Use focused suites while developing, then the required integration checks. Do not run multiple preview servers on the same port; use isolated worktrees and explicit ports when necessary.

Research fixtures and licensed raw archives may require separate preparation. Follow the relevant runbook rather than fabricating missing data. Missing raw research data does not block unrelated product development.

## Failure diagnosis

- Build/type failure: inspect the first diagnostic and package boundary, not just the final exit code.
- Browser startup failure: distinguish missing binaries, missing OS libraries, port conflicts and permissions from application defects.
- Save failure: retain the original, inspect revision/lease/checkpoint evidence and avoid clearing storage to make the test pass.
- Replay failure: compare pinned versions, inputs, command sequence and event hashes before changing coefficients.
- CI timeout: inspect the actual tested head, step and collector limit. A timeout is not proof of incorrect gameplay.

## Research boundary

Playable gameplay remains `synthetic-alpha-01` / `SYNTHETIC_ALPHA`. M7 research candidates, exceptional-event adjudication and empirical evaluation are separate tracks. Previously inspected validation data cannot become an untouched final holdout. Synthetic expectations do not prove historical umpire decisions. Do not expose a research candidate as selectable gameplay merely because its tooling passes tests.

## Release evidence

A release needs the exact tested revision and distributable, reproducible manifests, capability reconciliation, known limits, installation/update/offline checks, recovery instructions, accessibility and reference-hardware acceptance. Hosted Windows testing complements but does not automatically satisfy owner-PC requirements. Public deployment remains separately authorised.
