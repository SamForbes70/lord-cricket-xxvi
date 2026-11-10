# Lord Cricket XXVI | Single-season management alpha

Lord Cricket XXVI provides a one-season management game over deterministic match and career systems.
Start with the [documentation hub](docs/README.md), [engineering guide](docs/ENGINEERING_GUIDE.md) or [AI continuation guide](docs/AI_CONTINUATION.md).
See the [GitHub audit](docs/GITHUB_AUDIT_2026-11-11.md) for open work and [current status](docs/CURRENT_STATUS.md) for acceptance history.

**Model status remains `SYNTHETIC_ALPHA`.** Teams and players are fictional. The career is one fixed T20 season. Limited-overs DLS, transfers, contracts, finances, international management are not enabled. Optional T20 tactical opponent AI is available in the match view. Browser tests cover its controls; empirical tactical quality remains unaccepted.

## Player-facing management loop

The default web route opens the management career. A player can:

- choose one of the eight frozen fictional teams;
- use Home, Career, Squad, Fixtures, Statistics and Settings screens;
- inspect availability, fatigue and temporary readiness;
- set REST, batting, bowling or fielding practice;
- advance to the next managed fixture without silently passing it;
- simulate that fixture through the accepted `LC_T20_MATCH_V1` engine, or launch the existing interactive T20 match UI;
- follow the authoritative Pass 12E table, exact NRR and player statistics;
- persist locally through the existing Pass 12F IndexedDB repository;
- export/import the existing portable `.lcxxvi` season archive;
- finish all 14 rounds / 56 fixtures and create the immutable final season archive.

The fixture autopilot remains the transparent deterministic baseline completion policy. It is not presented as tactical captain AI. In interactive T20 matches, the captain dropdown optionally delegates one team to public-information-only, deterministic AI decisions. The user still advances balls; AI commands are persisted in the original match event/command stream.

## Architecture

There is one cricket truth. React is a projection/controller only. `CareerApplicationService` orchestrates the accepted schedule, career condition/training, shared T20 fixture execution, season projections and Pass 12F persistence. Scoring, deterministic random addressing, probability models, format engines and save dispatch are protected compatibility boundaries. The repository has evolved since Pass 12F; use Git history and revision-specific verification for preservation claims.

Scheduled interactive matches use the existing T20 controller with the immutable fixture seed, ground and XI snapshot. A terminal interactive result is returned through the same canonical `USER_MATCH` season-completion boundary used by the management service.

## Verification

Useful gates:

```sh
npm run schemas:check
npm run build
npm run typecheck
npm run lint
npm test
npm run management:acceptance
npm run test:m6g
```

The deterministic headless M6G acceptance completes exactly 56 fixtures with 14 `USER_MATCH` boundaries and 42 off-screen fixtures, reconciles all condition applications and projections, seals the final state/archive, and round-trips the portable season.

The earlier browser-policy blocker is superseded by recorded Linux and hosted Windows Chromium/Firefox results.
These cover match UI, layouts, career reload and archive import into a fresh browser context.
Hosted Windows results do not establish automation on the owner’s PC.

Sam reports a successful Windows Edge match, layout check and repeat replay verification.
[The human record](docs/M3_HUMAN_ACCEPTANCE.md) identifies the remaining unrecorded checklist details.

See `docs/CAPABILITY_MATRIX.md`, `docs/MANAGEMENT_UI.md`, `docs/verification-pass12gr/` and `docs/NEXT_PASS.md`.

## Historical research records

The sections below describe individual passes. Later acceptance evidence is summarised in [current status](docs/CURRENT_STATUS.md).

## M7B bounded development

A public-data reference ingestion script is included at `scripts/m7b-reference.py`. Run against a locally downloaded Cricsheet JSON ZIP (not bundled):

```sh
python3 scripts/m7b-reference.py --input /path/to/ipl_json.zip --out reference.json
node --import tsx scripts/audit-m7b-quality.ts --matches=16 > paired-quality.json
```

Cricsheet JSON data licensing: https://cricsheet.org/licensing/ (Open Data Commons Attribution). Preserve attribution and dataset notices if publishing/reference redistributing. At M7B, no real data had been fitted and browser gates were blocked. Later passes add offline research only.

## Pass 15 / M7C offline T20 calibration gate

Run `node --import tsx scripts/m7c-synthetic.ts --matches=96 > m7c-synthetic.json`
to produce an immutable-model first-innings/phase diagnostic; use
`python3 scripts/m7c-calibration.py extract|compare` with a separately
acquired reference archive on an authorised host. Details, limitations and
mandatory holdout checks are in `docs/M7C_CALIBRATION_RUNBOOK.md` and
`docs/decisions/ADR-027-M7C-CALIBRATION-GATE.md`. M7C has not fitted or enabled
new coefficients, and the game remains `SYNTHETIC_ALPHA`.

## Pass 18 / M7F joint empirical envelope (offline research only)

Cricsheet training deliveries are fitted into an immutable integer-normalised
joint category model (`LC_T20_JOINT_ENVELOPE_RESEARCH_V1`) conditioned on T20
phase and wickets lost. Python fitting and TypeScript research sampling agree
on deterministic vectors; the pack is held separately from the accepted game
model. M7F reference: Cricsheet, https://cricsheet.org/ , ODC-By 1.0,
https://cricsheet.org/licensing/ . The dataset was user uploaded, not
independently authenticated or redistributed in this source package.

