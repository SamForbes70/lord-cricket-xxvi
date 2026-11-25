import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  PERSISTENT_WORLD_STATE_V3_VERSION,
  PERSISTENT_WORLD_STATE_V4_VERSION,
  PERSISTENT_WORLD_STATE_V5_VERSION,
  StagedRosterPackSchema,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type StagedRosterPack,
} from "@lcxxvi/contracts";
import {
  PERSISTENT_WORLD_RECORD_TYPE,
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

// Copying a world state V3 or V4 career forward into V5 changes nothing a player can see.


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
      packs: Map<string, StagedRosterPack>;
    }
  >();

  constructor(private readonly seasonRepo: InMemorySeasonRepo) {}

  /** Mirrors IndexedDbPersistentWorldRepository: imported packs, the active pack, and on a first V4 commit the embedded ones. */
  private async storedPacksAfter(
    input: PersistentWorldDurableCommit,
    state: Awaited<ReturnType<typeof validateAnyPersistentWorldState>>,
    existing: Map<string, StagedRosterPack> | undefined,
  ): Promise<Map<string, StagedRosterPack>> {
    const packs = new Map(existing ?? []);
    const add = async (raw: unknown) => {
      const pack = StagedRosterPackSchema.parse(raw);
      packs.set(await seasonSha256Text(canonicalJson(pack)), pack);
    };
    for (const raw of input.seasonRosterPacks ?? []) await add(raw);
    if ("lifecycle" in state && state.lifecycle.activeRosterPack) await add(state.lifecycle.activeRosterPack);
    if ((state.worldStateVersion === PERSISTENT_WORLD_STATE_V4_VERSION || state.worldStateVersion === "LC_PERSISTENT_WORLD_STATE_V5" || state.worldStateVersion === "LC_PERSISTENT_WORLD_STATE_V6") && input.expectedRevision === null) {
      for (const pack of state.lifecycle.historicalRosterPacks) await add(pack);
    }
    return packs;
  }

  async loadLifecycleRosterPacks(saveId: string): Promise<Map<string, StagedRosterPack>> {
    return new Map(this.slots.get(saveId)?.packs ?? []);
  }

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
    const packs = await this.storedPacksAfter(input, state, existing?.packs);
    this.slots.set(input.saveId, {
      summary,
      worldCopy,
      currentSerial: serial,
      commands,
      generations,
      archives,
      packs,
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


function newService(owner: string) {
  const seasonRepo = new InMemorySeasonRepo();
  const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
  return { service: new CareerApplicationService(owner, seasonRepo, undefined, persistentRepo), persistentRepo };
}

async function playSeasonAndRollOver(service: CareerApplicationService) {
  for (let guard = 0; guard < 400; guard++) {
    const state = service.getState()!;
    if (state.phase === "COMPLETE") break;
    const next = service.nextManagedFixture();
    if (next && state.careerState.currentDate >= next.matchDayDate) await service.simulateManagedFixture();
    else await service.advanceDay();
  }
  await service.closeSeasonAndAdvance();
}



function withoutVersionAndLifecycle(world: { worldStateVersion: string; stateSha256: string; lifecycle: unknown }) {
  const { worldStateVersion: _v, stateSha256: _h, lifecycle: _l, ...rest } = world as Record<string, unknown>;
  void _v; void _h; void _l;
  return canonicalJson(rest);
}

describe("copying careers forward to world state V5", () => {
  it(
    "copies a two-season V3 career: same game, two embedded packs, every pack stored, source untouched, replays work",
    async () => {
      const { service, persistentRepo } = newService("v3-forward");
      await service.boot();
      await service.createCareer(careerWorld.teams[0]!.teamId, null, {
        seed: "v3-forward", worldId: "world-v3-forward", careerId: "career-v3-forward", startDate: "2026-04-04",
        worldStateVersion: PERSISTENT_WORLD_STATE_V3_VERSION,
      });
      await playSeasonAndRollOver(service);
      await playSeasonAndRollOver(service);
      const source = service.getPersistentState()!;
      const sourceSaveId = service.getSaveId()!;
      if (source.worldStateVersion !== PERSISTENT_WORLD_STATE_V3_VERSION) throw new Error("expected V3");
      expect(source.lifecycle.historicalRosterPacks.length).toBeGreaterThan(2);

      const copy = await service.copyForwardToWorldStateV5();
      expect(copy.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V5_VERSION);
      expect(service.getSaveId()).not.toBe(sourceSaveId);
      // Nothing a player can see changes.
      expect(withoutVersionAndLifecycle(copy)).toBe(withoutVersionAndLifecycle(source));
      expect(canonicalJson(copy.lifecycle.activeWorld)).toBe(canonicalJson(source.lifecycle.activeWorld));
      expect(canonicalJson(copy.lifecycle.historicalRosterPacks)).toBe(
        canonicalJson(source.lifecycle.historicalRosterPacks.slice(-2)),
      );
      // Every pack the source embedded is stored for the copy.
      const stored = await persistentRepo.loadLifecycleRosterPacks(service.getSaveId()!);
      for (const pack of source.lifecycle.historicalRosterPacks) {
        expect([...stored.values()].some((p) => canonicalJson(p) === canonicalJson(pack))).toBe(true);
      }
      // The source save is untouched.
      const sourceAgain = await persistentRepo.load(sourceSaveId);
      expect(sourceAgain?.state.stateSha256).toBe(source.stateSha256);
      // A season-1 replay, whose pack is no longer embedded, still loads.
      const firstSeasonFixture = copy.completedSeasons[0]!.completedMatches.find(
        (m) => m.homeTeamId === copy.controlledTeamId || m.awayTeamId === copy.controlledTeamId,
      )!;
      const replay = await service.replayFixtureArchive(firstSeasonFixture.fixtureId);
      expect(replay.status).toBe("READY");
      // Play continues on the copy.
      const state = service.getState()!;
      const next = service.nextManagedFixture();
      if (next && state.careerState.currentDate >= next.matchDayDate) await service.simulateManagedFixture();
      else await service.advanceDay();
      expect(service.getPersistentState()!.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V5_VERSION);
    },
    900_000,
  );

  it(
    "copies a V4 career keeping its lifecycle, and refuses a V5 career",
    async () => {
      const { service } = newService("v4-forward");
      await service.boot();
      await service.createCareer(careerWorld.teams[1]!.teamId, null, {
        seed: "v4-forward", worldId: "world-v4-forward", careerId: "career-v4-forward", startDate: "2026-04-04",
        worldStateVersion: PERSISTENT_WORLD_STATE_V4_VERSION,
      });
      await playSeasonAndRollOver(service);
      const source = service.getPersistentState()!;
      if (source.worldStateVersion !== PERSISTENT_WORLD_STATE_V4_VERSION) throw new Error("expected V4");
      const copy = await service.copyForwardToWorldStateV5();
      expect(copy.lifecycle.lifecycleSha256).toBe(source.lifecycle.lifecycleSha256);
      expect(withoutVersionAndLifecycle(copy)).toBe(withoutVersionAndLifecycle(source));
      await expect(service.copyForwardToWorldStateV5()).rejects.toThrow("Only world state V3 or V4 careers");
    },
    600_000,
  );
});
