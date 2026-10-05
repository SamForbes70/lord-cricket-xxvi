import { describe, expect, test } from "vitest";
import {
  CareerDayStateV2Schema,
  CareerTrainingPolicySchema,
  SetTrainingDirectiveRequestSchema,
} from "@lcxxvi/contracts";
import {
  FROZEN_WORLD_PINS,
  T20_CAREER_TRAINING_POLICY,
  T20_LEAGUE_COMPETITION,
} from "@lcxxvi/data";
import {
  advanceCareerDayV2,
  applyMatchConditionDelta,
  applyMatchConditionDeltaV2,
  createCareerDayState,
  createCareerDayStateV2,
  generateSeasonSchedule,
  migrateCareerDayStateV1ToV2,
  projectSquadTrainingCondition,
  setTrainingDirective,
  validateCareerDayStateV2,
} from "@lcxxvi/simulation";

const teamIds = [...T20_LEAGUE_COMPETITION.teamIds];
const groundIds = [...T20_LEAGUE_COMPETITION.groundIds];
const homeGroundIds = { ...T20_LEAGUE_COMPETITION.homeGroundIds };

function schedule(startDate = "2027-01-03") {
  return generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
    seasonId: "season-01",
    gameId: "career-training-01",
    competitionId: "LC_T20_LEAGUE_01",
    worldPackId: "fictional-eight-01",
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    seasonSeed: "season-training-seed-01",
    startDate,
    teamIds,
    groundIds,
    homeGroundIds,
  });
}

function directive(state: ReturnType<typeof createCareerDayStateV2>, playerId: string, value: "REST" | "BATTING_PRACTICE" | "BOWLING_PRACTICE" | "FIELDING_PRACTICE") {
  return setTrainingDirective(state, SetTrainingDirectiveRequestSchema.parse({
    command: "SET_TRAINING_DIRECTIVE",
    playerId,
    directive: value,
    effectiveDate: state.currentDate,
    expectedRevision: state.revision,
  })).state;
}

function readiness(state: ReturnType<typeof createCareerDayStateV2>, playerId: string) {
  return state.playerReadiness.find((entry) => entry.playerId === playerId)!;
}

function fatigue(state: ReturnType<typeof createCareerDayStateV2>, playerId: string) {
  return state.playerConditions.find((entry) => entry.playerId === playerId)!.fatigueBp;
}

