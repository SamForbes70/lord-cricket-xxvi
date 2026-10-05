import { describe, expect, test } from "vitest";
import {
  SeasonScheduleRequestSchema,
  SeasonScheduleSchema,
} from "@lcxxvi/contracts";
import { T20_LEAGUE_COMPETITION } from "@lcxxvi/data";
import {
  generateSeasonSchedule,
  validateSeasonSchedule,
} from "@lcxxvi/simulation";

const teamIds = Array.from({ length: 8 }, (_, i) => `team-${String(i + 1).padStart(2, "0")}`);
const groundIds = Array.from({ length: 8 }, (_, i) => `ground-${String(i + 1).padStart(2, "0")}`);
const homeGroundIds = Object.fromEntries(
  teamIds.map((teamId, i) => [teamId, `ground-${String(i + 1).padStart(2, "0")}`]),
);
const request = SeasonScheduleRequestSchema.parse({
  scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
  seasonId: "season-01",
  gameId: "career-01",
  competitionId: "LC_T20_LEAGUE_01",
  worldPackId: "fictional-eight-01",
  worldCanonicalSha256: "f4cbe33f4a2ea41385143cc03ab6d64e94a356f8af75e30483a68de87bdca252",
  seasonSeed: "season-seed-01",
  startDate: "2027-01-03",
  teamIds,
  groundIds,
  homeGroundIds,
});

const expectedFirstHalf = [
  [["team-01", "team-08"], ["team-02", "team-07"], ["team-03", "team-06"], ["team-04", "team-05"]],
  [["team-07", "team-01"], ["team-06", "team-08"], ["team-05", "team-02"], ["team-04", "team-03"]],
  [["team-01", "team-06"], ["team-07", "team-05"], ["team-08", "team-04"], ["team-02", "team-03"]],
  [["team-05", "team-01"], ["team-04", "team-06"], ["team-03", "team-07"], ["team-02", "team-08"]],
  [["team-01", "team-04"], ["team-05", "team-03"], ["team-06", "team-02"], ["team-07", "team-08"]],
  [["team-03", "team-01"], ["team-02", "team-04"], ["team-08", "team-05"], ["team-07", "team-06"]],
  [["team-01", "team-02"], ["team-03", "team-08"], ["team-04", "team-07"], ["team-05", "team-06"]],
] as const;

