import { RosterSeasonStateSchema, type RosterSeasonState, type StagedRosterPack } from "@lcxxvi/contracts";
import { applyRosterSeasonCompletion, createRosterSeasonProjection, rosterCompletionFromOffscreen, validateRosterSeasonProjection } from "@lcxxvi/projections";
import { advanceRosterCareerDay, createRosterCareerDayState, createStateHasher, generateRosterSeasonSchedule, simulateRosterOffscreenFixture, validateRosterCareerDayState, validateRosterOffscreenFixtureOutcome, validateRosterSeasonSchedule } from "@lcxxvi/simulation";

const hash = createStateHasher().hash;
function coreOf(state: RosterSeasonState) {
  const { stateSha256, ...core } = state;
  void stateSha256;
  return core;
}
function seal(core: Omit<RosterSeasonState, "stateSha256">): RosterSeasonState {
  return RosterSeasonStateSchema.parse({ ...core, stateSha256: hash(core) });
}
export function validateRosterSeasonState(raw: unknown, pack: StagedRosterPack): RosterSeasonState {
  const state = RosterSeasonStateSchema.parse(raw);
  const schedule = validateRosterSeasonSchedule(state.schedule, pack);
  const career = validateRosterCareerDayState(state.careerState, schedule, pack);
  if (hash(coreOf(state)) !== state.stateSha256 || state.careerId !== career.careerId || !schedule.teamIds.includes(state.controlledTeamId)) throw new Error("ROSTER_SEASON_STATE_MISMATCH");
  if ((state.outcomes.length === 56) !== (state.phase === "COMPLETE") || state.outcomes.length !== career.appliedMatchConditions.length) throw new Error("ROSTER_SEASON_COMPLETION_MISMATCH");
  let projection = createRosterSeasonProjection(schedule);
  const seen = new Set<string>();
  for (const [index, rawOutcome] of state.outcomes.entries()) {
    const outcome = validateRosterOffscreenFixtureOutcome(rawOutcome);
    const fixture = schedule.fixtures.find(item => item.fixtureId === outcome.fixtureId);
    const applied = career.appliedMatchConditions.find(item => item.matchId === outcome.matchId);
    if (!fixture || fixture.ordinal !== index || seen.has(fixture.fixtureId) || outcome.engineManifest.worldHash !== schedule.worldHash || outcome.scheduleSha256 !== schedule.scheduleSha256 || !applied || applied.payloadSha256 !== outcome.conditionDeltaSha256 || applied.matchCompletionKey !== outcome.conditionDelta.matchCompletionKey) throw new Error("ROSTER_SEASON_OUTCOME_MISMATCH");
    seen.add(fixture.fixtureId);
    projection = applyRosterSeasonCompletion(projection, schedule, rosterCompletionFromOffscreen(schedule, outcome));
  }
  validateRosterSeasonProjection(state.projection, schedule);
  if (hash(projection) !== hash(state.projection)) throw new Error("ROSTER_SEASON_PROJECTION_MISMATCH");
  return state;
}
export function createRosterSeason(pack: StagedRosterPack, input: { careerId: string; controlledTeamId: string; seasonId: string; gameId: string; seasonSeed: string; startDate: string }): RosterSeasonState {
  const schedule = generateRosterSeasonSchedule(pack, { seasonId: input.seasonId, gameId: input.gameId, seasonSeed: input.seasonSeed, startDate: input.startDate });
  if (!schedule.teamIds.includes(input.controlledTeamId)) throw new Error("ROSTER_SEASON_UNKNOWN_TEAM");
  const careerState = createRosterCareerDayState(input.careerId, schedule, pack);
  return validateRosterSeasonState(seal({ version: "LC_T20_ROSTER_SEASON_STATE_V2", careerId: input.careerId, controlledTeamId: input.controlledTeamId,
    schedule, careerState, projection: createRosterSeasonProjection(schedule), outcomes: [], revision: 0, phase: "ACTIVE" }), pack);
}
export function simulateNextRosterSeasonFixture(raw: unknown, pack: StagedRosterPack): RosterSeasonState {
  const state = validateRosterSeasonState(raw, pack);
  if (state.phase !== "ACTIVE") throw new Error("ROSTER_SEASON_COMPLETE");
  const completed = new Set(state.outcomes.map(outcome => outcome.fixtureId));
  const fixture = state.schedule.fixtures.find(item => !completed.has(item.fixtureId));
  if (!fixture) throw new Error("ROSTER_SEASON_FIXTURE_MISSING");
  let careerState = state.careerState;
  while (careerState.currentDate < fixture.matchDayDate) careerState = advanceRosterCareerDay(careerState, state.schedule, pack);
  if (careerState.currentDate !== fixture.matchDayDate) throw new Error("ROSTER_SEASON_DATE_MISMATCH");
  const result = simulateRosterOffscreenFixture(pack, state.schedule, careerState, fixture.fixtureId);
  const outcomes = [...state.outcomes, result.outcome];
  const projection = applyRosterSeasonCompletion(state.projection, state.schedule, rosterCompletionFromOffscreen(state.schedule, result.outcome));
  return validateRosterSeasonState(seal({ ...coreOf(state), careerState: result.careerState, projection, outcomes,
    revision: state.revision + 1, phase: outcomes.length === 56 ? "COMPLETE" : "ACTIVE" }), pack);
}