describe("Pass 12C training and recovery directives", () => {
  test("creates V2 state with zero readiness and REST for all 160 players", () => {
    const state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    expect(CareerDayStateV2Schema.parse(state)).toEqual(state);
    expect(validateCareerDayStateV2(state)).toEqual(state);
    expect(state.careerStateVersion).toBe("LC_T20_CAREER_DAY_STATE_V2");
    expect(state.trainingPolicyVersion).toBe("LC_T20_CAREER_TRAINING_V1");
    expect(state.playerReadiness).toHaveLength(160);
    expect(state.trainingAssignments).toHaveLength(160);
    expect(state.playerReadiness.every((entry) => entry.batting === 0 && entry.bowling === 0 && entry.fielding === 0)).toBe(true);
    expect(state.trainingAssignments.every((entry) => entry.directive === "REST")).toBe(true);
    expect(CareerTrainingPolicySchema.parse(T20_CAREER_TRAINING_POLICY).noPermanentAttributeGrowth).toBe(true);
  });

  test("migrates V1 to V2 deterministically without altering V1 condition data", () => {
    const seasonSchedule = schedule();
    let v1 = createCareerDayState({ careerId: "career-training-01", schedule: seasonSchedule });
    const fixture = seasonSchedule.fixtures[0]!;
    v1 = applyMatchConditionDelta(v1, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: `complete-${fixture.matchId}`,
      matchId: fixture.matchId,
      matchDayDate: v1.currentDate,
      playerFatigueDeltaBp: { p001: 3500 },
    }, seasonSchedule);
    const a = migrateCareerDayStateV1ToV2(v1);
    const b = migrateCareerDayStateV1ToV2(v1);
    expect(a).toEqual(b);
    expect(a.revision).toBe(v1.revision);
    expect(fatigue(a, "p001")).toBe(3500);
    expect(a.appliedMatchConditions).toEqual(v1.appliedMatchConditions);
    expect(readiness(a, "p001")).toMatchObject({ batting: 0, bowling: 0, fielding: 0 });
  });

  test("sets one directive with optimistic revision checks and idempotent no-op repeats", () => {
    const state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    const changed = setTrainingDirective(state, {
      command: "SET_TRAINING_DIRECTIVE",
      playerId: "p001",
      directive: "BATTING_PRACTICE",
      effectiveDate: state.currentDate,
      expectedRevision: state.revision,
    });
    expect(changed.receipt).toMatchObject({ previousDirective: "REST", directive: "BATTING_PRACTICE", changed: true, revision: 1 });
    const repeat = setTrainingDirective(changed.state, {
      command: "SET_TRAINING_DIRECTIVE",
      playerId: "p001",
      directive: "BATTING_PRACTICE",
      effectiveDate: changed.state.currentDate,
      expectedRevision: changed.state.revision,
    });
    expect(repeat.receipt.changed).toBe(false);
    expect(repeat.state).toEqual(changed.state);
    expect(() => setTrainingDirective(changed.state, {
      command: "SET_TRAINING_DIRECTIVE",
      playerId: "p002",
      directive: "BOWLING_PRACTICE",
      effectiveDate: changed.state.currentDate,
      expectedRevision: 0,
    })).toThrow(/TRAINING_DIRECTIVE_STALE_REVISION/);
    expect(() => setTrainingDirective(changed.state, {
      command: "SET_TRAINING_DIRECTIVE",
      playerId: "p002",
      directive: "BOWLING_PRACTICE",
      effectiveDate: "2027-01-04",
      expectedRevision: changed.state.revision,
    })).toThrow(/TRAINING_DIRECTIVE_DATE_MISMATCH/);
  });

  test("uses 2000 bp REST recovery and 1400 bp practice recovery on the same elapsed day", () => {
    const seasonSchedule = schedule();
    let state = createCareerDayStateV2({ careerId: "career-training-01", schedule: seasonSchedule });
    const fixture = seasonSchedule.fixtures[0]!;
    state = applyMatchConditionDeltaV2(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: `complete-${fixture.matchId}`,
      matchId: fixture.matchId,
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p001: 3500, p002: 3500 },
    }, seasonSchedule);
    state = directive(state, "p001", "BATTING_PRACTICE");
    const advanced = advanceCareerDayV2(state);
    expect(fatigue(advanced.state, "p001")).toBe(2100);
    expect(fatigue(advanced.state, "p002")).toBe(1500);
    expect(advanced.receipt).toMatchObject({ restPlayers: 159, practicePlayers: 1, restRecoveryPerPlayerBp: 2000, practiceRecoveryPerPlayerBp: 1400 });
  });

  test("practice raises only its readiness area by one and caps at +3", () => {
    let state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    state = directive(state, "p001", "BATTING_PRACTICE");
    for (let day = 0; day < 4; day += 1) state = advanceCareerDayV2(state).state;
    expect(readiness(state, "p001")).toMatchObject({ batting: 3, bowling: 0, fielding: 0 });
  });

  test("switching practice areas decays the old readiness one point toward zero", () => {
    let state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    state = directive(state, "p001", "BATTING_PRACTICE");
    state = advanceCareerDayV2(state).state;
    state = advanceCareerDayV2(state).state;
    expect(readiness(state, "p001").batting).toBe(2);
    state = directive(state, "p001", "BOWLING_PRACTICE");
    state = advanceCareerDayV2(state).state;
    expect(readiness(state, "p001")).toMatchObject({ batting: 1, bowling: 1, fielding: 0 });
    state = directive(state, "p001", "REST");
    state = advanceCareerDayV2(state).state;
    expect(readiness(state, "p001")).toMatchObject({ batting: 0, bowling: 0, fielding: 0 });
  });

  test("fielding and bowling practice remain independent across different players", () => {
    let state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    state = directive(state, "p003", "FIELDING_PRACTICE");
    state = directive(state, "p004", "BOWLING_PRACTICE");
    state = advanceCareerDayV2(state).state;
    expect(readiness(state, "p003")).toMatchObject({ batting: 0, bowling: 0, fielding: 1 });
    expect(readiness(state, "p004")).toMatchObject({ batting: 0, bowling: 1, fielding: 0 });
  });

  test("training projection combines fatigue, availability, directive and readiness without changing base skills", () => {
    let state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    state = directive(state, "p001", "BATTING_PRACTICE");
    state = advanceCareerDayV2(state).state;
    const view = projectSquadTrainingCondition(state, "team-01");
    expect(view.players[0]).toMatchObject({
      playerId: "p001",
      availability: "AVAILABLE",
      directive: "BATTING_PRACTICE",
      battingReadiness: 1,
      bowlingReadiness: 0,
      fieldingReadiness: 0,
    });
    expect(Object.keys(view.players[0]!)).not.toContain("skills");
  });

  test("V2 match fatigue stays exactly-once and does not mutate readiness", () => {
    const seasonSchedule = schedule();
    let state = createCareerDayStateV2({ careerId: "career-training-01", schedule: seasonSchedule });
    state = directive(state, "p001", "BATTING_PRACTICE");
    const fixture = seasonSchedule.fixtures[0]!;
    const delta = {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1" as const,
      matchCompletionKey: `complete-${fixture.matchId}`,
      matchId: fixture.matchId,
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p001: 1200 },
    };
    const once = applyMatchConditionDeltaV2(state, delta, seasonSchedule);
    const twice = applyMatchConditionDeltaV2(once, delta, seasonSchedule);
    expect(twice).toEqual(once);
    expect(readiness(once, "p001")).toMatchObject({ batting: 0, bowling: 0, fielding: 0 });
    expect(fatigue(once, "p001")).toBe(1200);
  });

  test("detects V2 state tampering and preserves the bounded season date", () => {
    const state = createCareerDayStateV2({ careerId: "career-training-01", schedule: schedule() });
    const tampered = structuredClone(state);
    tampered.playerReadiness[0]!.batting = 1;
    expect(() => validateCareerDayStateV2(tampered)).toThrow(/V2_STATE_HASH_MISMATCH/);
    let end = state;
    while (end.currentDate < end.finalScheduledDate) end = advanceCareerDayV2(end).state;
    expect(() => advanceCareerDayV2(end)).toThrow(/V2_SEASON_DATE_LIMIT_REACHED/);
  });
});