To reproduce offline, use `bash scripts/m7f-run.sh /path/to/t20s_json.zip`.
The derived candidate and deterministic vectors are in `tests/fixtures/`,
with full limitations in `docs/decisions/ADR-028-M7F-JOINT-RESEARCH.md`.
This research sampler does **not** produce the scorer's full delivery format,
and no model has been promoted to gameplay or to `EMPIRICALLY_VALIDATED`.
Historical saves continue to use `synthetic-alpha-01` unchanged.

## Pass 19 / M7G: empirical joint scoring research (not gameplay)

The offline-only candidate `LC_T20_SCORING_COMPONENTS_RESEARCH_V1` is documented in [`docs/M7G_RESEARCH_AND_PROMOTION_GATES.md`](docs/M7G_RESEARCH_AND_PROMOTION_GATES.md). It models observed T20 first-innings scoring components and five train-inferred scoring regimes, using a real Cricsheet match-level train/holdout separation. The frozen `synthetic-alpha-01` production model, save versions, random service, scoring kernel, ODI and red-ball remain unchanged. This is **not** an empirically calibrated gameplay update.

To reproduce after obtaining the Cricsheet ZIP from its authorised source, run `bash scripts/m7g-run.sh /absolute/path/to/t20s_json.zip`. The original downloaded/uploaded archive is not included in the source package. Cricsheet attribution and ODC-By licence information: https://cricsheet.org/ and https://cricsheet.org/licensing/.

## Pass 20 / M7H: empirical two-innings research (NOT playable model)

M7H adds a **research-only** target-aware second-innings T20 scoring model and player-history predictive evaluation. Rebuild them from the user-supplied Cricsheet JSON archive (ODC-By 1.0, attribution: https://cricsheet.org/, licence details: https://cricsheet.org/licensing/):

```sh
bash scripts/m7h-run.sh /absolute/path/to/t20s_json.zip
```

The offline command regenerates M7G and M7H in `reference/m7g/` and `reference/m7h/`, audits Cricsheet player registry/exposure and runs research-only Python/TypeScript tests. It does **not** change the executable cricket probability model, player ratings, scoring engine or saves. The original ZIP is not included in source/release packages.

M7H fits a 5-regime second-innings model using training-match data, wickets lost, phase and pre-delivery required scoring rate. It separately simulates 400 two-innings matches with a target, stops on a successful chase and checks scorer-compatible categories in TypeScript. It reports excluded unusual events and unseen holdout categories rather than mapping them to invented cricket outcomes. The already-reviewed Cricsheet holdout is **development validation, not a pristine final test**. Player-history binary predictors use a fixed 300-attempt prior and Cricsheet stable registry IDs. Even when predictive log-loss improves, those marginals are **not** empirically identified 0–100 skills or captain tactical effects.

The existing playable game **remains SYNTHETIC_ALPHA**. The remaining research gates include full delivery support, player/fielding/tactic identification, score tails and untouched final validation.
Later browser and human evidence is summarised in [current status](docs/CURRENT_STATUS.md). See `docs/NEXT_PASS.md` and `PASS_20_M7H_REPORT.md`.

### Pass 21 / M7I research audit (not gameplay)

M7I adds source-faithful rare-delivery exception registration, target-conditioned chase lower-tail diagnostics, and predictive player-history generalisation tests. None changes the accepted scorer, match generator or saved careers. To reproduce from the separately supplied Cricsheet `t20s_json.zip` archive:

```bash
bash scripts/m7i-run.sh /absolute/path/to/t20s_json.zip
```

It rebuilds M7H research inputs if missing, validates the source archive hash, and writes `reference/m7i/*.json`. Licensed archive remains outside the source package. See ADR-031 and `docs/NEXT_PASS.md`. Gameplay promotion remains open. See [current status](docs/CURRENT_STATUS.md) for later browser acceptance.

## Pass 22 / M7J: versioned rare-event adjudication (research only)

M7J adds `LC_T20_EXCEPTION_ADJUDICATION_RESEARCH_V2` with four additive
strict JSON schemas under research-only package subpaths and a pure administrative-event boundary. Ordinary
balls still use the frozen `scoreDelivery` and `reduceScoringBoundary` functions.
It can represent independently confirmed five-run penalties and dead-ball
batting retirements without adding a legal ball or mis-crediting bowlers.
The existing scorer already supports wide plus hit wicket. The M7I register of
69 source exceptions is routed to explicitly documented adjudication or
conflict queues; **zero are automatically repaired or approved**.

Reproduce the new audit and focused tests:

```sh
npm run m7j:adjudication
npm run m7j:test
```

This is **not** a new selectable gameplay model, a changed live scoring rule,
or 69/69 event acceptance. Source JSON alone does not establish umpire signals,
chronology or attribution of every rare event. The current playable
`synthetic-alpha-01` and historical saves remain unchanged. See
`docs/M7J_RUNBOOK.md` and ADR-032. Cricsheet data: https://cricsheet.org/,
ODC-By 1.0: https://cricsheet.org/licensing/.


## M7 scenario quality harness

Run `npm run m7:scenarios -- --seeds-per-cell=2 --out=scenarios.json` after building.
The developer tool compares existing baseline/tactical policies across all eight teams and grounds.
It preserves accepted event/scorecard hashes and separates first innings from chase endings.
See [SCENARIO_QUALITY_HARNESS.md](docs/SCENARIO_QUALITY_HARNESS.md) for scope, results and limits.
This adds a reproducible quality tool; it does not change the playable scoring model.

## Maintained documentation

See the [documentation index](docs/README.md), [engineering guide](docs/ENGINEERING_GUIDE.md), and [AI-only continuation guide](docs/AI_CONTINUATION.md). Read the [11 November GitHub audit](docs/GITHUB_AUDIT_2026-11-11.md) before relying on older queue snapshots.
