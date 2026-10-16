# Lord Cricket XXVI: Pass 21 / M7I engineering and acceptance report

## Verdict

**M7I RESEARCH IMPLEMENTATION VERIFIED; FULL SCORER-COMPLETENESS, EMPIRICAL GAMEPLAY PROMOTION, M7 AND BROWSER ACCEPTANCE STILL OPEN.**

M7I advances the specific evidence and validation blockers inherited from M7H. It **does not** claim that all exceptional scoring events are now implemented, that player abilities are calibrated, or that live opponent tactics have been empirically fitted. The playable model is still `synthetic-alpha-01`, and all prior save/replay contracts remain pinned and unmodified.

## Baseline and input provenance

- Authoritative M7H source commit `b919aed2e38ad8484299d75271984d801e56034c`; cloned cleanly before changes.
- User-uploaded Cricsheet `t20s_json.zip`, SHA-256 `d89ef1b3df83f520bf6bbfe2a439e3246cc6e6bc82fdc40ab97313b82c33ac9e`.
- Frozen M7C chronological split through M7G research reference: 2,605 training / 652 previously inspected development-holdout first innings; M7H eligible chase split 2,569 / 646. No new untouched future test set is present. Cricsheet https://cricsheet.org/ ; ODC-By 1.0 https://cricsheet.org/licensing/ ; original licensed ZIP not redistributed.
- No existing statistical model, seed address, probability coefficient, scorer, engine, rules, persistence schema or saved-match hash was changed.

## Delivered source

1. `scripts/m7i-rare-adjudication.py`: fingerprinted, sanitised register of unsupported source deliveries, reporting cause, innings, training/development cohort, observed run/wicket components, and explicit adjudication disposition. Every exceptional category remains **rejected** in the research sampler rather than forced into an ordinary legal outcome. Observed fields only; absent fielder, wicket end and trajectory are not invented.
2. `scripts/m7i-player-generalisation.py`: fixed M7H player/phase 300-attempt shrinkage examined by player training exposure, chronological half and competition, with match-bootstrap confidence intervals. No tuning or fitting to development-holdout observations.
3. `scripts/m7i-tail-diagnostic.py`: 600 deterministic two-innings research continuations, reporting target-tertile and termination-specific score tails against original training data and previously inspected development observations. No parameter changes.
4. `tests/test_m7i_quality.py`: 12 negative and reconciliation cases covering penalty extras, retired out, multi-wicket, nonstandard no-ball, free-hit mask, exposure strata, empty training context and research promotion prohibitions.
5. `scripts/m7i-run.sh`: full offline reproducer from the separately supplied source ZIP, rebuilding frozen M7H inputs when missing.
6. ADR-031, README runbook and NEXT_PASS.

## Rare-delivery audit

**69** exceptional attempts across the frozen eligible reference matches: **36 first innings, 33 second innings**. The 33 second-innings cases reconcile with M7H's original unsupported-attempt count; the broader 69 total is not an increase in the second-innings exception rate. No event was silently coerced or fitted as an invented legal combination.

The observed causes include retired-out batters (`UNSUPPORTED_WICKET_TYPE`), multi-wicket source rows, penalties, unusual no-ball run counts, free-hit/wicket conflicts, wide wickets and boundary-with-dismissal allowances. In particular, the accepted scorer currently rejects nonzero penalty extras and requires one automatic no-ball run; it cannot simply accept those source examples without a versioned scoring/rules decision. Treat the source archive as evidence, not a self-sufficient cricket-law adjudicator.

## Player-history generalisation (predictive associations only)

Of 148,808 held-out batter/bowler observation attempts using phase-specific training exposure, **127,683 (85.8%)** have **neither participant above 300 training attempts in the same innings/phase context**; **1,858 (1.25%)** have both. Fixed-prior pooled estimates show small predictive signal for dot and boundary rates in the warm/other groups, but wicket gains are not robust across every exposure/competition subgroup. For example, `BOTH_300_PLUS` wicket comparison's 95% match-bootstrap interval crosses zero; the ICC Men's T20 World Cup wicket subgroup has a positive point delta (worse than baseline).

