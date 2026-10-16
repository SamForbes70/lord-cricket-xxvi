# M7G: empirically fitted components, not a promoted match model

Source: Cricsheet `t20s_json.zip` provided by the user. Reference extracted using the frozen M7C match-level split and independently hashed source archive. Cricsheet is attributed under **Open Data Commons Attribution 1.0 (ODC-By)**: https://cricsheet.org/ and https://cricsheet.org/licensing/ . Do not distribute the uploaded original archive without satisfying the licensing obligations. Derived fitted evidence and category packs retain attribution.

## Statistical method

- Training: **2,605** mixed men's T20 first innings, February 2005 to August 2025.
- Untouched chronological held-out evaluation: **652** first innings, August 2025 to October 2026, no shared match IDs or overlapping dates.
- Observed components: legal/wide/no-ball, batter runs, wide runs, no-ball runs, byes, leg-byes, boundary allowance, supported dismissal type, striker/non-striker dismissal.
- Observed training category support: 59 categories. 36 excluded unusual delivery attempts across both cohorts are enumerated in the evaluation. Two held-out categories have no training support, **not retrospectively added** to the support.
- Five latent run-tempo classes learned from training-innings projected scoring rates. The class is sampled once per generated innings and is not known from a real current match. In held-out scoring, latent classes are integrated by a sequential filtering posterior that sees only the preceding deliveries, not the full final score or the held-out class label.
- Phase and wickets-lost conditional integer probability masses, each with exactly `2^32` cumulative mass. Category draws use a research-only SHA-256 address and are reproducible across Python and TypeScript.
- Match-level 400-replicate bootstrap of candidate minus phase-only negative log-loss. Confidence intervals are **not** per-ball independent resamples.
- Headless synthetic first-innings test: 600 fixed-seed innings, first 120 legal deliveries or 10 wickets, with no score targeting. **This is not the production match simulation.**

## Bounded scorer adapter

A TypeScript adapter maps each supported full component tuple to the existing `DeliveryResolution` contract, verifies it using the *unchanged* `validateDeliveryResolution`, and calculates accepted scoring events through the *unchanged* `scoreDelivery` / `reduceScoringBoundary` functions. All 59 fitted categories and eight representative entire research innings are verified.

Cricsheet does **not** contain complete shot geometry, measured trajectory, actual wicket end, bowler length, elapsed seconds, or the game-model fielding resolution. The adapter supplies deterministic **synthetic placeholders**, explicitly labelled and NEVER represented as empirical fielding observations. This is an *offline scorer-compatibility adapter*, not a proof of real-match reconstruction or an approved gameplay generator.

## Acceptance boundary

Seven aggregate-score tolerance gates pass on the synthetic 600-innings cohort. The observed component category model nevertheless **fails full coverage** for unusual legal scoring events and held-out support. Also open are actual player-skill calibration, tactic effects, full fielding and striker-end information, browser acceptance and production-save/replay integration of a distinct model version.

`gameplayIntegrationPermitted=false` and `empiricallyValidatedGameplay=false` are mandatory in the immutable candidate pack. The accepted production `synthetic-alpha-01` is still the sole selectable gameplay model. Existing saves remain binary compatible with accepted model/rules/PRNG fingerprints.

Do not approve M7 overall until:
1. A scorer-complete and rule-validated generator covers **all** supported wickets/extras with positive categorical support and no leaked outcomes.
2. Independently reviewed player/innings/skill features and tactic interventions are measured and validated, not invented from scoreboard correlations.
3. Truly untouched after-tuning time and competition heldout validates the joint and aggregate metrics.
4. Both browser-family runtime and persistence/replay gates run on an authorised host; historical engines remain addressable.
5. Human cricket rules and data licences are reviewed before marketing empirical calibration.

## Reproduction

`bash scripts/m7g-run.sh /absolute/path/to/t20s_json.zip`

Do not mistake the reference-data calibration command for installation of a gameplay model. No network services or remote APIs are required for the fit after obtaining the ZIP.
