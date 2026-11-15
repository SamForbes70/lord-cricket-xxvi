import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  DEFAULT_ANNUAL_CLUB_WAGE_BUDGET_K,
  LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION,
  MAX_ACTIVE_TEAM_SQUAD_SIZE,
  MIN_ACTIVE_TEAM_SQUAD_SIZE,
  PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION,
  PERSISTENT_WORLD_STATE_V2_VERSION,
  PERSISTENT_WORLD_STATE_V3_VERSION,
  SQUAD_ECONOMY_MODEL_VERSION,
  type NewGameWorldCopy,
  type PersistentWorldSaveSummary,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
} from "@lcxxvi/contracts";
import {
  peekPortableArchiveVersion,
  PERSISTENT_WORLD_RECORD_TYPE,
  readPersistentWorldPortableArchiveV3,
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
  acceptCounterOffer,
  buildPublicMarketPlayerView,
  createInitialPlayerLifecycleState,
  createInitialSquadEconomyState,
  derivePersistentWorldIdentity,
  estimatePlayerMarketWageK,
  releaseContractedPlayer,
  resolveNegotiationRound,
  runSquadEconomyDiagnosticHorizon,
  sealPlayerLifecycleState,
  submitContractOffer,
  verifyEconomyLedgerChain,
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
  expect(service.getState()!.phase).toBe("COMPLETE");
  expect(service.getState()!.completedMatches).toHaveLength(56);
}

