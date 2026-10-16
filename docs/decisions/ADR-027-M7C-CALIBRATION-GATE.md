# ADR-027: M7C external-reference gate without changing the frozen model

Status: ACCEPTED FOR OFFLINE DIAGNOSTICS, NOT APPROVED AS EMPIRICAL CALIBRATION

## Decision

M7C adds an offline Cricsheet T20 reference extractor, an independent engine-sampled
first-innings diagnostic and an explicit holdout comparator. The accepted
`synthetic-alpha-01` model, `LC_T20_MATCH_V1`, random service and scoring rules
remain byte-identical to Pass 14. No production probability coefficients are changed.

Reference data is never fetched from the browser game, baked into production
assets or introduced into authoritative match state. A source ZIP must be
provided separately, with source attribution and SHA-256 recorded. Sample
minimums, match-level chronological split and no same-date overlap are
mandatory, and constructed fixtures cannot satisfy release provenance.

## What the comparison means

The benchmark compares uncensored/fully completed first innings only,
retaining all-out innings while excluding shortened innings, abandoned
matches, DLS-adjusted fixtures and super overs. The limited cohort is male
20-over T20; it is **not** all cricket, and the fictional world is not
population-matched to any identified real league. Reference training matches
are NEVER reused as holdout. A separate sufficiently populated real-cohort
approval is still required. Bootstrap resampling uses matches as units.

Compare mean runs (5%), mean wickets (0.5), dot and boundary fractions
(2 percentage points) and 10/50/90th score percentiles (10%): proposed
tolerances from Technical Design V0.1 §8. Report phase run rates without
asserting externally validated phase-level acceptance bands.

The comparison **cannot** change model status to EMPIRICALLY_VALIDATED. Even
if its descriptive bands pass, calibration additionally requires:

1. verified rights and approved reference-data provenance;
2. a separately *fitted*, immutable and versioned candidate coefficient pack;
3. independent, untouched held-out testing across balanced cohorts;
4. migration/rejection behaviour and updated model hashes for new games;
5. explicit user approval for exposing a fitted model in gameplay.

Prior models and saved games must retain their exact event outcomes.

## Recorded limitations

Source `t20s_json.zip` was not accessible from this sandbox due to DNS
resolution failures. The only input exercised here was a 12-match constructed
fixture archive from M7B. Therefore **no empirical calibration was completed**.
Chromium navigation is blocked by administrator policy; this is an external
acceptance gate and cannot be bypassed.
