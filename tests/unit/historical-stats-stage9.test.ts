import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  HISTORICAL_STATS_PROJECTION_VERSION,
  HistoricalLeaderboardMetricSchema,
  PERSISTENT_WORLD_PORTABLE_V6_ARCHIVE_VERSION,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type T20SeasonMatchCompletion,
} from "@lcxxvi/contracts";
import {
  applyHistoricalMatchFact,
  buildHistoricalMatchFact,
  buildHistoricalStatsSourceFromPersistentWorld,
  createEmptyHistoricalStatsAccumulator,
  finalizeHistoricalStatisticsProjection,
  projectHistoricalStatistics,
  registerHistoricalSeasonMetadata,
} from "@lcxxvi/projections";
import {
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchiveV6,
  seasonSha256Text,
  validateAnyCareerMatchEventArchive,
  validateAnyPersistentWorldState,
  validateCompletedCareerMatchEventArchive,
  validateStoredWorldCopy,
  validateT20SeasonState,
  type AnyCareerMatchEventArchive,
  type PersistentWorldDurableCommit,
  type PersistentWorldLoadResult,
  type SeasonDurableCommit,
  type SeasonLoadResult,
} from "@lcxxvi/persistence";
import {
  CareerApplicationService,
  careerWorld,
  type CareerPersistentWorldRepository,
  type CareerSeasonRepository,
} from "../../apps/web/src/career/service.js";
import { createNewGameWorldCopy } from "../../apps/web/src/world/new-game-world.js";

class InMemorySeasonRepo implements CareerSeasonRepository {
  private activeId: string | null = null;
  private readonly leases = new Map<string, string>();
  private readonly slots = new Map<
    string,
    {
      summary: SeasonSaveSummary;
      worldCopy: NewGameWorldCopy | null;
      generations: Array<{
        serial: number;
        generation: number;
        stateJson: string;
        sha256: string;
        revision: number;
        createdAt: string;
      }>;
      archives: Map<string, AnyCareerMatchEventArchive>;
    }
  >();

  async list(): Promise<SeasonSaveSummary[]> {
    return [...this.slots.values()].map((s) => s.summary);
  }
  async activeSaveId(): Promise<string | null> {
    return this.activeId;
  }
  async setActiveSaveId(saveId: string): Promise<void> {
    this.activeId = saveId;
  }
  async clearActiveSaveId(saveId: string): Promise<void> {
    if (this.activeId === saveId) this.activeId = null;
  }
  async acquireLease(saveId: string, ownerId: string): Promise<boolean> {
    const current = this.leases.get(saveId);
    if (current && current !== ownerId) return false;
    this.leases.set(saveId, ownerId);
    return true;
  }
  async releaseLease(saveId: string, ownerId: string): Promise<void> {
    if (this.leases.get(saveId) === ownerId) this.leases.delete(saveId);
  }
  async commit(input: SeasonDurableCommit): Promise<SeasonSaveSummary> {
    const state = await validateT20SeasonState(input.state);
    const worldCopy = input.worldCopy ? await validateStoredWorldCopy(input.worldCopy) : null;
    const existing = this.slots.get(input.saveId);
    const serial = (existing ? existing.generations.length : 0) + 1;
    const generation = serial % 3;
    const stateJson = canonicalJson(state);
    const sha256 = await seasonSha256Text(stateJson);
    const summary: SeasonSaveSummary = {
      saveId: input.saveId,
      kind: input.kind,
      title: input.title,
      seasonId: state.seasonId,
      careerId: state.careerId,
      controlledTeamId: state.controlledTeamId,
      currentDate: state.careerState.currentDate,
      revision: state.revision,
      completedFixtures: state.completedMatches.length,
      phase: state.phase,
      stateSha256: state.stateSha256,
      updatedAt: input.updatedAt,
    };
    const archives = new Map(existing?.archives ?? []);
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateCompletedCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    this.slots.set(input.saveId, {
      summary,
      worldCopy,
      generations: [
        { serial, generation, stateJson, sha256, revision: state.revision, createdAt: input.updatedAt },
      ],
      archives,
    });
    if (input.setActive !== false) this.activeId = input.saveId;
    return summary;
  }
  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const slot = this.slots.get(saveId);
    if (!slot) return null;
    const gen = slot.generations[0]!;
    const state = await validateT20SeasonState(JSON.parse(gen.stateJson));
    return {
      summary: slot.summary,
      state,
      recovered: false,
      recoveredFromGeneration: null,
      corruptedGenerations: [],
      worldCopy: slot.worldCopy,
    };
  }
  async loadMatchEventArchives(saveId: string) {
    const archives = [...(this.slots.get(saveId)?.archives.values() ?? [])].filter(
      (a): a is Extract<
        AnyCareerMatchEventArchive,
        { archiveVersion: "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1" }
      > => a.archiveVersion === "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1",
    );
    return { archives, damagedFixtureIds: [], totalBytes: 0 };
  }
  async inspectCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    const slot = this.slots.get(saveId)!;
    return {
      saveId,
      title: slot.summary.title,
      currentGeneration: 0,
      currentSerial: 0,
      validGenerations: [],
      corruptedGenerations: [],
    };
  }
  async loadGeneration(saveId: string): Promise<SeasonLoadResult> {
    return (await this.load(saveId))!;
  }
}

