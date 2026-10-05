import { describe, expect, test } from "vitest";
import {
  CareerDayStateSchema,
  CareerAvailabilityPackSchema,
  MatchConditionDeltaSchema,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  FICTIONAL_EIGHT_PLAYER_IDS,
  FICTIONAL_EIGHT_TEAM_ROSTERS,
  FROZEN_WORLD_PINS,
  T20_LEAGUE_COMPETITION,
} from "@lcxxvi/data";
import {
  advanceCareerDay,
  applyMatchConditionDelta,
  createCareerDayState,
  generateSeasonSchedule,
  projectSquadCondition,
  validateCareerAvailabilityPack,
  validateCareerDayState,
} from "@lcxxvi/simulation";

const teamIds = [...T20_LEAGUE_COMPETITION.teamIds];
const groundIds = [...T20_LEAGUE_COMPETITION.groundIds];
const homeGroundIds = { ...T20_LEAGUE_COMPETITION.homeGroundIds };

function schedule(startDate = "2027-01-03") {
  return generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
    seasonId: "season-01",
    gameId: "career-01",
    competitionId: "LC_T20_LEAGUE_01",
    worldPackId: "fictional-eight-01",
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    seasonSeed: "season-seed-01",
    startDate,
    teamIds,
    groundIds,
    homeGroundIds,
  });
}

function manualAvailability() {
  return CareerAvailabilityPackSchema.parse({
    availabilityVersion: "LC_T20_AVAILABILITY_PACK_V1",
    packId: "test-availability-v1",
    worldPackId: "fictional-eight-01",
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    entries: [
      {
        playerId: "p001",
        startDate: "2027-01-04",
        endDate: "2027-01-06",
        reason: "Manual fixture-pack absence",
        source: "MANUAL_FIXTURE_PACK",
      },
    ],
  });
}

