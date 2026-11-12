import { RosterManagedFixtureOutcomeSchema, RosterSeasonMatchCompletionSchema, RosterSeasonStateSchema, SetTrainingDirectiveRequestSchema, type RosterSeasonState, type StagedRosterPack } from "@lcxxvi/contracts";
import { applyRosterSeasonCompletion, createRosterSeasonProjection, rosterCompletionFromOffscreen, validateRosterSeasonProjection } from "@lcxxvi/projections";
import { advanceRosterCareerDay, applyRosterMatchCondition, conditionDeltaFromCompletedT20Session, createRosterCareerDayState, createStateHasher, generateRosterSeasonSchedule, projectT20Scorecard, rehydrateRosterT20Session, selectRosterFixtureTeams, setRosterTrainingDirective, simulateRosterOffscreenFixture, validateRosterCareerDayState, validateRosterOffscreenFixtureOutcome, validateRosterSeasonSchedule, type T20Session } from "@lcxxvi/simulation";
import { isValidManagedMatchGameId } from "./managed-game-id.js";

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
    if ("version" in rawOutcome) {
      const outcome = RosterManagedFixtureOutcomeSchema.parse(rawOutcome);
      const { outcomeSha256, ...core } = outcome;
      const fixture = schedule.fixtures[index];
      const applied = career.appliedMatchConditions.find(item => item.matchId === outcome.completion.matchId);
      if (hash(core) !== outcomeSha256 || !fixture || fixture.fixtureId !== outcome.completion.fixtureId || outcome.completion.source !== "USER_MATCH" || !applied || applied.payloadSha256 !== hash(outcome.conditionDelta) || applied.matchCompletionKey !== outcome.conditionDelta.matchCompletionKey || hash(outcome.completion.scorecard) !== outcome.completion.scorecardSha256) throw new Error("ROSTER_SEASON_OUTCOME_MISMATCH");
      seen.add(fixture.fixtureId);
      projection = applyRosterSeasonCompletion(projection, schedule, outcome.completion);
      continue;
    }
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
export function changeRosterSeasonTraining(raw: unknown, pack: StagedRosterPack, request: unknown): RosterSeasonState {
  const state = validateRosterSeasonState(raw, pack);
  if (state.phase !== "ACTIVE") throw new Error("ROSTER_SEASON_COMPLETE");
  const command = SetTrainingDirectiveRequestSchema.parse(request);
  const team = pack.world.teams.find(item => item.teamId === state.controlledTeamId);
  if (!team?.squadIds.includes(command.playerId)) throw new Error("ROSTER_SEASON_PLAYER_NOT_MANAGED");
  const careerState = setRosterTrainingDirective(state.careerState, command, state.schedule, pack);
  if (careerState.stateSha256 === state.careerState.stateSha256) return state;
  return validateRosterSeasonState(seal({ ...coreOf(state), careerState, revision: state.revision + 1 }), pack);
}
export function prepareRosterManagedFixture(raw: unknown, pack: StagedRosterPack) {
  const state = validateRosterSeasonState(raw, pack);
  if (state.phase !== "ACTIVE") throw new Error("ROSTER_SEASON_COMPLETE");
  const fixture = state.schedule.fixtures[state.outcomes.length];
  if (!fixture || ![fixture.homeTeamId, fixture.awayTeamId].includes(state.controlledTeamId)) throw new Error("ROSTER_SEASON_MANAGED_FIXTURE_NOT_NEXT");
  let careerState = state.careerState;
  while (careerState.currentDate < fixture.matchDayDate) careerState = advanceRosterCareerDay(careerState, state.schedule, pack);
  if (careerState.currentDate !== fixture.matchDayDate) throw new Error("ROSTER_SEASON_DATE_MISMATCH");
  return { fixture, careerState, selections: selectRosterFixtureTeams(pack, state.schedule, careerState, fixture.fixtureId), stateSha256: state.stateSha256 };
}
export function completeRosterManagedFixture(raw: unknown, pack: StagedRosterPack, rawSession: unknown): RosterSeasonState {
  const state = validateRosterSeasonState(raw, pack);
  const ready = prepareRosterManagedFixture(state, pack);
  const session = rehydrateRosterT20Session(rawSession, pack);
  const fixture = ready.fixture;
  const selections = session.setup.teams.map(team => ({ teamId: team.teamId, playerIds: [...team.playerIds], captainId: team.captainId, keeperId: team.keeperId }));
  if (session.core.phase !== "COMPLETE" || !isValidManagedMatchGameId(session.setup.gameId, fixture.fixtureId) || session.setup.matchId !== fixture.matchId || session.setup.seed !== fixture.matchSeed || session.setup.ground.groundId !== fixture.groundId || hash(selections) !== hash(ready.selections)) throw new Error("ROSTER_SEASON_MANAGED_SESSION_MISMATCH");
  const baseline = session as unknown as T20Session;
  const scorecard = projectT20Scorecard(baseline);
  const scorecardSha256 = hash(scorecard);
  const conditionDelta = conditionDeltaFromCompletedT20Session({ seasonId: state.schedule.request.seasonId, fixtureId: fixture.fixtureId, matchId: fixture.matchId, matchDayDate: fixture.matchDayDate, session: baseline });
  const careerState = applyRosterMatchCondition(ready.careerState, conditionDelta, state.schedule, pack);
  const completion = RosterSeasonMatchCompletionSchema.parse({ completionVersion: "LC_T20_ROSTER_SEASON_COMPLETION_V2", seasonId: state.schedule.request.seasonId, scheduleSha256: state.schedule.scheduleSha256,
    fixtureId: fixture.fixtureId, matchId: fixture.matchId, fixtureOrdinal: fixture.ordinal, roundNumber: fixture.roundNumber, matchDayDate: fixture.matchDayDate,
    homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, source: "USER_MATCH", sourceCompletionSha256: hash({ matchId: fixture.matchId, scorecardSha256, finalEventHash: session.lastEventHash }),
    selectedTeams: ready.selections, scorecard, scorecardSha256 });
  const core = { version: "LC_T20_ROSTER_MANAGED_FIXTURE_V1" as const, completion, conditionDelta };
  const outcome = RosterManagedFixtureOutcomeSchema.parse({ ...core, outcomeSha256: hash(core) });
  const outcomes = [...state.outcomes, outcome];
  return validateRosterSeasonState(seal({ ...coreOf(state), careerState, projection: applyRosterSeasonCompletion(state.projection, state.schedule, completion), outcomes,
    revision: state.revision + 1, phase: outcomes.length === 56 ? "COMPLETE" : "ACTIVE" }), pack);
}
export function hasAcceptedRosterManagedFixture(raw: unknown, pack: StagedRosterPack, rawSession: unknown): boolean {
  const state = validateRosterSeasonState(raw, pack);
  const session = rehydrateRosterT20Session(rawSession, pack);
  if (session.core.phase !== "COMPLETE") return false;
  const scorecardSha256 = hash(projectT20Scorecard(session as unknown as T20Session));
  const sourceCompletionSha256 = hash({ matchId: session.setup.matchId, scorecardSha256, finalEventHash: session.lastEventHash });
  return state.outcomes.some(outcome => "version" in outcome && outcome.completion.matchId === session.setup.matchId && outcome.completion.sourceCompletionSha256 === sourceCompletionSha256);
}
export function simulateNextRosterSeasonFixture(raw: unknown, pack: StagedRosterPack): RosterSeasonState {
  const state = validateRosterSeasonState(raw, pack);
  if (state.phase !== "ACTIVE") throw new Error("ROSTER_SEASON_COMPLETE");
  const completed = new Set(state.outcomes.map(outcome => "version" in outcome ? outcome.completion.fixtureId : outcome.fixtureId));
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