**Not evidence** of 0–100 skill ratings, observed captain tactics or causal batting/bowling adjustment coefficients. Previous development-holdout data were examined by M7C–M7H and are not fresh final-test evidence.

## Chase low-score tail by target band

The target tertiles (<=135, 136–169, >=170) were chosen **only from training matches**. In 600 fixed-seed simulated research chases, aggregate P10=77, mean runs=124.28 and win fraction=49.33%. The previously inspected development reference has P10=71, mean runs=122.78, win fraction=50.77%; training P10=82. The earlier M7H 400-match sample had simulated P10=80. The new P10 varies with deterministic sample and target composition; **no tail-fix claim** is warranted.

For low-target chases, simulated P10 is 74 vs 71 training and 61 development. Middle-target model P10 is 79 vs 100 training and 86 development. This divergent conditional structure requires work before any promotion. The model is still research only.

## Engineering verification (executed)

| Gate | Result |
|---|---|
| Frozen source baseline verified | PASS |
| Strict 163 JSON schemas | PASS |
| Production build, typecheck, ESLint, package boundaries | PASS |
| PRNG/state-hash, probability LUT/masks, generator vectors | PASS |
| TypeScript: main 461 + red-ball 19 + season persistence 10 + match/management/offscreen 26 + ODI 10 | **526/526 PASS** |
| Python M7 legacy plus new M7I tests | **67/67 PASS** |
| Full 14-round management acceptance | **56/56 fixtures PASS**, 14 managed, 42 off-screen, final archive and export/import continuation reconciled, duplicate 57th rejected |
| M7I research outputs repeat from original archive | **PASS**, byte-identical SHA-256 rerun |
| Synthetic engine diagnostics (32 matches) | Executed, descriptive only: 83.81 mean innings runs; Node T20 p95 ~433ms |
| Browser M7B system Chromium | **BLOCKED** before application executes (`ERR_BLOCKED_BY_ADMINISTRATOR`) |
| Firefox/IndexedDB browser and formal human M3 acceptance | NOT EXECUTED / PENDING |
| Scorer-compatible support for all source outcomes | FAIL, 69 explicit exception records |
| Empirically identified tactical effects / gameplay player rating calibration | NOT VALIDATED |
| New untouched post-development final cohort | UNAVAILABLE |
| Reference laptop performance targets | NOT TESTED |
| Production model migration | NOT ATTEMPTED, no migration needed |

A combined match/management/ODI unit test invocation hit the host's execution window, so no pass is credited to that run. The affected suites were rerun separately and passed. The host's Chromium restriction is an acceptance blocker, not a passed UI gate.

## Compatibility and safeguards

No changes to `packages/domain`, existing `packages/simulation` production scorer/sampler/random or `packages/persistence`, M4/M5B fixtures, the existing M7G/H models, archive protocol or UX. Changes are research scripts, verification tests, documentation and npm command additions only. The original world and simulation manifest remain unchanged. Source comparisons and package checksums are included in the release evidence.

## Self-critique and release decision

The largest remaining shortcoming is **implementation completeness**: M7I audits the rare events but does not yet extend the scorer to accept them. Doing so naively would violate the frozen normative event contract. The current data do not support physical fielding reconstruction or tactic causality. The target-conditioned diagnostic indicates instability rather than a fitted correction. The player-history analysis is partially confounded by cohort/opponent/competition effects. Browser and formal human evidence are still missing.

**Decision:** accept M7I as a bounded and reproducible research/diagnostic pass. Do **NOT** promote empirical model, call M7 complete or claim browser acceptance.

**Next pass M7J:** versioned cricket-law event adjudication and scorer-contract extensions with independent fixtures; a new untouched forward-time evaluation set; player/competition/era adjustment research; genuine authorised browser/IndexedDB and reference-hardware acceptance. See `docs/NEXT_PASS.md`.
