import { describe, expect, it } from "vitest";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { createRosterT20Session, createStagedRosterPack, executeRosterT20Command, fixtureAutopilotStep, type T20Session } from "@lcxxvi/simulation";
import { changeRosterSeasonTraining, completeRosterManagedFixture, createRosterSeason, hasAcceptedRosterManagedFixture, prepareRosterManagedFixture, simulateNextRosterSeasonFixture, validateRosterSeasonState } from "../../apps/web/src/career/roster-season.js";

describe("roster season state", () => {
  it("reconstructs the table and conditions from simulated fixtures", () => {
    const players = world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
    const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "season", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const initial = createRosterSeason(pack, { careerId: "career", controlledTeamId: world.teams[0]!.teamId, seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const training = { command: "SET_TRAINING_DIRECTIVE", playerId: world.teams[0]!.squadIds[0]!, directive: "BATTING_PRACTICE", effectiveDate: initial.careerState.currentDate, expectedRevision: 0 };
    const trained = changeRosterSeasonTraining(initial, pack, training);
    expect(trained.revision).toBe(1);
    expect(trained.careerState.trainingAssignments.find(item => item.playerId === training.playerId)?.directive).toBe("BATTING_PRACTICE");
    expect(() => changeRosterSeasonTraining(initial, pack, { ...training, playerId: world.teams[1]!.squadIds[0] })).toThrow("ROSTER_SEASON_PLAYER_NOT_MANAGED");
    expect(() => changeRosterSeasonTraining(trained, pack, training)).toThrow("ROSTER_CAREER_STALE_TRAINING");
    const first = simulateNextRosterSeasonFixture(initial, pack);
    const second = simulateNextRosterSeasonFixture(first, pack);
    expect(second.outcomes).toHaveLength(2);
    expect(second.projection.table.reduce((sum, row) => sum + row.played, 0)).toBe(4);
    expect(second.careerState.appliedMatchConditions).toHaveLength(2);
    expect(validateRosterSeasonState(JSON.parse(JSON.stringify(second)), pack)).toEqual(second);
    const damaged = structuredClone(second); const damagedOutcome = damaged.outcomes[0]!;
    if ("version" in damagedOutcome) throw new Error("Expected an off-screen outcome.");
    damagedOutcome.scorecard.innings[0]!.runs += 1;
    expect(() => validateRosterSeasonState(damaged, pack)).toThrow("ROSTER_SEASON_STATE_MISMATCH");
    const wrongPack = structuredClone(pack); wrongPack.world.teams[0]!.name = "Altered";
    expect(() => validateRosterSeasonState(second, wrongPack)).toThrow();
    const managed = createRosterSeason(pack, { careerId: "managed", controlledTeamId: initial.schedule.fixtures[0]!.homeTeamId, seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const ready = prepareRosterManagedFixture(managed, pack);
    let played = createRosterT20Session(pack, { gameId: `career-match-${ready.fixture.fixtureId}`, matchId: ready.fixture.matchId, seed: ready.fixture.matchSeed, format: "T20", selection: { groundId: ready.fixture.groundId, teams: ready.selections } });
    for (let steps = 0; played.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(1400);
      played = executeRosterT20Command(played, fixtureAutopilotStep(played as unknown as T20Session)).session;
    }
    const finished = completeRosterManagedFixture(managed, pack, played);
    expect(finished.outcomes[0]).toMatchObject({ version: "LC_T20_ROSTER_MANAGED_FIXTURE_V1", completion: { source: "USER_MATCH" } });
    expect(finished.careerState.appliedMatchConditions).toHaveLength(1);
    expect(hasAcceptedRosterManagedFixture(finished, pack, played)).toBe(true);
    const changedSession = structuredClone(played); changedSession.core.phase = "SETUP";
    expect(() => hasAcceptedRosterManagedFixture(finished, pack, changedSession)).toThrow();
    expect(validateRosterSeasonState(JSON.parse(JSON.stringify(finished)), pack)).toEqual(finished);
    expect(() => completeRosterManagedFixture(finished, pack, played)).toThrow();
  }, 90_000);
});
