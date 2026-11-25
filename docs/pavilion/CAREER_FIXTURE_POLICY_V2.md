# Career fixture policy V2: match-day XI and fixture bowling (design and migration)

Status: owner approved, 25 November 2026 (save format: "option 1, automatic at rollover"; all-rounders: "prefer all-rounders when topping up bowling"). Built on branch `pavilion/career-selection-v2`.

## Problem (reproduced on `main` at `c5d91c6`)

1. **Match-day XI.** `selectBaselineXI` (V1, `LC_SEASON_XI_BASELINE_V1`) ranked players by batting + bowling + fielding, so anyone who could bowl outranked a better specialist batter, and it batted the side in that order. Every computer side fielded three all-rounders, five or six bowlers and one or two specialist batters, batting 8 to 11. The same selector picks the user's own career XI.
2. **Fixture bowling.** `fixtureAutopilotStep` (V1, `LC_FIXTURE_CAPTAIN_V1`) always chose the bowler with the fewest balls bowled, so overs were shared equally: the best bowler bowled two overs.

## Policy V2

**`LC_SEASON_XI_BASELINE_V2`** (`selectSeasonXIV2`, `packages/simulation/src/fixture-policy-v2.ts`) applies the approved stage A rule (`rankedEleven` in `packages/data/src/eleven.ts`, the rule behind `suggestedEleven`) with condition added:

- unavailable players are left out;
- batting = timing + power + defence + rotation, plus batting readiness on each of those four skills;
- bowling = control + movement + variation, plus bowling readiness on each of those three skills;
- the keeper who bats best; the four best bowling-capable players by bowling; the six best of the rest by batting;
- while the side has fewer than six bowling-capable players, the weakest player who cannot bowl gives way to the remaining bowling-capable player who adds most in all (see "All-rounders" below); never fewer than five;
- batting order by batting, best first; ties on lower fatigue, then playerId by code point. The keeper captains.

**`LC_FIXTURE_CAPTAIN_V2`** (`fixtureAutopilotStepV2`) is the V1 autopilot except when choosing a bowler:

