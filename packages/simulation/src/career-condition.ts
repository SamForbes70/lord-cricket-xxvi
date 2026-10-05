import {
  CareerAdvanceDayReceiptSchema,
  CareerAvailabilityPackSchema,
  CareerDayStateCoreSchema,
  CareerDayStateSchema,
  MatchConditionDeltaSchema,
  SquadConditionViewSchema,
  type CareerAdvanceDayReceipt,
  type CareerAvailabilityPack,
  type CareerDayState,
  type CareerDayStateCore,
  type MatchConditionDelta,
  type SeasonSchedule,
  type SquadConditionView,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  FICTIONAL_EIGHT_PLAYER_IDS,
  FICTIONAL_EIGHT_TEAM_ROSTERS,
  FROZEN_WORLD_PINS,
  T20_CAREER_CONDITION_POLICY,
} from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { validateSeasonSchedule } from "./season-scheduler.js";

const hasher = createStateHasher();
const playerIdSet = new Set(FICTIONAL_EIGHT_PLAYER_IDS);
const playerTeamId = new Map(
  Object.entries(FICTIONAL_EIGHT_TEAM_ROSTERS).flatMap(([teamId, roster]) =>
    roster.map((playerId) => [playerId, teamId] as const),
  ),
);

function fail(code: string): never {
  throw new Error(`INVALID_CAREER_CONDITION: ${code}`);
}
function assertCondition(condition: unknown, code: string): asserts condition {
  if (!condition) fail(code);
}

