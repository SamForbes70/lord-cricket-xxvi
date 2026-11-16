import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import {
  canonicalJson,
  LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION,
  LIFECYCLE_SEASON_STATE_VERSION,
  LifecycleSquadTrainingConditionViewSchema,
  type LifecycleSquadTrainingConditionView,
  PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION,
  PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION,
  PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION,
  PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION,
  PERSISTENT_WORLD_STATE_V2_VERSION,
  PERSISTENT_WORLD_STATE_V3_VERSION,
  PERSISTENT_WORLD_STATE_VERSION,
  RosterSeasonMatchCompletionSchema,
  T20SeasonMatchCompletionSchema,
  type AcademyTrainingFocus,
  type ActivePersistentSeasonState,
  type ClubBudgetState,
  type CareerAwardsLedger,
  type CompletedCareerMatchEventArchive,
  type CompletedLifecycleMatchEventArchive,
  type ContractOffer,
  type ContractOfferKind,
  type HistoricalFilterQuery,
  type HistoricalPlayerRecord,
  type HistoricalStatisticsProjection,
  type LifecycleSeasonState,
  type MatchAwardRecord,
  type MatchConditionDelta,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type PersistentWorldState,
  type PersistentWorldStateV2,
  type PersistentWorldStateV3,
  type Player,
  type PlayerContract,
  type PlayerLifecycleSkillLedgerEntry,
  type PlayerLifecycleState,
  type PreMatchBriefing,
  type RetiredPlayerRecord,
  type RosterCareerDayState,
  type SeasonArchive,
  type SeasonAwardsSummary,
  type SeasonCheckpointInspection,
  type SeasonEconomyTransitionSummary,
  type SeasonFixture,
  type SeasonLifecycleTransitionRecord,
  type SeasonSaveSummary,
  type SquadEconomyState,
  type SquadTrainingConditionView,
  type StagedRosterPack,
  type T20Scorecard,
  type T20SeasonMatchCompletion,
  type T20SeasonState,
  type T20TeamSelection,
  type TrainingDirective,
  type WorldPack,
  type YouthProspect,
  compareCodePoints,
  type CareerMatchDigest,
} from "@lcxxvi/contracts";
import {
  DEFAULT_CAREER_AVAILABILITY_PACK,
  isBowlingCapable,
  T20_LEAGUE_COMPETITION,
} from "@lcxxvi/data";
import {
  buildHistoricalStatsSourceFromPersistentWorld,
  buildHistoricalStatsSourceFromSingleSeason,
  projectHistoricalStatistics,
  reconcileCareerAwardsLedger,
  deriveCareerMatchDigest,
} from "@lcxxvi/projections";
import {
  acceptCounterOffer as applyAcceptCounterOffer,
  advanceCareerDayV2,
  advanceRosterCareerDay,
  applyMatchConditionDeltaV2,
  applyRosterMatchCondition,
  closeNegotiationWindowForMatchPlay,
  createCompletedCareerMatchEventArchive,
  createCompletedLifecycleMatchEventArchive,
  createInitialPlayerLifecycleState,
  createInitialSquadEconomyState,
  derivePersistentWorldIdentity,
  findLifecycleRosterPackBySha256,
  INITIAL_PERSISTENT_CALENDAR_YEAR,
  playerAgeInSeason,
  projectSquadTrainingCondition,
  promoteYouthProspectPreSeason,
  recordElapsedTrainingExposure,
  registerPreSeasonYouthContract,
  rehydrateRosterT20Session,
  rehydrateT20Session,
  releaseContractedPlayer as applyReleaseContractedPlayer,
  replayCareerMatchEventArchive,
  replayCompletedLifecycleMatchEventArchive,
  resolveNegotiationRound as applyResolveNegotiationRound,
  sealLifecycleSeasonState,
  seasonStartDateOf,
  selectOffscreenFixtureTeams,
  selectRosterFixtureTeams,
  setAcademyProspectFocus as applySetAcademyProspectFocus,
  setAcademyProspectPromotionQueue,
  setRosterTrainingDirective,
  setTrainingDirective,
  simulateOffscreenFixture,
  simulateRosterOffscreenFixture,
  submitContractOffer as applySubmitContractOffer,
  withdrawContractOffer as applyWithdrawContractOffer,
  type CareerArchivedReplaySummary,
  type RecentPlayerSeasonStatsSummary,
  type RosterT20Session,
} from "@lcxxvi/simulation";
import {
  applyRosterSeasonCompletion,
  applyT20SeasonMatchCompletion,
  completionFromOffscreenOutcome,
  projectPreMatchBriefing,
  rebuildPersistentCareerProjectionCore,
  rosterCompletionFromOffscreen,
} from "@lcxxvi/projections";
import {
  collectPersistentWorldCompletions,
  createPersistentWorldPortableArchive,
  createPersistentWorldPortableArchiveV2,
  createPersistentWorldPortableArchiveV4,
  createSeasonPortableArchive,
  createT20SeasonArchive,
  describeSeasonPersistenceError,
  IndexedDbPersistentWorldRepository,
  IndexedDbSeasonRepository,
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchive,
  readPersistentWorldPortableArchiveV2,
  readPersistentWorldPortableArchiveV3,
  readPersistentWorldPortableArchiveV4,
  readSeasonPortableArchive,
  sealPersistentCareerProjection,
  sealPersistentWorldStateV2,
  sealPersistentWorldStateV3,
  sealT20SeasonState,
  SEASON_RECORD_TYPE,
  type AnyCareerMatchEventArchive,
  type AnyPersistentWorldState,
  type PersistentWorldDurableCommit,
  type PersistentWorldLoadResult,
  type SeasonDurableCommit,
  type SeasonLoadResult,
  type SeasonPersistenceErrorDescription,
} from "@lcxxvi/persistence";
import { validateNewGameWorldCopy } from "../world/new-game-world.js";
import { managedMatchGameId } from "./managed-game-id.js";

import {
  type CreateCareerOptions,
  START_DATE,
  careerWorld,
  copyCompletedSingleSeasonToPersistentWorldStateV2,
  copyCompletedSingleSeasonToPersistentWorldStateV3,
  createInitialPersistentWorldCareerState,
  createInitialPersistentWorldCareerStateV2,
  createInitialPersistentWorldCareerStateV3,
  createInitialSeasonState,
  createLifecycleSeasonStateForWorld,
  deterministicSeasonCompletedAt,
  hasher,
  nowIso,
  rebuildPersistentWorldStateV2,
  rebuildPersistentWorldStateV3,
  rebuildPersistentWorldStateWithActiveSeason,
  rolloverPersistentWorldCareerSeason,
  rolloverPersistentWorldCareerSeasonV2,
  rolloverPersistentWorldCareerSeasonV3,
  stateCore,
  token,
  world,
  worldBytes,
} from "./world-state.js";
export * from "./world-state.js";

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
      rosterPack: StagedRosterPack;
    }
  | {
      launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V4_LIFECYCLE";
      rosterPack: StagedRosterPack;
      worldCopy?: NewGameWorldCopy;
    }
);

export type CareerActiveSeasonState = ActivePersistentSeasonState;

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

export type CareerReplayOutcome =
  | {
      status: "READY";
      archive: AnyCareerMatchEventArchive;
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
  loadAwardsLedger?(saveId: string): Promise<CareerAwardsLedger | null>;
  saveAwardsLedger?(saveId: string, ledger: CareerAwardsLedger): Promise<CareerAwardsLedger>;
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
    worldState?: AnyPersistentWorldState,
  ): Promise<{
    archives: AnyCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }>;
  /** One fixture's archive by key (docs/design/MATCH_ARCHIVE_STORAGE_V2.md). */
  loadMatchEventArchive?(
    saveId: string,
    fixtureId: string,
    worldState?: AnyPersistentWorldState,
  ): Promise<{ archive: AnyCareerMatchEventArchive | null; damaged: boolean }>;
  loadMatchDigests?(saveId: string): Promise<Map<string, CareerMatchDigest>>;
  saveMatchDigests?(saveId: string, digests: readonly CareerMatchDigest[]): Promise<void>;
  loadLifecycleRosterPacks?(saveId: string): Promise<Map<string, StagedRosterPack>>;
  inspectCheckpoints?(saveId: string): Promise<SeasonCheckpointInspection>;
  loadGeneration?(saveId: string, generation: number): Promise<PersistentWorldLoadResult>;
  loadAwardsLedger?(saveId: string): Promise<CareerAwardsLedger | null>;
  saveAwardsLedger?(saveId: string, ledger: CareerAwardsLedger): Promise<CareerAwardsLedger>;
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

type AnyCareerMutationResult =
  | {
      core:
        | Omit<T20SeasonState, "stateSha256" | "revision">
        | Omit<LifecycleSeasonState, "stateSha256" | "revision">;
      matchEventArchives?: readonly AnyCareerMatchEventArchive[];
      nextLifecycle?: PlayerLifecycleState;
      nextEconomy?: SquadEconomyState;
    }
  | Omit<T20SeasonState, "stateSha256" | "revision">
  | Omit<LifecycleSeasonState, "stateSha256" | "revision">;

export class CareerApplicationService {
  private readonly repository: CareerSeasonRepository;
  private readonly persistentRepository: CareerPersistentWorldRepository | null;
  private readonly listeners = new Set<() => void>();
  private state: ActivePersistentSeasonState | null = null;
  private persistentState: AnyPersistentWorldState | null = null;
  private saveTitle: string | null = null;
  private worldCopy: NewGameWorldCopy | null = null;
  private saveId: string | null = null;
  private ownerId: string;
  private readOnly = false;
  private recovered = false;
  private status: SaveStatus = "Idle";
  private error = "";
  private cachedArchivesKey: string | null = null;
  private cachedDigestsKey: string | null = null;
  private cachedDigests: ReadonlyMap<string, CareerMatchDigest> = new Map();
  private digestsInFlight: Promise<ReadonlyMap<string, CareerMatchDigest>> | null = null;
  private cachedArchives: readonly AnyCareerMatchEventArchive[] = [];
  private awardsLedger: CareerAwardsLedger | null = null;
  private awardsLedgerKey: string | null = null;

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

  getState(): ActivePersistentSeasonState | null {
    return this.state;
  }

  getPersistentState(): AnyPersistentWorldState | null {
    return this.persistentState;
  }

  getLifecycleState(): PlayerLifecycleState | null {
    return this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION ||
      this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
      ? this.persistentState.lifecycle
      : null;
  }

  getEconomyState(): SquadEconomyState | null {
    return this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
      ? this.persistentState.economy
      : null;
  }

  isPersistentWorld(): boolean {
    return this.persistentState !== null;
  }

