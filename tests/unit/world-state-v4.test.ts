import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS,
  PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION,
  PERSISTENT_WORLD_PORTABLE_V5_ARCHIVE_VERSION,
  PERSISTENT_WORLD_STATE_V3_VERSION,
  PERSISTENT_WORLD_STATE_V4_VERSION,
  PLAYER_LIFECYCLE_STATE_V2_VERSION,
  PLAYER_LIFECYCLE_STATE_VERSION,
  PlayerLifecycleStateV2CoreSchema,
  StagedRosterPackSchema,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type StagedRosterPack,
} from "@lcxxvi/contracts";
import {
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchiveV4,
  readPersistentWorldPortableArchiveV5,
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
  derivePersistentWorldIdentity,
  runSquadEconomyDiagnosticHorizonAsync,
} from "@lcxxvi/simulation";
import {
  CareerApplicationService,
  careerWorld,
  type CareerPersistentWorldRepository,
  type CareerSeasonRepository,
} from "../../apps/web/src/career/service.js";

// docs/design/WORLD_STATE_HISTORY_V4.md: world state V4 embeds at most two roster packs; every pack is
// also a stored row, and the V5 export carries all of them.


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
    if (state.worldStateVersion === PERSISTENT_WORLD_STATE_V4_VERSION && input.expectedRevision === null) {
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

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function newService(owner: string) {
  const seasonRepo = new InMemorySeasonRepo();
  const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
  return { service: new CareerApplicationService(owner, seasonRepo, undefined, persistentRepo), persistentRepo };
}

describe("world state V4", () => {
  it("refuses a lifecycle V2 state embedding more than two roster packs", async () => {
    const { service } = newService("v4-schema");
    await service.boot();
    await service.createCareer(careerWorld.teams[0]!.teamId, null, { seed: "v4-schema", worldId: "world-v4-schema" });
    const world = service.getPersistentState()!;
    expect(world.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V4_VERSION);
    if (world.worldStateVersion !== PERSISTENT_WORLD_STATE_V4_VERSION) throw new Error("expected V4");
    const { lifecycleSha256: _sha, ...core } = world.lifecycle;
    void _sha;
    const pack = world.lifecycle.activeRosterPack!;
    expect(PlayerLifecycleStateV2CoreSchema.safeParse(core).success).toBe(true);
    const tooMany = { ...core, historicalRosterPacks: Array.from({ length: MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS + 1 }, () => pack) };
    expect(PlayerLifecycleStateV2CoreSchema.safeParse(tooMany).success).toBe(false);
  });

  it(
    "keeps at most two embedded packs across rollovers and plays out exactly as lifecycle V1",
    async () => {
      const worldIdentity = derivePersistentWorldIdentity({
        worldId: "world-v4-horizon",
        baseSeed: "seed-world-v4-horizon",
        originKind: "NEW_PERSISTENT_CAREER",
      });
      const input = { worldIdentity, baseWorld: careerWorld, seasons: 3, startCalendarYear: 2026 };
      const v1 = await runSquadEconomyDiagnosticHorizonAsync(input, yieldToEventLoop);
      const v2 = await runSquadEconomyDiagnosticHorizonAsync(
        { ...input, lifecycleVersion: PLAYER_LIFECYCLE_STATE_V2_VERSION },
        yieldToEventLoop,
      );
      expect(v1.finalLifecycle.lifecycleVersion).toBe(PLAYER_LIFECYCLE_STATE_VERSION);
      expect(v2.finalLifecycle.lifecycleVersion).toBe(PLAYER_LIFECYCLE_STATE_V2_VERSION);
      expect(v1.finalLifecycle.historicalRosterPacks.length).toBeGreaterThan(MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS);
      expect(v2.finalLifecycle.historicalRosterPacks.length).toBeLessThanOrEqual(MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS);
      // The embedded packs are the most recent ones, in order.
      expect(canonicalJson(v2.finalLifecycle.historicalRosterPacks)).toBe(
        canonicalJson(v1.finalLifecycle.historicalRosterPacks.slice(-MAX_LIFECYCLE_V2_EMBEDDED_ROSTER_PACKS)),
      );
      // Same players, same economy: only the embedded history differs.
      expect(canonicalJson(v2.finalLifecycle.activeWorld)).toBe(canonicalJson(v1.finalLifecycle.activeWorld));
      expect(canonicalJson(v2.finalLifecycle.activeRosterPack)).toBe(canonicalJson(v1.finalLifecycle.activeRosterPack));
      expect(v2.finalEconomy.economySha256).toBe(v1.finalEconomy.economySha256);
      expect(v2.snapshots).toEqual(v1.snapshots);
    },
    180_000,
  );

  it("exports a V4 world as a V5 archive that older readers refuse, and imports it unchanged", async () => {
    const { service } = newService("v4-export");
    await service.boot();
    await service.createCareer(careerWorld.teams[2]!.teamId, null, { seed: "v4-export", worldId: "world-v4-export" });
    const before = service.getPersistentState()!;
    const bytes = await service.exportCareer();
    expect(peekPortableArchiveVersion(bytes)).toBe(PERSISTENT_WORLD_PORTABLE_V5_ARCHIVE_VERSION);
    await expect(readPersistentWorldPortableArchiveV4(bytes)).rejects.toThrow();
    const read = await readPersistentWorldPortableArchiveV5(bytes);
    expect(read.state.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V4_VERSION);
    expect(read.seasonRosterPacks.length).toBeGreaterThanOrEqual(1);

    const { service: importer, persistentRepo } = newService("v4-import");
    await importer.boot();
    await importer.importCareer(bytes);
    const after = importer.getPersistentState()!;
    expect(after.stateSha256).toBe(before.stateSha256);
    const stored = await persistentRepo.loadLifecycleRosterPacks(importer.getSaveId()!);
    expect(stored.size).toBe(read.seasonRosterPacks.length);
  });

  it("still creates, exports and reads V3 worlds when asked", async () => {
    const { service } = newService("v3-compat");
    await service.boot();
    await service.createCareer(careerWorld.teams[3]!.teamId, null, {
      seed: "v3-compat",
      worldId: "world-v3-compat",
      worldStateVersion: PERSISTENT_WORLD_STATE_V3_VERSION,
    });
    expect(service.getPersistentState()!.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V3_VERSION);
    const bytes = await service.exportCareer();
    expect(peekPortableArchiveVersion(bytes)).toBe(PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION);
    await expect(readPersistentWorldPortableArchiveV5(bytes)).rejects.toThrow();
    const read = await readPersistentWorldPortableArchiveV4(bytes);
    expect(read.state.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V3_VERSION);
  });
});
