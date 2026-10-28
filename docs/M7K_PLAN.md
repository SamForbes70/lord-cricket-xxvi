# M7K: scorer integration and model feasibility

Status: STARTED, planning and evidence preparation only. Owner authorisation: 26 October 2026.
Baseline: `036c21239026a36ee9eaf4aac8e766ec74e2854e`, including merged PR #2.
This pass defines implementation gates; it does not implement or promote a new gameplay model.

## First decision: preserve the production boundary

M7K begins with independently adjudicated evidence, as required by ADR-032 and `NEXT_PASS.md`.
The current `adjudicateM7J` result supplies deltas, replacement requests and pending penalties.
It does not maintain a complete innings ledger, player credits, event history or durable receipts.
Its `gameplayIntegrationPermitted=false` flag remains authoritative.
A structurally valid request cannot authenticate an umpire decision.

All new implementation must remain behind separate research entrypoints until its acceptance gates pass.
Keep `synthetic-alpha-01`, `LC_T20_MATCH_V1`, existing saves and their replay outcomes intact.
Normal deliveries must reuse `scoreDelivery` and `reduceScoringBoundary`, rather than create another ordinary scorer.

## Current evidence inventory

The source-addressed M7J register contains 69 unresolved or conditional cases, including 17 previously inspected holdout cases.
The remaining 52 cases belong to training.
None has independent adjudication or confirmed chronology supplied for this pass.

| Disposition | Cases |
| --- | ---: |
| Umpire and chronology confirmation | 24 |
| Award reason and beneficiary | 11 |
| Field and ground ends adjudication | 2 |
| Event order conflict | 4 |
| Overthrow chronology conflict | 2 |
| Source review conflict | 5 |
| Unresolved | 21 |

[The worksheet](verification-m7k/LC_M7K_EVIDENCE_WORKSHEET.json) retains each source identity, hash, disposition and evidence request.
Every review starts with false confirmation flags and empty evidence fields.
The worksheet is an intake document, not a scorer fixture or independent adjudication.
An external reviewer must supply decisions and references before those flags can change.
Retain rejected and inconclusive cases with reasons; never convert missing evidence into an accepted event.

The uploaded owner release contains source, builds and derived evidence, rather than the original Cricsheet archive.
Original-data verification and a new evaluation cohort require separately licensed source data and recorded hashes.
The original 69 rows can support adjudication research, but cannot become an untouched final evaluation cohort.

## Ordered implementation slices

### K1: evidence and fixture selection

Select at least one representative for each disposition, plus each materially different event sequence within it.
Require chronology, applicable playing conditions, award beneficiary, extras attribution and ground ends where relevant.
Record match identity, source hash, reviewer, review date, cited evidence and the decision for each case.
An independent reviewer must confirm the sequence before conversion into an executable acceptance fixture.
Contradictory evidence stays unresolved.

Exit: reviewed representative fixtures have explicit expected totals, player credits, physical ends and next decisions.
Coverage reports must distinguish accepted, rejected and unresolved source cases.
Seven representatives alone cannot establish complete coverage of all mechanisms or 69/69 support.

### K2: isolated versioned ledger and event stream

Propose additive contracts through research subpaths and a separate rules/model identity.
Specify ordered delivery and dead-ball administration events, sequence numbers and command receipts.
Resolve fielding-side penalty allocation explicitly across innings; retain pending awards until their destination is known.
Track retirements, occupied ends, replacements, dismissal status and permitted return separately.
Specify closure precedence at the winning target, last legal ball, tenth wicket and subsequent administrative award.
Independent adjudication must resolve disputed laws or playing conditions before the implementation encodes them.

Exit: accepted fixtures reconcile team runs, extras, wickets, batter lines, bowler lines and legal balls after every transition.
Penalties consume no ball and debit no bowler; retirement never becomes a bowler wicket.
Failed commands leave the caller state unchanged.
Duplicate and out-of-order commands fail without creating another event or award.
Overflow and illegal identity attribution fail explicitly.
Ordinary scoring follows the frozen kernel; any incompatible rule change needs its own version and review.

### K3: replay and interrupted persistence

Specify a separate archive/event version and deterministic dispatch by saved model and rules identity.
Replay must reconstruct totals, ends, pending awards, replacements and terminal state after every event prefix.
Test interruption before acceptance, after event acceptance and before checkpoint publication.
Test duplicate receipt delivery, damaged checkpoints, unknown versions and unsupported model/rules combinations.
A fresh browser context must import a candidate archive and reproduce its event and scorecard hashes.
Existing v1 saves must reproduce their historical hashes through the unchanged v1 path.

Exit: old fixtures pass, candidate round-trips pass and incompatible combinations reject explicitly.
Never append candidate events to a v1 match or silently migrate an existing save.

### K4: candidate evaluation feasibility

