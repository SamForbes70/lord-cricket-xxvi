import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  T20SeasonMatchCompletionSchema,
  T20SeasonProjectionStateSchema,
  type SeasonFixture,
  type T20SeasonMatchCompletion,
} from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS, T20_LEAGUE_COMPETITION } from "@lcxxvi/data";
import {
  completionFromOffscreenOutcome,
  createT20SeasonProjection,
  applyT20SeasonMatchCompletion,
  validateT20SeasonProjection,
} from "@lcxxvi/projections";
import {
  createCareerDayStateV2,
  generateSeasonSchedule,
  simulateOffscreenFixture,
} from "@lcxxvi/simulation";

const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

function schedule() {
  return generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
    seasonId: "season-projection-01",
    gameId: "career-projection-01",
    competitionId: "LC_T20_LEAGUE_01",
    worldPackId: "fictional-eight-01",
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    seasonSeed: "season-projection-seed-01",
    startDate: "2027-01-03",
    teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
    groundIds: [...T20_LEAGUE_COMPETITION.groundIds],
    homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
  });
}

function selection(teamId: string) {
  const teamNumber = Number(teamId.slice(-2));
  const start = (teamNumber - 1) * 20 + 1;
  const playerIds = Array.from({ length: 11 }, (_, index) => `p${String(start + index).padStart(3, "0")}`);
  return { teamId, playerIds, captainId: playerIds[0]!, keeperId: playerIds[1]! };
}

function emptyInnings(battingTeamId: string, bowlingTeamId: string, runs: number, wickets: number, legalBalls: number, targetToWin: number | null) {
  return {
    battingTeamId, bowlingTeamId, runs, wickets, legalBalls,
    overs: `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
    batting: {}, bowling: {}, fallOfWickets: [], targetToWin,
  };
}

function fixtureForPair(seasonSchedule: ReturnType<typeof schedule>, a: string, b: string): SeasonFixture {
  const fixture = seasonSchedule.fixtures.find((entry) =>
    (entry.homeTeamId === a && entry.awayTeamId === b) || (entry.homeTeamId === b && entry.awayTeamId === a));
  if (!fixture) throw new Error(`missing fixture ${a}/${b}`);
  return fixture;
}

function syntheticCompletion(
  seasonSchedule: ReturnType<typeof schedule>,
  fixture: SeasonFixture,
  input: {
    result: "HOME_WIN" | "AWAY_WIN" | "TIE" | "NO_RESULT";
    homeRuns: number;
    awayRuns: number;
    homeWickets?: number;
    awayWickets?: number;
    homeBalls?: number;
    awayBalls?: number;
    homeBatting?: Record<string, {runs:number;ballsFaced:number;fours:number;sixes:number;dismissed:boolean}>;
    homeBowling?: Record<string, {runsConceded:number;legalBalls:number;wickets:number;maidens:number}>;
    awayBatting?: Record<string, {runs:number;ballsFaced:number;fours:number;sixes:number;dismissed:boolean}>;
    awayBowling?: Record<string, {runsConceded:number;legalBalls:number;wickets:number;maidens:number}>;
    sourceSalt?: string;
  },
): T20SeasonMatchCompletion {
  const homeBalls = input.homeBalls ?? 120, awayBalls = input.awayBalls ?? 120;
  const home = emptyInnings(fixture.homeTeamId, fixture.awayTeamId, input.homeRuns, input.homeWickets ?? 5, homeBalls, null);
  const away = emptyInnings(fixture.awayTeamId, fixture.homeTeamId, input.awayRuns, input.awayWickets ?? 5, awayBalls, input.homeRuns + 1);
  home.batting = input.homeBatting ?? {};
  home.bowling = input.awayBowling ?? {};
  away.batting = input.awayBatting ?? {};
  away.bowling = input.homeBowling ?? {};
  const result = input.result === "HOME_WIN"
    ? { kind: "WIN" as const, winnerTeamId: fixture.homeTeamId, marginType: "RUNS" as const, marginRuns: Math.max(1, input.homeRuns - input.awayRuns), marginWickets: null, completionReason: "SYNTHETIC_PROJECTION_TEST" }
    : input.result === "AWAY_WIN"
      ? { kind: "WIN" as const, winnerTeamId: fixture.awayTeamId, marginType: "WICKETS" as const, marginRuns: null, marginWickets: 5, completionReason: "SYNTHETIC_PROJECTION_TEST" }
      : { kind: input.result === "TIE" ? "TIE" as const : "NO_RESULT" as const, winnerTeamId: null, marginType: null, marginRuns: null, marginWickets: null, completionReason: "SYNTHETIC_PROJECTION_TEST" };
  const hex = `${fixture.ordinal + 1}${input.sourceSalt ?? ""}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0).toString(16);
  return T20SeasonMatchCompletionSchema.parse({
    completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1",
    seasonId: seasonSchedule.seasonId,
    scheduleSha256: seasonSchedule.scheduleSha256,
    fixtureId: fixture.fixtureId,
    matchId: fixture.matchId,
    fixtureOrdinal: fixture.ordinal,
    roundNumber: fixture.roundNumber,
    matchDayDate: fixture.matchDayDate,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    source: "USER_MATCH",
    sourceCompletionSha256: hex.padStart(64, "0").slice(-64),
    selectedTeams: [selection(fixture.homeTeamId), selection(fixture.awayTeamId)],
    scorecard: { matchId: fixture.matchId, innings: [home, away], result },
    scorecardSha256: (hex + "f").padStart(64, "0").slice(-64),
  });
}

