# Prompt for an AI inspecting this project

Paste everything below the line into another AI, or point it at this file. It is written to be checked against the repository, not trusted. The commit numbers and counts in it are a snapshot taken when it was written; run `git log` to see whether main has moved.

---

You are an independent engineer and reviewer taking over a software project. Your first job is to inspect and understand it, not to change it. Treat everything below as claims to verify against the repository, not as facts. Use Australian spelling. Do not use en dashes or em dashes. Label anything you cannot verify as [Unverified], [Inference] or [Speculation]. If you cannot verify something, say "I cannot verify this". Do not guess to fill gaps.

## 1. The project

Lord Cricket XXVI is a browser-based cricket management game: a TypeScript monorepo with a Vite and React web app, deterministic simulation engines, IndexedDB saves and portable ".lcxxvi" archive files. It is a fictional, single-season, synthetic alpha ("synthetic-alpha-01"). It makes no empirical-realism claim. It is not a finished product.

Repository (public): https://github.com/SamForbes70/lord-cricket-xxvi
Default branch: main. When this prompt was written, main was at commit 77e1160 ("Merge pull request #41"). Run `git log -5` to see whether it has moved since.

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

1. AGENTS.md: the project rules and the architecture invariants you must not break.
2. docs/AI_CONTINUATION.md: the guide written for AIs, covering what is and is not delivered.
3. docs/CURRENT_STATUS.md, docs/V01_DELIVERY_PLAN.md and docs/V01_BACKLOG.json: what is done and what is next.
4. docs/ENGINEERING_GUIDE.md and docs/VERIFICATION_GUIDE.md: how to build and verify.
5. docs/MANAGED_MATCH_RECOVERY.md: the recovery feature (section 4 below).
6. docs/PERFORMANCE_BUDGETS.md: the confirmed performance budgets.
7. docs/GITHUB_AUDIT_2026-11-11.md: a dated snapshot, older than the work described here. Read it as history.

Dated reports in docs/verification-* are historical evidence, not current results. Test counts quoted in documents are branch-specific and not additive. A count means something only with the revision it was measured on.

## 4. What has been done (verify each point)

Work was done in four pull requests, all merged into main:

- PR 39 (merge commit 2c742fb): durable managed-match recovery plus fixes for review findings.
- PR 40 (merge commit 877ead2): integration of earlier open branches, with fixes. It brought in PR 26 (incremental analytics), PR 27 (charts), PR 31 (match diagnostic export), PR 36 (delivery-sequence documentation) and PR 38 (project documentation).
- PR 41 (merge commit 77e1160): records the confirmed reference-hardware performance budgets. Documentation only.
- PR 35 and PR 37 were closed as superseded. PR 27 was closed manually because GitHub did not mark it merged, although its head commit f03c164 is an ancestor of main. Verify that with `git merge-base --is-ancestor f03c164 origin/main`.

### The central problem that was fixed

A "managed match" is a match played from a career fixture. The match checkpoint and the career are separate saved records. Before this work, the link between them lived only in sessionStorage, so closing the tab or browser left a restorable match that could never return its result to the career. The fix:

- A hash-checked "binding" record is written before the match launches. It lives in the existing IndexedDB "settings" store under the key managed-binding:<matchGameId>, with no database version change. See packages/persistence/src/binding.ts.
- A restored match is re-associated with its career through that binding via a dedicated request (RECOVER_MANAGED), never through the BOOT reset path. See apps/web/src/match/match.worker.ts, protocol.ts and controller.ts.
- A completed match applies its result to the career from the saved checkpoint, exactly once, even with no match page open. See apps/web/src/match/managed-result.ts and apps/web/src/career/managed-match.ts. This works for standard careers, edited-world careers and imported-roster careers.
- A career recovered into a new save slot takes its pending match links with it (rekeyCareer).
- A first commit can no longer replace an existing save (error SAVE_ALREADY_EXISTS). "New exhibition" is refused while a career match is pending, and there is an explicit "Abandon career match" action.
- The writer lease is released on tab close (best effort) and a read-only restore retries for about 30 seconds. A live lease held by another tab is never taken over.
- Smaller fixes: roster career rows no longer appear in the match save list, the diagnostic export omits the seed of an unfinished match unless the player opts in, the analytics rebuild yields by time budget, a reload-safe request id scheme, and stale documents corrected.

### Status you must treat as unverified until you check it yourself

