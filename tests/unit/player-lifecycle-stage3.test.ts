import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION,
  LIFECYCLE_SEASON_STATE_VERSION,
  PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION,
  PERSISTENT_WORLD_STATE_V2_VERSION,
  PERSISTENT_WORLD_STATE_VERSION,
  PLAYER_LIFECYCLE_MODEL_VERSION,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
} from "@lcxxvi/contracts";
import {
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchiveV2,
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
  runPlayerLifecycleDiagnosticHorizon,
} from "@lcxxvi/simulation";
import {
  CareerApplicationService,
  careerWorld,
  type CareerPersistentWorldRepository,
  type CareerSeasonRepository,
} from "../../apps/web/src/career/service.js";

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
  async commit(
    input: SeasonDurableCommit,
  ): Promise<SeasonSaveSummary> {
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
      generations: [{ serial, generation, stateJson, sha256, revision: state.revision, createdAt: input.updatedAt }],
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
      (a): a is Extract<AnyCareerMatchEventArchive, { archiveVersion: "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1" }> =>
        a.archiveVersion === "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1",
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
    generations.push({ serial, generation, stateJson, sha256, revision: state.revision, createdAt: input.updatedAt });
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
      currentGeneration: slot.currentSerial % 3,
      currentSerial: slot.currentSerial,
      validGenerations: [],
      corruptedGenerations: [],
    };
  }
  async loadGeneration(saveId: string): Promise<PersistentWorldLoadResult> {
    return (await this.load(saveId))!;
  }
}

async function simulateFullSeason(service: CareerApplicationService) {
  for (let guard = 0; guard < 120; guard++) {
    const state = service.getState();
    if (!state || state.phase === "COMPLETE") break;
    const next = service.nextManagedFixture();
    if (!next) break;
    if (state.careerState.currentDate < next.matchDayDate) {
      await service.simulateToNextUserFixture();
    } else {
      await service.simulateManagedFixture();
    }
  }
  const done = service.getState()!;
  expect(done.phase).toBe("COMPLETE");
  expect(done.completedMatches).toHaveLength(56);
  return done;
}

