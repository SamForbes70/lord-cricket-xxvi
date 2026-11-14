# Handover, 13 November 2026

One page for a person or an AI picking this project up. It points at the evidence; it does not replace it. If this page and the repository disagree, trust the repository and fix this page.

## What this is

Lord Cricket XXVI is a browser-based statistical cricket management game: a TypeScript monorepo (Vite and React web app, deterministic simulation engines, IndexedDB saves, portable `.lcxxvi` archives). It is a **fictional, single-season, synthetic alpha** (`synthetic-alpha-01`). It makes no claim that its results match real cricket.

Repository (public): https://github.com/SamForbes70/lord-cricket-xxvi. Default branch `main`.

## Where it stands

| Area | State |
| --- | --- |
| V0.1 | Closed and owner accepted on 13 November 2026. Every V01 backlog item is `DONE`. |
| Stage 2 (Persistent world) | `accepted` on `main` (`161e781`, 14 November 2026: [OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md), [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md), [verification-stage02-persistent-world/REPORT.md](verification-stage02-persistent-world/REPORT.md)). |
| Stage 3 (Player lifecycle & youth pathway) | `accepted` on `main` (14 November 2026: [OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md), [verification-stage03-player-lifecycle/REPORT.md](verification-stage03-player-lifecycle/REPORT.md), [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md)): fictional ageing, exploit-proof off-season skill progression, retirement, preserved alumni pages, youth academy intake/promotion, and 20-season diagnostics (`0` role shortages). |
| Match formats | T20, ODI and five-day red ball, with hash-chained replay. Tactical captains for all three. Seeded red-ball weather. |
| Career | Single-season V0.1 careers (`14` rounds, `56` fixtures), Stage 2 persistent multi-season worlds (`LC_PERSISTENT_WORLD_V1`), and Stage 3 lifecycle persistent worlds (`LC_PERSISTENT_WORLD_V2_LIFECYCLE`). |
| Saves | IndexedDB with checkpoints and writer leases; crash-safe idempotent season rollover; durable managed-match recovery across closed tabs; per-season roster-snapshotted completed-match event archives (`V2`) and replay across seasons; non-destructive single-season copy-forward and Stage 2 -> Stage 3 slot upgrade; `.lcxxvi` export and import. |
| Offline and accessibility | Precached offline shell with safe updates; automated keyboard, focus, contrast and 150 percent checks. |
| Packaging | `npm run package:game` builds a playable zip and a source zip. |
| Research track | Blocked on data. The model is synthetic and uncalibrated. |

**Owner declared, not measured:** the reference-hardware performance run, the owner-PC run and the human screen-reader walkthrough. There is no measurement or observation for them in this repository. See [OWNER_DECISIONS_2026-11-13.md](OWNER_DECISIONS_2026-11-13.md).

**Known limits:** [release-v01/RELEASE_RECORD.json](release-v01/RELEASE_RECORD.json) (`knownLimits`), and [REVIEW_2026-11-13.md](REVIEW_2026-11-13.md) for the review of the unreviewed commits.

## What is next

1. **Stage 4: Contracts, budgets and recruitment** (unlocked by Stage 3 owner acceptance on 14 November 2026), plus **Stage 5: Tactical briefings and feedback**. See [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md) and [NEXT_PASS.md](NEXT_PASS.md).
2. The owner applies branch protection ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)).
3. Optionally, real measurements for the three declared gates.

## Run it

You need Node.js 22.12 or later (Python 3 only for `verify:09:core`).

```bash
npm ci
npm run build
npm run dev          # development server
```

To play a built copy, serve `apps/web/dist` over http (it uses web workers, so opening `index.html` directly does not work), for example `node start.mjs` after `npm run build`, then open `http://127.0.0.1:4180/`. To make shareable zips: `npm run package:game`, which writes to `release-packages/`.

Browser saves live in the browser profile, tied to the address and port. Use the in-game export to keep backups.

## Verify it

```bash
npx tsc -b                      # always first after a pull: compiled packages go stale
npm run lint
npm run verify:09:core          # schemas, build, typecheck, lint, vectors, unit tests (about 4 minutes)
npm run build
npx playwright install chromium firefox
npx playwright test --config playwright.ui.config.ts     # browser suite
npm run smoke
npm run management:acceptance
```

Last verified on `8a7c164`: `verify:09:core` 63 files and 731 tests passing, and the Chromium UI suite 60 of 60. Re-run them; do not rely on these numbers. Hosted CI runs a Linux job and a Windows job (Chromium and Firefox) on every pull request; the Windows job takes 25 to 30 minutes.

## Read in this order

1. [AGENTS.md](../AGENTS.md), the project rules and architecture invariants.
2. [AI_CONTINUATION.md](AI_CONTINUATION.md), including the working agreements.
3. [CURRENT_STATUS.md](CURRENT_STATUS.md), [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md), [V01_BACKLOG.json](V01_BACKLOG.json), [V01_DELIVERY_PLAN.md](V01_DELIVERY_PLAN.md).
4. [ENGINEERING_GUIDE.md](ENGINEERING_GUIDE.md), [VERIFICATION_GUIDE.md](VERIFICATION_GUIDE.md), [../packages/persistence/README.md](../packages/persistence/README.md).
5. [MANAGED_MATCH_RECOVERY.md](MANAGED_MATCH_RECOVERY.md), [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md), [REVIEW_2026-11-13.md](REVIEW_2026-11-13.md).
6. To brief another AI quickly, paste [AI_INSPECTION_PROMPT.md](AI_INSPECTION_PROMPT.md).

## Traps

- Stale `dist` folders after a pull make unit tests fail confusingly. Run `npx tsc -b` first.
- Windows CI fails on any skipped browser test.
- A first commit never replaces an existing save (`SAVE_ALREADY_EXISTS`); a pending career match blocks "New exhibition" until it is finished or abandoned.
- The Windows checkout changes line endings, so file hashes computed on Windows differ from Linux. This is not a change to a frozen file.
- Do not mark an owner gate passed, change repository settings or merge the owner's pull requests without the owner's say.