class InMemoryPersistentWorldRepo implements CareerPersistentWorldRepository {
  private readonly leases = new Map<string, string>();
  private readonly slots = new Map<
    string,
    {
      summary: PersistentWorldSaveSummary;
      worldCopy: NewGameWorldCopy | null;
      currentSerial: number;
      commands: Map<string, string>;
      generations: Array<{
        serial: number;
        generation: number;
        stateJson: string;
        sha256: string;
        revision: number;
        createdAt: string;
      }>;
      archives: Map<string, AnyCareerMatchEventArchive>;
    }
  >();

  constructor(private readonly seasonRepo: InMemorySeasonRepo) {}

  async recordTypeOf(saveId: string): Promise<string | null> {
    return this.slots.has(saveId) ? PERSISTENT_WORLD_RECORD_TYPE : null;
  }
  async list(): Promise<PersistentWorldSaveSummary[]> {
    return [...this.slots.values()]
      .map((s) => s.summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async activeSaveId(): Promise<string | null> {
    return this.seasonRepo.activeSaveId();
  }
  async clearActiveSaveId(saveId: string): Promise<void> {
    await this.seasonRepo.clearActiveSaveId(saveId);
  }
  async acquireLease(saveId: string, ownerId: string): Promise<boolean> {
    const current = this.leases.get(saveId);
    if (current && current !== ownerId) return false;
    this.leases.set(saveId, ownerId);
    return true;
  }
  async releaseLease(saveId: string, ownerId: string): Promise<void> {
    if (this.leases.get(saveId) === ownerId) this.leases.delete(saveId);
  }
  async commit(
    input: PersistentWorldDurableCommit,
  ): Promise<{ summary: PersistentWorldSaveSummary; idempotentReplay: boolean }> {
    if (this.leases.get(input.saveId) !== input.ownerId) {
      throw new Error("LC_PERSISTENT_WORLD_SAVE_READ_ONLY");
    }
    const existing = this.slots.get(input.saveId);
    if (input.command && existing?.commands.has(input.command.commandId)) {
      const prior = existing.commands.get(input.command.commandId)!;
      if (prior !== input.command.requestCanonical) {
        throw new Error("LC_PERSISTENT_WORLD_DUPLICATE_COMMAND_CONFLICT");
      }
      return { summary: existing.summary, idempotentReplay: true };
    }
    const state = await validateAnyPersistentWorldState(input.state);
    if (input.expectedRevision === null && existing) {
      throw new Error("LC_PERSISTENT_WORLD_SAVE_EXISTS");
    }
    if (
      input.expectedRevision !== null &&
      (existing?.summary.revision ?? 0) !== input.expectedRevision
    ) {
      throw new Error("LC_PERSISTENT_WORLD_SAVE_STALE_REVISION");
    }
    const worldCopy = input.worldCopy
      ? await validateStoredWorldCopy(input.worldCopy)
      : existing?.worldCopy ?? null;
    const serial = (existing?.currentSerial ?? -1) + 1;
    const generation = serial % 3;
    const stateJson = canonicalJson(state);
    const sha256 = await seasonSha256Text(stateJson);
    const summary: PersistentWorldSaveSummary = {
      saveId: input.saveId,
      kind: input.kind,
      title: input.title,
      worldId: state.worldIdentity.worldId,
      careerId: state.careerId,
      controlledTeamId: state.controlledTeamId,
      currentSeasonNumber: state.currentSeasonNumber,
      currentCalendarYear: state.currentCalendarYear,
      completedSeasonCount: state.completedSeasons.length,
      seasonId: state.currentSeason.seasonId,
      currentDate: state.currentSeason.careerState.currentDate,
      revision: state.revision,
      completedFixtures: state.currentSeason.completedMatches.length,
      phase: state.currentSeason.phase,
      stateSha256: state.stateSha256,
      updatedAt: input.updatedAt,
    };
    const archives = new Map(existing?.archives ?? []);
    if (input.copySource?.sourceRecordType === PERSISTENT_WORLD_RECORD_TYPE) {
      const src = this.slots.get(input.copySource.saveId)?.archives ?? new Map();
      for (const [k, v] of src.entries()) archives.set(k, v);
    }
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateAnyCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    const commands = new Map(existing?.commands ?? []);
    if (input.command) commands.set(input.command.commandId, input.command.requestCanonical);
    const generations = [...(existing?.generations ?? [])].filter((g) => g.generation !== generation);
    generations.push({
      serial,
      generation,
      stateJson,
      sha256,
      revision: state.revision,
      createdAt: input.updatedAt,
    });
    generations.sort((a, b) => a.serial - b.serial);
    this.slots.set(input.saveId, {
      summary,
      worldCopy,
      currentSerial: serial,
      commands,
      generations,
      archives,
    });
    if (input.setActive !== false) await this.seasonRepo.setActiveSaveId(input.saveId);
    return { summary, idempotentReplay: false };
  }
  async load(saveId: string): Promise<PersistentWorldLoadResult | null> {
    const slot = this.slots.get(saveId);
    if (!slot) return null;
    const gen = [...slot.generations].sort((a, b) => b.serial - a.serial)[0]!;
    const state = await validateAnyPersistentWorldState(JSON.parse(gen.stateJson));
    return {
      summary: slot.summary,
      state,
      recovered: false,
      recoveredFromGeneration: null,
      corruptedGenerations: [],
      worldCopy: slot.worldCopy,
    };
  }
  async loadMatchEventArchives(saveId: string) {
    const archives = [...(this.slots.get(saveId)?.archives.values() ?? [])].sort((a, b) =>
      a.fixtureId.localeCompare(b.fixtureId),
    );
    const totalBytes = archives.reduce(
      (sum, a) => sum + new TextEncoder().encode(canonicalJson(a)).byteLength,
      0,
    );
    return { archives, damagedFixtureIds: [], totalBytes };
  }
  async inspectCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    const slot = this.slots.get(saveId)!;
    return {
      saveId,
      title: slot.summary.title,
      currentGeneration: 0,
      currentSerial: 0,
      validGenerations: [],
      corruptedGenerations: [],
    };
  }
  async loadGeneration(saveId: string): Promise<PersistentWorldLoadResult> {
    const loaded = await this.load(saveId);
    if (!loaded) throw new Error("MISSING");
    return loaded;
  }
}

function makeSyntheticCompletion(input: {
  fixtureId: string;
  matchId: string;
  fixtureOrdinal: number;
  roundNumber: number;
  matchDayDate: string;
  homeTeamId: string;
  awayTeamId: string;
  homeBatting: Record<string, { runs: number; ballsFaced: number; fours: number; sixes: number; dismissed: boolean }>;
  awayBatting: Record<string, { runs: number; ballsFaced: number; fours: number; sixes: number; dismissed: boolean }>;
  homeBowling: Record<string, { legalBalls: number; runsConceded: number; wickets: number; maidens: number }>;
  awayBowling: Record<string, { legalBalls: number; runsConceded: number; wickets: number; maidens: number }>;
  winnerTeamId: string;
  hashChar: string;
}): T20SeasonMatchCompletion {
  const homeIds = Object.keys(input.homeBatting);
  const awayIds = Object.keys(input.awayBatting);
  const padHome = [...homeIds];
  while (padHome.length < 11) padHome.push(`pad-h-${padHome.length}`);
  const padAway = [...awayIds];
  while (padAway.length < 11) padAway.push(`pad-a-${padAway.length}`);
  const sumRuns = (b: Record<string, { runs: number }>) =>
    Object.values(b).reduce((acc, row) => acc + row.runs, 0);
  const sumWkts = (b: Record<string, { dismissed: boolean }>) =>
    Object.values(b).reduce((acc, row) => acc + (row.dismissed ? 1 : 0), 0);
  const homeRuns = sumRuns(input.homeBatting);
  const awayRuns = sumRuns(input.awayBatting);
  return {
    completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1",
    seasonId: "season-synth",
    scheduleSha256: input.hashChar.repeat(64),
    fixtureId: input.fixtureId,
    matchId: input.matchId,
    fixtureOrdinal: input.fixtureOrdinal,
    roundNumber: input.roundNumber,
    matchDayDate: input.matchDayDate,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    source: "OFFSCREEN",
    selectedTeams: [
      { teamId: input.homeTeamId, playerIds: padHome.slice(0, 11), captainId: padHome[0]!, keeperId: padHome[1] ?? padHome[0]! },
      { teamId: input.awayTeamId, playerIds: padAway.slice(0, 11), captainId: padAway[0]!, keeperId: padAway[1] ?? padAway[0]! },
    ],
    scorecard: {
      matchId: input.matchId,
      innings: [
        {
          battingTeamId: input.homeTeamId,
          bowlingTeamId: input.awayTeamId,
          runs: homeRuns,
          wickets: sumWkts(input.homeBatting),
          legalBalls: 120,
          overs: "20.0",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batting: input.homeBatting,
          bowling: input.awayBowling,
          fallOfWickets: [],
          targetToWin: null,
        },
        {
          battingTeamId: input.awayTeamId,
          bowlingTeamId: input.homeTeamId,
          runs: awayRuns,
          wickets: sumWkts(input.awayBatting),
          legalBalls: 120,
          overs: "20.0",
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
          batting: input.awayBatting,
          bowling: input.homeBowling,
          fallOfWickets: [],
          targetToWin: homeRuns + 1,
        },
      ],
      result: {
        kind: "WIN",
        winnerTeamId: input.winnerTeamId,
        marginType: "RUNS",
        marginRuns: Math.abs(homeRuns - awayRuns) || 1,
        marginWickets: null,
        completionReason: "COMPLETED",
      },
    },
    scorecardSha256: input.hashChar.repeat(64),
    sourceCompletionSha256: input.hashChar.repeat(64),
  };
}

describe("Stage 9 historical statistics and leaderboards", () => {
  it("matches incremental aggregation against complete rebuild, prevents duplicates, survives multi-season rollover, and round-trips .lcxxvi", async () => {
    const seasonRepo = new InMemorySeasonRepo();
    const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
    const service = new CareerApplicationService("tab-stage9", seasonRepo, undefined, persistentRepo);
    await service.boot();

    await service.createCareer(careerWorld.teams[0]!.teamId, null, {
      seed: "stage9-multi-season-seed",
      worldId: "world-stage9-multi",
      careerId: "career-stage9-multi",
    });

    // Simulate all 14 rounds of Season 1.
    for (let guard = 0; guard < 120; guard++) {
      const st = service.getState();
      if (!st || st.phase === "COMPLETE") break;
      const next = service.nextManagedFixture();
      if (!next) break;
      if (st.careerState.currentDate < next.matchDayDate) {
        await service.simulateToNextUserFixture();
      } else {
        await service.simulateManagedFixture();
      }
    }
    expect(service.getState()!.phase).toBe("COMPLETE");

    // Roll over Season 1 -> Season 2 and simulate 3 rounds of Season 2.
    await service.closeSeasonAndAdvance();
    for (let round = 1; round <= 3; round += 1) {
      await service.simulateToNextUserFixture();
      await service.simulateManagedFixture();
    }

    const worldState = service.getPersistentState()!;
    const loadedArchives = (await persistentRepo.loadMatchEventArchives(service.getSaveId()!)).archives;
    const archives = new Map(loadedArchives.map((a) => [a.fixtureId, a]));
    const source = buildHistoricalStatsSourceFromPersistentWorld({
      world: worldState,
      archives,
    });

    // Full rebuild vs incremental fact-by-fact accumulation.
    const acc = createEmptyHistoricalStatsAccumulator({
      worldId: source.worldId,
      ...(source.retiredPlayers !== undefined ? { retiredPlayers: source.retiredPlayers } : {}),
      ...(source.activeTeamIds !== undefined ? { activeTeamIds: source.activeTeamIds } : {}),
      ...(source.teamAffiliationByPlayerId !== undefined
        ? { teamAffiliationByPlayerId: source.teamAffiliationByPlayerId }
        : {}),
    });
    for (const season of source.seasons) {
      registerHistoricalSeasonMetadata(acc, season);
      for (const completion of season.completedMatches) {
        const matchArchive = archives.get(completion.fixtureId);
        const fact = buildHistoricalMatchFact(season, completion, {
          competitionId: acc.competitionId,
          ...(matchArchive !== undefined ? { archive: matchArchive } : {}),
        });
        expect(applyHistoricalMatchFact(acc, fact)).toBe(true);
        // Duplicate replay / duplicate match completion must be ignored.
        expect(applyHistoricalMatchFact(acc, fact)).toBe(false);
      }
    }

    for (const query of [
      {},
      { seasonScope: 1 as const },
      { seasonScope: "ACTIVE" as const },
      { battingPositionBand: "TOP_ORDER" as const },
      { opponentTeamId: careerWorld.teams[1]!.teamId },
      { playerStatus: "RETIRED" as const },
    ]) {
      const fullProj = projectHistoricalStatistics(source, query);
      const incProj = finalizeHistoricalStatisticsProjection(acc, query);
      expect(fullProj.projectionVersion).toBe(HISTORICAL_STATS_PROJECTION_VERSION);
      expect(incProj.projectionDigest).toBe(fullProj.projectionDigest);
      expect(incProj).toEqual(fullProj);
    }

    // Verify fielding dismissals & batting position coverage from archives.
    const baselineProj = service.historicalStatistics({}, loadedArchives)!;
    expect(baselineProj.totalSourceMatches).toBe(56 + 12);
    expect(baselineProj.filterSupport.fielding.archiveCoverageCount).toBe(68);
    expect(baselineProj.filterSupport.fielding.coverage).toBe("ALL_ARCHIVED");
    expect(baselineProj.filterSupport.formats).toEqual(["T20"]);
    expect(baselineProj.separationNotice).toContain("exhibition matches, scenario attempts");

    // Every leaderboard entry must expose contributing fixtures that resolve to stored archives.
    for (const metric of HistoricalLeaderboardMetricSchema.options) {
      const board = baselineProj.leaderboards[metric];
      for (const entry of board.entries) {
        expect(entry.contributingFixtureIds.length).toBeGreaterThan(0);
        for (const fid of entry.contributingFixtureIds) {
          expect(archives.has(fid)).toBe(true);
        }
      }
    }

    // Retired players (if any retired after Season 1) or active players remain discoverable with valid contributing matches.
    const topBatter = baselineProj.leaderboards.RUNS.entries[0]!;
    const playerRecord = service.historicalPlayerRecord(topBatter.playerId, {}, loadedArchives);
    expect(playerRecord).not.toBeNull();
    expect(playerRecord!.contributingMatches.length).toBeGreaterThan(0);
    expect(playerRecord!.contributingMatches[0]!.archiveReplayAvailable).toBe(true);

    // Portable .lcxxvi export/import parity in a fresh CareerApplicationService.
    const exportedBytes = await service.exportCareer();
    expect(peekPortableArchiveVersion(exportedBytes)).toBe(PERSISTENT_WORLD_PORTABLE_V6_ARCHIVE_VERSION);
    const readArchive = await readPersistentWorldPortableArchiveV6(exportedBytes);
    expect(readArchive.matchEventArchives.length).toBe(68);

    const importSeasonRepo = new InMemorySeasonRepo();
    const importPersistentRepo = new InMemoryPersistentWorldRepo(importSeasonRepo);
    const importedService = new CareerApplicationService("tab-stage9-import", importSeasonRepo, undefined, importPersistentRepo);
    await importedService.boot();
    await importedService.importCareer(exportedBytes);

    const importedArchives = (await importPersistentRepo.loadMatchEventArchives(importedService.getSaveId()!)).archives;
    const importedProj = importedService.historicalStatistics({}, importedArchives)!;
    expect(importedProj.projectionDigest).toBe(baselineProj.projectionDigest);
    expect(importedProj).toEqual(baselineProj);

    // Creating a second isolated career (e.g. edited/imported world) leaves the active career stats intact once switched back.
    const firstSaveId = service.getSaveId()!;
    const editedDraft = structuredClone(careerWorld);
    editedDraft.teams[1]!.name = "Isolated Edited Club";
    const editedCopy = createNewGameWorldCopy(editedDraft, careerWorld);
    await service.createCareer(careerWorld.teams[1]!.teamId, editedCopy);
    expect(service.historicalStatistics()!.totalSourceMatches).toBe(0);
    await service.loadCareer(firstSaveId);
    expect(service.historicalStatistics({}, loadedArchives)!.projectionDigest).toBe(baselineProj.projectionDigest);
  }, 180_000);

  it("enforces qualification thresholds, null averages, exact competition ties, and retired-player discovery", () => {
    const p1 = "player-alpha";
    const p2 = "player-beta";
    const p3 = "player-gamma";
    const pUnbeaten = "player-notout";
    const pUnqualified = "player-unqual";
    const home = "aster-harbour";
    const away = "brentwood";

    // p1 and p2 tie at 120 runs (2 matches each, >= 50 balls faced); p3 has 90 runs.
    // pUnbeaten is never dismissed so battingAverageX100 === null.
    // pUnqualified has 40 runs in 10 balls (< 50 ball threshold for average/SR).
    const m1 = makeSyntheticCompletion({
      fixtureId: "fx-1",
      matchId: "mx-1",
      fixtureOrdinal: 1,
      roundNumber: 1,
      matchDayDate: "2027-03-01",
      homeTeamId: home,
      awayTeamId: away,
      winnerTeamId: home,
      hashChar: "1",
      homeBatting: {
        [p1]: { runs: 60, ballsFaced: 35, fours: 6, sixes: 2, dismissed: true },
        [p2]: { runs: 60, ballsFaced: 35, fours: 5, sixes: 3, dismissed: true },
        [pUnbeaten]: { runs: 45, ballsFaced: 30, fours: 4, sixes: 1, dismissed: false },
      },
      awayBatting: {
        [p3]: { runs: 50, ballsFaced: 30, fours: 4, sixes: 2, dismissed: true },
        [pUnqualified]: { runs: 40, ballsFaced: 10, fours: 5, sixes: 2, dismissed: true },
      },
      homeBowling: {
        [p1]: { legalBalls: 24, runsConceded: 20, wickets: 2, maidens: 0 },
      },
      awayBowling: {
        [p3]: { legalBalls: 24, runsConceded: 24, wickets: 1, maidens: 0 },
      },
    });
    const m2 = makeSyntheticCompletion({
      fixtureId: "fx-2",
      matchId: "mx-2",
      fixtureOrdinal: 2,
      roundNumber: 2,
      matchDayDate: "2027-03-05",
      homeTeamId: home,
      awayTeamId: away,
      winnerTeamId: home,
      hashChar: "2",
      homeBatting: {
        [p1]: { runs: 60, ballsFaced: 35, fours: 6, sixes: 2, dismissed: true },
        [p2]: { runs: 60, ballsFaced: 35, fours: 5, sixes: 3, dismissed: true },
        [pUnbeaten]: { runs: 30, ballsFaced: 25, fours: 2, sixes: 1, dismissed: false },
      },
      awayBatting: {
        [p3]: { runs: 40, ballsFaced: 30, fours: 3, sixes: 1, dismissed: true },
      },
      homeBowling: {
        [p1]: { legalBalls: 18, runsConceded: 15, wickets: 1, maidens: 0 },
      },
      awayBowling: {
        [p3]: { legalBalls: 18, runsConceded: 30, wickets: 0, maidens: 0 },
      },
    });

    const proj = projectHistoricalStatistics({
      worldId: "world-ties",
      seasons: [
        {
          seasonNumber: 1,
          calendarYear: 2027,
          phase: "COMPLETE",
          completedMatches: [m1, m2],
          groundByFixtureId: { "fx-1": "ground-a", "fx-2": "ground-b" },
        },
      ],
      retiredPlayers: [
        {
          playerId: p2,
          player: { ...careerWorld.players[0]!, playerId: p2, name: "Beta Retired" },
          debutSeasonNumber: 1,
          retiredAfterSeasonNumber: 1,
          retiredCalendarYear: 2027,
          ageAtRetirement: 36,
          lastTeamId: home,
          careerTeamIds: [home],
          retirementReason: "AGE_AND_WORKLOAD",
        },
      ],
      activeTeamIds: [home, away],
    });

    const runsBoard = proj.leaderboards.RUNS;
    const p1Run = runsBoard.entries.find((e) => e.playerId === p1)!;
    const p2Run = runsBoard.entries.find((e) => e.playerId === p2)!;
    const p3Run = runsBoard.entries.find((e) => e.playerId === p3)!;
    expect(p1Run.rank).toBe(1);
    expect(p2Run.rank).toBe(1);
    expect(p1Run.tied).toBe(true);
    expect(p2Run.tied).toBe(true);
    expect(p3Run.rank).toBe(3);
    expect(p2Run.status).toBe("RETIRED");

    // Unbeaten batter has null batting average and is excluded from BATTING_AVERAGE qualified list.
    const unbeatenRec = proj.players.find((p) => p.playerId === pUnbeaten)!;
    expect(unbeatenRec.battingAverageX100).toBeNull();
    expect(proj.leaderboards.BATTING_AVERAGE.entries.some((e) => e.playerId === pUnbeaten)).toBe(false);

    // Unqualified batter (10 balls < 12 ball small-sample threshold) is excluded from qualified leaderboard entries while counted in totalCandidatesCount and preserved in players.
    expect(
      proj.leaderboards.BATTING_STRIKE_RATE.entries.some((e) => e.playerId === pUnqualified),
    ).toBe(false);
    expect(proj.leaderboards.BATTING_STRIKE_RATE.qualificationRule.minDenominator).toBe(12);
    expect(proj.leaderboards.BATTING_STRIKE_RATE.totalCandidatesCount).toBe(5);
    expect(proj.leaderboards.BATTING_STRIKE_RATE.qualifiedCount).toBe(4);
    const unqualRec = proj.players.find((p) => p.playerId === pUnqualified)!;
    expect(unqualRec.ballsFaced).toBe(10);
    expect(unqualRec.strikeRateX100).toBe(40000);

    // Zero-wicket bowler (p3 has 1 wicket in m1, 0 in m2; verify RETIRED filter isolates p2).
    const retiredOnly = projectHistoricalStatistics(
      {
        worldId: "world-ties",
        seasons: [{ seasonNumber: 1, calendarYear: 2027, phase: "COMPLETE", completedMatches: [m1, m2] }],
        retiredPlayers: [
          {
            playerId: p2,
            player: { ...careerWorld.players[0]!, playerId: p2, name: "Beta Retired" },
            debutSeasonNumber: 1,
            retiredAfterSeasonNumber: 1,
            retiredCalendarYear: 2027,
            ageAtRetirement: 36,
            lastTeamId: home,
            careerTeamIds: [home],
            retirementReason: "AGE_AND_WORKLOAD",
          },
        ],
        activeTeamIds: [home, away],
      },
      { playerStatus: "RETIRED" },
    );
    expect(retiredOnly.players.map((p) => p.playerId)).toEqual([p2]);
    expect(retiredOnly.players[0]!.contributingMatches.map((m) => m.fixtureId)).toEqual(["fx-1", "fx-2"]);
  });
});