describe("Stage 3 player lifecycle and youth pathway", () => {
  it(
    "protects skill development from repeated-menu exploits and separates temporary readiness from permanent off-season progression",
    async () => {
      const seasonRepoA = new InMemorySeasonRepo();
      const persistentRepoA = new InMemoryPersistentWorldRepo(seasonRepoA);
      const serviceA = new CareerApplicationService("owner-a", seasonRepoA, undefined, persistentRepoA);

      const seasonRepoB = new InMemorySeasonRepo();
      const persistentRepoB = new InMemoryPersistentWorldRepo(seasonRepoB);
      const serviceB = new CareerApplicationService("owner-b", seasonRepoB, undefined, persistentRepoB);

      const opts = {
        saveId: "pworld-exploit-check",
        careerId: "career-stage3-antiexploit",
        worldId: "world-stage3-antiexploit",
        seed: "seed-stage3-antiexploit",
        startDate: "2026-04-04",
      };
      await serviceA.createCareer("team-01", null, opts);
      await serviceB.createCareer("team-01", null, opts);

      const targetPlayer = serviceA.squadView()!.players[0]!.playerId;
      const baseSkillBefore = serviceA
        .getWorld()
        .players.find((p) => p.playerId === targetPlayer)!.skills.T20.timing;

      // Service A sets BATTING_PRACTICE once on 2026-04-04.
      await serviceA.setTraining(targetPlayer, "BATTING_PRACTICE");
      const prospectA = serviceA.managedYouthAcademyProspects()[0]!;
      await serviceA.setYouthProspectFocus(prospectA.prospectId, "BATTING_PRACTICE");

      // Service B spams menu toggles repeatedly on the exact same calendar day without advancing days,
      // ending on the exact same final selections.
      for (let i = 0; i < 6; i++) {
        await serviceB.setTraining(targetPlayer, "BOWLING_PRACTICE");
        await serviceB.setTraining(targetPlayer, "FIELDING_PRACTICE");
        await serviceB.setTraining(targetPlayer, "REST");
        await serviceB.setTraining(targetPlayer, "BATTING_PRACTICE");
        await serviceB.setYouthProspectFocus(prospectA.prospectId, "BOWLING_PRACTICE");
        await serviceB.setYouthProspectFocus(prospectA.prospectId, "BATTING_PRACTICE");
      }

      // Base permanent skill has NOT changed mid-season (only temporary readiness changes as days elapse)
      expect(
        serviceB.getWorld().players.find((p) => p.playerId === targetPlayer)!.skills.T20.timing,
      ).toBe(baseSkillBefore);

      // Exposure ledgers on both services remain 0 before any day advances!
      expect(serviceB.getLifecycleState()!.seasonTrainingExposure).toEqual(
        serviceA.getLifecycleState()!.seasonTrainingExposure,
      );

      // Advance to first match day on both services: accrued exposure and readiness are 100% identical!
      await serviceA.simulateToNextUserFixture();
      await serviceB.simulateToNextUserFixture();
      expect(serviceB.getLifecycleState()!.lifecycleSha256).toBe(
        serviceA.getLifecycleState()!.lifecycleSha256,
      );
      expect(serviceB.playerCondition(targetPlayer)).toEqual(serviceA.playerCondition(targetPlayer));
    },
    30_000,
  );

  it(
    "supports pre-season youth promotion, off-season ageing/development/retirement, preserved retired player records, and V2 .lcxxvi archive replay",
    async () => {
      // In unmodified careerWorld, p121 (born 1987-01-08) is age 40 in 2027 and hits MANDATORY_AGE_LIMIT (41) at close of 2027 season.
      const veteranId = "p121";
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService("owner-s3", seasonRepo, undefined, persistentRepo);

      await service.createCareer("team-01", null, {
        saveId: "pworld-stage3-main",
        careerId: "career-stage3-main",
        worldId: "world-stage3-main",
        seed: "seed-stage3-main",
        startDate: "2027-04-03",
      });

      const veteranDob = careerWorld.players.find((p) => p.playerId === veteranId)!.birthDate;
      expect(service.getPersistentState()?.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V2_VERSION);
      expect(service.getLifecycleState()?.model.modelVersion).toBe(PLAYER_LIFECYCLE_MODEL_VERSION);
      expect(service.playerAge(veteranDob)).toBe(40);

      // Pre-season promotion of one academy prospect before Round 1
      const prospectsBefore = service.managedYouthAcademyProspects();
      expect(prospectsBefore).toHaveLength(3);
      const promotedProspect = prospectsBefore[0]!;
      await service.promoteYouthProspectNow(promotedProspect.prospectId);

      expect(service.managedYouthAcademyProspects()).toHaveLength(2);
      expect(service.getState()?.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_VERSION);
      expect(service.squadView()?.players.some((p) => p.playerId === promotedProspect.player.playerId)).toBe(
        true,
      );

      // Queue second prospect for off-season graduation
      const queuedProspect = service.managedYouthAcademyProspects()[0]!;
      await service.setYouthProspectQueue(queuedProspect.prospectId, true);

      // Once Round 1 begins, direct in-season promotion is rejected
      await service.simulateToNextUserFixture();
      await service.simulateManagedFixture();
      await expect(
        service.promoteYouthProspectNow(service.managedYouthAcademyProspects()[1]!.prospectId),
      ).rejects.toThrow(/before the first fixture of the season/);

      // Finish Season 1 and close into Season 2
      const completedS1 = await simulateFullSeason(service);
      const s1FixtureId = completedS1.completedMatches[0]!.fixtureId;

      const rollover = await service.closeSeasonAndAdvance(completedS1.seasonId);
      expect(rollover.idempotentReplay).toBe(false);
      const s2World = service.getPersistentState()!;
      expect(s2World.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V2_VERSION);
      expect(s2World.currentSeasonNumber).toBe(2);
      expect(s2World.currentCalendarYear).toBe(2028);
      expect(s2World.currentSeason.seasonStateVersion).toBe(LIFECYCLE_SEASON_STATE_VERSION);

      // Repeat close is idempotent
      const repeatRollover = await service.closeSeasonAndAdvance(completedS1.seasonId);
      expect(repeatRollover.idempotentReplay).toBe(true);
      expect(repeatRollover.state.stateSha256).toBe(s2World.stateSha256);

      // Veteran retired at age 41 and remains discoverable with career stats & skill ledger!
      const transition = service.latestLifecycleTransition()!;
      expect(transition.fromSeasonNumber).toBe(1);
      expect(transition.toSeasonNumber).toBe(2);
      expect(transition.retiredPlayerIds).toContain(veteranId);
      expect(transition.promotedYouthIds).toContain(queuedProspect.player.playerId);
      expect(transition.generatedYouthIds).toHaveLength(24); // 3 fresh academy prospects * 8 clubs

      const resolvedRetired = service.findPlayerIncludingRetired(veteranId);
      expect(resolvedRetired).not.toBeNull();
      expect(resolvedRetired?.retired?.retirementReason).toBe("MANDATORY_AGE_LIMIT");
      expect(resolvedRetired?.retired?.retiredAfterSeasonNumber).toBe(1);
      expect(service.playerLifecycleLedgerEntry(veteranId)).not.toBeNull();

      // Replay of Season 1 lifecycle match event archive resolves cleanly without recomputing
      const replayS1 = await service.replayFixtureArchive(s1FixtureId);
      expect(replayS1.status).toBe("READY");
      if (replayS1.status === "READY") {
        expect(replayS1.archive.archiveVersion).toBe(LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION);
      }

      // Simulate 1 fixture in Season 2 with the graduated youth roster, export V2 .lcxxvi, and import into fresh repo
      await service.simulateToNextUserFixture();
      await service.simulateManagedFixture();
      const s2FixtureId = service.getState()!.completedMatches[0]!.fixtureId;

      const archiveBytes = await service.exportCareer();
      expect(peekPortableArchiveVersion(archiveBytes)).toBe(
        PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION,
      );
      const parsedV2 = await readPersistentWorldPortableArchiveV2(archiveBytes);
      expect(parsedV2.state.stateSha256).toBe(service.getPersistentState()!.stateSha256);

      const freshSeasonRepo = new InMemorySeasonRepo();
      const freshPersistentRepo = new InMemoryPersistentWorldRepo(freshSeasonRepo);
      const freshService = new CareerApplicationService(
        "owner-fresh-v2",
        freshSeasonRepo,
        undefined,
        freshPersistentRepo,
      );
      await freshService.importCareer(archiveBytes);
      expect(freshService.getPersistentState()?.stateSha256).toBe(
        service.getPersistentState()?.stateSha256,
      );
      expect(freshService.findPlayerIncludingRetired(veteranId)?.retired?.ageAtRetirement).toBe(41);
      expect((await freshService.replayFixtureArchive(s1FixtureId)).status).toBe("READY");
      expect((await freshService.replayFixtureArchive(s2FixtureId)).status).toBe("READY");
    },
    120_000,
  );

  it("explicitly upgrades a Stage 2 V1 persistent save into Stage 3 V2 in a new slot while keeping V1 untouched", async () => {
    const seasonRepo = new InMemorySeasonRepo();
    const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
    const service = new CareerApplicationService("owner-upg", seasonRepo, undefined, persistentRepo);

    await service.createCareer("team-02", null, {
      saveId: "pworld-v1-source",
      careerId: "career-v1-src",
      worldId: "world-v1-src",
      seed: "seed-v1-src",
      startDate: "2026-04-04",
      worldStateVersion: PERSISTENT_WORLD_STATE_VERSION,
    });
    const originalV1Sha = service.getPersistentState()!.stateSha256;
    expect(service.getPersistentState()!.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_VERSION);
    expect(service.getLifecycleState()).toBeNull();

    const upgraded = await service.upgradeStage2V1ToStage3V2("Upgraded Stage 3 Career");
    expect(upgraded.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V2_VERSION);
    expect(service.getLifecycleState()?.youthAcademy).toHaveLength(24);

    // Original V1 slot remains completely untouched in storage!
    const reloadedV1 = await persistentRepo.load("pworld-v1-source");
    expect(reloadedV1?.state.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_VERSION);
    expect(reloadedV1?.state.stateSha256).toBe(originalV1Sha);
  });

  it(
    "simulates a 20-season player lifecycle diagnostic horizon with balanced ability distributions, squad supply, and zero role shortages",
    () => {
      const worldIdentity = derivePersistentWorldIdentity({
        worldId: "diag-world-20s",
        baseSeed: "diag-seed-stage3-20-seasons",
        originKind: "NEW_PERSISTENT_CAREER",
      });

      const reportA = runPlayerLifecycleDiagnosticHorizon({
        worldIdentity,
        baseWorld: careerWorld,
        seasons: 20,
        startCalendarYear: 2026,
        startDate: "2026-04-04",
        controlledTeamId: "team-01",
      });
      const reportB = runPlayerLifecycleDiagnosticHorizon({
        worldIdentity,
        baseWorld: careerWorld,
        seasons: 20,
        startCalendarYear: 2026,
        startDate: "2026-04-04",
        controlledTeamId: "team-01",
      });

      // 100% deterministic across runs
      expect(reportB.finalLifecycle.lifecycleSha256).toBe(reportA.finalLifecycle.lifecycleSha256);
      expect(reportB.snapshots).toEqual(reportA.snapshots);
      expect(reportA.snapshots).toHaveLength(20);
      expect(reportA.finalLifecycle.model.modelVersion).toBe(PLAYER_LIFECYCLE_MODEL_VERSION);

      // Every single season across 20 years maintains legal squad bounds (18..22) and zero role shortages!
      for (const snap of reportA.snapshots) {
        expect(snap.minClubSquadSize).toBeGreaterThanOrEqual(18);
        expect(snap.maxClubSquadSize).toBeLessThanOrEqual(22);
        expect(snap.minClubKeepers).toBeGreaterThanOrEqual(1);
        expect(snap.minClubBowlingCapable).toBeGreaterThanOrEqual(5);
        expect(snap.clubsWithRoleShortage).toBe(0);
        expect(snap.roleCounts.KEEPER).toBeGreaterThanOrEqual(8);
        // Ability distributions stay realistically bounded (no runaway 95 inflation or 25 collapse)
        expect(snap.battingAbility.meanX10).toBeGreaterThanOrEqual(450);
        expect(snap.battingAbility.meanX10).toBeLessThanOrEqual(780);
        expect(snap.bowlingAbility.meanX10).toBeGreaterThanOrEqual(450);
        expect(snap.bowlingAbility.meanX10).toBeLessThanOrEqual(780);
        expect(snap.meanAgeX10).toBeGreaterThanOrEqual(210);
        expect(snap.meanAgeX10).toBeLessThanOrEqual(340);
      }

      // Meaningful generational turnover occurred over 20 seasons (retirements + youth promotions)
      const finalSnap = reportA.snapshots[19]!;
      expect(finalSnap.cumulativeRetiredCount).toBeGreaterThanOrEqual(60);
      expect(finalSnap.cumulativeYouthPromotedCount).toBeGreaterThanOrEqual(60);
    },
    60_000,
  );
});
