import {
  MatchConditionDeltaSchema,
  OffscreenFixtureOutcomeCoreSchema,
  OffscreenFixtureOutcomeSchema,
  OffscreenRoundExecutionCoreSchema,
  OffscreenRoundExecutionSchema,
  T20MatchSetupRequestSchema,
  type CareerAvailabilityPack,
  type CareerDayStateV2,
  type OffscreenFixtureOutcome,
  type OffscreenFixtureOutcomeCore,
  type OffscreenRoundExecution,
  type OffscreenRoundExecutionCore,
  type Player,
  type SeasonFixture,
  type SeasonSchedule,
  type T20TeamSelection,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  DELIVERY_STAGE_PACK_SHA256,
  FROZEN_WORLD_PINS,
  MODEL_PACK_SHA256,
  T20_OFFSCREEN_FIXTURE_POLICY,
  isBowlingCapable,
} from "@lcxxvi/data";
import {
  projectSquadTrainingCondition,
  applyMatchConditionDeltaV2,
  validateCareerAvailabilityPack,
  validateCareerDayStateV2,
} from "./career-condition.js";
import { createStateHasher } from "./determinism.js";
import { generatorRuleHash } from "./generator.js";
import {
  eventChainManifest,
  fixtureAutopilotStep,
  projectT20Scorecard,
  runFixtureT20,
  type T20Session,
} from "./t20-match.js";
import { validateSeasonSchedule } from "./season-scheduler.js";
import { validateT20MatchSetup, verifyFrozenWorldBytes } from "./world-setup.js";

const hasher = createStateHasher();

