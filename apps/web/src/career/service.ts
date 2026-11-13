import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import {
  canonicalJson,
  PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION,
  PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
  PERSISTENT_WORLD_STATE_VERSION,
  PersistentWorldRolloverReceiptSchema,
  T20SeasonMatchCompletionSchema,
  type CompletedCareerMatchEventArchive,
  type CompletedSeasonRecord,
  type MatchConditionDelta,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type PersistentWorldState,
  type SeasonArchive,
  type SeasonCheckpointInspection,
  type SeasonFixture,
  type SeasonSaveSummary,
  type T20Scorecard,
  type T20SeasonMatchCompletion,
  type T20SeasonState,
  type T20TeamSelection,
  type TrainingDirective,
  type WorldPack,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  FROZEN_WORLD_PINS,
  T20_LEAGUE_COMPETITION,
  validateDefaultWorld,
} from "@lcxxvi/data";
import {
  advanceCareerDayV2,
  advancePersistentSeasonCalendar,
  applyMatchConditionDeltaV2,
  createCareerDayStateV2,
  createCompletedCareerMatchEventArchive,
  createPersistentSeasonScheduleAndDayState,
  createStateHasher,
  derivePersistentWorldIdentity,
  generateSeasonSchedule,
  INITIAL_PERSISTENT_CALENDAR_YEAR,
  INITIAL_PERSISTENT_START_DATE,
  projectSquadTrainingCondition,
  rehydrateT20Session,
  replayCareerMatchEventArchive,
  selectOffscreenFixtureTeams,
  setTrainingDirective,
  simulateOffscreenFixture,
  type CareerArchivedReplaySummary,
} from "@lcxxvi/simulation";
import {
  applyT20SeasonMatchCompletion,
  completionFromOffscreenOutcome,
  createT20SeasonProjection,
  rebuildPersistentCareerProjectionCore,
} from "@lcxxvi/projections";
import {
  collectPersistentWorldCompletions,
  createPersistentWorldPortableArchive,
  createSeasonPortableArchive,
  createT20SeasonArchive,
  describeSeasonPersistenceError,
  IndexedDbPersistentWorldRepository,
  IndexedDbSeasonRepository,
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchive,
  readSeasonPortableArchive,
  sealCompletedSeasonRecord,
  sealPersistentCareerProjection,
  sealPersistentWorldState,
  sealT20SeasonState,
  SEASON_RECORD_TYPE,
  type PersistentWorldDurableCommit,
  type PersistentWorldLoadResult,
  type SeasonDurableCommit,
  type SeasonLoadResult,
  type SeasonPersistenceErrorDescription,
} from "@lcxxvi/persistence";
import { validateNewGameWorldCopy } from "../world/new-game-world.js";
import { managedMatchGameId } from "./managed-game-id.js";

const worldBytes = new TextEncoder().encode(worldText);
const world = validateDefaultWorld(JSON.parse(worldText), worldManifest).world;
const hasher = createStateHasher();
const START_DATE = "2027-01-03";
const FINAL_COMPLETED_AT_SUFFIX = "T23:59:59.000Z";

