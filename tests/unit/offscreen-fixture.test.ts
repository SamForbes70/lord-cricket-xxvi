import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  CareerAvailabilityPackSchema,
  OffscreenFixtureOutcomeSchema,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  FROZEN_WORLD_PINS,
  T20_LEAGUE_COMPETITION,
  T20_OFFSCREEN_FIXTURE_POLICY,
} from "@lcxxvi/data";
import {
  conditionDeltaFromCompletedT20Session,
  createCareerDayStateV2,
  generateSeasonSchedule,
  resimulateT20Commands,
  replayT20Events,
  selectOffscreenFixtureTeams,
  simulateOffscreenFixture,
  simulateOffscreenRound,
  validateOffscreenFixtureOutcome,
  validateOffscreenRoundExecution,
} from "@lcxxvi/simulation";

const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

function schedule() {
  return generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
    seasonId: "season-offscreen-01",
    gameId: "career-offscreen-01",
    competitionId: "LC_T20_LEAGUE_01",
    worldPackId: "fictional-eight-01",
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    seasonSeed: "season-offscreen-seed-01",
    startDate: "2027-01-03",
    teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
    groundIds: [...T20_LEAGUE_COMPETITION.groundIds],
    homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
  });
}

function baseline() {
  const seasonSchedule = schedule();
  const careerState = createCareerDayStateV2({ careerId: "career-offscreen-01", schedule: seasonSchedule });
  return { seasonSchedule, careerState };
}

