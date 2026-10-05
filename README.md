# Lord Cricket XXVI | Pass 12B / M6B squad condition, availability and career-day state

Pass 12B adds the deterministic player-condition layer needed by the management season without changing any accepted match engine. The Pass 12A 14-round / 56-fixture schedule remains the authoritative season graph.

**Model status remains SYNTHETIC_ALPHA.** T20, ODI and five-day red-ball exhibition play are unchanged. Limited-overs rain/DLS, tactical opponent AI, injuries, contracts, transfers and empirical calibration remain outside this pass.

## Pass 12B deliverable

`LC_T20_CAREER_DAY_STATE_V1` binds a career to the frozen world, the exact Pass 12A schedule hash and a versioned availability pack. It tracks all 160 fictional players with:

- fatigue from 0 to 10,000 basis points;
- last career-day update date;
- manual availability, independently projected from fatigue;
- an exactly-once ledger of applied match-condition completions.

`LC_T20_CAREER_CONDITION_V1` pins the V0.1 between-match recovery policy. A normal rest day removes 2,000 fatigue basis points, clamped at zero. The future practice recovery constant of 1,400 is recorded but training choices and readiness effects are deferred to Pass 12C.

Career dates advance with pure Gregorian arithmetic and never depend on the system clock, timezone or opening the application. The default frozen availability pack contains no forced absences; the strict pack format supports pre-declared manual unavailable date ranges and random injuries remain disabled.

A match-condition delta is accepted only when it references a match in the exact bound season schedule, uses the fixture's date and contains players from the two scheduled squads. Repeating the identical match completion is idempotent. Conflicting completion keys, duplicate match IDs and unscheduled condition updates are rejected.

## Run and verify

With Node 22.12 or later:

```sh
npm ci
npm run verify:12b:core
```

Focused management gates:

```sh
npm run season:fixtures
npm run season:rules
npm run career:fixtures
npm run career:rules
```

The frozen Pass 12B career audit verifies the actual 8×20 world rosters, a scheduled match-condition application, duplicate idempotency, daily recovery and manual unavailability against pinned state hashes.

## Architecture boundary

- `packages/contracts/src/career.ts`: strict career, availability, player-condition and match-delta contracts.
- `packages/data/src/career-condition.ts`: frozen policy, default availability pack and 8×20 squad map.
- `packages/simulation/src/career-condition.ts`: pure career-day reducer, exactly-once match-condition boundary and squad-condition projection.
- `tests/fixtures/career`: frozen availability, match delta and state-hash goldens.
- `scripts/audit-career-condition.ts`: machine-readable Pass 12B audit.
- `docs/decisions/022-pass12b-career-condition-state.md`: architectural rationale and boundary.

Pass 12B deliberately does **not** implement training choices/readiness, league table/NRR, AI round execution, season statistics, career IndexedDB persistence or management UI.

The next bounded stage is **Pass 12C: Training and Recovery Directives**.
