# Pass 17 / M7E: genuine uploaded Cricsheet holdout results

## Status

**OFFLINE REAL-DATA EVALUATION COMPLETE; GAMEPLAY MODEL NOT APPROVED.**
This pass uses a user-uploaded Cricsheet-formatted ZIP, rather than a host-side
network download. Full ZIP CRC, archive bounds, README and `LICENSE.txt` checks
passed. The embedded README declares the Cricsheet URL. Network retrieval,
origin authenticity and any legal/independent cricket review are **not** attested
by that check. Redistributed derived evidence retains ODC-By attribution.

## Provenance and cohort

- Declared Cricsheet source: https://cricsheet.org/downloads/t20s_json.zip
- Licence notice: Open Data Commons Attribution, ODC-By 1.0; https://cricsheet.org/licensing/
- Uploaded ZIP SHA-256: `d89ef1b3df83f520bf6bbfe2a439e3246cc6e6bc82c33ac9e`
- Compressed ZIP 23,063,106 bytes; 5,810 match JSON members; embedded README and licence.
- Selected: **male, uninterrupted 20-over T20, exactly two innings, complete first
  innings or all out**; matches with disqualified metadata or invalid innings excluded.
- Exclusions: 2,531 outside selected cohort, 22 invalid records, **3,257 eligible**.
- Training: **2,605** eligible first innings, 2005-02-17 to 2025-08-24.
- Holdout: **652** first innings, 2025-08-30 to 2026-10-14.
- Split chronological by whole match, no matching dates or match IDs.
- This is a mixed T20 competition cohort: **not T20 internationals only** and
  not independently matched to the eight fictional teams or their ratings.
- Among holdout, approximately **82.4%** of first innings use all 120 legal balls;
  all-out innings shorter than this remain included.

## Comparison (200 frozen synthetic matches vs 652 holdout real matches)

| First-innings measure | Frozen game | Cricsheet holdout | Proposed target |
|---|---:|---:|---|
| Mean runs | 88.13 | 150.55 | FAIL (within 5%) |
| Mean wickets | 7.52 | 7.24 | PASS (within 0.5) |
| Dot attempt fraction | 63.94% | 39.32% | FAIL (within 2 pp) |
| Boundary attempt fraction | 8.55% | 14.02% | FAIL (within 2 pp) |
| P10 score | 67 | 83 | FAIL (within 10%) |
| Median score | 88 | 151 | FAIL (within 10%) |
| P90 score | 108 | 212 | FAIL (within 10%) |
| Powerplay runs/over | 4.15 | 7.35 | Informational |
| Middle runs/over | 4.33 | 7.18 | Informational |
| Death runs/over | 5.66 | 9.10 | Informational |

Bootstrap 95% interval for game minus real mean runs: **-66.57 to -57.87**,
resampling matches, not deliveries; synthetic 200, holdout 652, fixed bootstrap seed.
These intervals do NOT adjust for cohort and skill composition differences.

## Fitted versioned offline research candidate

- Model ID `LC_T20_PHASE_MARGINAL_RESEARCH_V1`, candidate SHA-256 in candidate JSON.
- Fit using **training matches only**. The holdout is used solely for evaluation.
- Separate Jeffreys-smoothed dot/boundary/wicket attempt rates for three innings phases.
- Held-out NLL per attempt (phase candidate minus pooled training baseline):
  - Dot **-0.007340**; 95% CI [-0.008536, -0.006202]
  - Boundary **-0.002235**; 95% CI [-0.002738, -0.001743]
  - Wicket **-0.003236**; 95% CI [-0.003840, -0.002684]
- All are directionally better for their respective **marginal** prediction task;
  they do not establish actual match-engine skill, coherence or calibration.
- Outcomes overlap: the three marginals are **not** an executable joint
  conditional delivery distribution. There is no player/ground strength,
  field placement, tactical intent, extra-type, legal-mask or innings-state model.
- `sourceApproved=false`, `gameplayIntegrationPermitted=false`.
- Existing game model remains `synthetic-alpha-01` / `SYNTHETIC_ALPHA`.

## Why not promote the model

The baseline misses major batting/runs statistics despite near-reference wickets.
A direct global runs adjustment would not fix realistic balls, innings tails,
player skills, conditional wickets and extras. Before enabling gameplay, estimate
and test a **normalised joint conditional outcome model**, split by match and time,
with separate competition/strength stratification, legality and dismissal rules,
paired tactical effects, independently reviewed reference matches, 10,000-game
release diagnostics, new model ID/hash and dual-version replay/save loading.

No mutable cricket probability source, scoring semantics, RNG, rule contract,
replay vector or persistence representation was modified in this pass.

## Reproducing

On Node 22+ with dependencies installed and a local Cricsheet ZIP:

```bash
npm ci
bash scripts/m7e-run-upload.sh /absolute/path/to/t20s_json.zip
python3 -m unittest discover -s tests -p 'test_m7*.py' -v
```

The bulk reference input is not vendored in the source package. The M7E evidence
package includes the extracted research cohort, candidate/evaluation, ZIP hash,
licence notice and aggregate comparison. The original ZIP is supplied by the user.
