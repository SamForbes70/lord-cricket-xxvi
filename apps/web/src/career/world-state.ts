/**
 * Career world-state construction, rollover and copy-forward for standard careers (V1 to V3 worlds).
 * Split out of service.ts (audit Phase 5); behaviour unchanged. The service re-exports the public names.
 */
import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import {
  LIFECYCLE_SEASON_STATE_VERSION,
  LIFECYCLE_SEASON_STATE_V2_VERSION,
  PERSISTENT_WORLD_STATE_V6_VERSION,
  usesFixturePolicyV2,
  type ActivePersistentSeasonStateV1,
  type ActivePersistentSeasonStateV2,
  type PersistentWorldStateV6,
  PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
  PERSISTENT_WORLD_STATE_V2_VERSION,
  PERSISTENT_WORLD_STATE_V3_VERSION,
  PERSISTENT_WORLD_STATE_VERSION,
  PersistentWorldRolloverReceiptSchema,
  type ActivePersistentSeasonState,
  type CompletedSeasonRecord,
  type LifecycleSeasonState,
  type NewGameWorldCopy,
  type PersistentWorldIdentity,
  type PersistentWorldState,
  type PersistentWorldStateV2,
  type PersistentWorldStateV3,
  type PlayerLifecycleState,
  type PlayerTrainingAssignment,
  type SquadEconomyState,
  type StagedRosterPack,
  type T20SeasonState,
  PERSISTENT_WORLD_STATE_V4_VERSION,
  PERSISTENT_WORLD_STATE_V5_VERSION,
  PLAYER_LIFECYCLE_STATE_V2_VERSION,
  MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS,
  PLAYER_LIFECYCLE_STATE_VERSION,
  type PersistentWorldStateV4,
  type PersistentWorldStateV5,
  type PersistentWorldStateV3Core,
} from "@lcxxvi/contracts";
import {
  FROZEN_WORLD_PINS,
  T20_LEAGUE_COMPETITION,
  validateDefaultWorld,
} from "@lcxxvi/data";
import {
} from "@lcxxvi/projections";
import {
  advanceLifecycleAndEconomyAtSeasonClose,
  advancePersistentSeasonCalendar,
  advancePlayerLifecycleAtSeasonClose,
  createCareerDayStateV2,
  createInitialPlayerLifecycleState,
  createInitialSquadEconomyState,
  createPersistentLifecycleSeasonScheduleAndDayState,
  createPersistentSeasonScheduleAndDayState,
  createStateHasher,
  derivePersistentWorldIdentity,
  generateSeasonSchedule,
  INITIAL_PERSISTENT_CALENDAR_YEAR,
  INITIAL_PERSISTENT_START_DATE,
  recordElapsedTrainingExposure,
  sealLifecycleSeasonState,
  seasonStartDateOf,
  expectLifecycleV1,
  expectLifecycleV2,
  sealPlayerLifecycleState,
} from "@lcxxvi/simulation";
import {
  createRosterSeasonProjection,
  createT20SeasonProjection,
  rebuildPersistentCareerProjectionCore,
} from "@lcxxvi/projections";
import {
  sealCompletedSeasonRecord,
  sealPersistentCareerProjection,
  sealPersistentWorldState,
  sealPersistentWorldStateV2,
  sealPersistentWorldStateV3,
  sealT20SeasonState,
  sealPersistentWorldStateV4,
  sealPersistentWorldStateV5,
  sealPersistentWorldStateV6,
  type AnyPersistentWorldState,
} from "@lcxxvi/persistence";

export const worldBytes = new TextEncoder().encode(worldText);
export const world = validateDefaultWorld(JSON.parse(worldText), worldManifest).world;
export const hasher = createStateHasher();
export const START_DATE = "2027-01-03";
export const FINAL_COMPLETED_AT_SUFFIX = "T23:59:59.000Z";

export const careerWorld = world;

export function token(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function dateDiffDays(startIso: string, endIso: string): number {
  const ms = Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function deterministicSeasonCompletedAt(state: ActivePersistentSeasonState): string {
  return `${state.schedule.rounds.at(-1)!.matchDayDate}${FINAL_COMPLETED_AT_SUFFIX}`;
}

export function stateCore<T extends ActivePersistentSeasonState>(state: T): Omit<T, "stateSha256"> {
  const { stateSha256: _hash, ...core } = state;
  void _hash;
  return core as Omit<T, "stateSha256">;
}

export type CreateCareerOptions = {
  saveId?: string;
  worldId?: string;
  careerId?: string;
  seasonId?: string;
  gameId?: string;
  seed?: string;
  startDate?: string;
  calendarYear?: number;
  worldStateVersion?:
    | typeof PERSISTENT_WORLD_STATE_VERSION
    | typeof PERSISTENT_WORLD_STATE_V2_VERSION
    | typeof PERSISTENT_WORLD_STATE_V3_VERSION
    | typeof PERSISTENT_WORLD_STATE_V4_VERSION
    | typeof PERSISTENT_WORLD_STATE_V5_VERSION
    | typeof PERSISTENT_WORLD_STATE_V6_VERSION;
};

/** World states V2 to V5 hold only season states V1 (career fixture policy V1). */
export function expectSeasonPolicyV1(season: ActivePersistentSeasonState): ActivePersistentSeasonStateV1 {
  if (usesFixturePolicyV2(season)) throw new Error("A world state V2 to V5 holds only season states V1.");
  return season as ActivePersistentSeasonStateV1;
}

/** World state V6 holds only season states V2 (career fixture policy V2). docs/pavilion/CAREER_FIXTURE_POLICY_V2.md */
export function expectSeasonPolicyV2(season: ActivePersistentSeasonState): ActivePersistentSeasonStateV2 {
  if (!usesFixturePolicyV2(season)) throw new Error("A world state V6 holds only season states V2.");
  return season as ActivePersistentSeasonStateV2;
}

export async function createInitialSeasonState(input: {
  seasonId: string;
  careerId: string;
  gameId: string;
  controlledTeamId: string | null;
  seed: string;
  startDate?: string;
}): Promise<T20SeasonState> {
  const schedule = generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
    seasonId: input.seasonId,
    gameId: input.gameId,
    competitionId: "LC_T20_LEAGUE_01",
    worldPackId: FROZEN_WORLD_PINS.worldPackId,
    worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    seasonSeed: input.seed,
    startDate: input.startDate ?? START_DATE,
    teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
    groundIds: [...T20_LEAGUE_COMPETITION.groundIds],
    homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
  });
  const careerState = createCareerDayStateV2({ careerId: input.careerId, schedule });
  const projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
  return sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1",
    seasonId: input.seasonId,
    gameId: input.gameId,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    schedule,
    careerState,
    projection,
    completedMatches: [],
    revision: 0,
    phase: "ACTIVE",
  });
}