  hasLifecycleEnabled(): boolean {
    return (
      this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION ||
      this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
    );
  }

  hasEconomyEnabled(): boolean {
    return this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION;
  }

  getWorld(): WorldPack {
    if (
      this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION ||
      this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
    ) {
      return this.persistentState.lifecycle.activeWorld;
    }
    return this.worldCopy?.world ?? world;
  }

  getWorldCopy(): NewGameWorldCopy | null {
    return this.worldCopy ? structuredClone(this.worldCopy) : null;
  }

  currentCalendarYear(): number {
    if (this.persistentState) return this.persistentState.currentCalendarYear;
    if (this.state) {
      return (
        Number.parseInt(seasonStartDateOf(this.state).slice(0, 4), 10) ||
        INITIAL_PERSISTENT_CALENDAR_YEAR
      );
    }
    return INITIAL_PERSISTENT_CALENDAR_YEAR;
  }

  playerAge(birthDate: string, calendarYear = this.currentCalendarYear()): number {
    return playerAgeInSeason(birthDate, calendarYear);
  }

  findPlayerIncludingRetired(
    playerId: string,
  ): { player: Player; retired: RetiredPlayerRecord | null } | null {
    const active = this.getWorld().players.find((p) => p.playerId === playerId);
    if (active) return { player: active, retired: null };
    const freeAgent = this.getEconomyState()?.freeAgents.find((fa) => fa.playerId === playerId);
    if (freeAgent) return { player: freeAgent.player, retired: null };
    const prospect = this.getLifecycleState()?.youthAcademy.find(
      (yp) => yp.prospectId === playerId,
    );
    if (prospect) return { player: prospect.player, retired: null };
    const retired = this.getLifecycleState()?.retiredPlayers.find((r) => r.playerId === playerId);
    if (retired) return { player: retired.player, retired };
    return null;
  }

  playerLifecycleLedgerEntry(playerId: string): PlayerLifecycleSkillLedgerEntry | null {
    return (
      this.getLifecycleState()?.skillLedger.find((entry) => entry.playerId === playerId) ?? null
    );
  }

  latestLifecycleTransition(): SeasonLifecycleTransitionRecord | null {
    return this.getLifecycleState()?.transitions.at(-1) ?? null;
  }

  latestEconomyTransition(): SeasonEconomyTransitionSummary | null {
    return this.getEconomyState()?.transitions.at(-1) ?? null;
  }

  managedClubBudget(): ClubBudgetState | null {
    const economy = this.getEconomyState();
    const teamId = this.persistentState?.controlledTeamId ?? null;
    if (!economy || !teamId) return null;
    return economy.clubBudgets.find((b) => b.teamId === teamId) ?? null;
  }

  playerContract(playerId: string): PlayerContract | null {
    return this.getEconomyState()?.contracts.find((c) => c.playerId === playerId) ?? null;
  }

  private recentPlayerStatsForMarket(): RecentPlayerSeasonStatsSummary[] {
    const activePlayers = this.state?.projection.players ?? [];
    const hasActiveMatches = (this.state?.completedMatches.length ?? 0) > 0;
    const sourcePlayers =
      hasActiveMatches
        ? activePlayers
        : (this.persistentState?.completedSeasons.at(-1)?.players ?? activePlayers);
    return sourcePlayers.map((p) => ({
      playerId: p.playerId,
      matches: p.matches,
      runs: p.runs,
      wickets: p.bowlingWickets,
      ballsFaced: p.ballsFaced,
      bowlingLegalBalls: p.bowlingLegalBalls,
    }));
  }