describe("Pass 12A T20 season competition contracts", () => {
  test("pins the bounded V0.1 competition policy", () => {
    expect(T20_LEAGUE_COMPETITION).toEqual({
      competitionVersion: "LC_T20_LEAGUE_COMPETITION_V1",
      competitionId: "LC_T20_LEAGUE_01",
      format: "T20",
      worldPackId: "fictional-eight-01",
      worldCanonicalSha256: "f4cbe33f4a2ea41385143cc03ab6d64e94a356f8af75e30483a68de87bdca252",
      teamIds,
      groundIds,
      homeGroundIds,
      teamCount: 8,
      rounds: 14,
      matchesPerRound: 4,
      totalFixtures: 56,
      roundSpacingDays: 3,
      playoffs: false,
      points: { win: 2, tie: 1, noResult: 1, loss: 0 },
      tableOrder: ["POINTS", "WINS", "NET_RUN_RATE", "HEAD_TO_HEAD_POINTS", "TEAM_ID"],
      rainAdjustedNrr: false,
      schedulerAlgorithm: "CIRCLE_REVERSE_VENUES_V1",
    });
  });

  test("generates the exact 14-round, 56-fixture circle schedule", () => {
    const schedule = generateSeasonSchedule(request);
    expect(SeasonScheduleSchema.parse(schedule)).toEqual(schedule);
    expect(schedule.rounds).toHaveLength(14);
    expect(schedule.fixtures).toHaveLength(56);

    for (let round = 0; round < 7; round += 1) {
      const first = schedule.fixtures
        .filter((fixture) => fixture.roundNumber === round + 1)
        .map((fixture) => [fixture.homeTeamId, fixture.awayTeamId]);
      expect(first).toEqual(expectedFirstHalf[round]);
      const reverse = schedule.fixtures
        .filter((fixture) => fixture.roundNumber === round + 8)
        .map((fixture) => [fixture.homeTeamId, fixture.awayTeamId]);
      expect(reverse).toEqual(expectedFirstHalf[round]!.map(([home, away]) => [away, home]));
    }
  });

  test("plays each team once per round and every ordered pair exactly once", () => {
    const schedule = generateSeasonSchedule(request);
    const orderedPairs = schedule.fixtures.map((fixture) => `${fixture.homeTeamId}>${fixture.awayTeamId}`);
    expect(new Set(orderedPairs).size).toBe(56);

    for (const round of schedule.rounds) {
      const fixtures = schedule.fixtures.filter((fixture) => fixture.roundNumber === round.roundNumber);
      expect(new Set(fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId])).size).toBe(8);
    }
    for (const teamId of teamIds) {
      expect(schedule.fixtures.filter((fixture) => fixture.homeTeamId === teamId)).toHaveLength(7);
      expect(schedule.fixtures.filter((fixture) => fixture.awayTeamId === teamId)).toHaveLength(7);
    }
  });

  test("uses three-day round spacing, home grounds and independent fixture seeds", () => {
    const schedule = generateSeasonSchedule(request);
    expect(schedule.rounds.map((round) => round.matchDayDate)).toEqual([
      "2027-01-03", "2027-01-06", "2027-01-09", "2027-01-12", "2027-01-15", "2027-01-18", "2027-01-21",
      "2027-01-24", "2027-01-27", "2027-01-30", "2027-02-02", "2027-02-05", "2027-02-08", "2027-02-11",
    ]);
    expect(new Set(schedule.fixtures.map((fixture) => fixture.matchSeed)).size).toBe(56);
    for (const fixture of schedule.fixtures) {
      expect(fixture.groundId).toBe(homeGroundIds[fixture.homeTeamId]);
      expect(fixture.matchDayDate).toBe(schedule.rounds[fixture.roundNumber - 1]!.matchDayDate);
    }
  });

  test("canonicalises team input order so caller ordering cannot change fixtures or seeds", () => {
    const canonical = generateSeasonSchedule(request);
    const permuted = generateSeasonSchedule({ ...request, teamIds: [...teamIds].reverse() });
    expect(permuted).toEqual(canonical);
  });

  test("changes the schedule identity and every match seed when the season seed changes", () => {
    const a = generateSeasonSchedule(request);
    const b = generateSeasonSchedule({ ...request, seasonSeed: "season-seed-02" });
    expect(b.scheduleSha256).not.toBe(a.scheduleSha256);
    expect(b.seasonSeedHash).not.toBe(a.seasonSeedHash);
    expect(b.fixtures.map((fixture) => fixture.matchSeed)).not.toEqual(a.fixtures.map((fixture) => fixture.matchSeed));
    expect(b.fixtures.map((fixture) => fixture.fixtureId)).not.toEqual(a.fixtures.map((fixture) => fixture.fixtureId));
  });

  test("rejects untrusted world hashes and missing/unknown home-ground mappings", () => {
    expect(() => generateSeasonSchedule({ ...request, worldCanonicalSha256: "0".repeat(64) })).toThrow(/UNTRUSTED_WORLD_HASH/);
    expect(() => generateSeasonSchedule({ ...request, teamIds: [...teamIds.slice(0, 7), "team-99"] })).toThrow(/COMPETITION_TEAM_MEMBERSHIP_MISMATCH/);
    expect(() => generateSeasonSchedule({ ...request, groundIds: [...groundIds.slice(0, 7), "ground-99"] })).toThrow(/COMPETITION_GROUND_MEMBERSHIP_MISMATCH/);
    const missing = { ...homeGroundIds } as Record<string, string>;
    delete missing["team-08"];
    expect(() => generateSeasonSchedule({ ...request, homeGroundIds: missing })).toThrow(/COMPETITION_HOME_GROUNDS_MISMATCH/);
    expect(() => generateSeasonSchedule({ ...request, homeGroundIds: { ...homeGroundIds, "team-09": "ground-09" } })).toThrow(/COMPETITION_HOME_GROUNDS_MISMATCH/);
  });

  test("detects any mutation to a generated schedule through its canonical hash", () => {
    const schedule = generateSeasonSchedule(request);
    const changed = structuredClone(schedule);
    changed.fixtures[0]!.matchDayDate = "2027-01-04";
    expect(() => validateSeasonSchedule(changed)).toThrow(/SCHEDULE_HASH_MISMATCH/);
  });
});