export async function createInitialPersistentWorldCareerState(input: {
  worldId: string;
  careerId: string;
  baseSeed: string;
  controlledTeamId: string | null;
  calendarYear?: number;
  startDate?: string;
}): Promise<PersistentWorldState> {
  const startDate = input.startDate ?? INITIAL_PERSISTENT_START_DATE;
  const calendarYear =
    input.calendarYear ??
    (Number.parseInt(startDate.slice(0, 4), 10) || INITIAL_PERSISTENT_CALENDAR_YEAR);
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: input.worldId,
    baseSeed: input.baseSeed,
    originKind: "NEW_PERSISTENT_CAREER",
  });
  const built = createPersistentSeasonScheduleAndDayState({
    worldIdentity,
    careerId: input.careerId,
    seasonNumber: 1,
    calendarYear,
    startDate,
    priorSeasonFinalStateSha256: null,
  });
  const projection = createT20SeasonProjection({
    competition: T20_LEAGUE_COMPETITION,
    schedule: built.schedule,
  });
  const currentSeason = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1",
    seasonId: built.seasonId,
    gameId: built.gameId,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    schedule: built.schedule,
    careerState: built.careerState,
    projection,
    completedMatches: [],
    revision: 0,
    phase: "ACTIVE",
  });
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: [],
      activeSeason: currentSeason,
    }),
  );
  return sealPersistentWorldState({
    worldStateVersion: PERSISTENT_WORLD_STATE_VERSION,
    worldIdentity,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    currentSeasonNumber: 1,
    currentCalendarYear: calendarYear,
    currentSeason,
    completedSeasons: [],
    careerProjection,
    lastRolloverReceipt: null,
    revision: 0,
  });
}

export async function rebuildPersistentWorldStateWithActiveSeason(
  worldState: PersistentWorldState,
  nextSeason: T20SeasonState,
  nextRevision: number,
): Promise<PersistentWorldState> {
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldState.worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: worldState.completedSeasons,
      activeSeason: nextSeason,
    }),
  );
  return sealPersistentWorldState({
    worldStateVersion: PERSISTENT_WORLD_STATE_VERSION,
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    currentSeasonNumber: worldState.currentSeasonNumber,
    currentCalendarYear: worldState.currentCalendarYear,
    currentSeason: nextSeason,
    completedSeasons: worldState.completedSeasons,
    careerProjection,
    lastRolloverReceipt: worldState.lastRolloverReceipt,
    revision: nextRevision,
  });
}

/**
 * The start every season rollover shares (world states V1 to V4): close the active season into a sealed
 * record and work out the next season's number, calendar year and start date. For a V1 season,
 * `seasonStartDateOf` is its schedule's start date, so all versions compute exactly what they did before.
 */
async function closeCurrentSeason(worldState: AnyPersistentWorldState): Promise<{
  closedRecord: CompletedSeasonRecord;
  completedSeasons: CompletedSeasonRecord[];
  nextSeasonNumber: number;
  nextCalendarYear: number;
  nextStartDate: string;
}> {
  if (worldState.currentSeason.phase !== "COMPLETE") {
    throw new Error("Complete all 56 fixtures before closing the season.");
  }
  const closedRecord = await sealCompletedSeasonRecord({
    seasonNumber: worldState.currentSeasonNumber,
    calendarYear: worldState.currentCalendarYear,
    completedSeasonState: worldState.currentSeason,
    completedAt: deterministicSeasonCompletedAt(worldState.currentSeason),
  });
  const { nextCalendarYear, nextStartDate } = advancePersistentSeasonCalendar({
    closedCalendarYear: worldState.currentCalendarYear,
    closedEndDate: worldState.currentSeason.careerState.finalScheduledDate,
    seasonStartMonthDay: seasonStartDateOf(worldState.currentSeason).slice(5, 10),
  });
  return {
    closedRecord,
    completedSeasons: [...worldState.completedSeasons, closedRecord],
    nextSeasonNumber: worldState.currentSeasonNumber + 1,
    nextCalendarYear,
    nextStartDate,
  };
}

