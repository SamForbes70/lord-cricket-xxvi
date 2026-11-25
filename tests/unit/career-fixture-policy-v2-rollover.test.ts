import { beforeAll, describe, expect, it } from "vitest";
import {
  canonicalJson,
  LIFECYCLE_SEASON_STATE_VERSION,
  LIFECYCLE_SEASON_STATE_V2_VERSION,
  PERSISTENT_WORLD_STATE_V4_VERSION,
  PERSISTENT_WORLD_STATE_V5_VERSION,
  PERSISTENT_WORLD_STATE_V6_VERSION,
  PERSISTENT_WORLD_PORTABLE_V7_ARCHIVE_VERSION,
  PersistentWorldStateV5Schema,
  PersistentWorldStateV6Schema,
  StagedRosterPackSchema,
  type LifecycleSeasonState,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type StagedRosterPack,
  type T20TeamSelection,
} from "@lcxxvi/contracts";
import {
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchiveV6,
  readPersistentWorldPortableArchiveV7,
  persistentWorldStateV6StoredForm,
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
  advanceRosterCareerDay,
  selectRosterFixtureTeams,
  selectRosterFixtureTeamsV2,
  simulateRosterOffscreenFixture,
  simulateRosterOffscreenFixtureV2,
} from "@lcxxvi/simulation";
import {
  CareerApplicationService,
  careerWorld,
  type CareerPersistentWorldRepository,
  type CareerSeasonRepository,
} from "../../apps/web/src/career/service.js";

// Career fixture policy V2 (docs/pavilion/CAREER_FIXTURE_POLICY_V2.md): an existing V5 career keeps fixture policy V1
// for the season it is in, and starts using V2 from its next season, which it begins as world state V6.

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



/** Plays the current season out and rolls over; returns the world just before the rollover. */

type MatchDayView = { matchDayTeams(state: unknown, fixtureId: string): readonly [T20TeamSelection, T20TeamSelection] };

async function playOut(service: CareerApplicationService) {
  for (let guard = 0; guard < 400; guard++) {
    const state = service.getState()!;
    if (state.phase === "COMPLETE") return;
    const next = service.nextManagedFixture();
    if (next && state.careerState.currentDate >= next.matchDayDate) await service.simulateManagedFixture();
    else await service.advanceDay();
  }
  throw new Error("season did not finish");
}

/**
 * What the next round's first computer fixture must be under each policy, worked out independently of the service from
 * the saved season: advance the saved career date to the round's day as the service does, then run the fixture.
 */
function expectedNextRoundOutcomes(service: CareerApplicationService) {
  const season = service.getState()! as LifecycleSeasonState;
  const pack = service.getLifecycleState()!.activeRosterPack!;
  const target = service.nextManagedFixture()!;
  const done = new Set(season.completedMatches.map((m) => m.fixtureId));
  const first = season.schedule.fixtures
    .filter((f) => f.roundNumber === target.roundNumber && f.fixtureId !== target.fixtureId && !done.has(f.fixtureId))
    .sort((a, b) => (a.fixtureId < b.fixtureId ? -1 : 1))[0]!;
  let careerState = season.careerState;
  while (careerState.currentDate < first.matchDayDate) careerState = advanceRosterCareerDay(careerState, season.schedule, pack);
  return {
    fixtureId: first.fixtureId,
    v1: simulateRosterOffscreenFixture(pack, season.schedule, careerState, first.fixtureId).outcome,
    v2: simulateRosterOffscreenFixtureV2(pack, season.schedule, careerState, first.fixtureId).outcome,
    v1Teams: selectRosterFixtureTeams(pack, season.schedule, careerState, first.fixtureId),
    v2Teams: selectRosterFixtureTeamsV2(pack, season.schedule, careerState, first.fixtureId),
  };
}

function completionOf(service: CareerApplicationService, fixtureId: string) {
  return service.getState()!.completedMatches.find((m) => m.fixtureId === fixtureId)!;
}

