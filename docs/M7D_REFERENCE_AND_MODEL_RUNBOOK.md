# M7D empirical T20 reference acquisition and offline research-model fitting

## Status and boundary

The **actual Cricsheet ZIP was NOT downloaded in the restricted execution host**.
The host has `NETWORK=caas_packages_only`; direct HTTPS requests fail DNS resolution.
This is a reproducible pipeline, **not a completed empirical calibration**. The
existing `synthetic-alpha-01` model, match engine, deterministic event hashes, and
save compatibility are unchanged. Browser navigation also remains administrator-blocked.

## Authoritative input and attribution

- Cricsheet: <https://cricsheet.org/>
- JSON men's + women's T20 internationals ZIP: <https://cricsheet.org/downloads/t20s_json.zip>
- Licensing: <https://cricsheet.org/licensing/> (ODC-By 1.0)
- Retain `LICENSE.txt` and attribution; review licence terms before public redistribution
- No third-party ball-by-ball source data is committed into this repository

Cricsheet provides *T20 internationals*, not every domestic T20 match, at the linked
archive URL. The M7C parser selects male matches with two standard 20-over innings
and excludes incomplete first innings except all-out innings. This cohort is **not**
a representative sample of all domestic and international T20 cricket, nor is it
matched to the fictional skill distribution in Lord Cricket XXVI.

## On a machine with authorised HTTPS and Node 22+

Run from the source repository root. These commands do not alter the game model.
After `npm ci`, `bash scripts/m7d-run.sh` executes the whole acquisition/analysis
chain. Individual equivalent commands follow:

```bash
npm ci
python3 scripts/m7d-acquire.py --out reference/t20s_json.zip --manifest reference/acquisition.json
python3 scripts/m7c-calibration.py extract --input reference/t20s_json.zip --out reference/m7c-reference.json --min-holdout 200
node --import tsx scripts/m7c-synthetic.ts --matches=200 > reference/m7c-synthetic-200.json
python3 scripts/m7c-calibration.py compare --reference reference/m7c-reference.json --synthetic reference/m7c-synthetic-200.json --out reference/m7c-comparison.json --min-holdout 200
python3 scripts/m7d-fit-candidate.py --reference reference/m7c-reference.json --acquisition-manifest reference/acquisition.json --candidate reference/m7d-candidate.json --evaluation reference/m7d-evaluation.json
python3 -m unittest discover -s tests -p 'test_m7?_*.py' -v
```

The source archive is staged into `.partial` and atomically renamed only after the
ZIP is structurally valid, contains 400 or more JSON files, and includes LICENSE.txt.
The output acquisition manifest includes the archived SHA-256 and licence SHA-256.
The research-model CLI independently requires matching reference/acquisition hashes,
licence presence and a minimum 200 training / 200 holdout matches. It rejects date
or match-identity leakage, duplicate IDs and aggregate-to-phase inconsistencies.

Outputs:

1. `acquisition.json`: archive provenance, SHA-256, source URL, licence notice.
2. `m7c-reference.json`: validated match-level cohorts with chronological split.
3. `m7c-comparison.json`: frozen `synthetic-alpha-01` vs held-out reference.
4. `m7d-candidate.json`: versioned offline T20 phase *marginal* model fitted only to training observations.
5. `m7d-evaluation.json`: held-out log-loss differences versus pooled training
   baseline, and deterministic match-bootstrap confidence intervals.

**The M7D model is not a ball-by-ball generator.** Dot, boundary and wicket
probabilities overlap, so the fitted marginal probabilities cannot be substituted
for the joint delivery sampler. It cannot be used in gameplay or save formats.
An optional future gameplay model needs separate identified features, legal-outcome
masks, held-out distributions, independent cricket review and model/rule IDs.

## Browser acceptance on an authorised machine

```bash
npx playwright install chromium firefox
npx playwright test --config playwright.m6g.config.ts
npx playwright test --config playwright.m7b.config.ts
```

`playwright.m7d.system.config.ts` is a host **diagnostic only**, using the
installed `/usr/bin/chromium`, and is not a substitute for cross-browser
acceptance. This execution host returned `ERR_BLOCKED_BY_ADMINISTRATOR` on
all three M6G/M7B cases before application code loaded.

## Acceptance logic

An adequate training/holdout split is necessary but not sufficient for approval.
The current research candidate explicitly stores `gameplayIntegrationPermitted=false`
and `sourceApproved=false`. Positive holdout log-loss differences mean worse
predictions than the pooled comparator. A formal new probabilistic gameplay pack
requires an explicit schema/version decision, dual-version save compatibility,
replay golden vectors and independent phase/skill/tactics calibration before
promotion from `SYNTHETIC_ALPHA`.