/** The end every season rollover shares: the rebuilt career projection and the rollover receipt. */
async function rolloverProjectionAndReceipt(
  worldState: AnyPersistentWorldState,
  closed: { closedRecord: CompletedSeasonRecord; completedSeasons: CompletedSeasonRecord[]; nextSeasonNumber: number },
  nextCurrentSeason: ActivePersistentSeasonState,
) {
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldState.worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: closed.completedSeasons,
      activeSeason: nextCurrentSeason,
    }),
  );
  const receipt = PersistentWorldRolloverReceiptSchema.parse({
    receiptVersion: PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
    fromSeasonNumber: worldState.currentSeasonNumber,
    toSeasonNumber: closed.nextSeasonNumber,
    closedSeasonId: closed.closedRecord.seasonId,
    closedSeasonStateSha256: closed.closedRecord.finalSeasonStateSha256,
    closedSeasonRecordSha256: closed.closedRecord.recordSha256,
    nextSeasonId: nextCurrentSeason.seasonId,
    nextStartDate: seasonStartDateOf(nextCurrentSeason),
    nextScheduleSha256: nextCurrentSeason.schedule.scheduleSha256,
  });
  return { careerProjection, receipt };
}

export async function rolloverPersistentWorldCareerSeason(
  worldState: PersistentWorldState,
  nextRevision = worldState.revision + 1,
): Promise<{ nextState: PersistentWorldState; closedRecord: CompletedSeasonRecord }> {
  const { closedRecord, completedSeasons, nextSeasonNumber, nextCalendarYear, nextStartDate } =
    await closeCurrentSeason(worldState);
  const built = createPersistentSeasonScheduleAndDayState({
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    seasonNumber: nextSeasonNumber,
    calendarYear: nextCalendarYear,
    startDate: nextStartDate,
    priorSeasonFinalStateSha256: closedRecord.finalSeasonStateSha256,
    carryForwardDirectives: worldState.currentSeason.careerState.trainingAssignments,
  });
  const projection = createT20SeasonProjection({
    competition: T20_LEAGUE_COMPETITION,
    schedule: built.schedule,
  });
  const nextCurrentSeason = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1",
    seasonId: built.seasonId,
    gameId: built.gameId,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    schedule: built.schedule,
    careerState: built.careerState,
    projection,
    completedMatches: [],
    revision: 0,
    phase: "ACTIVE",
  });
  const { careerProjection, receipt } = await rolloverProjectionAndReceipt(
    worldState,
    { closedRecord, completedSeasons, nextSeasonNumber },
    nextCurrentSeason,
  );
  const nextState = await sealPersistentWorldState({
    worldStateVersion: PERSISTENT_WORLD_STATE_VERSION,
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    currentSeasonNumber: nextSeasonNumber,
    currentCalendarYear: nextCalendarYear,
    currentSeason: nextCurrentSeason,
    completedSeasons,
    careerProjection,
    lastRolloverReceipt: receipt,
    revision: nextRevision,
  });
  return { nextState, closedRecord };
}

export async function copyCompletedSingleSeasonToPersistentWorldState(input: {
  sourceSaveId: string;
  sourceState: T20SeasonState;
  worldId: string;
  newCareerId: string;
  baseSeed: string;
}): Promise<PersistentWorldState> {
  const { sourceState } = input;
  if (sourceState.phase !== "COMPLETE") {
    throw new Error("Complete all 56 fixtures in the single-season career before copying into a multi-season world.");
  }
  const closedCalendarYear =
    Number.parseInt(sourceState.schedule.startDate.slice(0, 4), 10) ||
    INITIAL_PERSISTENT_CALENDAR_YEAR;
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: input.worldId,
    baseSeed: input.baseSeed,
    originKind: "COPIED_FROM_SINGLE_SEASON_V1",
    sourceSingleSeasonSaveId: input.sourceSaveId,
    sourceSingleSeasonFinalStateSha256: sourceState.stateSha256,
  });
  const closedRecord = await sealCompletedSeasonRecord({
    seasonNumber: 1,
    calendarYear: closedCalendarYear,
    completedSeasonState: sourceState,
    completedAt: deterministicSeasonCompletedAt(sourceState),
  });
  const completedSeasons = [closedRecord];
  const { nextCalendarYear, nextStartDate } = advancePersistentSeasonCalendar({
    closedCalendarYear,
    closedEndDate: sourceState.careerState.finalScheduledDate,
    seasonStartMonthDay: sourceState.schedule.startDate.slice(5, 10),
  });
  const built = createPersistentSeasonScheduleAndDayState({
    worldIdentity,
    careerId: input.newCareerId,
    seasonNumber: 2,
    calendarYear: nextCalendarYear,
    startDate: nextStartDate,
    priorSeasonFinalStateSha256: closedRecord.finalSeasonStateSha256,
    carryForwardDirectives: sourceState.careerState.trainingAssignments,
  });
  const projection = createT20SeasonProjection({
    competition: T20_LEAGUE_COMPETITION,
    schedule: built.schedule,
  });
  const currentSeason = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1",
    seasonId: built.seasonId,
    gameId: built.gameId,
    careerId: input.newCareerId,
    controlledTeamId: sourceState.controlledTeamId,
    schedule: built.schedule,
    careerState: built.careerState,
    projection,
    completedMatches: [],
    revision: 0,
    phase: "ACTIVE",
  });
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons,
      activeSeason: currentSeason,
    }),
  );
  const receipt = PersistentWorldRolloverReceiptSchema.parse({
    receiptVersion: PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
    fromSeasonNumber: 1,
    toSeasonNumber: 2,
    closedSeasonId: closedRecord.seasonId,
    closedSeasonStateSha256: closedRecord.finalSeasonStateSha256,
    closedSeasonRecordSha256: closedRecord.recordSha256,
    nextSeasonId: currentSeason.seasonId,
    nextStartDate: currentSeason.schedule.startDate,
    nextScheduleSha256: currentSeason.schedule.scheduleSha256,
  });
  return sealPersistentWorldState({
    worldStateVersion: PERSISTENT_WORLD_STATE_VERSION,
    worldIdentity,
    careerId: input.newCareerId,
    controlledTeamId: sourceState.controlledTeamId,
    currentSeasonNumber: 2,
    currentCalendarYear: nextCalendarYear,
    currentSeason,
    completedSeasons,
    careerProjection,
    lastRolloverReceipt: receipt,
    revision: 0,
  });
}

