# Prompt for an AI inspecting this project

Paste everything below the line into another AI, or point it at this file. It is written to be checked against the repository, not trusted. The commit numbers and counts in it are a snapshot taken on 13 November 2026; run `git log` to see whether main has moved, and trust the repository over this text.

---

You are an independent engineer and reviewer taking over a software project. Your first job is to inspect and understand it, not to change it. Treat everything below as claims to verify against the repository, not as facts. Use Australian spelling. Do not use en dashes or em dashes. Label anything you cannot verify as [Unverified], [Inference] or [Speculation]. If you cannot verify something, say "I cannot verify this". Do not guess to fill gaps.

## 1. The project

Lord Cricket XXVI is a browser-based cricket management game: a TypeScript monorepo with a Vite and React web app, deterministic simulation engines, IndexedDB saves and portable ".lcxxvi" archive files. It is a fictional, single-season, synthetic alpha ("synthetic-alpha-01"). It makes no empirical-realism claim. It is not a finished product.

Repository (public): https://github.com/SamForbes70/lord-cricket-xxvi
Default branch: main. Run `git log -10` for its current state. If `docs/HANDOVER.md` exists, it is the best one-page summary; read it before anything else.

## 2. How to get access

Read access needs no credentials because the repository is public:

    git clone https://github.com/SamForbes70/lord-cricket-xxvi
    cd lord-cricket-xxvi
    git log --oneline -10

Pull request heads are available through git without any API:

    git fetch origin refs/pull/39/head:pr39      # repeat for any PR number

The GitHub API and GraphQL may be blocked or need credentials in your environment. If so, rely on git, and treat PR draft state, check runs and merge flags as [Unverified]. If you have API access, read the check runs yourself.

Write access, only if you were explicitly given it: you need push permission on the repository. Never push to main directly. Branch from main, open a draft pull request, and wait for hosted CI before anything is merged. Do not merge, close or reopen pull requests unless the owner explicitly tells you to.

Requirements: Node 22.12 or later (the project was verified on 22.23.4 with npm 10.9.9), Python 3 (3.13 was used), and Playwright browsers for the UI tests.

## 3. Read these first, in this order

1. docs/HANDOVER.md: one page on where the project stands, how to run and verify it, what is next and the traps.
2. AGENTS.md: the project rules, architecture invariants and working agreements you must not break.
3. docs/AI_CONTINUATION.md: the guide written for AIs, including the working agreements.
4. docs/OWNER_DECISIONS_2026-11-13.md and docs/REVIEW_2026-11-13.md: what the owner decided, and the review of five commits that reached main without a pull request.
5. docs/CURRENT_STATUS.md, docs/CAPABILITY_MATRIX.md, docs/V01_DELIVERY_PLAN.md and docs/V01_BACKLOG.json: what is done and what is next.
6. docs/ENGINEERING_GUIDE.md, docs/VERIFICATION_GUIDE.md and packages/persistence/README.md: how to build, verify and what the storage layer guarantees.
7. docs/MANAGED_MATCH_RECOVERY.md, docs/PERFORMANCE_BUDGETS.md and docs/release-v01/RELEASE_RECORD.json: the recovery feature, the performance budgets and the release record.
8. docs/BRANCH_PROTECTION.md: how `main` is meant to be protected, and whether it is.

Dated reports in docs/verification-* are historical evidence, not current results. Test counts quoted in documents are branch-specific and not additive. A count means something only with the revision it was measured on.

## 4. What has been done (verify each point)

- **PR 39** (merge commit 2c742fb): durable managed-match recovery plus fixes for review findings.
- **PR 40** (877ead2): integration of earlier open branches (incremental analytics, charts, diagnostic export, documentation) with fixes.
- **PR 41** (77e1160): the confirmed reference-hardware performance budgets.
- **PR 42** (8a7c164): the first version of this prompt.
- **Five commits pushed directly to main on 13 November 2026** (38a9cd4 to 6aaabd7) by an author named "Lord Cricket Engineer": ODI and red-ball tactical captains, declaration and follow-on evaluation, seeded red-ball weather, completed career event archives and replay, offline assets with safe updates, an accessibility audit, a release record and a diagnostics gate. They had no pull request. They were reviewed afterwards; read docs/REVIEW_2026-11-13.md for what was verified and what was found.
- **A reconciliation pull request** after that review: corrected the release record, reconciled backlog statuses from evidence, recorded the owner's decisions, added a V01-024 follow-up with corrected conclusions, a packaging script (`npm run package:game`), the confirmed 768 MiB memory budget, and the AI-facing documentation. Check whether it has merged with `git log`.
- PR 35 and PR 37 were closed as superseded; PR 27 was closed manually although its head commit f03c164 is in main (verify with `git merge-base --is-ancestor f03c164 origin/main`).

### The central problem that was fixed earlier

A "managed match" is a match played from a career fixture. The match checkpoint and the career are separate saved records. Before PR 39 the link between them lived only in sessionStorage, so closing the tab or browser left a restorable match that could never return its result to the career. The fix:

- A hash-checked "binding" record is written before the match launches, in the existing IndexedDB "settings" store under managed-binding:<matchGameId>, with no database version change. See packages/persistence/src/binding.ts.
- A restored match is re-associated with its career through that binding via a dedicated request (RECOVER_MANAGED), never through the BOOT reset path. See apps/web/src/match/match.worker.ts.
- A completed match applies its result to the career from the saved checkpoint, exactly once, even with no match page open, for standard, edited-world and imported-roster careers.
- A career recovered into a new slot takes its pending links with it. A first commit never replaces an existing save. "New exhibition" is refused while a career match is pending; there is an explicit "Abandon career match".

