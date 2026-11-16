# Owner decisions, 13 November 2026

The owner (Sam Forbes) gave these instructions on 13 November 2026 (Australia/Brisbane). They are recorded here exactly as decisions, with the evidence that does and does not exist behind each. A decision is not a measurement: where no measurement exists, this document says so.

## What the owner decided

| # | Item | Decision | Evidence in this repository |
| --- | --- | --- | --- |
| 1 | V01-011 managed-match recovery | Accepted as complete | Implemented in PR #39; hosted Linux and Windows (Chromium and Firefox) checks passed; seven recovery specs; local runs. See [MANAGED_MATCH_RECOVERY.md](MANAGED_MATCH_RECOVERY.md). |
| 2 | V01-028 reference-hardware performance, and Budget 8 | Considered complete. The owner delegated the memory figure ("put ideal figures where needed") | Budgets 1 to 7 were confirmed on 12 November. Budget 8 is set at **768 MiB** below. A Linux container observation is recorded; **no reference-laptop run exists in this repository**. |
| 3 | Owner-PC acceptance run | Considered complete | **No collector output from the owner's PC is stored in this repository.** Hosted Windows CI is the only Windows evidence. |
| 4 | Human screen-reader walkthrough | Considered complete | **No human observation is stored in this repository.** Automated accessibility checks pass ([ACCESSIBILITY_RELEASE_AUDIT.md](ACCESSIBILITY_RELEASE_AUDIT.md)). |
| 5 | Owners for rules review, source-data permissions and model validation | The owner holds all three roles until the owner delegates them in writing | This is an appointment, not a review. No rules review, data-rights clearance or model validation has taken place. |

## What "considered complete" means here

- It is the owner's authority to treat the gate as closed and to start the next milestone. The backlog statuses reflect that.
- It does **not** mean a performance target was measured on reference hardware, that the owner's PC ran the collector, or that a person used a screen reader. Anyone citing this release must say "owner declared", not "measured" or "observed".
- If a measurement is later taken, add it under `docs/verification-*` and link it here. A failing measurement reopens the item.

## Budget 8: total application memory

**768 MiB**, measured as process-tree PSS on Linux and private bytes on Windows (shared pages counted once), including workers and native allocations, on the four-core, 8 GB reference laptop with the default world and a completed 56-fixture season.

Why this figure. An 8 GB laptop must also run the operating system and other applications, so a single game tab and its workers should stay comfortably under 1 GiB. A Linux container observation on 13 November 2026 (headless Chromium, 17 processes, a complete league plus save and load) measured about 596 MiB PSS, so 768 MiB leaves roughly 29 percent headroom. That observation is **not** reference hardware and not a Windows measurement. The figure is the default in `tests/acceptance/memory-probe.ts` (`CONFIRMED_MEMORY_BUDGET_MB`); the environment variable `LCXXVI_MEMORY_BUDGET_MB` overrides it for experiments. See [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md).

## What the owner has not decided

- Public deployment remains separately unauthorised.
- Empirical model promotion remains separately gated (the research items RES-001 to RES-003 stay `BLOCKED_EXTERNAL`: they need historical decisions, an untouched cohort and an approved dataset, none of which exist).
- The owner has not reviewed the commits pushed directly to `main` on 13 November. They were reviewed by an AI; see [REVIEW_2026-11-13.md](REVIEW_2026-11-13.md).

## Owner decision, 14 November 2026 — Stage 2 (Persistent multi-season world)

- The owner (Sam Forbes) accepted **Stage 2: Persistent multi-season world** (`feat/stage2-persistent-world`, [verification-stage02-persistent-world/REPORT.md](verification-stage02-persistent-world/REPORT.md)) on 14 November 2026 (Australia/Brisbane), authorised pushing `feat/stage2-persistent-world` and merging it to `main`, and authorised proceeding into **Stage 3: Player lifecycle and youth pathway**.
- Hosted GitHub Actions (`Linux` and `Windows`) run after push; local Linux core (`736/736` unit tests, `207` JSON Schemas), smoke (`23/23`), and Chromium + Firefox Stage 2 browser checks passed prior to merge.

## Owner decision, 14 November 2026 — Stage 3 (Player lifecycle and youth pathway)