export async function createLifecycleSeasonStateForWorld(input: {
  worldIdentity: PersistentWorldIdentity;
  rosterPack: StagedRosterPack;
  careerId: string;
  controlledTeamId: string | null;
  seasonNumber: number;
  calendarYear: number;
  startDate: string;
  priorSeasonFinalStateSha256: string | null;
  carryForwardDirectives?: readonly PlayerTrainingAssignment[];
  /** V1 (fixture policy V1) unless the world is V6. docs/pavilion/CAREER_FIXTURE_POLICY_V2.md */
  seasonStateVersion?: typeof LIFECYCLE_SEASON_STATE_VERSION | typeof LIFECYCLE_SEASON_STATE_V2_VERSION;
}): Promise<LifecycleSeasonState> {
  const built = createPersistentLifecycleSeasonScheduleAndDayState({
    worldIdentity: input.worldIdentity,
    rosterPack: input.rosterPack,
    careerId: input.careerId,
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    startDate: input.startDate,
    priorSeasonFinalStateSha256: input.priorSeasonFinalStateSha256,
    ...(input.carryForwardDirectives ? { carryForwardDirectives: input.carryForwardDirectives } : {}),
  });
  const projection = createRosterSeasonProjection(built.schedule);
  return sealLifecycleSeasonState({
    seasonStateVersion: input.seasonStateVersion ?? LIFECYCLE_SEASON_STATE_VERSION,
    seasonId: built.seasonId,
    gameId: built.gameId,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    rosterPackSha256: hasher.hash(input.rosterPack),
    schedule: built.schedule,
    careerState: built.careerState,
    projection,
    completedMatches: [],
    revision: 0,
    phase: "ACTIVE",
  });
}

export async function createInitialPersistentWorldCareerStateV2(input: {
  worldId: string;
  careerId: string;
  baseSeed: string;
  controlledTeamId: string | null;
  calendarYear?: number;
  startDate?: string;
  worldCopy?: NewGameWorldCopy | null;
}): Promise<PersistentWorldStateV2> {
  const startDate = input.startDate ?? INITIAL_PERSISTENT_START_DATE;
  const calendarYear =
    input.calendarYear ??
    (Number.parseInt(startDate.slice(0, 4), 10) || INITIAL_PERSISTENT_CALENDAR_YEAR);
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: input.worldId,
    baseSeed: input.baseSeed,
    originKind: "NEW_PERSISTENT_CAREER",
  });
  const built = createPersistentSeasonScheduleAndDayState({
    worldIdentity,
    careerId: input.careerId,
    seasonNumber: 1,
    calendarYear,
    startDate,
    priorSeasonFinalStateSha256: null,
  });
  const projection = createT20SeasonProjection({
    competition: T20_LEAGUE_COMPETITION,
    schedule: built.schedule,
  });
  const currentSeason = await sealT20SeasonState({
    seasonStateVersion: "LC_T20_SEASON_STATE_V1",
    seasonId: built.seasonId,
    gameId: built.gameId,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    schedule: built.schedule,
    careerState: built.careerState,
    projection,
    completedMatches: [],
    revision: 0,
    phase: "ACTIVE",
  });
  const lifecycle = createInitialPlayerLifecycleState({
    worldIdentity,
    baseWorld: world,
    worldCopy: input.worldCopy ?? null,
    seasonNumber: 1,
    calendarYear,
    useRosterPackImmediately: false,
  });
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: [],
      activeSeason: currentSeason,
    }),
  );
  return sealPersistentWorldStateV2({
    worldStateVersion: PERSISTENT_WORLD_STATE_V2_VERSION,
    worldIdentity,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    currentSeasonNumber: 1,
    currentCalendarYear: calendarYear,
    currentSeason,
    completedSeasons: [],
    careerProjection,
    lifecycle: expectLifecycleV1(lifecycle),
    lastRolloverReceipt: null,
    revision: 0,
  });
}

export async function rebuildPersistentWorldStateV2(
  worldState: PersistentWorldStateV2,
  nextSeason: ActivePersistentSeasonState,
  nextLifecycle: PlayerLifecycleState,
  nextRevision: number,
): Promise<PersistentWorldStateV2> {
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldState.worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: worldState.completedSeasons,
      activeSeason: nextSeason,
    }),
  );
  return sealPersistentWorldStateV2({
    worldStateVersion: PERSISTENT_WORLD_STATE_V2_VERSION,
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    currentSeasonNumber: worldState.currentSeasonNumber,
    currentCalendarYear: worldState.currentCalendarYear,
    currentSeason: expectSeasonPolicyV1(nextSeason),
    completedSeasons: worldState.completedSeasons,
    careerProjection,
    lifecycle: expectLifecycleV1(nextLifecycle),
    lastRolloverReceipt: worldState.lastRolloverReceipt,
    revision: nextRevision,
  });
}

