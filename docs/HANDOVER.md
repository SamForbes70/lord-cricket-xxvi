# Handover, 19 November 2026

One page for a person or an AI picking this project up. It points at the evidence; it does not replace it. If this page and the repository disagree, trust the repository and fix this page.

## What this is

Lord Cricket XXVI is a browser-based statistical cricket management game: a TypeScript monorepo (Vite and React web app, deterministic simulation engines, IndexedDB saves, portable `.lcxxvi` archives). It is a **fictional, synthetic alpha** (`synthetic-alpha-01`) that makes no claim its results match real cricket.

Repository (public): https://github.com/SamForbes70/lord-cricket-xxvi. Default branch `main`.

## Where it stands

**Feature-complete for what the roadmap allows without outside data.** Stabilisation is finished (#48 to #62); every stage since was built through its own pull request with green hosted CI and merged by the agent under the owner's 17 November authority.

| Stage | Status | Pull requests |
| --- | --- | --- |
| 11 Player and manager stories | Built | #64 |
| 12 Scenario challenges (8) | Built | #65, #72 |
| 13 Historical scenarios | Parked: no licensed data source | |
| 14 Rules: super overs, rain-shortened matches, player reviews (exhibitions) | Built | #67, #68, #73, #76, #78, #79, #80 |
| 14 Empirical calibration | `BLOCKED_EXTERNAL` (`RES-001` to `RES-003`) | |
| 15 Tournaments, user-made competitions, crests, tours, auctions, playable tour and auction matches | Built (image imports off, owner answer C1a) | #69, #74, #81, #82, #83, #84, #86 |
| Captaincy: captain's highlights, close finishes, rival captains, selection room, Pavilion redesign (owner's own work with other AI tools, integrated 19 November) | Built | #90, #91, #92, #93 |
| 16 Product-quality acceptance | Passed by the owner's direct instruction, none of its four parts run ([record](verification-stage16/OWNER_DIRECTION_2026-11-18.md)) | #85 |
| 17 Release | Record sealed ([release-2026-11-18/](release-2026-11-18/RELEASE_RECORD.json)); GitHub Release `alpha-2026-11-19` prepared for the owner to publish | #85, #87 |

**Owner actions still open:** publish the GitHub Release (an agent session here cannot create releases: HTTP 403); turn on branch protection for `main`; decide on the stale open pull requests #44, #46 and #47, which predate stabilisation and are superseded (everything they change is on `main` in newer form). The paused agents are to be ignored (owner direction, 18 November 2026).

**Biggest risk:** nobody has played this build on the owner's PC. Every measurement is from hosted CI and Linux containers; the Stage 16 playtest, memory budget, screen-reader walkthrough and long-career soak were not run. A short playtest of the release is the most useful next step.

### Stabilisation history (16 November 2026, kept as written)


**The project was in stabilisation.** On 16 November 2026 the owner directed: "Get what we currently have as excellent, then we will finish the full game." No new features until the phased plan in [AUDIT_2026-11-16.md](AUDIT_2026-11-16.md) is complete and reviewed. Decisions: [OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md) (16 November entry).

Stages 2 to 10 were pushed straight to `main` (14 to 16 November) with hosted CI failing on every commit. The owner has confirmed their acceptance; that is not a CI pass.

| Stage | Commit on `main` |
| --- | --- |
| V0.1 single-season game | closed 13 Nov (`f7ee054`) |
| 2 Persistent multi-season world | `161e781` |
| 3 Player lifecycle and youth | `1fc2175` |
| 4 Contracts, budgets and recruitment | `cf24121` |
| 5 Tactical briefings | `4fa82d8` |
| 6 Live 2D field and highlights | `031abd3` |
| 7 Contextual text commentary | `3762ed3` |
| 8 Optional sound and narration | `d02e899` |
| 9 Historical statistics | `9e4ea36` |
| 10 Match and season awards | `c40a908` (acceptance note `8517205`) |
| Windows launcher and EXE builder | `b66bc60` |

### Stabilisation pull requests (stacked; merge in order)

| PR | Phase | What it does |
| --- | --- | --- |
| #48 | 1 | Hosted CI green: time limits fitted to measured runs; four failing browser specs fixed (three real bugs); yielding long horizons; management-screen layout at 150% and 390 px |
| #49 | 2 | Safety and format integrity: no hash-trust validation shortcuts; local-only launcher shutdown; no in-place archive widening; upgrades refused during a pending match |
| #50 | 3 | Career correctness: awards from season-fixed facts; AI clubs train; locale-independent ordering |
| #51 | 4a | Scale: key-range reads, statistics only on their screen, windowed commentary |
| #52 | 4b | Long careers: match digests, compressed archive storage, compressed V4 export ([design](design/MATCH_ARCHIVE_STORAGE_V2.md)) |
| (next) | 6 | Windows EXE built and smoke-tested in CI; documentation reconciled (this page) |

Each PR's description records its commands, tested revision and NOT RUN items.

**Owner declared, not measured:** the reference-hardware performance run, the owner-PC run and the human screen-reader walkthrough.

## Limits a newcomer must know

