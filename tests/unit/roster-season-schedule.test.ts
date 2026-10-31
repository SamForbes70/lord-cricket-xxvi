import { describe, expect, it } from "vitest";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { createStagedRosterPack, generateRosterSeasonSchedule, validateRosterSeasonSchedule } from "@lcxxvi/simulation";

function roster(teamCount = 8) {
  const copy = structuredClone(world);
  copy.teams = copy.teams.slice(0, teamCount);
  copy.grounds = copy.grounds.slice(0, teamCount);
  const ids = new Set(copy.teams.flatMap(team => team.squadIds));
  const players = copy.players.filter(player => ids.has(player.playerId)).map(player => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  return createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "schedule-test", world: { ...copy, players } }), world.rulesIds, ["stock"]);
}
const request = { seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" };

describe("roster season schedule", () => {
  it("creates a deterministic balanced eight-team season bound to its pack", () => {
    const pack = roster();
    const schedule = generateRosterSeasonSchedule(pack, request);
    expect(schedule.version).toBe("LC_T20_ROSTER_SCHEDULE_V2");
    expect(schedule.fixtures).toHaveLength(56);
    expect(schedule.rounds).toHaveLength(14);
    expect(validateRosterSeasonSchedule(schedule, pack)).toEqual(schedule);
    expect(generateRosterSeasonSchedule(pack, request)).toEqual(schedule);
    for (const teamId of schedule.teamIds) {
      expect(schedule.fixtures.filter(fixture => fixture.homeTeamId === teamId)).toHaveLength(7);
      expect(schedule.fixtures.filter(fixture => fixture.awayTeamId === teamId)).toHaveLength(7);
    }
    expect(new Set(schedule.fixtures.map(fixture => `${fixture.homeTeamId}:${fixture.awayTeamId}`)).size).toBe(56);
    expect(new Set(Object.values(schedule.homeGroundIds)).size).toBe(8);
  });
  it("rejects modified schedules, damaged packs and unsupported roster sizes", () => {
    const pack = roster();
    const schedule = generateRosterSeasonSchedule(pack, request);
    const damaged = structuredClone(schedule);
    damaged.fixtures[0]!.groundId = damaged.groundIds[1]!;
    expect(() => validateRosterSeasonSchedule(damaged, pack)).toThrow("ROSTER_SEASON_SCHEDULE_MISMATCH");
    const changed = structuredClone(pack);
    changed.world.players[0]!.name = "Changed";
    expect(() => validateRosterSeasonSchedule(schedule, changed)).toThrow();
    expect(() => generateRosterSeasonSchedule(roster(7), request)).toThrow("ROSTER_SEASON_REQUIRES_EIGHT_TEAMS_AND_GROUNDS");
  });
});
