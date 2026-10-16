# LORD CRICKET XXVI: Pass 19 / M7G engineering and acceptance record

## Decision

**BOUNDED RESEARCH IMPLEMENTATION PASS; M7 GAMEPLAY PROMOTION NOT ACCEPTED.** This pass improves actual held-out statistical evidence and scorer attribution in an offline candidate without changing the accepted `synthetic-alpha-01` engine. It does NOT complete M7 release acceptance. Browser/IndexedDB gates remain **BLOCKED BY EXECUTION HOST POLICY** and human M3 gate remains PENDING.

## Baseline and frozen compatibility

- Exact accepted baseline: Pass 18 / M7F source commit `eb21f60fac9df10599b8e4467072602683bfd87a`.
- Pass 19 adds only offline research/model-analysis and tests, CLI documentation and package scripts. Normal scoring, domain validation, RNG, original probability coefficients, delivery generator, T20/ODI/red-ball engine, season persistence, and existing save manifests remain untouched.
- Python/TypeScript research version: `LC_T20_SCORING_COMPONENTS_RESEARCH_V1`.
- Candidate pack: `gameplayIntegrationPermitted=false` and `empiricallyValidatedGameplay=false`.

## Dataset and method

The original T20 JSON archive was supplied directly by the user; this runtime did not independently download it. Source SHA-256: `d89ef1b3df83f520bf6bbfe2a439e3246cc6e6bc82fdc40ab97313b82c33ac9e`. Attribution: Cricsheet (https://cricsheet.org/), ODC-By licence notice retained, https://cricsheet.org/licensing/ . The original upload is not redistributed in the package.

Frozen chronological split: 2,605 first-innings training matches, 652 held-out matches, no match-ID leakage or date overlap; 321,480 accepted training delivery attempts. Candidate conditions on first-innings phase and wickets-lost band, plus five train-inferred latent innings scoring regimes. The held-out latent-regime prediction is **sequentially marginalised** using only preceding observed deliveries. It never receives a retrospective heldout innings-run label. The train-inferred score-rate cutpoints are 118/142/162/184 projected runs per full 120 legal balls.

Outcomes are **joint** over legality, runs credited to batter, separate wide/no-ball/bye/leg-bye channels, four/six boundary allowance and supported wicket class/which batter dismissed. Exactly 59 observed training categories. Each regime/context probability row quantises to 2^32 integer units, with reproducible fixed research-domain SHA-256 addressing. Python and TypeScript draws match precommitted cross-language vectors.

Cricsheet lacks several fields demanded by the scorer, including definitive wicket end, fielder identity, attempted stroke, trajectory, executed bowling length and elapsed ball time. The isolated TypeScript scorer adapter supplies those as **declared synthetic placeholders**, never as empirical observations. The existing `validateDeliveryResolution`, `scoreDelivery` and `reduceScoringBoundary` are called unchanged and reject invalid resolutions. All 59 observed categories and eight complete sample first innings reconcile through that boundary.

## Independent held-out result

| Outcome | M7F offline | M7G offline | Cricsheet heldout |
|---|---:|---:|---:|
| Mean first-innings runs | 149.3 | 145.7 | 150.55 |
| Mean wickets | 6.89 | 6.91 | 7.24 |
| Dot attempts | 38.0% | 38.41% | 39.32% |
| Boundary attempts | 13.6% | 13.47% | 14.02% |
| P10 innings score | 118 | 85 | 83 |
| P50 innings score | 151 | 148 | 151 |
| P90 innings score | 182 | 199 | 212 |

M7G evaluated 600 deterministic research-only first innings. Seven aggregate-sample tolerances pass. Candidate-minus-phase-only held-out categorical NLL is **−0.0128308 nats/attempt**, match-bootstrap 400-replicate 95% interval **[−0.0150526, −0.0105447]**. This compares candidate with a matched scoring-component baseline, **not directly with M7F's different coarser envelope log-loss**.

## Explicit negative results / failures to promote

- **36 rare/unsupported observed attempts** were excluded across combined cohorts, with named reasons in the evidence. The exclusions are not imputed into the model.
- **2 heldout categories** were unseen in the training support; held-out predictive scores transparently omit those attempts and report their identities. Fitting was NOT adapted after inspecting them.
- This is a constrained observed-category model, not an exhaustive catalogue of cricket-legal outcomes; it is **not** a complete generator suitable for gameplay.
- Cricsheet alone does not identify Lord Cricket's fictional 0–100 player ratings, bowling tactical commands or ball-tracking/physical fielding details. Empirical player/tactic-effect gates remain false.
- The first-innings comparison is not a complete live two-innings match, chase/free-hit/toss/captain/condition validation suite.
- Historical replay, UI and IndexedDB acceptance of any new gameplay model has not been attempted because this candidate is intentionally disabled.

## Verification and inherited regression

- Python test suite: **41/41 PASS** across M7C/M7D/M7F/M7G research tests.
- TypeScript: **520/520 PASS**, split by group to avoid host execution timeout: 515 inherited plus five new M7G scorer/pack/replay tests. 28/28 unit test files pass in eight bounded groups.
- Schema drift: existing **163 PASS**. Production build, typecheck, lint and all seven package boundaries PASS.
- Deterministic vectors, independent probability oracles, generator vectors PASS and remain frozen.
- Full season: **56/56 fixtures**, 14 managed, 42 off-screen, exact-once condition, reload/export/import, archive, duplicate 57th result rejection PASS.
- Existing system Chromium browser Playwright: **BLOCKED BEFORE PAGE LOAD**, `page.goto` returns `net::ERR_BLOCKED_BY_ADMINISTRATOR` on `127.0.0.1:4173`; not a browser PASS and not evidence of app failure.
- Reference 4-core/8GB laptop performance and formal M3 human acceptance still PENDING.

Reproducibility: `bash scripts/m7g-run.sh /absolute/path/to/t20s_json.zip`. Outputs remain strictly in `reference/m7g/` and cannot change runtime model coefficients.

## Next action

Pass 20 / M7H: predeclared scorer-complete legal category support, correctly identified or synthetic-marked physical delivery resolution, empirically fit player effects, controlled tactic response, full two-innings/chase validation, untouched post-tuning test, and authorised browser acceptance. See `docs/NEXT_PASS.md`. Do not silently promote this M7G research model.
