# Status reconciliation and bounded scoring diagnostic

> **Historical pass snapshot:** This report records an earlier review against base `036c212` and PR #3 head `5baea6a`. See [CURRENT_STATUS.md](CURRENT_STATUS.md) and [AI_CONTINUATION.md](AI_CONTINUATION.md) for current repository state.

The four requested activities are complete as review, capability correction, evidence reconciliation and a fresh diagnostic.
PR #3 passes all four checks at its reviewed head `5baea6a`; it remains unmerged.
The fixed baseline still scores slowly: first innings average 89.15 runs over 96 matches.
No gameplay coefficient or model changes accompany this work.

## 1. PR #3 review

Reviewed source: `5baea6afed9116f39dc6ee468b7846b75da2681a`, independent of this branch from main `036c212`.
All four push/PR checks pass: two Linux verification jobs and two Windows browser jobs.
The review covers source selection, duplicate/missing provenance rejection, reproducibility, tests, CI and research-only approval flags.
All 31 entries in the committed evidence manifests match their hashes.
No blocking implementation issue was found within that scope.
[pr3-review.json](verification-status-quality/pr3-review.json) retains exact check links and verification results.

The review does not approve a source incident's legal interpretation or promote a research model.
The Finch/Mughal cases remain partially corroborated, without accepted scorer fixtures.
PR #3 stays separate so the current documentation/copy fixes need not depend on merging research work.

## 2. Capability corrections

The exhibition footer now identifies the available one-season T20 career and optional tactical captain.
It retains the disabled DLS and synthetic/custom-rules boundaries.
The README, capability matrix, management documentation and onboarding instructions now link to [CURRENT_STATUS.md](CURRENT_STATUS.md).
The roadmap records authorised M7K research preparation and the remaining production/promotion boundary.
Historical reports retain their original results with a current-status pointer.

The corrected descriptions distinguish tactical captain delegation from the fixed fixture autopilot.
They also distinguish browser correctness from empirically validated cricket realism.
No layout, scorer, worker, save schema or probability pack changes occur.

## 3. Acceptance reconciliation

[ACCEPTANCE_RECONCILIATION.md](ACCEPTANCE_RECONCILIATION.md) maps the evidence to the original acceptance gates.
Issue #1 now retains an explicit reconciliation section and stays open for owner-PC Chromium/Firefox automation.
Hosted native Windows results and the local Edge playthrough are both recorded, without substituting one for the other.
The original local automation criterion is retained rather than silently waived.

The owner's successful match, score/result, layout verdict and repeat replay verification remain accepted reports.
Exact local OS/browser versions, viewport dimensions and tested commit remain NOT RECORDED.
Separate keyboard-focus, unavailable-bowler and terminal-control observations remain unrecorded beyond the overall successful playthrough.
The original archive comparison passes; earlier absence notes now point to that later result.
Completing this reconciliation does not assert that the residual local tests ran.

## 4. Diagnostic protocol and repeatability

The protocol fixes 96 `m7c-profiling-000000` through `m7c-profiling-000095` seeds before execution.
Two complete runs exercise the existing production `runFixtureT20` path through the unchanged `m7c-synthetic.ts` tool.
Both runs use the same frozen team-01/team-02 XIs, ground-01 and fixture-captain policy.
The toss varies with each seed; the fixture policy chooses to bat when it wins.
The baseline policy does not exercise the optional tactical captain or a controlled aggression/field ablation.

[PROTOCOL.json](verification-status-quality/PROTOCOL.json) retains the pre-run scope, source hashes and target bands.
[DIAGNOSTIC_COMMANDS.json](verification-status-quality/DIAGNOSTIC_COMMANDS.json) records actual commands, timestamps, durations and exit codes.
Each run emits every match's innings/phase counters and final event hash.
The unchanged source diagnostic reconciles its delivery-derived runs, wickets and legal balls with the engine scorecard.

All 96 repeat matches agree on every non-runtime field, including every final event hash.
The deterministic projection SHA-256 is `696463a3124a91df78ce9ebdd5576681cd37d39d481c2a6511688aa11ffd3dd4`.
Timing fields differ as expected and are excluded from that projection only.
No reference data, training data or final evaluation cohort is read by this diagnostic.
The protocol does not fit, tune or promote a model.

## Scoring results

The first-innings cohort includes all-out innings and avoids successful-chase truncation.
Percentiles use the nearest-rank method.
Dot/boundary fractions use delivery attempts; run rates divide pooled runs by legal balls.

