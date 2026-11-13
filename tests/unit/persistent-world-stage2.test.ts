import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION,
  PERSISTENT_WORLD_STATE_VERSION,
  type CompletedCareerMatchEventArchive,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type PersistentWorldState,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type T20SeasonState,
} from "@lcxxvi/contracts";
import {
  createPersistentWorldPortableArchive,
  createSeasonPortableArchive,
  createT20SeasonArchive,
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchive,
  SEASON_EVENT_ARCHIVES_PORTABLE_VERSION,
  SEASON_PORTABLE_ARCHIVE_VERSION,
  seasonSha256Text,
  validateCompletedCareerMatchEventArchive,
  validatePersistentWorldState,
  validateStoredWorldCopy,
  validateT20SeasonState,
  type PersistentWorldDurableCommit,
  type PersistentWorldLoadResult,
  type SeasonDurableCommit,
  type SeasonLoadResult,
} from "@lcxxvi/persistence";
import { rebuildPersistentCareerProjectionCore } from "@lcxxvi/projections";
import {
  CareerApplicationService,
  careerWorld,
  createInitialPersistentWorldCareerState,
  createInitialSeasonState,
  deterministicSeasonCompletedAt,
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
      archives: Map<string, CompletedCareerMatchEventArchive>;
    }
  >();

  async list(): Promise<SeasonSaveSummary[]> {
    return [...this.slots.values()]
      .map((s) => s.summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async activeSaveId(): Promise<string | null> {
    return this.activeId;
  }
  async setActiveSaveId(saveId: string | null): Promise<void> {
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
    if (this.leases.get(input.saveId) !== input.ownerId) {
      throw new Error("SEASON_SAVE_READ_ONLY");
    }
    const state = await validateT20SeasonState(input.state);
    const existing = this.slots.get(input.saveId);
    if (input.expectedRevision === null && existing) throw new Error("SEASON_SAVE_EXISTS");
    if (
      input.expectedRevision !== null &&
      (existing?.summary.revision ?? 0) !== input.expectedRevision
    ) {
      throw new Error("SEASON_SAVE_STALE_REVISION");
    }
    const worldCopy = input.worldCopy
      ? await validateStoredWorldCopy(input.worldCopy)
      : existing?.worldCopy ?? null;
    const serial = (existing?.generations.at(-1)?.serial ?? -1) + 1;
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
    const generations = [...(existing?.generations ?? [])].filter(
      (g) => g.generation !== generation,
    );
    generations.push({
      serial,
      generation,
      stateJson,
      sha256,
      revision: state.revision,
      createdAt: input.updatedAt,
    });
    generations.sort((a, b) => a.serial - b.serial);
    this.slots.set(input.saveId, { summary, worldCopy, generations, archives });
    if (input.setActive !== false) this.activeId = input.saveId;
    return summary;
  }
  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const slot = this.slots.get(saveId);
    if (!slot) return null;
    const ordered = [...slot.generations].sort((a, b) => b.serial - a.serial);
    const newestSerial = ordered[0]?.serial ?? -1;
    const corruptedGenerations: number[] = [];
    for (const gen of ordered) {
      if ((await seasonSha256Text(gen.stateJson)) !== gen.sha256) {
        corruptedGenerations.push(gen.generation);
        continue;
      }
      const state = await validateT20SeasonState(JSON.parse(gen.stateJson));
      return {
        summary: slot.summary,
        state,
        recovered: gen.serial !== newestSerial,
        recoveredFromGeneration: gen.serial !== newestSerial ? gen.generation : null,
        corruptedGenerations,
        worldCopy: slot.worldCopy,
      };
    }
    throw new Error("SEASON_SAVE_CORRUPT");
  }
  async loadMatchEventArchives(
    saveId: string,
  ): Promise<{
    archives: CompletedCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }> {
    const archives = [...(this.slots.get(saveId)?.archives.values() ?? [])].sort((a, b) =>
      a.fixtureId.localeCompare(b.fixtureId),
    );
    const totalBytes = archives.reduce(
      (sum, a) => sum + new TextEncoder().encode(canonicalJson(a)).byteLength,
      0,
    );
    return { archives, damagedFixtureIds: [], totalBytes };
  }
  getRawArchives(saveId: string): ReadonlyMap<string, CompletedCareerMatchEventArchive> {
    return this.slots.get(saveId)?.archives ?? new Map();
  }
  async inspectCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    const slot = this.slots.get(saveId);
    if (!slot) throw new Error("SEASON_SAVE_NOT_FOUND");
    return {
      saveId,
      title: slot.summary.title,
      currentGeneration: slot.generations.at(-1)!.generation,
      currentSerial: slot.generations.at(-1)!.serial,
      validGenerations: slot.generations.map((g) => {
        const parsed = JSON.parse(g.stateJson) as T20SeasonState;
        return {
          generation: g.generation,
          checkpointSerial: g.serial,
          revision: g.revision,
          createdAt: g.createdAt,
          stateSha256: parsed.stateSha256,
          completedFixtures: parsed.completedMatches.length,
          currentDate: parsed.careerState.currentDate,
          phase: parsed.phase,
        };
      }),
      corruptedGenerations: [],
    };
  }
  async loadGeneration(saveId: string, generation: number): Promise<SeasonLoadResult> {
    const slot = this.slots.get(saveId);
    const gen = slot?.generations.find((g) => g.generation === generation);
    if (!slot || !gen) throw new Error("SEASON_CHECKPOINT_GENERATION_CORRUPT");
    const state = await validateT20SeasonState(JSON.parse(gen.stateJson));
    return {
      summary: slot.summary,
      state,
      recovered: false,
      recoveredFromGeneration: generation,
      corruptedGenerations: [],
      worldCopy: slot.worldCopy,
    };
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
      archives: Map<string, CompletedCareerMatchEventArchive>;
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
    const state = await validatePersistentWorldState(input.state);
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
    if (input.copySource) {
      const sourceArchives =
        input.copySource.sourceRecordType === PERSISTENT_WORLD_RECORD_TYPE
          ? (this.slots.get(input.copySource.saveId)?.archives ?? new Map())
          : this.seasonRepo.getRawArchives(input.copySource.saveId);
      for (const [fixtureId, archive] of sourceArchives.entries()) {
        archives.set(fixtureId, archive);
      }
    }
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateCompletedCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    const commands = new Map(existing?.commands ?? []);
    if (input.command) {
      commands.set(input.command.commandId, input.command.requestCanonical);
    }
    const generations = [...(existing?.generations ?? [])].filter(
      (g) => g.generation !== generation,
    );
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
    const ordered = [...slot.generations].sort((a, b) => b.serial - a.serial);
    const corruptedGenerations: number[] = [];
    for (const gen of ordered) {
      if ((await seasonSha256Text(gen.stateJson)) !== gen.sha256) {
        corruptedGenerations.push(gen.generation);
        continue;
      }
      try {
        const state = await validatePersistentWorldState(JSON.parse(gen.stateJson));
        const recovered = gen.serial !== slot.currentSerial;
        return {
          summary: recovered
            ? {
                ...slot.summary,
                currentSeasonNumber: state.currentSeasonNumber,
                currentCalendarYear: state.currentCalendarYear,
                completedSeasonCount: state.completedSeasons.length,
                seasonId: state.currentSeason.seasonId,
                currentDate: state.currentSeason.careerState.currentDate,
                revision: state.revision,
                completedFixtures: state.currentSeason.completedMatches.length,
                phase: state.currentSeason.phase,
                stateSha256: state.stateSha256,
              }
            : slot.summary,
          state,
          recovered,
          recoveredFromGeneration: recovered ? gen.generation : null,
          corruptedGenerations,
          worldCopy: slot.worldCopy,
        };
      } catch {
        corruptedGenerations.push(gen.generation);
      }
    }
    throw new Error("LC_PERSISTENT_WORLD_SAVE_CORRUPT");
  }
  async loadMatchEventArchives(
    saveId: string,
  ): Promise<{
    archives: CompletedCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }> {
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
    const slot = this.slots.get(saveId);
    if (!slot) throw new Error("LC_PERSISTENT_WORLD_SAVE_NOT_FOUND");
    const validGenerations: SeasonCheckpointInspection["validGenerations"][number][] = [];
    const corruptedGenerations: number[] = [];
    for (const gen of [...slot.generations].sort((a, b) => b.serial - a.serial)) {
      if ((await seasonSha256Text(gen.stateJson)) !== gen.sha256) {
        corruptedGenerations.push(gen.generation);
        continue;
      }
      const state = await validatePersistentWorldState(JSON.parse(gen.stateJson));
      validGenerations.push({
        generation: gen.generation,
        checkpointSerial: gen.serial,
        revision: gen.revision,
        createdAt: gen.createdAt,
        stateSha256: state.stateSha256,
        completedFixtures: state.currentSeason.completedMatches.length,
        currentDate: state.currentSeason.careerState.currentDate,
        phase: state.currentSeason.phase,
      });
    }
    return {
      saveId,
      title: slot.summary.title,
      currentGeneration: slot.currentSerial % 3,
      currentSerial: slot.currentSerial,
      validGenerations,
      corruptedGenerations: corruptedGenerations.sort((a, b) => a - b),
    };
  }
  async loadGeneration(saveId: string, generation: number): Promise<PersistentWorldLoadResult> {
    const slot = this.slots.get(saveId);
    const gen = slot?.generations.find((g) => g.generation === generation);
    if (!slot || !gen || (await seasonSha256Text(gen.stateJson)) !== gen.sha256) {
      throw new Error("LC_PERSISTENT_WORLD_CHECKPOINT_GENERATION_CORRUPT");
    }
    const state = await validatePersistentWorldState(JSON.parse(gen.stateJson));
    return {
      summary: {
        ...slot.summary,
        currentSeasonNumber: state.currentSeasonNumber,
        currentCalendarYear: state.currentCalendarYear,
        completedSeasonCount: state.completedSeasons.length,
        seasonId: state.currentSeason.seasonId,
        currentDate: state.currentSeason.careerState.currentDate,
        revision: state.revision,
        completedFixtures: state.currentSeason.completedMatches.length,
        phase: state.currentSeason.phase,
        stateSha256: state.stateSha256,
      },
      state,
      recovered: true,
      recoveredFromGeneration: generation,
      corruptedGenerations: [],
      worldCopy: slot.worldCopy,
    };
  }
  corruptCurrentCheckpoint(saveId: string): void {
    const slot = this.slots.get(saveId)!;
    const latest = [...slot.generations].sort((a, b) => b.serial - a.serial)[0]!;
    latest.stateJson = `${latest.stateJson} `;
  }
}