Declare data rights, attribution, cohort eligibility and exclusions before candidate fitting.
Use match-level chronological splits with no same-date overlap; retain source manifests and exclusions.
Require at least 200 training and 200 evaluation matches under the inherited runbook minimums.
A new untouched forward-time cohort must remain sealed until the candidate and evaluation protocol freeze.
Record all previously inspected M7C-J cohorts as development data.

Use ADR-027's descriptive bands as proposed benchmarks:

| Metric | Proposed difference from eligible reference |
| --- | --- |
| Mean innings runs | At most 5% |
| Mean innings wickets | At most 0.5 |
| Dot and boundary fractions | At most 2 percentage points each |
| Score P10, P50 and P90 | At most 10% each |

Report both innings, training-defined target bands, phase, termination type, competition and unsupported-event rates.
Report uncertainty with match-level bootstrap samples; do not treat pooled agreement as conditional acceptance.
Agree conditional chase-tail thresholds before opening the new cohort.
Evaluate player strength, fatigue and tactical ablations separately from predictive player marginals.
Observed player marginals do not identify fictional 0-100 ratings or causal tactical effects.

Exit: a reproducible feasibility report identifies supported claims, failed bands, unresolved causes and remaining data needs.
A failed candidate remains research-only; evaluation does not authorise gameplay selection.

### K5: separate gameplay promotion decision

Require independently reviewed scorer fixtures, ledger invariants, archive compatibility and untouched-cohort results.
Require browser acceptance and performance measurements on declared reference hardware before M8.
Preserve exact historical v1 replay and explicit new-game pins for every candidate.
Obtain explicit owner approval before exposing a research model through the game UI or worker.
M7K start approval does not grant that promotion approval.

## First-pass deliverables and verification

This planning pass supplies the ordered plan and a complete 69-case evidence worksheet.
It records source hashes, counts and fresh M7J regression results in `verification-m7k/`.
The worksheet preserves all source identities and leaves adjudication decisions to external evidence providers.
The next implementation slice is K1; K2 production-capable integration depends on its evidence.
No production source, dependency, schema, save format, random stream or probability coefficient changes in this pass.


## K1 preparation update

[Representative review](M7K_REPRESENTATIVE_REVIEW.md) groups all 69 cases into 45 observed signatures.
The selector preserves full source identities and flags a non-retirement dismissal incorrectly grouped by inherited routing.
Selection tests cover coverage, permutation stability, the routing warning and provenance rejection.
Independent source adjudication remains pending; selected observations are not accepted scorer fixtures.


## First source batch

[Source batch 01](verification-m7k/source-batch-01/README.md) verifies 11 source-event hashes across seven actual matches.
It supplies match identities, dates, archive provenance and an official MCC rule reference.
The initial batch lacked contemporary conditions and independently confirmed chronology.
The later historical evidence supplies standard rule context, while match-specific amendments and complete chronology remain unconfirmed.
The batch approves no scorer fixtures.


## Historical evidence follow-up

[Historical evidence](verification-m7k/historical-evidence/README.md) adds independent accounts for the Finch and Mughal cases.
It retrieves contemporary ICC standard conditions and the MCC 2022 code, replacing reliance on 2026 laws alone.
It also documents historical free-hit scope as a limitation of the inherited research classification.
Both cases remain partially corroborated, with zero accepted scorer fixtures and no changed adjudication flags.


## Integration with current main

PR #3 integrates main `b4aceda`, including merged capability corrections and the scenario-quality harness.
The roadmap retains the current browser/human evidence and owner-PC automation gap.
[SCENARIO_QUALITY_HARNESS.md](SCENARIO_QUALITY_HARNESS.md) records the separately implemented ordinary model-quality tool.
This integration adds the research selector checks alongside the existing summary checks in Linux CI.
It retains the 542-test TypeScript suite and all existing application behaviour.
Source adjudication remains incomplete; merging preparation evidence does not accept a new scorer or model.
Fresh integration commands and results are retained under `verification-m7k/integration-main/`.


## Complete source identity audit

[Source context](verification-m7k/source-context/README.md) extends verification to all 69 registered events across 65 matches.
The audit covers every selected signature and retains preceding and following source addresses.
It records player identities, source run sums and observed wicket kinds for review.
Source values establish provenance, rather than umpire chronology, physical ends or accepted scorecards.
K1 still requires independent adjudication before K2 implementation.


## Historical free-hit conditions

[Historical conditions](verification-m7k/historical-conditions/README.md) add a retrieved ICC-authored 2012 PDF and a qualified 2013 transcription.
The standard conditions restrict initial free hits to foot-fault no-balls.
All five registered free-hit cases predate the July 2015 expansion to all no-balls.
Match adoption, no-ball causes and independent adjudication remain unconfirmed.
The update changes no inherited case classification or approval flag.