function apply(state: unknown, seasonSchedule: ReturnType<typeof schedule>, completion: unknown) {
  return applyT20SeasonMatchCompletion({ state, competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule, completion });
}

describe("Pass 12E league table, NRR and season statistical projections", () => {
  test("adapts a validated Pass 12D outcome into the shared season projection path", () => {
    const seasonSchedule = schedule();
    const careerState = createCareerDayStateV2({ careerId: "career-projection-real", schedule: seasonSchedule });
    const fixture = seasonSchedule.fixtures[0]!;
    const simulated = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest });
    const completion = completionFromOffscreenOutcome(seasonSchedule, simulated.outcome);
    let state = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule });
    state = apply(state, seasonSchedule, completion);
    expect(T20SeasonProjectionStateSchema.parse(state)).toEqual(state);
    expect(validateT20SeasonProjection({ state, competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule })).toEqual(state);
    expect(state.revision).toBe(1);
    expect(state.table.reduce((sum, row) => sum + row.played, 0)).toBe(2);
    expect(state.table.reduce((sum, row) => sum + row.points, 0)).toBe(2);
    expect(state.players.filter((player) => player.matches === 1)).toHaveLength(22);
  });

  test("uses 120 balls for an all-out innings and actual balls for a successful chase", () => {
    const seasonSchedule = schedule();
    const fixture = fixtureForPair(seasonSchedule, "team-05", "team-06");
    const completion = syntheticCompletion(seasonSchedule, fixture, {
      result: "AWAY_WIN", homeRuns: 150, awayRuns: 151,
      homeWickets: 10, homeBalls: 100, awayWickets: 5, awayBalls: 110,
    });
    const state = apply(createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule }), seasonSchedule, completion);
    const home = state.table.find((row) => row.teamId === fixture.homeTeamId)!;
    const away = state.table.find((row) => row.teamId === fixture.awayTeamId)!;
    expect(home.ballsFor).toBe(120);
    expect(away.ballsFor).toBe(110);
    expect(home.ballsAgainst).toBe(110);
    expect(away.ballsAgainst).toBe(120);
  });

  test("excludes no-result matches from NRR while awarding one point each", () => {
    const seasonSchedule = schedule();
    const fixture = fixtureForPair(seasonSchedule, "team-07", "team-08");
    const completion = syntheticCompletion(seasonSchedule, fixture, { result: "NO_RESULT", homeRuns: 80, awayRuns: 40, homeBalls: 60, awayBalls: 30 });
    const state = apply(createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule }), seasonSchedule, completion);
    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      const row = state.table.find((entry) => entry.teamId === teamId)!;
      expect(row.points).toBe(1);
      expect(row.noResults).toBe(1);
      expect(row.runsFor).toBe(0);
      expect(row.ballsFor).toBe(0);
      expect(row.nrrDenominator).toBeNull();
    }
  });

  test("uses head-to-head mini-table points after equal points, wins and exact NRR", () => {
    const seasonSchedule = schedule();
    let state = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule });
    const ab = fixtureForPair(seasonSchedule, "team-01", "team-02");
    const ac = fixtureForPair(seasonSchedule, "team-01", "team-03");
    const bd = fixtureForPair(seasonSchedule, "team-02", "team-04");
    const winnerFor = (fixture: SeasonFixture, winner: string) => winner === fixture.homeTeamId ? "HOME_WIN" as const : "AWAY_WIN" as const;
    state = apply(state, seasonSchedule, syntheticCompletion(seasonSchedule, ab, { result: winnerFor(ab, "team-01"), homeRuns: ab.homeTeamId === "team-01" ? 101 : 100, awayRuns: ab.awayTeamId === "team-01" ? 101 : 100 }));
    state = apply(state, seasonSchedule, syntheticCompletion(seasonSchedule, ac, { result: winnerFor(ac, "team-03"), homeRuns: ac.homeTeamId === "team-03" ? 101 : 100, awayRuns: ac.awayTeamId === "team-03" ? 101 : 100 }));
    state = apply(state, seasonSchedule, syntheticCompletion(seasonSchedule, bd, { result: winnerFor(bd, "team-02"), homeRuns: bd.homeTeamId === "team-02" ? 101 : 100, awayRuns: bd.awayTeamId === "team-02" ? 101 : 100 }));
    const a = state.table.find((row) => row.teamId === "team-01")!;
    const b = state.table.find((row) => row.teamId === "team-02")!;
    expect(a.points).toBe(b.points);
    expect(a.wins).toBe(b.wins);
    expect(a.nrrNumerator).toBe(0);
    expect(b.nrrNumerator).toBe(0);
    expect(a.headToHeadPoints).toBe(2);
    expect(b.headToHeadPoints).toBe(0);
    expect(a.rank).toBeLessThan(b.rank);
  });

  test("computes player rates from raw integer aggregates with null zero denominators", () => {
    const seasonSchedule = schedule();
    const fixture = fixtureForPair(seasonSchedule, "team-01", "team-02");
    const homePlayer = selection(fixture.homeTeamId).playerIds[0]!;
    const completion = syntheticCompletion(seasonSchedule, fixture, {
      result: "HOME_WIN", homeRuns: 140, awayRuns: 130,
      homeBatting: { [homePlayer]: { runs: 50, ballsFaced: 40, fours: 5, sixes: 2, dismissed: true } },
      homeBowling: { [homePlayer]: { runsConceded: 20, legalBalls: 24, wickets: 2, maidens: 1 } },
    });
    const state = apply(createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule }), seasonSchedule, completion);
    const player = state.players.find((entry) => entry.playerId === homePlayer)!;
    expect(player).toMatchObject({ runs: 50, dismissals: 1, ballsFaced: 40, battingAverageX100: 5000, strikeRateX100: 12500,
      bowlingRunsConceded: 20, bowlingLegalBalls: 24, bowlingWickets: 2, bowlingAverageX100: 1000, economyX100: 500, bowlingStrikeRateX100: 1200 });
    const unused = state.players.find((entry) => entry.teamId === fixture.homeTeamId && entry.playerId !== homePlayer)!;
    expect(unused.battingAverageX100).toBeNull();
    expect(unused.strikeRateX100).toBeNull();
    expect(unused.bowlingAverageX100).toBeNull();
    expect(unused.economyX100).toBeNull();
  });

  test("is idempotent for the same completion and rejects a conflicting retry", () => {
    const seasonSchedule = schedule();
    const fixture = seasonSchedule.fixtures[0]!;
    const completion = syntheticCompletion(seasonSchedule, fixture, { result: "HOME_WIN", homeRuns: 120, awayRuns: 110 });
    const initial = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule });
    const once = apply(initial, seasonSchedule, completion);
    const twice = apply(once, seasonSchedule, completion);
    expect(twice).toEqual(once);
    const conflict = { ...completion, sourceCompletionSha256: "f".repeat(64) };
    expect(() => apply(once, seasonSchedule, conflict)).toThrow(/CONFLICTING_COMPLETION/);
  });

  test("cursor exposes fixture gaps when completions arrive out of order and clears them later", () => {
    const seasonSchedule = schedule();
    let state = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule });
    const one = seasonSchedule.fixtures.find((fixture) => fixture.ordinal === 1)!;
    const zero = seasonSchedule.fixtures.find((fixture) => fixture.ordinal === 0)!;
    state = apply(state, seasonSchedule, syntheticCompletion(seasonSchedule, one, { result: "TIE", homeRuns: 100, awayRuns: 100 }));
    expect(state.cursor).toEqual({ appliedCount: 1, highestAppliedFixtureOrdinal: 1, missingFixtureOrdinals: [0] });
    state = apply(state, seasonSchedule, syntheticCompletion(seasonSchedule, zero, { result: "TIE", homeRuns: 100, awayRuns: 100 }));
    expect(state.cursor).toEqual({ appliedCount: 2, highestAppliedFixtureOrdinal: 1, missingFixtureOrdinals: [] });
  });

  test("leaders are deterministic raw-season leaders with player-id fallback", () => {
    const seasonSchedule = schedule();
    const fixture = seasonSchedule.fixtures[0]!;
    const homeSelection = selection(fixture.homeTeamId);
    const p1 = homeSelection.playerIds[0]!, p2 = homeSelection.playerIds[1]!;
    const completion = syntheticCompletion(seasonSchedule, fixture, {
      result: "HOME_WIN", homeRuns: 120, awayRuns: 100,
      homeBatting: {
        [p1]: { runs: 40, ballsFaced: 30, fours: 4, sixes: 1, dismissed: true },
        [p2]: { runs: 40, ballsFaced: 35, fours: 3, sixes: 1, dismissed: true },
      },
      homeBowling: {
        [p1]: { runsConceded: 20, legalBalls: 24, wickets: 2, maidens: 0 },
        [p2]: { runsConceded: 22, legalBalls: 24, wickets: 2, maidens: 0 },
      },
    });
    const state = apply(createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule: seasonSchedule }), seasonSchedule, completion);
    expect(state.leaders.runs.slice(0, 2).map((entry) => entry.playerId)).toEqual([p1, p2].sort());
    expect(state.leaders.wickets.slice(0, 2).map((entry) => entry.playerId)).toEqual([p1, p2].sort());
  });
});
