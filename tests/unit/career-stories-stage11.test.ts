import { describe, expect, it } from "vitest";
import { projectCareerStories, type HistoricalMatchFact } from "@lcxxvi/projections";
import type { CareerStoryCard } from "@lcxxvi/contracts";
import {
  canonicalJson,
  PERSISTENT_WORLD_STATE_V4_VERSION,
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

// Stage 11 (docs/ROADMAP_AND_AI_GUIDE.md): story cards are derived from committed facts and invent nothing.


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
    if ((state.worldStateVersion === PERSISTENT_WORLD_STATE_V4_VERSION || state.worldStateVersion === "LC_PERSISTENT_WORLD_STATE_V5") && input.expectedRevision === null) {
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



/** Every number in a story's headline and text must appear in one of its fact values. */
function unbackedNumbers(story: CareerStoryCard): string[] {
  const backed = new Set<string>();
  for (const fact of story.factProvenance) for (const n of String(fact.value).match(/\d+/g) ?? []) backed.add(n);
  const text = `${story.headline} ${story.summaryText}`.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1");
  return (text.match(/\d+/g) ?? []).filter((n) => !backed.has(n));
}

let ordinal = 0;
function fact(input: {
  season?: number;
  round: number;
  batting?: { playerId: string; teamId?: string; runs: number; dismissed?: boolean; position?: number }[];
  bowling?: { playerId: string; teamId?: string; wickets: number }[];
  fielding?: { playerId: string; teamId?: string; catches: number }[];
  homePoints?: number;
  awayPoints?: number;
  home?: string;
  away?: string;
}): HistoricalMatchFact {
  const home = input.home ?? "team-a";
  const away = input.away ?? "team-b";
  const participants: Record<string, string> = {};
  for (const e of [...(input.batting ?? []), ...(input.bowling ?? []), ...(input.fielding ?? [])]) participants[e.playerId] = e.teamId ?? home;
  ordinal += 1;
  return {
    seasonNumber: input.season ?? 1, calendarYear: 2026, seasonPhase: "ACTIVE", competitionId: "LC_T20_LEAGUE_01", format: "T20",
    fixtureId: `fx-${ordinal}`, matchId: `m-${ordinal}`, fixtureOrdinal: ordinal, roundNumber: input.round, matchDayDate: "2026-04-04",
    groundId: null, homeTeamId: home, awayTeamId: away, sourceCompletionSha256: "0".repeat(64), resultSummary: "", winnerTeamId: null,
    resultKind: "WIN", homeRuns: 0, homeBalls: 0, awayRuns: 0, awayBalls: 0, homePoints: input.homePoints ?? 0, awayPoints: input.awayPoints ?? 0,
    participantTeamByPlayerId: participants,
    battingEntries: (input.batting ?? []).map((b) => ({ playerId: b.playerId, teamId: b.teamId ?? home, inningsIndex: 0 as const, battingPosition: b.position ?? 3, runs: b.runs, ballsFaced: 10, fours: 0, sixes: 0, dismissed: b.dismissed ?? true })),
    bowlingEntries: (input.bowling ?? []).map((b) => ({ playerId: b.playerId, teamId: b.teamId ?? home, inningsIndex: 1 as const, legalBalls: 24, runsConceded: 20, wickets: b.wickets, maidens: 0 })),
    fieldingEntries: (input.fielding ?? []).map((f) => ({ playerId: f.playerId, teamId: f.teamId ?? home, catches: f.catches, stumpings: 0, runOuts: 0 })),
    archiveEvaluated: true, archiveReplayAvailable: true,
  };
}

const base = {
  worldOrCareerId: "world-stories",
  controlledTeamId: "team-a",
  playerNames: { "p-bat": "Ana Bat", "p-ball": "Ben Ball", "p-field": "Cy Field", "p-young": "Dee Young", "p-old": "Eli Old" },
  teamNames: { "team-a": "Aster Harbour", "team-b": "Moonstone Bay" },
  currentSeasonNumber: 1,
};

describe("Stage 11 career stories (triggers)", () => {
  it("fires each milestone once when its threshold is crossed, with the replay key", () => {
    const facts = [fact({ round: 1, batting: [{ playerId: "p-bat", runs: 480 }] }), fact({ round: 2, batting: [{ playerId: "p-bat", runs: 40 }] }), fact({ round: 3, batting: [{ playerId: "p-bat", runs: 20 }] })];
    const stories = projectCareerStories({ ...base, facts }).stories.filter((s) => s.category === "MILESTONE_BATTING");
    expect(stories).toHaveLength(1);
    expect(stories[0]!.roundNumber).toBe(2);
    expect(stories[0]!.linkedMatchKey).toBe(`1:${facts[1]!.fixtureId}`);
    expect(stories[0]!.summaryText).toContain("520 runs");
    expect(stories.every((s) => unbackedNumbers(s).length === 0)).toBe(true);
  });

  it("reports form streaks of three for the managed club only, once per streak", () => {
    const hot = [1, 2, 3, 4].map((round) => fact({ round, batting: [{ playerId: "p-bat", runs: 35 }, { playerId: "p-opp", teamId: "team-b", runs: 50 }], bowling: [{ playerId: "p-ball", wickets: 2 }] }));
    const stories = projectCareerStories({ ...base, facts: hot }).stories.filter((s) => s.category === "FORM_STREAK");
    expect(stories.map((s) => `${s.subjectPlayerId}@${s.roundNumber}`).sort()).toEqual(["p-ball@3", "p-bat@3"]);
    const cold = [1, 2, 3].map((round) => fact({ round, batting: [{ playerId: "p-bat", runs: 4, position: 2 }] }));
    const slump = projectCareerStories({ ...base, facts: cold }).stories.filter((s) => s.category === "FORM_STREAK");
    expect(slump).toHaveLength(1);
    expect(slump[0]!.summaryText).toContain("under 10");
  });

  it("tells youth debuts, contract decisions, retirements and board reviews from their facts", () => {
    const facts = Array.from({ length: 14 }, (_, i) =>
      fact({ round: i + 1, batting: [{ playerId: "p-bat", runs: 12 }, ...(i === 3 ? [{ playerId: "p-young", runs: 5 }] : [])], homePoints: i % 2 === 0 ? 2 : 0, awayPoints: i % 2 === 0 ? 0 : 2 }),
    );
    const projection = projectCareerStories({
      ...base,
      facts,
      contracts: [{ playerId: "p-bat", teamId: "team-a", expiresAfterSeasonNumber: 1 }, { playerId: "p-young", teamId: "team-a", expiresAfterSeasonNumber: 3 }],
      youthPromotions: [{ playerId: "p-young", teamId: "team-a", promotedInSeasonNumber: 1 }],
      retirements: [{ playerId: "p-bat", debutSeasonNumber: 1, retiredAfterSeasonNumber: 1, lastTeamId: "team-a", ageAtRetirement: 36 }],
    });
    const by = (category: string) => projection.stories.filter((s) => s.category === category);
    expect(by("YOUTH_BREAKTHROUGH").map((s) => s.roundNumber)).toEqual([4]);
    expect(by("CONTRACT_TENSION").map((s) => s.subjectPlayerId)).toEqual(["p-bat"]);
    expect(by("RETIREMENT_WATCH")[0]!.summaryText).toContain("168 league runs");
    expect(by("CLUB_BOARD_REVIEW").map((s) => s.roundNumber)).toEqual([7, 14]);
    expect(projection.stories.every((s) => unbackedNumbers(s).length === 0)).toBe(true);
    // Ids are unique and the projection is deterministic.
    expect(new Set(projection.stories.map((s) => s.storyId)).size).toBe(projection.stories.length);
    expect(JSON.stringify(projectCareerStories({ ...base, facts: [...facts].reverse(), contracts: [{ playerId: "p-bat", teamId: "team-a", expiresAfterSeasonNumber: 1 }], youthPromotions: [{ playerId: "p-young", teamId: "team-a", promotedInSeasonNumber: 1 }], retirements: [{ playerId: "p-bat", debutSeasonNumber: 1, retiredAfterSeasonNumber: 1, lastTeamId: "team-a", ageAtRetirement: 36 }] }))).toBe(JSON.stringify(projection));
  });
});

describe("Stage 11 career stories (awards)", () => {
  it("tells each awarded season award, with its headline stat as provenance", () => {
    const award = (category: string, winner: string | null, status: "AWARDED" | "UNAVAILABLE", stat: string | null) => ({
      awardVersion: "x", category, label: category === "LEADING_RUN_SCORER" ? "Leading Run Scorer" : "Best Fielder", awardProvenance: "GAME_AWARD",
      status, unavailableReason: null, qualificationRule: "r", formulaSummary: "f", winnerPlayerId: winner, winnerTeamId: winner ? "team-a" : null,
      headlineStat: stat, scoreX100: null, tieBroken: false, runnerUpPlayerId: null, explanationText: "e",
    });
    const ledger = {
      ledgerVersion: "x", worldOrCareerId: "world-stories", matchAwards: [], ledgerSha256: "0".repeat(64),
      seasonAwards: [{ awardVersion: "x", seasonNumber: 1, calendarYear: 2026, competitionId: "LC_T20_LEAGUE_01", sealedAtSeasonSha256: null, provenanceNotice: "n",
        awards: [award("LEADING_RUN_SCORER", "p-bat", "AWARDED", "612 runs"), award("BEST_FIELDER", null, "UNAVAILABLE", null)] }],
    } as unknown as NonNullable<Parameters<typeof projectCareerStories>[0]["awardsLedger"]>;
    const stories = projectCareerStories({ ...base, facts: [], awardsLedger: ledger }).stories;
    expect(stories.map((s) => s.category)).toEqual(["AWARD_RECOGNITION"]);
    expect(stories[0]!.summaryText).toContain("612 runs");
    expect(unbackedNumbers(stories[0]!)).toEqual([]);
  });
});

describe("Stage 11 career stories (simulated career)", () => {
  it(
    "backs every number with a fact and rebuilds the same stories after reload",
    async () => {
      const seasonRepo = new InMemorySeasonRepo();
      const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
      const service = new CareerApplicationService("stories", seasonRepo, undefined, persistentRepo);
      await service.boot();
      await service.createCareer(careerWorld.teams[0]!.teamId, null, { seed: "stories", worldId: "world-stories-sim", careerId: "career-stories-sim", startDate: "2026-04-04" });
      await playSeasonAndRollOver(service);
      const projection = service.careerStories()!;
      const categories = new Set(projection.stories.map((s) => s.category));
      expect(categories.has("CLUB_BOARD_REVIEW")).toBe(true);
      for (const story of projection.stories) expect(unbackedNumbers(story), story.storyId).toEqual([]);
      // A fresh service over the same save tells the same stories.
      const reloaded = new CareerApplicationService("stories-reload", seasonRepo, undefined, persistentRepo);
      await reloaded.boot();
      expect(JSON.stringify(reloaded.careerStories())).toBe(JSON.stringify(projection));
    },
    600_000,
  );
});