| Metric | First innings, 96 matches |
| --- | ---: |
| Mean runs | 89.1458 |
| Mean wickets | 7.4688 |
| Score P10 / P50 / P90 | 68 / 89 / 109 |
| Dot-attempt fraction | 63.7794% |
| Boundary-attempt fraction | 8.7767% |
| Illegal-attempt fraction | 1.5291% |
| Pooled runs per legal over | 4.6089 |
| All-out innings | 22 |
| Allocation-end innings | 74 |
| Mean runs among allocation-end innings | 92.1081 |

Even first innings that use their full allocation score slowly in this setup.
That observation separates the low totals from successful-chase censoring and early all-out endings.
It does not isolate whether probabilities, attributes, baseline tactics or their interactions cause the pattern.

| First-innings phase | Runs per legal over | Dot attempts | Boundary attempts |
| --- | ---: | ---: | ---: |
| Powerplay, legal balls 0–35 | 4.0729 | 66.4002% | 7.1082% |
| Middle, legal balls 36–89 | 4.4434 | 64.0887% | 8.3124% |
| Death, legal balls 90–119 | 5.6573 | 59.6725% | 11.9193% |

These are pooled rates over the exposure actually reached, rather than equal-length phase averages.
Early all-out innings contribute fewer later-phase balls.
The results describe one setup and baseline policy, not all teams, grounds or tactical settings.

## Chase results and censoring

Second-innings totals are reported separately and must not be treated as full-allocation scoring distributions.
A successful chase ends when it reaches the target, including on an extra or the final legal ball.
The summary checks the target before all-out/allocation termination classification.

| Second-innings ending | Matches | Mean runs |
| --- | ---: | ---: |
| Target reached | 46 | 80.4783 |
| All out without reaching target | 21 | 73.0476 |
| Allocation ended without reaching target | 29 | 78.5862 |

Two of the allocation-ended matches are ties.
The pooled second-innings mean is 78.2813, but includes censored successful chases.
It is descriptive only and is not compared with an uncensored reference mean.

Target bands were fixed before either run and are descriptive, rather than fitted tertiles.

| Target to win | Matches | Successful chases | Ties |
| --- | ---: | ---: | ---: |
| 1–80 | 25 | 23 | 0 |
| 81–100 | 43 | 20 | 2 |
| 101 or more | 28 | 3 | 0 |

The target relationship is an observation, not proof of a causal pressure effect or calibrated chase difficulty.
No previously inspected real-data holdout is relabelled as an untouched test set.
Historical 64-match means use a different seed/cohort definition and cannot establish improvement from this unchanged engine.

## Fresh checks and protected boundaries

The local schema, build, typecheck, lint, scoring-fixture and deterministic-vector checks exit zero.
The full TypeScript suite passes 538 tests across 30 files.
Six new Python tests cover chase censoring, final-ball success, ties, input reconciliation and repeat projections.
The summary checks are added to Linux CI.
The full 56-fixture management acceptance passes with deterministic continuation and portable round-trip checks.
All six Chromium/Firefox UI tests pass, including keyboard-only matches, replay, terminal controls and long-name/150% layout checks.
Browser screenshots, numeric bounds and exact command metadata are retained in the same evidence directory.

The fixture auditor's aggregate terminal/clock/persistence/NRR comparison remains `NOT_IMPLEMENTED` in that tool.
Its passing scorer/ledger observations are not presented as completion of that separate aggregate comparison.
Existing bundle-size warnings remain in the production build output.
No reference-hardware performance gate is claimed.

All 243 tracked package files remain byte-identical to main `036c212`.
The dependency lockfile is unchanged.
The final build's simulation worker still has SHA-256 `60df03f74ca1595fab9ec8a6c041445f8f1c039b0d634503fe8913f31c83dac4`.
[PROTECTED_SOURCE_CHECK.json](verification-status-quality/PROTECTED_SOURCE_CHECK.json) records those comparisons.
The changed web presentation bundle reflects the footer correction only.

## Interpretation and next bounded task

The diagnostic reproduces low scoring under the frozen baseline setup without changing coefficients.
It provides no new empirical acceptance verdict and no causal attribution to a particular feature.
The next diagnostic should trace default-policy choices and conditional event probabilities across declared team/ground scenarios.
That would distinguish a narrow baseline-policy effect from a broader generator/attribute pattern before proposing any probability change.
A tactical experiment must use paired seeds and declared interventions, separate from observational player statistics.

Exceptional-event evidence review can continue independently.
The next production-capable research ledger still requires reviewed fixtures and explicit version boundaries.
Model promotion remains separately gated, with exact historical replay preserved.
