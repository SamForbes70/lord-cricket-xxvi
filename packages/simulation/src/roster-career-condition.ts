import {
  MatchConditionDeltaSchema, RosterCareerDayStateSchema, SetTrainingDirectiveRequestSchema,
  type RosterCareerDayState, type RosterSeasonSchedule, type StagedRosterPack,
} from "@lcxxvi/contracts";
import { T20_CAREER_CONDITION_POLICY, T20_CAREER_TRAINING_POLICY } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { addCalendarDays } from "./season-scheduler.js";
import { validateRosterSeasonSchedule } from "./roster-season-schedule.js";

const hash = createStateHasher().hash;
function seal(core: Omit<RosterCareerDayState, "stateSha256">): RosterCareerDayState {
  return RosterCareerDayStateSchema.parse({ ...core, stateSha256: hash(core) });
}
function coreOf(state: RosterCareerDayState) {
  const { stateSha256, ...core } = state;
  void stateSha256;
  return core;
}
export function validateRosterCareerDayState(raw: unknown, rawSchedule: unknown, pack: StagedRosterPack): RosterCareerDayState {
  const state = RosterCareerDayStateSchema.parse(raw);
  const schedule = validateRosterSeasonSchedule(rawSchedule, pack);
  const ids = pack.world.players.map(player => player.playerId).sort();
  if (hash(coreOf(state)) !== state.stateSha256 || state.scheduleSha256 !== schedule.scheduleSha256 || state.rosterPackHash !== schedule.rosterPackHash || state.worldHash !== schedule.worldHash || state.startDate !== schedule.request.startDate || state.finalScheduledDate !== schedule.rounds[13]!.matchDayDate || state.currentDate < state.startDate || state.currentDate > state.finalScheduledDate) throw new Error("ROSTER_CAREER_STATE_MISMATCH");
  for (const entries of [state.playerConditions, state.playerReadiness, state.trainingAssignments]) {
    if (JSON.stringify(entries.map(entry => entry.playerId)) !== JSON.stringify(ids)) throw new Error("ROSTER_CAREER_PLAYER_MEMBERSHIP_MISMATCH");
  }
  if (state.playerConditions.some(entry => entry.lastUpdatedDate !== state.currentDate) || state.playerReadiness.some(entry => entry.lastUpdatedDate !== state.currentDate)) throw new Error("ROSTER_CAREER_STALE_PLAYER_DATE");
  if (new Set(state.appliedMatchConditions.map(entry => entry.matchCompletionKey)).size !== state.appliedMatchConditions.length || new Set(state.appliedMatchConditions.map(entry => entry.matchId)).size !== state.appliedMatchConditions.length) throw new Error("ROSTER_CAREER_DUPLICATE_MATCH");
  if (state.appliedMatchConditions.some(entry => { const fixture = schedule.fixtures.find(item => item.matchId === entry.matchId); return !fixture || fixture.matchDayDate !== entry.matchDayDate || entry.matchDayDate > state.currentDate; })) throw new Error("ROSTER_CAREER_APPLIED_FIXTURE_MISMATCH");
  return state;
}
export function createRosterCareerDayState(careerId: string, rawSchedule: unknown, pack: StagedRosterPack): RosterCareerDayState {
  const schedule = validateRosterSeasonSchedule(rawSchedule, pack);
  const ids = pack.world.players.map(player => player.playerId).sort();
  const date = schedule.request.startDate;
  return validateRosterCareerDayState(seal({ version: "LC_T20_ROSTER_CAREER_DAY_V3", careerId,
    scheduleSha256: schedule.scheduleSha256, rosterPackHash: schedule.rosterPackHash, worldHash: schedule.worldHash,
    startDate: date, finalScheduledDate: schedule.rounds[13]!.matchDayDate, currentDate: date, revision: 0,
    playerConditions: ids.map(playerId => ({ playerId, fatigueBp: 0, lastUpdatedDate: date })),
    playerReadiness: ids.map(playerId => ({ playerId, batting: 0, bowling: 0, fielding: 0, lastUpdatedDate: date })),
    trainingAssignments: ids.map(playerId => ({ playerId, directive: "REST" as const })), appliedMatchConditions: [] }), schedule, pack);
}
export function setRosterTrainingDirective(raw: unknown, rawRequest: unknown, schedule: RosterSeasonSchedule, pack: StagedRosterPack): RosterCareerDayState {
  const state = validateRosterCareerDayState(raw, schedule, pack);
  const request = SetTrainingDirectiveRequestSchema.parse(rawRequest);
  if (request.effectiveDate !== state.currentDate || request.expectedRevision !== state.revision) throw new Error("ROSTER_CAREER_STALE_TRAINING");
  const assignment = state.trainingAssignments.find(entry => entry.playerId === request.playerId);
  if (!assignment) throw new Error("ROSTER_CAREER_UNKNOWN_PLAYER");
  if (assignment.directive === request.directive) return state;
  return validateRosterCareerDayState(seal({ ...coreOf(state), revision: state.revision + 1,
    trainingAssignments: state.trainingAssignments.map(entry => entry.playerId === request.playerId ? { ...entry, directive: request.directive } : entry) }), schedule, pack);
}
export function advanceRosterCareerDay(raw: unknown, schedule: RosterSeasonSchedule, pack: StagedRosterPack): RosterCareerDayState {
  const state = validateRosterCareerDayState(raw, schedule, pack);
  if (state.currentDate >= state.finalScheduledDate) throw new Error("ROSTER_CAREER_DATE_LIMIT");
  const nextDate = addCalendarDays(state.currentDate, 1);
  const directives = new Map(state.trainingAssignments.map(entry => [entry.playerId, entry.directive]));
  const decay = (value: number) => value > 0 ? Math.max(0, value - T20_CAREER_TRAINING_POLICY.readinessDecayPerDay) : Math.min(0, value + T20_CAREER_TRAINING_POLICY.readinessDecayPerDay);
  const readiness = (value: number, active: boolean) => active ? Math.min(T20_CAREER_TRAINING_POLICY.readinessMaxRatingDelta, value + T20_CAREER_TRAINING_POLICY.readinessPracticeGainPerDay) : decay(value);
  return validateRosterCareerDayState(seal({ ...coreOf(state), revision: state.revision + 1, currentDate: nextDate,
    playerConditions: state.playerConditions.map(entry => ({ ...entry, fatigueBp: Math.max(0, entry.fatigueBp - (directives.get(entry.playerId) === "REST" ? T20_CAREER_TRAINING_POLICY.restRecoveryPerDayBp : T20_CAREER_TRAINING_POLICY.practiceRecoveryPerDayBp)), lastUpdatedDate: nextDate })),
    playerReadiness: state.playerReadiness.map(entry => ({ playerId: entry.playerId, batting: readiness(entry.batting, directives.get(entry.playerId) === "BATTING_PRACTICE"), bowling: readiness(entry.bowling, directives.get(entry.playerId) === "BOWLING_PRACTICE"), fielding: readiness(entry.fielding, directives.get(entry.playerId) === "FIELDING_PRACTICE"), lastUpdatedDate: nextDate })) }), schedule, pack);
}
export function applyRosterMatchCondition(raw: unknown, rawDelta: unknown, scheduleInput: RosterSeasonSchedule, pack: StagedRosterPack): RosterCareerDayState {
  const schedule = validateRosterSeasonSchedule(scheduleInput, pack);
  const state = validateRosterCareerDayState(raw, schedule, pack);
  const delta = MatchConditionDeltaSchema.parse(rawDelta);
  const fixture = schedule.fixtures.find(entry => entry.matchId === delta.matchId);
  if (!fixture || delta.matchDayDate !== state.currentDate || fixture.matchDayDate !== delta.matchDayDate) throw new Error("ROSTER_CAREER_FIXTURE_MISMATCH");
  const allowed = new Set(pack.world.teams.filter(team => team.teamId === fixture.homeTeamId || team.teamId === fixture.awayTeamId).flatMap(team => team.squadIds));
  if (Object.keys(delta.playerFatigueDeltaBp).some(id => !allowed.has(id))) throw new Error("ROSTER_CAREER_FIXTURE_PLAYER_MISMATCH");
  const payloadSha256 = hash(delta);
  const existing = state.appliedMatchConditions.find(entry => entry.matchCompletionKey === delta.matchCompletionKey);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256 || existing.matchId !== delta.matchId) throw new Error("ROSTER_CAREER_MATCH_CONFLICT");
    return state;
  }
  if (state.appliedMatchConditions.some(entry => entry.matchId === delta.matchId)) throw new Error("ROSTER_CAREER_DUPLICATE_MATCH");
  return validateRosterCareerDayState(seal({ ...coreOf(state), revision: state.revision + 1,
    playerConditions: state.playerConditions.map(entry => ({ ...entry, fatigueBp: Math.min(T20_CAREER_CONDITION_POLICY.maxFatigueBp, entry.fatigueBp + (delta.playerFatigueDeltaBp[entry.playerId] ?? 0)) })),
    appliedMatchConditions: [...state.appliedMatchConditions, { matchCompletionKey: delta.matchCompletionKey, matchId: delta.matchId, matchDayDate: delta.matchDayDate, payloadSha256 }] }), schedule, pack);
}
