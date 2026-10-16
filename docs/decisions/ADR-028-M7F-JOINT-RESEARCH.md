# ADR-028 — M7F joint delivery-envelope research candidate

Status: **RESEARCH ONLY, NOT ACCEPTED FOR GAMEPLAY**. 16 October 2026.

## Context

Pass 17 / M7E measured the frozen `synthetic-alpha-01` T20 first-innings average
at 88.13 versus a mixed male T20 Cricsheet holdout average of 150.55. Marginal
research models cannot be directly sampled as legal joint ball outcomes because
dot, wicket and boundary occurrences overlap. This pass adds an immutable,
versioned **joint categorical envelope** for independent offline evaluation.

## Decision

The new artifact `LC_T20_JOINT_ENVELOPE_RESEARCH_V1` jointly represents four
observable fields: legality (legal/wide/no ball), **total team runs** (0..10),
batter boundary flag, and broad wicket class. Conditional dimensions are
pre-delivery legal-ball phase (0-35, 36-89, 90 onward) and wickets fallen
(0-2, 3-5, 6-9). Contexts and probability masses use a closed legal-envelope
universe and exactly 2^32 integer mass per context. An independent SHA-256
research address selects a category deterministically, never drawing from an
accepted production game's counter or event stream.

The estimator applies training-only, phase/wicket-context categorical counts
with a training-pooled Dirichlet smoothing prior (250 attempts), a small
positive uniform floor, and an integer quantum floor. Holdout matches, IDs
and dates are never used in fitting. The source archive bytes must match the
frozen M7C manifest SHA-256. The source is user-uploaded, without independent
origin authentication, and the dataset licence must be preserved.

Cricsheet, https://cricsheet.org/ . Open Data Commons Attribution License
ODC-By 1.0, https://cricsheet.org/licensing/ . This repository includes a
**derived** categorical pack and test vectors, not the original Cricsheet ZIP.

## Deliberate limitations

The categorical envelope does **not** encode batter-run versus extra-run
attribution, dismissal location, striker/non-striker changes, fielder,
creditable wicket detail, free hits, penalty runs or complete live legal masks.
It cannot feed `DeliveryRecorded` directly. Cricsheet scores do not identify
Lord Cricket player ratings, bowling instructions, aggression settings, pitch
state or fatigue. Conditional player ability, pitch and genuine tactic effects
therefore **are not inferred or fabricated** in this pass. The 5 unsupported
training/holdout delivery events are counted and excluded with audit reasons.

The 652-match holdout supports a meaningful categorical log-loss comparison,
not validation of every game scoring rule, fictional player rating or tactic.
The heldout competition population is heterogeneous. First-innings simulated
score tails remain too narrow. Neither model selection nor the derived pack
will be installed into gameplay without a new approved full-resolution model
ID/rules compatibility plan and separately versioned seed/replay corpus.

`gameplayIntegrationPermitted=false`. `empiricallyValidatedGameplay=false`.
All historical `synthetic-alpha-01` rules and saves remain unchanged.

## Acceptance contract

- Verify 2,605 training versus 652 chronological heldout matches, no overlapping
  IDs/dates, and the genuine original archive hash.
- Validate source safety, every mass row summing to 2^32, nonzero supported
  category masses, legal-envelope masks, candidate content hash and replay
  invariance across Python and TypeScript research samplers.
- Heldout match-cluster bootstrap interval for joint NLL must be better than
  the training-pooled categorical comparator.
- Independently compare 400 simulated first innings with heldout mean runs,
  wickets, dots, boundaries and P10/P50/P90 score tails.
- Distinguish **passing research gates** from failing score-tail, player-skill,
  tactical, full scoring-resolution, browser and human acceptance gates.
- Run the inherited test corpus, save and 56-fixture season acceptance, without
  modifications to accepted probability/rules/random/scoring modules.

## Reproducibility

`bash scripts/m7f-run.sh /absolute/path/to/t20s_json.zip`

Generated JSON is deposited under `reference/m7f/` and intentionally Git-ignored.
The derived test candidate and deterministic vectors in `tests/fixtures/` are
pinned from the corresponding uploaded-data run with attribution here.

## Further action

M7G should add full legal resolution and batter/bowler ratings inferred from
an independently reviewed dataset, with hierarchical shrinkage and externally
measured tactical effects. Do not force an empirical model status to pass by
retrofitting only aggregate runs. Authorised Chromium/Firefox browser and human
acceptance remain separate release gates.
