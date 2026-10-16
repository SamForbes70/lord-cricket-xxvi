# M7C reproducible calibration runbook

**Model status remains `SYNTHETIC_ALPHA`.** This is a diagnostic comparison,
not a licence to ship empirically tuned model parameters.

## Input acquisition

On an authorised networked workstation download the Cricsheet JSON T20 archive
from <https://cricsheet.org/downloads/t20s_json.zip> and independently verify
its current rights notice <https://cricsheet.org/licensing/> (ODC-By 1.0).
Record access date, file hash, retained attribution, and any redistribution
conditions before use. Do not commit licensed delivery files into game source.

## Commands

```bash
npm ci
npm run schemas:check
node --import tsx scripts/m7c-synthetic.ts --matches=96 > m7c-synthetic.json
python3 scripts/m7c-calibration.py extract --input /path/to/t20s_json.zip --out m7c-reference.json --min-holdout 200
python3 scripts/m7c-calibration.py compare --reference m7c-reference.json --synthetic m7c-synthetic.json --out m7c-comparison.json --min-holdout 200
python3 -m unittest discover -s tests -p 'test_m7c_calibration.py' -v
npx playwright test --config playwright.m6g.config.ts
npx playwright test --config playwright.m7b.config.ts
```

The extraction reports eligible match count, excluded match count, SHA-256,
chronological training/holdout and per-phase first-innings statistics. Review
exclusions. Both training and held-out cohorts must independently meet the
minimum of 200. Same-date observations must never cross the boundary.

The comparison prints descriptive target bands and bootstrap match-level 95%
confidence limits for the mean-run difference. The comparator *always*
rejects automatic model approval, even if aggregate targets are met.

## Guardrails

The constructed archive in `tests/fixtures/m7b-constructed-reference.zip`
contains no real historical match information and is TEST ONLY. It deliberately
fails the 200-match holdout test. Match source identity in input metadata is
not a substitute for acquiring and licensing an actual archive.

The uncalibrated synthetic population in `fictional-eight-01` should not be
called a matched cohort of national or franchise cricket. An apparent
simulation/reference difference may reflect player-skill population,
format, venue, batting plan or selection. Refit coefficient hypotheses only
in a new versioned model candidate outside live gameplay.

Use an authorised host for real browser/IndexedDB testing; do not bypass an
organisation's browser/security restrictions.
