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

## Owner decisions, 16 November 2026 (evening)

Owner's words, verbatim: "merge #56 to #59 once green too", then "muted by default; start finished seasons out of the hash".

1. **Sound is muted by default.** A player with no saved audio preferences starts muted (`DEFAULT_AUDIO_PREFERENCES.muted`); turning sound on is their choice. Saved preferences are unchanged.
2. **Finished seasons out of the per-save hash.** Approved as the next save-format work: a new world state version, with V1 to V4 saves still loading unchanged.
3. **Merging.** Pull requests #56 to #59 are merged once hosted CI is green on their final heads.

## Owner decision, 17 November 2026: pause other agents

Owner's words, verbatim: "Pause other Agents".

- Copilot, "Agent Zero" and "Lord Cricket Engineer" are paused: they must not write to this repository. `AGENTS.md` now says so, for any agent that reads the project instructions.
- None of them runs from this repository (its only workflows are the CI jobs `verify.yml` and `windows-launcher.yml`), so stopping them where they run is an owner action. At the time of this decision: "Lord Cricket Engineer" last committed `806ef50` on 16 November 2026, from a local address; Copilot has draft pull request #44, idle since 15 November; no commit names "Agent Zero".

## Owner decision, 17 November 2026: start the finished-game features

Owner's words, verbatim: "start the finished-game features next".

