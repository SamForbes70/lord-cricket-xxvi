import { describe, expect, it } from "vitest";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { createStagedRosterPack } from "@lcxxvi/simulation";
import { createRosterSeason, simulateNextRosterSeasonFixture, validateRosterSeasonState } from "../../apps/web/src/career/roster-season.js";

describe("roster season state", () => {
  it("reconstructs the table and conditions from simulated fixtures", () => {
    const players = world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
    const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "season", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const initial = createRosterSeason(pack, { careerId: "career", controlledTeamId: world.teams[0]!.teamId, seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const first = simulateNextRosterSeasonFixture(initial, pack);
    const second = simulateNextRosterSeasonFixture(first, pack);
    expect(second.outcomes).toHaveLength(2);
    expect(second.projection.table.reduce((sum, row) => sum + row.played, 0)).toBe(4);
    expect(second.careerState.appliedMatchConditions).toHaveLength(2);
    expect(validateRosterSeasonState(JSON.parse(JSON.stringify(second)), pack)).toEqual(second);
    const damaged = structuredClone(second); damaged.outcomes[0]!.scorecard.innings[0]!.runs += 1;
    expect(() => validateRosterSeasonState(damaged, pack)).toThrow("ROSTER_SEASON_STATE_MISMATCH");
    const wrongPack = structuredClone(pack); wrongPack.world.teams[0]!.name = "Altered";
    expect(() => validateRosterSeasonState(second, wrongPack)).toThrow();
  }, 30_000);
});