describe("Pass 12B career-day and condition state", () => {
  test("creates a hash-validated 160-player zero-fatigue career bound to the schedule", () => {
    const s = createCareerDayState({ careerId: "career-01", schedule: schedule() });
    expect(CareerDayStateSchema.parse(s)).toEqual(s);
    expect(validateCareerDayState(s)).toEqual(s);
    expect(s.currentDate).toBe("2027-01-03");
    expect(s.finalScheduledDate).toBe("2027-02-11");
    expect(s.scheduleSha256).toBe(schedule().scheduleSha256);
    expect(s.playerConditions).toHaveLength(160);
    expect(s.playerConditions.map((p) => p.playerId)).toEqual(FICTIONAL_EIGHT_PLAYER_IDS);
    expect(s.playerConditions.every((p) => p.fatigueBp === 0 && p.lastUpdatedDate === s.currentDate)).toBe(true);
    expect(s.appliedMatchConditions).toEqual([]);
    expect(s.availabilityPackId).toBe(DEFAULT_CAREER_AVAILABILITY_PACK.packId);
  });

  test("applies match fatigue exactly once and rejects conflicting completion identities", () => {
    const seasonSchedule = schedule();
    const base = createCareerDayState({ careerId: "career-01", schedule: seasonSchedule });
    const fixture = seasonSchedule.fixtures[0]!;
    const delta = MatchConditionDeltaSchema.parse({
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: `complete-${fixture.matchId}`,
      matchId: fixture.matchId,
      matchDayDate: base.currentDate,
      playerFatigueDeltaBp: { p001: 3500, p002: 1200, p141: 10000 },
    });
    const once = applyMatchConditionDelta(base, delta, seasonSchedule);
    expect(once.revision).toBe(1);
    expect(once.playerConditions.find((p) => p.playerId === "p001")?.fatigueBp).toBe(3500);
    expect(once.playerConditions.find((p) => p.playerId === "p141")?.fatigueBp).toBe(10000);
    const twice = applyMatchConditionDelta(once, delta, seasonSchedule);
    expect(twice).toEqual(once);
    expect(() => applyMatchConditionDelta(once, {
      ...delta,
      playerFatigueDeltaBp: { ...delta.playerFatigueDeltaBp, p001: 3501 },
    }, seasonSchedule)).toThrow(/MATCH_COMPLETION_KEY_CONFLICT/);
    expect(() => applyMatchConditionDelta(once, {
      ...delta,
      matchCompletionKey: "different-key",
    }, seasonSchedule)).toThrow(/MATCH_ID_ALREADY_APPLIED/);
  });

  test("recovers 2000 fatigue basis points per elapsed rest day with clamping", () => {
    const seasonSchedule = schedule();
    let state = createCareerDayState({ careerId: "career-01", schedule: seasonSchedule });
    const fixture = seasonSchedule.fixtures[0]!;
    state = applyMatchConditionDelta(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: `complete-${fixture.matchId}`,
      matchId: fixture.matchId,
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p001: 3500, p002: 1200 },
    }, seasonSchedule);
    const first = advanceCareerDay(state);
    expect(first.state.currentDate).toBe("2027-01-04");
    expect(first.receipt.recoveryPerPlayerBp).toBe(2000);
    expect(first.receipt.recoveredPlayers).toBe(2);
    expect(first.state.playerConditions.find((p) => p.playerId === "p001")?.fatigueBp).toBe(1500);
    expect(first.state.playerConditions.find((p) => p.playerId === "p002")?.fatigueBp).toBe(0);
    const second = advanceCareerDay(first.state);
    expect(second.state.playerConditions.find((p) => p.playerId === "p001")?.fatigueBp).toBe(0);
    expect(second.state.playerConditions.every((p) => p.lastUpdatedDate === "2027-01-05")).toBe(true);
  });

  test("uses pure Gregorian career dates across leap days and year boundaries", () => {
    let leap = createCareerDayState({ careerId: "career-leap", schedule: schedule("2028-02-28") });
    leap = advanceCareerDay(leap).state;
    expect(leap.currentDate).toBe("2028-02-29");
    leap = advanceCareerDay(leap).state;
    expect(leap.currentDate).toBe("2028-03-01");

    let year = createCareerDayState({ careerId: "career-year", schedule: schedule("2027-12-31") });
    year = advanceCareerDay(year).state;
    expect(year.currentDate).toBe("2028-01-01");
  });

  test("projects manual availability inclusively without inventing injuries", () => {
    const pack = manualAvailability();
    let state = createCareerDayState({ careerId: "career-01", schedule: schedule(), availabilityPack: pack });
    expect(projectSquadCondition(state, "team-01", pack).players[0]).toMatchObject({
      playerId: "p001",
      availability: "AVAILABLE",
      availabilityReason: null,
    });
    state = advanceCareerDay(state).state;
    const during = projectSquadCondition(state, "team-01", pack).players[0]!;
    expect(during.availability).toBe("UNAVAILABLE");
    expect(during.availabilityReason).toBe("Manual fixture-pack absence");
    expect(during.unavailableThrough).toBe("2027-01-06");
    state = advanceCareerDay(advanceCareerDay(advanceCareerDay(state).state).state).state;
    expect(state.currentDate).toBe("2027-01-07");
    expect(projectSquadCondition(state, "team-01", pack).players[0]?.availability).toBe("AVAILABLE");
    expect("injury" in during).toBe(false);
  });

  test("validates the exact eight frozen 20-player rosters", () => {
    expect(Object.keys(FICTIONAL_EIGHT_TEAM_ROSTERS)).toEqual(teamIds);
    expect(Object.values(FICTIONAL_EIGHT_TEAM_ROSTERS).every((roster) => roster.length === 20)).toBe(true);
    expect(new Set(Object.values(FICTIONAL_EIGHT_TEAM_ROSTERS).flat()).size).toBe(160);
  });

  test("rejects bad availability references, ranges and overlaps", () => {
    expect(() => validateCareerAvailabilityPack({
      ...manualAvailability(),
      entries: [{ ...manualAvailability().entries[0], playerId: "p999" }],
    })).toThrow(/UNKNOWN_AVAILABILITY_PLAYER/);
    expect(() => validateCareerAvailabilityPack({
      ...manualAvailability(),
      entries: [{ ...manualAvailability().entries[0], startDate: "2027-01-07", endDate: "2027-01-06" }],
    })).toThrow(/INVALID_AVAILABILITY_RANGE/);
    expect(() => validateCareerAvailabilityPack({
      ...manualAvailability(),
      entries: [
        manualAvailability().entries[0],
        { ...manualAvailability().entries[0], startDate: "2027-01-06", endDate: "2027-01-08" },
      ],
    })).toThrow(/OVERLAPPING_AVAILABILITY/);
  });

  test("rejects unscheduled, wrong-date and non-fixture player condition deltas", () => {
    const seasonSchedule = schedule();
    const state = createCareerDayState({ careerId: "career-01", schedule: seasonSchedule });
    const fixture = seasonSchedule.fixtures[0]!;
    expect(() => applyMatchConditionDelta(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: "complete-wrong-date",
      matchId: fixture.matchId,
      matchDayDate: "2027-01-04",
      playerFatigueDeltaBp: { p001: 100 },
    }, seasonSchedule)).toThrow(/MATCH_DELTA_NOT_CURRENT_CAREER_DATE/);
    expect(() => applyMatchConditionDelta(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: "complete-unknown-match",
      matchId: "not-a-scheduled-match",
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p001: 100 },
    }, seasonSchedule)).toThrow(/MATCH_DELTA_UNKNOWN_SCHEDULE_MATCH/);
    expect(() => applyMatchConditionDelta(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: "complete-unknown-player",
      matchId: fixture.matchId,
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p999: 100 },
    }, seasonSchedule)).toThrow(/UNKNOWN_MATCH_DELTA_PLAYER/);
    expect(() => applyMatchConditionDelta(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: "complete-wrong-team",
      matchId: fixture.matchId,
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p021: 100 },
    }, seasonSchedule)).toThrow(/MATCH_DELTA_PLAYER_NOT_IN_FIXTURE/);
    const alternateSchedule = generateSeasonSchedule({
      scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
      seasonId: "season-01",
      gameId: "career-01",
      competitionId: "LC_T20_LEAGUE_01",
      worldPackId: "fictional-eight-01",
      worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
      seasonSeed: "alternate-season-seed",
      startDate: "2027-01-03",
      teamIds,
      groundIds,
      homeGroundIds,
    });
    expect(() => applyMatchConditionDelta(state, {
      deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
      matchCompletionKey: "complete-wrong-schedule",
      matchId: fixture.matchId,
      matchDayDate: state.currentDate,
      playerFatigueDeltaBp: { p001: 100 },
    }, alternateSchedule)).toThrow(/MATCH_DELTA_SCHEDULE_HASH_MISMATCH/);
  });

  test("detects state tampering and refuses to advance beyond the bounded season", () => {
    const initial = createCareerDayState({ careerId: "career-01", schedule: schedule() });
    const tampered = structuredClone(initial);
    tampered.playerConditions[0]!.fatigueBp = 1;
    expect(() => validateCareerDayState(tampered)).toThrow(/STATE_HASH_MISMATCH/);

    let state = initial;
    while (state.currentDate < state.finalScheduledDate) state = advanceCareerDay(state).state;
    expect(state.currentDate).toBe("2027-02-11");
    expect(() => advanceCareerDay(state)).toThrow(/SEASON_DATE_LIMIT_REACHED/);
  });
});
