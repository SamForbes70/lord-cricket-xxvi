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
