# Next pass: M7I outcome completeness, model promotion prerequisites and browser gate

**Current authoritative source:** Pass 20 / M7H. **Research status only.** Original `synthetic-alpha-01` gameplay, RNG, scoring rules and all prior save formats remain unchanged.

M7H added deterministic two-innings/chase research. It learned a second-innings latent scoring-component model from 2,569 eligible training matches, tested it on 646 already-inspected development-holdout matches and simulated 400 complete research match pairs. Mean second-innings scoring, mean wickets, chase-win fraction, median and P90 pass the exploratory target bands; the P10 tail fails. Read the machine-readable M7H evaluation for the exact excluded innings and rare categories; do not collapse those into legal events. M7H also measured 300-attempt-shrunk player-history predictive associations with Cricsheet registry IDs, which improve three heldout marginal losses but **do not identify player skill, 0–100 ratings or tactical causal effects**. This is research-only and does not authorise gameplay promotion.

**Priorities in order:**

1. Independently adjudicate the named rare/unsupported legality, extras and multi-wicket source events. Expand predeclared legal support using cricket rules and training-only evidence, without retrospectively making the inspected holdout support complete by construction.
2. Resolve accurate wicket-end, completed-run, striker-change, fielding and penalty-event semantics in the joint scorer adapter; stop using physical/fielding placeholders where an identified outcome is required. Do not fabricate Cricsheet ball-tracking or captain instructions.
3. Stratify empirical cohorts (competition, era, relative strength, innings/chase context) and reserve a **new untouched forward-time test set**. M7C–M7H repeatedly inspected the current holdout, which is development validation only.
4. Improve low-scoring second-innings tails, with holdout-free parameter tuning and complete chase/scorecard validation, including extras, no balls, free hits, all-out, ties and last-ball targets.
5. Use Cricsheet registry IDs for explicit partially pooled player-history experiments. Validate leave-team/leave-player-out and subsequent seasons, account for confounding and rating uncertainty. Never present marginal predictions as causally identified captain tactics or calibrated 0–100 gameplay ratings.
6. Build controlled tactic-effect tests and anti-exploit scenario grids. Any empirical causal claims require independent observed tactical inputs, which the currently supplied Cricsheet JSON deliveries do not include.
7. Only after all scorer, tail, player, tactic, replay, rules-version and save compatibility gates pass, define an opt-in, separately versioned candidate gameplay pack. Keep `synthetic-alpha-01` available indefinitely for existing saves.
8. Obtain genuine Chromium/Firefox/IndexedDB + worker/keyboard/150%-scale acceptance in an authorised host. Here system Chromium still returns `ERR_BLOCKED_BY_ADMINISTRATOR` before app code executes. M3 human playthrough remains pending.
9. Benchmark the production game against specified targets on a recorded 4-core/8GB reference machine; the Python 400-pair research run is not a browser performance benchmark.

**M7 remains OPEN.** Never claim `EMPIRICALLY_VALIDATED` before these independent gates pass.