- Stabilisation (pull requests #48 to #62) is the base; the remaining roadmap stages in [ROADMAP_AND_AI_GUIDE.md](ROADMAP_AND_AI_GUIDE.md) are now in scope, in order, starting with Stage 11 (player and manager stories).

## Owner decisions, 17 November 2026: Stages 13 to 15, signing, frozen sorting, merging

Owner's words, verbatim: "merge #65 once green too", then "1a, 2a, 3 yes, 4b, 5a, 8a, 9a, 12 yes", answering a numbered list of questions. Pull request #65 (Stage 12) was merged on green CI.

1. **Super overs (Stage 14), answer 1a.** Use the ICC standard. Each side bats one over, and an innings ends at 2 wickets. Super overs repeat until there is a winner. A batter dismissed, or a bowler who bowled, in one super over cannot take part in the next. They are built under a new opt-in ruleset version; the frozen engines do not change.
2. **Where super overs apply, answer 2a.** Exhibitions only at first. Careers are unchanged.
3. **DLS and DRS, answer 3 yes.** Build them after super overs, each in its own pull request. DLS will be a fictional, documented method, not the licensed DLS tables.
4. **Stage 13 historical data, answer 4b.** No source or licence is approved. Stage 13 stays parked, and more fictional scenarios may be built instead.
5. **Stage 15, answer 5a.** Build the parts that do not need historical data now: custom round-robin, group and knockout formats and tours for the fictional world.
6. **EXE signing, answer 8a.** The Windows executable stays unsigned for now.
7. **Frozen-engine sorting, answer 9a.** The frozen engines keep `localeCompare`; no change.
8. **Merging, answer 12 yes.** An agent may merge its own pull requests once both hosted checks pass on the final head and the branch is clean, without asking each time.

Still open (not answered): owner playtests and measurements (Stage 16), public release (Stage 17), branch protection, and stopping the paused agents where they run.

## Owner decisions, 17 November 2026 (afternoon): recommended options adopted

Owner's words, verbatim: "Proceed, choosing all the options you recomended as my fully authorised decisions." This answers the numbered list of 18 questions. Each answer is the option marked recommended.

1. **DLS ledger (1a).** Add new rules profiles `LC_T20_02` and `LC_ODI_02` to the innings ledger, allowing shorter innings. This is additive: `LC_T20_01`, `LC_ODI_01`, `LC_RED5_01`, their results, saves and frozen vectors are unchanged.
2. **Revised targets (2a).** A fictional resource-table method, documented in the repository. Not the licensed DLS tables.
3. **Rain (3a).** Seeded, deterministic weather, the same approach as the red-ball delays: a per-match option, off by default.
4. **Rain scope (4a).** Exhibitions only at first.
5. **DRS (5a).** A design proposal comes first, for the owner to approve. Building it needs a new match-model version.
6. **Review limit (6a).** Two unsuccessful reviews per side per innings.
7. **Super-over phase (7a).** Super-over balls keep the frozen generator's powerplay phase and field limits, as documented.
8. **Super overs in exports (8a).** Include the super-over record in `.lcxxvi` exports under a new archive version.
9. **Super-over scope (9a).** Exhibitions and tournaments only.
10. **Stage 15 next (10a).** Let the player choose a team and play its tournament matches on the match screen.
11. **Tournament speed (11a).** Run tournament matches in a background worker.
12. **More scenarios (12a).** Add 4 more fictional scenarios, including super-over and tournament-final situations.
13. **Stage 16 (13a).** The agent prepares a checklist and a one-command measurement script; the owner runs them and returns the results.
14. **Release (14a).** Public release later, after the Stage 16 measurements pass.
15. **Channel (15a).** A GitHub Release with the Windows zip and the web build.
16. **Branch protection (16a).** The owner turns it on (required checks `pass07a` and `windows-browser-acceptance`, no direct pushes); see [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md). This is an owner action; agents do not change repository settings.
17. **Paused agents (17).** No option was marked recommended, so stopping them where they run remains an open owner action.
18. **Stacked pull requests (18a).** Allowed; each merges once both hosted checks pass on its final head and the branch is clean.

## Owner decisions, 18 November 2026: rain engine, player reviews, paused agents

Owner's words, verbatim: "A1a, A2a, B1a, B2a, B3a, B4a, B5a, C1a", answering a lettered list. Each answer is the option marked recommended.

1. **Rain-affected matches (A1a).** Decision 1a of 17 November (new ledger profiles `LC_T20_02` and `LC_ODI_02`) is withdrawn: widening the ledger's rules enum changes schemas pinned by the pass07a freeze. Instead, a separate rain-aware engine wraps the frozen generator, scoring kernel and ledger, the same way the super-over engine does. It decides when a shortened innings ends and applies the revised target from `LC_RESOURCE_TABLE_01` (`packages/simulation/src/rain-targets.ts`). It is opt-in, exhibitions only (decisions 3a and 4a stand), and its saved record has its own new version. The frozen rule sets, engines and vectors do not change.
2. **Rain and tournaments (A2a).** Rain-shortened matches do not enter tournament tables for now. Tournament results stay on the frozen engines.
3. **Player reviews: approach (B1a).** DRS ships as new opt-in rule sets (for example `LC_T20_03` and `LC_ODI_03`). The frozen rule sets stay untouched. [DRS_PROPOSAL.md](DRS_PROPOSAL.md) is approved with the answers below.
4. **Player reviews: numbers (B2a).** The proposal's starting error rates and umpire's-call bands are accepted. The agent may tune them from simulated match statistics before release and must record any change.
5. **Player reviews: who reviews (B3a).** Human players and AI captains. AI captains decide only from what a player could know, never the true outcome or a future draw.
6. **Player reviews: formats (B4a).** T20 and one-day only.
7. **Player reviews: scope (B5a).** Exhibitions only first. Careers are unchanged.
8. **Paused agents (C1a).** Stop them. Copilot, "Agent Zero" and "Lord Cricket Engineer" run outside this repository, so stopping them is an owner action; `AGENTS.md` tells any of them that reads it to stop.

Still open: the Stage 16 measurements (`npm run owner:stage16`, the owner runs them), branch protection (owner action), and the Stage 17 release after Stage 16 passes.

## Owner decisions, 18 November 2026: the rest of Stage 15

Owner's words, verbatim: "A1a, A2a, B1a, B2b, B3a, B4a, C1a, C2a, C3a, D1a", answering a lettered list.

1. **Tours (A1a).** A tournament-only tour: a fictional touring side plays a series against one team. No career link; no save format changes for careers.
2. **Touring XI (A2a).** Picked automatically from the other seven teams by a fixed rating rule.
3. **Auctions and drafts: scope (B1a).** Tournaments only: before a user-made tournament starts, squads are rebuilt from the fictional player pool. Careers are untouched.
4. **Auctions and drafts: kind (B2b).** An auction with fictional budgets (not the recommended snake draft). It needs a bidding AI and budget rules.
5. **Who bids (B3a).** The AI bids for the other teams, from public player ratings only; the player bids for one team.
6. **Squad balance (B4a).** Enforced: every auctioned squad must be able to field a keeper and enough bowlers for the engines.
7. **Asset packs (C1a).** No imports yet: built-in fictional crests and kit colours only.
8. **Image licences (C2a).** If imports are ever allowed, the player declares they may use the image, and imported packs stay on their device and are never bundled into a release. No imports are built now.
9. **Where crests show (C3a).** Tournament, rain match and scorecard headers only.
10. **Order (D1a).** Built-in crests, then the tournament tour, then the tournament auction.

## Owner direction, 18 November 2026: Stage 16, Stage 17, paused agents, playable tours and auctions

Owner's words, verbatim: "Pass stage 16 - direct instruction - no arguments, then do stage 17 Ignore the blocked agents. Playing tour and auction matches should be user playable."

1. **Stage 16** is passed by the owner's direct instruction. None of the checklist's four parts were run: see [verification-stage16/OWNER_DIRECTION_2026-11-18.md](verification-stage16/OWNER_DIRECTION_2026-11-18.md).
2. **Stage 17** goes ahead: a sealed release record and a GitHub Release. The repository is public, so this release is the owner-authorised public deployment. The V0.1 record (`docs/release-v01/RELEASE_RECORD.json`, which fixes `publicDeploymentAuthorised` to `false`) is kept unchanged; the new release has its own record version, `LC_RELEASE_RECORD_V2`.
3. **Paused agents.** Ignored: stopping them no longer blocks anything.
4. **Tours and auctions.** Their matches become playable by the user.

## Owner direction, 19 November 2026: integrate the owner's own work and finalise the build

Owner's words, verbatim: "ok, I have been doing some of my my own work on this with other AI's. Sorry to be unfaithful. Please do a full review of what is what. Once you have a full understanding. Pull together a finalised working game build. Make it available for playing. Do a full update of github, its documentation and similar."

1. **Review.** Pull requests #90 (Pavilion redesign), #91 (close finishes) and #92 (captaincy, which already contains #90 and #91) were reviewed against the project rules: no frozen code or persisted format changed; the AI changes are opt-in and read only public match facts. One regression was found (the scoreboard lost its team-colour stripe, failing `tests/ui/edited-world.spec.ts` in Firefox) and fixed in #93, which carries all three into `main`.
2. **Release.** The unpublished release is renamed `alpha-2026-11-19` and rebuilt from `main` after #93. Its record stays in `docs/release-2026-11-18/`.
3. **Superseded pull requests.** #44, #46 and #47 change nothing that is not already on `main` in newer form. Closing them is left to the owner.