function addCalendarDays(isoDate: string, days: number): string {
  const [yearText, monthText, dayText] = isoDate.split("-");
  let year = Number(yearText);
  let month = Number(monthText);
  let day = Number(dayText);
  assertCondition(Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day), "INVALID_DATE");
  assertCondition(Number.isInteger(days) && days >= 0, "INVALID_DAY_OFFSET");
  const daysInMonth = (y: number, m: number) => {
    if (m === 2) {
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      return leap ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(m) ? 30 : 31;
  };
  for (let i = 0; i < days; i += 1) {
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function stateCore(state: CareerDayState): CareerDayStateCore {
  const { stateSha256, ...core } = state;
  void stateSha256;
  return CareerDayStateCoreSchema.parse(core);
}

function seal(coreInput: CareerDayStateCore): CareerDayState {
  const core = CareerDayStateCoreSchema.parse(coreInput);
  return CareerDayStateSchema.parse({ ...core, stateSha256: hasher.hash(core) });
}

export function validateCareerAvailabilityPack(input: unknown): CareerAvailabilityPack {
  const pack = CareerAvailabilityPackSchema.parse(input);
  assertCondition(pack.worldPackId === FROZEN_WORLD_PINS.worldPackId, "AVAILABILITY_WORLD_PACK_MISMATCH");
  assertCondition(pack.worldCanonicalSha256 === FROZEN_WORLD_PINS.worldCanonicalSha256, "AVAILABILITY_WORLD_HASH_MISMATCH");
  const byPlayer = new Map<string, Array<{ startDate: string; endDate: string }>>();
  for (const entry of pack.entries) {
    assertCondition(playerIdSet.has(entry.playerId), `UNKNOWN_AVAILABILITY_PLAYER:${entry.playerId}`);
    assertCondition(entry.endDate >= entry.startDate, `INVALID_AVAILABILITY_RANGE:${entry.playerId}`);
    const ranges = byPlayer.get(entry.playerId) ?? [];
    for (const existing of ranges) {
      const disjoint = entry.endDate < existing.startDate || entry.startDate > existing.endDate;
      assertCondition(disjoint, `OVERLAPPING_AVAILABILITY:${entry.playerId}`);
    }
    ranges.push({ startDate: entry.startDate, endDate: entry.endDate });
    byPlayer.set(entry.playerId, ranges);
  }
  return pack;
}

export function validateCareerDayState(input: unknown): CareerDayState {
  const state = CareerDayStateSchema.parse(input);
  const core = stateCore(state);
  assertCondition(hasher.hash(core) === state.stateSha256, "STATE_HASH_MISMATCH");
  assertCondition(state.worldPackId === FROZEN_WORLD_PINS.worldPackId, "WORLD_PACK_MISMATCH");
  assertCondition(state.worldCanonicalSha256 === FROZEN_WORLD_PINS.worldCanonicalSha256, "WORLD_HASH_MISMATCH");
  assertCondition(state.conditionPolicyVersion === T20_CAREER_CONDITION_POLICY.conditionPolicyVersion, "CONDITION_POLICY_MISMATCH");
  assertCondition(state.currentDate >= state.startDate && state.currentDate <= state.finalScheduledDate, "CURRENT_DATE_OUTSIDE_SEASON");
  const ids = state.playerConditions.map((condition) => condition.playerId);
  assertCondition(JSON.stringify(ids) === JSON.stringify(FICTIONAL_EIGHT_PLAYER_IDS), "PLAYER_CONDITION_ORDER_OR_MEMBERSHIP");
  assertCondition(new Set(ids).size === 160, "DUPLICATE_PLAYER_CONDITION");
  assertCondition(state.playerConditions.every((condition) => condition.lastUpdatedDate === state.currentDate), "STALE_PLAYER_CONDITION_DATE");
  const completionKeys = state.appliedMatchConditions.map((entry) => entry.matchCompletionKey);
  const matchIds = state.appliedMatchConditions.map((entry) => entry.matchId);
  assertCondition(new Set(completionKeys).size === completionKeys.length, "DUPLICATE_MATCH_COMPLETION_KEY");
  assertCondition(new Set(matchIds).size === matchIds.length, "DUPLICATE_APPLIED_MATCH_ID");
  assertCondition(state.appliedMatchConditions.every((entry) => entry.matchDayDate >= state.startDate && entry.matchDayDate <= state.currentDate), "APPLIED_MATCH_DATE_OUT_OF_RANGE");
  return state;
}

export function createCareerDayState(input: {
  careerId: string;
  schedule: SeasonSchedule;
  availabilityPack?: CareerAvailabilityPack;
}): CareerDayState {
  const schedule = validateSeasonSchedule(input.schedule);
  const availabilityPack = validateCareerAvailabilityPack(input.availabilityPack ?? DEFAULT_CAREER_AVAILABILITY_PACK);
  assertCondition(schedule.worldPackId === availabilityPack.worldPackId, "SCHEDULE_AVAILABILITY_WORLD_MISMATCH");
  assertCondition(schedule.worldCanonicalSha256 === availabilityPack.worldCanonicalSha256, "SCHEDULE_AVAILABILITY_HASH_MISMATCH");
  const finalScheduledDate = schedule.rounds.at(-1)?.matchDayDate;
  assertCondition(Boolean(finalScheduledDate), "MISSING_FINAL_SCHEDULE_DATE");
  return validateCareerDayState(seal({
    careerStateVersion: "LC_T20_CAREER_DAY_STATE_V1",
    conditionPolicyVersion: T20_CAREER_CONDITION_POLICY.conditionPolicyVersion,
    careerId: input.careerId,
    gameId: schedule.gameId,
    seasonId: schedule.seasonId,
    competitionId: schedule.competitionId,
    scheduleVersion: schedule.scheduleVersion,
    scheduleSha256: schedule.scheduleSha256,
    worldPackId: schedule.worldPackId,
    worldCanonicalSha256: schedule.worldCanonicalSha256,
    availabilityPackId: availabilityPack.packId,
    availabilityPackSha256: hasher.hash(availabilityPack),
    startDate: schedule.startDate,
    finalScheduledDate: finalScheduledDate!,
    currentDate: schedule.startDate,
    revision: 0,
    playerConditions: FICTIONAL_EIGHT_PLAYER_IDS.map((playerId) => ({
      playerId,
      fatigueBp: 0,
      lastUpdatedDate: schedule.startDate,
    })),
    appliedMatchConditions: [],
  }));
}

export function advanceCareerDay(input: unknown): { state: CareerDayState; receipt: CareerAdvanceDayReceipt } {
  const state = validateCareerDayState(input);
  assertCondition(state.currentDate < state.finalScheduledDate, "SEASON_DATE_LIMIT_REACHED");
  const nextDate = addCalendarDays(state.currentDate, 1);
  const recoveredPlayers = state.playerConditions.filter((condition) => condition.fatigueBp > 0).length;
  const next = seal({
    ...stateCore(state),
    currentDate: nextDate,
    revision: state.revision + 1,
    playerConditions: state.playerConditions.map((condition) => ({
      playerId: condition.playerId,
      fatigueBp: Math.max(0, condition.fatigueBp - T20_CAREER_CONDITION_POLICY.restRecoveryPerDayBp),
      lastUpdatedDate: nextDate,
    })),
  });
  return {
    state: validateCareerDayState(next),
    receipt: CareerAdvanceDayReceiptSchema.parse({
      command: "ADVANCE_DAY",
      previousDate: state.currentDate,
      currentDate: nextDate,
      recoveredPlayers,
      recoveryPerPlayerBp: T20_CAREER_CONDITION_POLICY.restRecoveryPerDayBp,
      revision: next.revision,
      stateSha256: next.stateSha256,
    }),
  };
}

export function applyMatchConditionDelta(
  stateInput: unknown,
  deltaInput: unknown,
  scheduleInput: unknown,
): CareerDayState {
  const state = validateCareerDayState(stateInput);
  const schedule = validateSeasonSchedule(scheduleInput);
  assertCondition(schedule.scheduleSha256 === state.scheduleSha256, "MATCH_DELTA_SCHEDULE_HASH_MISMATCH");
  assertCondition(schedule.seasonId === state.seasonId && schedule.gameId === state.gameId, "MATCH_DELTA_SCHEDULE_IDENTITY_MISMATCH");
  const delta: MatchConditionDelta = MatchConditionDeltaSchema.parse(deltaInput);
  assertCondition(delta.matchDayDate === state.currentDate, "MATCH_DELTA_NOT_CURRENT_CAREER_DATE");
  const fixture = schedule.fixtures.find((entry) => entry.matchId === delta.matchId);
  assertCondition(Boolean(fixture), "MATCH_DELTA_UNKNOWN_SCHEDULE_MATCH");
  assertCondition(fixture!.matchDayDate === delta.matchDayDate, "MATCH_DELTA_FIXTURE_DATE_MISMATCH");
  const fixtureTeamIds = new Set([fixture!.homeTeamId, fixture!.awayTeamId]);
  for (const playerId of Object.keys(delta.playerFatigueDeltaBp)) {
    assertCondition(playerIdSet.has(playerId), `UNKNOWN_MATCH_DELTA_PLAYER:${playerId}`);
    assertCondition(fixtureTeamIds.has(playerTeamId.get(playerId) ?? ""), `MATCH_DELTA_PLAYER_NOT_IN_FIXTURE:${playerId}`);
  }
  const payloadSha256 = hasher.hash(delta);
  const existingByKey = state.appliedMatchConditions.find((entry) => entry.matchCompletionKey === delta.matchCompletionKey);
  if (existingByKey) {
    assertCondition(existingByKey.payloadSha256 === payloadSha256 && existingByKey.matchId === delta.matchId, "MATCH_COMPLETION_KEY_CONFLICT");
    return state;
  }
  const existingByMatch = state.appliedMatchConditions.find((entry) => entry.matchId === delta.matchId);
  assertCondition(!existingByMatch, "MATCH_ID_ALREADY_APPLIED");
  assertCondition(state.appliedMatchConditions.length < 56, "MATCH_COMPLETION_CAPACITY_EXCEEDED");
  const next = seal({
    ...stateCore(state),
    revision: state.revision + 1,
    playerConditions: state.playerConditions.map((condition) => ({
      playerId: condition.playerId,
      fatigueBp: Math.min(
        T20_CAREER_CONDITION_POLICY.maxFatigueBp,
        condition.fatigueBp + (delta.playerFatigueDeltaBp[condition.playerId] ?? 0),
      ),
      lastUpdatedDate: state.currentDate,
    })),
    appliedMatchConditions: [
      ...state.appliedMatchConditions,
      {
        matchCompletionKey: delta.matchCompletionKey,
        matchId: delta.matchId,
        matchDayDate: delta.matchDayDate,
        payloadSha256,
      },
    ],
  });
  return validateCareerDayState(next);
}

export function projectSquadCondition(
  stateInput: unknown,
  teamId: string,
  availabilityPackInput: unknown = DEFAULT_CAREER_AVAILABILITY_PACK,
): SquadConditionView {
  const state = validateCareerDayState(stateInput);
  const availabilityPack = validateCareerAvailabilityPack(availabilityPackInput);
  assertCondition(availabilityPack.packId === state.availabilityPackId, "AVAILABILITY_PACK_ID_MISMATCH");
  assertCondition(hasher.hash(availabilityPack) === state.availabilityPackSha256, "AVAILABILITY_PACK_HASH_MISMATCH");
  const roster = FICTIONAL_EIGHT_TEAM_ROSTERS[teamId];
  assertCondition(Boolean(roster), `UNKNOWN_TEAM:${teamId}`);
  const conditionById = new Map(state.playerConditions.map((condition) => [condition.playerId, condition]));
  return SquadConditionViewSchema.parse({
    teamId,
    date: state.currentDate,
    players: roster!.map((playerId) => {
      const condition = conditionById.get(playerId);
      assertCondition(Boolean(condition), `MISSING_PLAYER_CONDITION:${playerId}`);
      const unavailable = availabilityPack.entries.find(
        (entry) => entry.playerId === playerId && entry.startDate <= state.currentDate && state.currentDate <= entry.endDate,
      );
      return {
        playerId,
        fatigueBp: condition!.fatigueBp,
        availability: unavailable ? "UNAVAILABLE" : "AVAILABLE",
        availabilityReason: unavailable?.reason ?? null,
        unavailableThrough: unavailable?.endDate ?? null,
      };
    }),
  });
}
