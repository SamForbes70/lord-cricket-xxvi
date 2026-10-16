# Lord Cricket XXVI | Pass 14 M7B verification

Baseline: `f8d77815065c9e6f4306de3d772e094af17e7550` (Pass 13 M7A).

## Implementation

- Optional interactive T20 tactical captain selector. The existing React UI requests `AI_STEP`; the single worker derives an AI decision from accepted session/observations and issues an engine `COMMAND` with actor `AI:<teamId>`. Only the selected team can be controlled. All generated commands are saved atomically by the inherited M4 transaction path; the player owns delivery advancement. Career launches carry optional `managedTeamId` to select the *other* team. Existing saved launches remain valid.
- New public-only `proposeOpponentT20Command()` respects phase, quota, previous-over prohibition, fatigue and legal actor ownership. Session/replay command stream stays authoritative. No independent ball simulator.
- Offline real-reference pipeline: `scripts/m7b-reference.py`, Cricsheet JSON ZIP input only, match-level chronological date holdout, exclusions for rain-shortened or no-result T20, and separated first-innings cohorts. Uses source ZIP SHA256 and records attribution/license. Smoke-tested solely on constructed fixture data, NOT on real Cricsheet data; external network DNS unavailable.
- Synthetic paired-policy performance/score diagnostic with 16 independent matched setup seeds. Model parameters, probability, scoring and generator byte-identical to M7A. No model version change.

## Results

- Build, typecheck, lint, schema drift, deterministic vector, probability vector, generator vector: **PASS**.
- Unit suite: **510/510 PASS, 26 files**, split into three independent resource-controlled shards (481 normal tests including the new controller test, 10 season persistence, 19 red-ball). A combined pass without isolating the expensive season suite exceeded time limit; that incomplete run is NOT a PASS.
- Browser M6G: `ERR_BLOCKED_BY_ADMINISTRATOR` at `http://127.0.0.1:4173/`, before any app code. **BLOCKED**.
- Browser M7B: same at `http://127.0.0.1:4173/#exhibition`. **BLOCKED**, despite passing source build and Node tests.
- Cricsheet external data download: DNS/network denied in this runtime, **NOT ACQUIRED**. Importer tested on constructed test data, not empirically validated.
- Model quality: existing `SYNTHETIC_ALPHA` retained. **NOT EMPIRICALLY CALIBRATED**.
- Formal M3 human acceptance and reference laptop browser performance: **NOT RUN**.

## Paired synthetic outcomes (16 fixed initial seeds)

- Fixture policy mean 86.78125 runs/innings, 6.875 wickets/innings.
- Tactical policy mean 88.59375 runs/innings, 6.75 wickets/innings.
- Mean paired total-runs delta +3.625 per match. Descriptive only; changing command histories can change draw addresses, so identical initial seed is NOT identical ball-level counterfactuals.
- Node match-runtime p95: 608 ms fixture baseline, 550 ms tactical. CPU: AMD EPYC 9V74; not reference hardware/browser verification.

## Important scope and safety limits

- No scoring, RNG, T20, ODI, red-ball, probability coefficients or accepted season fixture semantics changed.
- Optional AI is rule-based tactical delegation, not trained/empirically validated intelligence.
- Fixture autopilot is unchanged, not renamed tactical AI.
- No independent DLS provider; limited-overs rain remains disabled.
- New UI and IndexedDB path need real browser verification before release.
- CRICSHEET source: https://cricsheet.org/ and https://cricsheet.org/licensing/ (ODC-By 1.0, attribution required). No original dataset packaged.

## Next

M7C: ingest an approved dated Cricsheet reference; with >=200 held-out T20 matches, measure discrepancy and estimate confidence intervals by matched cohorts. Version any fitted model. Close M6/M7 browser and M3 human gates. See `docs/NEXT_PASS.md`.
