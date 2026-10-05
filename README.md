# Lord Cricket XXVI | Pass 12A / M6A competition contracts and fixture scheduler

Pass 12A begins the management layer without changing any accepted match engine. The repository now contains a strict T20 league competition contract and deterministic season scheduler for the V0.1 eight-team fictional competition.

**Model status remains SYNTHETIC_ALPHA.** T20, ODI and five-day red-ball exhibition play remain as delivered in Pass 11. Limited-overs rain/DLS, tactical opponent AI, injuries, contracts, transfers and empirical calibration remain outside this pass.

## Pass 12A deliverable

`LC_T20_LEAGUE_01` defines the bounded V0.1 competition:

- eight fictional teams;
- 14 rounds;
- four fixtures per round;
- 56 total fixtures;
- double round robin;
- circle scheduling;
- reverse venues in rounds 8-14;
- default round spacing of three days;
- no playoffs;
- points policy of 2 win, 1 tie/no-result, 0 loss;
- future table order pinned as points, wins, NRR, head-to-head points, stable team ID;
- rain-adjusted NRR disabled.

`LC_T20_SEASON_SCHEDULE_V1` accepts the frozen world identity, a season identity/seed, start date, eight team IDs and eight home grounds. It produces a canonical 56-fixture schedule with stable fixture IDs, match IDs, match-day dates, home grounds, independent fixture seeds and a SHA-256 schedule identity.

The scheduler contains no ambient clock. Calendar advancement uses deterministic Gregorian arithmetic. Caller ordering of team IDs cannot change the schedule.

## Run and verify

With Node 22.12 or later:

```sh
npm ci
npm run verify:12a:core
npm run smoke
```

Generate the frozen acceptance schedule directly:

```sh
npm run batch -- schedule-t20-season tests/fixtures/season/schedule-request.json
```

Focused Pass 12A gates:

```sh
npm run season:fixtures
npm run season:rules
```

The pinned acceptance schedule is 14 rounds / 56 fixtures, with every ordered team pair occurring once, each team playing once per round and finishing with seven home and seven away fixtures.

## Architecture boundary

- `packages/contracts/src/competition.ts`: strict competition, schedule request, round and fixture contracts.
- `packages/data/src/competition.ts`: frozen `LC_T20_LEAGUE_01` manifest.
- `packages/simulation/src/season-scheduler.ts`: pure circle scheduler and schedule validator.
- `tests/fixtures/season`: request and frozen golden identity.
- `scripts/audit-season-schedule.ts`: machine-readable Pass 12A fixture audit.

Pass 12A deliberately does **not** implement a playable management season yet. No league table, training, condition, availability, AI fixture execution, match-completion reducer, season persistence or management UI is claimed.

The next bounded stage is **Pass 12B: Squad Condition, Availability and Career-Day State**.
