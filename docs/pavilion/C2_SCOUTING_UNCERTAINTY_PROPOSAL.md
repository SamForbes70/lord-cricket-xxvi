# C2: scouting uncertainty and observable development potential (design proposal)

Status: **proposed**. Documentation only. No code, schema or save format is changed by this page. It needs the owner's approval before any build, because the recommended first slice needs a new world state version.

Directive: Studio Production Directive 02, item C2, "Introduce scouting uncertainty and observable development potential" (`docs/pavilion/DIRECTIVE_02_2026-11-26.md`, on branch `pavilion/directive-02`, pull request #153). It also serves Directive 01 priority 4, "scouting uncertainty, youth development" (`docs/pavilion/DIRECTIVE_01_2026-11-26.md`).

Written against `main` at `4558fdb`. Every claim about current code cites a file. Claims that are judgement, not code, are marked [Inference].

## 1. Summary

- Today the manager sees every player's exact ratings, in every club, at all times. There is no true "potential" value anywhere in the game.
- Recommended first slice: the manager sees **ranges** for players outside their own club. A range narrows as the club spends **two scouting slots**, plays against the player, and as the season goes on. Own players stay exact. A signed player becomes exact on joining.
- Every range **always contains the true rating**. This is guaranteed by how ranges are built, not by tuning, and a test checks it on every change.
- "Potential" is shown as a **development outlook**: the bounds the current development rules allow. It is honest because it is computed from the real rules, not from an invented hidden value.
- The true ratings stay authoritative. Scouting is never an input to any match, development, economy or AI calculation.
- It needs **world state V7**, save schema V7, export V8, and an automatic upgrade at the next season rollover, following the career fixture policy V2 precedent (`docs/pavilion/CAREER_FIXTURE_POLICY_V2.md`).

## 2. What the code does today

### 2.1 Players and ratings

- A player is `PlayerSchema` in `packages/contracts/src/core.ts`: identity, `birthDate`, role, bowling style, and `skills`, a record of 14 integer ratings per format (`FormatSkillsSchema`: defence, timing, power, rotation, vsPace, vsSpin, control, movement, variation, stamina, catching, groundFielding, throwing, keeping).
- There is no potential, ceiling or growth-rate field on a player. A search for "potential" across `packages/*/src` and `apps/web/src` finds nothing.
- Age is derived from `birthDate` and the season's calendar year (`playerAgeInSeason`, used in `packages/simulation/src/player-lifecycle.ts`).
- The "OVR" badge is computed in the browser, not stored: `overallRating` in `apps/web/src/world/player-visuals.ts` takes the best of batting (mean of timing, power, defence, rotation), bowling (mean of control and movement) and keeping.
- The lifecycle and economy use a different summary: `summarizeT20SkillAverages` in `packages/simulation/src/player-lifecycle.ts` (rounded means of the batting, bowling and fielding skills, plus keeping and stamina).

### 2.2 Development (the training programme)

- Permanent skills change **only at season rollover**, in `developPlayerAcrossOffseason` (`packages/simulation/src/player-lifecycle.ts`). Within a season, base skills are constant. Daily training changes only temporary readiness (`PlayerReadinessSchema`, `TrainingDirectiveSchema` in `packages/contracts/src/career.ts`); the squad screen says so (`apps/web/src/career/SquadScreen.tsx`).
- Growth depends on the phase (youth to 21, early development to 25, prime to 30, then decline; `FICTIONAL_PLAYER_LIFECYCLE_MODEL_V1` in `packages/simulation/src/player-lifecycle.ts`), the season's practice days and match load, and seeded rolls. The rules cap gains: youth at most 3 a season, early development at most 2, with soft caps at group averages of 73 to 80. Skills are clamped to 18 to 86.
- Each rollover stores a `PlayerSeasonDevelopmentReport` per player (age before and after, matches, balls, practice days, deltas, phase) in the lifecycle's `transitions` (`packages/contracts/src/player-lifecycle.ts`). The `skillLedger` keeps each player's career-entry and prior-season T20 skills.

### 2.3 The youth "ceiling tier"

- Each academy prospect gets a `fictionalCeilingTier` (`ACADEMY_GRADUATE`, `FIRST_TEAM_PROSPECT`, `HIGH_CEILING_PROSPECT`) at generation (`generateYouthProspect`, `packages/simulation/src/player-lifecycle.ts`).
- The tier only adds 0, 2 or 5 to the prospect's **starting** skills. It is not read again: development ignores it (a search for `fictionalCeilingTier` outside contracts finds only the generator, a comment in `packages/simulation/src/squad-economy.ts` and the academy table in `apps/web/src/career/SquadScreen.tsx`).
- So the label "High ceiling prospect", shown in the academy table, claims a future the model does not deliver. A high-tier prospect starts higher; he does not grow faster or further. This is a truthfulness problem today, independent of C2. See question Q6.

### 2.4 Where ratings are shown

In a career, the manager sees exact ratings of other clubs' players here:

| Place | What it shows | File |
| --- | --- | --- |
| Player page hero | OVR badge and four strengths | `apps/web/src/career/PlayerPage.tsx` |
| Player page "Base skills" | All 14 ratings per format, and change since debut and since last season | `apps/web/src/career/PlayerPage.tsx` |
| Player page identity | Playing style "from T20 ratings", with the numbers behind it | `apps/web/src/career/PlayerPage.tsx`, `packages/projections/src/player-identity-v1.ts` |
| Statistics leaderboards | Links to any player's page | `apps/web/src/career/StatisticsScreen.tsx` |
| Contracts, free agents | "Public T20 skills" columns and asking wage | `apps/web/src/career/ContractsScreen.tsx` |
| Match screen | "New at the crease" and "Into the attack" chips with the ratings behind the style, for both sides | `apps/web/src/match/controller.ts`, `apps/web/src/match/MatchStyleChip.tsx`, `matchIntroduction` in `packages/projections/src/player-identity-v1.ts` |
| Home screen | Board objective from every club's OVR ranking (ordinal only) | `apps/web/src/career/HomeScreen.tsx` |

Own squad and own academy pages also show exact ratings (`apps/web/src/career/SquadScreen.tsx`). Those stay exact.

Open pull requests #152 (player identity V2, selection advice) and #155 (post-match analysis) add more rating-derived text. If they merge first, any rival rating they show must go through the scouting view described in section 4.6.

Outside careers (quick matches, scenarios, tournaments, the auction in `apps/web/src/tournament/auction.ts`, the world editor) ratings are also exact. This proposal leaves them exact (question Q8).

### 2.5 Recruitment and contracts

- The economy is `SquadEconomyStateSchema` in `packages/contracts/src/squad-economy.ts`: contracts, free agents (`FreeAgentRecordSchema`, each holding the full `Player`), club budgets, a negotiation window, a hash-chained ledger, and applied command ids.
- The negotiation window is open only before the first league match. It runs up to three rounds (`MAX_NEGOTIATION_ROUNDS_PER_WINDOW`), each ended by `RESOLVE_NEGOTIATION_ROUND` (`ResolveNegotiationRoundRequestSchema`). The contracts screen allows bids only while `completedMatches.length === 0` (`apps/web/src/career/ContractsScreen.tsx`).
- AI clubs bid in `submitSymmetricalAiClubOffersForRound` (`packages/simulation/src/squad-economy.ts`), valuing players through `buildPublicMarketPlayerView`, which copies the **true** T20 skills.
- **The asking wage reveals the true rating.** `estimatePlayerMarketWageK` (`packages/simulation/src/squad-economy.ts`) is a monotone step function of `publicPlayerRoleRating`, rising 3, 6 or 11 thousand a point above a role rating of 46. Anyone who learns the formula can read a free agent's true role rating from the wage, to the point. See question Q5.
- Where a scout plugs in: before and between negotiation rounds (free agents), during the season (rival squads, for next window and for match preparation), and on the academy screen (own prospects' outlook).

### 2.6 Determinism and randomness

- The random service is stateless: each draw is SHA-256 of an address `{seed, domain, entityId, eventOrdinal, stageName, drawIndex}` (`createRandomService`, `packages/simulation/src/determinism.ts`; `RandomAddressSchema`, `RANDOM_VERSION = "SHA256_COUNTER_V1"`, `packages/contracts/src/determinism.ts`). The contract says "Stateless address service; draw allocation belongs to the caller" and "No global cursor".
- Consequence: a new consumer with its own seed namespace cannot shift any existing draw. There is no shared stream to consume.
- Career systems already use their own namespaces from the world's `baseSeed`: `:youth-s{n}` (domain `WORLD_GENERATION`), `:lifecycle-dev-s{n}` and `:lifecycle-retire-s{n}` (domain `CAREER_TRAINING`), `:econ-ai-s{n}-r{round}` (domain `CAREER_TRAINING`), all in `packages/simulation/src/player-lifecycle.ts` and `packages/simulation/src/squad-economy.ts`. The red-ball forecast uses the `PREDICTION` domain for a display-only forecast (`RED5_WEATHER_FORECAST_DOMAIN`, `packages/simulation/src/red5-weather.ts`).
- The `domain` field is a closed enum of seven values. Adding a value would widen a protected contract.
- `AGENTS.md` forbids changing the random stream, the engines and the probability tables, and requires a new version for any widened persisted format.

### 2.7 Persistence

- The current career format is **world state V6** (`PERSISTENT_WORLD_STATE_V6_VERSION`, `packages/contracts/src/squad-economy.ts`): V5's shape with a season state V2. Save schemas `LC_PERSISTENT_WORLD_SAVE_V6` and `..._V6_PRESENTATION`. Export V7 (`PERSISTENT_WORLD_PORTABLE_V7_ARCHIVE_VERSION`, `packages/contracts/src/portable-v4.ts`).
- Seal and validate live in `packages/persistence/src/persistent-world.ts` (`sealPersistentWorldStateV6`, `validatePersistentWorldStateV6`). The rollover version rule is in `apps/web/src/career/world-state.ts` ("a V5 career becomes V6 when it starts its next season").
- Generated JSON Schemas are in `packages/contracts/schemas/` and checked by `npm run schemas:check` (`scripts/generate-schemas.ts`). Pinned schema counts live in `tests/unit/contracts.test.ts`.
- Precedent tests: `tests/unit/career-fixture-policy-v2-rollover.test.ts`, `tests/unit/world-state-v5.test.ts`.
- Each completed league match is stored with both selected elevens and the scorecard (`T20SeasonMatchCompletionSchema`, `packages/contracts/src/season-projections.ts`). Match exposure can therefore be read from facts already saved.

## 3. Player-facing design

### 3.1 Principles

- One simple idea: **"what your scouts know"**. Each player outside your club has a knowledge level. The higher it is, the narrower his ranges.
- Ranges, not fake numbers. A rival batter shows "Timing 61 to 71", never a guessed single value.
- Few decisions, each meaningful. Two scouting slots, set once and left running. No daily chores [Inference: assignments that persist until changed avoid the tedium of per-day micro-management].
- The truth arrives at defined moments the player can see coming: playing against him, scouting him, signing him.

### 3.2 Knowledge levels

Knowledge is a whole number from 0 to 100 per player, for the managed club only. It shows as a named level. Each T20 skill range has a fixed width per level.

| Level | Knowledge | Skill range width | What the page shows |
| --- | --- | --- | --- |
| Unknown | 0 to 24 | 24 points | OVR range and role only. Skills say "Not scouted". |
| Glimpsed | 25 to 49 | 16 points | OVR and group ranges (batting, bowling, fielding, keeping). |
| Scouted | 50 to 74 | 10 points | All 14 T20 skills as ranges. |
| Well known | 75 to 99 | 6 points | All 14 T20 skills as ranges. |
| Exact | own player | 0 | Exact ratings, as today. |

Widths are proposal numbers, to be tuned after a playtest (question Q9). Ranges are clipped to the model's 18 to 86 skill limits, which never removes the truth.

### 3.3 How knowledge is gained

All gains are fixed amounts. No randomness decides how much a scout learns.

- **Scouting slots.** The club has two slots. Each slot targets one of:
  - one player (any club, or a free agent): plus 25 per tick;
  - one rival club's whole squad: plus 6 per player per tick;
  - the free-agent pool: plus 6 per free agent per tick.
- **Ticks.** One tick at each resolved negotiation round (`RESOLVE_NEGOTIATION_ROUND`) and one at each completed league round. That is up to 17 ticks a season. Assignments stay until changed.
- **Match exposure.** When the managed club plays a rival, each rival in the eleven gains: plus 15 if he faced at least 6 balls or bowled at least one over, otherwise plus 5. This is read from the stored completion's elevens and scorecard.
- **Signing or promotion.** A player who joins the club (signing, youth graduation, promotion) becomes Exact at once. [Inference: the club now trains with him daily, so hiding his ratings would feel artificial.]
- **Rollover.** At season rollover every non-own player's knowledge halves (rounded down), because his ratings may have changed. New youth intakes at rival clubs and newly generated free agents start at 0.

### 3.4 What the manager sees

**(a) Own players.** Exact ratings, as today. The development outlook (3.5) appears on each player page and in the academy table. The season development report keeps its exact deltas.

**(b) Other clubs' players and free agents.** Ranges at their level, a level chip ("Scouted"), and a short line on why: "Scouted 3 rounds, faced us twice this season". The playing style label stays (it is a public reading of how he plays), but the numbers behind it become ranges. Change since last season is hidden for non-own players; the page says "Ratings may have changed since last season" after a rollover.

**(c) Unknown and young prospects.** Own academy prospects are exact now, with a development outlook. Rival prospects are not visible today, and stay invisible in the first slice. A rival youth graduate appears in his club's squad at Unknown.

Wording rules for every range:

- "Our scouts rate his timing between 61 and 71." Never "about 66".
- The range is drawn as a bar segment, not a point, and the midpoint is never highlighted [Inference: a highlighted midpoint invites players to read it as the true value].
- The "About scouting" panel states the rule plainly: "Every range contains the player's true rating. More scouting, and playing against him, narrows it. Ratings change only between seasons."

### 3.5 Development outlook (observable potential)

There is no true potential value to observe (section 2.1). Inventing one now would create a hidden number that the development model does not use. Instead the outlook reports what the **real development rules** allow:

- **Phase:** youth growth, early development, prime, or decline, from age (the same thresholds as `developPlayerAcrossOffseason`).
- **Next season:** the smallest and largest change the rules allow for each discipline. For a 19-year-old batter who plays and practises: "Batting: no change to plus 3 next season".
- **By age 25** (end of the growth window): the lowest and highest group average the rules allow, starting from the shown range. "Batting at 25: between 58 and 79 under the current rules."

For other clubs' players, the outlook starts from the **shown** range, not the truth, so it leaks nothing. For own players it starts from the exact rating.

The outlook is a hard bound under stated conditions (regular cricket and practice). It is wide for teenagers. That is honest: the current model allows a wide spread. A narrower "likely" band with a stated confidence is part of the fuller system (section 7), and depends on C3.

Honest wording: "Under the current development rules, his batting can reach at most 79 by age 25." Never "will become a star".

### 3.6 The decisions it creates

- **Where to point two slots.** Next opponent (match preparation), free agents before the window closes, or a rival star you hope to sign next year. You cannot do all three.
- **When to bid.** Bid in negotiation round 1 on a wide range, or spend a round scouting and risk a rival club signing him first.
- **Youth versus proven.** A prospect's outlook is wide but real. A 28-year-old's range may be narrow but his outlook only goes down.
- **The reveal.** Signing makes a player Exact. Sometimes the truth sits at the bottom of the range. That risk is the point, and it is always fair because the range contained the truth.

Tedium guard: no daily actions, assignments persist, scouting reports appear as one inbox line per tick at most, and a manager who ignores scouting still gains knowledge from matches.

### 3.7 Kept within the eight-club world

No new clubs, leagues, scouts as people, or regions. The two slots are a club facility, not hired staff, in the first slice.

## 4. Truthfulness rules

These are rules for the build, and each has a test (section 6).

1. **The truth is authoritative.** The true `Player.skills` drive every match, development, economy and AI calculation, unchanged. Scouting state is never an input to any of them.
2. **Every shown range contains the truth.** For the first slice this is a hard rule (100%), not a confidence level. Construction, for each T20 skill of each non-own player in each season:
   - width `w` comes from the knowledge level (3.2);
   - a base offset `a0` is drawn once per player, skill and season, uniformly from 0 to 24 (section 5), and scaled to the width: `a = floor(a0 * w / 24)`;
   - the range is `truth - a` to `truth - a + w`, clipped to 18 to 86.
   The truth is inside by construction, and sits at a uniformly random position, so the midpoint is an unbiased but noisy estimate.
3. **Ranges narrow honestly.** Within a season, `a0` is fixed per skill, so as `w` shrinks the low end can only rise and the high end can only fall. When knowledge rises, the new range lies inside the old one. Ranges never jump about within a season, and comparing two of them reveals nothing more.
4. **Derived ranges are computed, not drawn.** Group, OVR and style-basis ranges use interval arithmetic on the skill ranges, rounding lows down and highs up. They contain the truth because their inputs do.
5. **New offsets each season.** At rollover a fresh `a0` is drawn. Otherwise the shift of a rival's range would reveal his exact development. [Inference: a player who compares ranges across seasons for a player whose ratings did not change can narrow them by intersection; this is a small, documented exploit, and halving knowledge at rollover limits its value.]
6. **No narrative manipulation.** Nothing that reads match results, stories, rivalries, objectives or the user's preferences may set `w`, `a` or knowledge. Only the inputs in 3.3 change knowledge, and only the draw in rule 2 places the range.
7. **Development is real and measurable.** Own players' development stays exact and recorded in `PlayerSeasonDevelopmentReport`. The outlook (3.5) is computed from the same rules that `developPlayerAcrossOffseason` applies, and a test checks that every real delta falls inside the outlook. When C3 changes the development model, the outlook function gets a matching new version.
8. **The save file holds the truth.** Uncertainty is a presentation contract, not secrecy. A player who reads the save file can see true ratings. The game does not claim otherwise.

### 4.6 One gate for every rival rating

All UI that shows a rating of a non-own player in a career reads it through a single projection, proposed as `scoutedPlayerView(player, knowledge, season, baseSeed)` in a new `packages/projections/src/scouting-view.ts`. It returns either exact values (own player, or exact mode) or ranges. A unit test lists the career screens in section 2.4 and checks they import no raw `player.skills` for non-own players [Inference: a lint-style source check, like `scripts/check-boundaries.mjs`, is the cheapest way to stop new leaks].

## 5. Determinism and randomness

- **One draw per player, skill and season.** Address: `seed = "{baseSeed}:scouting-v1-s{season}"`, `domain = "PREDICTION"`, `entityId = playerId`, `eventOrdinal = season`, `stageName = "scout-offset-{skill}"`, `drawIndex = 0`. `a0 = uint32 % 25`.
- **Separate by construction.** The service is stateless and address-based (section 2.6). A distinct seed namespace cannot change any existing draw: match deliveries, toss, weather, development, retirement, youth and AI recruitment all keep their exact outputs.
- **No new domain value.** `PREDICTION` already means "a draw for what the manager is told" (the red-ball forecast). Reusing it avoids widening `RandomAddressSchema` (question Q7).
- **Never the match engine's.** Scouting code lives outside the match workers and engines. It runs in the career command pipeline after a match completion or round resolution is recorded.
- **Offsets are derived, not stored.** `a0` is recomputed from the address on demand. Knowledge and assignments are stored. So a replay of the same commands from the same save gives identical ranges, and a stored scouting report can be re-derived and checked.
- **Knowledge gains are deterministic sums** of fixed amounts (3.3). No draw decides how much is learned.
- **Order independence.** Gains within a tick are applied in code-point order of `playerId`, the project's locale-free rule (`compareCodePoints`, used in `packages/simulation/src/player-lifecycle.ts`).

## 6. Persistence and versioning

### 6.1 New state

A new `ScoutingStateV1` (`LC_SCOUTING_STATE_V1`), sealed with its own `scoutingSha256` like the economy:

| Field | Content | Bound |
| --- | --- | --- |
| `scoutingVersion` | `LC_SCOUTING_STATE_V1` | |
| `policyVersion` | `LC_SCOUTING_POLICY_V1` (widths, gains, decay, offset rule) | |
| `mode` | `UNCERTAIN` or `EXACT` | one-way: `UNCERTAIN` may become `EXACT`, never back |
| `managedTeamId` | the club whose knowledge this is | |
| `knowledge` | `{ playerId, points }` for every non-own active player and free agent | at most 10,000 |
| `slots` | two `{ slotIndex, target, assignedSeasonNumber, assignedDate }`; target is `PLAYER`, `CLUB` or `FREE_AGENT_POOL`, or empty | exactly 2 |
| `seasonLedger` | this season's gains: `{ sequence, date, source, playerId, points }`, source `SLOT`, `MATCH`, `JOINED`, `CARRY_IN` | about 600 a season [Inference: 2 slots by 17 ticks by up to 20 players, plus about 150 match entries] |
| `seasonSummaries` | per finished season: counts by source and level | at most `MAX_PERSISTENT_SEASONS` |
| `appliedCommandIds` | scouting commands applied | at most 10,000 |

At rollover the season ledger collapses into `CARRY_IN` entries (halved points) and a one-line summary, so the state does not grow with career length beyond the summaries. [Inference: about 30 to 50 KB per world state, against the 1.6 to 2.5 MB measured in `docs/HANDOVER.md`.]

New commands, each a strict Zod request like the economy's: `SET_SCOUTING_SLOT`, `CLEAR_SCOUTING_SLOT`, `SET_SCOUTING_MODE_EXACT`.

No existing schema changes. `PlayerSchema`, the lifecycle, the economy, season states and completed season records stay byte-for-byte the same.

### 6.2 New versions

- **World state V7** `LC_PERSISTENT_WORLD_STATE_V7`: V6 exactly, plus `scouting: ScoutingStateV1`. Hashed and stored as V6 (finished seasons by reference). Core, full and stored schemas, as for V6.
- **Save schemas** `LC_PERSISTENT_WORLD_SAVE_V7` and `LC_PERSISTENT_WORLD_SAVE_V7_PRESENTATION`.
- **Export V8** `LC_PERSISTENT_WORLD_PORTABLE_V8_WORLD_V7`: the V7 export layout with a V7 state in `game.json`. The V8 reader accepts only V7; the V7 reader refuses V8.
- Generated schemas: new files only. The existing 409 files in `packages/contracts/schemas/` must be unchanged (`npm run schemas:check`).

### 6.3 Migration: what each save sees

- **New careers** start on V7 in `UNCERTAIN` mode (the new-career screen offers "Exact ratings" instead). Initial knowledge: rival squad players 30 (Glimpsed, [Inference: the league is public and televised]), free agents 10 (Unknown), own squad exact. Question Q10.
- **A world state V6 career** loads, saves and plays exactly as now for the rest of its season. At its next rollover it becomes V7, as V5 became V6 (`apps/web/src/career/world-state.ts`). The rollover screen asks once: "Turn on scouting? Other clubs' ratings will show as ranges." Default is **Exact**, so nothing changes for a player who just clicks on. If turned on, each rival who appeared in the closed season starts at 50 (Scouted) and every other non-own player at 25. No halving applies at that rollover. Question Q2.
- **A world state V5 career** becomes V7 directly at its next rollover (V7 includes V6's fixture policy V2), with the same choice.
- **World states V2 to V4** are unchanged. They can be copied forward to V5 from the career screen, as now, and then move on at rollover.
- **Single-season saves** stay as they are.
- **Exhibitions, scenarios, tournaments, tours, auctions, the world editor:** unchanged, exact ratings.
- **No rollback.** An older build cannot open V7 or read V8. Export a backup before rolling over if an older build must open the career.
- Finished seasons and match archives are not rewritten. Every finished match still replays from its stored events.

### 6.4 Compatibility tests required

- V6 career: reload mid-season, finish the season with fixtures, development and economy identical to today; at rollover becomes V7; finished season unchanged.
- V5 career at rollover becomes V7 with season state V2.
- V7 save, reload, stored-by-reference checkpoint, and V8 export round trip, hashes equal.
- V7 refuses a V1 season state and a missing or tampered `scouting` block; V6 refuses a `scouting` field; the V7 and V8 readers refuse older and newer archives as the V6/V7 pair do.
- V2 to V4 saves load and play unchanged.
- `npm run schemas:check`: only new schema files; pinned counts in `tests/unit/contracts.test.ts` updated by exactly the new schemas.
- Frozen determinism vectors, scoring fixtures and generator checks unchanged (`npm run vectors:check`, `fixtures:engine`, `generator:check`).

## 7. Measurement plan

### 7.1 Automated checks (run in CI on every change)

1. **Coverage, 100% required.** Run several seeded careers for three seasons with random scouting assignments (yielding horizon runners, as in `runSquadEconomyDiagnosticHorizon`, `packages/simulation/src/squad-economy.ts`). At every tick, for every non-own player, every skill, group and OVR range must contain the truth. Any miss fails.
2. **No positional bias.** Across all draws, the truth's position within the range (`a0` from 0 to 24) is uniform. Check each value's frequency against expectation with a fixed tolerance, and that the mean of (midpoint minus truth) is near zero.
3. **Nesting.** Within a season, when knowledge rises, every new range lies inside the previous one.
4. **No influence on results.** The same career run in `EXACT` mode, in `UNCERTAIN` mode with no assignments, and with different assignments gives byte-identical match event hashes, scorecards, league tables, development reports, economy ledger and AI signings.
5. **Random isolation.** A test wraps the random service and checks that scouting code requests only addresses with the `:scouting-v1-` seed namespace, and that no non-scouting code requests one.
6. **Outlook truth.** Over the same horizons, every real season delta lies inside the next-season outlook, and every player's group average at 25 lies inside the outlook given at any earlier age, under the stated conditions. Players who did not meet the conditions (no matches, no practice) are counted and reported separately.
7. **Leak check.** The source check in 4.6.

### 7.2 Reported measures (not gates)

- Mean range width and the mean absolute error of the midpoint by knowledge level, to show scouting effort matters.
- How many of a season's free-agent signings were made at each level.
- Knowledge distribution at season end with and without assignments.

### 7.3 Playtest questions for C2

To add to `docs/pavilion/PLAYTEST_PROTOCOL.md` for a career session. Record what participants do and say. Do not record or report enjoyment as a result of these.

1. Without prompting, does the participant notice that rival ratings are ranges? Time to first notice.
2. Ask: "What does 61 to 71 mean here?" Record the answer word for word. Can they say the true value is inside?
3. Ask: "Which two things would you scout now, and why?" Record whether they mention the next opponent, free agents, or a future signing.
4. In the negotiation window: do they scout before bidding, bid at once, or ignore scouting? Count bids made at each knowledge level.
5. After a signing reveals exact ratings: record the reaction. Ask: "Were the scouts honest with you?"
6. Show the development outlook for an academy prospect. Ask them to explain it. Record whether it changes a promote, keep or release choice.
7. Count visits to the scouting panel per league round. Record whether assignments are changed after round 3 or left alone.
8. Ask: "Would you rather see exact numbers?" Record the answer and whether they found the exact-ratings option.

## 8. Scope options

| Option | Contents | Rough effort | Risk |
| --- | --- | --- | --- |
| **0. Display only** | Ranges derived only from match exposure in the current season. No slots, no new state, no format change. | 2 pull requests, about 3 agent days | Low. But no scouting decision, so it does not meet C2's "where to spend limited scouting". |
| **A. First slice (recommended)** | Sections 3 to 7 as written: knowledge levels, two slots, match exposure, rollover decay, signing reveal, rules-based development outlook, exact mode, honest academy wording, world state V7 and export V8, automatic upgrade at rollover with a choice. Career only. | 4 pull requests: contracts and pure simulation module with tests; persistence V7, export V8 and migration tests; UI surfaces and the leak check; measurement script and documentation. About 6 to 10 agent days including CI cycles [Inference: from the size of the fixture policy V2 change, which needed one world version and one export version]. | Medium. New persisted format; many screens to route through one view; no change to any result. |
| **B. Fuller system** | A, plus: economy model V2 where asking wages and AI valuations use a seeded market estimate (removes the wage leak, AI clubs face the same uncertainty); AI clubs with their own knowledge; a "likely" outlook band with a stated and tested confidence; a true per-player growth trait from C3 that scouts observe; scouting rival academies; opposition scouting feeding tactical briefings (B2). | 10 to 15 pull requests, several weeks | High. Changes career results (economy and AI behaviour, and with C3 the development model), so it needs new model versions, before and after measurements, and balance checks. |

**Recommendation: build option A first.** It gives the manager real decisions and an honest outlook, changes no cricket or career result, and keeps every existing format intact. Decide on B's parts after the C2 playtest questions have been run and after C3's design, since the growth trait and the likely band depend on it.

## 9. Known limits of the first slice

- **Asking wages follow the true rating** (2.5). The first slice says so in the game: "Asking wages follow the player's true standard, so the market price is a real clue." This keeps the game honest without changing the economy. Option B removes it.
- **AI clubs and AI captains use true ratings** (`buildPublicMarketPlayerView`, `packages/simulation/src/squad-economy.ts`; `apps/web/src/match/ai-opponent.ts`). The manager has less information than the AI. `AGENTS.md` says AI decisions must use only authorised public observations; today ratings are public, so this was true. After C2 it needs an explicit owner decision (Q4).
- **The board objective** ranks clubs from true ratings (`apps/web/src/career/HomeScreen.tsx`). It shows only an expected finishing band, which is the board's own view. Kept.
- **ODI and red-ball ratings** of non-own players are hidden in careers ("T20 career: not scouted"), since the career is T20 only.
- **Cross-season intersection** (rule 5) is a small, documented exploit.

## 10. Open questions for the owner

Each has a recommended answer.

| # | Question | Recommended answer |
| --- | --- | --- |
| Q1 | Should ranges always contain the truth (hard bound), or be confidence ranges (for example "8 in 10") that can miss? | **Hard bound, always contains the truth.** Easier to explain, testable at 100%, and never feels like a lie. |
| Q2 | How should existing V5 and V6 careers upgrade? | **Automatically to V7 at the next rollover**, as for fixture policy V2, with a one-time choice on the rollover screen, **defaulting to Exact**. New careers default to uncertainty on. |
| Q3 | Should a player be able to keep exact ratings? | **Yes.** Chosen at career creation; a later one-way switch from uncertain to exact is allowed. Not the reverse, to stop scout-then-switch-back loops. |
| Q4 | May AI clubs and AI captains keep using true ratings in the first slice? | **Yes, as a documented asymmetry**, recorded as an owner decision against the `AGENTS.md` invariant. Revisit in option B with AI knowledge. |
| Q5 | The asking wage reveals a free agent's true role rating. Accept for now? | **Accept and say so in the game** ("the market price is a real clue"). Fix with economy model V2 in option B if playtests show it removes the signing risk. |
| Q6 | The academy "ceiling tier" only raises starting skills; it does not affect growth. What should it say? | **Rename the display now to "Intake grade"** with a one-line explanation, display only, no format change. Let C3 decide whether a real growth trait exists. |
| Q7 | Add a new `SCOUTING` value to the random address domain, or reuse an existing one? | **Reuse `PREDICTION` with a new seed namespace.** No protected contract is widened and isolation is still guaranteed. |
| Q8 | Should scouting apply outside careers (tournaments, auctions, tours, quick matches)? | **No. Career only.** Those modes keep exact ratings. |
| Q9 | Two slots, 17 ticks a season, and the widths in 3.2: fixed now or tuned? | **Build with these numbers, behind the `LC_SCOUTING_POLICY_V1` version, and tune only through a new policy version after the playtest.** |
| Q10 | Starting knowledge for new careers? | **Rivals at Glimpsed (30), free agents at Unknown (10), own squad exact.** |
| Q11 | Should a signed player become exact immediately? | **Yes.** The reveal is the moment the risk resolves; delaying it adds waiting, not decisions. |
| Q12 | Should the development outlook ship before C3 changes the development model? | **Yes, versioned to the current lifecycle model** (`LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1`), with the outlook test in 7.1 item 6. A new lifecycle model needs a matching outlook version. |

## 11. Evidence for this page

- Revision read: `main` at `4558fdb` (worktree on branch `pavilion/c2-scouting-proposal`).
- Commands run: source reads and searches only (`git grep`, `grep`, `sed`). **NOT RUN:** `npx tsc -b`, `npm run verify:09:core`, any test. No code changed, so no test result is claimed.
