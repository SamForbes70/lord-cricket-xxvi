import { describe, expect, it } from "vitest";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { advanceRosterCareerDay, applyRosterMatchCondition, createRosterCareerDayState, createStagedRosterPack, generateRosterSeasonSchedule, setRosterTrainingDirective, validateRosterCareerDayState } from "@lcxxvi/simulation";

function setup() {
  const players = world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
  const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "career", world: { ...world, players } }), world.rulesIds, ["stock"]);
  const schedule = generateRosterSeasonSchedule(pack, { seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
  return { pack, schedule, state: createRosterCareerDayState("career", schedule, pack) };
}

describe("roster career conditions", () => {
  it("keeps training and day advancement bound to the roster", () => {
    const { pack, schedule, state } = setup();
    const playerId = state.trainingAssignments[0]!.playerId;
    const trained = setRosterTrainingDirective(state, { command: "SET_TRAINING_DIRECTIVE", playerId, directive: "BATTING_PRACTICE", effectiveDate: state.currentDate, expectedRevision: 0 }, schedule, pack);
    expect(trained.revision).toBe(1);
    const next = advanceRosterCareerDay(trained, schedule, pack);
    expect(next.currentDate).toBe("2027-01-04");
    expect(next.playerReadiness.find(player => player.playerId === playerId)?.batting).toBe(1);
    expect(() => setRosterTrainingDirective(next, { command: "SET_TRAINING_DIRECTIVE", playerId, directive: "REST", effectiveDate: next.currentDate, expectedRevision: 0 }, schedule, pack)).toThrow("ROSTER_CAREER_STALE_TRAINING");
    const damaged = structuredClone(next); damaged.playerConditions[0]!.fatigueBp = 5;
    expect(() => validateRosterCareerDayState(damaged, schedule, pack)).toThrow("ROSTER_CAREER_STATE_MISMATCH");
  });
  it("applies a fixture condition once and rejects players from another team", () => {
    const { pack, schedule, state } = setup();
    const fixture = schedule.fixtures[0]!;
    const team = pack.world.teams.find(item => item.teamId === fixture.homeTeamId)!;
    const other = pack.world.teams.find(item => item.teamId !== fixture.homeTeamId && item.teamId !== fixture.awayTeamId)!;
    const delta = { deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1", matchCompletionKey: "completion", matchId: fixture.matchId, matchDayDate: fixture.matchDayDate, playerFatigueDeltaBp: { [team.squadIds[0]!]: 300 } };
    const after = applyRosterMatchCondition(state, delta, schedule, pack);
    expect(after.playerConditions.find(item => item.playerId === team.squadIds[0])?.fatigueBp).toBe(300);
    expect(applyRosterMatchCondition(after, delta, schedule, pack)).toEqual(after);
    expect(() => applyRosterMatchCondition(state, { ...delta, playerFatigueDeltaBp: { [other.squadIds[0]!]: 300 } }, schedule, pack)).toThrow("ROSTER_CAREER_FIXTURE_PLAYER_MISMATCH");
    expect(() => applyRosterMatchCondition(after, { ...delta, playerFatigueDeltaBp: { [team.squadIds[0]!]: 301 } }, schedule, pack)).toThrow("ROSTER_CAREER_MATCH_CONFLICT");
  });
});