- Backlog item V01-011 (recovery) is still IN_PROGRESS by design. The owner has not accepted it.
- V01-028 (reference-hardware performance) is BLOCKED_EXTERNAL. The reference hardware is only defined as "a four-core, 8 GB laptop with a supported browser". Seven numeric budgets are confirmed (docs/PERFORMANCE_BUDGETS.md). The eighth, total application memory including workers and native allocations, has no threshold and is an open owner decision.
- Not run by anyone, as far as is known: the owner-PC checklist and reference-hardware measurements. Hosted Windows is not the owner's PC.
- Many V0.1 items are still planned. Persistent world, player lifecycle and squad economy have no code.

## 5. How to verify it independently (do this before trusting any claim)

Record the exact command, the revision and PASS, FAIL, BLOCKED or NOT RUN for each step. Do not report historical results as current ones.

    npm ci --no-audit --no-fund
    npx tsc -b
    npm run lint
    npm run verify:09:core

The last reported result for verify:09:core was 57 files and 706 tests passing on the main lineage. Do not assume your count matches; report what you get.

IMPORTANT: the compiled "dist" folders go stale after a pull or restart, and many unit tests then fail with errors such as "createMatchAnalyticsAccumulator is not a function". Run `npx tsc -b` (or `npm run build`) first. Do not treat that as a product bug.

Browser tests (Chromium; Firefox if available):

    npm run build
    npx playwright install chromium firefox
    npx playwright test --config playwright.ui.config.ts
    npm run smoke
    npm run management:acceptance

If you use a pre-installed Chromium, set LCXXVI_CHROMIUM_EXECUTABLE to its path. The M4 persistence specs use a different config (playwright.m4.config.ts, project chromium-m4) and read LCXXVI_CHROMIUM_PATH. When last run, the full UI suite had 51 specs passing in Chromium, including seven managed-match recovery specs in tests/ui/managed-recovery.spec.ts. Verify that rather than assuming it.

Hosted CI runs on every pull request: a Linux job and a Windows job running the UI and career suites in Chromium and Firefox. The Windows job takes roughly 25 to 30 minutes and records any skipped browser test as a failure (INCOMPLETE_BROWSER_EVIDENCE). Do not add skipped tests.

Manual check of the headline feature: start a career, press Play match, play a few steps, close the tab, reopen the game, and the match should return linked to the career. Finish it and the result should apply once, and a reload should not apply it again.

## 6. Ground rules for anything you add

- Preserve the architecture invariants in AGENTS.md: a single authoritative match and career state, deterministic seeded randomness, frozen engines and event hashes, backward-compatible saves, no silent migration of historical saves, and no empirical-calibration claims.
- Make small, focused changes. Write a failing test first where practical, and confirm a new test fails without the fix.
- Run lint and typecheck and check their exit codes, not only their output. A lint error once reached CI because an output was misread.
- The persistence packages hold no ambient clock (the boundary check enforces it). Pass time in.
- Never skip, disable or quarantine a test to get green. Never push an empty commit to re-trigger CI.
- Do not close or merge anyone else's pull request, change backlog statuses, or claim a milestone is accepted without the owner's explicit say.
- Do not put secrets, personal details or the owner's identity into pull requests or external services.

## 7. Known limits to check and, if you agree, report

- An imported-roster career is not recovered into a new slot automatically, so it has no re-key path.
- Deleting a match save from the save list leaves its binding pending. Playing the fixture again then starts it fresh.
- No career delete action exists in the interface. removeForCareer exists and is unit tested.
- The damaged-match-checkpoint and live-lease-in-another-tab cases are not covered as managed-match browser specs (only by older, general persistence specs).
- Firefox could not be run in the container used for the original work, so Firefox evidence comes from hosted CI only.

## 8. What I want back from you

Produce a report with these sections:

1. What you ran, on which revision, with exact commands and PASS, FAIL, BLOCKED or NOT RUN for each.
2. A plain-language summary of the architecture and of how managed-match recovery works, with file and line references.
3. Every claim in section 4 that you confirmed, and every one you could not confirm or found wrong.
4. Defects, risks and gaps you found, ranked by severity, each with evidence and a concrete failure scenario. Mark anything you inferred without executing as [Inference].
5. Anything in the documentation that is stale, contradictory or overstates what exists.
6. A recommended next step, in order, that respects the owner's sequence: finish V0.1, then persistent world, then player lifecycle, then squad economy, each accepted before the next begins.

If anything here conflicts with what the repository shows, trust the repository and tell me where this prompt was wrong. Ask me a clarifying question if information is missing, and do not guess.