export async function rolloverPersistentWorldCareerSeasonV2(
  worldState: PersistentWorldStateV2,
  nextRevision = worldState.revision + 1,
): Promise<{ nextState: PersistentWorldStateV2; closedRecord: CompletedSeasonRecord }> {
  const { closedRecord, completedSeasons, nextSeasonNumber, nextCalendarYear, nextStartDate } =
    await closeCurrentSeason(worldState);
  const seasonPlayerStats = worldState.currentSeason.projection.players.map((p) => ({
    playerId: p.playerId,
    matches: p.matches,
    ballsFaced: p.ballsFaced,
    bowlingLegalBalls: p.bowlingLegalBalls,
  }));
  const nextLifecycle = advancePlayerLifecycleAtSeasonClose({
    lifecycle: worldState.lifecycle,
    worldIdentity: worldState.worldIdentity,
    fromSeasonNumber: worldState.currentSeasonNumber,
    toSeasonNumber: nextSeasonNumber,
    closedCalendarYear: worldState.currentCalendarYear,
    nextCalendarYear,
    seasonPlayerStats,
    controlledTeamId: worldState.controlledTeamId,
  });
  const nextCurrentSeason = await createLifecycleSeasonStateForWorld({
    worldIdentity: worldState.worldIdentity,
    rosterPack: nextLifecycle.activeRosterPack!,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    seasonNumber: nextSeasonNumber,
    calendarYear: nextCalendarYear,
    startDate: nextStartDate,
    priorSeasonFinalStateSha256: closedRecord.finalSeasonStateSha256,
    carryForwardDirectives: worldState.currentSeason.careerState.trainingAssignments,
  });
  const { careerProjection, receipt } = await rolloverProjectionAndReceipt(
    worldState,
    { closedRecord, completedSeasons, nextSeasonNumber },
    nextCurrentSeason,
  );
  const nextState = await sealPersistentWorldStateV2({
    worldStateVersion: PERSISTENT_WORLD_STATE_V2_VERSION,
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    currentSeasonNumber: nextSeasonNumber,
    currentCalendarYear: nextCalendarYear,
    currentSeason: expectSeasonPolicyV1(nextCurrentSeason),
    completedSeasons,
    careerProjection,
    lifecycle: expectLifecycleV1(nextLifecycle),
    lastRolloverReceipt: receipt,
    revision: nextRevision,
  });
  return { nextState, closedRecord };
}

export async function copyCompletedSingleSeasonToPersistentWorldStateV2(input: {
  sourceSaveId: string;
  sourceState: T20SeasonState;
  worldId: string;
  newCareerId: string;
  baseSeed: string;
  worldCopy?: NewGameWorldCopy | null;
}): Promise<PersistentWorldStateV2> {
  const { sourceState } = input;
  if (sourceState.phase !== "COMPLETE") {
    throw new Error(
      "Complete all 56 fixtures in the single-season career before copying into a multi-season world.",
    );
  }
  const closedCalendarYear =
    Number.parseInt(sourceState.schedule.startDate.slice(0, 4), 10) ||
    INITIAL_PERSISTENT_CALENDAR_YEAR;
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: input.worldId,
    baseSeed: input.baseSeed,
    originKind: "COPIED_FROM_SINGLE_SEASON_V1",
    sourceSingleSeasonSaveId: input.sourceSaveId,
    sourceSingleSeasonFinalStateSha256: sourceState.stateSha256,
  });
  const closedRecord = await sealCompletedSeasonRecord({
    seasonNumber: 1,
    calendarYear: closedCalendarYear,
    completedSeasonState: sourceState,
    completedAt: deterministicSeasonCompletedAt(sourceState),
  });
  const completedSeasons = [closedRecord];
  const { nextCalendarYear, nextStartDate } = advancePersistentSeasonCalendar({
    closedCalendarYear,
    closedEndDate: sourceState.careerState.finalScheduledDate,
    seasonStartMonthDay: sourceState.schedule.startDate.slice(5, 10),
  });
  let initialLifecycle = createInitialPlayerLifecycleState({
    worldIdentity,
    baseWorld: world,
    worldCopy: input.worldCopy ?? null,
    seasonNumber: 1,
    calendarYear: closedCalendarYear,
    useRosterPackImmediately: false,
  });
  const elapsedDays = dateDiffDays(
    sourceState.schedule.startDate,
    sourceState.careerState.currentDate,
  );
  initialLifecycle = recordElapsedTrainingExposure(
    initialLifecycle,
    sourceState.careerState.trainingAssignments,
    elapsedDays,
    sourceState.controlledTeamId,
  );
  const nextLifecycle = advancePlayerLifecycleAtSeasonClose({
    lifecycle: initialLifecycle,
    worldIdentity,
    fromSeasonNumber: 1,
    toSeasonNumber: 2,
    closedCalendarYear,
    nextCalendarYear,
    seasonPlayerStats: sourceState.projection.players.map((p) => ({
      playerId: p.playerId,
      matches: p.matches,
      ballsFaced: p.ballsFaced,
      bowlingLegalBalls: p.bowlingLegalBalls,
    })),
    controlledTeamId: sourceState.controlledTeamId,
  });
  const currentSeason = await createLifecycleSeasonStateForWorld({
    worldIdentity,
    rosterPack: nextLifecycle.activeRosterPack!,
    careerId: input.newCareerId,
    controlledTeamId: sourceState.controlledTeamId,
    seasonNumber: 2,
    calendarYear: nextCalendarYear,
    startDate: nextStartDate,
    priorSeasonFinalStateSha256: closedRecord.finalSeasonStateSha256,
    carryForwardDirectives: sourceState.careerState.trainingAssignments,
  });
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons,
      activeSeason: currentSeason,
    }),
  );
  const receipt = PersistentWorldRolloverReceiptSchema.parse({
    receiptVersion: PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
    fromSeasonNumber: 1,
    toSeasonNumber: 2,
    closedSeasonId: closedRecord.seasonId,
    closedSeasonStateSha256: closedRecord.finalSeasonStateSha256,
    closedSeasonRecordSha256: closedRecord.recordSha256,
    nextSeasonId: currentSeason.seasonId,
    nextStartDate: seasonStartDateOf(currentSeason),
    nextScheduleSha256: currentSeason.schedule.scheduleSha256,
  });
  return sealPersistentWorldStateV2({
    worldStateVersion: PERSISTENT_WORLD_STATE_V2_VERSION,
    worldIdentity,
    careerId: input.newCareerId,
    controlledTeamId: sourceState.controlledTeamId,
    currentSeasonNumber: 2,
    currentCalendarYear: nextCalendarYear,
    currentSeason: expectSeasonPolicyV1(currentSeason),
    completedSeasons,
    careerProjection,
    lifecycle: expectLifecycleV1(nextLifecycle),
    lastRolloverReceipt: receipt,
    revision: 0,
  });
}

