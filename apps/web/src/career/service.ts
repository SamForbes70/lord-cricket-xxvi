import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import {
  canonicalJson,
  T20SeasonMatchCompletionSchema,
  type CompletedCareerMatchEventArchive,
  type MatchConditionDelta,
  type SeasonArchive,
  type SeasonCheckpointInspection,
  type SeasonFixture,
  type SeasonSaveSummary,
  type T20Scorecard,
  type T20SeasonMatchCompletion,
  type T20SeasonState,
  type T20TeamSelection,
  type TrainingDirective,
  type NewGameWorldCopy,
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
  applyMatchConditionDeltaV2,
  createCareerDayStateV2,
  createCompletedCareerMatchEventArchive,
  createStateHasher,
  generateSeasonSchedule,
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
} from "@lcxxvi/projections";
import {
  IndexedDbSeasonRepository,
  type SeasonDurableCommit,
  type SeasonLoadResult,
  type SeasonPersistenceErrorDescription,
  createSeasonPortableArchive,
  createT20SeasonArchive,
  describeSeasonPersistenceError,
  readSeasonPortableArchive,
  sealT20SeasonState,
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
  | { launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V3_ROSTER"; rosterPack: import("@lcxxvi/contracts").StagedRosterPack }
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

function deterministicCompletedAt(state: T20SeasonState): string {
  return `${state.schedule.rounds.at(-1)!.matchDayDate}${FINAL_COMPLETED_AT_SUFFIX}`;
}

function stateCore(state: T20SeasonState) {
  const { stateSha256: _hash, ...core } = state;
  void _hash;
  return core;
}

export type CareerReplayOutcome =
  | { status: "READY"; archive: CompletedCareerMatchEventArchive; replay: CareerArchivedReplaySummary }
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
  loadMatchEventArchives?(saveId: string, state?: T20SeasonState): Promise<{
    archives: CompletedCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }>;
  inspectCheckpoints?(saveId: string): Promise<SeasonCheckpointInspection>;
  loadGeneration?(saveId: string, generation: number): Promise<SeasonLoadResult>;
};

export class CareerApplicationService {
  private readonly repository: CareerSeasonRepository;
  private readonly listeners = new Set<() => void>();
  private state: T20SeasonState | null = null;
  private worldCopy: NewGameWorldCopy | null = null;
  private saveId: string | null = null;
  private ownerId: string;
  private readOnly = false;
  private recovered = false;
  private status: SaveStatus = "Idle";
  private error = "";

  constructor(
    ownerId?: string,
    repository: CareerSeasonRepository = new IndexedDbSeasonRepository(),
    /** Called when a damaged career is continued in a new recovered slot, so its pending match links can follow it. */
    private readonly onRecovered?: (fromSaveId: string, toSaveId: string) => Promise<void>,
  ) {
    this.ownerId = ownerId ?? token("career-tab");
    this.repository = repository;
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

  async listCareers(): Promise<SeasonSaveSummary[]> {
    return this.repository.list();
  }

  /** Best-effort release of the writer lease when the page goes away. The lease still expires on its own. */
  async releaseWriter(): Promise<void> {
    if (this.saveId && !this.readOnly) {
      await this.repository.releaseLease(this.saveId, this.ownerId);
      this.readOnly = true;
    }
  }

  async leaveCareer(): Promise<void> {
    if (this.saveId) {
      if (!this.readOnly) await this.repository.releaseLease(this.saveId, this.ownerId);
      await this.repository.clearActiveSaveId(this.saveId);
    }
    this.state = null;
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
      const active = await this.repository.activeSaveId();
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
    const saveId = await this.repository.activeSaveId();
    if (!saveId) {
      this.state = null;
      this.worldCopy = null;
      this.saveId = null;
      this.readOnly = true;
      this.setStatus("Idle");
      return;
    }
    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    this.state = loaded.state;
    this.worldCopy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
    this.saveId = saveId;
    this.readOnly = true;
    this.recovered = loaded.recovered;
    this.setStatus("Read-only");
  }

  async createCareer(teamId: string, copyRaw: NewGameWorldCopy | null = null): Promise<T20SeasonState> {
    if (!T20_LEAGUE_COMPETITION.teamIds.includes(teamId)) throw new Error("Unknown managed team.");
    const copy = copyRaw ? immutableWorldCopy(copyRaw) : null;
    if (this.saveId && !this.readOnly) await this.repository.releaseLease(this.saveId, this.ownerId);
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const gameId = `career-game-${key}`;
    const seasonId = `season-${key}`;
    const careerId = `career-${key}`;
    const schedule = generateSeasonSchedule({
      scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1",
      seasonId,
      gameId,
      competitionId: "LC_T20_LEAGUE_01",
      worldPackId: FROZEN_WORLD_PINS.worldPackId,
      worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
      seasonSeed: `seed-${key}`,
      startDate: START_DATE,
      teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
      groundIds: [...T20_LEAGUE_COMPETITION.groundIds],
      homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
    });
    const careerState = createCareerDayStateV2({ careerId, schedule });
    const projection = createT20SeasonProjection({ competition: T20_LEAGUE_COMPETITION, schedule });
    const state = await sealT20SeasonState({
      seasonStateVersion: "LC_T20_SEASON_STATE_V1",
      seasonId,
      gameId,
      careerId,
      controlledTeamId: teamId,
      schedule,
      careerState,
      projection,
      completedMatches: [],
      revision: 0,
      phase: "ACTIVE",
    });
    const saveId = `season:${seasonId}`;
    if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) throw new Error("New career save is locked.");
    this.setStatus("Saving");
    const teamName = (copy?.world ?? world).teams.find(team => team.teamId === teamId)!.name;
    await this.repository.commit({
      saveId,
      kind: "AUTO",
      title: `${teamName} 2027`,
      expectedRevision: null,
      state,
      command: null,
      ownerId: this.ownerId,
      now: Date.now(),
      updatedAt: nowIso(),
      setActive: true,
      worldCopy: copy,
    });
    this.state = state;
    this.worldCopy = copy;
    this.saveId = saveId;
    this.readOnly = false;
    this.recovered = false;
    this.setStatus("Saved");
    return state;
  }

  async loadCareer(saveId: string): Promise<T20SeasonState> {
    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    const copy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
    if (this.saveId && this.saveId !== saveId && !this.readOnly) await this.repository.releaseLease(this.saveId, this.ownerId);
    let targetSaveId = saveId;
    let readOnly = !(await this.repository.acquireLease(saveId, this.ownerId, Date.now()));
    if (loaded.recovered && !readOnly) {
      targetSaveId = `recovered-${crypto.randomUUID().replaceAll("-", "")}`;
      if (!(await this.repository.acquireLease(targetSaveId, this.ownerId, Date.now()))) throw new Error("Recovered career slot is locked.");
      const existingArchives = this.repository.loadMatchEventArchives
        ? (await this.repository.loadMatchEventArchives(saveId, loaded.state)).archives
        : [];
      await this.repository.commit({
        saveId: targetSaveId,
        kind: "MANUAL",
        title: `${loaded.summary.title} (Recovered)`,
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
    this.state = loaded.state;
    this.worldCopy = copy;
    this.saveId = targetSaveId;
    this.readOnly = readOnly;
    this.recovered = loaded.recovered;
    this.setStatus(readOnly ? "Read-only" : loaded.recovered ? "Recovered" : "Saved");
    return loaded.state;
  }

  private requireWritable(): { state: T20SeasonState; saveId: string } {
    if (!this.state || !this.saveId) throw new Error("Create or load a career first.");
    if (this.readOnly) throw new Error("This career is read-only because another tab owns the writer lease.");
    return { state: this.state, saveId: this.saveId };
  }

  private async commitMutation(
    command: string,
    payload: unknown,
    build: (state: T20SeasonState) =>
      | Promise<{ core: Omit<T20SeasonState, "stateSha256" | "revision">; matchEventArchives?: readonly CompletedCareerMatchEventArchive[] } | Omit<T20SeasonState, "stateSha256" | "revision">>
      | ({ core: Omit<T20SeasonState, "stateSha256" | "revision">; matchEventArchives?: readonly CompletedCareerMatchEventArchive[] } | Omit<T20SeasonState, "stateSha256" | "revision">),
  ): Promise<T20SeasonState> {
    const { state: before, saveId } = this.requireWritable();
    const expectedRevision = before.revision;
    const commandId = token("career-cmd");
    this.setStatus("Saving");
    try {
      if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) {
        this.readOnly = true;
        throw new Error("Writer lease was lost to another tab.");
      }
      const builtRaw = await build(before);
      const builtCore = "core" in builtRaw && "seasonStateVersion" in builtRaw.core ? builtRaw.core : (builtRaw as Omit<T20SeasonState, "stateSha256" | "revision">);
      const matchEventArchives = "core" in builtRaw && "matchEventArchives" in builtRaw ? builtRaw.matchEventArchives : undefined;
      const next = await sealT20SeasonState({ ...builtCore, revision: expectedRevision + 1 });
      const requestCanonical = canonicalJson({ command, expectedRevision, payload });
      await this.repository.commit({
        saveId,
        kind: "AUTO",
        title: `${this.teamName(next.controlledTeamId)} 2027`,
        expectedRevision,
        state: next,
        command: {
          commandId,
          requestCanonical,
          responseJson: canonicalJson({ revision: next.revision, stateSha256: next.stateSha256 }),
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
      this.recovered = false;
      this.setStatus("Saved");
      return next;
    } catch (error) {
      this.setStatus(this.readOnly ? "Read-only" : "Error", error instanceof Error ? error.message : "Career save failed.");
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
      if (nextFixture && state.careerState.currentDate >= nextFixture.matchDayDate) throw new Error("Resolve the managed fixture before advancing the career date.");
      const careerState = advanceCareerDayV2(state.careerState).state;
      if (nextFixture && careerState.currentDate > nextFixture.matchDayDate) throw new Error("Career date cannot pass the next managed fixture.");
      return { ...stateCore(state), careerState };
    });
  }

  private applyOffscreenCompletion(
    state: T20SeasonState,
    fixtureId: string,
  ): { core: Omit<T20SeasonState, "stateSha256" | "revision">; archive: CompletedCareerMatchEventArchive } {
    const simulated = simulateOffscreenFixture({
      schedule: state.schedule,
      careerState: state.careerState,
      fixtureId,
      worldBytes,
      worldManifest,
    });
    const completion = completionFromOffscreenOutcome(state.schedule, simulated.outcome);
    const archive = createCompletedCareerMatchEventArchive({ completion, session: simulated.session });
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
      .filter((fixture) => fixture.roundNumber === target.roundNumber && fixture.fixtureId !== target.fixtureId)
      .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
    const requiresDateAdvance = initial.careerState.currentDate < target.matchDayDate;
    const pendingOthers = roundOthers.filter((fixture) => !completedIds.has(fixture.fixtureId));
    if (!requiresDateAdvance && pendingOthers.length === 0) return target;

    await this.commitMutation("SIMULATE_TO_NEXT_USER_FIXTURE", { fixtureId: target.fixtureId }, async (state) => {
      let working: T20SeasonState = state;
      let careerState = working.careerState;
      while (careerState.currentDate < target.matchDayDate) careerState = advanceCareerDayV2(careerState).state;
      if (careerState.currentDate !== target.matchDayDate) throw new Error("Career date does not match managed fixture date.");
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
    });
    return this.nextManagedFixture(this.state!);
  }

  async simulateManagedFixture(): Promise<void> {
    await this.simulateToNextUserFixture();
    const current = this.requireWritable().state;
    const fixture = this.nextManagedFixture(current);
    if (!fixture) return;
    if (current.careerState.currentDate !== fixture.matchDayDate) throw new Error("Managed fixture is not ready.");
    await this.commitMutation("SIMULATE_MANAGED_FIXTURE", { fixtureId: fixture.fixtureId }, (state) => {
      const applied = this.applyOffscreenCompletion(state, fixture.fixtureId);
      return { core: applied.core, matchEventArchives: [applied.archive] };
    });
  }

  async prepareUserMatch(): Promise<CareerUserMatchLaunch> {
    await this.simulateToNextUserFixture();
    const { state, saveId } = this.requireWritable();
    const fixture = this.nextManagedFixture(state);
    if (!fixture) throw new Error("Season is complete.");
    if (state.careerState.currentDate !== fixture.matchDayDate) throw new Error("Managed fixture is not ready.");
    const selections = selectOffscreenFixtureTeams({
      schedule: state.schedule,
      careerState: state.careerState,
      fixtureId: fixture.fixtureId,
      worldBytes,
      worldManifest,
    });
    return {
      ...(this.worldCopy
        ? { launchVersion: "LC_CAREER_USER_MATCH_LAUNCH_V2" as const, worldCopy: structuredClone(this.worldCopy) }
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

  async completeUserMatch(result: CareerUserMatchResult, session: import("@lcxxvi/simulation").T20Session | null = null): Promise<void> {
    const current = this.requireWritable().state;
    const existing = current.completedMatches.find((match) => match.fixtureId === result.fixtureId);
    if (existing) {
      if (existing.sourceCompletionSha256 !== result.sourceCompletionSha256) throw new Error("Conflicting managed fixture completion.");
      return;
    }
    const fixture = this.nextManagedFixture(current);
    if (!fixture || fixture.fixtureId !== result.fixtureId) throw new Error("Managed match result does not match the next required fixture.");
    const expectedScorecardSha256 = hasher.hash(result.scorecard);
    if (expectedScorecardSha256 !== result.scorecardSha256) throw new Error("Managed match scorecard hash mismatch.");
    const expectedSourceCompletionSha256 = hasher.hash({
      source: "USER_MATCH",
      seasonId: result.seasonId,
      fixtureId: result.fixtureId,
      matchId: result.matchId,
      scorecardSha256: result.scorecardSha256,
      finalEventHash: result.finalEventHash,
    });
    if (expectedSourceCompletionSha256 !== result.sourceCompletionSha256) throw new Error("Managed match completion hash mismatch.");
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
    ) throw new Error("Managed match result failed fixture binding.");
    await this.commitMutation("COMPLETE_USER_FIXTURE", { fixtureId: fixture.fixtureId, sourceCompletionSha256: result.sourceCompletionSha256 }, (state) => {
      const careerState = applyMatchConditionDeltaV2(state.careerState, result.conditionDelta, state.schedule);
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
          resolvedSession = rehydrateT20Session(result.completedSession, worldBytes, worldManifest);
        } catch {
          /* legacy or synthetic test payload without full rehydratable T20Session */
        }
      }
      const maybeArchive = resolvedSession ? [createCompletedCareerMatchEventArchive({ completion, session: resolvedSession })] : [];
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
    });
  }

  async createManualCopy(title: string): Promise<void> {
    const name = title.trim();
    if (!name || name.length > 120) throw new Error("Enter a copy name of 1 to 120 characters.");
    const { state, saveId } = this.requireWritable();
    const copyId = `career-copy-${crypto.randomUUID()}`;
    const now = Date.now();
    if (!await this.repository.acquireLease(saveId, this.ownerId, now)) throw new Error("This career is open in another tab.");
    if (!await this.repository.acquireLease(copyId, this.ownerId, now)) throw new Error("The copy slot is locked.");
    try {
      await this.repository.commit({ saveId: copyId, kind: "MANUAL", title: name, expectedRevision: null, state, command: null,
        ownerId: this.ownerId, now, updatedAt: nowIso(), setActive: false, worldCopy: this.worldCopy,
        copySource: { saveId, revision: state.revision, stateSha256: state.stateSha256, now: () => Date.now() } });
    } finally { await this.repository.releaseLease(copyId, this.ownerId); }
    this.setStatus("Saved");
  }

  async exportCareer(): Promise<Uint8Array> {
    if (!this.state || !this.saveId) throw new Error("No career is loaded.");
    const state = this.state;
    const saveId = this.saveId;
    const loaded = await this.repository.load(saveId);
    if (!loaded) throw new Error("Career save not found.");
    const archive = state.phase === "COMPLETE" ? await createT20SeasonArchive(state, deterministicCompletedAt(state)) : null;
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
    const imported = await readSeasonPortableArchive(bytes);
    const copy = imported.worldCopy ? immutableWorldCopy(imported.worldCopy) : null;
    if (this.saveId && !this.readOnly) await this.repository.releaseLease(this.saveId, this.ownerId);
    const saveId = `import-${crypto.randomUUID().replaceAll("-", "")}`;
    if (!(await this.repository.acquireLease(saveId, this.ownerId, Date.now()))) throw new Error("Imported career slot is locked.");
    this.setStatus("Saving");
    await this.repository.commit({
      saveId,
      kind: "IMPORTED",
      title: `${imported.summary.title} (Imported)`,
      expectedRevision: null,
      state: imported.state,
      command: null,
      ownerId: this.ownerId,
      now: Date.now(),
      updatedAt: nowIso(),
      setActive: true,
      worldCopy: copy,
      ...(imported.matchEventArchives.length > 0 ? { matchEventArchives: imported.matchEventArchives } : {}),
    });
    this.state = imported.state;
    this.worldCopy = copy;
    this.saveId = saveId;
    this.readOnly = false;
    this.recovered = false;
    this.setStatus("Saved");
    return imported.state;
  }

  async replayFixtureArchive(fixtureId: string): Promise<CareerReplayOutcome> {
    if (!this.state || !this.saveId) throw new Error("No career is loaded.");
    if (!this.repository.loadMatchEventArchives) return { status: "UNAVAILABLE" };
    const completion = this.state.completedMatches.find((m) => m.fixtureId === fixtureId);
    if (!completion) return { status: "UNAVAILABLE" };
    const loaded = await this.repository.loadMatchEventArchives(this.saveId, this.state);
    if (loaded.damagedFixtureIds.includes(fixtureId)) {
      return {
        status: "DAMAGED",
        message: "The archived ball-by-ball replay log for this fixture is damaged. The season standings and scorecard remain valid.",
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
        message: error instanceof Error ? error.message : "Archived match replay failed verification.",
      };
    }
  }

  async inspectCareerCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    if (!this.repository.inspectCheckpoints) throw new Error("Checkpoint inspection is unavailable.");
    return this.repository.inspectCheckpoints(saveId);
  }

  async recoverCareerFromGeneration(saveId: string, generation: number, title?: string): Promise<T20SeasonState> {
    if (!this.repository.loadGeneration) throw new Error("Checkpoint generation recovery is unavailable.");
    const loaded = await this.repository.loadGeneration(saveId, generation);
    const copy = loaded.worldCopy ? immutableWorldCopy(loaded.worldCopy) : null;
    if (this.saveId && this.saveId !== saveId && !this.readOnly) await this.repository.releaseLease(this.saveId, this.ownerId);
    const targetSaveId = `recovered-${crypto.randomUUID().replaceAll("-", "")}`;
    if (!(await this.repository.acquireLease(targetSaveId, this.ownerId, Date.now()))) throw new Error("Recovered career slot is locked.");
    const cleanLabel = (title ?? `${loaded.summary.title} (Recovered G${generation})`).trim().slice(0, 120);
    const existingArchives = this.repository.loadMatchEventArchives
      ? (await this.repository.loadMatchEventArchives(saveId)).archives.filter((a) =>
          loaded.state.completedMatches.some((c) => c.fixtureId === a.fixtureId && c.sourceCompletionSha256 === a.sourceCompletionSha256),
        )
      : [];
    this.setStatus("Saving");
    await this.repository.commit({
      saveId: targetSaveId,
      kind: "MANUAL",
      title: cleanLabel || `${loaded.summary.title} (Recovered)`,
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
    this.state = loaded.state;
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
    return createT20SeasonArchive(this.state, deterministicCompletedAt(this.state));
  }

  nextManagedFixture(state = this.state): SeasonFixture | null {
    if (!state || !state.controlledTeamId) return null;
    const complete = new Set(state.completedMatches.map((match) => match.fixtureId));
    return (
      state.schedule.fixtures
        .filter(
          (fixture) =>
            (fixture.homeTeamId === state.controlledTeamId || fixture.awayTeamId === state.controlledTeamId) &&
            !complete.has(fixture.fixtureId),
        )
        .sort((a, b) => a.ordinal - b.ordinal)[0] ?? null
    );
  }

  squadView(state = this.state) {
    if (!state?.controlledTeamId) return null;
    return projectSquadTrainingCondition(state.careerState, state.controlledTeamId, DEFAULT_CAREER_AVAILABILITY_PACK);
  }

  playerCondition(playerId: string) {
    if (!this.state) return null;
    const team = world.teams.find(candidate => candidate.squadIds.includes(playerId));
    if (!team) return null;
    return projectSquadTrainingCondition(this.state.careerState, team.teamId, DEFAULT_CAREER_AVAILABILITY_PACK)
      .players.find(player => player.playerId === playerId) ?? null;
  }

  teamName(teamId: string | null | undefined): string {
    return this.getWorld().teams.find((team) => team.teamId === teamId)?.name ?? teamId ?? "Unknown team";
  }

  playerName(playerId: string): string {
    return this.getWorld().players.find((player) => player.playerId === playerId)?.name ?? playerId;
  }

  groundName(groundId: string): string {
    return this.getWorld().grounds.find((ground) => ground.groundId === groundId)?.name ?? groundId;
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
