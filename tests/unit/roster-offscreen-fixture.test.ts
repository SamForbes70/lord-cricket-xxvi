import { describe, expect, it } from "vitest";
import { applyRosterSeasonCompletion, createRosterSeasonProjection, rosterCompletionFromOffscreen, validateRosterSeasonProjection } from "@lcxxvi/projections";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { createRosterCareerDayState, createStagedRosterPack, generateRosterSeasonSchedule, simulateRosterOffscreenFixture, validateRosterOffscreenFixtureOutcome } from "@lcxxvi/simulation";

describe("roster off-screen fixture", () => {
  it("runs a roster-backed match and applies its condition delta once", () => {
    const players = world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
    const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "offscreen", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const schedule = generateRosterSeasonSchedule(pack, { seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const state = createRosterCareerDayState("career", schedule, pack);
    const fixture = schedule.fixtures[0]!;
    const played = simulateRosterOffscreenFixture(pack, schedule, state, fixture.fixtureId);
    expect(played.session.core.phase).toBe("COMPLETE");
    expect(played.outcome.executionVersion).toBe("LC_T20_ROSTER_OFFSCREEN_FIXTURE_V2");
    expect(played.outcome.engineManifest.engine).toBe("LC_T20_MATCH_ROSTER_V2");
    expect(played.careerState.appliedMatchConditions).toHaveLength(1);
    expect(validateRosterOffscreenFixtureOutcome(played.outcome)).toEqual(played.outcome);
    const invalidOutcome = structuredClone(played.outcome); invalidOutcome.scorecard.innings[0]!.runs += 1;
    expect(() => validateRosterOffscreenFixtureOutcome(invalidOutcome)).toThrow("ROSTER_OFFSCREEN_OUTCOME_MISMATCH");
    const completion = rosterCompletionFromOffscreen(schedule, played.outcome);
    const initial = createRosterSeasonProjection(schedule);
    const projected = applyRosterSeasonCompletion(initial, schedule, completion);
    expect(projected.revision).toBe(1);
    expect(validateRosterSeasonProjection(projected, schedule)).toEqual(projected);
    const damagedProjection = structuredClone(projected); damagedProjection.table[0]!.points += 1;
    expect(() => validateRosterSeasonProjection(damagedProjection, schedule)).toThrow("ROSTER_PROJECTION_STATE_MISMATCH");
    expect(projected.table.reduce((sum, row) => sum + row.played, 0)).toBe(2);
    expect(projected.players).toHaveLength(22);
    expect(applyRosterSeasonCompletion(projected, schedule, completion)).toEqual(projected);
    expect(() => applyRosterSeasonCompletion(projected, schedule, { ...completion, sourceCompletionSha256: "0".repeat(64) })).toThrow("ROSTER_COMPLETION_CONFLICT");
    const selected = played.session.setup.teams[0].xi[0]!;
    expect(selected.skills).toEqual(pack.world.players.find(player => player.playerId === selected.playerId)!.skills);
    expect(() => simulateRosterOffscreenFixture(pack, schedule, played.careerState, fixture.fixtureId)).toThrow("ROSTER_OFFSCREEN_FIXTURE_MISMATCH");
    const repeated = simulateRosterOffscreenFixture(pack, schedule, state, fixture.fixtureId);
    expect(repeated.outcome).toEqual(played.outcome);
  }, 30_000);
});