  managedYouthAcademyProspects(): YouthProspect[] {
    const lifecycle = this.getLifecycleState();
    const teamId = this.persistentState?.controlledTeamId ?? this.state?.controlledTeamId ?? null;
    if (!lifecycle || !teamId) return [];
    return lifecycle.youthAcademy.filter(
      (prospect) => prospect.teamId === teamId && prospect.promotedInSeasonNumber === null,
    );
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
      compareCodePoints(b.updatedAt, a.updatedAt),
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

  private resetArchiveAndAwardsCaches(): void {
    this.cachedDigestsKey = null;
    this.cachedDigests = new Map();
    this.cachedArchivesKey = null;
    this.cachedArchives = [];
    this.awardsLedger = null;
    this.awardsLedgerKey = null;
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
    this.resetArchiveAndAwardsCaches();
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
      this.resetArchiveAndAwardsCaches();
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
      this.resetArchiveAndAwardsCaches();
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
    this.resetArchiveAndAwardsCaches();
    this.setStatus("Read-only");
  }

  async createCareer(
    teamId: string,
    copyRaw: NewGameWorldCopy | null = null,
    options?: CreateCareerOptions,
  ): Promise<ActivePersistentSeasonState> {
    if (!T20_LEAGUE_COMPETITION.teamIds.includes(teamId)) throw new Error("Unknown managed team.");
    const copy = copyRaw ? immutableWorldCopy(copyRaw) : null;
    await this.releaseCurrentLease();
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const teamName = (copy?.world ?? world).teams.find((team) => team.teamId === teamId)!.name;

    if (this.persistentRepository) {
      const worldId = options?.worldId ?? `world-${key}`;
      const careerId = options?.careerId ?? `career-${key}`;
      const createWorldArgs = {
        worldId,
        careerId,
        baseSeed: options?.seed ?? `seed-${key}`,
        controlledTeamId: teamId,
        worldCopy: copy,
        ...(options?.calendarYear !== undefined ? { calendarYear: options.calendarYear } : {}),
        ...(options?.startDate !== undefined ? { startDate: options.startDate } : {}),
      };
      const worldState =
        options?.worldStateVersion === PERSISTENT_WORLD_STATE_VERSION
          ? await createInitialPersistentWorldCareerState(createWorldArgs)
          : options?.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION
            ? await createInitialPersistentWorldCareerStateV2(createWorldArgs)
            : await createInitialPersistentWorldCareerStateV3(createWorldArgs);
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
      this.resetArchiveAndAwardsCaches();
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
    this.resetArchiveAndAwardsCaches();
    this.setStatus("Saved");
    return state;
  }

  async loadCareer(saveId: string): Promise<ActivePersistentSeasonState> {
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
      this.resetArchiveAndAwardsCaches();
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
    this.resetArchiveAndAwardsCaches();
    this.setStatus(readOnly ? "Read-only" : loaded.recovered ? "Recovered" : "Saved");
    return loaded.state;
  }

  private requireWritable(): { state: ActivePersistentSeasonState; saveId: string } {
    if (!this.state || !this.saveId) throw new Error("Create or load a career first.");
    if (this.readOnly) {
      throw new Error("This career is read-only because another tab owns the writer lease.");
    }
    return { state: this.state, saveId: this.saveId };
  }

  private defaultCareerTitle(nextWorld: AnyPersistentWorldState): string {
    const base = this.teamName(nextWorld.controlledTeamId);
    return nextWorld.currentSeasonNumber > 1
      ? `${base} ${nextWorld.currentCalendarYear} (Season ${nextWorld.currentSeasonNumber})`
      : `${base} ${nextWorld.currentCalendarYear}`;
  }

  private requireActiveRosterPack(): StagedRosterPack {
    const pack = this.getLifecycleState()?.activeRosterPack ?? null;
    if (!pack) {
      throw new Error("Lifecycle roster pack is missing for an evolved season.");
    }
    return pack;
  }

  private async sealActiveSeasonCore(
    builtCore:
      | Omit<T20SeasonState, "stateSha256" | "revision">
      | Omit<LifecycleSeasonState, "stateSha256" | "revision">,
    revision: number,
  ): Promise<ActivePersistentSeasonState> {
    if (builtCore.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
      return sealLifecycleSeasonState({ ...builtCore, revision });
    }
    return sealT20SeasonState({ ...builtCore, revision });
  }

  private async commitMutation(
    command: string,
    payload: unknown,
    build: (
      state: ActivePersistentSeasonState,
      lifecycle: PlayerLifecycleState | null,
    ) => Promise<AnyCareerMutationResult> | AnyCareerMutationResult,
  ): Promise<ActivePersistentSeasonState> {
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
        const currentLifecycle =
          beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION ||
          beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
            ? beforeWorld.lifecycle
            : null;
        const currentEconomy =
          beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
            ? beforeWorld.economy
            : null;
        const builtRaw = await build(before, currentLifecycle);
        const builtCore =
          "core" in builtRaw && "seasonStateVersion" in builtRaw.core
            ? builtRaw.core
            : (builtRaw as
                | Omit<T20SeasonState, "stateSha256" | "revision">
                | Omit<LifecycleSeasonState, "stateSha256" | "revision">);
        const matchEventArchives =
          "core" in builtRaw && "matchEventArchives" in builtRaw
            ? builtRaw.matchEventArchives
            : undefined;
        const updatedLifecycle =
          "core" in builtRaw && "nextLifecycle" in builtRaw && builtRaw.nextLifecycle
            ? builtRaw.nextLifecycle
            : currentLifecycle;
        let updatedEconomy =
          "core" in builtRaw && "nextEconomy" in builtRaw && builtRaw.nextEconomy
            ? builtRaw.nextEconomy
            : currentEconomy;
        const nextSeason = await this.sealActiveSeasonCore(builtCore, before.revision + 1);
        if (
          updatedEconomy &&
          updatedLifecycle &&
          nextSeason.completedMatches.length > 0 &&
          updatedEconomy.negotiationWindow.windowPhase === "OPEN"
        ) {
          updatedEconomy = closeNegotiationWindowForMatchPlay(
            updatedEconomy,
            updatedLifecycle,
            beforeWorld.currentSeasonNumber,
          );
        }
        const nextWorld: AnyPersistentWorldState =
          beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
            ? await rebuildPersistentWorldStateV3(
                beforeWorld,
                nextSeason,
                updatedLifecycle!,
                updatedEconomy!,
                expectedRevision + 1,
              )
            : beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION
              ? await rebuildPersistentWorldStateV2(
                  beforeWorld,
                  nextSeason,
                  updatedLifecycle!,
                  expectedRevision + 1,
                )
              : await rebuildPersistentWorldStateWithActiveSeason(
                  beforeWorld,
                  nextSeason as T20SeasonState,
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

      if (before.seasonStateVersion !== "LC_T20_SEASON_STATE_V1") {
        throw new Error("Single-season slot cannot store a lifecycle season state.");
      }
      const expectedRevision = before.revision;
      if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const builtRaw = await build(before, null);
      const builtCore =
        "core" in builtRaw && "seasonStateVersion" in builtRaw.core
          ? (builtRaw.core as Omit<T20SeasonState, "stateSha256" | "revision">)
          : (builtRaw as Omit<T20SeasonState, "stateSha256" | "revision">);
      const matchEventArchives =
        "core" in builtRaw && "matchEventArchives" in builtRaw
          ? (builtRaw.matchEventArchives as readonly CompletedCareerMatchEventArchive[] | undefined)
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

  private async commitLifecycleOnlyMutation(
    command: string,
    payload: unknown,
    buildLifecycle: (lifecycle: PlayerLifecycleState) => PlayerLifecycleState,
  ): Promise<PlayerLifecycleState> {
    const { saveId } = this.requireWritable();
    if (
      !this.persistentState ||
      (this.persistentState.worldStateVersion !== PERSISTENT_WORLD_STATE_V2_VERSION &&
        this.persistentState.worldStateVersion !== PERSISTENT_WORLD_STATE_V3_VERSION) ||
      !this.persistentRepository
    ) {
      throw new Error("Player lifecycle controls require a Stage 3 persistent world career.");
    }
    const beforeWorld = this.persistentState;
    const expectedRevision = beforeWorld.revision;
    const commandId = token("career-lifecycle-cmd");
    this.setStatus("Saving");
    try {
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const nextLifecycle = buildLifecycle(beforeWorld.lifecycle);
      const nextWorld =
        beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
          ? await rebuildPersistentWorldStateV3(
              beforeWorld,
              beforeWorld.currentSeason,
              nextLifecycle,
              beforeWorld.economy,
              expectedRevision + 1,
            )
          : await rebuildPersistentWorldStateV2(
              beforeWorld,
              beforeWorld.currentSeason,
              nextLifecycle,
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
      });
      this.persistentState = nextWorld;
      this.state = nextWorld.currentSeason;
      this.saveTitle = title;
      this.recovered = false;
      this.setStatus("Saved");
      return nextLifecycle;
    } catch (error) {
      this.setStatus(
        this.readOnly ? "Read-only" : "Error",
        error instanceof Error ? error.message : "Lifecycle update failed.",
      );
      throw error;
    }
  }

  async setYouthProspectFocus(prospectId: string, academyFocus: AcademyTrainingFocus): Promise<void> {
    const controlledTeamId = this.persistentState?.controlledTeamId ?? null;
    await this.commitLifecycleOnlyMutation(
      "SET_ACADEMY_PROSPECT_FOCUS",
      { prospectId, academyFocus },
      (lifecycle) =>
        applySetAcademyProspectFocus(
          lifecycle,
          { command: "SET_ACADEMY_PROSPECT_FOCUS", prospectId, academyFocus },
          controlledTeamId,
        ),
    );
  }

  async setYouthProspectQueue(prospectId: string, queuedForPromotion: boolean): Promise<void> {
    const controlledTeamId = this.persistentState?.controlledTeamId ?? null;
    await this.commitLifecycleOnlyMutation(
      "SET_ACADEMY_PROSPECT_QUEUE",
      { prospectId, queuedForPromotion },
      (lifecycle) =>
        setAcademyProspectPromotionQueue(
          lifecycle,
          { command: "SET_ACADEMY_PROSPECT_QUEUE", prospectId, queuedForPromotion },
          controlledTeamId,
        ),
    );
  }

  async promoteYouthProspectNow(
    prospectId: string,
    releasePlayerId?: string,
  ): Promise<Player> {
    const { state: beforeSeason, saveId } = this.requireWritable();
    if (
      !this.persistentState ||
      (this.persistentState.worldStateVersion !== PERSISTENT_WORLD_STATE_V2_VERSION &&
        this.persistentState.worldStateVersion !== PERSISTENT_WORLD_STATE_V3_VERSION) ||
      !this.persistentRepository
    ) {
      throw new Error("Youth promotion requires a Stage 3 persistent world career.");
    }
    if (beforeSeason.phase !== "ACTIVE" || beforeSeason.completedMatches.length > 0) {
      throw new Error(
        "Direct youth promotion is only open before the first fixture of the season. Queue the prospect for next season instead.",
      );
    }
    const beforeWorld = this.persistentState;
    const expectedRevision = beforeWorld.revision;
    const commandId = token("career-promote-youth");
    this.setStatus("Saving");
    try {
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const promoted = promoteYouthProspectPreSeason({
        lifecycle: beforeWorld.lifecycle,
        worldId: beforeWorld.worldIdentity.worldId,
        rawRequest: {
          command: "PROMOTE_YOUTH_PROSPECT",
          prospectId,
          seasonNumber: beforeWorld.currentSeasonNumber,
        },
        controlledTeamId: beforeWorld.controlledTeamId,
      });
      const priorSeasonSha =
        beforeWorld.completedSeasons.at(-1)?.finalSeasonStateSha256 ?? null;
      const nextSeason = await createLifecycleSeasonStateForWorld({
        worldIdentity: beforeWorld.worldIdentity,
        rosterPack: promoted.lifecycle.activeRosterPack!,
        careerId: beforeWorld.careerId,
        controlledTeamId: beforeWorld.controlledTeamId,
        seasonNumber: beforeWorld.currentSeasonNumber,
        calendarYear: beforeWorld.currentCalendarYear,
        startDate: seasonStartDateOf(beforeSeason),
        priorSeasonFinalStateSha256: priorSeasonSha,
        carryForwardDirectives: beforeSeason.careerState.trainingAssignments,
      });
      const nextEconomy =
        beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
          ? registerPreSeasonYouthContract({
              economy: beforeWorld.economy,
              lifecycle: promoted.lifecycle,
              promotedPlayer: promoted.promotedPlayer,
              teamId: beforeWorld.controlledTeamId!,
              seasonNumber: beforeWorld.currentSeasonNumber,
              calendarYear: beforeWorld.currentCalendarYear,
              currentDate: beforeSeason.careerState.currentDate,
            })
          : null;
      const nextWorld =
        beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
          ? await rebuildPersistentWorldStateV3(
              beforeWorld,
              nextSeason,
              promoted.lifecycle,
              nextEconomy!,
              expectedRevision + 1,
            )
          : await rebuildPersistentWorldStateV2(
              beforeWorld,
              nextSeason,
              promoted.lifecycle,
              expectedRevision + 1,
            );
      const requestCanonical = canonicalJson({
        command: "PROMOTE_YOUTH_PROSPECT_PRESEASON",
        expectedRevision,
        prospectId,
        releasePlayerId: releasePlayerId ?? null,
      });
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
            promotedPlayerId: promoted.promotedPlayer.playerId,
          }),
          committedRevision: nextWorld.revision,
        },
        ownerId: this.ownerId,
        now: Date.now(),
        updatedAt: nowIso(),
        setActive: true,
        worldCopy: this.worldCopy,
      });
      this.persistentState = nextWorld;
      this.state = nextSeason;
      this.saveTitle = title;
      this.recovered = false;
      this.setStatus("Saved");
      return promoted.promotedPlayer;
    } catch (error) {
      this.setStatus(
        this.readOnly ? "Read-only" : "Error",
        error instanceof Error ? error.message : "Youth promotion failed.",
      );
      throw error;
    }
  }

  /**
   * Closes a completed persistent-world season once, seals its CompletedSeasonRecord,
   * advances the calendar, evolves player lifecycle (for V2 worlds), generates the next
   * season's 56-fixture schedule, and updates cumulative career projections.
   */
  async closeSeasonAndAdvance(
    expectedClosedSeasonId?: string,
  ): Promise<{ state: AnyPersistentWorldState; idempotentReplay: boolean }> {
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
      const { nextState }:
        | { nextState: PersistentWorldState }
        | { nextState: PersistentWorldStateV2 }
        | { nextState: PersistentWorldStateV3 } =
        beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
          ? await rolloverPersistentWorldCareerSeasonV3(beforeWorld, expectedRevision + 1)
          : beforeWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION
            ? await rolloverPersistentWorldCareerSeasonV2(beforeWorld, expectedRevision + 1)
            : await rolloverPersistentWorldCareerSeason(beforeWorld, expectedRevision + 1);
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
  async copySingleSeasonToPersistentWorldV2(customTitle?: string): Promise<PersistentWorldStateV2> {
    const { state: sourceState, saveId: sourceSaveId } = this.requireWritable();
    if (this.persistentState) {
      throw new Error("This career is already a persistent multi-season world.");
    }
    if (!this.persistentRepository) {
      throw new Error("Persistent world storage is unavailable.");
    }
    if (
      sourceState.seasonStateVersion !== "LC_T20_SEASON_STATE_V1" ||
      sourceState.phase !== "COMPLETE"
    ) {
      throw new Error(
        "Complete all 56 fixtures in this single-season career before copying into a multi-season world.",
      );
    }
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const worldId = `world-${key}`;
    const newCareerId = `career-${key}`;
    const targetSaveId = `pworld:${worldId}`;
    const nextWorld = await copyCompletedSingleSeasonToPersistentWorldStateV2({
      sourceSaveId,
      sourceState,
      worldId,
      newCareerId,
      baseSeed: `seed-${key}`,
      worldCopy: this.worldCopy,
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

  async copySingleSeasonToPersistentWorld(customTitle?: string): Promise<PersistentWorldStateV3> {
    const { state: sourceState, saveId: sourceSaveId } = this.requireWritable();
    if (this.persistentState) {
      throw new Error("This career is already a persistent multi-season world.");
    }
    if (!this.persistentRepository) {
      throw new Error("Persistent world storage is unavailable.");
    }
    if (
      sourceState.seasonStateVersion !== "LC_T20_SEASON_STATE_V1" ||
      sourceState.phase !== "COMPLETE"
    ) {
      throw new Error(
        "Complete all 56 fixtures in this single-season career before copying into a multi-season world.",
      );
    }
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const worldId = `world-${key}`;
    const newCareerId = `career-${key}`;
    const targetSaveId = `pworld:${worldId}`;
    const nextWorld = await copyCompletedSingleSeasonToPersistentWorldStateV3({
      sourceSaveId,
      sourceState,
      worldId,
      newCareerId,
      baseSeed: `seed-${key}`,
      worldCopy: this.worldCopy,
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

  /**
   * Explicit copy-upgrade from a Stage 2 V1 persistent world into a new Stage 3 V2
   * persistent world slot with player lifecycle & youth academy, keeping the V1 slot untouched.
   */
  async upgradeStage2V1ToStage3V2(customTitle?: string): Promise<PersistentWorldStateV2> {
    const { saveId: sourceSaveId } = this.requireWritable();
    if (
      !this.persistentState ||
      this.persistentState.worldStateVersion !== PERSISTENT_WORLD_STATE_VERSION
    ) {
      throw new Error("Only Stage 2 V1 persistent worlds need a Stage 3 lifecycle upgrade.");
    }
    if (!this.persistentRepository) {
      throw new Error("Persistent world storage is unavailable.");
    }
    const sourceWorld = this.persistentState;
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const worldId = `world-${key}`;
    const targetSaveId = `pworld:${worldId}`;
    const worldIdentity = derivePersistentWorldIdentity({
      worldId,
      baseSeed: sourceWorld.worldIdentity.baseSeed,
      originKind: sourceWorld.worldIdentity.originKind,
      sourceSingleSeasonSaveId: sourceWorld.worldIdentity.sourceSingleSeasonSaveId,
      sourceSingleSeasonFinalStateSha256:
        sourceWorld.worldIdentity.sourceSingleSeasonFinalStateSha256,
    });
    const lifecycle = createInitialPlayerLifecycleState({
      worldIdentity,
      baseWorld: careerWorld,
      worldCopy: this.worldCopy,
      calendarYear: sourceWorld.currentCalendarYear,
      seasonNumber: sourceWorld.currentSeasonNumber,
    });
    const careerProjection = await sealPersistentCareerProjection(
      rebuildPersistentCareerProjectionCore({
        worldId,
        teamIds: T20_LEAGUE_COMPETITION.teamIds,
        completedSeasons: sourceWorld.completedSeasons,
        activeSeason: sourceWorld.currentSeason,
      }),
    );
    const nextWorld = await sealPersistentWorldStateV2({
      worldStateVersion: PERSISTENT_WORLD_STATE_V2_VERSION,
      worldIdentity,
      careerId: sourceWorld.careerId,
      controlledTeamId: sourceWorld.controlledTeamId,
      currentSeasonNumber: sourceWorld.currentSeasonNumber,
      currentCalendarYear: sourceWorld.currentCalendarYear,
      completedSeasons: sourceWorld.completedSeasons,
      lifecycle,
      currentSeason: sourceWorld.currentSeason,
      careerProjection,
      lastRolloverReceipt: sourceWorld.lastRolloverReceipt,
      revision: 1,
    });
    const now = Date.now();
    if (!(await this.persistentRepository.acquireLease(sourceSaveId, this.ownerId, now))) {
      throw new Error("This career is open in another tab.");
    }
    if (!(await this.persistentRepository.acquireLease(targetSaveId, this.ownerId, now))) {
      throw new Error("New Stage 3 persistent world slot is locked.");
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
          sourceRecordType: PERSISTENT_WORLD_RECORD_TYPE,
          revision: sourceWorld.revision,
          stateSha256: sourceWorld.stateSha256,
          isUpgrade: true,
          now: () => Date.now(),
        },
      });
      await this.persistentRepository.releaseLease(sourceSaveId, this.ownerId);
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
      this.setStatus("Error", error instanceof Error ? error.message : "Stage 3 upgrade failed.");
      throw error;
    }
  }

  /**
   * Explicit copy-upgrade from a Stage 2 V1 or Stage 3 V2 persistent world into a new Stage 4 V3
   * persistent world slot with domestic contracts, club budgets, free agents & recruitment.
   */
  async upgradeToStage4EconomyV3(customTitle?: string): Promise<PersistentWorldStateV3> {
    const { saveId: sourceSaveId } = this.requireWritable();
    if (
      !this.persistentState ||
      this.persistentState.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION
    ) {
      throw new Error("Only Stage 2 V1 or Stage 3 V2 persistent worlds need a Stage 4 economy upgrade.");
    }
    if (!this.persistentRepository) {
      throw new Error("Persistent world storage is unavailable.");
    }
    const sourceWorld = this.persistentState;
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const worldId = `world-${key}`;
    const targetSaveId = `pworld:${worldId}`;
    const worldIdentity = derivePersistentWorldIdentity({
      worldId,
      baseSeed: sourceWorld.worldIdentity.baseSeed,
      originKind: sourceWorld.worldIdentity.originKind,
      sourceSingleSeasonSaveId: sourceWorld.worldIdentity.sourceSingleSeasonSaveId,
      sourceSingleSeasonFinalStateSha256:
        sourceWorld.worldIdentity.sourceSingleSeasonFinalStateSha256,
    });
    const baseLifecycle =
      sourceWorld.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION
        ? sourceWorld.lifecycle
        : createInitialPlayerLifecycleState({
            worldIdentity,
            baseWorld: careerWorld,
            worldCopy: this.worldCopy,
            calendarYear: sourceWorld.currentCalendarYear,
            seasonNumber: sourceWorld.currentSeasonNumber,
            useRosterPackImmediately: sourceWorld.currentSeason.completedMatches.length === 0,
          });
    let economy = createInitialSquadEconomyState({
      worldIdentity,
      lifecycle: baseLifecycle,
      seasonNumber: sourceWorld.currentSeasonNumber,
      calendarYear: sourceWorld.currentCalendarYear,
      currentDate: sourceWorld.currentSeason.careerState.currentDate,
      recentStats: this.recentPlayerStatsForMarket(),
    });
    if (sourceWorld.currentSeason.completedMatches.length > 0) {
      economy = closeNegotiationWindowForMatchPlay(
        economy,
        baseLifecycle,
        sourceWorld.currentSeasonNumber,
      );
    }
    let upgradedSeason: ActivePersistentSeasonState = sourceWorld.currentSeason;
    if (
      sourceWorld.currentSeason.completedMatches.length === 0 &&
      baseLifecycle.activeRosterPack &&
      sourceWorld.currentSeason.seasonStateVersion !== LIFECYCLE_SEASON_STATE_VERSION
    ) {
      upgradedSeason = await createLifecycleSeasonStateForWorld({
        worldIdentity,
        rosterPack: baseLifecycle.activeRosterPack,
        careerId: sourceWorld.careerId,
        controlledTeamId: sourceWorld.controlledTeamId,
        seasonNumber: sourceWorld.currentSeasonNumber,
        calendarYear: sourceWorld.currentCalendarYear,
        startDate: seasonStartDateOf(sourceWorld.currentSeason),
        priorSeasonFinalStateSha256:
          sourceWorld.completedSeasons.at(-1)?.finalSeasonStateSha256 ?? null,
        carryForwardDirectives: sourceWorld.currentSeason.careerState.trainingAssignments,
      });
    }
    const careerProjection = await sealPersistentCareerProjection(
      rebuildPersistentCareerProjectionCore({
        worldId,
        teamIds: T20_LEAGUE_COMPETITION.teamIds,
        completedSeasons: sourceWorld.completedSeasons,
        activeSeason: upgradedSeason,
      }),
    );
    const nextWorld = await sealPersistentWorldStateV3({
      worldStateVersion: PERSISTENT_WORLD_STATE_V3_VERSION,
      worldIdentity,
      careerId: sourceWorld.careerId,
      controlledTeamId: sourceWorld.controlledTeamId,
      currentSeasonNumber: sourceWorld.currentSeasonNumber,
      currentCalendarYear: sourceWorld.currentCalendarYear,
      completedSeasons: sourceWorld.completedSeasons,
      lifecycle: baseLifecycle,
      economy,
      currentSeason: upgradedSeason,
      careerProjection,
      lastRolloverReceipt: sourceWorld.lastRolloverReceipt,
      revision: 1,
    });
    const now = Date.now();
    if (!(await this.persistentRepository.acquireLease(sourceSaveId, this.ownerId, now))) {
      throw new Error("This career is open in another tab.");
    }
    if (!(await this.persistentRepository.acquireLease(targetSaveId, this.ownerId, now))) {
      throw new Error("New Stage 4 persistent world slot is locked.");
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
          sourceRecordType: PERSISTENT_WORLD_RECORD_TYPE,
          revision: sourceWorld.revision,
          stateSha256: sourceWorld.stateSha256,
          isUpgrade: true,
          now: () => Date.now(),
        },
      });
      await this.persistentRepository.releaseLease(sourceSaveId, this.ownerId);
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
      this.setStatus("Error", error instanceof Error ? error.message : "Stage 4 upgrade failed.");
      throw error;
    }
  }

  private async commitEconomyMutation<T>(
    commandId: string,
    commandName: string,
    payload: unknown,
    mutate: (worldState: PersistentWorldStateV3) => Promise<{
      economy: SquadEconomyState;
      lifecycle: PlayerLifecycleState;
      rosterChanged: boolean;
      result: T;
      idempotentDuplicate?: boolean;
    }> | {
      economy: SquadEconomyState;
      lifecycle: PlayerLifecycleState;
      rosterChanged: boolean;
      result: T;
      idempotentDuplicate?: boolean;
    },
  ): Promise<T> {
    const { state: beforeSeason, saveId } = this.requireWritable();
    if (
      !this.persistentState ||
      this.persistentState.worldStateVersion !== PERSISTENT_WORLD_STATE_V3_VERSION ||
      !this.persistentRepository
    ) {
      throw new Error("Contract and recruitment actions require a Stage 4 persistent world career.");
    }
    const beforeWorld = this.persistentState;
    const expectedRevision = beforeWorld.revision;
    this.setStatus("Saving");
    try {
      if (!(await this.persistentRepository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const outcome = await mutate(beforeWorld);
      if (outcome.idempotentDuplicate) {
        this.setStatus("Saved");
        return outcome.result;
      }
      let nextSeason: ActivePersistentSeasonState = beforeSeason;
      if (outcome.rosterChanged) {
        if (beforeSeason.completedMatches.length > 0) {
          throw new Error("Squad transfers cannot alter an active season after match play begins.");
        }
        const priorSeasonSha =
          beforeWorld.completedSeasons.at(-1)?.finalSeasonStateSha256 ?? null;
        nextSeason = await createLifecycleSeasonStateForWorld({
          worldIdentity: beforeWorld.worldIdentity,
          rosterPack: outcome.lifecycle.activeRosterPack!,
          careerId: beforeWorld.careerId,
          controlledTeamId: beforeWorld.controlledTeamId,
          seasonNumber: beforeWorld.currentSeasonNumber,
          calendarYear: beforeWorld.currentCalendarYear,
          startDate: seasonStartDateOf(beforeSeason),
          priorSeasonFinalStateSha256: priorSeasonSha,
          carryForwardDirectives: beforeSeason.careerState.trainingAssignments,
        });
      }
      const nextWorld = await rebuildPersistentWorldStateV3(
        beforeWorld,
        nextSeason,
        outcome.lifecycle,
        outcome.economy,
        expectedRevision + 1,
      );
      const requestCanonical = canonicalJson({ commandName, commandId, payload });
      const title = this.saveTitle ?? this.defaultCareerTitle(nextWorld);
      const committed = await this.persistentRepository.commit({
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
            economySha256: nextWorld.economy.economySha256,
          }),
          committedRevision: nextWorld.revision,
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
        return outcome.result;
      }
      this.persistentState = nextWorld;
      this.state = nextSeason;
      this.saveTitle = title;
      this.recovered = false;
      this.setStatus("Saved");
      return outcome.result;
    } catch (error) {
      this.setStatus(
        this.readOnly ? "Read-only" : "Error",
        error instanceof Error ? error.message : "Contract action failed.",
      );
      throw error;
    }
  }

  async submitContractOffer(input: {
    playerId: string;
    offerKind: ContractOfferKind;
    annualWageK: number;
    termSeasons: number;
    commandId?: string;
  }): Promise<{ offer: ContractOffer | null; duplicate: boolean }> {
    const offeringTeamId = this.persistentState?.controlledTeamId;
    if (!offeringTeamId) throw new Error("No managed club is selected.");
    const cmdId = input.commandId ?? token("economy-offer");
    return this.commitEconomyMutation(
      cmdId,
      "SUBMIT_CONTRACT_OFFER",
      { ...input, offeringTeamId },
      (worldState) => {
        const applied = applySubmitContractOffer({
          economy: worldState.economy,
          lifecycle: worldState.lifecycle,
          seasonNumber: worldState.currentSeasonNumber,
          calendarYear: worldState.currentCalendarYear,
          currentDate: worldState.currentSeason.careerState.currentDate,
          rawRequest: {
            command: "SUBMIT_CONTRACT_OFFER",
            commandId: cmdId,
            offeringTeamId,
            playerId: input.playerId,
            offerKind: input.offerKind,
            annualWageK: input.annualWageK,
            termSeasons: input.termSeasons,
          },
          submittedBy: "HUMAN_MANAGER",
          recentStats: this.recentPlayerStatsForMarket(),
        });
        return {
          economy: applied.economy,
          lifecycle: worldState.lifecycle,
          rosterChanged: false,
          idempotentDuplicate: applied.duplicate,
          result: { offer: applied.offer, duplicate: applied.duplicate },
        };
      },
    );
  }

  async withdrawContractOffer(
    offerId: string,
    commandId?: string,
  ): Promise<{ duplicate: boolean }> {
    const offeringTeamId = this.persistentState?.controlledTeamId;
    if (!offeringTeamId) throw new Error("No managed club is selected.");
    const cmdId = commandId ?? token("economy-withdraw");
    return this.commitEconomyMutation(
      cmdId,
      "WITHDRAW_CONTRACT_OFFER",
      { offerId, offeringTeamId },
      (worldState) => {
        const applied = applyWithdrawContractOffer({
          economy: worldState.economy,
          lifecycle: worldState.lifecycle,
          seasonNumber: worldState.currentSeasonNumber,
          rawRequest: {
            command: "WITHDRAW_CONTRACT_OFFER",
            commandId: cmdId,
            offeringTeamId,
            offerId,
          },
        });
        return {
          economy: applied.economy,
          lifecycle: worldState.lifecycle,
          rosterChanged: false,
          idempotentDuplicate: applied.duplicate,
          result: { duplicate: applied.duplicate },
        };
      },
    );
  }

  async acceptCounterOffer(
    offerId: string,
    commandId?: string,
  ): Promise<{ duplicate: boolean; rosterChanged: boolean }> {
    const offeringTeamId = this.persistentState?.controlledTeamId;
    if (!offeringTeamId) throw new Error("No managed club is selected.");
    const cmdId = commandId ?? token("economy-accept-counter");
    return this.commitEconomyMutation(
      cmdId,
      "ACCEPT_COUNTER_OFFER",
      { offerId, offeringTeamId },
      (worldState) => {
        const applied = applyAcceptCounterOffer({
          economy: worldState.economy,
          lifecycle: worldState.lifecycle,
          worldId: worldState.worldIdentity.worldId,
          seasonNumber: worldState.currentSeasonNumber,
          calendarYear: worldState.currentCalendarYear,
          currentDate: worldState.currentSeason.careerState.currentDate,
          rawRequest: {
            command: "ACCEPT_COUNTER_OFFER",
            commandId: cmdId,
            offeringTeamId,
            offerId,
          },
        });
        return {
          economy: applied.economy,
          lifecycle: applied.lifecycle,
          rosterChanged: applied.rosterChanged,
          idempotentDuplicate: applied.duplicate,
          result: { duplicate: applied.duplicate, rosterChanged: applied.rosterChanged },
        };
      },
    );
  }

  async resolveNegotiationRound(commandId?: string): Promise<{
    duplicate: boolean;
    signedOffers: ContractOffer[];
    counteredOffers: ContractOffer[];
  }> {
    const economy = this.getEconomyState();
    if (!economy) throw new Error("Contract negotiations require a Stage 4 persistent world career.");
    const expectedRound = economy.negotiationWindow.currentRound;
    const seasonNumber = this.persistentState!.currentSeasonNumber;
    const cmdId =
      commandId ?? `neg-round:${this.saveId}:s${seasonNumber}:r${expectedRound}`;
    return this.commitEconomyMutation(
      cmdId,
      "RESOLVE_NEGOTIATION_ROUND",
      { seasonNumber, expectedRound },
      (worldState) => {
        const applied = applyResolveNegotiationRound({
          economy: worldState.economy,
          lifecycle: worldState.lifecycle,
          worldIdentity: worldState.worldIdentity,
          controlledTeamId: worldState.controlledTeamId,
          seasonNumber: worldState.currentSeasonNumber,
          calendarYear: worldState.currentCalendarYear,
          currentDate: worldState.currentSeason.careerState.currentDate,
          rawRequest: {
            command: "RESOLVE_NEGOTIATION_ROUND",
            commandId: cmdId,
            seasonNumber,
            expectedRound,
          },
          recentStats: this.recentPlayerStatsForMarket(),
        });
        return {
          economy: applied.economy,
          lifecycle: applied.lifecycle,
          rosterChanged: applied.rosterChanged,
          idempotentDuplicate: applied.duplicate,
          result: {
            duplicate: applied.duplicate,
            signedOffers: applied.signedOffers,
            counteredOffers: applied.counteredOffers,
          },
        };
      },
    );
  }

  async releaseContractedPlayer(
    playerId: string,
    commandId?: string,
  ): Promise<{ duplicate: boolean }> {
    const teamId = this.persistentState?.controlledTeamId;
    if (!teamId) throw new Error("No managed club is selected.");
    const cmdId = commandId ?? token("economy-release");
    return this.commitEconomyMutation(
      cmdId,
      "RELEASE_CONTRACTED_PLAYER",
      { teamId, playerId },
      (worldState) => {
        const applied = applyReleaseContractedPlayer({
          economy: worldState.economy,
          lifecycle: worldState.lifecycle,
          worldId: worldState.worldIdentity.worldId,
          seasonNumber: worldState.currentSeasonNumber,
          calendarYear: worldState.currentCalendarYear,
          currentDate: worldState.currentSeason.careerState.currentDate,
          rawRequest: {
            command: "RELEASE_CONTRACTED_PLAYER",
            commandId: cmdId,
            teamId,
            playerId,
          },
          recentStats: this.recentPlayerStatsForMarket(),
        });
        return {
          economy: applied.economy,
          lifecycle: applied.lifecycle,
          rosterChanged: !applied.duplicate,
          idempotentDuplicate: applied.duplicate,
          result: { duplicate: applied.duplicate },
        };
      },
    );
  }

  async setTraining(playerId: string, directive: TrainingDirective): Promise<void> {
    await this.commitMutation("SET_TRAINING", { playerId, directive }, (state) => {
      if (state.phase !== "ACTIVE") throw new Error("Completed seasons are immutable.");
      if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
        const pack = this.requireActiveRosterPack();
        const changed = setRosterTrainingDirective(
          state.careerState,
          {
            command: "SET_TRAINING_DIRECTIVE",
            playerId,
            directive,
            effectiveDate: state.careerState.currentDate,
            expectedRevision: state.careerState.revision,
          },
          state.schedule,
          pack,
        );
        return { ...stateCore(state), careerState: changed };
      }
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
    await this.commitMutation("ADVANCE_DAY", {}, (state, lifecycle) => {
      if (state.phase !== "ACTIVE") throw new Error("Completed seasons are immutable.");
      const nextFixture = this.nextManagedFixture(state);
      if (nextFixture && state.careerState.currentDate >= nextFixture.matchDayDate) {
        throw new Error("Resolve the managed fixture before advancing the career date.");
      }
      const nextLifecycle = lifecycle
        ? recordElapsedTrainingExposure(lifecycle, state.careerState.trainingAssignments, 1, state.controlledTeamId)
        : undefined;
      if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
        const pack = this.requireActiveRosterPack();
        const careerState = advanceRosterCareerDay(
          state.careerState,
          state.schedule,
          pack,
        );
        if (nextFixture && careerState.currentDate > nextFixture.matchDayDate) {
          throw new Error("Career date cannot pass the next managed fixture.");
        }
        return {
          core: { ...stateCore(state), careerState },
          ...(nextLifecycle ? { nextLifecycle } : {}),
        };
      }
      const careerState = advanceCareerDayV2(state.careerState).state;
      if (nextFixture && careerState.currentDate > nextFixture.matchDayDate) {
        throw new Error("Career date cannot pass the next managed fixture.");
      }
      return {
        core: { ...stateCore(state), careerState },
        ...(nextLifecycle ? { nextLifecycle } : {}),
      };
    });
  }

  private applyOffscreenCompletion(
    state: ActivePersistentSeasonState,
    fixtureId: string,
  ): {
    core:
      | Omit<T20SeasonState, "stateSha256" | "revision">
      | Omit<LifecycleSeasonState, "stateSha256" | "revision">;
    archive: AnyCareerMatchEventArchive;
  } {
    if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
      const pack = this.requireActiveRosterPack();
      const simulated = simulateRosterOffscreenFixture(
        pack,
        state.schedule,
        state.careerState,
        fixtureId,
      );
      const rosterCompletion = rosterCompletionFromOffscreen(state.schedule, simulated.outcome);
      const completion = T20SeasonMatchCompletionSchema.parse({
        ...rosterCompletion,
        completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1",
      });
      const archive: CompletedLifecycleMatchEventArchive =
        createCompletedLifecycleMatchEventArchive({
          completion,
          rosterPackSha256: state.rosterPackSha256,
          session: simulated.session,
        });
      const projection = applyRosterSeasonCompletion(
        state.projection,
        state.schedule,
        rosterCompletion,
      );
      const completedMatches = [...state.completedMatches, completion].sort(
        (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || compareCodePoints(a.fixtureId, b.fixtureId),
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
      (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || compareCodePoints(a.fixtureId, b.fixtureId),
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
      .sort((a, b) => compareCodePoints(a.fixtureId, b.fixtureId));
    const requiresDateAdvance = initial.careerState.currentDate < target.matchDayDate;
    const pendingOthers = roundOthers.filter((fixture) => !completedIds.has(fixture.fixtureId));
    const requiresNegotiationWindowClose =
      this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION &&
      this.persistentState.economy.negotiationWindow.windowPhase === "OPEN";
    if (!requiresDateAdvance && pendingOthers.length === 0 && !requiresNegotiationWindowClose) {
      return target;
    }

    await this.commitMutation(
      "SIMULATE_TO_NEXT_USER_FIXTURE",
      { fixtureId: target.fixtureId },
      async (state, lifecycle) => {
        let daysAdvanced = 0;
        let working: ActivePersistentSeasonState = state;
        if (working.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
          const pack = this.requireActiveRosterPack();
          let careerState = working.careerState;
          while (careerState.currentDate < target.matchDayDate) {
            careerState = advanceRosterCareerDay(
              careerState,
              working.schedule,
              pack,
            );
            daysAdvanced += 1;
          }
          if (careerState.currentDate !== target.matchDayDate) {
            throw new Error("Career date does not match managed fixture date.");
          }
          working = { ...working, careerState };
        } else {
          let careerState = working.careerState;
          while (careerState.currentDate < target.matchDayDate) {
            careerState = advanceCareerDayV2(careerState).state;
            daysAdvanced += 1;
          }
          if (careerState.currentDate !== target.matchDayDate) {
            throw new Error("Career date does not match managed fixture date.");
          }
          working = { ...working, careerState };
        }
        const nextLifecycle =
          lifecycle && daysAdvanced > 0
            ? recordElapsedTrainingExposure(
                lifecycle,
                state.careerState.trainingAssignments,
                daysAdvanced,
                state.controlledTeamId,
              )
            : lifecycle ?? undefined;
        const already = new Set(working.completedMatches.map((match) => match.fixtureId));
        const archives: AnyCareerMatchEventArchive[] = [];
        for (const fixture of roundOthers) {
          if (already.has(fixture.fixtureId)) continue;
          const applied = this.applyOffscreenCompletion(working, fixture.fixtureId);
          working = await this.sealActiveSeasonCore(applied.core, working.revision);
          archives.push(applied.archive);
          already.add(fixture.fixtureId);
        }
        const activeCore:
          | Omit<T20SeasonState, "stateSha256" | "revision">
          | Omit<LifecycleSeasonState, "stateSha256" | "revision"> =
          working.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION
            ? { ...stateCore(working), phase: "ACTIVE" }
            : { ...stateCore(working), phase: "ACTIVE" };
        const nextEconomy =
          this.persistentState?.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION &&
          this.persistentState.economy.negotiationWindow.windowPhase === "OPEN" &&
          nextLifecycle
            ? closeNegotiationWindowForMatchPlay(
                this.persistentState.economy,
                nextLifecycle,
                this.persistentState.currentSeasonNumber,
              )
            : undefined;
        return {
          core: activeCore,
          matchEventArchives: archives,
          ...(nextLifecycle ? { nextLifecycle } : {}),
          ...(nextEconomy ? { nextEconomy } : {}),
        };
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
    if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
      const pack = this.requireActiveRosterPack();
      const selections = selectRosterFixtureTeams(
        pack,
        state.schedule,
        state.careerState,
        fixture.fixtureId,
      );
      return {
        launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V4_LIFECYCLE" as const,
        rosterPack: structuredClone(pack),
        ...(this.worldCopy ? { worldCopy: structuredClone(this.worldCopy) } : {}),
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
        if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
          const pack = this.requireActiveRosterPack();
          const careerState = applyRosterMatchCondition(
            state.careerState,
            result.conditionDelta,
            state.schedule,
            pack,
          );
          let resolvedRosterSession: RosterT20Session | undefined = session
            ? (session as unknown as RosterT20Session)
            : undefined;
          if (!resolvedRosterSession && result.completedSession !== undefined) {
            try {
              resolvedRosterSession = rehydrateRosterT20Session(result.completedSession, pack);
            } catch {
              /* legacy or synthetic test payload without full rehydratable RosterT20Session */
            }
          }
          const maybeArchive: AnyCareerMatchEventArchive[] = resolvedRosterSession
            ? [
                createCompletedLifecycleMatchEventArchive({
                  completion,
                  rosterPackSha256: state.rosterPackSha256,
                  session: resolvedRosterSession,
                }),
              ]
            : [];
          const rosterCompletion = RosterSeasonMatchCompletionSchema.parse({
            completionVersion: "LC_T20_ROSTER_SEASON_COMPLETION_V2",
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
          const projection = applyRosterSeasonCompletion(
            state.projection,
            state.schedule,
            rosterCompletion,
          );
          const completedMatches = [...state.completedMatches, completion].sort(
            (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || compareCodePoints(a.fixtureId, b.fixtureId),
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
        }

        const careerState = applyMatchConditionDeltaV2(
          state.careerState,
          result.conditionDelta,
          state.schedule,
        );
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
          (a, b) => a.fixtureOrdinal - b.fixtureOrdinal || compareCodePoints(a.fixtureId, b.fixtureId),
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

    if (state.seasonStateVersion !== "LC_T20_SEASON_STATE_V1") {
      throw new Error("Lifecycle season state requires persistent world storage.");
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
      const rosterPacks = this.persistentRepository.loadLifecycleRosterPacks
        ? [...(await this.persistentRepository.loadLifecycleRosterPacks(saveId)).values()]
        : [];
      // The awards ledger is derived and no longer exported (rebuilt on import), so it is not synced here.
      const awardsLedger = null;
      if (loaded.state.worldStateVersion === PERSISTENT_WORLD_STATE_V3_VERSION) {
        // Compressed V4 export (docs/design/MATCH_ARCHIVE_STORAGE_V2.md): long careers fit the size limit.
        void awardsLedger;
        return createPersistentWorldPortableArchiveV4(
          loaded.state,
          loaded.summary,
          nowIso(),
          loaded.worldCopy ?? null,
          eventArchives.length > 0 ? eventArchives : null,
          rosterPacks.length > 0 ? rosterPacks : null,
        );
      }
      if (loaded.state.worldStateVersion === PERSISTENT_WORLD_STATE_V2_VERSION) {
        return createPersistentWorldPortableArchiveV2(
          loaded.state,
          loaded.summary,
          nowIso(),
          loaded.worldCopy ?? null,
          eventArchives.length > 0 ? eventArchives : null,
          rosterPacks.length > 0 ? rosterPacks : null,
          awardsLedger,
        );
      }
      const v1EventArchives = eventArchives.filter(
        (archive): archive is CompletedCareerMatchEventArchive =>
          archive.archiveVersion === "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1",
      );
      return createPersistentWorldPortableArchive(
        loaded.state,
        loaded.summary,
        nowIso(),
        loaded.worldCopy ?? null,
        v1EventArchives.length > 0 ? v1EventArchives : null,
        awardsLedger,
      );
    }

    const state = this.state;
    if (state.seasonStateVersion !== "LC_T20_SEASON_STATE_V1") {
      throw new Error("Lifecycle season state requires persistent world export.");
    }
    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    const archive =
      state.phase === "COMPLETE"
        ? await createT20SeasonArchive(state, deterministicSeasonCompletedAt(state))
        : null;
    const eventArchives = this.repository.loadMatchEventArchives
      ? (await this.repository.loadMatchEventArchives(saveId, state)).archives
      : [];
    // The awards ledger is derived and no longer exported (rebuilt on import), so it is not synced here.
    const awardsLedger = null;
    return createSeasonPortableArchive(
      state,
      loaded.summary,
      nowIso(),
      archive,
      loaded.worldCopy ?? null,
      eventArchives.length > 0 ? eventArchives : null,
      awardsLedger,
    );
  }

  async importCareer(bytes: Uint8Array): Promise<ActivePersistentSeasonState> {
    const version = peekPortableArchiveVersion(bytes);
    if (
      version === PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION ||
      version === PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION ||
      version === PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION ||
      version === PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION
    ) {
      if (!this.persistentRepository) {
        throw new Error("Persistent world storage is unavailable.");
      }
      const imported =
        version === PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION
          ? await readPersistentWorldPortableArchiveV4(bytes)
          : version === PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION
          ? await readPersistentWorldPortableArchiveV3(bytes)
          : version === PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION
            ? await readPersistentWorldPortableArchiveV2(bytes)
            : await readPersistentWorldPortableArchive(bytes);
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
        ...("seasonRosterPacks" in imported && imported.seasonRosterPacks.length > 0
          ? { seasonRosterPacks: imported.seasonRosterPacks }
          : {}),
      });
      if (imported.awardsLedger && this.persistentRepository.saveAwardsLedger) {
        await this.persistentRepository.saveAwardsLedger(saveId, imported.awardsLedger);
      }
      this.persistentState = imported.state;
      this.state = imported.state.currentSeason;
      this.saveTitle = title;
      this.worldCopy = copy;
      this.saveId = saveId;
      this.readOnly = false;
      this.recovered = false;
      this.resetArchiveAndAwardsCaches();
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
    if (imported.awardsLedger && this.repository.saveAwardsLedger) {
      await this.repository.saveAwardsLedger(saveId, imported.awardsLedger);
    }
    this.persistentState = null;
    this.state = imported.state;
    this.saveTitle = title;
    this.worldCopy = copy;
    this.saveId = saveId;
    this.readOnly = false;
    this.recovered = false;
    this.resetArchiveAndAwardsCaches();
    this.setStatus("Saved");
    return imported.state;
  }

  findCompletionByFixtureId(fixtureId: string): T20SeasonMatchCompletion | null {
    if (this.persistentState) {
      return collectPersistentWorldCompletions(this.persistentState).get(fixtureId) ?? null;
    }
    return this.state?.completedMatches.find((m) => m.fixtureId === fixtureId) ?? null;
  }

  private findRosterPackBySha(sha256: string): StagedRosterPack | null {
    const lifecycle = this.getLifecycleState();
    if (!lifecycle) return null;
    return findLifecycleRosterPackBySha256(lifecycle, sha256);
  }

  async replayFixtureArchive(fixtureId: string): Promise<CareerReplayOutcome> {
    if (!this.state || !this.saveId) throw new Error("No career is loaded.");
    const completion = this.findCompletionByFixtureId(fixtureId);
    if (!completion) return { status: "UNAVAILABLE" };

    if (this.persistentState && this.persistentRepository) {
      const repo = this.persistentRepository;
      if (!repo.loadMatchEventArchive && !repo.loadMatchEventArchives) return { status: "UNAVAILABLE" };
      // Read just this fixture when the repository can (docs/design/MATCH_ARCHIVE_STORAGE_V2.md).
      const loaded = repo.loadMatchEventArchive
        ? await repo.loadMatchEventArchive(this.saveId, fixtureId, this.persistentState).then((one) => ({
            archives: one.archive ? [one.archive] : [],
            damagedFixtureIds: one.damaged ? [fixtureId] : [],
          }))
        : await repo.loadMatchEventArchives!(this.saveId, this.persistentState);
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
        if (archive.archiveVersion === LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION) {
          const pack = this.findRosterPackBySha(archive.rosterPackSha256);
          if (!pack) {
            return {
              status: "DAMAGED",
              message: "Historical roster snapshot for this evolved season fixture is missing.",
            };
          }
          const replay = replayCompletedLifecycleMatchEventArchive(archive, pack, completion);
          return { status: "READY", archive, replay };
        }
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

    if (this.state.seasonStateVersion !== "LC_T20_SEASON_STATE_V1") {
      return { status: "UNAVAILABLE" };
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
  ): Promise<ActivePersistentSeasonState> {
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

  private projectLifecycleSquadView(
    careerState: RosterCareerDayState,
    teamId: string,
  ): LifecycleSquadTrainingConditionView {
    const activeWorld = this.getWorld();
    const team = activeWorld.teams.find((candidate) => candidate.teamId === teamId);
    if (!team) throw new Error(`Unknown team: ${teamId}`);
    const conditionById = new Map(careerState.playerConditions.map((entry) => [entry.playerId, entry]));
    const readinessById = new Map(careerState.playerReadiness.map((entry) => [entry.playerId, entry]));
    const directiveById = new Map(
      careerState.trainingAssignments.map((entry) => [entry.playerId, entry.directive]),
    );
    return LifecycleSquadTrainingConditionViewSchema.parse({
      teamId,
      date: careerState.currentDate,
      players: team.squadIds.map((playerId) => {
        const condition = conditionById.get(playerId);
        const readiness = readinessById.get(playerId);
        const directive = directiveById.get(playerId);
        if (!condition || !readiness || !directive) {
          throw new Error(`Missing lifecycle condition entry for ${playerId}`);
        }
        const unavailable = DEFAULT_CAREER_AVAILABILITY_PACK.entries.find(
          (entry) =>
            entry.playerId === playerId &&
            entry.startDate <= careerState.currentDate &&
            careerState.currentDate <= entry.endDate,
        );
        return {
          playerId,
          fatigueBp: condition.fatigueBp,
          availability: unavailable ? "UNAVAILABLE" : "AVAILABLE",
          availabilityReason: unavailable?.reason ?? null,
          unavailableThrough: unavailable?.endDate ?? null,
          directive,
          battingReadiness: readiness.batting,
          bowlingReadiness: readiness.bowling,
          fieldingReadiness: readiness.fielding,
        };
      }),
    });
  }

  squadView(
    state = this.state,
  ): SquadTrainingConditionView | LifecycleSquadTrainingConditionView | null {
    if (!state?.controlledTeamId) return null;
    if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
      return this.projectLifecycleSquadView(state.careerState, state.controlledTeamId);
    }
    return projectSquadTrainingCondition(
      state.careerState,
      state.controlledTeamId,
      DEFAULT_CAREER_AVAILABILITY_PACK,
    );
  }

  playerCondition(playerId: string) {
    if (!this.state) return null;
    const activeWorld = this.getWorld();
    const team = activeWorld.teams.find((candidate) => candidate.squadIds.includes(playerId));
    if (!team) return null;
    if (this.state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
      return (
        this.projectLifecycleSquadView(this.state.careerState, team.teamId).players.find(
          (player) => player.playerId === playerId,
        ) ?? null
      );
    }
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
    return this.findPlayerIncludingRetired(playerId)?.player.name ?? playerId;
  }

  groundName(groundId: string): string {
    return (
      this.getWorld().grounds.find((ground) => ground.groundId === groundId)?.name ?? groundId
    );
  }

  fixtureBriefing(fixtureId?: string): PreMatchBriefing | null {
    const state = this.state;
    if (!state) return null;
    const fixture = fixtureId
      ? state.schedule.fixtures.find((candidate) => candidate.fixtureId === fixtureId) ?? null
      : this.nextManagedFixture(state);
    if (!fixture) return null;
    const activeWorld = this.getWorld();
    const ground =
      activeWorld.grounds.find((candidate) => candidate.groundId === fixture.groundId) ??
      activeWorld.grounds[0]!;

    const fallbackSelection = (teamId: string): T20TeamSelection => {
      const team = activeWorld.teams.find((candidate) => candidate.teamId === teamId)!;
      const players = team.squadIds
        .map((id) => activeWorld.players.find((candidate) => candidate.playerId === id))
        .filter((candidate): candidate is Player => Boolean(candidate));
      const keeper = players.find((p) => p.role === "KEEPER") ?? players[0]!;
      const bowlers = players
        .filter((p) => p.playerId !== keeper.playerId && isBowlingCapable(p))
        .slice(0, 5);
      const xi = [
        keeper,
        ...bowlers,
        ...players.filter((p) => p.playerId !== keeper.playerId && !bowlers.includes(p)),
      ].slice(0, 11);
      return {
        teamId,
        playerIds: xi.map((p) => p.playerId),
        captainId: xi[0]!.playerId,
        keeperId: keeper.playerId,
      };
    };

    let selections: [T20TeamSelection, T20TeamSelection];
    try {
      if (state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION) {
        const pack = this.requireActiveRosterPack();
        const picked = selectRosterFixtureTeams(
          pack,
          state.schedule,
          state.careerState,
          fixture.fixtureId,
        );
        selections = [picked[0], picked[1]];
      } else {
        const picked = selectOffscreenFixtureTeams({
          schedule: state.schedule,
          careerState: state.careerState,
          fixtureId: fixture.fixtureId,
          worldBytes,
          worldManifest,
        });
        selections = [picked[0], picked[1]];
      }
    } catch {
      selections = [
        fallbackSelection(fixture.homeTeamId),
        fallbackSelection(fixture.awayTeamId),
      ];
    }

    const conditionsByPlayerId: Record<string, { fatigueBp: number; readinessDelta: number }> = {};
    const buildSide = (teamId: string) => {
      const team = activeWorld.teams.find((candidate) => candidate.teamId === teamId)!;
      const condView =
        state.seasonStateVersion === LIFECYCLE_SEASON_STATE_VERSION
          ? this.projectLifecycleSquadView(state.careerState, teamId)
          : projectSquadTrainingCondition(
              state.careerState,
              teamId,
              DEFAULT_CAREER_AVAILABILITY_PACK,
            );
      for (const cond of condView.players) {
        conditionsByPlayerId[cond.playerId] = {
          fatigueBp: cond.fatigueBp,
          readinessDelta: cond.battingReadiness,
        };
      }
      const players = team.squadIds
        .map((id) => activeWorld.players.find((candidate) => candidate.playerId === id))
        .filter((candidate): candidate is Player => Boolean(candidate))
        .map((player) => ({
          playerId: player.playerId,
          name: player.name,
          role: player.role,
          batHand: player.batHand,
          bowlingStyle: player.bowlingStyle,
        }));
      return {
        teamId,
        teamName: team.name,
        players,
      };
    };

    return projectPreMatchBriefing({
      format: "T20",
      ground: {
        groundId: ground.groundId,
        name: ground.name,
        pitchPrior: {
          seamBp: ground.pitchPrior.seamBp,
          turnBp: ground.pitchPrior.turnBp,
        },
      },
      teams: [buildSide(fixture.homeTeamId), buildSide(fixture.awayTeamId)],
      selections,
      conditionsByPlayerId,
    });
  }

  resultText(completion: T20SeasonMatchCompletion): string {
    const result = completion.scorecard.result;
    if (result.kind === "TIE") return "Tied";
    if (result.kind === "NO_RESULT") return "No result";
    return `${this.teamName(result.winnerTeamId)} won by ${result.marginRuns ?? result.marginWickets} ${result.marginType?.toLowerCase() ?? ""}`.trim();
  }

  private currentArchiveCacheKey(): string | null {
    if (!this.saveId || !this.state) return null;
    const rev = this.persistentState ? this.persistentState.revision : this.state.revision;
    const ver = this.persistentState
      ? this.persistentState.worldStateVersion
      : this.state.seasonStateVersion;
    return `${this.saveId}:${ver}:${rev}`;
  }

  private allCompletions(): T20SeasonMatchCompletion[] {
    if (this.persistentState) {
      return [
        ...this.persistentState.completedSeasons.flatMap((season) => season.completedMatches),
        ...this.persistentState.currentSeason.completedMatches,
      ];
    }
    return this.state ? [...this.state.completedMatches] : [];
  }

  /**
   * Per-match digests for statistics and awards (docs/design/MATCH_ARCHIVE_STORAGE_V2.md). Stored digests
   * are read; any fixture without one has just its own archive loaded, derived and stored back, so a
   * career is never fully loaded into memory after its first open. Repositories without digest support
   * fall back to deriving from all archives.
   */
  async loadCareerMatchDigests(): Promise<ReadonlyMap<string, CareerMatchDigest>> {
    // One backfill at a time: concurrent callers (career screen, awards sync, post-save refresh) each
    // re-derived every missing digest at once, which made a two-season export take about 9 s longer.
    const previous = this.digestsInFlight;
    const run = (async () => {
      if (previous) await previous.catch(() => undefined);
      return this.loadCareerMatchDigestsOnce();
    })();
    this.digestsInFlight = run;
    try {
      return await run;
    } finally {
      if (this.digestsInFlight === run) this.digestsInFlight = null;
    }
  }

  private async loadCareerMatchDigestsOnce(): Promise<ReadonlyMap<string, CareerMatchDigest>> {
    const cacheKey = this.currentArchiveCacheKey();
    if (!cacheKey || !this.saveId || !this.state) {
      this.cachedDigestsKey = null;
      this.cachedDigests = new Map();
      return this.cachedDigests;
    }
    if (this.cachedDigestsKey === cacheKey) return this.cachedDigests;
    const saveId = this.saveId;
    const completions = this.allCompletions();
    try {
      const repo = this.persistentState ? this.persistentRepository : undefined;
      let digests: Map<string, CareerMatchDigest>;
      if (repo?.loadMatchDigests && repo.loadMatchEventArchive) {
        digests = await repo.loadMatchDigests(saveId);
        const derived: CareerMatchDigest[] = [];
        const missing = completions.filter((completion) => !digests.has(completion.fixtureId));
        // Many missing (first open of an older save): one transaction for all archives. A few (new
        // matches since the last open): read just those fixtures.
        const bulk =
          missing.length > 8 && repo.loadMatchEventArchives
            ? new Map(
                (await repo.loadMatchEventArchives(saveId, this.persistentState ?? undefined)).archives.map(
                  (archive) => [archive.fixtureId, archive] as const,
                ),
              )
            : null;
        for (const completion of missing) {
          const archive = bulk
            ? bulk.get(completion.fixtureId) ?? null
            : (await repo.loadMatchEventArchive(saveId, completion.fixtureId, this.persistentState ?? undefined)).archive;
          if (!archive) continue;
          const digest = deriveCareerMatchDigest(archive, completion);
          digests.set(completion.fixtureId, digest);
          derived.push(digest);
        }
        if (derived.length > 0 && !this.readOnly && repo.saveMatchDigests) {
          try {
            await repo.saveMatchDigests(saveId, derived);
          } catch {
            /* derived again on the next open */
          }
        }
      } else {
        const archives = new Map((await this.loadCareerEventArchives()).map((a) => [a.fixtureId, a]));
        digests = new Map();
        for (const completion of completions) {
          const archive = archives.get(completion.fixtureId);
          if (archive) digests.set(completion.fixtureId, deriveCareerMatchDigest(archive, completion));
        }
      }
      if (this.currentArchiveCacheKey() === cacheKey) {
        this.cachedDigestsKey = cacheKey;
        this.cachedDigests = digests;
      }
      return digests;
    } catch {
      return this.cachedDigestsKey === cacheKey ? this.cachedDigests : new Map();
    }
  }

  async loadCareerEventArchives(): Promise<readonly AnyCareerMatchEventArchive[]> {
    const cacheKey = this.currentArchiveCacheKey();
    if (!cacheKey || !this.saveId || !this.state) {
      this.cachedArchivesKey = null;
      this.cachedArchives = [];
      return [];
    }
    if (this.cachedArchivesKey === cacheKey) {
      return this.cachedArchives;
    }
    try {
      let archives: readonly AnyCareerMatchEventArchive[] = [];
      if (this.persistentState && this.persistentRepository?.loadMatchEventArchives) {
        const loaded = await this.persistentRepository.loadMatchEventArchives(
          this.saveId,
          this.persistentState,
        );
        archives = loaded.archives;
      } else if (
        this.state.seasonStateVersion === "LC_T20_SEASON_STATE_V1" &&
        this.repository.loadMatchEventArchives
      ) {
        const loaded = await this.repository.loadMatchEventArchives(this.saveId, this.state);
        archives = loaded.archives;
      }
      this.cachedArchivesKey = cacheKey;
      this.cachedArchives = archives;
      return archives;
    } catch {
      return this.cachedArchivesKey === cacheKey ? this.cachedArchives : [];
    }
  }

  private buildCurrentHistoricalSource(
    archivesOverride?: readonly AnyCareerMatchEventArchive[],
  ) {
    if (!this.state) return null;
    const cacheKey = this.currentArchiveCacheKey();
    const archives = archivesOverride ?? [];
    const digests =
      !archivesOverride && cacheKey && this.cachedDigestsKey === cacheKey ? this.cachedDigests : undefined;
    const world = this.getWorld();
    const teamAffiliationByPlayerId: Record<string, string> = {};
    for (const team of world.teams) {
      for (const pid of team.squadIds) {
        teamAffiliationByPlayerId[pid] = team.teamId;
      }
    }
    if (this.persistentState) {
      return buildHistoricalStatsSourceFromPersistentWorld({
        world: this.persistentState,
        archives,
        ...(digests ? { digests } : {}),
        homeGroundIds: T20_LEAGUE_COMPETITION.homeGroundIds,
        ...(("lifecycle" in this.persistentState) ? {} : { teamAffiliationByPlayerId }),
      });
    }
    if (this.state.seasonStateVersion !== "LC_T20_SEASON_STATE_V1") {
      return null;
    }
    return buildHistoricalStatsSourceFromSingleSeason({
      season: this.state,
      worldId: this.saveId ?? this.state.seasonId,
      archives,
      ...(digests ? { digests } : {}),
      homeGroundIds: T20_LEAGUE_COMPETITION.homeGroundIds,
      teamAffiliationByPlayerId,
    });
  }

  historicalStatistics(
    query: Partial<HistoricalFilterQuery> = {},
    archivesOverride?: readonly AnyCareerMatchEventArchive[],
  ): HistoricalStatisticsProjection | null {
    const source = this.buildCurrentHistoricalSource(archivesOverride);
    if (!source) return null;
    return projectHistoricalStatistics(source, query);
  }

  historicalPlayerRecord(
    playerId: string,
    query: Partial<HistoricalFilterQuery> = {},
    archivesOverride?: readonly AnyCareerMatchEventArchive[],
  ): HistoricalPlayerRecord | null {
    const projection = this.historicalStatistics(query, archivesOverride);
    if (!projection) return null;
    return projection.players.find((player) => player.playerId === playerId) ?? null;
  }

  private awardsWorldOrCareerId(): string | null {
    if (this.persistentState) {
      return this.persistentState.worldIdentity.worldId;
    }
    return this.state?.careerId ?? null;
  }

  private awardsNameMaps(): {
    playerNames: Record<string, string>;
    teamNames: Record<string, string>;
  } {
    const activeWorld = this.getWorld();
    const playerNames: Record<string, string> = {};
    for (const player of world.players) playerNames[player.playerId] = player.name;
    for (const r of this.getLifecycleState()?.retiredPlayers ?? []) {
      playerNames[r.playerId] = r.player.name;
    }
    for (const fa of this.getEconomyState()?.freeAgents ?? []) {
      playerNames[fa.playerId] = fa.player.name;
    }
    for (const yp of this.getLifecycleState()?.youthAcademy ?? []) {
      playerNames[yp.prospectId] = yp.player.name;
    }
    for (const player of activeWorld.players) playerNames[player.playerId] = player.name;
    const teamNames: Record<string, string> = {};
    for (const team of world.teams) teamNames[team.teamId] = team.name;
    for (const team of activeWorld.teams) teamNames[team.teamId] = team.name;
    return { playerNames, teamNames };
  }

  /**
   * Reconciles the persistent CAREER_AWARDS_LEDGER_V1 against every completed
   * fixture across all seasons of the loaded career, idempotently, and persists
   * it when the ledger changed and this tab holds the writer lease.
   */
  async syncAwardsLedger(): Promise<CareerAwardsLedger | null> {
    if (!this.state || !this.saveId) return null;
    const worldOrCareerId = this.awardsWorldOrCareerId();
    if (!worldOrCareerId) return null;
    const ledgerKey = `${this.saveId}:${worldOrCareerId}:${this.currentArchiveCacheKey() ?? "none"}`;
    if (this.awardsLedger && this.awardsLedgerKey === ledgerKey) {
      return this.awardsLedger;
    }
    const repository = this.persistentState ? this.persistentRepository : this.repository;
    if (!repository?.loadAwardsLedger || !repository.saveAwardsLedger) {
      return null;
    }
    try {
      const existing = await repository.loadAwardsLedger(this.saveId);
      if (existing && existing.worldOrCareerId !== worldOrCareerId) {
        return null;
      }
      const digests = await this.loadCareerMatchDigests();
      const { playerNames, teamNames } = this.awardsNameMaps();
      const singleSeason = this.persistentState
        ? null
        : {
            seasonNumber: 1,
            calendarYear: (() => {
              const schedule = this.state!.schedule as unknown as {
                startDate?: string;
                request?: { startDate?: string };
              };
              const startDate = schedule.startDate ?? schedule.request?.startDate;
              return (
                (startDate ? Number.parseInt(startDate.slice(0, 4), 10) : NaN) ||
                INITIAL_PERSISTENT_CALENDAR_YEAR
              );
            })(),
            phase: this.state.phase,
            finalSeasonStateSha256:
              this.state.phase === "COMPLETE" ? this.state.stateSha256 : null,
            completedMatches: this.state.completedMatches,
          };
      const { ledger, changed } = reconcileCareerAwardsLedger({
        worldOrCareerId,
        existingLedger: existing,
        persistentWorld: this.persistentState,
        singleSeason,
        digests,
        knownPlayers: [
          ...careerWorld.players,
          ...(this.getEconomyState()?.freeAgents.map((fa) => fa.player) ?? []),
        ],
        playerNames,
        teamNames,
      });
      this.awardsLedger = ledger;
      this.awardsLedgerKey = ledgerKey;
      if (changed && !this.readOnly) {
        this.awardsLedger = await repository.saveAwardsLedger(this.saveId, ledger);
      }
      return this.awardsLedger;
    } catch {
      return this.awardsLedgerKey === ledgerKey ? this.awardsLedger : null;
    }
  }

  getAwardsLedger(): CareerAwardsLedger | null {
    return this.awardsLedger;
  }

  getSeasonAwards(seasonNumber: number): SeasonAwardsSummary | null {
    return (
      this.awardsLedger?.seasonAwards.find((season) => season.seasonNumber === seasonNumber) ??
      null
    );
  }

  getMatchAwardForFixture(seasonNumber: number, fixtureId: string): MatchAwardRecord | null {
    const entry = this.awardsLedger?.matchAwards.find(
      (item) => item.seasonNumber === seasonNumber && item.fixtureId === fixtureId,
    );
    return entry?.award ?? null;
  }

  getPlayerAwardsSummary(playerId: string): {
    playerOfTheMatchCount: number;
    playerOfTheMatchSeasons: number[];
    seasonAwards: SeasonAwardsSummary[];
  } | null {
    if (!this.awardsLedger || !this.state) return null;
    const potmEntries = this.awardsLedger.matchAwards.filter(
      (entry) => entry.award.status === "AWARDED" && entry.award.winnerPlayerId === playerId,
    );
    const seasonAwards = this.awardsLedger.seasonAwards.filter((season) =>
      season.awards.some(
        (award) => award.status === "AWARDED" && award.winnerPlayerId === playerId,
      ),
    );
    return {
      playerOfTheMatchCount: potmEntries.length,
      playerOfTheMatchSeasons: [...new Set(potmEntries.map((entry) => entry.seasonNumber))].sort(
        (a, b) => a - b,
      ),
      seasonAwards,
    };
  }

  sourceHashForUserMatch(parts: unknown): string {
    return hasher.hash(parts);
  }
}
