# M7D architecture note: empirical phase research without changing cricket truth

**Base source** `1a3b847afae5daeae32e348709d995608bad2738`

New scripts are developer-only tools. The existing game accepts only the exact
`synthetic-alpha-01` probability manifest / hash and deterministic replay identity.
Neither its runtime probability schema nor its model verifier is loosened.

The M7D experimental model is `LC_T20_PHASE_MARGINAL_RESEARCH_V1`.
It fits Jeffreys-smoothed separate Bernoulli probabilities for observed dot
attempts, boundary attempts and wicket attempts by powerplay/middle/death phase.
A corresponding pooled (non-phase) training estimate is the comparison model.
Evaluation reports log-loss *per attempt* on an untouched date-grouped heldout
set. Bootstrap confidence intervals resample entire held-out matches.

The marginal model is valuable for describing where the existing simulator
under/over-scores, but **does not** define a legal normalized joint delivery
sample. It also does not condition on known batters, bowlers, pitch, teams,
selected tactics or innings situation. It is therefore NOT suitable as a
replacement gameplay model. Its versioned offline JSON is provenance-stamped,
never loaded by `packages/simulation`, and cannot affect saved matches.

Future migration plan: preserve the original `synthetic-alpha-01` pack and event
engine for old saves, add a separately versioned model to the registry only
when complete calibration and replay tests pass, and pin new games by explicit
model ID + SHA256. Do not auto-upgrade a match already in progress.
