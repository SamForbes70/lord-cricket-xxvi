# Next pass: M7J scorer contract extension + independent acceptance

Authoritative baseline: Pass 21 / M7I; all research outputs still **NOT FOR GAMEPLAY**. Existing `synthetic-alpha-01`, scoring engine, RNG, match model, ODI/red-ball, fixture autopilot and save schema are frozen.

M7I produced a source-auditable register of 69 uncommon event rows across the frozen eligible two-innings cohort (36 first-innings, 33 second-innings). Do not map rejected cases into normal events. Diagnose handling by cricket law and source notation: retired out, combined wickets, penalty awards, no-ball run counts, overthrows/boundary allowances, and free-hit metadata anomalies. Preserve fielding and wicket-end unknowns.

The low-score chase tail remains unstable across deterministic sample and target strata. 600 simulated research chases have P10 77, while the already-inspected development reference has P10 71 and training has P10 82. That is **diagnostic**, not validation or grounds for tweaking to P10 71. The M7H heldout was inspected during prior model design and is not a final untouched test set.

Player generalisation is predictive only. Same-context training exposure above 300 attempts is uncommon for batter and bowler jointly. No tactical captain choice is identified in Cricsheet JSON, so do not fit causal tactic coefficients.

**Priorities:**

1. Cricket-law adjudication and independent hand-authored event fixtures, then strictly versioned administrative scoring extensions if supported. A new multi-dismissal event contract would be a compatibility change.
2. Fit a complete legal joint scorer model only if 100% explicit required outcome classes reconcile. No inferred fielder identity or ball tracking presented as observed data.
3. New forward-time match data gathered *after* the currently inspected Cricsheet archive, with independent test-set manifest frozen before candidate evaluation. Avoid post-hoc lookups or reporting current holdout as untouched.
4. Separate training-only opponent, competition and era effects. Stabilise chase target/termination subcohorts and lower-score tail with uncertainty intervals, without baking known holdout statistics into the fit.
5. Evaluate tactical advantage through controlled paired-seed engine experiments; causal realism requires observed tactical decisions from a suitable data source.
6. Only upon scorer, replay, skill, tactics, tail, new independent test, and browser gates passing consider a new opt-in versioned gameplay model. Keep old saves pinned to `synthetic-alpha-01`.
7. Run browser/IndexedDB/worker/keyboard/150%-scale tests on an authorised Chromium/Firefox host; this container fails before page JavaScript with `ERR_BLOCKED_BY_ADMINISTRATOR`. Do formal human M3 and reference-hardware benchmarks separately.

M7 remains OPEN. Do not claim EMPIRICALLY_VALIDATED gameplay.
