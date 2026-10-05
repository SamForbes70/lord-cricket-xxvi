# Lord Cricket XXVI | Pass 12D / M6D deterministic off-screen fixture execution

Pass 12D connects the management-season foundation to the accepted T20 match engine. Scheduled league fixtures can now be executed headlessly without introducing a second or simplified cricket simulator.

**Model status remains SYNTHETIC_ALPHA.** Tactical opponent AI is not claimed here. The off-screen runner deliberately uses the existing deterministic `LC_FIXTURE_CAPTAIN_V1` baseline to complete matches. M7 remains responsible for deeper tactical captaincy.

## Pass 12D deliverable

`LC_T20_OFFSCREEN_POLICY_V1` pins one execution path:

- match engine: `LC_T20_MATCH_V1`;
- XI selection: `LC_SEASON_XI_BASELINE_V1`;
- captain policy: `LC_FIXTURE_CAPTAIN_V1`;
- condition feedback: `LC_ENGINE_FINAL_FATIGUE_DELTA_V1`.

Every fixture remains bound to the Pass 12A schedule's immutable fixture ID, match ID, match seed, home/away teams, date and home ground. Setup is still validated against the frozen fictional world and pinned rules/model/stage hashes.

The deterministic XI selector:

- excludes manually unavailable players;
- requires an available keeper;
- requires at least five available non-keeper bowling-capable players;
- applies temporary Pass 12C readiness as rating points to its matching batting/bowling/fielding skill group;
- uses lower career fatigue only as a stable tie-break because no calibrated fatigue-to-selection-rating conversion exists yet;
- never permanently alters frozen player attributes.

A completed off-screen fixture returns a hash-validated outcome containing the selected XIs, canonical event-chain manifest, event and command log hashes, complete scorecard and the exactly-once match-condition delta applied to career state.

Round execution sorts fixtures by fixture ID, as required by the V0.1 design. If a managed team is supplied, its fixture is skipped and the other three fixtures complete headlessly, allowing the future career controller to pause before the user's match.

## Full 56-fixture audit

The frozen Pass 12D audit executes all 14 rounds and all 56 scheduled matches through the same T20 engine. The golden audit pins the outcome, scorecard, event-log and command-log corpora plus the final career-state hash.

```sh
npm run offscreen:fixtures
npm run offscreen:rules
```

A compiled batch entry point is also available:

```sh
npm run batch -- simulate-t20-round <schedule.json> <career-state.json> <round-number> [user-team-id]
```

## Verify

With Node 22.12 or later:

```sh
npm ci
npm run verify:12d:core
```

Focused management gates remain available:

```sh
npm run season:fixtures
npm run season:rules
npm run career:fixtures
npm run career:rules
npm run training:fixtures
npm run training:rules
npm run offscreen:fixtures
npm run offscreen:rules
```

## Architecture boundary

- `packages/contracts/src/season-execution.ts`: strict off-screen policy, fixture outcome and round-result contracts.
- `packages/data/src/season-execution.ts`: frozen Pass 12D policy declaration.
- `packages/simulation/src/offscreen-fixture.ts`: deterministic XI selection, match execution, result hashing, user-fixture pause and exactly-once career-condition feedback.
- `scripts/audit-offscreen-fixtures.ts`: full 56-match golden audit.
- `tests/unit/offscreen-fixture.test.ts`: focused off-screen invariants, replay/resimulation, availability and duplicate protection.
- `docs/decisions/024-pass12d-offscreen-fixture-execution.md`: versioning and scope decision.

Pass 12D deliberately does **not** implement league-table/NRR calculation, season statistical projections, career IndexedDB persistence/archive, management UI/navigation or M7 tactical opponent AI.

The next bounded stage is **Pass 12E / M6E: League Table, NRR and Season Statistical Projections**.
