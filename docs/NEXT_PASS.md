# Next Pass: M7H full legal outcome support, player/tactic calibration and browser acceptance

**Pass 19 / M7G result:** Research-only joint scoring component candidate (`LC_T20_SCORING_COMPONENTS_RESEARCH_V1`) fitted to 2,605 real Cricsheet training matches and scored on 652 chronological held-out matches. Five latent scoring-tempo regimes fixed M7F's excessively narrow simulated first-innings distribution on seven sampled aggregate checks. Heldout online-posterior negative log-loss improves over the phase-only scoring-component model. 59 observed joint categories map through the accepted T20 scorer, eight full research innings pass reconciliation. No accepted gameplay model/rules/random/save contract changed.

**M7H must close the blocking gaps rather than changing scores ad hoc:**

1. Cover the rare Cricsheet combinations excluded from M7G and unseen-but-scorable heldout categories with a **predeclared legal outcome support**, fixed using training/rules alone, never by peeking at validation failures. Distinguish unusual data corrections from unsupported scorer semantics and independent adjudication.
2. Model full `DeliveryResolution` semantics including physically valid ends, wicket credit, fielder identity, trajectory and catch/runout physics where identifiable. Synthetic stand-ins remain labelled and never treated as ground truth.
3. Make a documented source/licence review decision for dataset rights and cohort suitability; stratify results by competition, era, and quality. Treat the already-inspected M7G heldout as validation, establish a new untouched future-time test for any subsequent model tuning.
4. Fit player/opponent ability effects with minimum exposure, shrinkage, leave-player-out and later-season evaluation as appropriate; avoid identifying tactical effects from score alone. Introduce tactical response surfaces only with controlled synthetic or independent empirical evidence and explicit status.
5. Validate the **complete 2-innings match** generator, chases/free hits/fielding/workloads/scorecards, not first innings alone; add high-volume confidence intervals and paired-seed dominance/exploit scenarios, while retaining unchanged M7F and pre-M7F historical loads.
6. Gate new versioned model packs and migration compatibility explicitly. Never activate research packs in the production T20/ODI/red-ball engines without passing all model, cricket and replay gates.
7. Run actual Chromium and Firefox IndexedDB + keyboard/150% zoom/worker tests on an authorised host (current host still returns `ERR_BLOCKED_BY_ADMINISTRATOR`) and complete M3 human playthrough.
8. Measure against the original performance budgets on a recorded 4-core/8GB reference laptop. Do not rebrand Node or Python diagnostic timings as those budgets.

**Do not mark M7 complete** merely because aggregate means and percentiles now fall inside the synthetic comparison tolerances. Gameplay status is still `SYNTHETIC_ALPHA`.
