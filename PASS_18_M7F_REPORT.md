# Lord Cricket XXVI — Pass 18 / M7F joint-model evidence report

**Decision:** PASS for research-only M7F implementation, independent empirical
joint-envelope fit/evaluation and inherited non-browser regression.
**NOT PASS:** full scorer-compatible empirical gameplay model, statistical
score-tail gate, player/tactical transfer, browser/IndexedDB acceptance or M8.

## Authoritative baseline and safeguards

- Parent frozen M7E Git commit: `102fc224bce4c72a60e21d721e111f84ac3b758d`.
- Real user-uploaded Cricsheet ZIP: SHA-256
  `d89ef1b3df83f520bf6bbfe2a439e3246cc6e6bc82fdc40ab97313b82c33ac9e`.
- Training: 2,605 matches (2005-02-17 to 2025-08-24).
- Heldout: 652 matches (2025-08-30 to 2026-10-14), 80,354
  first-innings delivery attempts included in this M7F holdout evaluation.
- Model is derived from training only, with no match/date overlap and no use
  of holdout targets for model estimation. Split is inherited exactly from M7C.
- Only five observed delivery attempts were excluded because the bounded
  envelope could not describe their full combined outcome: 2 illegal envelope
  combinations and 3 multiple-wicket deliveries. Context clocks reconcile.
- No change to scorer, production RNG, accepted probability coefficients,
  delivery generator, T20/ODI/red-ball engine, season projections or persistence.
- Legacy `synthetic-alpha-01` model and save compatibility are untouched.

Cricsheet source attribution: https://cricsheet.org/ . ODC-By 1.0:
https://cricsheet.org/licensing/ . The original uploaded ZIP is **not**
redistributed here. Archive provenance is user-supplied and not independently
cryptographically attested to Cricsheet itself.

## Research model built

- ID: `LC_T20_JOINT_ENVELOPE_RESEARCH_V1`.
- Pack SHA-256 (canonical JSON payload):
  `923218fdc32c466f62f1becdbb071edee4c9dc787d0a6226dc9cc0b7edec8711`.
- Each exclusive category jointly describes **delivery legality**, **total
  team runs 0..10**, **bat boundary flag**, and **broad wicket class**.
- Contexts: powerplay, middle, death × 0–2, 3–5, 6–9 fallen wickets.
- Closed legal-envelope mask, positivity and exactly 4,294,967,296 integer
  quanta per context. SHA-addressed research sampler reproducible in both
  Python and TypeScript. Hash integrity and illegal-combination rejections.
- Categorical conditional model uses training-only event counts with a pooled
  hierarchical Dirichlet prior and nonzero uniform category floor.
- The pack is RESEARCH ONLY. It cannot produce fully attributed legal
  `DeliveryRecorded` events and is not used by the playable match engine.

## Untouched holdout evaluation

| Diagnostic | Value |
| --- | ---: |
| Held-out candidate negative log loss per attempt | 1.666506 |
| Pooled training-only comparator NLL per attempt | 1.698822 |
| Candidate minus comparator | -0.032316 |
| Match-bootstrap 95% interval for delta | [-0.034595, -0.030253] |
| Candidate simulated first innings | 400 |
| Candidate mean runs / heldout mean runs | 149.315 / 150.552 |
| Candidate mean wickets / heldout mean wickets | 6.890 / 7.239 |
| Candidate dot rate / heldout dot rate | 37.96% / 39.32% |
| Candidate bat boundary rate / heldout bat boundary rate | 13.61% / 14.02% |
| Candidate P10 / heldout P10 | **118 / 83 FAIL** |
| Candidate median / heldout median | 151 / 151 PASS |
| Candidate P90 / heldout P90 | **182 / 212 FAIL** |

The NLL result is statistically supported for this chronological holdout
against this **pooled** comparator. It does not demonstrate calibrated
international cricket, cross-league portability or superior modelling of
unobserved tactical effects. The 400-innings distribution has too little
variance, consistent with homogeneous phase/wicket conditioning.

## Validation

| Gate | Actual result |
| --- | --- |
| Original Cricsheet ZIP SHA and extraction safety | PASS |
| Source split/date/match isolation | PASS |
| Offline joint candidate fit + holdout bootstrap | PASS |
| Research category masks / integer exact mass / cross-language seed vectors | PASS |
| Fit re-run from uploaded original ZIP | PASS, exactly identical candidate file SHA-256 |
| New Python tests | 12/12 PASS |
| All Python calibration tests | **34/34 PASS** |
| New TypeScript joint research tests | 5/5 PASS |
| Inherited + new TypeScript unit tests, sharded | **515/515 PASS** (486+10+19) |
| Generated JSON Schemas | 163/163 PASS, no drift |
| Production build, strict typecheck, lint and boundaries | PASS |
| Original random/state-hash/probability/generator vectors | PASS |
| Headless full-season management | PASS: 14 rounds, 56 results, 14 user match boundaries and 42 off-screen games, deterministic export/import, duplicate final result rejected |
| Prebuilt HTTP launcher and all production assets | PASS |
| Stock Playwright Chromium | NOT RUN: bundled browser executable unavailable |
| Installed system Chromium | BLOCKED by host `ERR_BLOCKED_BY_ADMINISTRATOR` before code executes |
| P10/P90 score tails | **FAIL** |
| Live batting/bowling/fielding skill effects | NOT IMPLEMENTED in research model |
| Empirically grounded tactic adjustments | NOT IMPLEMENTED in research model |
| Full valid scorer delivery/extras/wicket attribution | NOT IMPLEMENTED |
| Human UI and reference-hardware performance | NOT ACCEPTED |

**No model promotion** and no migration was performed. Existing `synthetic-alpha-01`
save data and rules retain byte-identical simulation implementation.

## New/modified source

Added research files: `scripts/m7f-joint.py`, `scripts/m7f-run.sh`,
`packages/simulation/src/m7f-research-joint.ts`, test fixture pack and
cross-runtime vectors, `tests/test_m7f_joint.py`,
`tests/unit/m7f-research-joint.test.ts`, and system-Chromium diagnostic
configuration. Documentation adds ADR-028 and updates README, capability matrix
and next pass. All accepted previous game-model files are unchanged.

## Reproduction

`npm ci && npm run build` on a supported local environment; use
`bash scripts/m7f-run.sh /absolute/path/t20s_json.zip` to reproduce the
research pack and heldout report. The source package contains the derived
research candidate and test vectors for unit verification even without
redistributing original third-party match files.

## Next M7G

Fit complete legal resolved outcomes, independently grounded ability and
field/tactic conditioning, and match-level heterogeneity; re-evaluate P10 and
P90 without leakage or post-hoc holdout fitting. Promotion to a new gameplay
version requires engine/scorer compatibility, deterministic replay, game
command masks, cross-version save handling, independent cricket rules review,
statistical cohort approval and authorised browser/human testing.