- The owner (Sam Forbes) accepted **Stage 3: Player lifecycle and youth pathway** (`feat/stage3-player-lifecycle`, [verification-stage03-player-lifecycle/REPORT.md](verification-stage03-player-lifecycle/REPORT.md)) on 14 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage3-player-lifecycle` and merging it to `main`, and authorised proceeding into **Stage 4: Contracts, budgets and recruitment**.
- Local Linux core (`740/740` unit tests across `65/65` files, `235` JSON Schemas), 20-season diagnostic horizon (`0` role shortages across all 20 seasons), and Chromium + Firefox Stage 3 + Stage 2 + regression browser checks passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push.

## Owner decision, 15 November 2026 — Stage 4 (Contracts, budgets and recruitment)

- The owner (Sam Forbes) accepted **Stage 4: Contracts, budgets and recruitment** (`feat/stage4-contracts-recruitment`, [verification-stage04-squad-economy/REPORT.md](verification-stage04-squad-economy/REPORT.md)) on 15 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage4-contracts-recruitment` and merging it to `main`, and authorised proceeding into **Stage 5: Tactical briefings and feedback**.
- Local Linux core (`746/746` unit tests across `66/66` files, `261` JSON Schemas), 12-season domestic economy diagnostic horizon (`0` overspent clubs, `0` role shortages, `0` hidden future-ability reads across all 12 seasons), and Chromium + Firefox Stage 4 + Stage 3 + Stage 2 + regression browser checks passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push.

## Owner decision, 15 November 2026 — Stage 5 (Tactical briefings and feedback)

- The owner (Sam Forbes) accepted **Stage 5: Tactical briefings and feedback** (`feat/stage5-tactical-briefings`, [verification-stage05-tactical-briefings/REPORT.md](verification-stage05-tactical-briefings/REPORT.md), [PLAYTEST_SCRIPT_STAGE05.md](PLAYTEST_SCRIPT_STAGE05.md)) on 15 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage5-tactical-briefings` and merging it to `main`, and authorised proceeding into **Stage 6: Live field and highlight pacing**.
- Local Linux core (`750/750` unit tests across `67/67` files, `281` JSON Schemas) and Chromium + Firefox Stage 5 + tactical/accessibility regression browser checks passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push. Note: the multi-participant observed human playtest protocol in [PLAYTEST_SCRIPT_STAGE05.md](PLAYTEST_SCRIPT_STAGE05.md) is authored in-repo but no multi-participant playtest session transcript is stored yet (owner milestone acceptance only, not claimed human playtest evidence).

## Owner decision, 15 November 2026 — Stage 6 (Live field and highlight pacing)

- The owner (Sam Forbes) accepted **Stage 6: Live field and highlight pacing** (`feat/stage6-live-field`, [verification-stage06-live-field-highlights/REPORT.md](verification-stage06-live-field-highlights/REPORT.md)) on 15 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage6-live-field` and merging it to `main`, and authorised proceeding into **Stage 7: Contextual text commentary**.
- Local Linux core (`755/755` unit tests across `68/68` files, `292` JSON Schemas) and Chromium + Firefox Stage 6 + Stage 5 + tactical/accessibility regression browser checks (`12/12`) passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push. Note: milestone acceptance is owner-declared; multi-participant observed human playtest sessions remain unrecorded in-repo.

## Owner decision, 15 November 2026 — Stage 7 (Contextual text commentary)

- The owner (Sam Forbes) accepted **Stage 7: Contextual text commentary** (`feat/stage7-contextual-commentary`, [verification-stage07-contextual-commentary/REPORT.md](verification-stage07-contextual-commentary/REPORT.md)) on 15 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage7-contextual-commentary` and merging it to `main`, and authorised proceeding into **Stage 8: Optional sound and narration**.
- Local Linux core (`759/759` unit tests across `69/69` files, `299` JSON Schemas) and Chromium + Firefox Stage 7 + Stage 6 + accessibility regression browser checks (`6/6`) passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push. Note: milestone acceptance is owner-declared; multi-participant observed human playtest sessions remain unrecorded in-repo.

## Owner decision, 16 November 2026 — Stage 8 (Optional sound and narration)

- The owner (Sam Forbes) accepted **Stage 8: Optional sound and narration** (`feat/stage8-sound-narration`, [verification-stage08-optional-sound/REPORT.md](verification-stage08-optional-sound/REPORT.md)) on 16 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage8-sound-narration` and merging it to `main`, and authorised proceeding into **Stage 9: Historical statistics and leaderboards**.
- Local Linux core (`765/765` unit tests across `70/70` files, `309` JSON Schemas) and Chromium + Firefox Stage 8 + Stage 7 + accessibility regression browser checks (`6/6`) passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push. Note: milestone acceptance is owner-declared; subjective multi-user listening tests remain unrecorded in-repo.

