# Lord Cricket XXVI: Pass 20 / M7H engineering and acceptance report

## Acceptance statement

**OFFLINE RESEARCH IMPLEMENTATION VERIFIED. M7 FULL ACCEPTANCE AND NEW-GAMEPLAY-MODEL PROMOTION NOT APPROVED.** M7H is not a playable empirical model. The original `synthetic-alpha-01`, engine, rule/PRNG versions, fixture autopilot, career persistence and historical saves remain unchanged.

## Frozen baseline and provenance

- Exact accepted source baseline: M7G / Pass 19 commit `c1eea974b7d48210422ba4380a9b0cbce4b5ea04` restored from the Project's source Git bundle, initially clean.
- User-uploaded `t20s_json.zip`, Cricsheet JSON, SHA-256 `d89ef1b3df83f520bf6bbfe2a439e3246cc6e6bc82fdc40ab97313b82c33ac9e`.
- Cricsheet attribution: https://cricsheet.org/ ; ODC-By 1.0 notice inside original ZIP, license information https://cricsheet.org/licensing/ . Uploaded ZIP not included in deliverables.
- Chronological frozen M7C split verified. Existing M7G first-innings candidate regenerated unchanged; only training matches may fit the research candidate. The heldout dataset has already informed prior M7 iterations and **is not a new untouched evaluation cohort**.

## New functionality (research only)

1. `scripts/m7h-two-innings.py`: pre-delivery required-run-rate buckets (below 6, 6–10 inclusive, above 10 runs per over), innings-phase and wicket-band conditioned five-regime second-innings empirical component masses. Stable 2^32 integer mass per context; offline separate SHA256 domain; train-only latent regimes and sequential heldout marginalisation. The model simulates a target-driven chase, with termination on target, all-out or overs.
2. `packages/simulation/src/m7h-research-match.ts`: validates the exact hashed research pack, reproduces Python draw vectors, reapportions free-hit mass and uses the already accepted scorer through a second-innings boundary. Unsupported physical annotations remain explicitly **synthetic** and the pack is unavailable to normal gameplay.
3. `scripts/m7h-player-evidence.py`: uses Cricsheet `info.registry.people` IDs instead of ambiguous player-name strings, quantifies player exposure and checks for actual batting aggression, bowling length, line and field-setting commands in delivery JSON. Those command observations are absent.
4. `scripts/m7h-player-predictive.py`: fixed-prior 300-attempt partial pooling of player/phase binary dot, boundary and wicket histories, evaluated by match-level bootstrap. These are independently measured **predictive associations**, not talent ratings, tactic effects or a joint cricket generator.
5. `scripts/m7h-run.sh`: single entry point for reproducible offline training, validation, player-audit and research test execution from the original user-supplied ZIP.

## Empirical two-innings evidence

- M7H eligible second-innings cohort: **2,569 training** matches, **646 previously inspected development-holdout** matches, with **67,807 supported scored heldout attempts**.
- The model comprises **63 second-innings observed component categories** from **280,405 fitted training attempts**, conditioned on 27 phase × wicket × pressure contexts and five latent scoring regimes.
- Simulated **400 complete two-innings matches** from the independent first-innings M7G research sampler + M7H chase model.

| Measure | M7H 400 simulated second innings | Cricsheet second-innings cohort |
|---|---:|---:|
| Average runs | 124.56 | 122.78 |
| Average wickets | 5.6675 | 6.0418 |
| Legal balls (mean) | 100.44 | 100.12 |
| Chase success fraction | 0.515 | 0.5077 |
| P10 | 80 | 71 |
| Median | 124 | 124 |
| P90 | 172 | 175 |

- Heldout candidate-minus-phase-only negative log likelihood **−0.00751436 nats/attempt**, match-bootstrap 95% CI **[−0.00987961, −0.00527132]**.
- **Five of six aggregate quality gates pass:** mean runs, mean wickets, chase fraction, median and P90. P10 fails (80 versus 71, exceeding 10% tolerance).
- **42 irregular second innings excluded:** 37 premature, 4 invalid, 1 nonstandard target. **33 observed attempted deliveries** counted as unsupported, grouped by specific reasons in the JSON evidence. **One heldout category unseen during fitting**, explicitly disclosed. Not folded into normal outcomes.
- Model is not full legal category support and does not include observed field-position or commanded tactic data.

## Empirical player evidence, with explicit scope

- Cricsheet's per-match stable person registry was resolved. Training: 3,832 batting identities, 2,848 bowling identities. Players with ≥300 observed training attempts: 546 batters and 614 bowlers.
- Heldout attempt coverage by players with ≥300 training attempts: **38.61%** batting, **41.98%** bowling. Not all participants support a well-exposed personal estimate.
- Fixed 300-attempt-shrunk predictive marginals on 148,808 heldout attempts per outcome, compared with the same phase-only baseline:

| Marginal prediction | Candidate minus baseline heldout log loss (nats/attempt) | Match-bootstrap 95% CI |
|---|---:|---|
| Dot | −0.00236736 | [−0.00262356, −0.00212992] |
| Boundary | −0.00170287 | [−0.00194375, −0.00149450] |
| Wicket | −0.00018002 | [−0.00026073, −0.00011177] |

Each experimental marginal is predictive, not a jointly normalised ball-outcome model and not a causal estimate of skills. No observed batting aggression, bowling variation, line/length or field-position commands were found in the available delivery records. Gameplay tactic effects remain unvalidated.

## Required engineering regression

- TypeScript Vitest: **526/526 PASS** across 29 files, in the following non-overlapping resource-controlled shards: main 471/471; red-ball 19/19; season persistence 10/10; match/management/off-screen 26/26.
- Python research/unit: **55/55 PASS** (existing 41 + M7H's 14 new tests), including deterministic research replay, mass validation, scorer compatibility and leakage/negative checks.
- Strict 163 JSON schema drift gate PASS, `npm run build` PASS, `npm run typecheck` PASS, `npm run lint` and all package boundaries PASS.
- Deterministic PRNG/hash vectors, independent probability LUT/masks and delivery-generator vectors PASS.
- 14-round **56/56** accepted production season completion and archive PASS, with 14 user boundaries/42 offscreen, condition once per fixture, resumed export/import equivalence and duplicate 57th result rejection.
- Rerun from the uploaded Cricsheet ZIP reproduced the same M7H candidate *file* SHA-256 `e44568f03535f08c95e22c0e904ef2d17a662aa7753526d8e600d24e175ec269`.
- Production build smoke-test to be recorded separately in packaging evidence.
- System Chromium/Playwright gate: **BLOCKED** before first page JavaScript, `page.goto` to `127.0.0.1:4173` fails `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Not a UI PASS. Firefox and formal human M3 checks remain PENDING.

## Promotion gates and compatibility

**Do not promote.** Remaining failures: rare/invalid event support, missed second-innings low tail, physical/fielding attribution, calibrated gameplay player-strength effects, identifiable tactical responses, an independent untouched final test, authorised browser tests and hardware-specific performance budgets. Previous saves remain accepted only under their original model/rule/version manifest; no silent migration or runtime model switch occurred.

All changes are additions in the separate research layer, plus documentation and offline scripts. Critical existing scoring, domain reducer, random, probability, generator, T20, ODI, red-ball and persistence files are unchanged. See `docs/decisions/ADR-030-M7H-chase-research.md` and `docs/NEXT_PASS.md` for M7I.