type EconomyWorldState = PersistentWorldStateV3 | PersistentWorldStateV4 | PersistentWorldStateV5 | PersistentWorldStateV6;
type EconomyWorldVersion = EconomyWorldState["worldStateVersion"];

/**
 * Seals a contracts-era world as V3 (lifecycle V1) or V4 (lifecycle V2, bounded embedded packs); the
 * lifecycle's version is checked against the world's. docs/design/WORLD_STATE_HISTORY_V4.md
 */
async function sealEconomyWorld(
  worldStateVersion: EconomyWorldVersion,
  input: Omit<PersistentWorldStateV3Core, "worldStateVersion" | "lifecycle" | "currentSeason"> & {
    lifecycle: PlayerLifecycleState;
    currentSeason: ActivePersistentSeasonState;
  },
): Promise<EconomyWorldState> {
  const { currentSeason, ...rest } = input;
  if (worldStateVersion === PERSISTENT_WORLD_STATE_V6_VERSION) {
    return sealPersistentWorldStateV6({
      ...rest,
      worldStateVersion,
      currentSeason: expectSeasonPolicyV2(currentSeason),
      lifecycle: expectLifecycleV2(rest.lifecycle),
    });
  }
  const core = { ...rest, currentSeason: expectSeasonPolicyV1(currentSeason) };
  if (worldStateVersion === PERSISTENT_WORLD_STATE_V5_VERSION) {
    return sealPersistentWorldStateV5({ ...core, worldStateVersion, lifecycle: expectLifecycleV2(core.lifecycle) });
  }
  return worldStateVersion === PERSISTENT_WORLD_STATE_V4_VERSION
    ? sealPersistentWorldStateV4({ ...core, worldStateVersion, lifecycle: expectLifecycleV2(core.lifecycle) })
    : sealPersistentWorldStateV3({ ...core, worldStateVersion, lifecycle: expectLifecycleV1(core.lifecycle) });
}

/** The season state version a world's lifecycle seasons are created with: V2 only in world state V6. */
export function lifecycleSeasonVersionFor(worldStateVersion: string) {
  return worldStateVersion === PERSISTENT_WORLD_STATE_V6_VERSION ? LIFECYCLE_SEASON_STATE_V2_VERSION : LIFECYCLE_SEASON_STATE_VERSION;
}

/**
 * The world version a season rollover writes: a V5 career becomes V6 when it starts its next season
 * (owner decision, 25 November 2026; docs/pavilion/CAREER_FIXTURE_POLICY_V2.md). V3 and V4 stay as they are.
 */
export function worldVersionAfterRollover(worldStateVersion: EconomyWorldVersion): EconomyWorldVersion {
  return worldStateVersion === PERSISTENT_WORLD_STATE_V5_VERSION ? PERSISTENT_WORLD_STATE_V6_VERSION : worldStateVersion;
}

export async function createInitialPersistentWorldCareerStateV3(input: {
  worldId: string;
  careerId: string;
  baseSeed: string;
  controlledTeamId: string | null;
  calendarYear?: number;
  startDate?: string;
  worldCopy?: NewGameWorldCopy | null;
  /** V4 (bounded embedded packs) for new careers; V3 kept for compatibility. */
  worldStateVersion?: EconomyWorldVersion;
}): Promise<EconomyWorldState> {
  const worldStateVersion = input.worldStateVersion ?? PERSISTENT_WORLD_STATE_V3_VERSION;
  const startDate = input.startDate ?? INITIAL_PERSISTENT_START_DATE;
  const calendarYear =
    input.calendarYear ??
    (Number.parseInt(startDate.slice(0, 4), 10) || INITIAL_PERSISTENT_CALENDAR_YEAR);
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: input.worldId,
    baseSeed: input.baseSeed,
    originKind: "NEW_PERSISTENT_CAREER",
  });
  const lifecycle = createInitialPlayerLifecycleState({
    worldIdentity,
    baseWorld: world,
    worldCopy: input.worldCopy ?? null,
    seasonNumber: 1,
    calendarYear,
    useRosterPackImmediately: true,
    lifecycleVersion:
      worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION ? PLAYER_LIFECYCLE_STATE_VERSION : PLAYER_LIFECYCLE_STATE_V2_VERSION,
  });
  const currentSeason = await createLifecycleSeasonStateForWorld({
    worldIdentity,
    rosterPack: lifecycle.activeRosterPack!,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    seasonNumber: 1,
    calendarYear,
    startDate,
    priorSeasonFinalStateSha256: null,
    seasonStateVersion: lifecycleSeasonVersionFor(worldStateVersion),
  });
  const economy = createInitialSquadEconomyState({
    worldIdentity,
    lifecycle,
    seasonNumber: 1,
    calendarYear,
    currentDate: startDate,
  });
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: [],
      activeSeason: currentSeason,
    }),
  );
  return sealEconomyWorld(worldStateVersion, {
    worldIdentity,
    careerId: input.careerId,
    controlledTeamId: input.controlledTeamId,
    currentSeasonNumber: 1,
    currentCalendarYear: calendarYear,
    currentSeason,
    completedSeasons: [],
    careerProjection,
    lifecycle,
    economy,
    lastRolloverReceipt: null,
    revision: 0,
  });
}

