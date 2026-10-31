import {
  RosterOffscreenFixtureOutcomeSchema, type RosterCareerDayState, type RosterOffscreenFixtureOutcome,
  type RosterSeasonSchedule, type StagedRosterPack, type T20TeamSelection,
} from "@lcxxvi/contracts";
import { isBowlingCapable, T20_OFFSCREEN_FIXTURE_POLICY } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";
import { conditionDeltaFromCompletedT20Session, supportedSelectionScore } from "./offscreen-fixture.js";
import { applyRosterMatchCondition, validateRosterCareerDayState } from "./roster-career-condition.js";
import { validateRosterSeasonSchedule } from "./roster-season-schedule.js";
import { createRosterT20Session, executeRosterT20Command, type RosterT20Session } from "./roster-t20-match.js";
import { eventChainManifest, fixtureAutopilotStep, projectT20Scorecard, type T20Session } from "./t20-match.js";

const hash = createStateHasher().hash;
export function validateRosterOffscreenFixtureOutcome(raw: unknown): RosterOffscreenFixtureOutcome {
  const outcome = RosterOffscreenFixtureOutcomeSchema.parse(raw);
  const { outcomeSha256, ...core } = outcome;
  if (hash(core) !== outcomeSha256 || hash(outcome.scorecard) !== outcome.scorecardSha256 || hash(outcome.conditionDelta) !== outcome.conditionDeltaSha256 ||
      outcome.engineManifest.engine !== "LC_T20_MATCH_ROSTER_V2" || outcome.scorecard.matchId !== outcome.matchId || outcome.conditionDelta.matchId !== outcome.matchId ||
      outcome.conditionDelta.matchDayDate !== outcome.matchDayDate || outcome.eventChain.executionManifestHash !== hash(outcome.engineManifest)) throw new Error("ROSTER_OFFSCREEN_OUTCOME_MISMATCH");
  return outcome;
}
export function selectRosterFixtureTeams(pack: StagedRosterPack, scheduleInput: RosterSeasonSchedule, stateInput: RosterCareerDayState, fixtureId: string): readonly [T20TeamSelection, T20TeamSelection] {
  const schedule = validateRosterSeasonSchedule(scheduleInput, pack);
  const state = validateRosterCareerDayState(stateInput, schedule, pack);
  const fixture = schedule.fixtures.find(item => item.fixtureId === fixtureId);
  if (!fixture || fixture.matchDayDate !== state.currentDate || state.appliedMatchConditions.some(item => item.matchId === fixture.matchId)) throw new Error("ROSTER_OFFSCREEN_FIXTURE_MISMATCH");
  const byId = new Map(pack.world.players.map(player => [player.playerId, player]));
  const condition = new Map(state.playerConditions.map(item => [item.playerId, item]));
  const readiness = new Map(state.playerReadiness.map(item => [item.playerId, item]));
  const select = (teamId: string): T20TeamSelection => {
    const team = pack.world.teams.find(item => item.teamId === teamId)!;
    const ranked = team.squadIds.map(id => {
      const player = byId.get(id)!;
      const c = condition.get(id)!;
      const r = readiness.get(id)!;
      return { player, fatigue: c.fatigueBp, score: supportedSelectionScore(player, { playerId: id, fatigueBp: c.fatigueBp, availability: "AVAILABLE", battingReadiness: r.batting, bowlingReadiness: r.bowling, fieldingReadiness: r.fielding }) };
    }).sort((a, b) => b.score - a.score || a.fatigue - b.fatigue || a.player.playerId.localeCompare(b.player.playerId));
    const keeper = ranked.find(item => item.player.role === "KEEPER");
    if (!keeper) throw new Error("ROSTER_OFFSCREEN_KEEPER_MISSING");
    const bowlers = ranked.filter(item => item.player.playerId !== keeper.player.playerId && isBowlingCapable(item.player)).slice(0, 5);
    if (bowlers.length !== 5) throw new Error("ROSTER_OFFSCREEN_BOWLERS_MISSING");
    const required = new Set([keeper.player.playerId, ...bowlers.map(item => item.player.playerId)]);
    const xi = ranked.filter(item => required.has(item.player.playerId));
    for (const item of ranked) if (xi.length < 11 && !required.has(item.player.playerId)) { xi.push(item); required.add(item.player.playerId); }
    xi.sort((a, b) => b.score - a.score || a.fatigue - b.fatigue || a.player.playerId.localeCompare(b.player.playerId));
    return { teamId, playerIds: xi.map(item => item.player.playerId), captainId: xi[0]!.player.playerId, keeperId: keeper.player.playerId };
  };
  return [select(fixture.homeTeamId), select(fixture.awayTeamId)];
}
export function simulateRosterOffscreenFixture(pack: StagedRosterPack, scheduleInput: RosterSeasonSchedule, stateInput: RosterCareerDayState, fixtureId: string): { outcome: RosterOffscreenFixtureOutcome; session: RosterT20Session; careerState: RosterCareerDayState } {
  const schedule = validateRosterSeasonSchedule(scheduleInput, pack);
  const before = validateRosterCareerDayState(stateInput, schedule, pack);
  const fixture = schedule.fixtures.find(item => item.fixtureId === fixtureId);
  if (!fixture) throw new Error("ROSTER_OFFSCREEN_UNKNOWN_FIXTURE");
  const selectedTeams = selectRosterFixtureTeams(pack, schedule, before, fixtureId);
  let session = createRosterT20Session(pack, { gameId: schedule.request.gameId, matchId: fixture.matchId, seed: fixture.matchSeed, format: "T20", selection: { groundId: fixture.groundId, teams: selectedTeams } });
  for (let steps = 0; session.core.phase !== "COMPLETE"; steps++) {
    if (steps >= 1400) throw new Error("ROSTER_OFFSCREEN_COMMAND_LIMIT");
    session = executeRosterT20Command(session, fixtureAutopilotStep(session as unknown as T20Session)).session;
  }
  const baseline = session as unknown as T20Session;
  const scorecard = projectT20Scorecard(baseline);
  const conditionDelta = conditionDeltaFromCompletedT20Session({ seasonId: schedule.request.seasonId, fixtureId, matchId: fixture.matchId, matchDayDate: fixture.matchDayDate, session: baseline });
  const careerState = applyRosterMatchCondition(before, conditionDelta, schedule, pack);
  const core = { executionVersion: "LC_T20_ROSTER_OFFSCREEN_FIXTURE_V2" as const, policyVersion: "LC_T20_ROSTER_OFFSCREEN_POLICY_V2" as const,
    fixtureId, matchId: fixture.matchId, roundNumber: fixture.roundNumber, roundFixtureIndex: fixture.roundFixtureIndex,
    matchDayDate: fixture.matchDayDate, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, groundId: fixture.groundId,
    scheduleSha256: schedule.scheduleSha256, matchSeedHash: hash({ matchSeed: fixture.matchSeed }), careerRevisionBefore: before.revision,
    careerRevisionAfter: careerState.revision, careerStateSha256Before: before.stateSha256, careerStateSha256After: careerState.stateSha256,
    selectionPolicyId: T20_OFFSCREEN_FIXTURE_POLICY.selectionPolicyId, captainPolicyId: T20_OFFSCREEN_FIXTURE_POLICY.captainPolicyId,
    conditionDeltaPolicyId: T20_OFFSCREEN_FIXTURE_POLICY.conditionDeltaPolicyId, selectedTeams, eventChain: eventChainManifest(baseline),
    eventLogSha256: hash(session.events), commandLogSha256: hash(session.commands), scorecard, scorecardSha256: hash(scorecard),
    conditionDelta, conditionDeltaSha256: hash(conditionDelta), engineManifest: session.executionManifest };
  return { outcome: validateRosterOffscreenFixtureOutcome({ ...core, outcomeSha256: hash(core) }), session, careerState };
}
