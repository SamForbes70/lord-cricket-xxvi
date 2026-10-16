# Lord Cricket XXVI | Pass 12G-R / M6G management game integration

Lord Cricket XXVI now contains the first coherent one-season management application over the accepted deterministic cricket engine and Pass 12A-F season systems.

**Model status remains `SYNTHETIC_ALPHA`.** Teams and players are fictional. The career is one fixed T20 season. Limited-overs DLS, transfers, contracts, finances, international management are not enabled. Optional T20 tactical opponent AI is available in the match view, but remains SYNTHETIC_ALPHA and not browser-accepted.

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

There is one cricket truth. React is a projection/controller only. `CareerApplicationService` orchestrates the accepted schedule, career condition/training, shared T20 fixture execution, season projections and Pass 12F persistence. The existing scoring, deterministic random service, probability model, delivery generator, T20 engine, ODI engine, red-ball engine and season persistence primitives remain byte-identical to the Pass 12F baseline.

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

The current execution host blocks Chromium navigation with `ERR_BLOCKED_BY_ADMINISTRATOR` before Lord Cricket code executes. The inherited Pass 12F IndexedDB browser gate and the new production M6G Playwright suite therefore remain **BLOCKED BY HOST BROWSER POLICY**, not passed. The implementation is complete, but formal M6 acceptance is not claimed while that mandatory browser gate is blocked.

Formal M3 human acceptance of the interactive match UI also remains separate and pending.

See `docs/CAPABILITY_MATRIX.md`, `docs/MANAGEMENT_UI.md`, `docs/verification-pass12gr/` and `docs/NEXT_PASS.md`.

## M7B bounded development

A public-data reference ingestion script is included at `scripts/m7b-reference.py`. Run against a locally downloaded Cricsheet JSON ZIP (not bundled):

```sh
python3 scripts/m7b-reference.py --input /path/to/ipl_json.zip --out reference.json
node --import tsx scripts/audit-m7b-quality.ts --matches=16 > paired-quality.json
```

Cricsheet JSON data licensing: https://cricsheet.org/licensing/ (Open Data Commons Attribution). Preserve attribution and dataset notices if publishing/reference redistributing. The model remains `SYNTHETIC_ALPHA`; no real data were acquired or fitted in this build, and browser gates remain blocked on the current host.

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