function assertOffscreen(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_T20_OFFSCREEN_${code}`);
}

function outcomeCore(outcome: OffscreenFixtureOutcome): OffscreenFixtureOutcomeCore {
  const { outcomeSha256, ...core } = outcome;
  void outcomeSha256;
  return OffscreenFixtureOutcomeCoreSchema.parse(core);
}

export function validateOffscreenFixtureOutcome(input: unknown): OffscreenFixtureOutcome {
  const outcome = OffscreenFixtureOutcomeSchema.parse(input);
  assertOffscreen(hasher.hash(outcomeCore(outcome)) === outcome.outcomeSha256, "OUTCOME_HASH_MISMATCH");
  assertOffscreen(outcome.matchId === outcome.scorecard.matchId, "OUTCOME_SCORECARD_MATCH_ID");
  assertOffscreen(outcome.selectedTeams[0].teamId === outcome.homeTeamId && outcome.selectedTeams[1].teamId === outcome.awayTeamId, "OUTCOME_TEAM_ORDER");
  const selectedPlayerIds = new Set(outcome.selectedTeams.flatMap((team) => team.playerIds));
  assertOffscreen(Object.keys(outcome.conditionDelta.playerFatigueDeltaBp).every((playerId) => selectedPlayerIds.has(playerId)), "OUTCOME_CONDITION_PLAYER_NOT_SELECTED");
  assertOffscreen(outcome.scorecard.result.winnerTeamId === null || [outcome.homeTeamId, outcome.awayTeamId].includes(outcome.scorecard.result.winnerTeamId), "OUTCOME_INVALID_WINNER");
  assertOffscreen(outcome.matchId === outcome.conditionDelta.matchId, "OUTCOME_CONDITION_MATCH_ID");
  assertOffscreen(outcome.matchDayDate === outcome.conditionDelta.matchDayDate, "OUTCOME_CONDITION_DATE");
  assertOffscreen(outcome.scorecardSha256 === hasher.hash(outcome.scorecard), "OUTCOME_SCORECARD_HASH");
  assertOffscreen(outcome.conditionDeltaSha256 === hasher.hash(outcome.conditionDelta), "OUTCOME_CONDITION_HASH");
  assertOffscreen(outcome.eventChain.eventCount > 0 && outcome.eventChain.finalEventHash.length === 64, "OUTCOME_EVENT_CHAIN");
  assertOffscreen(outcome.careerRevisionAfter === outcome.careerRevisionBefore + 1, "OUTCOME_CAREER_REVISION");
  return outcome;
}

function roundCore(result: OffscreenRoundExecution): OffscreenRoundExecutionCore {
  const { executionSha256, ...core } = result;
  void executionSha256;
  return OffscreenRoundExecutionCoreSchema.parse(core);
}

export function validateOffscreenRoundExecution(input: unknown): OffscreenRoundExecution {
  const result = OffscreenRoundExecutionSchema.parse(input);
  assertOffscreen(hasher.hash(roundCore(result)) === result.executionSha256, "ROUND_HASH_MISMATCH");
  assertOffscreen(result.executedFixtureIds.length === result.outcomes.length, "ROUND_OUTCOME_COUNT");
  assertOffscreen(
    JSON.stringify(result.executedFixtureIds) === JSON.stringify([...result.executedFixtureIds].sort()),
    "ROUND_FIXTURE_ORDER",
  );
  assertOffscreen(
    JSON.stringify(result.executedFixtureIds) === JSON.stringify(result.outcomes.map((outcome) => outcome.fixtureId)),
    "ROUND_OUTCOME_ORDER",
  );
  assertOffscreen(result.outcomes.every((outcome) => outcome.roundNumber === result.roundNumber && outcome.matchDayDate === result.matchDayDate && outcome.scheduleSha256 === result.scheduleSha256), "ROUND_OUTCOME_BINDING");
  if (result.userTeamId !== null) {
    assertOffscreen(result.skippedUserFixtureId !== null, "ROUND_USER_FIXTURE_NOT_SKIPPED");
    assertOffscreen(result.outcomes.every((outcome) => ![outcome.homeTeamId, outcome.awayTeamId].includes(result.userTeamId!)), "ROUND_USER_FIXTURE_EXECUTED");
  } else {
    assertOffscreen(result.skippedUserFixtureId === null, "ROUND_UNEXPECTED_SKIPPED_FIXTURE");
  }
  if (result.outcomes.length > 0) {
    assertOffscreen(result.outcomes[0]!.careerStateSha256Before === result.careerStateSha256Before, "ROUND_CHAIN_START");
    assertOffscreen(result.outcomes.at(-1)!.careerStateSha256After === result.careerStateSha256After, "ROUND_CHAIN_END");
    for (let index = 1; index < result.outcomes.length; index += 1) {
      assertOffscreen(
        result.outcomes[index - 1]!.careerStateSha256After === result.outcomes[index]!.careerStateSha256Before,
        `ROUND_CHAIN_GAP_${index}`,
      );
    }
  } else {
    assertOffscreen(result.careerStateSha256Before === result.careerStateSha256After, "ROUND_EMPTY_HASH_CHANGE");
    assertOffscreen(result.careerRevisionBefore === result.careerRevisionAfter, "ROUND_EMPTY_REVISION_CHANGE");
  }
  return result;
}

type VerifiedWorld = ReturnType<typeof verifyFrozenWorldBytes>;

type PlayerCondition = {
  playerId: string;
  fatigueBp: number;
  availability: "AVAILABLE" | "UNAVAILABLE";
  battingReadiness: number;
  bowlingReadiness: number;
  fieldingReadiness: number;
};

function supportedSelectionScore(player: Readonly<Player>, condition: PlayerCondition): number {
  const skills = player.skills.T20;
  const batting = skills.defence + skills.timing + skills.power + skills.rotation + skills.vsPace + skills.vsSpin
    + condition.battingReadiness * 6;
  const bowling = isBowlingCapable(player)
    ? skills.control + skills.movement + skills.variation + skills.stamina + condition.bowlingReadiness * 4
    : 0;
  const fielding = skills.catching + skills.groundFielding + skills.throwing + skills.keeping
    + condition.fieldingReadiness * 4;
  return batting + bowling + fielding;
}

function selectBaselineXI(
  verified: VerifiedWorld,
  state: CareerDayStateV2,
  availabilityPack: CareerAvailabilityPack,
  teamId: string,
): T20TeamSelection {
  const team = verified.world.teams.find((candidate) => candidate.teamId === teamId);
  assertOffscreen(Boolean(team), `UNKNOWN_TEAM:${teamId}`);
  const conditionView = projectSquadTrainingCondition(state, teamId, availabilityPack);
  const conditionById = new Map(conditionView.players.map((entry) => [entry.playerId, entry]));
  const playerById = new Map(verified.world.players.map((player) => [player.playerId, player]));
  const candidates = team!.squadIds
    .map((playerId) => {
      const player = playerById.get(playerId);
      const condition = conditionById.get(playerId);
      assertOffscreen(Boolean(player) && Boolean(condition), `MISSING_SELECTION_PLAYER:${playerId}`);
      return { player: player!, condition: condition! };
    })
    .filter(({ condition }) => condition.availability === "AVAILABLE")
    .map(({ player, condition }) => ({
      player,
      condition,
      score: supportedSelectionScore(player, condition),
    }));
  assertOffscreen(candidates.length >= 11, `INSUFFICIENT_AVAILABLE_PLAYERS:${teamId}`);

  const ranked = (items: typeof candidates) => [...items].sort((a, b) =>
    b.score - a.score || a.condition.fatigueBp - b.condition.fatigueBp || a.player.playerId.localeCompare(b.player.playerId));
  const rankedAll = ranked(candidates);
  const keeper = ranked(candidates.filter(({ player }) => player.role === "KEEPER"))[0];
  assertOffscreen(Boolean(keeper), `NO_AVAILABLE_KEEPER:${teamId}`);
  const bowlers = ranked(candidates.filter(({ player }) =>
    player.playerId !== keeper!.player.playerId && isBowlingCapable(player))).slice(0, T20_OFFSCREEN_FIXTURE_POLICY.minimumNonKeeperBowlingCapable);
  assertOffscreen(
    bowlers.length === T20_OFFSCREEN_FIXTURE_POLICY.minimumNonKeeperBowlingCapable,
    `INSUFFICIENT_AVAILABLE_BOWLERS:${teamId}`,
  );
  const required = new Set([keeper!.player.playerId, ...bowlers.map(({ player }) => player.playerId)]);
  const selected = rankedAll.filter(({ player }) => required.has(player.playerId));
  for (const candidate of rankedAll) {
    if (selected.length >= 11) break;
    if (!required.has(candidate.player.playerId)) {
      selected.push(candidate);
      required.add(candidate.player.playerId);
    }
  }
  assertOffscreen(selected.length === 11, `FAILED_TO_SELECT_XI:${teamId}`);
  selected.sort((a, b) =>
    b.score - a.score || a.condition.fatigueBp - b.condition.fatigueBp || a.player.playerId.localeCompare(b.player.playerId));
  const captain = selected[0];
  assertOffscreen(Boolean(captain), `NO_CAPTAIN:${teamId}`);
  return {
    teamId,
    playerIds: selected.map(({ player }) => player.playerId),
    captainId: captain!.player.playerId,
    keeperId: keeper!.player.playerId,
  };
}

function assertFixtureBinding(schedule: SeasonSchedule, state: CareerDayStateV2, fixture: SeasonFixture): void {
  assertOffscreen(state.scheduleSha256 === schedule.scheduleSha256, "CAREER_SCHEDULE_HASH_MISMATCH");
  assertOffscreen(state.seasonId === schedule.seasonId && state.gameId === schedule.gameId, "CAREER_SCHEDULE_IDENTITY_MISMATCH");
  assertOffscreen(state.currentDate === fixture.matchDayDate, "FIXTURE_NOT_CURRENT_CAREER_DATE");
  assertOffscreen(!state.appliedMatchConditions.some((entry) => entry.matchId === fixture.matchId), "FIXTURE_ALREADY_APPLIED");
}

function buildFixtureSetup(
  verified: VerifiedWorld,
  schedule: SeasonSchedule,
  fixture: SeasonFixture,
  selectedTeams: readonly [T20TeamSelection, T20TeamSelection],
  worldBytes: Readonly<Uint8Array>,
) {
  const request = T20MatchSetupRequestSchema.parse({
    setupVersion: "LC_T20_SETUP_V1",
    setup: {
      schemaVersion: "1.0.0",
      gameId: schedule.gameId,
      matchId: fixture.matchId,
      format: "T20",
      worldPackId: FROZEN_WORLD_PINS.worldPackId,
      rulesId: "LC_T20_01",
      modelId: verified.manifest.modelId,
      randomId: verified.manifest.randomId,
      seed: fixture.matchSeed,
      teamIds: [fixture.homeTeamId, fixture.awayTeamId],
      groundId: fixture.groundId,
      capabilities: { limitedOversRain: false, superOver: false, injuries: false, prediction: false },
    },
    worldFileSha256: FROZEN_WORLD_PINS.worldFileSha256,
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    rulesHash: generatorRuleHash("LC_T20_01"),
    modelHash: MODEL_PACK_SHA256,
    stagePackHash: DELIVERY_STAGE_PACK_SHA256,
    selectedTeams,
  });
  return validateT20MatchSetup(request, worldBytes, verified.manifest);
}

function conditionDeltaFromSession(schedule: SeasonSchedule, fixture: SeasonFixture, session: T20Session) {
  const selectedIds = session.setup.teams.flatMap((team) => [...team.playerIds]).sort();
  const playerFatigueDeltaBp = Object.fromEntries(
    selectedIds
      .map((playerId) => [playerId, session.core.fatigueBp[playerId] ?? 0] as const)
      .filter(([, fatigueBp]) => fatigueBp > 0),
  );
  return MatchConditionDeltaSchema.parse({
    deltaVersion: "LC_T20_MATCH_CONDITION_DELTA_V1",
    matchCompletionKey: `complete-${schedule.seasonId}-${fixture.fixtureId}`,
    matchId: fixture.matchId,
    matchDayDate: fixture.matchDayDate,
    playerFatigueDeltaBp,
  });
}

type SimulationContext = {
  schedule: SeasonSchedule;
  state: CareerDayStateV2;
  availabilityPack: CareerAvailabilityPack;
  verified: VerifiedWorld;
  worldBytes: Readonly<Uint8Array>;
};

function simulateOne(context: SimulationContext, fixture: SeasonFixture): {
  outcome: OffscreenFixtureOutcome;
  session: T20Session;
  state: CareerDayStateV2;
} {
  const { schedule, availabilityPack, verified, worldBytes } = context;
  const before = validateCareerDayStateV2(context.state);
  assertFixtureBinding(schedule, before, fixture);
  const selectedTeams = [
    selectBaselineXI(verified, before, availabilityPack, fixture.homeTeamId),
    selectBaselineXI(verified, before, availabilityPack, fixture.awayTeamId),
  ] as const;
  const setup = buildFixtureSetup(verified, schedule, fixture, selectedTeams, worldBytes);
  const session = runFixtureT20(setup);
  const scorecard = projectT20Scorecard(session);
  const conditionDelta = conditionDeltaFromSession(schedule, fixture, session);
  const after = applyMatchConditionDeltaV2(before, conditionDelta, schedule);
  const core = OffscreenFixtureOutcomeCoreSchema.parse({
    executionVersion: T20_OFFSCREEN_FIXTURE_POLICY.executionVersion,
    policyVersion: T20_OFFSCREEN_FIXTURE_POLICY.policyVersion,
    fixtureId: fixture.fixtureId,
    matchId: fixture.matchId,
    roundNumber: fixture.roundNumber,
    roundFixtureIndex: fixture.roundFixtureIndex,
    matchDayDate: fixture.matchDayDate,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    groundId: fixture.groundId,
    scheduleSha256: schedule.scheduleSha256,
    matchSeedHash: hasher.hash({ matchSeed: fixture.matchSeed }),
    careerRevisionBefore: before.revision,
    careerRevisionAfter: after.revision,
    careerStateSha256Before: before.stateSha256,
    careerStateSha256After: after.stateSha256,
    selectionPolicyId: T20_OFFSCREEN_FIXTURE_POLICY.selectionPolicyId,
    captainPolicyId: T20_OFFSCREEN_FIXTURE_POLICY.captainPolicyId,
    conditionDeltaPolicyId: T20_OFFSCREEN_FIXTURE_POLICY.conditionDeltaPolicyId,
    selectedTeams,
    eventChain: eventChainManifest(session),
    eventLogSha256: hasher.hash(session.events),
    commandLogSha256: hasher.hash(session.commands),
    scorecard,
    scorecardSha256: hasher.hash(scorecard),
    conditionDelta,
    conditionDeltaSha256: hasher.hash(conditionDelta),
  });
  const outcome = validateOffscreenFixtureOutcome({ ...core, outcomeSha256: hasher.hash(core) });
  return { outcome, session, state: after };
}

function prepareContext(input: {
  schedule: unknown;
  careerState: unknown;
  availabilityPack?: unknown;
  worldBytes: Readonly<Uint8Array>;
  worldManifest: unknown;
}): SimulationContext {
  const schedule = validateSeasonSchedule(input.schedule);
  const state = validateCareerDayStateV2(input.careerState);
  const availabilityPack = validateCareerAvailabilityPack(input.availabilityPack ?? DEFAULT_CAREER_AVAILABILITY_PACK);
  const verified = verifyFrozenWorldBytes(input.worldBytes, input.worldManifest);
  assertOffscreen(schedule.worldCanonicalSha256 === verified.manifest.worldCanonicalSha256, "SCHEDULE_WORLD_HASH_MISMATCH");
  assertOffscreen(state.worldCanonicalSha256 === verified.manifest.worldCanonicalSha256, "CAREER_WORLD_HASH_MISMATCH");
  assertOffscreen(state.availabilityPackId === availabilityPack.packId, "AVAILABILITY_PACK_ID_MISMATCH");
  assertOffscreen(hasher.hash(availabilityPack) === state.availabilityPackSha256, "AVAILABILITY_PACK_HASH_MISMATCH");
  return { schedule, state, availabilityPack, verified, worldBytes: input.worldBytes };
}

export function simulateOffscreenFixture(input: {
  schedule: unknown;
  careerState: unknown;
  availabilityPack?: unknown;
  fixtureId: string;
  worldBytes: Readonly<Uint8Array>;
  worldManifest: unknown;
}): { outcome: OffscreenFixtureOutcome; session: T20Session; careerState: CareerDayStateV2 } {
  const context = prepareContext(input);
  const fixture = context.schedule.fixtures.find((entry) => entry.fixtureId === input.fixtureId);
  assertOffscreen(Boolean(fixture), `UNKNOWN_FIXTURE:${input.fixtureId}`);
  const simulated = simulateOne(context, fixture!);
  return { outcome: simulated.outcome, session: simulated.session, careerState: simulated.state };
}

export function simulateOffscreenRound(input: {
  schedule: unknown;
  careerState: unknown;
  availabilityPack?: unknown;
  roundNumber: number;
  userTeamId?: string | null;
  worldBytes: Readonly<Uint8Array>;
  worldManifest: unknown;
}): { result: OffscreenRoundExecution; careerState: CareerDayStateV2; sessions: readonly T20Session[] } {
  const context = prepareContext(input);
  assertOffscreen(Number.isInteger(input.roundNumber) && input.roundNumber >= 1 && input.roundNumber <= 14, "INVALID_ROUND_NUMBER");
  const round = context.schedule.rounds.find((entry) => entry.roundNumber === input.roundNumber);
  assertOffscreen(Boolean(round), `UNKNOWN_ROUND:${input.roundNumber}`);
  assertOffscreen(context.state.currentDate === round!.matchDayDate, "ROUND_NOT_CURRENT_CAREER_DATE");
  const userTeamId = input.userTeamId ?? null;
  if (userTeamId !== null) assertOffscreen(context.schedule.teamIds.includes(userTeamId), `UNKNOWN_USER_TEAM:${userTeamId}`);
  const fixtures = context.schedule.fixtures
    .filter((entry) => entry.roundNumber === input.roundNumber)
    .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
  assertOffscreen(fixtures.length === 4, "ROUND_FIXTURE_COUNT");
  const skipped = userTeamId === null
    ? []
    : fixtures.filter((fixture) => fixture.homeTeamId === userTeamId || fixture.awayTeamId === userTeamId);
  assertOffscreen(userTeamId === null || skipped.length === 1, "USER_ROUND_FIXTURE_COUNT");
  const toExecute = fixtures.filter((fixture) => !skipped.includes(fixture));
  const before = context.state;
  const outcomes: OffscreenFixtureOutcome[] = [];
  const sessions: T20Session[] = [];
  let state = before;
  for (const fixture of toExecute) {
    const simulated = simulateOne({ ...context, state }, fixture);
    outcomes.push(simulated.outcome);
    sessions.push(simulated.session);
    state = simulated.state;
  }
  const core = OffscreenRoundExecutionCoreSchema.parse({
    executionVersion: "LC_T20_OFFSCREEN_ROUND_V1",
    seasonId: context.schedule.seasonId,
    roundNumber: input.roundNumber,
    matchDayDate: round!.matchDayDate,
    scheduleSha256: context.schedule.scheduleSha256,
    userTeamId,
    skippedUserFixtureId: skipped[0]?.fixtureId ?? null,
    executedFixtureIds: outcomes.map((outcome) => outcome.fixtureId),
    outcomes,
    careerRevisionBefore: before.revision,
    careerRevisionAfter: state.revision,
    careerStateSha256Before: before.stateSha256,
    careerStateSha256After: state.stateSha256,
  });
  const result = validateOffscreenRoundExecution({ ...core, executionSha256: hasher.hash(core) });
  return { result, careerState: state, sessions };
}

/** Exported for tests/audits: guarantees the season runner uses the same accepted fixture captain. */
export const OFFSCREEN_CAPTAIN_STEP = fixtureAutopilotStep;
