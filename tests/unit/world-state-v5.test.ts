import { beforeAll, describe, expect, it } from "vitest";
import {
  canonicalJson,
  PERSISTENT_WORLD_STATE_V4_VERSION,
  PERSISTENT_WORLD_STATE_V5_VERSION,
  PERSISTENT_WORLD_STATE_V6_VERSION,
  LIFECYCLE_SEASON_STATE_VERSION,
  LIFECYCLE_SEASON_STATE_V2_VERSION,
  PERSISTENT_WORLD_PORTABLE_V6_ARCHIVE_VERSION,
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
  readPersistentWorldPortableArchiveV6,
  persistentWorldStateV5StoredForm,
  recoverPersistentWorldCheckpoint,
  COMPLETED_SEASON_RECORD_SCOPE,
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

// docs/design/WORLD_STATE_V5_SEASON_REFS.md: world state V5 hashes and stores finished seasons by reference.


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

/** Plays the current season out and rolls over; returns the world just before the rollover. */
async function playSeasonAndRollOver(service: CareerApplicationService) {
  for (let guard = 0; guard < 400; guard++) {
    const state = service.getState()!;
    if (state.phase === "COMPLETE") break;
    const next = service.nextManagedFixture();
    if (next && state.careerState.currentDate >= next.matchDayDate) await service.simulateManagedFixture();
    else await service.advanceDay();
  }
  const beforeRollover = service.getPersistentState()!;
  await service.closeSeasonAndAdvance();
  return beforeRollover;
}

async function rowsFor(state: { completedSeasons: { seasonId: string }[] }) {
  return Promise.all(
    state.completedSeasons.map(async (record) => {
      const payload = canonicalJson(record);
      return { saveId: "s", scope: COMPLETED_SEASON_RECORD_SCOPE, key: record.seasonId, payload, sha256: await seasonSha256Text(payload) };
    }),
  );
}

describe("world state V5", () => {
  const options = { seed: "v5-seed", worldId: "world-v5", careerId: "career-v5", startDate: "2026-04-04" };
  let v4BeforeRollover: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  let v4: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  let v5BeforeRollover: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  let v6AfterRollover: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  /** A V5 career with a finished season: the V4 career copied forward, the route an older career takes into V5. */
  let v5: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  let v5Service: CareerApplicationService;

  beforeAll(async () => {
    const a = newService("v5-compare-v4");
    await a.service.boot();
    await a.service.createCareer(careerWorld.teams[0]!.teamId, null, { ...options, worldStateVersion: PERSISTENT_WORLD_STATE_V4_VERSION });
    v4BeforeRollover = await playSeasonAndRollOver(a.service);
    v4 = a.service.getPersistentState()!;
    const b = newService("v5-compare-v5");
    await b.service.boot();
    // New careers default to V6 (docs/pavilion/CAREER_FIXTURE_POLICY_V2.md); an existing V5 career is created as V5.
    await b.service.createCareer(careerWorld.teams[0]!.teamId, null, { ...options, worldStateVersion: PERSISTENT_WORLD_STATE_V5_VERSION });
    v5BeforeRollover = await playSeasonAndRollOver(b.service);
    v6AfterRollover = b.service.getPersistentState()!;
    await a.service.copyForwardToWorldStateV5();
    v5 = a.service.getPersistentState()!;
    v5Service = a.service;
  }, 600_000);

  it("plays its season exactly as V4", () => {
    expect(v5BeforeRollover.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V5_VERSION);
    expect(v4BeforeRollover.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V4_VERSION);
    expect(v5BeforeRollover.currentSeason.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_VERSION);
    // Everything but the version and the state hash is the same.
    const { worldStateVersion: _a, stateSha256: hash4, ...rest4 } = v4BeforeRollover;
    const { worldStateVersion: _b, stateSha256: hash5, ...rest5 } = v5BeforeRollover;
    void _a; void _b;
    expect(canonicalJson(rest5)).toBe(canonicalJson(rest4));
    expect(hash5).not.toBe(hash4);
  });

  it("becomes world state V6 when it starts its next season, its finished season unchanged", () => {
    // Owner decision, 25 November 2026: a V5 career moves to V6 at rollover; V4 stays V4.
    expect(v4.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V4_VERSION);
    expect(v6AfterRollover.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V6_VERSION);
    expect(v6AfterRollover.currentSeason.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_V2_VERSION);
    expect(v4.currentSeason.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_VERSION);
    expect(canonicalJson(v6AfterRollover.completedSeasons)).toBe(canonicalJson(v4.completedSeasons));
    expect(v6AfterRollover.completedSeasons[0]!.finalSeasonStateSha256).toBe(v5BeforeRollover.currentSeason.stateSha256);
    // The new season differs from V4's only in its version (and so its hash).
    const strip = (season: typeof v4.currentSeason) => {
      const { seasonStateVersion: _v, stateSha256: _h, ...rest } = season;
      void _v; void _h;
      return rest;
    };
    expect(canonicalJson(strip(v6AfterRollover.currentSeason))).toBe(canonicalJson(strip(v4.currentSeason)));
    if ("lifecycle" in v6AfterRollover && "lifecycle" in v4 && "economy" in v6AfterRollover && "economy" in v4) {
      expect(canonicalJson(v6AfterRollover.lifecycle)).toBe(canonicalJson(v4.lifecycle));
      expect(canonicalJson(v6AfterRollover.economy)).toBe(canonicalJson(v4.economy));
    } else throw new Error("expected economy worlds");
  });

  it("copied forward from V4 is V5 with the same seasons", () => {
    expect(v5.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V5_VERSION);
    expect(v5.completedSeasons).toHaveLength(1);
    const { worldStateVersion: _a, stateSha256: hash4, ...rest4 } = v4;
    const { worldStateVersion: _b, stateSha256: hash5, ...rest5 } = v5;
    void _a; void _b;
    expect(canonicalJson(rest5)).toBe(canonicalJson(rest4));
    expect(hash5).not.toBe(hash4);
  });

  it("binds each finished season by its record hash", async () => {
    const copy = structuredClone(v5);
    expect((await validateAnyPersistentWorldState(copy)).stateSha256).toBe(v5.stateSha256);
    // Editing a season without fixing its record hash is refused by the season check.
    const edited = structuredClone(v5);
    edited.completedSeasons[0]!.championTeamId = edited.completedSeasons[0]!.runnerUpTeamId;
    await expect(validateAnyPersistentWorldState(edited)).rejects.toThrow("COMPLETED_SEASON_RECORD_HASH_MISMATCH");
    // Swapping the state hash is refused by the state check.
    const rehashed = { ...structuredClone(v5), stateSha256: v4.stateSha256 };
    await expect(validateAnyPersistentWorldState(rehashed)).rejects.toThrow("STATE_V5_HASH_MISMATCH");
  });

  it("stores finished seasons as references and rebuilds them from their rows", async () => {
    if (v5.worldStateVersion !== PERSISTENT_WORLD_STATE_V5_VERSION) throw new Error("expected V5");
    const stored = canonicalJson(persistentWorldStateV5StoredForm(v5));
    expect(stored.length).toBeLessThan(canonicalJson(v5).length - canonicalJson(v5.completedSeasons).length + 1000);
    const row = { saveId: "s", generation: 0, checkpointSerial: 0, revision: v5.revision, payload: stored, sha256: await seasonSha256Text(stored), createdAt: "2026-11-16T00:00:00.000Z" };
    const rows = await rowsFor(v5);
    const recovered = await recoverPersistentWorldCheckpoint([row], 0, rows);
    expect(recovered.state.stateSha256).toBe(v5.stateSha256);
    expect(canonicalJson(recovered.state)).toBe(canonicalJson(v5));
    // A missing or damaged season row makes the checkpoint unusable.
    await expect(recoverPersistentWorldCheckpoint([row], 0, [])).rejects.toThrow("SEASON_SAVE_CORRUPT_NO_VALID_CHECKPOINT");
    const damaged = rows.map((r) => ({ ...r, payload: r.payload.replace(r.key, r.key + "x") }));
    await expect(recoverPersistentWorldCheckpoint([row], 0, damaged)).rejects.toThrow("SEASON_SAVE_CORRUPT_NO_VALID_CHECKPOINT");
  });

  it("exports as a self-contained V6 archive that older readers refuse, and imports unchanged", async () => {
    const bytes = await v5Service.exportCareer();
    expect(peekPortableArchiveVersion(bytes)).toBe(PERSISTENT_WORLD_PORTABLE_V6_ARCHIVE_VERSION);
    await expect(readPersistentWorldPortableArchiveV5(bytes)).rejects.toThrow();
    await expect(readPersistentWorldPortableArchiveV4(bytes)).rejects.toThrow();
    const read = await readPersistentWorldPortableArchiveV6(bytes);
    expect(read.state.stateSha256).toBe(v5.stateSha256);
    const { service: importer } = newService("v5-import");
    await importer.boot();
    await importer.importCareer(bytes);
    expect(importer.getPersistentState()!.stateSha256).toBe(v5.stateSha256);
  }, 120_000);
});