- eligible as in V1 (in the XI with a bowling style, not the keeper, not the previous over's bowler, quota left);
- preference: control + movement + variation, less fatigue / 90 (the tactical captain's fatigue weight), less 30 for a bowler with one over left before the death overs (the tactical captain's reserve rule), ties on playerId;
- the first preference after whom the innings can still be bowled is chosen. The feasibility check, `canCompleteFixtureBowling`, is a copy of `canCompleteBowling` in `packages/ai/src/bowling-plan.ts`, because `scripts/check-boundaries.mjs` does not let simulation import `@lcxxvi/ai`; a unit test checks that the two agree on every small case.

No new randomness: both use only skills, roles, condition and the public innings state. The V1 functions are unchanged and still define every frozen fixture, quick-match corpus and checksum.

### All-rounders (changes the suggested eleven everywhere)

When topping up the bowling, the shared rule now chooses the bowling-capable player who adds most in batting and bowling together, not the best pure bowler. Batting is a sum of four skills and bowling of three, so each is taken per skill: batting / 4 + bowling / 3, computed in whole numbers as **3 x batting + 4 x bowling** (`ELEVEN_ALL_ROUND_BATTING_WEIGHT`, `ELEVEN_ALL_ROUND_BOWLING_WEIGHT`). Only a player who cannot bowl ever gives way, so an all-rounder already chosen is always kept ahead of a weaker specialist. Ties keep the existing tie-break.

This also changes the built-in suggested eleven for quick matches, tournaments, tours and auctions. Tests that depend on a particular eleven (`tests/unit/super-over-stage14.test.ts`, `tests/ui/super-over-stage14.spec.ts`, `tests/unit/world-edit-match.test.ts`) already field their own elevens and were not changed. The committed T20 expectation table (`LC_T20_EXPECTATION_TABLE_V3`, `packages/projections/src/t20-expectation-table.ts`) was built with the old suggested eleven: `node --import tsx scripts/pavilion-t20-expectation.ts --check` now reports it differs from a fresh run (that check is not part of CI). It was not regenerated; see "Open".

## Where the policy is chosen: the season state version

The season state's version is the policy. Nothing else is persisted and nothing is inferred.

| Season state | Fixture policy | Accepted by |
| --- | --- | --- |
| `LC_T20_SEASON_STATE_V1`, `LC_T20_LIFECYCLE_SEASON_STATE_V1` | V1 | single-season saves, world states V1 to V5 (unchanged) |
| `LC_T20_SEASON_STATE_V2`, `LC_T20_LIFECYCLE_SEASON_STATE_V2` | V2 | world state V6 only |

The V2 season states have exactly the V1 shape; only the version string differs (so the season hash differs). Off-screen fixtures in a V2 season are recorded as `LC_T20_OFFSCREEN_FIXTURE_V2` (frozen world) or `LC_T20_ROSTER_OFFSCREEN_FIXTURE_V3` (roster) outcomes, carrying `selectionPolicyId: LC_SEASON_XI_BASELINE_V2` and `captainPolicyId: LC_FIXTURE_CAPTAIN_V2`. The season match completion they produce (`LC_T20_SEASON_MATCH_COMPLETION_V1`) is unchanged in form.

In `apps/web/src/career/service.ts`, `applyOffscreenCompletion`, `matchDayTeams` and the pre-match briefing choose V1 or V2 with `usesFixturePolicyV2(season)`.

## World state V6 and exports

- **`LC_PERSISTENT_WORLD_STATE_V6`**: world state V5's shape, hashing and by-reference storage of finished seasons; its current season must be a season state V2. Save schemas `LC_PERSISTENT_WORLD_SAVE_V6` and `LC_PERSISTENT_WORLD_SAVE_V6_PRESENTATION` (repository tier 6).
- **Export V7** (`LC_PERSISTENT_WORLD_PORTABLE_V7_WORLD_V6`): the V6 export layout with a V6 save schema and the full V6 state in `game.json`. The V7 reader accepts only world state V6; the V6 reader refuses V7.
- No existing schema was widened: the generated JSON Schemas for V1 to V5 are byte-for-byte unchanged (17 new schemas, none modified).

## Migration: what happens to each save

- **New careers** start on world state V6 with a lifecycle season state V2: policy V2 from the first fixture. A finished single-season career copied into a new multi-season world also becomes V6.
- **A world state V5 career** loads, saves and plays exactly as before for the rest of its current season, under policy V1. When it starts its next season (season rollover), it becomes world state V6: the closed season is sealed into its `COMPLETED_SEASON_RECORD_V1` exactly as V5 would seal it, and the new season is a season state V2. Nothing earlier is rewritten, and every finished match still replays from its stored events.
- **World states V2 to V4** are unchanged and stay on policy V1, also after rollover. A V3 or V4 career can be copied forward to V5 from the career screen as before; it then moves to V6 at its next rollover.
- **Single-season saves** (`LC_SEASON_SAVE_V1`) stay V1.

**No rollback.** An older build cannot open a world state V6 save or read a V7 export. Because a V5 career becomes V6 at its next rollover, an older build can no longer open that career after the rollover. Export a backup before rolling over if an older build must still open it.

## Evidence (local, Linux container)

Round 1 of a frozen-world season, 4 fixtures, 8 sides, same seeds (script kept outside the repository):

| | V1 | V2 |
| --- | --- | --- |
| Specialist batters per side | 1 or 2, batting 8 to 11 | 4, batting 1 to 4 |
| All-rounders and bowlers | 3 all-rounders, 5 or 6 bowlers | 1 to 3 all-rounders, 3 to 5 bowlers (6 bowling-capable) |
| Bowlers used per innings | 8 or 9 | 5 or 6 |
| Overs for the best three bowlers | 2 or 3 each | 4 each |

100-seed corpus with V2 elevens: the V2 step gave the four best bowlers full quotas in 111 of 111 completed 20-over innings, and in 106 of 106 with exactly five bowling-capable players, with no innings stranded. The V1 step on the same elevens did so in 0 of 111.

## Tests

- `tests/unit/fixture-policy-v2.test.ts`: V2 XI shape on every side; equal to `suggestedEleven` with neutral condition; availability, readiness and tie-breaks; V2 bowling quotas and no stranding with six and five bowlers; feasibility agrees with `@lcxxvi/ai`; V2 step equals V1 except the bowler.
- `tests/unit/career-fixture-policy-v2-rollover.test.ts`: a V5 career is reloaded part-way through its season and finishes it with fixtures identical to the V1 functions' output; at rollover it becomes V6 with a lifecycle season state V2 and its finished season unchanged; the new season's fixtures and match-day XI are the V2 functions' output; V1 and V2 fixtures replay from their archives; V6 save, reload, stored-by-reference checkpoint and V7 export round trip; V6 refuses a V1 season and V5 a V2 season; new careers start on V6; V4 stays V1.
- `tests/unit/suggested-eleven.test.ts`: the all-rounder top-up rule.

## Open

- **Expectation and win-chance tables.** The suggested-eleven change moves the in-model expected first-innings total from 103.8 to 106.9 runs (over 0, 0 to 1 down); across the 41 cells with at least 20 innings the mean shift is 1.9 runs and the largest 5.2. The table now describes a slightly different eleven from the one quick matches field. Rebuilding it should be a new version (`LC_T20_EXPECTATION_TABLE_V4`) with the win-chance evaluation re-run; that is for the owner to decide.
