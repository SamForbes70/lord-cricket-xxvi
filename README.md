# Lord Cricket XXVI | Pass 12E / M6E league table, NRR and season statistical projections

Pass 12E turns the deterministic Pass 12D fixture outcomes into an authoritative competition projection. It does not change any cricket match engine.

**Model status remains SYNTHETIC_ALPHA.** The frozen 56-match season result is regression evidence, not evidence of empirical cricket realism.

## Implemented

`LC_T20_SEASON_PROJECTION_V1` consumes `LC_T20_SEASON_MATCH_COMPLETION_V1` records. Pass 12D off-screen outcomes have an adapter today; future user-played T20 matches must feed the same completion boundary.

The table implements the custom `LC_T20_LEAGUE_01` rules:

- win 2 points;
- tie or no-result 1 point each;
- loss 0;
- order by points, wins, exact NRR, head-to-head mini-table points, then ascending stable team ID;
- all-out innings use the allocated 120 balls for NRR;
- successful chases use actual legal balls;
- no-result matches are excluded from NRR.

NRR ranking uses exact integer rational comparison. The rounded `nrrX1000` value is display data only.

Player projections include matches, runs, dismissals, balls faced, fours, sixes, bowling runs, legal balls, wickets and maidens. Batting average, strike rate, bowling average, economy and bowling strike rate are deterministic fixed-point hundredths. Zero denominators are null. Raw runs and wickets leaderboards use stable player-ID tie-breaking.

Exactly-once behaviour is explicit: repeating the same completion is idempotent, a conflicting completion is rejected, and the projection cursor exposes gaps when fixtures arrive out of ordinal order.

## Full 56-fixture projection audit

```sh
npm run projection:fixtures
npm run projection:rules
```

The frozen audit applies all 56 deterministic Pass 12D outcomes and pins final table, player-stat, applied-match and complete-projection hashes.

Compiled batch entry points:

```sh
npm run batch -- new-t20-season-projection <schedule.json>
npm run batch -- apply-t20-offscreen-outcome <schedule.json> <projection.json> <outcome.json>
```

## Verify

With Node 22.12 or later:

```sh
npm ci
npm run verify:12e:core
```

Pass 12E deliberately does **not** implement season IndexedDB persistence/archive, management UI/navigation, user-match season wiring or M7 tactical captain AI.

The next bounded stage is **Pass 12F / M6F: Durable Season State, Recovery and Archive**.