- **No rollback below the stabilisation builds.** An older build cannot read compressed archive rows, V4 to V6 exports, or world state V4 and V5 saves, and builds from before Stage 2 list multi-season worlds as exhibition saves, which they can delete.
- **Career length:** measured over two contracts-era seasons, each season stores 3.3 MB of compressed match archives (14.4 MB raw), so the 128 MB per-world ceiling holds about 38 seasons. The world state grows about 0.9 MB a season (1.6 MB after one, 2.5 MB after two) and every commit rewrites and revalidates it, so commits slow as a career lengthens: measured median day advance 312, 433 and 558 ms in seasons 1 to 3 (audit item M1). World state V4 ([design](design/WORLD_STATE_HISTORY_V4.md), pull request after #54) caps the embedded roster packs at two for new careers: from season 3 the lifecycle stops growing about 420 KB a season, and the measured season-3 median fell from 576 to 539 ms. Completed seasons are now validated once instead of on every commit, which brings season 3 to 470 ms. World state V5 ([design](design/WORLD_STATE_V5_SEASON_REFS.md)) hashes and stores finished seasons by reference: about 24 ms and 333 KB less per save for each finished season. V3 and V4 careers can be copied forward into V5 from the career screen. The current season, economy and lifecycle still grow with the career.
- **Frozen code:** the match engines still sort with `localeCompare`; changing them needs the owner's approval.
- **Concurrent agents:** Copilot, "Agent Zero" and "Lord Cricket Engineer" have written to this repository. The owner paused them on 17 November 2026 and on 18 November directed that they be ignored ([decision](OWNER_DECISIONS_2026-11-13.md)); `AGENTS.md` still tells any agent that reads it to stop.
- **Branch protection:** the owner will apply it ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)).

## Run it

You need Node.js 22.12 or later (Python 3 only for `verify:09:core`).

```bash
npm ci
npm run build
node start.mjs        # then open http://127.0.0.1:4180/
```

On Windows, double-click `Play-Lord-Cricket.bat`. To make shareable zips: `npm run package:game`, which writes to `release-packages/`. Browser saves live in the browser profile, tied to the address and port; use the in-game export to keep backups.

## Verify it

```bash
npx tsc -b                      # always first after a pull: compiled packages go stale
npm run lint
npm run verify:09:core          # schemas, build, typecheck, lint, vectors, unit tests (about 6 minutes)
npm run build
npx playwright install chromium firefox
npx playwright test --config playwright.ui.config.ts     # browser suite, about 20 minutes per browser
npx playwright test --config playwright.m4.config.ts     # real-IndexedDB persistence
node scripts/owner-acceptance.mjs --skip-install         # what hosted Windows runs, about an hour
```

Last local results (Linux, Node 22, Chromium) on #86's head `7a2840b`, 18 November 2026: `npx vitest run --maxWorkers=2` exit 0, 884 tests; Chromium `tests/ui/tournament-stage15.spec.ts` 6/6, `match.spec.ts` and `scenario-mode-stage12.spec.ts` 9/9. Firefox is not installed in the agent's container; hosted Windows CI runs it. Re-run them; do not rely on these numbers. Hosted CI runs a Linux job (about 25 minutes) and a Windows job (Chromium and Firefox, about 60 to 80 minutes) on every pull request. In a 16 GB container a full `npx tsc -b` was killed once (exit 137, container restarted); with `NODE_OPTIONS=--max-old-space-size=4096` it has completed every time since.

## Read in this order

1. [AGENTS.md](../AGENTS.md), the project rules and the current task boundary.
2. [AUDIT_2026-11-16.md](AUDIT_2026-11-16.md), the findings and the phased plan.
3. [AI_CONTINUATION.md](AI_CONTINUATION.md), including the working agreements.
4. [CURRENT_STATUS.md](CURRENT_STATUS.md), [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md).
5. [ENGINEERING_GUIDE.md](ENGINEERING_GUIDE.md), [VERIFICATION_GUIDE.md](VERIFICATION_GUIDE.md), [../packages/persistence/README.md](../packages/persistence/README.md).
6. [MANAGED_MATCH_RECOVERY.md](MANAGED_MATCH_RECOVERY.md), [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md), [design/MATCH_ARCHIVE_STORAGE_V2.md](design/MATCH_ARCHIVE_STORAGE_V2.md).
7. To brief another AI quickly, paste [AI_INSPECTION_PROMPT.md](AI_INSPECTION_PROMPT.md).

## Traps

- Stale `dist` folders after a pull make unit tests fail confusingly. Run `npx tsc -b` first.
- `npm run typecheck` also checks test files (`tsconfig.tools.json`); `npx tsc -b` does not.
- Windows CI fails on any skipped browser test, and the acceptance script stops at the first failing step, so a later step may never have run.
- Vitest has a fixed 60 s RPC limit: one synchronous call must not run that long (use the yielding horizon runners).
- The pinned schema counts in `tests/unit/contracts.test.ts` and `tests/unit/scoring-fixtures.test.ts` change with every new contract schema.
- A first commit never replaces an existing save (`SAVE_ALREADY_EXISTS`); a pending career match blocks "New exhibition" and career upgrades until it is finished or abandoned.
- The Windows checkout changes line endings, so file hashes computed on Windows differ from Linux. This is not a change to a frozen file.
- Do not mark an owner gate passed, change repository settings or merge the owner's pull requests without the owner's say.