describe("Stage 4 domestic contracts, club budgets, and recruitment (LC_PERSISTENT_WORLD_STATE_V3)", () => {
  it("proves market valuation and AI recruitment ignore hidden fictionalCeilingTier", () => {
    const identity = derivePersistentWorldIdentity({
      worldId: "world-public-info-test",
      baseSeed: "seed-public-info-test",
      originKind: "NEW_PERSISTENT_CAREER",
    });
    const lifecycleA = createInitialPlayerLifecycleState({
      worldIdentity: identity,
      baseWorld: careerWorld,
      seasonNumber: 1,
      calendarYear: 2026,
    });
    const economyA = createInitialSquadEconomyState({
      worldIdentity: identity,
      lifecycle: lifecycleA,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
    });

    // Mutate every academy prospect's hidden fictionalCeilingTier in lifecycleB while keeping public skills identical
    const { lifecycleSha256: _ignoredSha, ...lifecycleCore } = lifecycleA;
    void _ignoredSha;
    const flippedLifecycle = sealPlayerLifecycleState({
      ...lifecycleCore,
      youthAcademy: lifecycleA.youthAcademy.map((entry) => ({
        ...entry,
        fictionalCeilingTier:
          entry.fictionalCeilingTier === "ACADEMY_GRADUATE"
            ? ("HIGH_CEILING_PROSPECT" as const)
            : ("ACADEMY_GRADUATE" as const),
      })),
    });
    const economyB = createInitialSquadEconomyState({
      worldIdentity: identity,
      lifecycle: flippedLifecycle,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
    });

    expect(economyA.contracts.map((c) => c.annualWageK)).toEqual(
      economyB.contracts.map((c) => c.annualWageK),
    );
    expect(economyA.freeAgents.map((f) => f.askingAnnualWageK)).toEqual(
      economyB.freeAgents.map((f) => f.askingAnnualWageK),
    );

    const roundA = resolveNegotiationRound({
      worldIdentity: identity,
      lifecycle: lifecycleA,
      economy: economyA,
      controlledTeamId: careerWorld.teams[0]!.teamId,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      recentStats: [],
      rawRequest: {
        command: "RESOLVE_NEGOTIATION_ROUND",
        commandId: "cmd-round-public-check",
        seasonNumber: 1,
        expectedRound: 1,
      },
    });
    const roundB = resolveNegotiationRound({
      worldIdentity: identity,
      lifecycle: flippedLifecycle,
      economy: economyB,
      controlledTeamId: careerWorld.teams[0]!.teamId,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      recentStats: [],
      rawRequest: {
        command: "RESOLVE_NEGOTIATION_ROUND",
        commandId: "cmd-round-public-check",
        seasonNumber: 1,
        expectedRound: 1,
      },
    });

    expect(
      roundA.economy.negotiationWindow.offers.map((o) => ({
        teamId: o.offeringTeamId,
        playerId: o.playerId,
        wage: o.annualWageK,
        status: o.status,
      })),
    ).toEqual(
      roundB.economy.negotiationWindow.offers.map((o) => ({
        teamId: o.offeringTeamId,
        playerId: o.playerId,
        wage: o.annualWageK,
        status: o.status,
      })),
    );

    const samplePlayer = careerWorld.players[0]!;
    const view = buildPublicMarketPlayerView(samplePlayer, 2026);
    expect("fictionalCeilingTier" in view).toBe(false);
    expect(estimatePlayerMarketWageK(view)).toBeGreaterThanOrEqual(35);
  });

  it("enforces overspending rejection, duplicate commandId idempotency, competing simultaneous bids, buyout anti-circumvention, and reload persistence during bidding", async () => {
    const seasonRepo = new InMemorySeasonRepo();
    const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
    const service = new CareerApplicationService("owner-a", seasonRepo, undefined, persistentRepo);
    await service.boot();
    const teamId = careerWorld.teams[0]!.teamId;
    await service.createCareer(teamId);

    const persistent = service.getPersistentState()!;
    expect(persistent.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V3_VERSION);
    const economy0 = service.getEconomyState()!;
    expect(economy0.model.modelVersion).toBe(SQUAD_ECONOMY_MODEL_VERSION);
    expect(economy0.clubBudgets).toHaveLength(8);
    for (const b of economy0.clubBudgets) {
      expect(b.annualWageBudgetK).toBe(DEFAULT_ANNUAL_CLUB_WAGE_BUDGET_K);
      expect(b.committedWagesK + b.deadCapWagesK + b.pendingOfferReservedWagesK).toBeLessThanOrEqual(
        b.annualWageBudgetK,
      );
    }
    expect(() => verifyEconomyLedgerChain(economy0.ledger)).not.toThrow();

    // 1. Overspending rejection: offering above available cap space must throw cleanly
    const targetFa = economy0.freeAgents[0]!;
    const targetFa2 = economy0.freeAgents[1]!;
    const budget0 = service.managedClubBudget()!;
    const fillerWageK = Math.min(450, Math.max(40, budget0.availableWageSpaceK - 100));
    const fillerRes = await service.submitContractOffer({
      playerId: targetFa.playerId,
      offerKind: "FREE_AGENT",
      annualWageK: fillerWageK,
      termSeasons: 1,
    });
    const remainingAfterFiller = service.managedClubBudget()!.availableWageSpaceK;
    await expect(
      service.submitContractOffer({
        playerId: targetFa2.playerId,
        offerKind: "FREE_AGENT",
        annualWageK: Math.min(450, remainingAfterFiller + 60),
        termSeasons: 2,
      }),
    ).rejects.toThrow(/BUDGET|WAGE|CAP/i);
    await service.withdrawContractOffer(fillerRes.offer!.offerId);

    // 2. Duplicate commandId idempotency at simulation boundary
    const identity = persistent.worldIdentity;
    const lifecycle0 = service.getLifecycleState()!;
    const affordableFa = economy0.freeAgents.find(
      (fa) => fa.askingAnnualWageK <= budget0.availableWageSpaceK - 20,
    )!;
    const once = submitContractOffer({
      economy: economy0,
      lifecycle: lifecycle0,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      submittedBy: "HUMAN_MANAGER",
      rawRequest: {
        command: "SUBMIT_CONTRACT_OFFER",
        commandId: "cmd-dup-offer-1",
        offeringTeamId: teamId,
        playerId: affordableFa.playerId,
        offerKind: "FREE_AGENT",
        annualWageK: affordableFa.askingAnnualWageK,
        termSeasons: 2,
      },
    });
    const twice = submitContractOffer({
      economy: once.economy,
      lifecycle: lifecycle0,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      submittedBy: "HUMAN_MANAGER",
      rawRequest: {
        command: "SUBMIT_CONTRACT_OFFER",
        commandId: "cmd-dup-offer-1",
        offeringTeamId: teamId,
        playerId: affordableFa.playerId,
        offerKind: "FREE_AGENT",
        annualWageK: affordableFa.askingAnnualWageK,
        termSeasons: 2,
      },
    });
    expect(twice.duplicate).toBe(true);
    expect(twice.economy.economySha256).toBe(once.economy.economySha256);
    expect(twice.economy.negotiationWindow.offers).toHaveLength(1);

    // 3. Competing simultaneous offers on the same free agent: highest value offer wins, loser rejected cleanly
    const rivalTeamId = careerWorld.teams[1]!.teamId;
    const withRivalBid = submitContractOffer({
      economy: once.economy,
      lifecycle: lifecycle0,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      submittedBy: "AI_CLUB",
      rawRequest: {
        command: "SUBMIT_CONTRACT_OFFER",
        commandId: "cmd-rival-higher-bid",
        offeringTeamId: rivalTeamId,
        playerId: affordableFa.playerId,
        offerKind: "FREE_AGENT",
        annualWageK: affordableFa.askingAnnualWageK + 35,
        termSeasons: 2,
      },
    });
    const resolvedCompeting = resolveNegotiationRound({
      worldIdentity: identity,
      lifecycle: lifecycle0,
      economy: withRivalBid.economy,
      controlledTeamId: teamId,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      recentStats: [],
      rawRequest: {
        command: "RESOLVE_NEGOTIATION_ROUND",
        commandId: "cmd-resolve-competing-1",
        seasonNumber: 1,
        expectedRound: 1,
      },
    });
    const competingOffers = resolvedCompeting.economy.negotiationWindow.offers.filter(
      (o) => o.playerId === affordableFa.playerId,
    );
    const signedOffers = competingOffers.filter((o) => o.status === "SIGNED");
    expect(signedOffers).toHaveLength(1);
    expect(signedOffers[0]!.offeringTeamId).toBe(rivalTeamId);
    const humanCompeting = competingOffers.find((o) => o.offeringTeamId === teamId)!;
    expect(humanCompeting.status).toBe("REJECTED");
    expect(humanCompeting.reason).toBe("SIGNED_WITH_COMPETING_CLUB");

    // 4. Counter-offer + duplicate acceptance protection
    const lowballFa = economy0.freeAgents[1]!;
    const lowWage = Math.max(35, Math.floor(lowballFa.askingAnnualWageK * 0.9));
    const withLowBid = submitContractOffer({
      economy: economy0,
      lifecycle: lifecycle0,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      submittedBy: "HUMAN_MANAGER",
      rawRequest: {
        command: "SUBMIT_CONTRACT_OFFER",
        commandId: "cmd-lowball-1",
        offeringTeamId: teamId,
        playerId: lowballFa.playerId,
        offerKind: "FREE_AGENT",
        annualWageK: lowWage,
        termSeasons: 1,
      },
    });
    const roundCountered = resolveNegotiationRound({
      worldIdentity: identity,
      lifecycle: lifecycle0,
      economy: withLowBid.economy,
      controlledTeamId: teamId,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      recentStats: [],
      rawRequest: {
        command: "RESOLVE_NEGOTIATION_ROUND",
        commandId: "cmd-resolve-counter-1",
        seasonNumber: 1,
        expectedRound: 1,
      },
    });
    const counterCandidate = roundCountered.economy.negotiationWindow.offers.find(
      (o) => o.offeringTeamId === teamId && o.playerId === lowballFa.playerId,
    )!;
    if (counterCandidate.status === "COUNTERED") {
      const acceptedOnce = acceptCounterOffer({
        economy: roundCountered.economy,
        lifecycle: roundCountered.lifecycle,
        worldId: identity.worldId,
        seasonNumber: 1,
        calendarYear: 2026,
        currentDate: "2026-04-01",
        rawRequest: {
          command: "ACCEPT_COUNTER_OFFER",
          commandId: "cmd-accept-counter-1",
          offeringTeamId: teamId,
          offerId: counterCandidate.offerId,
        },
      });
      const acceptedTwice = acceptCounterOffer({
        economy: acceptedOnce.economy,
        lifecycle: acceptedOnce.lifecycle,
        worldId: identity.worldId,
        seasonNumber: 1,
        calendarYear: 2026,
        currentDate: "2026-04-01",
        rawRequest: {
          command: "ACCEPT_COUNTER_OFFER",
          commandId: "cmd-accept-counter-1",
          offeringTeamId: teamId,
          offerId: counterCandidate.offerId,
        },
      });
      expect(acceptedTwice.duplicate).toBe(true);
      expect(acceptedTwice.economy.economySha256).toBe(acceptedOnce.economy.economySha256);
      expect(() =>
        acceptCounterOffer({
          economy: acceptedOnce.economy,
          lifecycle: acceptedOnce.lifecycle,
          worldId: identity.worldId,
          seasonNumber: 1,
          calendarYear: 2026,
          currentDate: "2026-04-01",
          rawRequest: {
            command: "ACCEPT_COUNTER_OFFER",
            commandId: "cmd-accept-counter-different",
            offeringTeamId: teamId,
            offerId: counterCandidate.offerId,
          },
        }),
      ).toThrow();
    }

    // 5. Release buyout creates 50% dead-cap and blocks same-season re-signing circumvention
    const releasable = lifecycle0.activeWorld.teams
      .find((t) => t.teamId === teamId)!
      .squadIds.map((pid) => lifecycle0.activeWorld.players.find((p) => p.playerId === pid)!)
      .find((p) => p.role === "BATTER")!;
    const released = releaseContractedPlayer({
      economy: economy0,
      lifecycle: lifecycle0,
      worldId: identity.worldId,
      seasonNumber: 1,
      calendarYear: 2026,
      currentDate: "2026-04-01",
      rawRequest: {
        command: "RELEASE_CONTRACTED_PLAYER",
        commandId: "cmd-release-1",
        teamId,
        playerId: releasable.playerId,
      },
    });
    const postReleaseBudget = released.economy.clubBudgets.find((b) => b.teamId === teamId)!;
    expect(postReleaseBudget.deadCapWagesK).toBeGreaterThan(0);
    expect(() =>
      submitContractOffer({
        economy: released.economy,
        lifecycle: released.lifecycle,
        seasonNumber: 1,
        calendarYear: 2026,
        currentDate: "2026-04-01",
        submittedBy: "HUMAN_MANAGER",
        rawRequest: {
          command: "SUBMIT_CONTRACT_OFFER",
          commandId: "cmd-resign-released",
          offeringTeamId: teamId,
          playerId: releasable.playerId,
          offerKind: "FREE_AGENT",
          annualWageK: 40,
          termSeasons: 1,
        },
      }),
    ).toThrow(/RESTRICTED|ELIGIBLE|RESIGN_BLOCKED/i);

    // 6. Reload during bidding via CareerApplicationService preserves pending offers & reserved wages
    await service.submitContractOffer({
      playerId: affordableFa.playerId,
      offerKind: "FREE_AGENT",
      annualWageK: affordableFa.askingAnnualWageK + 15,
      termSeasons: 2,
    });
    const reservedBeforeReload = service.managedClubBudget()!.pendingOfferReservedWagesK;
    expect(reservedBeforeReload).toBe(affordableFa.askingAnnualWageK + 15);
    await service.releaseWriter();

    const reloadedService = new CareerApplicationService(
      "owner-b",
      seasonRepo,
      undefined,
      persistentRepo,
    );
    await reloadedService.boot();
    expect(reloadedService.managedClubBudget()!.pendingOfferReservedWagesK).toBe(
      reservedBeforeReload,
    );
    const pendingOffers = reloadedService
      .getEconomyState()!
      .negotiationWindow.offers.filter((o) => o.offeringTeamId === teamId && o.status === "PENDING_ROUND");
    expect(pendingOffers).toHaveLength(1);
    await reloadedService.resolveNegotiationRound();
    expect(reloadedService.getEconomyState()!.negotiationWindow.currentRound).toBe(2);
    expect(() => verifyEconomyLedgerChain(reloadedService.getEconomyState()!.ledger)).not.toThrow();
  }, 30_000);

  it(
    "supports full season rollover, V3 .lcxxvi portable archive round-trip, and non-destructive V2 -> V3 slot upgrade",
    async () => {
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService("owner-1", seasonRepo, undefined, persistentRepo);
      await service.boot();
      const teamId = careerWorld.teams[0]!.teamId;

      // Create a Stage 3 V2 career first, then non-destructively upgrade into a Stage 4 V3 slot
      await service.createCareer(teamId, null, {
        saveId: "pworld-v2-source",
        careerId: "career-v2-src",
        worldId: "world-v2-src",
        seed: "seed-v2-src",
        startDate: "2026-04-04",
        worldStateVersion: PERSISTENT_WORLD_STATE_V2_VERSION,
      });
      const v2SaveId = service.getSaveId()!;
      expect(service.getPersistentState()!.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V2_VERSION);

      const upgradedV3 = await service.upgradeToStage4EconomyV3("Stage 4 Upgraded Copy");
      const v3SaveId = service.getSaveId()!;
      expect(v3SaveId).not.toBe(v2SaveId);
      expect(upgradedV3.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V3_VERSION);

      // Original V2 slot remains untouched
      const v2StillIntact = await persistentRepo.load(v2SaveId);
      expect(v2StillIntact?.state.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V2_VERSION);

      // Simulate full Season 1 and roll over to Season 2
      await simulateFullSeason(service);
      expect(service.getEconomyState()!.negotiationWindow.windowPhase).toBe("CLOSED");
      await service.closeSeasonAndAdvance();

      const s2World = service.getPersistentState()!;
      expect(s2World.currentSeasonNumber).toBe(2);
      expect(s2World.currentCalendarYear).toBe(2027);
      expect(service.getEconomyState()!.negotiationWindow.windowPhase).toBe("OPEN");
      expect(service.getEconomyState()!.negotiationWindow.currentRound).toBe(1);
      expect(service.latestEconomyTransition()?.fromSeasonNumber).toBe(1);
      expect(service.latestEconomyTransition()?.toSeasonNumber).toBe(2);
      expect(() => verifyEconomyLedgerChain(service.getEconomyState()!.ledger)).not.toThrow();

      // Export V3 .lcxxvi portable archive and verify round-trip
      const archiveBytes = await service.exportCareer();
      expect(peekPortableArchiveVersion(archiveBytes)).toBe(
        PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION,
      );
      const parsedArchive = await readPersistentWorldPortableArchiveV3(archiveBytes);
      expect(parsedArchive.manifest.archiveVersion).toBe(
        PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION,
      );
      expect(parsedArchive.state.worldStateVersion).toBe(PERSISTENT_WORLD_STATE_V3_VERSION);
      expect(parsedArchive.matchEventArchives).toHaveLength(56);
      expect([
        "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1",
        LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION,
      ]).toContain(parsedArchive.matchEventArchives[0]!.archiveVersion);

      // Import into fresh repositories and verify replay + economy state
      const seasonRepo2 = new InMemorySeasonRepo();
      const persistentRepo2 = new InMemoryPersistentWorldRepo(seasonRepo2);
      const service2 = new CareerApplicationService(
        "owner-2",
        seasonRepo2,
        undefined,
        persistentRepo2,
      );
      await service2.boot();
      await service2.importCareer(archiveBytes);
      expect(service2.getPersistentState()!.stateSha256).toBe(s2World.stateSha256);
      expect(service2.getEconomyState()!.economySha256).toBe(
        service.getEconomyState()!.economySha256,
      );
      const s1FixtureId = s2World.completedSeasons[0]!.completedMatches[0]!.fixtureId;
      const replay = await service2.replayFixtureArchive(s1FixtureId);
      expect(replay.status).toBe("READY");
    },
    180_000,
  );

  it(
    "runs a 12-season domestic economy diagnostic horizon with symmetrical caps, zero overspend, and zero role shortages",
    () => {
      const diagIdentity = derivePersistentWorldIdentity({
        worldId: "economy-diag-12y",
        baseSeed: "seed-economy-diag-12y",
        originKind: "NEW_PERSISTENT_CAREER",
      });
      const report = runSquadEconomyDiagnosticHorizon({
        worldIdentity: diagIdentity,
        baseWorld: careerWorld,
        seasons: 12,
        startCalendarYear: 2026,
      });

      expect(report.snapshots).toHaveLength(12);
      expect(() => verifyEconomyLedgerChain(report.finalEconomy.ledger)).not.toThrow();

      for (const snap of report.snapshots) {
        expect(snap.clubsOverspentCount).toBe(0);
        expect(snap.clubsWithRoleShortageCount).toBe(0);
        expect(snap.maxClubPayrollUsedK).toBeLessThanOrEqual(DEFAULT_ANNUAL_CLUB_WAGE_BUDGET_K);
        expect(snap.freeAgentPoolCount).toBeGreaterThanOrEqual(8);
        expect(snap.freeAgentPoolCount).toBeLessThanOrEqual(40);
        expect(snap.aiHiddenFutureAbilityReads).toBe(0);
      }
      for (const team of report.finalLifecycle.activeWorld.teams) {
        expect(team.squadIds.length).toBeGreaterThanOrEqual(MIN_ACTIVE_TEAM_SQUAD_SIZE);
        expect(team.squadIds.length).toBeLessThanOrEqual(MAX_ACTIVE_TEAM_SQUAD_SIZE);
      }
    },
    120_000,
  );

  it(
    "reproduces identical economySha256 and diagnostic snapshots across repeated 3-season horizons",
    () => {
      const detIdentity = derivePersistentWorldIdentity({
        worldId: "economy-det-check",
        baseSeed: "seed-economy-det-check",
        originKind: "NEW_PERSISTENT_CAREER",
      });
      const runA = runSquadEconomyDiagnosticHorizon({
        worldIdentity: detIdentity,
        baseWorld: careerWorld,
        seasons: 3,
        startCalendarYear: 2026,
      });
      const runB = runSquadEconomyDiagnosticHorizon({
        worldIdentity: detIdentity,
        baseWorld: careerWorld,
        seasons: 3,
        startCalendarYear: 2026,
      });
      expect(runB.finalEconomy.economySha256).toBe(runA.finalEconomy.economySha256);
      expect(runB.snapshots).toEqual(runA.snapshots);
    },
    120_000,
  );

  it(
    "accumulates career projections cleanly when players transfer clubs between Season 1 and Season 2",
    async () => {
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService(
        "owner-s2-transfer-proj",
        seasonRepo,
        undefined,
        persistentRepo,
      );
      await service.boot();

      await service.createCareer(careerWorld.teams[0]!.teamId);
      await simulateFullSeason(service);
      await service.closeSeasonAndAdvance();
      expect(service.getPersistentState()!.currentSeasonNumber).toBe(2);

      // Simulate Season 2 Round 1 after off-season contract expiries and AI club signings
      const s2Before = service.getState()!;
      const next = service.nextManagedFixture()!;
      if (s2Before.careerState.currentDate < next.matchDayDate) {
        await service.simulateToNextUserFixture();
      }
      await service.simulateManagedFixture();

      const worldAfter = service.getPersistentState()!;
      expect(worldAfter.currentSeason.completedMatches.length).toBeGreaterThanOrEqual(4);
      expect(worldAfter.careerProjection.totalMatchesApplied).toBe(
        56 + worldAfter.currentSeason.completedMatches.length,
      );
    },
    180_000,
  );
});
