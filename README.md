# Lord Cricket XXVI | Pass 12C / M6C training and recovery directives

Pass 12C adds deterministic daily training and temporary readiness to the management-season foundation. It builds on the accepted Pass 12A 56-fixture schedule and Pass 12B condition model without changing any accepted cricket match engine.

**Model status remains SYNTHETIC_ALPHA.** T20, ODI and five-day red-ball exhibition play are unchanged. Limited-overs rain/DLS, tactical opponent AI, random injuries, contracts, transfers and empirical calibration remain outside this pass.

## Pass 12C deliverable

The accepted Pass 12B `LC_T20_CAREER_DAY_STATE_V1` remains unchanged. Pass 12C introduces `LC_T20_CAREER_DAY_STATE_V2` and a deterministic V1-to-V2 migration. V2 preserves the existing schedule/world/availability bindings, fatigue state and exactly-once match-completion ledger and adds:

- one daily directive for each of the 160 fictional players;
- batting, bowling and fielding readiness values;
- the pinned `LC_T20_CAREER_TRAINING_V1` policy;
- hash-validated training state and optimistic revision checks.

Supported directives are `REST`, `BATTING_PRACTICE`, `BOWLING_PRACTICE` and `FIELDING_PRACTICE`. Directives persist until changed.

At each explicit career-day tick:

- `REST` recovers 2,000 fatigue basis points;
- any practice directive recovers 1,400 fatigue basis points;
- relevant practice adds +1 temporary readiness in its own area, capped at +3;
- every non-practiced readiness area moves one point toward zero;
- no base player attribute is permanently changed.

Readiness is deliberately separate from form and the frozen player skill data. The signed contract permits -3 to +3; this V0.1 training reducer produces neutral/positive practice readiness and correctly decays any signed value toward zero.

Match fatigue still enters through the exactly-once scheduled-match boundary. Pass 12C provides a V2 path with the same fixture/date/squad protections, and applying match fatigue does not alter readiness.

## Run and verify

With Node 22.12 or later:

```sh
npm ci
npm run verify:12c:core
```

Focused management gates:

```sh
npm run season:fixtures
npm run season:rules
npm run career:fixtures
npm run career:rules
npm run training:fixtures
npm run training:rules
```

The frozen Pass 12C audit proves the rest/practice fatigue trade-off, three independent practice areas, readiness decay and canonical V2 state hashes.

## Architecture boundary

- `packages/contracts/src/career.ts`: V1 career contracts plus additive V2 training/readiness contracts.
- `packages/data/src/career-condition.ts`: frozen condition and training policies.
- `packages/simulation/src/career-condition.ts`: V1 reducer retained plus V2 migration, training directive, day reducer, match-fatigue and squad projection paths.
- `tests/fixtures/training`: frozen Pass 12C state-hash goldens.
- `scripts/audit-career-training.ts`: machine-readable Pass 12C training audit.
- `docs/decisions/023-pass12c-training-readiness.md`: versioning and training semantics.

Pass 12C deliberately does **not** implement league-table/NRR calculation, AI round execution, season statistics, career IndexedDB persistence or management UI.

The next bounded stage is **Pass 12D / M6D: deterministic off-screen fixture execution**.