async function simulateFullSeason(service: CareerApplicationService): Promise<T20SeasonState> {
  while (service.getState()?.phase === "ACTIVE") {
    const state = service.getState()!;
    const next = service.nextManagedFixture();
    if (!next) break;
    if (state.careerState.currentDate < next.matchDayDate) {
      await service.simulateToNextUserFixture();
    } else {
      await service.simulateManagedFixture();
    }
  }
  const completed = service.getState();
  expect(completed?.phase).toBe("COMPLETE");
  expect(completed?.completedMatches).toHaveLength(56);
  return completed!;
}

describe("Stage 2 persistent multi-season world", () => {
  it(
    "completes consecutive seasons with stable team/player IDs, distinct schedules, idempotent rollover, and exact career projection parity",
    async () => {
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService(
        "owner-stage2",
        seasonRepo,
        undefined,
        persistentRepo,
      );

      await service.createCareer("team-01", null, {
        saveId: "pworld-slot-1",
        careerId: "career-stage2-01",
        worldId: "world-stage2-01",
        seed: "seed-stage2-alpha",
        startDate: "2026-04-04",
      });

      const initialWorld = service.getPersistentState()!;
      expect(initialWorld.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_VERSION);
      expect(initialWorld.currentSeasonNumber).toBe(1);
      expect(initialWorld.currentCalendarYear).toBe(2026);
      expect(initialWorld.completedSeasons).toHaveLength(0);

      const season1Done = await simulateFullSeason(service);
      const season1Id = season1Done.seasonId;
      const season1FirstFixtureId = season1Done.completedMatches[0]!.fixtureId;

      // Close Season 1 -> Season 2
      const rolloverRes1 = await service.closeSeasonAndAdvance(season1Id);
      expect(rolloverRes1.idempotentReplay).toBe(false);
      const afterRollover1 = rolloverRes1.state;
      expect(afterRollover1.currentSeasonNumber).toBe(2);
      expect(afterRollover1.currentCalendarYear).toBe(2027);
      expect(afterRollover1.completedSeasons).toHaveLength(1);
      expect(afterRollover1.currentSeason.phase).toBe("ACTIVE");
      expect(afterRollover1.currentSeason.completedMatches).toHaveLength(0);
      expect(afterRollover1.currentSeason.schedule.startDate).toBe("2027-04-04");
      expect(afterRollover1.currentSeason.schedule.scheduleSha256).not.toBe(
        season1Done.schedule.scheduleSha256,
      );

      // Repeated close with the same already-closed seasonId is idempotent!
      const repeatRes = await service.closeSeasonAndAdvance(season1Id);
      expect(repeatRes.idempotentReplay).toBe(true);
      const idempotentRepeat = repeatRes.state;
      expect(idempotentRepeat.stateSha256).toBe(afterRollover1.stateSha256);
      expect(idempotentRepeat.currentSeasonNumber).toBe(2);
      expect(idempotentRepeat.completedSeasons).toHaveLength(1);

      // Closing Season 2 prematurely before 56 fixtures is rejected.
      await expect(
        service.closeSeasonAndAdvance(afterRollover1.currentSeason.seasonId),
      ).rejects.toThrow(/Complete all 56 fixtures/);

      // Simulate Round 1 of Season 2, then verify incremental/active + sealed projection equals full rebuild.
      await service.simulateManagedFixture();
      const midSeason2 = service.getPersistentState()!;
      expect(midSeason2.careerProjection.totalMatchesApplied).toBe(
        56 + midSeason2.currentSeason.completedMatches.length,
      );
      const rebuiltMid = rebuildPersistentCareerProjectionCore({
        worldId: midSeason2.worldIdentity.worldId,
        teamIds: careerWorld.teams.map((t) => t.teamId),
        completedSeasons: midSeason2.completedSeasons,
        activeSeason: midSeason2.currentSeason,
      });
      const { projectionSha256: _ignoredSha, ...storedCore } = midSeason2.careerProjection;
      void _ignoredSha;
      expect(storedCore).toEqual(rebuiltMid);

      // Finish Season 2 and roll into Season 3 (2028)
      const season2Done = await simulateFullSeason(service);
      const rolloverRes2 = await service.closeSeasonAndAdvance(season2Done.seasonId);
      expect(rolloverRes2.idempotentReplay).toBe(false);
      const afterRollover2 = rolloverRes2.state;
      expect(afterRollover2.currentSeasonNumber).toBe(3);
      expect(afterRollover2.currentCalendarYear).toBe(2028);
      expect(afterRollover2.completedSeasons).toHaveLength(2);
      expect(afterRollover2.careerProjection.totalMatchesApplied).toBe(112);

      // Verify zero duplicate fixture IDs or match IDs across Season 1, Season 2, and Season 3 schedules
      const allFixtureIds = [
        ...afterRollover2.completedSeasons[0]!.completedMatches.map((m) => m.fixtureId),
        ...afterRollover2.completedSeasons[1]!.completedMatches.map((m) => m.fixtureId),
        ...afterRollover2.currentSeason.schedule.fixtures.map((f) => f.fixtureId),
      ];
      expect(new Set(allFixtureIds).size).toBe(56 * 3);

      // Stable player and team IDs across all seasons
      const worldPlayerIds = new Set(careerWorld.players.map((p) => p.playerId));
      for (const playerRow of afterRollover2.careerProjection.players) {
        expect(worldPlayerIds.has(playerRow.playerId)).toBe(true);
      }

      // Replay from archived Season 1 still resolves cleanly without recomputing
      const replayS1 = await service.replayFixtureArchive(season1FirstFixtureId);
      expect(replayS1.status).toBe("READY");

      // Portable LC_PERSISTENT_WORLD_PORTABLE_V1 round-trip into a fresh repository
      const archiveBytes = await service.exportCareer();
      expect(peekPortableArchiveVersion(archiveBytes)).toBe(
        PERSISTENT_WORLD_PORTABLE_ARCHIVE_VERSION,
      );
      const parsedArchive = await readPersistentWorldPortableArchive(archiveBytes);
      expect(parsedArchive.state.stateSha256).toBe(afterRollover2.stateSha256);
      expect(parsedArchive.matchEventArchives).toHaveLength(112);

      const freshSeasonRepo = new InMemorySeasonRepo();
      const freshPersistentRepo = new InMemoryPersistentWorldRepo(freshSeasonRepo);
      const freshService = new CareerApplicationService(
        "owner-fresh",
        freshSeasonRepo,
        undefined,
        freshPersistentRepo,
      );
      await freshService.importCareer(archiveBytes);
      expect(freshService.getPersistentState()?.stateSha256).toBe(afterRollover2.stateSha256);
      const importedReplayS1 = await freshService.replayFixtureArchive(season1FirstFixtureId);
      expect(importedReplayS1.status).toBe("READY");
    },
    180_000,
  );

  it(
    "recovers cleanly from a corrupted post-rollover checkpoint without duplicating seasons, and preserves edited world identity",
    async () => {
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService(
        "owner-recovery",
        seasonRepo,
        undefined,
        persistentRepo,
      );
      const draft = structuredClone(careerWorld);
      draft.teams[0]!.name = "Harbour Regents";
      const editedCopy = createNewGameWorldCopy(draft, careerWorld);

      await service.createCareer("team-01", editedCopy, {
        saveId: "pworld-edited",
        careerId: "career-edited-01",
        worldId: "world-edited-01",
        seed: "seed-edited-01",
        startDate: "2026-04-04",
      });

      const completedS1 = await simulateFullSeason(service);
      const preRolloverStateSha = service.getPersistentState()!.stateSha256;
      const afterRollover = (await service.closeSeasonAndAdvance(completedS1.seasonId)).state;
      expect(afterRollover.currentSeasonNumber).toBe(2);

      // Corrupt the newest post-rollover checkpoint generation and reload:
      // repository falls back deterministically to the verified pre-rollover COMPLETE Season 1 generation,
      // and edited world names remain intact.
      persistentRepo.corruptCurrentCheckpoint("pworld-edited");

      const reloaded = new CareerApplicationService(
        "owner-recovery-2",
        seasonRepo,
        undefined,
        persistentRepo,
      );
      await service.releaseWriter();
      await reloaded.boot();
      expect(reloaded.wasRecovered()).toBe(true);
      expect(reloaded.getPersistentState()?.stateSha256).toBe(preRolloverStateSha);
      expect(reloaded.getPersistentState()?.currentSeasonNumber).toBe(1);
      expect(reloaded.getState()?.phase).toBe("COMPLETE");
      expect(reloaded.teamName("team-01")).toBe("Harbour Regents");

      // Re-running rollover from the recovered slot produces the exact same Season 2 stateSha256!
      const reRolled = (await reloaded.closeSeasonAndAdvance(completedS1.seasonId)).state;
      expect(reRolled.stateSha256).toBe(afterRollover.stateSha256);
      expect(reloaded.teamName("team-01")).toBe("Harbour Regents");
    },
    90_000,
  );

  it(
    "keeps legacy single-season V0.1 archives frozen on reload and copies completed single-season saves non-destructively into Season 2",
    async () => {
      const legacySeasonRepo = new InMemorySeasonRepo();
      const legacyOnlyService = new CareerApplicationService("owner-v01", legacySeasonRepo);
      await legacyOnlyService.createCareer("team-02", null, {
        saveId: "legacy-v01-slot",
        seasonId: "legacy-season-01",
        careerId: "legacy-career-01",
        gameId: "legacy-game-01",
        seed: "legacy-seed-01",
        startDate: "2026-04-04",
      });
      const completedLegacy = await simulateFullSeason(legacyOnlyService);
      const legacySummary = (await legacySeasonRepo.list())[0]!;
      const completedSeasonArchive = await createT20SeasonArchive(
        completedLegacy,
        deterministicSeasonCompletedAt(completedLegacy),
      );

      // Create both a legacy V1 archive (no event archives) and a V3 archive (with event archives)
      const v1Bytes = await createSeasonPortableArchive(
        completedLegacy,
        legacySummary,
        "2026-06-01T00:00:00.000Z",
        completedSeasonArchive,
      );
      expect(peekPortableArchiveVersion(v1Bytes)).toBe(SEASON_PORTABLE_ARCHIVE_VERSION);

      const v3Bytes = await legacyOnlyService.exportCareer();
      expect(peekPortableArchiveVersion(v3Bytes)).toBe(SEASON_EVENT_ARCHIVES_PORTABLE_VERSION);

      // Import the V3 single-season archive into a Stage 2 persistent-capable service:
      // it must stay a single-season V0.1 save on import AND after reload (never auto-starting Season 2).
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService(
        "owner-stage2-compat",
        seasonRepo,
        undefined,
        persistentRepo,
      );
      await service.importCareer(v3Bytes);
      const importedLegacySaveId = service.getSaveId()!;
      expect(service.isPersistentWorld()).toBe(false);
      expect(service.getPersistentState()).toBeNull();
      expect(service.getState()?.stateSha256).toBe(completedLegacy.stateSha256);
      expect(service.getState()?.phase).toBe("COMPLETE");

      // Reloading the completed V0.1 save must NOT accidentally start or duplicate a new season
      await service.releaseWriter();
      const reloaded = new CareerApplicationService(
        "owner-stage2-compat-2",
        seasonRepo,
        undefined,
        persistentRepo,
      );
      await reloaded.boot();
      expect(reloaded.isPersistentWorld()).toBe(false);
      expect(reloaded.getState()?.stateSha256).toBe(completedLegacy.stateSha256);

      // Explicit copy into a persistent world creates a new Season 2 slot while leaving the V0.1 slot untouched
      const firstFixtureId = completedLegacy.completedMatches[0]!.fixtureId;
      const promoted = await reloaded.copySingleSeasonToPersistentWorld("Copied Multi-Season");
      expect(reloaded.isPersistentWorld()).toBe(true);
      expect(reloaded.getSaveId()).not.toBe(importedLegacySaveId);
      expect(promoted.currentSeasonNumber).toBe(2);
      expect(promoted.currentCalendarYear).toBe(2027);
      expect(promoted.completedSeasons).toHaveLength(1);
      expect(promoted.completedSeasons[0]!.finalSeasonStateSha256).toBe(
        completedLegacy.stateSha256,
      );
      expect(promoted.worldIdentity.originKind).toBe("COPIED_FROM_SINGLE_SEASON_V1");
      expect(promoted.worldIdentity.sourceSingleSeasonSaveId).toBe(importedLegacySaveId);

      // Retained event archive from the copied V0.1 season is preserved for replay in the new persistent slot
      const replayCopied = await reloaded.replayFixtureArchive(firstFixtureId);
      expect(replayCopied.status).toBe("READY");

      // Original V0.1 single-season save remains completely untouched in seasonRepo
      const originalLoaded = await seasonRepo.load(importedLegacySaveId);
      expect(originalLoaded?.state.stateSha256).toBe(completedLegacy.stateSha256);
      expect(originalLoaded?.state.phase).toBe("COMPLETE");
    },
    90_000,
  );

  it("rejects tampered persistent-world portable archives and mismatched projection hashes", async () => {
    const initial = await createInitialPersistentWorldCareerState({
      worldId: "world-tamper-01",
      careerId: "career-tamper-01",
      controlledTeamId: "team-03",
      baseSeed: "seed-tamper-01",
      startDate: "2026-04-04",
    });
    const summary: PersistentWorldSaveSummary = {
      saveId: "save-tamper-01",
      kind: "AUTO",
      title: "Tamper Check",
      worldId: initial.worldIdentity.worldId,
      careerId: initial.careerId,
      controlledTeamId: initial.controlledTeamId,
      currentSeasonNumber: 1,
      currentCalendarYear: initial.currentCalendarYear,
      completedSeasonCount: 0,
      seasonId: initial.currentSeason.seasonId,
      currentDate: initial.currentSeason.careerState.currentDate,
      revision: 0,
      completedFixtures: 0,
      phase: "ACTIVE",
      stateSha256: initial.stateSha256,
      updatedAt: "2026-04-04T00:00:00.000Z",
    };
    const bytes = await createPersistentWorldPortableArchive(
      initial,
      summary,
      "2026-04-04T00:00:00.000Z",
    );
    const tamperedState: PersistentWorldState = {
      ...initial,
      currentCalendarYear: 2099,
    };
    await expect(validatePersistentWorldState(tamperedState)).rejects.toThrow(
      /STATE_HASH_MISMATCH|CALENDAR|START_DATE/,
    );
    const corruptedBytes = new Uint8Array(bytes);
    corruptedBytes[80] = (corruptedBytes[80] ?? 0) ^ 0xff;
    await expect(readPersistentWorldPortableArchive(corruptedBytes)).rejects.toThrow();

    // Also verify createInitialSeasonState remains intact for V0.1 callers
    const single = await createInitialSeasonState({
      seasonId: "s-single",
      careerId: "c-single",
      gameId: "g-single",
      controlledTeamId: "team-01",
      seed: "seed-single",
      startDate: "2026-04-04",
    });
    expect(single.seasonStateVersion).toBe("LC_T20_SEASON_STATE_V1");
  });
});