function immutableWorldCopy(raw: NewGameWorldCopy): NewGameWorldCopy {
  const copy = validateNewGameWorldCopy(raw, world);
  function freeze(value: unknown): void {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  freeze(copy);
  return copy;
}

export type SaveStatus = "Idle" | "Saving" | "Saved" | "Read-only" | "Recovered" | "Error";
export type CareerSaveMode = "PERSISTENT_WORLD" | "SINGLE_SEASON_V1";

export type CareerSlotSummary = SeasonSaveSummary & {
  careerMode: CareerSaveMode;
  worldId: string | null;
  currentSeasonNumber: number;
  currentCalendarYear: number;
  completedSeasonCount: number;
};

type CareerUserMatchLaunchCore = {
  saveId: string;
  seasonId: string;
  scheduleSha256: string;
  fixtureId: string;
  fixtureOrdinal: number;
  roundNumber: number;
  matchDayDate: string;
  homeTeamId: string;
  awayTeamId: string;
  groundId: string;
  matchId: string;
  matchGameId: string;
  matchSeed: string;
  selections: [T20TeamSelection, T20TeamSelection];
  careerStateSha256: string;
  managedTeamId?: string;
};
export type CareerUserMatchLaunch = CareerUserMatchLaunchCore & (
  | { launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V1" }
  | { launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V2"; worldCopy: NewGameWorldCopy }
  | {
      launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER";
      rosterPack: import("@lcxxvi/contracts").StagedRosterPack;
    }
);

export type CareerUserMatchResult = {
  resultVersion: "LC_CAREER_USER_MATCH_RESULT_V1";
  seasonId: string;
  scheduleSha256: string;
  fixtureId: string;
  matchId: string;
  fixtureOrdinal: number;
  roundNumber: number;
  matchDayDate: string;
  homeTeamId: string;
  awayTeamId: string;
  selectedTeams: [T20TeamSelection, T20TeamSelection];
  scorecard: T20Scorecard;
  scorecardSha256: string;
  finalEventHash: string;
  sourceCompletionSha256: string;
  conditionDelta: MatchConditionDelta;
  completedSession?: unknown;
};

export const careerWorld = world;

function token(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function deterministicSeasonCompletedAt(state: T20SeasonState): string {
  return `${state.schedule.rounds.at(-1)!.matchDayDate}${FINAL_COMPLETED_AT_SUFFIX}`;
}

function stateCore(state: T20SeasonState) {
  const { stateSha256: _hash, ...core } = state;
  void _hash;
  return core;
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
};

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

export async function rolloverPersistentWorldCareerSeason(
  worldState: PersistentWorldState,
  nextRevision = worldState.revision + 1,
): Promise<{ nextState: PersistentWorldState; closedRecord: CompletedSeasonRecord }> {
  if (worldState.currentSeason.phase !== "COMPLETE") {
    throw new Error("Complete all 56 fixtures before closing the season.");
  }
  const closedRecord = await sealCompletedSeasonRecord({
    seasonNumber: worldState.currentSeasonNumber,
    calendarYear: worldState.currentCalendarYear,
    completedSeasonState: worldState.currentSeason,
    completedAt: deterministicSeasonCompletedAt(worldState.currentSeason),
  });
  const completedSeasons = [...worldState.completedSeasons, closedRecord];
  const nextSeasonNumber = worldState.currentSeasonNumber + 1;
  const { nextCalendarYear, nextStartDate } = advancePersistentSeasonCalendar({
    closedCalendarYear: worldState.currentCalendarYear,
    closedEndDate: worldState.currentSeason.careerState.finalScheduledDate,
    seasonStartMonthDay: worldState.currentSeason.schedule.startDate.slice(5, 10),
  });
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
  const careerProjection = await sealPersistentCareerProjection(
    rebuildPersistentCareerProjectionCore({
      worldId: worldState.worldIdentity.worldId,
      teamIds: T20_LEAGUE_COMPETITION.teamIds,
      completedSeasons,
      activeSeason: nextCurrentSeason,
    }),
  );
  const receipt = PersistentWorldRolloverReceiptSchema.parse({
    receiptVersion: PERSISTENT_WORLD_ROLLOVER_RECEIPT_VERSION,
    fromSeasonNumber: worldState.currentSeasonNumber,
    toSeasonNumber: nextSeasonNumber,
    closedSeasonId: closedRecord.seasonId,
    closedSeasonStateSha256: closedRecord.finalSeasonStateSha256,
    closedSeasonRecordSha256: closedRecord.recordSha256,
    nextSeasonId: nextCurrentSeason.seasonId,
    nextStartDate: nextCurrentSeason.schedule.startDate,
    nextScheduleSha256: nextCurrentSeason.schedule.scheduleSha256,
  });
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

export type CareerReplayOutcome =
  | {
      status: "READY";
      archive: CompletedCareerMatchEventArchive;
      replay: CareerArchivedReplaySummary;
    }
  | { status: "UNAVAILABLE" }
  | { status: "DAMAGED"; message: string };

export type CareerSeasonRepository = {
  list(): Promise<SeasonSaveSummary[]>;
  acquireLease(saveId: string, ownerId: string, now: number): Promise<boolean>;
  releaseLease(saveId: string, ownerId: string): Promise<void>;
  commit(input: SeasonDurableCommit): Promise<SeasonSaveSummary>;
  load(saveId: string): Promise<SeasonLoadResult | null>;
  activeSaveId(): Promise<string | null>;
  clearActiveSaveId(saveId: string): Promise<void>;
  loadMatchEventArchives?(
    saveId: string,
    state?: T20SeasonState,
  ): Promise<{
    archives: CompletedCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }>;
  inspectCheckpoints?(saveId: string): Promise<SeasonCheckpointInspection>;
  loadGeneration?(saveId: string, generation: number): Promise<SeasonLoadResult>;
};

export type CareerPersistentWorldRepository = {
  recordTypeOf(saveId: string): Promise<string | null>;
  list(): Promise<PersistentWorldSaveSummary[]>;
  acquireLease(saveId: string, ownerId: string, now: number): Promise<boolean>;
  releaseLease(saveId: string, ownerId: string): Promise<void>;
  commit(
    input: PersistentWorldDurableCommit,
  ): Promise<{ summary: PersistentWorldSaveSummary; idempotentReplay: boolean }>;
  load(saveId: string): Promise<PersistentWorldLoadResult | null>;
  activeSaveId(): Promise<string | null>;
  clearActiveSaveId(saveId: string): Promise<void>;
  loadMatchEventArchives?(
    saveId: string,
    worldState?: PersistentWorldState,
  ): Promise<{
    archives: CompletedCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }>;
  inspectCheckpoints?(saveId: string): Promise<SeasonCheckpointInspection>;
  loadGeneration?(saveId: string, generation: number): Promise<PersistentWorldLoadResult>;
};

function toSlotSummaryFromSingle(summary: SeasonSaveSummary): CareerSlotSummary {
  return {
    ...summary,
    careerMode: "SINGLE_SEASON_V1",
    worldId: null,
    currentSeasonNumber: 1,
    currentCalendarYear:
      Number.parseInt(summary.currentDate.slice(0, 4), 10) || INITIAL_PERSISTENT_CALENDAR_YEAR,
    completedSeasonCount: summary.phase === "COMPLETE" ? 1 : 0,
  };
}

function toSlotSummaryFromPersistent(summary: PersistentWorldSaveSummary): CareerSlotSummary {
  return {
    saveId: summary.saveId,
    kind: summary.kind,
    title: summary.title,
    seasonId: summary.seasonId,
    careerId: summary.careerId,
    controlledTeamId: summary.controlledTeamId,
    currentDate: summary.currentDate,
    revision: summary.revision,
    completedFixtures: summary.completedFixtures,
    phase: summary.phase,
    stateSha256: summary.stateSha256,
    updatedAt: summary.updatedAt,
    careerMode: "PERSISTENT_WORLD",
    worldId: summary.worldId,
    currentSeasonNumber: summary.currentSeasonNumber,
    currentCalendarYear: summary.currentCalendarYear,
    completedSeasonCount: summary.completedSeasonCount,
  };
}

export class CareerApplicationService {
  private readonly repository: CareerSeasonRepository;
  private readonly persistentRepository: CareerPersistentWorldRepository | null;
  private readonly listeners = new Set<() => void>();
  private state: T20SeasonState | null = null;
  private persistentState: PersistentWorldState | null = null;
  private saveTitle: string | null = null;
  private worldCopy: NewGameWorldCopy | null = null;
  private saveId: string | null = null;
  private ownerId: string;
  private readOnly = false;
  private recovered = false;
  private status: SaveStatus = "Idle";
  private error = "";

  constructor(
    ownerId?: string,
    repository?: CareerSeasonRepository,
    /** Called when a damaged career is continued in a new recovered slot, so its pending match links can follow it. */
    private readonly onRecovered?: (fromSaveId: string, toSaveId: string) => Promise<void>,
    persistentRepository?: CareerPersistentWorldRepository | null,
  ) {
    this.ownerId = ownerId ?? token("career-tab");
    this.repository = repository ?? new IndexedDbSeasonRepository();
    this.persistentRepository =
      persistentRepository !== undefined
        ? persistentRepository
        : repository
          ? null
          : new IndexedDbPersistentWorldRepository();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  getState(): T20SeasonState | null {
    return this.state;
  }

  getPersistentState(): PersistentWorldState | null {
    return this.persistentState;
  }

  isPersistentWorld(): boolean {
    return this.persistentState !== null;
  }

  getWorld(): WorldPack {
    return this.worldCopy?.world ?? world;
  }

  getWorldCopy(): NewGameWorldCopy | null {
    return this.worldCopy ? structuredClone(this.worldCopy) : null;
  }

  getSaveId(): string | null {
    return this.saveId;
  }

  getStatus(): SaveStatus {
    return this.status;
  }

  getError(): string {
    return this.error;
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  wasRecovered(): boolean {
    return this.recovered;
  }

  async listCareers(): Promise<CareerSlotSummary[]> {
    const singleRows = (await this.repository.list()).map(toSlotSummaryFromSingle);
    const persistentRows = this.persistentRepository
      ? (await this.persistentRepository.list()).map(toSlotSummaryFromPersistent)
      : [];
    return [...persistentRows, ...singleRows].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  private async isPersistentSlot(saveId: string): Promise<boolean> {
    if (!this.persistentRepository) return false;
    return (await this.persistentRepository.recordTypeOf(saveId)) === PERSISTENT_WORLD_RECORD_TYPE;
  }

  private async releaseCurrentLease(): Promise<void> {
    if (!this.saveId || this.readOnly) return;
    if (this.persistentState && this.persistentRepository) {
      await this.persistentRepository.releaseLease(this.saveId, this.ownerId);
    } else {
      await this.repository.releaseLease(this.saveId, this.ownerId);
    }
  }

  /** Best-effort release of the writer lease when the page goes away. The lease still expires on its own. */
  async releaseWriter(): Promise<void> {
    if (this.saveId && !this.readOnly) {
      await this.releaseCurrentLease();
      this.readOnly = true;
    }
  }

  async leaveCareer(): Promise<void> {
    if (this.saveId) {
      await this.releaseCurrentLease();
      if (this.persistentState && this.persistentRepository) {
        await this.persistentRepository.clearActiveSaveId(this.saveId);
      } else {
        await this.repository.clearActiveSaveId(this.saveId);
      }
    }
    this.state = null;
    this.persistentState = null;
    this.saveTitle = null;
    this.worldCopy = null;
    this.saveId = null;
    this.readOnly = false;
    this.recovered = false;
    this.setStatus("Idle");
  }

  private setStatus(status: SaveStatus, error = ""): void {
    this.status = status;
    this.error = error;
    this.emit();
  }

  async boot(): Promise<void> {
    try {
      const active = this.persistentRepository
        ? (await this.persistentRepository.activeSaveId()) ?? (await this.repository.activeSaveId())
        : await this.repository.activeSaveId();
      if (!active) {
        this.setStatus("Idle");
        return;
      }
      await this.loadCareer(active);
    } catch (error) {
      this.setStatus("Error", error instanceof Error ? error.message : "Career load failed.");
    }
  }

  async inspectActiveCareer(): Promise<void> {
    const saveId = this.persistentRepository
      ? (await this.persistentRepository.activeSaveId()) ?? (await this.repository.activeSaveId())
      : await this.repository.activeSaveId();
    if (!saveId) {
      this.state = null;
      this.persistentState = null;
      this.saveTitle = null;
      this.worldCopy = null;
      this.saveId = null;
      this.readOnly = true;
      this.setStatus("Idle");
      return;
    }
    if (await this.isPersistentSlot(saveId)) {
      const loaded = await this.persistentRepository!.load(saveId);
      if (!loaded) throw new Error("Career save not found.");
      this.persistentState = loaded.state;
      this.state = loaded.state.currentSeason;
      this.saveTitle = loaded.summary.title;
      this.worldCopy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
      this.saveId = saveId;
      this.readOnly = true;
      this.recovered = loaded.recovered;
      this.setStatus("Read-only");
      return;
    }
    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    this.persistentState = null;
    this.state = loaded.state;
    this.saveTitle = loaded.summary.title;
    this.worldCopy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
    this.saveId = saveId;
    this.readOnly = true;
    this.recovered = loaded.recovered;
    this.setStatus("Read-only");
  }

  async createCareer(
    teamId: string,
    copyRaw: NewGameWorldCopy | null = null,
    options?: CreateCareerOptions,
  ): Promise<T20SeasonState> {
    if (!T20_LEAGUE_COMPETITION.teamIds.includes(teamId)) throw new Error("Unknown managed team.");
    const copy = copyRaw ? immutableWorldCopy(copyRaw) : null;
    await this.releaseCurrentLease();
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const teamName = (copy?.world ?? world).teams.find((team) => team.teamId === teamId)!.name;

    if (this.persistentRepository) {
      const worldId = options?.worldId ?? `world-${key}`;
      const careerId = options?.careerId ?? `career-${key}`;
      const worldState = await createInitialPersistentWorldCareerState({
        worldId,
        careerId,
        baseSeed: options?.seed ?? `seed-${key}`,
        controlledTeamId: teamId,
        ...(options?.calendarYear !== undefined ? { calendarYear: options.calendarYear } : {}),
        ...(options?.startDate !== undefined ? { startDate: options.startDate } : {}),
      });
      const saveId = options?.saveId ?? `pworld:${worldId}`;
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
        throw new Error("New career save is locked.");
      }
      this.setStatus("Saving");
      const title = `${teamName} ${worldState.currentCalendarYear}`;
      await this.persistentRepository.commit({
        saveId,
        kind: "AUTO",
        title,
        expectedRevision: null,
        state: worldState,
        command: null,
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: copy,
      });
      this.persistentState = worldState;
      this.state = worldState.currentSeason;
      this.saveTitle = title;
      this.worldCopy = copy;
      this.saveId = saveId;
      this.readOnly = false;
      this.recovered = false;
      this.setStatus("Saved");
      return worldState.currentSeason;
    }

    const gameId = options?.gameId ?? `career-game-${key}`;
    const seasonId = options?.seasonId ?? `season-${key}`;
    const careerId = options?.careerId ?? `career-${key}`;
    const startDate = options?.startDate ?? START_DATE;
    const state = await createInitialSeasonState({
      seasonId,
      careerId,
      gameId,
      controlledTeamId: teamId,
      seed: options?.seed ?? `seed-${key}`,
      startDate,
    });
    const saveId = options?.saveId ?? `season:${seasonId}`;
    if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) {
      throw new Error("New career save is locked.");
    }
    this.setStatus("Saving");
    const titleYear = Number.parseInt(startDate.slice(0, 4), 10) || 2027;
    const title = `${teamName} ${titleYear}`;
    await this.repository.commit({
      saveId,
      kind: "AUTO",
      title,
      expectedRevision: null,
      state,
      command: null,
      ownerId: this.ownerId,
      now: Date.now(),
      updatedAt: nowIso(),
      setActive: true,
      worldCopy: copy,
    });
    this.persistentState = null;
    this.state = state;
    this.saveTitle = title;
    this.worldCopy = copy;
    this.saveId = saveId;
    this.readOnly = false;
    this.recovered = false;
    this.setStatus("Saved");
    return state;
  }

  async loadCareer(saveId: string): Promise<T20SeasonState> {
    if (await this.isPersistentSlot(saveId)) {
      const repo = this.persistentRepository!;
      const loaded = await repo.load(saveId);
      if (!loaded) throw new Error("Career save not found.");
      const copy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
      if (this.saveId && this.saveId !== saveId && !this.readOnly) {
        await this.releaseCurrentLease();
      }
      let targetSaveId = saveId;
      let targetTitle = loaded.summary.title;
      let readOnly = !(await repo.acquireLease(saveId, this.ownerId, Date.now()));
      if (loaded.recovered && !readOnly) {
        targetSaveId = `recovered-${crypto.randomUUID().replaceAll("-", "")}`;
        targetTitle = `${loaded.summary.title} (Recovered)`;
        if (!(await repo.acquireLease(targetSaveId, this.ownerId, Date.now()))) {
          throw new Error("Recovered career slot is locked.");
        }
        const existingArchives = repo.loadMatchEventArchives
          ? (await repo.loadMatchEventArchives(saveId, loaded.state)).archives
          : [];
        await repo.commit({
          saveId: targetSaveId,
          kind: "MANUAL",
          title: targetTitle,
          expectedRevision: null,
          state: loaded.state,
          command: null,
          ownerId: this.ownerId,
          now: Date.now(),
          updatedAt: nowIso(),
          setActive: true,
          worldCopy: copy,
          ...(existingArchives.length > 0 ? { matchEventArchives: existingArchives } : {}),
        });
        await repo.releaseLease(saveId, this.ownerId);
        await this.onRecovered?.(saveId, targetSaveId);
        readOnly = false;
      } else if (!readOnly) {
        await repo.commit({
          saveId,
          kind: loaded.summary.kind,
          title: loaded.summary.title,
          expectedRevision: loaded.state.revision,
          state: loaded.state,
          command: null,
          ownerId: this.ownerId,
          now: Date.now(),
          updatedAt: loaded.summary.updatedAt,
          setActive: true,
          worldCopy: copy,
        });
      }
      this.persistentState = loaded.state;
      this.state = loaded.state.currentSeason;
      this.saveTitle = targetTitle;
      this.worldCopy = copy;
      this.saveId = targetSaveId;
      this.readOnly = readOnly;
      this.recovered = loaded.recovered;
      this.setStatus(readOnly ? "Read-only" : loaded.recovered ? "Recovered" : "Saved");
      return loaded.state.currentSeason;
    }

    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    const copy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
    if (this.saveId && this.saveId !== saveId && !this.readOnly) {
      await this.releaseCurrentLease();
    }
    let targetSaveId = saveId;
    let targetTitle = loaded.summary.title;
    let readOnly = !(await this.repository.acquireLease(saveId, this.ownerId, Date.now()));
    if (loaded.recovered && !readOnly) {
      targetSaveId = `recovered-${crypto.randomUUID().replaceAll("-", "")}`;
      targetTitle = `${loaded.summary.title} (Recovered)`;
      if (!(await this.repository.acquireLease(targetSaveId, this.ownerId, Date.now()))) {
        throw new Error("Recovered career slot is locked.");
      }
      const existingArchives = this.repository.loadMatchEventArchives
        ? (await this.repository.loadMatchEventArchives(saveId, loaded.state)).archives
        : [];
      await this.repository.commit({
        saveId: targetSaveId,
        kind: "MANUAL",
        title: targetTitle,
        expectedRevision: null,
        state: loaded.state,
        command: null,
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: copy,
        ...(existingArchives.length > 0 ? { matchEventArchives: existingArchives } : {}),
      });
      await this.repository.releaseLease(saveId, this.ownerId);
      await this.onRecovered?.(saveId, targetSaveId);
      readOnly = false;
    } else if (!readOnly) {
      await this.repository.commit({
        saveId,
        kind: loaded.summary.kind,
        title: loaded.summary.title,
        expectedRevision: loaded.state.revision,
        state: loaded.state,
        command: null,
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: loaded.summary.updatedAt,
        setActive: true,
        worldCopy: copy,
      });
    }
    this.persistentState = null;
    this.state = loaded.state;
    this.saveTitle = targetTitle;
    this.worldCopy = copy;
    this.saveId = targetSaveId;
    this.readOnly = readOnly;
    this.recovered = loaded.recovered;
    this.setStatus(readOnly ? "Read-only" : loaded.recovered ? "Recovered" : "Saved");
    return loaded.state;
  }

  private requireWritable(): { state: T20SeasonState; saveId: string } {
    if (!this.state || !this.saveId) throw new Error("Create or load a career first.");
    if (this.readOnly) {
      throw new Error("This career is read-only because another tab owns the writer lease.");
    }
    return { state: this.state, saveId: this.saveId };
  }

  private defaultCareerTitle(nextWorld: PersistentWorldState): string {
    const base = this.teamName(nextWorld.controlledTeamId);
    return nextWorld.currentSeasonNumber > 1
      ? `${base} ${nextWorld.currentCalendarYear} (Season ${nextWorld.currentSeasonNumber})`
      : `${base} ${nextWorld.currentCalendarYear}`;
  }

  private async commitMutation(
    command: string,
    payload: unknown,
    build: (
      state: T20SeasonState,
    ) =>
      | Promise<
          | {
              core: Omit<T20SeasonState, "stateSha256" | "revision">;
              matchEventArchives?: readonly CompletedCareerMatchEventArchive[];
            }
          | Omit<T20SeasonState, "stateSha256" | "revision">
        >
      | (
          | {
              core: Omit<T20SeasonState, "stateSha256" | "revision">;
              matchEventArchives?: readonly CompletedCareerMatchEventArchive[];
            }
          | Omit<T20SeasonState, "stateSha256" | "revision">
        ),
  ): Promise<T20SeasonState> {
    const { state: before, saveId } = this.requireWritable();
    const commandId = token("career-cmd");
    this.setStatus("Saving");
    try {
      if (this.persistentState && this.persistentRepository) {
        const beforeWorld = this.persistentState;
        const expectedRevision = beforeWorld.revision;
        if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
          this.readOnly = true;
          throw new Error("Writer lease was lost to another tab.");
        }
        const builtRaw = await build(before);
        const builtCore =
          "core" in builtRaw && "seasonStateVersion" in builtRaw.core
            ? builtRaw.core
            : (builtRaw as Omit<T20SeasonState, "stateSha256" | "revision">);
        const matchEventArchives =
          "core" in builtRaw && "matchEventArchives" in builtRaw
            ? builtRaw.matchEventArchives
            : undefined;
        const nextSeason = await sealT20SeasonState({
          ...builtCore,
          revision: before.revision + 1,
        });
        const nextWorld = await rebuildPersistentWorldStateWithActiveSeason(
          beforeWorld,
          nextSeason,
          expectedRevision + 1,
        );
        const requestCanonical = canonicalJson({ command, expectedRevision, payload });
        const title = this.saveTitle ?? this.defaultCareerTitle(nextWorld);
        await this.persistentRepository.commit({
          saveId,
          kind: "AUTO",
          title,
          expectedRevision,
          state: nextWorld,
          command: {
            commandId,
            requestCanonical,
            responseJson: canonicalJson({
              revision: nextWorld.revision,
              stateSha256: nextWorld.stateSha256,
            }),
            committedRevision: nextWorld.revision,
          },
          ownerId: this.ownerId,
          now: Date.now(),
          updatedAt: nowIso(),
          setActive: true,
          worldCopy: this.worldCopy,
          ...(matchEventArchives && matchEventArchives.length > 0 ? { matchEventArchives } : {}),
        });
        this.persistentState = nextWorld;
        this.state = nextSeason;
        this.saveTitle = title;
        this.recovered = false;
        this.setStatus("Saved");
        return nextSeason;
      }

      const expectedRevision = before.revision;
      if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const builtRaw = await build(before);
      const builtCore =
        "core" in builtRaw && "seasonStateVersion" in builtRaw.core
          ? builtRaw.core
          : (builtRaw as Omit<T20SeasonState, "stateSha256" | "revision">);
      const matchEventArchives =
        "core" in builtRaw && "matchEventArchives" in builtRaw
          ? builtRaw.matchEventArchives
          : undefined;
      const next = await sealT20SeasonState({ ...builtCore, revision: expectedRevision + 1 });
      const requestCanonical = canonicalJson({ command, expectedRevision, payload });
      const title = this.saveTitle ?? `${this.teamName(next.controlledTeamId)} 2027`;
      await this.repository.commit({
        saveId,
        kind: "AUTO",
        title,
        expectedRevision,
        state: next,
        command: {
          commandId,
          requestCanonical,
          responseJson: canonicalJson({
            revision: next.revision,
            stateSha256: next.stateSha256,
          }),
          committedRevision: next.revision,
        },
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: this.worldCopy,
        ...(matchEventArchives && matchEventArchives.length > 0 ? { matchEventArchives } : {}),
      });
      this.state = next;
      this.saveTitle = title;
      this.recovered = false;
      this.setStatus("Saved");
      return next;
    } catch (error) {
      this.setStatus(
        this.readOnly ? "Read-only" : "Error",
        error instanceof Error ? error.message : "Career save failed.",
      );
      throw error;
    }
  }

  /**
   * Closes a completed persistent-world season once, seals its CompletedSeasonRecord,
   * advances the calendar, generates the next season's 56-fixture schedule, and updates
   * cumulative career projections. Idempotent if called repeatedly with the same closedSeasonId.
   */
  async closeSeasonAndAdvance(
    expectedClosedSeasonId?: string,
  ): Promise<{ state: PersistentWorldState; idempotentReplay: boolean }> {
    const { saveId } = this.requireWritable();
    if (!this.persistentState || !this.persistentRepository) {
      throw new Error(
        "Legacy V0.1 single-season saves remain frozen at completion. Copy into a multi-season world first.",
      );
    }
    const beforeWorld = this.persistentState;
    if (
      expectedClosedSeasonId &&
      beforeWorld.lastRolloverReceipt?.closedSeasonId === expectedClosedSeasonId
    ) {
      return { state: beforeWorld, idempotentReplay: true };
    }
    const closingSeasonId = expectedClosedSeasonId ?? beforeWorld.currentSeason.seasonId;
    if (beforeWorld.currentSeason.seasonId !== closingSeasonId) {
      throw new Error("Season rollover request does not match the active season.");
    }
    if (beforeWorld.currentSeason.phase !== "COMPLETE") {
      throw new Error("Complete all 56 fixtures before closing the season.");
    }
    const expectedRevision = beforeWorld.revision;
    const commandId = `rollover:${saveId}:${closingSeasonId}`;
    this.setStatus("Saving");
    try {
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const { nextState } = await rolloverPersistentWorldCareerSeason(
        beforeWorld,
        expectedRevision + 1,
      );
      const requestCanonical = canonicalJson({
        command: "ROLLOVER_SEASON",
        closedSeasonId: closingSeasonId,
        fromSeasonNumber: beforeWorld.currentSeasonNumber,
        closedSeasonStateSha256: beforeWorld.currentSeason.stateSha256,
      });
      const nextTitle = this.defaultCareerTitle(nextState);
      const committed = await this.persistentRepository.commit({
        saveId,
        kind: "AUTO",
        title: nextTitle,
        expectedRevision,
        state: nextState,
        command: {
          commandId,
          requestCanonical,
          responseJson: canonicalJson({
            revision: nextState.revision,
            stateSha256: nextState.stateSha256,
            nextSeasonId: nextState.currentSeason.seasonId,
          }),
          committedRevision: nextState.revision,
        },
        idempotentCommandReplay: true,
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: this.worldCopy,
      });
      if (committed.idempotentReplay) {
        const reloaded = await this.persistentRepository.load(saveId);
        if (reloaded) {
          this.persistentState = reloaded.state;
          this.state = reloaded.state.currentSeason;
          this.saveTitle = reloaded.summary.title;
        }
        this.setStatus("Saved");
        return { state: this.persistentState!, idempotentReplay: true };
      }
      this.persistentState = nextState;
      this.state = nextState.currentSeason;
      this.saveTitle = nextTitle;
      this.recovered = false;
      this.setStatus("Saved");
      return { state: nextState, idempotentReplay: false };
    } catch (error) {
      this.setStatus(
        this.readOnly ? "Read-only" : "Error",
        error instanceof Error ? error.message : "Season rollover failed.",
      );
      throw error;
    }
  }

  /**
   * Explicit copy-forward from a completed V0.1 single-season career into a new
   * multi-season persistent world starting at Season 2, preserving the V0.1 slot untouched.
   */
  async copySingleSeasonToPersistentWorld(customTitle?: string): Promise<PersistentWorldState> {
    const { state: sourceState, saveId: sourceSaveId } = this.requireWritable();
    if (this.persistentState) {
      throw new Error("This career is already a persistent multi-season world.");
    }
    if (!this.persistentRepository) {
      throw new Error("Persistent world storage is unavailable.");
    }
    if (sourceState.phase !== "COMPLETE") {
      throw new Error(
        "Complete all 56 fixtures in this single-season career before copying into a multi-season world.",
      );
    }
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const worldId = `world-${key}`;
    const newCareerId = `career-${key}`;
    const targetSaveId = `pworld:${worldId}`;
    const nextWorld = await copyCompletedSingleSeasonToPersistentWorldState({
      sourceSaveId,
      sourceState,
      worldId,
      newCareerId,
      baseSeed: `seed-${key}`,
    });
    const now = Date.now();
    if (!(await this.repository.acquireLease(sourceSaveId, this.ownerId, now))) {
      throw new Error("This career is open in another tab.");
    }
    if (!(await this.persistentRepository.acquireLease(targetSaveId, this.ownerId, now))) {
      throw new Error("New multi-season world slot is locked.");
    }
    const title =
      (customTitle ?? "").trim().slice(0, 120) || this.defaultCareerTitle(nextWorld);
    this.setStatus("Saving");
    try {
      await this.persistentRepository.commit({
        saveId: targetSaveId,
        kind: "MANUAL",
        title,
        expectedRevision: null,
        state: nextWorld,
        command: null,
        ownerId: this.ownerId,
        now,
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: this.worldCopy,
        copySource: {
          saveId: sourceSaveId,
          sourceRecordType: SEASON_RECORD_TYPE,
          revision: sourceState.revision,
          stateSha256: sourceState.stateSha256,
          now: () => Date.now(),
        },
      });
      await this.repository.releaseLease(sourceSaveId, this.ownerId);
      this.persistentState = nextWorld;
      this.state = nextWorld.currentSeason;
      this.saveTitle = title;
      this.saveId = targetSaveId;
      this.readOnly = false;
      this.recovered = false;
      this.setStatus("Saved");
      return nextWorld;
    } catch (error) {
      await this.persistentRepository.releaseLease(targetSaveId, this.ownerId);
      this.setStatus("Error", error instanceof Error ? error.message : "Copy-forward failed.");
      throw error;
    }
  }

  async setTraining(playerId: string, directive: TrainingDirective): Promise<void> {
    await this.commitMutation("SET_TRAINING", { playerId, directive }, (state) => {
      if (state.phase !== "ACTIVE") throw new Error("Completed seasons are immutable.");
      const changed = setTrainingDirective(state.careerState, {
        command: "SET_TRAINING_DIRECTIVE",
        playerId,
        directive,
        effectiveDate: state.careerState.currentDate,
        expectedRevision: state.careerState.revision,
      }).state;
      return { ...stateCore(state), careerState: changed };
    });
  }

  async advanceDay(): Promise<void> {
    await this.commitMutation("ADVANCE_DAY", {}, (state) => {
      if (state.phase !== "ACTIVE") throw new Error("Completed seasons are immutable.");
      const nextFixture = this.nextManagedFixture(state);
      if (nextFixture && state.careerState.currentDate >= nextFixture.matchDayDate) {
        throw new Error("Resolve the managed fixture before advancing the career date.");
      }
      const careerState = advanceCareerDayV2(state.careerState).state;
      if (nextFixture && careerState.currentDate > nextFixture.matchDayDate) {
        throw new Error("Career date cannot pass the next managed fixture.");
      }
      return { ...stateCore(state), careerState };
    });
  }

  private applyOffscreenCompletion(
    state: T20SeasonState,
    fixtureId: string,
  ): {
    core: Omit<T20SeasonState, "stateSha256" | "revision">;
    archive: CompletedCareerMatchEventArchive;
  } {
    const simulated = simulateOffscreenFixture({
      schedule: state.schedule,
      careerState: state.careerState,
      fixtureId,
      worldBytes,
      worldManifest,
    });
    const completion = completionFromOffscreenOutcome(state.schedule, simulated.outcome);
    const archive = createCompletedCareerMatchEventArchive({
      completion,
      session: simulated.session,
    });
    const projection = applyT20SeasonMatchCompletion({
      state: state.projection,
      competition: T20_LEAGUE_COMPETITION,
      schedule: state.schedule,
      completion,
    });
    const completedMatches = [...state.completedMatches, completion].sort(
      (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId),
    );
    return {
      core: {
        ...stateCore(state),
        careerState: simulated.careerState,
        projection,
        completedMatches,
        phase: completedMatches.length === 56 ? "COMPLETE" : "ACTIVE",
      },
      archive,
    };
  }

  async simulateToNextUserFixture(): Promise<SeasonFixture | null> {
    const initial = this.requireWritable().state;
    const target = this.nextManagedFixture(initial);
    if (!target) return null;
    const completedIds = new Set(initial.completedMatches.map((match) => match.fixtureId));
    const roundOthers = initial.schedule.fixtures
      .filter(
        (fixture) =>
          fixture.roundNumber === target.roundNumber && fixture.fixtureId !== target.fixtureId,
      )
      .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
    const requiresDateAdvance = initial.careerState.currentDate < target.matchDayDate;
    const pendingOthers = roundOthers.filter((fixture) => !completedIds.has(fixture.fixtureId));
    if (!requiresDateAdvance && pendingOthers.length === 0) return target;

    await this.commitMutation(
      "SIMULATE_TO_NEXT_USER_FIXTURE",
      { fixtureId: target.fixtureId },
      async (state) => {
        let working: T20SeasonState = state;
        let careerState = working.careerState;
        while (careerState.currentDate < target.matchDayDate) {
          careerState = advanceCareerDayV2(careerState).state;
        }
        if (careerState.currentDate !== target.matchDayDate) {
          throw new Error("Career date does not match managed fixture date.");
        }
        working = { ...working, careerState };
        const already = new Set(working.completedMatches.map((match) => match.fixtureId));
        const archives: CompletedCareerMatchEventArchive[] = [];
        for (const fixture of roundOthers) {
          if (already.has(fixture.fixtureId)) continue;
          const applied = this.applyOffscreenCompletion(working, fixture.fixtureId);
          working = await sealT20SeasonState({ ...applied.core, revision: working.revision });
          archives.push(applied.archive);
          already.add(fixture.fixtureId);
        }
        return { core: { ...stateCore(working), phase: "ACTIVE" }, matchEventArchives: archives };
      },
    );
    return this.nextManagedFixture(this.state!);
  }

  async simulateManagedFixture(): Promise<void> {
    await this.simulateToNextUserFixture();
    const current = this.requireWritable().state;
    const fixture = this.nextManagedFixture(current);
    if (!fixture) return;
    if (current.careerState.currentDate !== fixture.matchDayDate) {
      throw new Error("Managed fixture is not ready.");
    }
    await this.commitMutation(
      "SIMULATE_MANAGED_FIXTURE",
      { fixtureId: fixture.fixtureId },
      (state) => {
        const applied = this.applyOffscreenCompletion(state, fixture.fixtureId);
        return { core: applied.core, matchEventArchives: [applied.archive] };
      },
    );
  }

  async prepareUserMatch(): Promise<CareerUserMatchLaunch> {
    await this.simulateToNextUserFixture();
    const { state, saveId } = this.requireWritable();
    const fixture = this.nextManagedFixture(state);
    if (!fixture) throw new Error("Season is complete.");
    if (state.careerState.currentDate !== fixture.matchDayDate) {
      throw new Error("Managed fixture is not ready.");
    }
    const selections = selectOffscreenFixtureTeams({
      schedule: state.schedule,
      careerState: state.careerState,
      fixtureId: fixture.fixtureId,
      worldBytes,
      worldManifest,
    });
    return {
      ...(this.worldCopy
        ? {
            launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V2" as const,
            worldCopy: structuredClone(this.worldCopy),
          }
        : { launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V1" as const }),
      saveId,
      seasonId: state.seasonId,
      scheduleSha256: state.schedule.scheduleSha256,
      fixtureId: fixture.fixtureId,
      fixtureOrdinal: fixture.ordinal,
      roundNumber: fixture.roundNumber,
      matchDayDate: fixture.matchDayDate,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      groundId: fixture.groundId,
      matchId: fixture.matchId,
      matchGameId: managedMatchGameId(saveId, fixture.fixtureId),
      matchSeed: fixture.matchSeed,
      selections: [selections[0], selections[1]],
      careerStateSha256: state.careerState.stateSha256,
      ...(state.controlledTeamId ? { managedTeamId: state.controlledTeamId } : {}),
    };
  }

  async completeUserMatch(
    result: CareerUserMatchResult,
    session: import("@lcxxvi/simulation").T20Session | null = null,
  ): Promise<void> {
    const current = this.requireWritable().state;
    const existing = current.completedMatches.find(
      (match) => match.fixtureId === result.fixtureId,
    );
    if (existing) {
      if (existing.sourceCompletionSha256 !== result.sourceCompletionSha256) {
        throw new Error("Conflicting managed fixture completion.");
      }
      return;
    }
    const fixture = this.nextManagedFixture(current);
    if (!fixture || fixture.fixtureId !== result.fixtureId) {
      throw new Error("Managed match result does not match the next required fixture.");
    }
    const expectedScorecardSha256 = hasher.hash(result.scorecard);
    if (expectedScorecardSha256 !== result.scorecardSha256) {
      throw new Error("Managed match scorecard hash mismatch.");
    }
    const expectedSourceCompletionSha256 = hasher.hash({
      source: "USER_MATCH",
      seasonId: result.seasonId,
      fixtureId: result.fixtureId,
      matchId: result.matchId,
      scorecardSha256: result.scorecardSha256,
      finalEventHash: result.finalEventHash,
    });
    if (expectedSourceCompletionSha256 !== result.sourceCompletionSha256) {
      throw new Error("Managed match completion hash mismatch.");
    }
    if (
      result.resultVersion !== "LC_CAREER_USER_MATCH_RESULT_V1" ||
      result.seasonId !== current.seasonId ||
      result.scheduleSha256 !== current.schedule.scheduleSha256 ||
      result.matchId !== fixture.matchId ||
      result.fixtureOrdinal !== fixture.ordinal ||
      result.roundNumber !== fixture.roundNumber ||
      result.matchDayDate !== fixture.matchDayDate ||
      result.homeTeamId !== fixture.homeTeamId ||
      result.awayTeamId !== fixture.awayTeamId
    ) {
      throw new Error("Managed match result failed fixture binding.");
    }
    await this.commitMutation(
      "COMPLETE_USER_FIXTURE",
      { fixtureId: fixture.fixtureId, sourceCompletionSha256: result.sourceCompletionSha256 },
      (state) => {
        const careerState = applyMatchConditionDeltaV2(
          state.careerState,
          result.conditionDelta,
          state.schedule,
        );
        const completion: T20SeasonMatchCompletion = T20SeasonMatchCompletionSchema.parse({
          completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1",
          seasonId: state.seasonId,
          scheduleSha256: state.schedule.scheduleSha256,
          fixtureId: fixture.fixtureId,
          matchId: fixture.matchId,
          fixtureOrdinal: fixture.ordinal,
          roundNumber: fixture.roundNumber,
          matchDayDate: fixture.matchDayDate,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          source: "USER_MATCH",
          sourceCompletionSha256: result.sourceCompletionSha256,
          selectedTeams: result.selectedTeams,
          scorecard: result.scorecard,
          scorecardSha256: result.scorecardSha256,
        });
        let resolvedSession = session;
        if (!resolvedSession && result.completedSession !== undefined) {
          try {
            resolvedSession = rehydrateT20Session(
              result.completedSession,
              worldBytes,
              worldManifest,
            );
          } catch {
            /* legacy or synthetic test payload without full rehydratable T20Session */
          }
        }
        const maybeArchive = resolvedSession
          ? [createCompletedCareerMatchEventArchive({ completion, session: resolvedSession })]
          : [];
        const projection = applyT20SeasonMatchCompletion({
          state: state.projection,
          competition: T20_LEAGUE_COMPETITION,
          schedule: state.schedule,
          completion,
        });
        const completedMatches = [...state.completedMatches, completion].sort(
          (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId),
        );
        return {
          core: {
            ...stateCore(state),
            careerState,
            projection,
            completedMatches,
            phase: completedMatches.length === 56 ? "COMPLETE" : "ACTIVE",
          },
          matchEventArchives: maybeArchive,
        };
      },
    );
  }

  async createManualCopy(title: string): Promise<void> {
    const name = title.trim();
    if (!name || name.length > 120) {
      throw new Error("Enter a copy name of 1 to 120 characters.");
    }
    const { state, saveId } = this.requireWritable();
    const copyId = `career-copy-${crypto.randomUUID()}`;
    const now = Date.now();

    if (this.persistentState && this.persistentRepository) {
      const worldState = this.persistentState;
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, now))) {
        throw new Error("This career is open in another tab.");
      }
      if (!(await this.persistentRepository.acquireLease(copyId, this.ownerId, now))) {
        throw new Error("The copy slot is locked.");
      }
      try {
        await this.persistentRepository.commit({
          saveId: copyId,
          kind: "MANUAL",
          title: name,
          expectedRevision: null,
          state: worldState,
          command: null,
          ownerId: this.ownerId,
          now,
          updatedAt: nowIso(),
          setActive: false,
          worldCopy: this.worldCopy,
          copySource: {
            saveId,
            sourceRecordType: PERSISTENT_WORLD_RECORD_TYPE,
            revision: worldState.revision,
            stateSha256: worldState.stateSha256,
            now: () => Date.now(),
          },
        });
      } finally {
        await this.persistentRepository.releaseLease(copyId, this.ownerId);
      }
      this.setStatus("Saved");
      return;
    }

    if (!(await this.repository.acquireLease(saveId, this.ownerId, now))) {
      throw new Error("This career is open in another tab.");
    }
    if (!(await this.repository.acquireLease(copyId, this.ownerId, now))) {
      throw new Error("The copy slot is locked.");
    }
    try {
      await this.repository.commit({
        saveId: copyId,
        kind: "MANUAL",
        title: name,
        expectedRevision: null,
        state,
        command: null,
        ownerId: this.ownerId,
        now,
        updatedAt: nowIso(),
        setActive: false,
        worldCopy: this.worldCopy,
        copySource: {
          saveId,
          revision: state.revision,
          stateSha256: state.stateSha256,
          now: () => Date.now(),
        },
      });
    } finally {
      await this.repository.releaseLease(copyId, this.ownerId);
    }
    this.setStatus("Saved");
  }

  async exportCareer(): Promise<Uint8Array> {
    if (!this.state || !this.saveId) throw new Error("No career is loaded.");
    const saveId = this.saveId;

    if (this.persistentState && this.persistentRepository) {
      const loaded = await this.persistentRepository.load(saveId);
      if (!loaded) throw new Error("Career save not found.");
      const eventArchives = this.persistentRepository.loadMatchEventArchives
        ? (await this.persistentRepository.loadMatchEventArchives(saveId, loaded.state)).archives
        : [];
      return createPersistentWorldPortableArchive(
        loaded.state,
        loaded.summary,
        nowIso(),
        loaded.worldCopy ?? null,
        eventArchives.length > 0 ? eventArchives : null,
      );
    }

    const state = this.state;
    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    const archive =
      state.phase === "COMPLETE"
        ? await createT20SeasonArchive(state, deterministicSeasonCompletedAt(state))
        : null;
    const eventArchives = this.repository.loadMatchEventArchives
      ? (await this.repository.loadMatchEventArchives(saveId, state)).archives
      : [];
    return createSeasonPortableArchive(
      state,
      loaded.summary,
      nowIso(),
      archive,
      loaded.worldCopy ?? null,
      eventArchives.length > 0 ? eventArchives : null,
    );
  }

  async importCareer(bytes: Uint8Array): Promise<T20SeasonState> {
    const version = peekPortableArchiveVersion(bytes);
    if (version === PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION) {
      if (!this.persistentRepository) {
        throw new Error("Persistent world storage is unavailable.");
      }
      const imported = await readPersistentWorldPortableArchive(bytes);
      const copy = imported.worldCopy ? immutableWorldCopy(imported.worldCopy) : null;
      await this.releaseCurrentLease();
      const saveId = `import-${crypto.randomUUID().replaceAll("-", "")}`;
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
        throw new Error("Imported career slot is locked.");
      }
      const title = `${imported.summary.title} (Imported)`;
      this.setStatus("Saving");
      await this.persistentRepository.commit({
        saveId,
        kind: "IMPORTED",
        title,
        expectedRevision: null,
        state: imported.state,
        command: null,
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: copy,
        ...(imported.matchEventArchives.length > 0
          ? { matchEventArchives: imported.matchEventArchives }
          : {}),
      });
      this.persistentState = imported.state;
      this.state = imported.state.currentSeason;
      this.saveTitle = title;
      this.worldCopy = copy;
      this.saveId = saveId;
      this.readOnly = false;
      this.recovered = false;
      this.setStatus("Saved");
      return imported.state.currentSeason;
    }

    const imported = await readSeasonPortableArchive(bytes);
    const copy = imported.worldCopy ? immutableWorldCopy(imported.worldCopy) : null;
    await this.releaseCurrentLease();
    const saveId = `import-${crypto.randomUUID().replaceAll("-", "")}`;
    if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) {
      throw new Error("Imported career slot is locked.");
    }
    const title = `${imported.summary.title} (Imported)`;
    this.setStatus("Saving");
    await this.repository.commit({
      saveId,
      kind: "IMPORTED",
      title,
      expectedRevision: null,
      state: imported.state,
      command: null,
      ownerId: this.ownerId,
      now: Date.now(),
      updatedAt: nowIso(),
      setActive: true,
      worldCopy: copy,
      ...(imported.matchEventArchives.length > 0
        ? { matchEventArchives: imported.matchEventArchives }
        : {}),
    });
    this.persistentState = null;
    this.state = imported.state;
    this.saveTitle = title;
    this.worldCopy = copy;
    this.saveId = saveId;
    this.readOnly = false;
    this.recovered = false;
    this.setStatus("Saved");
    return imported.state;
  }

  findCompletionByFixtureId(fixtureId: string): T20SeasonMatchCompletion | null {
    if (this.persistentState) {
      return collectPersistentWorldCompletions(this.persistentState).get(fixtureId) ?? null;
    }
    return this.state?.completedMatches.find((m) => m.fixtureId === fixtureId) ?? null;
  }

  async replayFixtureArchive(fixtureId: string): Promise<CareerReplayOutcome> {
    if (!this.state || !this.saveId) throw new Error("No career is loaded.");
    const completion = this.findCompletionByFixtureId(fixtureId);
    if (!completion) return { status: "UNAVAILABLE" };

    if (this.persistentState && this.persistentRepository) {
      if (!this.persistentRepository.loadMatchEventArchives) return { status: "UNAVAILABLE" };
      const loaded = await this.persistentRepository.loadMatchEventArchives(
        this.saveId,
        this.persistentState,
      );
      if (loaded.damagedFixtureIds.includes(fixtureId)) {
        return {
          status: "DAMAGED",
          message:
            "The archived ball-by-ball replay log for this fixture is damaged. The season standings and scorecard remain valid.",
        };
      }
      const archive = loaded.archives.find((a) => a.fixtureId === fixtureId);
      if (!archive) return { status: "UNAVAILABLE" };
      try {
        const replay = replayCareerMatchEventArchive(
          archive,
          worldBytes,
          worldManifest,
          completion,
        );
        return { status: "READY", archive, replay };
      } catch (error) {
        return {
          status: "DAMAGED",
          message:
            error instanceof Error ? error.message : "Archived match replay failed verification.",
        };
      }
    }

    if (!this.repository.loadMatchEventArchives) return { status: "UNAVAILABLE" };
    const loaded = await this.repository.loadMatchEventArchives(this.saveId, this.state);
    if (loaded.damagedFixtureIds.includes(fixtureId)) {
      return {
        status: "DAMAGED",
        message:
          "The archived ball-by-ball replay log for this fixture is damaged. The season standings and scorecard remain valid.",
      };
    }
    const archive = loaded.archives.find((a) => a.fixtureId === fixtureId);
    if (!archive) return { status: "UNAVAILABLE" };
    try {
      const replay = replayCareerMatchEventArchive(archive, worldBytes, worldManifest, completion);
      return { status: "READY", archive, replay };
    } catch (error) {
      return {
        status: "DAMAGED",
        message:
          error instanceof Error ? error.message : "Archived match replay failed verification.",
      };
    }
  }

  async inspectCareerCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    if (await this.isPersistentSlot(saveId)) {
      if (!this.persistentRepository?.inspectCheckpoints) {
        throw new Error("Checkpoint inspection is unavailable.");
      }
      return this.persistentRepository.inspectCheckpoints(saveId);
    }
    if (!this.repository.inspectCheckpoints) {
      throw new Error("Checkpoint inspection is unavailable.");
    }
    return this.repository.inspectCheckpoints(saveId);
  }

  async recoverCareerFromGeneration(
    saveId: string,
    generation: number,
    title?: string,
  ): Promise<T20SeasonState> {
    if (await this.isPersistentSlot(saveId)) {
      const repo = this.persistentRepository!;
      if (!repo.loadGeneration) throw new Error("Checkpoint generation recovery is unavailable.");
      const loaded = await repo.loadGeneration(saveId, generation);
      const copy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
      if (this.saveId && this.saveId !== saveId && !this.readOnly) {
        await this.releaseCurrentLease();
      }
      const targetSaveId = `recovered-${crypto.randomUUID().replaceAll("-", "")}`;
      if (!(await repo.acquireLease(targetSaveId, this.ownerId, Date.now()))) {
        throw new Error("Recovered career slot is locked.");
      }
      const cleanLabel =
        (title ?? `${loaded.summary.title} (Recovered G${generation})`).trim().slice(0, 120) ||
        `${loaded.summary.title} (Recovered)`;
      const validCompletions = collectPersistentWorldCompletions(loaded.state);
      const existingArchives = repo.loadMatchEventArchives
        ? (await repo.loadMatchEventArchives(saveId)).archives.filter((a) => {
            const completion = validCompletions.get(a.fixtureId);
            return (
              Boolean(completion) &&
              completion!.sourceCompletionSha256 === a.sourceCompletionSha256
            );
          })
        : [];
      this.setStatus("Saving");
      await repo.commit({
        saveId: targetSaveId,
        kind: "MANUAL",
        title: cleanLabel,
        expectedRevision: null,
        state: loaded.state,
        command: null,
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: copy,
        ...(existingArchives.length > 0 ? { matchEventArchives: existingArchives } : {}),
      });
      await this.onRecovered?.(saveId, targetSaveId);
      this.persistentState = loaded.state;
      this.state = loaded.state.currentSeason;
      this.saveTitle = cleanLabel;
      this.worldCopy = copy;
      this.saveId = targetSaveId;
      this.readOnly = false;
      this.recovered = true;
      this.setStatus("Recovered");
      return loaded.state.currentSeason;
    }

    if (!this.repository.loadGeneration) {
      throw new Error("Checkpoint generation recovery is unavailable.");
    }
    const loaded = await this.repository.loadGeneration(saveId, generation);
    const copy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
    if (this.saveId && this.saveId !== saveId && !this.readOnly) {
      await this.releaseCurrentLease();
    }
    const targetSaveId = `recovered-${crypto.randomUUID().replaceAll("-", "")}`;
    if (!(await this.repository.acquireLease(targetSaveId, this.ownerId, Date.now()))) {
      throw new Error("Recovered career slot is locked.");
    }
    const cleanLabel =
      (title ?? `${loaded.summary.title} (Recovered G${generation})`).trim().slice(0, 120) ||
      `${loaded.summary.title} (Recovered)`;
    const existingArchives = this.repository.loadMatchEventArchives
      ? (await this.repository.loadMatchEventArchives(saveId)).archives.filter((a) =>
          loaded.state.completedMatches.some(
            (c) => c.fixtureId === a.fixtureId && c.sourceCompletionSha256 === a.sourceCompletionSha256,
          ),
        )
      : [];
    this.setStatus("Saving");
    await this.repository.commit({
      saveId: targetSaveId,
      kind: "MANUAL",
      title: cleanLabel,
      expectedRevision: null,
      state: loaded.state,
      command: null,
      ownerId: this.ownerId,
      now: Date.now(),
      updatedAt: nowIso(),
      setActive: true,
      worldCopy: copy,
      ...(existingArchives.length > 0 ? { matchEventArchives: existingArchives } : {}),
    });
    await this.onRecovered?.(saveId, targetSaveId);
    this.persistentState = null;
    this.state = loaded.state;
    this.saveTitle = cleanLabel;
    this.worldCopy = copy;
    this.saveId = targetSaveId;
    this.readOnly = false;
    this.recovered = true;
    this.setStatus("Recovered");
    return loaded.state;
  }

  describeError(error: unknown): SeasonPersistenceErrorDescription {
    return describeSeasonPersistenceError(error);
  }

  async seasonArchive(): Promise<SeasonArchive | null> {
    if (!this.state || this.state.phase !== "COMPLETE") return null;
    return createT20SeasonArchive(this.state, deterministicSeasonCompletedAt(this.state));
  }

  nextManagedFixture(state = this.state): SeasonFixture | null {
    if (!state || !state.controlledTeamId) return null;
    const complete = new Set(state.completedMatches.map((match) => match.fixtureId));
    return (
      state.schedule.fixtures
        .filter(
          (fixture) =>
            (fixture.homeTeamId === state.controlledTeamId ||
              fixture.awayTeamId === state.controlledTeamId) &&
            !complete.has(fixture.fixtureId),
        )
        .sort((a, b) => a.ordinal - b.ordinal)[0] ?? null
    );
  }

  squadView(state = this.state) {
    if (!state?.controlledTeamId) return null;
    return projectSquadTrainingCondition(
      state.careerState,
      state.controlledTeamId,
      DEFAULT_CAREER_AVAILABILITY_PACK,
    );
  }

  playerCondition(playerId: string) {
    if (!this.state) return null;
    const team = world.teams.find((candidate) => candidate.squadIds.includes(playerId));
    if (!team) return null;
    return (
      projectSquadTrainingCondition(
        this.state.careerState,
        team.teamId,
        DEFAULT_CAREER_AVAILABILITY_PACK,
      ).players.find((player) => player.playerId === playerId) ?? null
    );
  }

  teamName(teamId: string | null | undefined): string {
    return (
      this.getWorld().teams.find((team) => team.teamId === teamId)?.name ??
      teamId ??
      "Unknown team"
    );
  }

  playerName(playerId: string): string {
    return (
      this.getWorld().players.find((player) => player.playerId === playerId)?.name ?? playerId
    );
  }

  groundName(groundId: string): string {
    return (
      this.getWorld().grounds.find((ground) => ground.groundId === groundId)?.name ?? groundId
    );
  }

  resultText(completion: T20SeasonMatchCompletion): string {
    const result = completion.scorecard.result;
    if (result.kind === "TIE") return "Tied";
    if (result.kind === "NO_RESULT") return "No result";
    return `${this.teamName(result.winnerTeamId)} won by ${result.marginRuns ?? result.marginWickets} ${result.marginType?.toLowerCase() ?? ""}`.trim();
  }

  sourceHashForUserMatch(parts: unknown): string {
    return hasher.hash(parts);
  }
}