export async function rebuildPersistentWorldStateV3(
  worldState: EconomyWorldState,
  nextSeason: ActivePersistentSeasonState,
  nextLifecycle: PlayerLifecycleState,
  nextEconomy: SquadEconomyState,
  nextRevision: number,
): Promise<EconomyWorldState> {
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldState.worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons: worldState.completedSeasons,
      activeSeason: nextSeason,
    }),
  );
  return sealEconomyWorld(worldState.worldStateVersion, {
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    currentSeasonNumber: worldState.currentSeasonNumber,
    currentCalendarYear: worldState.currentCalendarYear,
    currentSeason: nextSeason,
    completedSeasons: worldState.completedSeasons,
    careerProjection,
    lifecycle: nextLifecycle,
    economy: nextEconomy,
    lastRolloverReceipt: worldState.lastRolloverReceipt,
    revision: nextRevision,
  });
}

export async function rolloverPersistentWorldCareerSeasonV3(
  worldState: EconomyWorldState,
  nextRevision = worldState.revision + 1,
): Promise<{ nextState: EconomyWorldState; closedRecord: CompletedSeasonRecord }> {
  const { closedRecord, completedSeasons, nextSeasonNumber, nextCalendarYear, nextStartDate } =
    await closeCurrentSeason(worldState);
  const seasonPlayerStats = worldState.currentSeason.projection.players.map((p) => ({
    playerId: p.playerId,
    matches: p.matches,
    runs: p.runs,
    wickets: p.bowlingWickets,
    ballsFaced: p.ballsFaced,
    bowlingLegalBalls: p.bowlingLegalBalls,
  }));
  const advanced = advanceLifecycleAndEconomyAtSeasonClose({
    lifecycle: worldState.lifecycle,
    economy: worldState.economy,
    worldIdentity: worldState.worldIdentity,
    fromSeasonNumber: worldState.currentSeasonNumber,
    toSeasonNumber: nextSeasonNumber,
    closedCalendarYear: worldState.currentCalendarYear,
    nextCalendarYear,
    rolloverDate: nextStartDate,
    seasonPlayerStats,
    controlledTeamId: worldState.controlledTeamId,
  });
  const nextWorldStateVersion = worldVersionAfterRollover(worldState.worldStateVersion);
  const nextCurrentSeason = await createLifecycleSeasonStateForWorld({
    worldIdentity: worldState.worldIdentity,
    rosterPack: advanced.lifecycle.activeRosterPack!,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    seasonNumber: nextSeasonNumber,
    calendarYear: nextCalendarYear,
    startDate: nextStartDate,
    priorSeasonFinalStateSha256: closedRecord.finalSeasonStateSha256,
    carryForwardDirectives: worldState.currentSeason.careerState.trainingAssignments,
    seasonStateVersion: lifecycleSeasonVersionFor(nextWorldStateVersion),
  });
  const { careerProjection, receipt } = await rolloverProjectionAndReceipt(
    worldState,
    { closedRecord, completedSeasons, nextSeasonNumber },
    nextCurrentSeason,
  );
  const nextState = await sealEconomyWorld(nextWorldStateVersion, {
    worldIdentity: worldState.worldIdentity,
    careerId: worldState.careerId,
    controlledTeamId: worldState.controlledTeamId,
    currentSeasonNumber: nextSeasonNumber,
    currentCalendarYear: nextCalendarYear,
    currentSeason: nextCurrentSeason,
    completedSeasons,
    careerProjection,
    lifecycle: advanced.lifecycle,
    economy: advanced.economy,
    lastRolloverReceipt: receipt,
    revision: nextRevision,
  });
  return { nextState, closedRecord };
}

