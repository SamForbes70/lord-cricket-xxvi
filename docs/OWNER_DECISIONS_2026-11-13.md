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