describe("Pass 12D deterministic off-screen T20 fixture execution", () => {
  test("pins one transparent baseline policy and never substitutes a second match simulator", () => {
    expect(T20_OFFSCREEN_FIXTURE_POLICY).toMatchObject({
      executionVersion: "LC_T20_OFFSCREEN_FIXTURE_V1",
      selectionPolicyId: "LC_SEASON_XI_BASELINE_V1",
      captainPolicyId: "LC_FIXTURE_CAPTAIN_V1",
      conditionDeltaPolicyId: "LC_ENGINE_FINAL_FATIGUE_DELTA_V1",
      matchEngineVersion: "LC_T20_MATCH_V1",
      noFutureRandomAccess: true,
      noAlternateMatchSimulator: true,
    });
  });

  test("runs a scheduled fixture through LC_T20_MATCH_V1 and applies engine fatigue exactly once", () => {
    const { seasonSchedule, careerState } = baseline();
    const fixture = seasonSchedule.fixtures[0]!;
    const simulated = simulateOffscreenFixture({
      schedule: seasonSchedule,
      careerState,
      fixtureId: fixture.fixtureId,
      worldBytes,
      worldManifest,
    });
    expect(OffscreenFixtureOutcomeSchema.parse(simulated.outcome)).toEqual(simulated.outcome);
    expect(validateOffscreenFixtureOutcome(simulated.outcome)).toEqual(simulated.outcome);
    expect(simulated.session.executionManifest.engine).toBe("LC_T20_MATCH_V1");
    expect(simulated.session.core.phase).toBe("COMPLETE");
    expect(simulated.outcome.scorecard.result).toEqual(simulated.session.core.result);
    expect(simulated.outcome.careerRevisionAfter).toBe(simulated.outcome.careerRevisionBefore + 1);
    expect(simulated.careerState.appliedMatchConditions).toHaveLength(1);
    expect(simulated.careerState.appliedMatchConditions[0]!.matchId).toBe(fixture.matchId);
    expect(Object.values(simulated.outcome.conditionDelta.playerFatigueDeltaBp).every((value) => value > 0)).toBe(true);
  });

  test("shared XI and condition helpers reproduce the accepted off-screen fixture outcome", () => {
    const { seasonSchedule, careerState } = baseline();
    const fixture = seasonSchedule.fixtures[0]!;
    const selected = selectOffscreenFixtureTeams({
      schedule: seasonSchedule,
      careerState,
      fixtureId: fixture.fixtureId,
      worldBytes,
      worldManifest,
    });
    const simulated = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest });
    expect(selected).toEqual(simulated.outcome.selectedTeams);
    expect(conditionDeltaFromCompletedT20Session({
      seasonId: seasonSchedule.seasonId,
      fixtureId: fixture.fixtureId,
      matchId: fixture.matchId,
      matchDayDate: fixture.matchDayDate,
      session: simulated.session,
    })).toEqual(simulated.outcome.conditionDelta);
  });

  test("replay and command resimulation remain exact for an off-screen fixture", () => {
    const { seasonSchedule, careerState } = baseline();
    const fixture = seasonSchedule.fixtures[0]!;
    const simulated = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest });
    const replay = replayT20Events(simulated.session.setup, simulated.session.events, simulated.outcome.eventChain);
    expect(replay.lastEventHash).toBe(simulated.session.lastEventHash);
    expect(() => resimulateT20Commands(simulated.session)).not.toThrow();
  });

  test("uses manual availability when selecting the XI and falls back to the second keeper", () => {
    const seasonSchedule = schedule();
    const pack = CareerAvailabilityPackSchema.parse({
      ...DEFAULT_CAREER_AVAILABILITY_PACK,
      packId: "availability-offscreen-test",
      entries: [{
        playerId: "p001",
        startDate: "2027-01-03",
        endDate: "2027-01-03",
        reason: "Fixture-pack absence",
        source: "MANUAL_FIXTURE_PACK",
      }],
    });
    const careerState = createCareerDayStateV2({ careerId: "career-offscreen-availability", schedule: seasonSchedule, availabilityPack: pack });
    const fixture = seasonSchedule.fixtures.find((entry) => entry.homeTeamId === "team-01" || entry.awayTeamId === "team-01")!;
    const simulated = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, availabilityPack: pack, fixtureId: fixture.fixtureId, worldBytes, worldManifest });
    const selection = simulated.outcome.selectedTeams.find((team) => team.teamId === "team-01")!;
    expect(selection.playerIds).not.toContain("p001");
    expect(selection.keeperId).toBe("p002");
    expect(selection.playerIds).toHaveLength(11);
  });

  test("round execution sorts fixture IDs and is batch-order independent by construction", () => {
    const { seasonSchedule, careerState } = baseline();
    const round = simulateOffscreenRound({ schedule: seasonSchedule, careerState, roundNumber: 1, worldBytes, worldManifest });
    expect(validateOffscreenRoundExecution(round.result)).toEqual(round.result);
    expect(round.result.executedFixtureIds).toEqual([...round.result.executedFixtureIds].sort());
    expect(round.result.outcomes).toHaveLength(4);
    expect(round.careerState.appliedMatchConditions).toHaveLength(4);

    const first = round.result.outcomes[0]!;
    const individual = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, fixtureId: first.fixtureId, worldBytes, worldManifest });
    expect(individual.outcome.scorecardSha256).toBe(first.scorecardSha256);
    expect(individual.outcome.eventLogSha256).toBe(first.eventLogSha256);
    expect(individual.outcome.commandLogSha256).toBe(first.commandLogSha256);
  }, 30_000);

  test("can pause before the user's fixture while simulating the other three matches", () => {
    const { seasonSchedule, careerState } = baseline();
    const round = simulateOffscreenRound({
      schedule: seasonSchedule,
      careerState,
      roundNumber: 1,
      userTeamId: "team-01",
      worldBytes,
      worldManifest,
    });
    expect(round.result.outcomes).toHaveLength(3);
    expect(round.result.skippedUserFixtureId).not.toBeNull();
    const skipped = seasonSchedule.fixtures.find((fixture) => fixture.fixtureId === round.result.skippedUserFixtureId)!;
    expect([skipped.homeTeamId, skipped.awayTeamId]).toContain("team-01");
    expect(round.result.outcomes.every((outcome) => ![outcome.homeTeamId, outcome.awayTeamId].includes("team-01"))).toBe(true);
  }, 30_000);

  test("rejects duplicate fixture execution, wrong career date and insufficient availability", () => {
    const { seasonSchedule, careerState } = baseline();
    const fixture = seasonSchedule.fixtures[0]!;
    const once = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest });
    expect(() => simulateOffscreenFixture({ schedule: seasonSchedule, careerState: once.careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest }))
      .toThrow(/FIXTURE_ALREADY_APPLIED/);

    const wrongDate = structuredClone(careerState);
    wrongDate.currentDate = "2027-01-04";
    for (const condition of wrongDate.playerConditions) condition.lastUpdatedDate = "2027-01-04";
    for (const readiness of wrongDate.playerReadiness) readiness.lastUpdatedDate = "2027-01-04";
    expect(() => simulateOffscreenFixture({ schedule: seasonSchedule, careerState: wrongDate, fixtureId: fixture.fixtureId, worldBytes, worldManifest }))
      .toThrow();

    const teamId = fixture.homeTeamId;
    const squadStart = (Number(teamId.slice(-2)) - 1) * 20 + 1;
    const entries = Array.from({ length: 10 }, (_, offset) => ({
      playerId: `p${String(squadStart + offset).padStart(3, "0")}`,
      startDate: fixture.matchDayDate,
      endDate: fixture.matchDayDate,
      reason: "Fixture-pack absence",
      source: "MANUAL_FIXTURE_PACK" as const,
    }));
    const pack = CareerAvailabilityPackSchema.parse({
      availabilityVersion: "LC_T20_AVAILABILITY_PACK_V1",
      packId: "availability-insufficient-test",
      worldPackId: "fictional-eight-01",
      worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
      entries,
    });
    const limited = createCareerDayStateV2({ careerId: "career-offscreen-limited", schedule: seasonSchedule, availabilityPack: pack });
    expect(() => simulateOffscreenFixture({ schedule: seasonSchedule, careerState: limited, availabilityPack: pack, fixtureId: fixture.fixtureId, worldBytes, worldManifest }))
      .toThrow(/INSUFFICIENT_AVAILABLE_PLAYERS|NO_AVAILABLE_KEEPER|INSUFFICIENT_AVAILABLE_BOWLERS/);
  });

  test("detects outcome tampering through the canonical outcome hash", () => {
    const { seasonSchedule, careerState } = baseline();
    const fixture = seasonSchedule.fixtures[0]!;
    const simulated = simulateOffscreenFixture({ schedule: seasonSchedule, careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest });
    const tampered = structuredClone(simulated.outcome);
    tampered.scorecard.innings[0]!.runs += 1;
    expect(() => validateOffscreenFixtureOutcome(tampered)).toThrow(/OUTCOME_HASH_MISMATCH|OUTCOME_SCORECARD_HASH/);
  });
});