export async function copyCompletedSingleSeasonToPersistentWorldStateV3(input: {
  sourceSaveId: string;
  sourceState: T20SeasonState;
  worldId: string;
  newCareerId: string;
  baseSeed: string;
  worldCopy?: NewGameWorldCopy | null;
  /** V4 (bounded embedded packs) for new worlds; V3 kept for compatibility. */
  worldStateVersion?: EconomyWorldVersion;
}): Promise<EconomyWorldState> {
  const worldStateVersion = input.worldStateVersion ?? PERSISTENT_WORLD_STATE_V3_VERSION;
  const { sourceState } = input;
  if (sourceState.phase !== "COMPLETE") {
    throw new Error(
      "Complete all 56 fixtures in the single-season career before copying into a multi-season world.",
    );
  }
  const closedCalendarYear =
    Number.parseInt(sourceState.schedule.startDate.slice(0, 4), 10) ||
    INITIAL_PERSISTENT_CALENDAR_YEAR;
  const worldIdentity = derivePersistentWorldIdentity({
    worldId: input.worldId,
    baseSeed: input.baseSeed,
    originKind: "COPIED_FROM_SINGLE_SEASON_V1",
    sourceSingleSeasonSaveId: input.sourceSaveId,
    sourceSingleSeasonFinalStateSha256: sourceState.stateSha256,
  });
  const closedRecord = await sealCompletedSeasonRecord({
    seasonNumber: 1,
    calendarYear: closedCalendarYear,
    completedSeasonState: sourceState,
    completedAt: deterministicSeasonCompletedAt(sourceState),
  });
  const completedSeasons = [closedRecord];
  const { nextCalendarYear, nextStartDate } = advancePersistentSeasonCalendar({
    closedCalendarYear,
    closedEndDate: sourceState.careerState.finalScheduledDate,
    seasonStartMonthDay: sourceState.schedule.startDate.slice(5, 10),
  });
  let initialLifecycle = createInitialPlayerLifecycleState({
    worldIdentity,
    baseWorld: world,
    worldCopy: input.worldCopy ?? null,
    seasonNumber: 1,
    calendarYear: closedCalendarYear,
    useRosterPackImmediately: true,
    lifecycleVersion:
      worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION ? PLAYER_LIFECYCLE_STATE_VERSION : PLAYER_LIFECYCLE_STATE_V2_VERSION,
  });
  const elapsedDays = dateDiffDays(
    sourceState.schedule.startDate,
    sourceState.careerState.currentDate,
  );
  initialLifecycle = recordElapsedTrainingExposure(
    initialLifecycle,
    sourceState.careerState.trainingAssignments,
    elapsedDays,
    sourceState.controlledTeamId,
  );
  const initialEconomy = createInitialSquadEconomyState({
    worldIdentity,
    lifecycle: initialLifecycle,
    seasonNumber: 1,
    calendarYear: closedCalendarYear,
    currentDate: sourceState.schedule.startDate,
  });
  const advanced = advanceLifecycleAndEconomyAtSeasonClose({
    lifecycle: initialLifecycle,
    economy: initialEconomy,
    worldIdentity,
    fromSeasonNumber: 1,
    toSeasonNumber: 2,
    closedCalendarYear,
    nextCalendarYear,
    rolloverDate: nextStartDate,
    seasonPlayerStats: sourceState.projection.players.map((p) => ({
      playerId: p.playerId,
      matches: p.matches,
      runs: p.runs,
      wickets: p.bowlingWickets,
      ballsFaced: p.ballsFaced,
      bowlingLegalBalls: p.bowlingLegalBalls,
    })),
    controlledTeamId: sourceState.controlledTeamId,
  });
  const currentSeason = await createLifecycleSeasonStateForWorld({
    worldIdentity,
    rosterPack: advanced.lifecycle.activeRosterPack!,
    careerId: input.newCareerId,
    controlledTeamId: sourceState.controlledTeamId,
    seasonNumber: 2,
    calendarYear: nextCalendarYear,
    startDate: nextStartDate,
    priorSeasonFinalStateSha256: closedRecord.finalSeasonStateSha256,
    carryForwardDirectives: sourceState.careerState.trainingAssignments,
    seasonStateVersion: lifecycleSeasonVersionFor(worldStateVersion),
  });
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons,
      activeSeason: currentSeason,
    }),
  );
  const receipt = PersistentWorldRolloverReceiptSchema.parse({
    receiptVersion: PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
    fromSeasonNumber: 1,
    toSeasonNumber: 2,
    closedSeasonId: closedRecord.seasonId,
    closedSeasonStateSha256: closedRecord.finalSeasonStateSha256,
    closedSeasonRecordSha256: closedRecord.recordSha256,
    nextSeasonId: currentSeason.seasonId,
    nextStartDate: seasonStartDateOf(currentSeason),
    nextScheduleSha256: currentSeason.schedule.scheduleSha256,
  });
  return sealEconomyWorld(worldStateVersion, {
    worldIdentity,
    careerId: input.newCareerId,
    controlledTeamId: sourceState.controlledTeamId,
    currentSeasonNumber: 2,
    currentCalendarYear: nextCalendarYear,
    currentSeason,
    completedSeasons,
    careerProjection,
    lifecycle: advanced.lifecycle,
    economy: advanced.economy,
    lastRolloverReceipt: receipt,
    revision: 0,
  });
}


/**
 * Copies a world state V3 or V4 career into world state V5 (docs/design/WORLD_STATE_V5_SEASON_REFS.md),
 * changing nothing a player can see: the same world identity, seasons, economy and match history. A V3
 * lifecycle becomes lifecycle V2, which embeds only the two newest roster packs; the caller must store every
 * pack as a row (they are returned for that). A V4 lifecycle is already V2 and is kept as it is.
 */
export async function copyEconomyWorldForwardToV5(
  source: PersistentWorldStateV3 | PersistentWorldStateV4,
): Promise<{ state: PersistentWorldStateV5; embeddedRosterPacks: StagedRosterPack[] }> {
  const embeddedRosterPacks = [...source.lifecycle.historicalRosterPacks];
  const lifecycle =
    source.lifecycle.lifecycleVersion === PLAYER_LIFECYCLE_STATE_V2_VERSION
      ? source.lifecycle
      : sealPlayerLifecycleState({
          ...lifecycleCoreOf(source.lifecycle),
          lifecycleVersion: PLAYER_LIFECYCLE_STATE_V2_VERSION,
          historicalRosterPacks: source.lifecycle.historicalRosterPacks.slice(-MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS),
        });
  const { stateSha256: _stateSha256, worldStateVersion: _version, ...core } = source;
  void _stateSha256;
  void _version;
  const state = await sealPersistentWorldStateV5({
    ...core,
    currentSeason: expectSeasonPolicyV1(core.currentSeason),
    worldStateVersion: PERSISTENT_WORLD_STATE_V5_VERSION,
    lifecycle: expectLifecycleV2(lifecycle),
  });
  return { state, embeddedRosterPacks };
}

function lifecycleCoreOf(lifecycle: PlayerLifecycleState): Omit<PlayerLifecycleState, "lifecycleSha256"> {
  const { lifecycleSha256: _sha, ...core } = lifecycle;
  void _sha;
  return core;
}