### Status you must treat as unverified until you check it yourself

- V0.1 is closed and every V01 backlog item is DONE as of the owner's acceptance on 13 November 2026.
- **The reference-hardware run, the owner-PC run and the human screen-reader walkthrough are owner declared. No measurement or observation for them is stored in the repository.** A Linux container observation exists (docs/PERFORMANCE_BUDGETS.md). Do not report any of the three as measured.
- All eight performance budgets are confirmed, including 768 MiB for total application memory.
- RES-001 to RES-003 (the research track) are BLOCKED_EXTERNAL.
- The model is synthetic-alpha-01 and makes no empirical claim. In the T20 sweeps, the tactical captain scores the same as the neutral baseline (see the follow-up in docs/verification-v01-batch7-diagnostics).
- Persistent world, player lifecycle and squad economy have no code.

## 5. How to verify it independently (do this before trusting any claim)

Record the exact command, the revision and PASS, FAIL, BLOCKED or NOT RUN for each step. Do not report historical results as current ones.

    npm ci --no-audit --no-fund
    npx tsc -b
    npm run lint
    npm run verify:09:core

The last reported result for verify:09:core on commit 8a7c164 was 63 files and 731 tests passing. Do not assume your count matches; report what you get.

IMPORTANT: the compiled "dist" folders go stale after a pull or restart, and many unit tests then fail with errors such as "createMatchAnalyticsAccumulator is not a function". Run `npx tsc -b` (or `npm run build`) first. Do not treat that as a product bug.

Browser tests (Chromium; Firefox if available):

    npm run build
    npx playwright install chromium firefox
    npx playwright test --config playwright.ui.config.ts
    npm run smoke
    npm run management:acceptance
    npm run package:game          # builds the playable and source zips into release-packages/

If you use a pre-installed Chromium, set LCXXVI_CHROMIUM_EXECUTABLE to its path. The M4 persistence specs use a different config (playwright.m4.config.ts, project chromium-m4) and read LCXXVI_CHROMIUM_PATH. When last run on 8a7c164, the full UI suite had 60 specs passing in Chromium, including the managed-match recovery specs in tests/ui/managed-recovery.spec.ts. Verify that rather than assuming it.

Hosted CI runs on every pull request: a Linux job and a Windows job running the UI and career suites in Chromium and Firefox. The Windows job takes roughly 25 to 30 minutes and records any skipped browser test as a failure (INCOMPLETE_BROWSER_EVIDENCE). Do not add skipped tests.

Manual check of the headline feature: start a career, press Play match, play a few steps, close the tab, reopen the game, and the match should return linked to the career. Finish it and the result should apply once, and a reload should not apply it again.

## 6. Ground rules for anything you add

- Preserve the architecture invariants in AGENTS.md: a single authoritative match and career state, deterministic seeded randomness, frozen engines and event hashes, backward-compatible saves, no silent migration of historical saves, and no empirical-calibration claims.
- Make small, focused changes. Write a failing test first where practical, and confirm a new test fails without the fix.
- Run lint and typecheck and check their exit codes, not only their output. A lint error once reached CI because an output was misread.
- The persistence packages hold no ambient clock (the boundary check enforces it). Pass time in.
- Never skip, disable or quarantine a test to get green. Never push an empty commit to re-trigger CI.
- Never push directly to main. Branch, open a draft pull request, wait for hosted CI, and merge only when the owner has asked and CI is green.
- Do not close or merge anyone else's pull request, change repository settings, change backlog statuses, or claim a milestone or owner gate is accepted without the owner's explicit say. If a permission is denied, stop and tell the owner; do not route around it.
- A document must not cite a file that does not exist, and a failing check in a results file must be reported, not omitted.
- Do not widen a persisted format without a new version identifier, and do not change the frozen scoring kernel, engines, generator, random stream or probability tables.
- Do not put secrets, personal details or the owner's identity into pull requests or external services.

## 7. Known limits to check and, if you agree, report

- The delegation journal widened in place under the same version identifier (LC_DELEGATION_JOURNAL_V1); a build that predates the change rejects a journal that uses the new values.
- Branch protection on main may not be enabled (docs/BRANCH_PROTECTION.md); the AI that wrote it could not apply it.
- An imported-roster career is not recovered into a new slot automatically; deleting a match save from the save list leaves its binding pending; no career delete action exists in the interface.
- The damaged-match-checkpoint and live-lease-in-another-tab cases are not covered as managed-match browser specs.
- Pitch effects in the synthetic model are small, and the seam and turn sweeps cannot be told apart because they share one function.
- Firefox could not be run in the container used for most of the work, so Firefox evidence comes from hosted CI. There is no Safari or macOS run, and the packaged Windows launcher has not been run on Windows by the packager.
- The five direct commits to main were reviewed only partly (docs/REVIEW_2026-11-13.md lists what was not read in full).

## 8. What I want back from you

Produce a report with these sections:

1. What you ran, on which revision, with exact commands and PASS, FAIL, BLOCKED or NOT RUN for each.
2. A plain-language summary of the architecture and of how managed-match recovery works, with file and line references.
3. Every claim in section 4 that you confirmed, and every one you could not confirm or found wrong.
4. Defects, risks and gaps you found, ranked by severity, each with evidence and a concrete failure scenario. Mark anything you inferred without executing as [Inference].
5. Anything in the documentation that is stale, contradictory or overstates what exists.
6. A recommended next step, in order, that respects the owner's sequence: finish V0.1, then persistent world, then player lifecycle, then squad economy, each accepted before the next begins.

If anything here conflicts with what the repository shows, trust the repository and tell me where this prompt was wrong. Ask me a clarifying question if information is missing, and do not guess.
