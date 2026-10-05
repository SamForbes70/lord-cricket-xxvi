import {
  CareerAdvanceDayReceiptSchema,
  CareerAdvanceDayV2ReceiptSchema,
  CareerDayStateV2CoreSchema,
  CareerDayStateV2Schema,
  CareerAvailabilityPackSchema,
  CareerDayStateCoreSchema,
  CareerDayStateSchema,
  MatchConditionDeltaSchema,
  SetTrainingDirectiveReceiptSchema,
  SetTrainingDirectiveRequestSchema,
  SquadTrainingConditionViewSchema,
  SquadConditionViewSchema,
  type CareerAdvanceDayReceipt,
  type CareerAdvanceDayV2Receipt,
  type CareerAvailabilityPack,
  type CareerDayState,
  type CareerDayStateV2,
  type CareerDayStateV2Core,
  type CareerDayStateCore,
  type MatchConditionDelta,
  type SetTrainingDirectiveReceipt,
  type SetTrainingDirectiveRequest,
  type SeasonSchedule,
  type SquadConditionView,
  type SquadTrainingConditionView,
  type TrainingDirective,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  FICTIONAL_EIGHT_PLAYER_IDS,
  FICTIONAL_EIGHT_TEAM_ROSTERS,
  FROZEN_WORLD_PINS,
  T20_CAREER_CONDITION_POLICY,
  T20_CAREER_TRAINING_POLICY,
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

function stateCoreV2(state: CareerDayStateV2): CareerDayStateV2Core {
  const { stateSha256, ...core } = state;
  void stateSha256;
  return CareerDayStateV2CoreSchema.parse(core);
}

function sealV2(coreInput: CareerDayStateV2Core): CareerDayStateV2 {
  const core = CareerDayStateV2CoreSchema.parse(coreInput);
  return CareerDayStateV2Schema.parse({ ...core, stateSha256: hasher.hash(core) });
}

function assertOrderedPlayers(ids: string[], code: string): void {
  assertCondition(JSON.stringify(ids) === JSON.stringify(FICTIONAL_EIGHT_PLAYER_IDS), code);
  assertCondition(new Set(ids).size === 160, `${code}_DUPLICATE`);
}

export function validateCareerDayStateV2(input: unknown): CareerDayStateV2 {
  const state = CareerDayStateV2Schema.parse(input);
  const core = stateCoreV2(state);
  assertCondition(hasher.hash(core) === state.stateSha256, "V2_STATE_HASH_MISMATCH");
  assertCondition(state.worldPackId === FROZEN_WORLD_PINS.worldPackId, "V2_WORLD_PACK_MISMATCH");
  assertCondition(state.worldCanonicalSha256 === FROZEN_WORLD_PINS.worldCanonicalSha256, "V2_WORLD_HASH_MISMATCH");
  assertCondition(state.conditionPolicyVersion === T20_CAREER_CONDITION_POLICY.conditionPolicyVersion, "V2_CONDITION_POLICY_MISMATCH");
  assertCondition(state.trainingPolicyVersion === T20_CAREER_TRAINING_POLICY.trainingPolicyVersion, "V2_TRAINING_POLICY_MISMATCH");
  assertCondition(state.currentDate >= state.startDate && state.currentDate <= state.finalScheduledDate, "V2_CURRENT_DATE_OUTSIDE_SEASON");
  assertOrderedPlayers(state.playerConditions.map((entry) => entry.playerId), "V2_PLAYER_CONDITION_ORDER_OR_MEMBERSHIP");
  assertOrderedPlayers(state.playerReadiness.map((entry) => entry.playerId), "V2_PLAYER_READINESS_ORDER_OR_MEMBERSHIP");
  assertOrderedPlayers(state.trainingAssignments.map((entry) => entry.playerId), "V2_TRAINING_ASSIGNMENT_ORDER_OR_MEMBERSHIP");
  assertCondition(state.playerConditions.every((entry) => entry.lastUpdatedDate === state.currentDate), "V2_STALE_PLAYER_CONDITION_DATE");
  assertCondition(state.playerReadiness.every((entry) => entry.lastUpdatedDate === state.currentDate), "V2_STALE_PLAYER_READINESS_DATE");
  const completionKeys = state.appliedMatchConditions.map((entry) => entry.matchCompletionKey);
  const matchIds = state.appliedMatchConditions.map((entry) => entry.matchId);
  assertCondition(new Set(completionKeys).size === completionKeys.length, "V2_DUPLICATE_MATCH_COMPLETION_KEY");
  assertCondition(new Set(matchIds).size === matchIds.length, "V2_DUPLICATE_APPLIED_MATCH_ID");
  assertCondition(
    state.appliedMatchConditions.every((entry) => entry.matchDayDate >= state.startDate && entry.matchDayDate <= state.currentDate),
    "V2_APPLIED_MATCH_DATE_OUT_OF_RANGE",
  );
  return state;
}

export function migrateCareerDayStateV1ToV2(input: unknown): CareerDayStateV2 {
  const state = validateCareerDayState(input);
  return validateCareerDayStateV2(sealV2({
    careerStateVersion: "LC_T20_CAREER_DAY_STATE_V2",
    conditionPolicyVersion: state.conditionPolicyVersion,
    trainingPolicyVersion: T20_CAREER_TRAINING_POLICY.trainingPolicyVersion,
    careerId: state.careerId,
    gameId: state.gameId,
    seasonId: state.seasonId,
    competitionId: state.competitionId,
    scheduleVersion: state.scheduleVersion,
    scheduleSha256: state.scheduleSha256,
    worldPackId: state.worldPackId,
    worldCanonicalSha256: state.worldCanonicalSha256,
    availabilityPackId: state.availabilityPackId,
    availabilityPackSha256: state.availabilityPackSha256,
    startDate: state.startDate,
    finalScheduledDate: state.finalScheduledDate,
    currentDate: state.currentDate,
    revision: state.revision,
    playerConditions: state.playerConditions,
    playerReadiness: FICTIONAL_EIGHT_PLAYER_IDS.map((playerId) => ({
      playerId,
      batting: 0,
      bowling: 0,
      fielding: 0,
      lastUpdatedDate: state.currentDate,
    })),
    trainingAssignments: FICTIONAL_EIGHT_PLAYER_IDS.map((playerId) => ({ playerId, directive: "REST" as const })),
    appliedMatchConditions: state.appliedMatchConditions,
  }));
}

export function createCareerDayStateV2(input: {
  careerId: string;
  schedule: SeasonSchedule;
  availabilityPack?: CareerAvailabilityPack;
}): CareerDayStateV2 {
  return migrateCareerDayStateV1ToV2(createCareerDayState(input));
}

export function setTrainingDirective(
  stateInput: unknown,
  requestInput: unknown,
): { state: CareerDayStateV2; receipt: SetTrainingDirectiveReceipt } {
  const state = validateCareerDayStateV2(stateInput);
  const request: SetTrainingDirectiveRequest = SetTrainingDirectiveRequestSchema.parse(requestInput);
  assertCondition(request.effectiveDate === state.currentDate, "TRAINING_DIRECTIVE_DATE_MISMATCH");
  assertCondition(request.expectedRevision === state.revision, "TRAINING_DIRECTIVE_STALE_REVISION");
  assertCondition(playerIdSet.has(request.playerId), `UNKNOWN_TRAINING_PLAYER:${request.playerId}`);
  const previous = state.trainingAssignments.find((entry) => entry.playerId === request.playerId);
  assertCondition(Boolean(previous), `MISSING_TRAINING_ASSIGNMENT:${request.playerId}`);
  if (previous!.directive === request.directive) {
    return {
      state,
      receipt: SetTrainingDirectiveReceiptSchema.parse({
        command: "SET_TRAINING_DIRECTIVE",
        playerId: request.playerId,
        previousDirective: previous!.directive,
        directive: request.directive,
        changed: false,
        revision: state.revision,
        stateSha256: state.stateSha256,
      }),
    };
  }
  const next = validateCareerDayStateV2(sealV2({
    ...stateCoreV2(state),
    revision: state.revision + 1,
    trainingAssignments: state.trainingAssignments.map((entry) =>
      entry.playerId === request.playerId ? { ...entry, directive: request.directive } : entry,
    ),
  }));
  return {
    state: next,
    receipt: SetTrainingDirectiveReceiptSchema.parse({
      command: "SET_TRAINING_DIRECTIVE",
      playerId: request.playerId,
      previousDirective: previous!.directive,
      directive: request.directive,
      changed: true,
      revision: next.revision,
      stateSha256: next.stateSha256,
    }),
  };
}

function moveTowardZero(value: number): number {
  if (value > 0) return Math.max(0, value - T20_CAREER_TRAINING_POLICY.readinessDecayPerDay);
  if (value < 0) return Math.min(0, value + T20_CAREER_TRAINING_POLICY.readinessDecayPerDay);
  return 0;
}

function nextReadiness(
  readiness: { batting: number; bowling: number; fielding: number },
  directive: TrainingDirective,
): { batting: number; bowling: number; fielding: number } {
  const practice = (value: number, active: boolean) => active
    ? Math.min(T20_CAREER_TRAINING_POLICY.readinessMaxRatingDelta, value + T20_CAREER_TRAINING_POLICY.readinessPracticeGainPerDay)
    : moveTowardZero(value);
  return {
    batting: practice(readiness.batting, directive === "BATTING_PRACTICE"),
    bowling: practice(readiness.bowling, directive === "BOWLING_PRACTICE"),
    fielding: practice(readiness.fielding, directive === "FIELDING_PRACTICE"),
  };
}

export function advanceCareerDayV2(input: unknown): { state: CareerDayStateV2; receipt: CareerAdvanceDayV2Receipt } {
  const state = validateCareerDayStateV2(input);
  assertCondition(state.currentDate < state.finalScheduledDate, "V2_SEASON_DATE_LIMIT_REACHED");
  const nextDate = addCalendarDays(state.currentDate, 1);
  const directiveByPlayer = new Map(state.trainingAssignments.map((entry) => [entry.playerId, entry.directive]));
  const readinessByPlayer = new Map(state.playerReadiness.map((entry) => [entry.playerId, entry]));
  let recoveredPlayers = 0;
  let readinessChangedPlayers = 0;
  const restPlayers = state.trainingAssignments.filter((entry) => entry.directive === "REST").length;
  const practicePlayers = state.trainingAssignments.length - restPlayers;
  const nextPlayerConditions = state.playerConditions.map((condition) => {
    const directive = directiveByPlayer.get(condition.playerId);
    assertCondition(Boolean(directive), `V2_MISSING_DIRECTIVE:${condition.playerId}`);
    const recovery = directive === "REST"
      ? T20_CAREER_TRAINING_POLICY.restRecoveryPerDayBp
      : T20_CAREER_TRAINING_POLICY.practiceRecoveryPerDayBp;
    if (condition.fatigueBp > 0) recoveredPlayers += 1;
    return {
      playerId: condition.playerId,
      fatigueBp: Math.max(0, condition.fatigueBp - recovery),
      lastUpdatedDate: nextDate,
    };
  });
  const nextPlayerReadiness = FICTIONAL_EIGHT_PLAYER_IDS.map((playerId) => {
    const current = readinessByPlayer.get(playerId);
    const directive = directiveByPlayer.get(playerId);
    assertCondition(Boolean(current), `V2_MISSING_READINESS:${playerId}`);
    assertCondition(Boolean(directive), `V2_MISSING_DIRECTIVE:${playerId}`);
    const next = nextReadiness(current!, directive!);
    if (next.batting !== current!.batting || next.bowling !== current!.bowling || next.fielding !== current!.fielding) {
      readinessChangedPlayers += 1;
    }
    return { playerId, ...next, lastUpdatedDate: nextDate };
  });
  const next = validateCareerDayStateV2(sealV2({
    ...stateCoreV2(state),
    currentDate: nextDate,
    revision: state.revision + 1,
    playerConditions: nextPlayerConditions,
    playerReadiness: nextPlayerReadiness,
  }));
  return {
    state: next,
    receipt: CareerAdvanceDayV2ReceiptSchema.parse({
      command: "ADVANCE_DAY",
      previousDate: state.currentDate,
      currentDate: nextDate,
      restPlayers,
      practicePlayers,
      recoveredPlayers,
      readinessChangedPlayers,
      restRecoveryPerPlayerBp: T20_CAREER_TRAINING_POLICY.restRecoveryPerDayBp,
      practiceRecoveryPerPlayerBp: T20_CAREER_TRAINING_POLICY.practiceRecoveryPerDayBp,
      revision: next.revision,
      stateSha256: next.stateSha256,
    }),
  };
}

export function applyMatchConditionDeltaV2(
  stateInput: unknown,
  deltaInput: unknown,
  scheduleInput: unknown,
): CareerDayStateV2 {
  const state = validateCareerDayStateV2(stateInput);
  const schedule = validateSeasonSchedule(scheduleInput);
  assertCondition(schedule.scheduleSha256 === state.scheduleSha256, "V2_MATCH_DELTA_SCHEDULE_HASH_MISMATCH");
  assertCondition(schedule.seasonId === state.seasonId && schedule.gameId === state.gameId, "V2_MATCH_DELTA_SCHEDULE_IDENTITY_MISMATCH");
  const delta: MatchConditionDelta = MatchConditionDeltaSchema.parse(deltaInput);
  assertCondition(delta.matchDayDate === state.currentDate, "V2_MATCH_DELTA_NOT_CURRENT_CAREER_DATE");
  const fixture = schedule.fixtures.find((entry) => entry.matchId === delta.matchId);
  assertCondition(Boolean(fixture), "V2_MATCH_DELTA_UNKNOWN_SCHEDULE_MATCH");
  assertCondition(fixture!.matchDayDate === delta.matchDayDate, "V2_MATCH_DELTA_FIXTURE_DATE_MISMATCH");
  const fixtureTeamIds = new Set([fixture!.homeTeamId, fixture!.awayTeamId]);
  for (const playerId of Object.keys(delta.playerFatigueDeltaBp)) {
    assertCondition(playerIdSet.has(playerId), `V2_UNKNOWN_MATCH_DELTA_PLAYER:${playerId}`);
    assertCondition(fixtureTeamIds.has(playerTeamId.get(playerId) ?? ""), `V2_MATCH_DELTA_PLAYER_NOT_IN_FIXTURE:${playerId}`);
  }
  const payloadSha256 = hasher.hash(delta);
  const existingByKey = state.appliedMatchConditions.find((entry) => entry.matchCompletionKey === delta.matchCompletionKey);
  if (existingByKey) {
    assertCondition(existingByKey.payloadSha256 === payloadSha256 && existingByKey.matchId === delta.matchId, "V2_MATCH_COMPLETION_KEY_CONFLICT");
    return state;
  }
  assertCondition(!state.appliedMatchConditions.some((entry) => entry.matchId === delta.matchId), "V2_MATCH_ID_ALREADY_APPLIED");
  assertCondition(state.appliedMatchConditions.length < 56, "V2_MATCH_COMPLETION_CAPACITY_EXCEEDED");
  const next = sealV2({
    ...stateCoreV2(state),
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
  return validateCareerDayStateV2(next);
}

export function projectSquadTrainingCondition(
  stateInput: unknown,
  teamId: string,
  availabilityPackInput: unknown = DEFAULT_CAREER_AVAILABILITY_PACK,
): SquadTrainingConditionView {
  const state = validateCareerDayStateV2(stateInput);
  const availabilityPack = validateCareerAvailabilityPack(availabilityPackInput);
  assertCondition(availabilityPack.packId === state.availabilityPackId, "V2_AVAILABILITY_PACK_ID_MISMATCH");
  assertCondition(hasher.hash(availabilityPack) === state.availabilityPackSha256, "V2_AVAILABILITY_PACK_HASH_MISMATCH");
  const roster = FICTIONAL_EIGHT_TEAM_ROSTERS[teamId];
  assertCondition(Boolean(roster), `V2_UNKNOWN_TEAM:${teamId}`);
  const conditionById = new Map(state.playerConditions.map((entry) => [entry.playerId, entry]));
  const readinessById = new Map(state.playerReadiness.map((entry) => [entry.playerId, entry]));
  const directiveById = new Map(state.trainingAssignments.map((entry) => [entry.playerId, entry.directive]));
  return SquadTrainingConditionViewSchema.parse({
    teamId,
    date: state.currentDate,
    players: roster!.map((playerId) => {
      const condition = conditionById.get(playerId);
      const readiness = readinessById.get(playerId);
      const directive = directiveById.get(playerId);
      assertCondition(Boolean(condition), `V2_MISSING_PLAYER_CONDITION:${playerId}`);
      assertCondition(Boolean(readiness), `V2_MISSING_PLAYER_READINESS:${playerId}`);
      assertCondition(Boolean(directive), `V2_MISSING_PLAYER_DIRECTIVE:${playerId}`);
      const unavailable = availabilityPack.entries.find(
        (entry) => entry.playerId === playerId && entry.startDate <= state.currentDate && state.currentDate <= entry.endDate,
      );
      return {
        playerId,
        fatigueBp: condition!.fatigueBp,
        availability: unavailable ? "UNAVAILABLE" : "AVAILABLE",
        availabilityReason: unavailable?.reason ?? null,
        unavailableThrough: unavailable?.endDate ?? null,
        directive: directive!,
        battingReadiness: readiness!.batting,
        bowlingReadiness: readiness!.bowling,
        fieldingReadiness: readiness!.fielding,
      };
    }),
  });
}
