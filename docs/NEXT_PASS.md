# Next Pass: M7G complete conditional gameplay model, model-quality gate and browser acceptance

Pass 18 / M7F constructed and evaluated the versioned integer-normalised
`LC_T20_JOINT_ENVELOPE_RESEARCH_V1` on genuine uploaded Cricsheet observations:
2,605 chronological training matches, 652 held-out matches, no overlapping
match dates or IDs. The holdout categorical log-loss is improved over the
pooled baseline. Mean runs, mean wickets, dot rate, boundary rate and median
score fall within proposed tolerances for the *offline first-innings envelope*
but **P10 and P90 still fail**. This candidate is not a scorer-compatible
delivery implementation. Production `synthetic-alpha-01` and saves unchanged.

**M7G priorities (gated, not approval by assertion):**

1. Independent rules/data provenance review and competition/era/strength-cohort
   analysis. Explain score-tail failures and varying match quality.
2. Fit *fully resolved* legal delivery fields, including extras attribution,
   player identity/skill shrinkage, wicket-credit/end semantics, and fielding
   where observed. Never infer unobserved tactical settings as facts.
3. Model and independently test tactical response surfaces against supported
   game commands. Hold all sampler changes behind a new model ID and hash.
4. Compare full seeded match distributions against untouched heldout matches,
   including P10/P50/P90, wicket and dismissal distributions, chase censoring,
   controlled skill/field/fatigue sensitivity and dominance/exploit grids.
5. Preserve old model loads and event chains. New-version compatibility must
   be explicit; no automatic save migration based solely on changed weights.
6. Perform authorised Chromium/Firefox IndexedDB, keyboard/zoom and human
   acceptance; the current host returns ERR_BLOCKED_BY_ADMINISTRATOR.
7. Benchmark on a recorded reference four-core/8GB laptop. Node diagnostics
   alone cannot be claimed as reference-platform performance acceptance.

**No game model was promoted during Pass 18.** Do not describe the joint
research pack as EMPIRICALLY_VALIDATED gameplay.