describe("career fixture policy V2 across a V5 career's rollover", () => {
  const owner = "policy-v2-owner";
  const options = { seed: "policy-v2-seed", worldId: "world-policy-v2", careerId: "career-policy-v2", startDate: "2026-04-04" };
  let seasonRepo: InMemorySeasonRepo;
  let persistentRepo: InMemoryPersistentWorldRepo;
  let saveId: string;
  let season1Round1: ReturnType<typeof expectedNextRoundOutcomes>;
  let season1Late: ReturnType<typeof expectedNextRoundOutcomes>;
  let season2Round1: ReturnType<typeof expectedNextRoundOutcomes>;
  let v5Final: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  let v6: NonNullable<ReturnType<CareerApplicationService["getPersistentState"]>>;
  let resumed: CareerApplicationService;
  let firstServiceSeasonFixtureId: string;

  beforeAll(async () => {
    seasonRepo = new InMemorySeasonRepo();
    persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
    const first = new CareerApplicationService(owner, seasonRepo, undefined, persistentRepo);
    await first.boot();
    // An existing V5 career, exactly as the previous build created them.
    await first.createCareer(careerWorld.teams[0]!.teamId, null, { ...options, worldStateVersion: PERSISTENT_WORLD_STATE_V5_VERSION });
    saveId = first.getSaveId()!;
    season1Round1 = expectedNextRoundOutcomes(first);
    await first.simulateManagedFixture();
    firstServiceSeasonFixtureId = season1Round1.fixtureId;
    await first.releaseWriter();

    // Load the saved V5 career in a new session part-way through its season and finish the season there.
    resumed = new CareerApplicationService(owner, seasonRepo, undefined, persistentRepo);
    await resumed.boot();
    await resumed.loadCareer(saveId);
    for (let round = 0; round < 6; round++) await resumed.simulateManagedFixture();
    season1Late = expectedNextRoundOutcomes(resumed);
    await playOut(resumed);
    v5Final = resumed.getPersistentState()!;
    await resumed.closeSeasonAndAdvance();
    v6 = resumed.getPersistentState()!;
    season2Round1 = expectedNextRoundOutcomes(resumed);
    await resumed.simulateManagedFixture();
  }, 600_000);

  it("loads the V5 career and finishes its current season under policy V1", () => {
    expect(v5Final.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V5_VERSION);
    expect(v5Final.currentSeason.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_VERSION);
    expect(v5Final.currentSeason.completedMatches).toHaveLength(56);
    const season1 = v5Final.currentSeason.completedMatches;
    for (const expected of [season1Round1, season1Late]) {
      const done = season1.find((m) => m.fixtureId === expected.fixtureId)!;
      // The fixture the service ran is the V1 fixture, byte for byte, and not the V2 one.
      expect(done.sourceCompletionSha256).toBe(expected.v1.outcomeSha256);
      expect(done.sourceCompletionSha256).not.toBe(expected.v2.outcomeSha256);
      expect(done.selectedTeams).toEqual(expected.v1.selectedTeams);
      expect(expected.v1.selectedTeams).toEqual(expected.v1Teams);
    }
    expect(firstServiceSeasonFixtureId).toBe(season1Round1.fixtureId);
  });

  it("replays finished fixtures from their archives: V1 from the finished season, V2 from the new one", async () => {
    const v1Replay = await resumed.replayFixtureArchive(season1Round1.fixtureId);
    expect(v1Replay.status).toBe("READY");
    const v2Replay = await resumed.replayFixtureArchive(season2Round1.fixtureId);
    expect(v2Replay.status).toBe("READY");
  });

  it("starts the next season as world state V6 with policy V2, finished season unchanged", () => {
    expect(v6.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V6_VERSION);
    expect(v6.currentSeason.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_V2_VERSION);
    expect(v6.completedSeasons).toHaveLength(1);
    expect(v6.completedSeasons[0]!.finalSeasonStateSha256).toBe(v5Final.currentSeason.stateSha256);
    expect(canonicalJson(v6.completedSeasons[0]!.completedMatches)).toBe(canonicalJson(v5Final.currentSeason.completedMatches));
  });

  it("runs the new season's computer fixtures and match-day XI under policy V2", () => {
    const done = completionOf(resumed, season2Round1.fixtureId);
    expect(done.sourceCompletionSha256).toBe(season2Round1.v2.outcomeSha256);
    expect(done.sourceCompletionSha256).not.toBe(season2Round1.v1.outcomeSha256);
    expect(done.selectedTeams).toEqual(season2Round1.v2Teams);
    expect(season2Round1.v2Teams).not.toEqual(season2Round1.v1Teams);
    // The user's own match-day XI comes from the same policy.
    const state = resumed.getState()!;
    const next = resumed.nextManagedFixture();
    if (next && state.careerState.currentDate === next.matchDayDate) {
      const teams = (resumed as unknown as MatchDayView).matchDayTeams(state, next.fixtureId);
      const pack = resumed.getLifecycleState()!.activeRosterPack!;
      expect(teams).toEqual(selectRosterFixtureTeamsV2(pack, state.schedule as never, state.careerState as never, next.fixtureId));
    }
  });

  it("saves, reloads and exports the V6 career", async () => {
    const loaded = await persistentRepo.load(saveId);
    expect(loaded!.state.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V6_VERSION);
    const bytes = await resumed.exportCareer();
    expect(peekPortableArchiveVersion(bytes)).toBe(PERSISTENT_WORLD_PORTABLE_V7_ARCHIVE_VERSION);
    await expect(readPersistentWorldPortableArchiveV6(bytes)).rejects.toThrow();
    const read = await readPersistentWorldPortableArchiveV7(bytes);
    expect(read.state.stateSha256).toBe(resumed.getPersistentState()!.stateSha256);
    const importRepo = new InMemoryPersistentWorldRepo(new InMemorySeasonRepo());
    const importer = new CareerApplicationService("policy-v2-import", new InMemorySeasonRepo(), undefined, importRepo);
    await importer.boot();
    await importer.importCareer(bytes);
    expect(importer.getPersistentState()!.stateSha256).toBe(resumed.getPersistentState()!.stateSha256);
  }, 120_000);

  it("stores finished seasons by reference, as V5 does", async () => {
    if (v6.worldStateVersion !== PERSISTENT_WORLD_STATE_V6_VERSION) throw new Error("expected V6");
    const stored = canonicalJson(persistentWorldStateV6StoredForm(v6));
    const row = { saveId: "s", generation: 0, checkpointSerial: 0, revision: v6.revision, payload: stored, sha256: await seasonSha256Text(stored), createdAt: "2026-11-25T00:00:00.000Z" };
    const rows = await Promise.all(v6.completedSeasons.map(async (record) => {
      const payload = canonicalJson(record);
      return { saveId: "s", scope: COMPLETED_SEASON_RECORD_SCOPE, key: record.seasonId, payload, sha256: await seasonSha256Text(payload) };
    }));
    const recovered = await recoverPersistentWorldCheckpoint([row], 0, rows);
    expect(canonicalJson(recovered.state)).toBe(canonicalJson(v6));
  });

  it("keeps each world version to its own season versions", () => {
    // V6 refuses a policy V1 season; V5 refuses a policy V2 season. Neither schema was widened.
    const v6WithV1Season = { ...structuredClone(v6), currentSeason: { ...structuredClone(v6.currentSeason), seasonStateVersion: LIFECYCLE_SEASON_STATE_VERSION } };
    expect(PersistentWorldStateV6Schema.safeParse(v6WithV1Season).success).toBe(false);
    const v5WithV2Season = { ...structuredClone(v5Final), currentSeason: { ...structuredClone(v5Final.currentSeason), seasonStateVersion: LIFECYCLE_SEASON_STATE_V2_VERSION } };
    expect(PersistentWorldStateV5Schema.safeParse(v5WithV2Season).success).toBe(false);
    expect(PersistentWorldStateV5Schema.safeParse(v5Final).success).toBe(true);
  });

  it("starts a new career on world state V6 with a policy V2 first season; V4 stays V4", async () => {
    const svc = new CareerApplicationService("policy-v2-new", new InMemorySeasonRepo(), undefined, new InMemoryPersistentWorldRepo(new InMemorySeasonRepo()));
    await svc.boot();
    await svc.createCareer(careerWorld.teams[1]!.teamId, null, { seed: "policy-v2-new", worldId: "world-policy-v2-new", careerId: "career-policy-v2-new" });
    expect(svc.getPersistentState()!.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V6_VERSION);
    expect(svc.getState()!.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_V2_VERSION);
    const old = new CareerApplicationService("policy-v2-v4", new InMemorySeasonRepo(), undefined, new InMemoryPersistentWorldRepo(new InMemorySeasonRepo()));
    await old.boot();
    await old.createCareer(careerWorld.teams[1]!.teamId, null, { seed: "policy-v2-v4", worldId: "world-policy-v2-v4", careerId: "career-policy-v2-v4", worldStateVersion: PERSISTENT_WORLD_STATE_V4_VERSION });
    expect(old.getState()!.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_VERSION);
  });
});