## Owner decision, 16 November 2026 — Stage 9 (Historical statistics and leaderboards)

- The owner (Sam Forbes) accepted **Stage 9: Historical statistics and leaderboards** (`feat/stage9-historical-stats-leaderboards`, [verification-stage09-historical-stats/REPORT.md](verification-stage09-historical-stats/REPORT.md)) on 16 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage9-historical-stats-leaderboards` and merging it to `main`, authorised publishing comprehensive GitHub documentation ([README.md](../README.md), [ROADMAP_AND_AI_GUIDE.md](ROADMAP_AND_AI_GUIDE.md)) including the `'My hovercraft is full of Eels'` Easter egg, and authorised proceeding into **Stage 10: Match and season awards**.
- Local Linux core (`767/767` unit tests across `71/71` files, `325` JSON Schemas) and Chromium + Firefox Stage 9 + Stage 8 + accessibility regression browser checks (`6/6`) passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push.

## Owner decision, 16 November 2026 — Stage 10 (Match and season awards)

- The owner (Sam Forbes) accepted **Stage 10: Match and season awards** (`feat/stage10-match-season-awards`, [verification-stage10-match-season-awards/REPORT.md](verification-stage10-match-season-awards/REPORT.md)) on 16 November 2026 (Australia/Brisbane), authorised committing and pushing `feat/stage10-match-season-awards` and merging it to `main`, and authorised proceeding with a dedicated Windows double-click launcher branch (`feat/windows-double-click-launcher`) from `main`.
- Local Linux core (`770/770` unit tests across `72/72` files, `334` JSON Schemas) and Chromium + Firefox Stage 10 + Stage 9/accessibility regression browser checks (`8/8` across both runs) passed prior to merge; hosted GitHub Actions (`Linux` and `Windows`) run after push.

## Owner decision, 16 November 2026 — Windows Double-Click & Zero-Dependency `.NET` Portable Launcher

- The owner (Sam Forbes) approved Option A on 16 November 2026 (Australia/Brisbane): accepting and merging Stage 10 (`feat/stage10-match-season-awards`) to `main`, implementing the non-disruptive Windows double-click launcher and zero-dependency `.NET Framework 4.x` portable executable builder (`Play-Lord-Cricket.bat`, `tools/windows/*`, `scripts/package-game.mjs`, `start.mjs`, `tests/unit/windows-launcher.test.ts`), and pushing the fully documented repository and AI roadmap guide to GitHub.

## Owner decision, 16 November 2026: audit response and stabilisation first

Recorded from the owner's chat reply to the five questions in [AUDIT_2026-11-16.md](AUDIT_2026-11-16.md) (Phase 0). Owner's words, verbatim:

> My decisions: 1. Yes we keep 2. Your best advice please 3. Yes they may pause 4. Yes 5. Yes. I am open to the idea that the fastest route to finishing is to stabilise and review what exists before adding any new features. Do that first. Get what we currently have as excellent, then we will finish the full game.

What each answer settles:

1. **Scope.** Stages 2 to 10 stay as delivered scope. They are not feature-flagged.
2. **Authority.** The owner delegated this to the reviewing agent. Advice adopted: the "AI Master Build Brief" is retired as an authority, because it is not in the repository and cannot be checked. [MASTER_BUILD_LEDGER.md](MASTER_BUILD_LEDGER.md) remains as history only. The governing roadmap is the design brief (Lord_Cricket_XXVI_Technical_Design_V0_1) plus the phased plan in [AUDIT_2026-11-16.md](AUDIT_2026-11-16.md). The owner can reverse this by committing the Master Build Brief.
3. **Concurrent agents.** Other agents (Copilot, "Agent Zero", "Lord Cricket Engineer") may be paused while stabilisation runs. Pausing them is an owner action outside the repository.
4. **Branch protection.** The owner will apply it; see [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md). Agents do not change repository settings.
5. **Acceptance records.** The owner confirms the Stage 2 to 10 acceptances recorded above. Hosted CI for those commits was red (see the audit); this confirmation does not convert that into a pass.

**Direction:** no new features until the audit's stabilisation phases (1 to 6) are complete and reviewed. Each phase lands through a draft pull request with green hosted CI before the owner merges.
