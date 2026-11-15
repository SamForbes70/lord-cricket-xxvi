import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  InMatchTacticalAssistantViewSchema,
  PreMatchBriefingSchema,
  WorldPackSchema,
  type NewGameWorldCopy,
  type ODICommand,
  type PersistentWorldSaveSummary,
  type Red5Command,
  type SeasonCheckpointInspection,
  type SeasonSaveSummary,
  type T20Command,
  type T20TeamSelection,
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
  buildPreMatchBriefing,
  projectInMatchTacticalAssistant,
  projectSpellAndStintReviews,
} from "@lcxxvi/projections";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import { UI_VERSION, type Action, type Response } from "../../apps/web/src/match/protocol.js";
import {
  CareerApplicationService,
  type CareerPersistentWorldRepository,
  type CareerSeasonRepository,
} from "../../apps/web/src/career/service.js";

const worldBytes = new Uint8Array(
  readFileSync("packages/data/worlds/fictional-eight-01.json"),
);
const worldManifest = JSON.parse(
  readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"),
);
const world = WorldPackSchema.parse(
  JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")),
);

function pickSuggestedSelections(): [T20TeamSelection, T20TeamSelection] {
  const pick = (teamIndex: number): T20TeamSelection => {
    const team = world.teams[teamIndex]!;
    const players = team.squadIds.map(
      (id) => world.players.find((p) => p.playerId === id)!,
    );
    const keeper = players.find((p) => p.role === "KEEPER")!;
    const bowlers = players
      .filter(
        (p) =>
          p.playerId !== keeper.playerId &&
          (p.role === "BOWLER" || p.role === "ALLROUNDER" || p.bowlingStyle !== null),
      )
      .slice(0, 5);
    const rest = players.filter(
      (p) => p.playerId !== keeper.playerId && !bowlers.includes(p),
    );
    const xi = [keeper, ...bowlers, ...rest].slice(0, 11);
    return {
      teamId: team.teamId,
      playerIds: xi.map((p) => p.playerId),
      captainId: xi[0]!.playerId,
      keeperId: keeper.playerId,
    };
  };
  return [pick(0), pick(1)];
}

class InMemorySeasonRepo implements CareerSeasonRepository {
  private activeId: string | null = null;
  private readonly leases = new Map<string, string>();
  private readonly slots = new Map<
    string,
    {
      summary: SeasonSaveSummary;
      worldCopy: NewGameWorldCopy | null;
      stateJson: string;
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
    const archives = new Map(this.slots.get(input.saveId)?.archives ?? []);
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateCompletedCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    this.slots.set(input.saveId, {
      summary,
      worldCopy,
      stateJson: canonicalJson(state),
      archives,
    });
    if (input.setActive !== false) this.activeId = input.saveId;
    return summary;
  }
  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const slot = this.slots.get(saveId);
    if (!slot) return null;
    const state = await validateT20SeasonState(JSON.parse(slot.stateJson));
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
      stateJson: string;
      archives: Map<string, AnyCareerMatchEventArchive>;
    }
  >();

  constructor(private readonly seasonRepo: InMemorySeasonRepo) {}

  async recordTypeOf(saveId: string): Promise<string | null> {
    return this.slots.has(saveId) ? PERSISTENT_WORLD_RECORD_TYPE : null;
  }
  async list(): Promise<PersistentWorldSaveSummary[]> {
    return [...this.slots.values()].map((s) => s.summary);
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
    const state = await validateAnyPersistentWorldState(input.state);
    const existing = this.slots.get(input.saveId);
    const worldCopy = input.worldCopy
      ? await validateStoredWorldCopy(input.worldCopy)
      : existing?.worldCopy ?? null;
    const stateJson = canonicalJson(state);
    await seasonSha256Text(stateJson);
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
    for (const raw of input.matchEventArchives ?? []) {
      const parsed = await validateAnyCareerMatchEventArchive(raw);
      archives.set(parsed.fixtureId, parsed);
    }
    this.slots.set(input.saveId, { summary, worldCopy, stateJson, archives });
    if (input.setActive !== false) await this.seasonRepo.setActiveSaveId(input.saveId);
    return { summary, idempotentReplay: false };
  }
  async load(saveId: string): Promise<PersistentWorldLoadResult | null> {
    const slot = this.slots.get(saveId);
    if (!slot) return null;
    const state = await validateAnyPersistentWorldState(JSON.parse(slot.stateJson));
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
    const archives = [...(this.slots.get(saveId)?.archives.values() ?? [])];
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
  async loadGeneration(saveId: string): Promise<PersistentWorldLoadResult> {
    return (await this.load(saveId))!;
  }
}

type AnyController = {
  handle: (raw: unknown) => Response;
};

function createDriver(
  controller: AnyController,
  format: "T20" | "ODI" | "RED_BALL",
  selections: [T20TeamSelection, T20TeamSelection],
  groundId = "ground-01",
) {
  let seq = 0;
  let latest: Response = controller.handle({
    version: UI_VERSION,
    requestId: `ui-${++seq}`,
    expectedRevision: 0,
    type: "START",
    format,
    selections,
    groundId,
  });
  if (latest.error) throw new Error(latest.error);

  const sendAction = (action: Action): Response => {
    const reqId = `ui-${++seq}`;
    const v = latest.view!;
    const i = v.innings[v.activeIndex]?.innings;
    const teamId =
      "teamId" in action.payload
        ? action.payload.teamId
        : action.kind === "SET_BATTING_PLAN"
          ? i?.battingTeamId
          : i?.bowlingTeamId;
    const actorId =
      action.kind === "ADVANCE" || action.kind === "ADD_RAIN_DELAY"
        ? "SYSTEM"
        : `USER:${teamId}`;
    const command = {
      kind: action.kind,
      payload: action.payload,
      actorId,
      commandId: reqId,
      expectedRevision: latest.revision,
    } as T20Command | ODICommand | Red5Command;
    latest = controller.handle({
      version: UI_VERSION,
      requestId: reqId,
      expectedRevision: latest.revision,
      type: "COMMAND",
      origin: "HUMAN",
      command,
    });
    if (latest.error) throw new Error(`${action.kind}: ${latest.error}`);
    return latest;
  };

  const verify = () => {
    const reqId = `ui-${++seq}`;
    const res = controller.handle({
      version: UI_VERSION,
      requestId: reqId,
      expectedRevision: latest.revision,
      type: "VERIFY",
    });
    if (res.error) throw new Error(res.error);
    latest = res;
    return res.verification!;
  };

  const stepUntilReady = () => {
    let guard = 0;
    while (latest.view!.phase !== "READY" && latest.view!.phase !== "COMPLETE" && guard < 40) {
      guard += 1;
      const v = latest.view!;
      if (v.phase === "TOSS") {
        sendAction({ kind: "CALL_TOSS", payload: { teamId: v.teams[0]!.id, call: "HEADS" } });
      } else if (v.phase === "AWAITING_INNINGS") {
        sendAction({ kind: "CHOOSE_INNINGS", payload: { teamId: v.decisionTeamId!, choice: "BAT" } });
      } else if (v.phase === "AWAITING_BATTER") {
        const eligible = v.candidates.find((c) => !c.reason)!;
        sendAction({
          kind: "SET_BATTER",
          payload: { teamId: v.decisionTeamId!, playerId: eligible.id },
        });
      } else if (v.phase === "AWAITING_BOWLER") {
        const eligible = v.candidates.find((c) => !c.reason)!;
        sendAction({
          kind: "SET_BOWLER",
          payload: { teamId: v.decisionTeamId!, bowlerId: eligible.id },
        });
      } else {
        break;
      }
    }
    return latest;
  };

  return { getLatest: () => latest, sendAction, verify, stepUntilReady };
}

describe("Stage 5: Tactical briefings, plain-language control trade-offs, legal presets, and post-spell reviews", () => {
  it("builds pre-match briefings across T20, ODI, and RED_BALL using only public roster and condition observations", () => {
    const t1 = world.teams[0]!;
    const t2 = world.teams[1]!;
    const toSide = (team: typeof t1) => ({
      teamId: team.teamId,
      teamName: team.name,
      players: team.squadIds
        .map((id) => world.players.find((p) => p.playerId === id)!)
        .map((p) => ({
          playerId: p.playerId,
          name: p.name,
          role: p.role,
          batHand: p.batHand,
          bowlingStyle: p.bowlingStyle,
        })),
    });
    const selections = pickSuggestedSelections();
    const conditions: Record<string, { fatigueBp: number; readinessDelta: number }> = {
      [selections[0].playerIds[0]!]: { fatigueBp: 6400, readinessDelta: -2 },
      [selections[0].playerIds[1]!]: { fatigueBp: 800, readinessDelta: 2 },
    };

    for (const format of ["T20", "ODI", "RED_BALL"] as const) {
      const briefing = buildPreMatchBriefing({
        format,
        ground: {
          groundId: "ground-02",
          name: "Turners Oval",
          pitchPrior: { seamBp: 3800, turnBp: 7200 },
        },
        teams: [toSide(t1), toSide(t2)],
        selections,
        conditionsByPlayerId: conditions,
      });

      expect(() => PreMatchBriefingSchema.parse(briefing)).not.toThrow();
      expect(briefing.ground.pitchTendency).toBe("SPIN_FRIENDLY");
      expect(briefing.teams[0].freshInXI).toBeGreaterThanOrEqual(1);
      expect(briefing.teams[0].tiredInXI).toBeGreaterThanOrEqual(1);
      expect(briefing.teams[1].selectedCount).toBe(11);
      expect(
        briefing.opponentObservations[1].paceOptions +
          briefing.opponentObservations[1].spinOptions,
      ).toBeGreaterThanOrEqual(5);

      const serialized = JSON.stringify(briefing);
      expect(serialized).not.toContain("potential");
      expect(serialized).not.toContain("ceiling");
    }
  });

  it("projects legal contextual presets and accepts every preset command on authoritative T20, ODI, and Red-ball sessions without altering RNG streams", () => {
    const selections = pickSuggestedSelections();
    const dBaseline = createDriver(
      createMatchController(worldBytes, worldManifest, () => "stage5-t20-seed"),
      "T20",
      selections,
    );
    const dPresets = createDriver(
      createMatchController(worldBytes, worldManifest, () => "stage5-t20-seed"),
      "T20",
      selections,
    );

    dBaseline.stepUntilReady();
    dPresets.stepUntilReady();

    // Projection is pure and leaves event hashes identical
    expect(dBaseline.getLatest().view!.lastEventHash).toBe(
      dPresets.getLatest().view!.lastEventHash,
    );

    const t20Assistant = dPresets.getLatest().view!.tacticalAssistant!;
    expect(() => InMatchTacticalAssistantViewSchema.parse(t20Assistant)).not.toThrow();
    expect(t20Assistant.controlGuide).toHaveLength(7);
    expect(t20Assistant.presets.length).toBeGreaterThanOrEqual(7);

    const vT20 = dPresets.getLatest().view!;
    const iT20 = vT20.innings[vT20.activeIndex]!.innings;
    const strikerT20 = iT20.strikerEnd === "NORTH" ? iT20.northBatterId! : iT20.southBatterId!;
    for (const preset of t20Assistant.presets) {
      if (preset.commandKind === "SET_BATTING_PLAN" && preset.battingPatch) {
        dPresets.sendAction({
          kind: "SET_BATTING_PLAN",
          payload: {
            playerId: strikerT20,
            aggression: preset.battingPatch.aggression,
            intent: preset.battingPatch.intent,
          },
        });
      } else if (preset.commandKind === "SET_BOWLING_PLAN" && preset.bowlingPatch) {
        dPresets.sendAction({
          kind: "SET_BOWLING_PLAN",
          payload: {
            bowlerId: iT20.bowlerId!,
            ...preset.bowlingPatch,
          },
        });
      } else if (preset.commandKind === "SET_FIELD" && preset.fieldSlots) {
        dPresets.sendAction({
          kind: "SET_FIELD",
          payload: {
            teamId: iT20.bowlingTeamId,
            fieldSlots: preset.fieldSlots,
          },
        });
      }
    }
    expect(dPresets.getLatest().view!.lastEventHash).toHaveLength(64);

    // ODI field & plan presets obey ODI circle restrictions
    const dOdi = createDriver(
      createODIMatchController(worldBytes, worldManifest, () => "stage5-odi-seed"),
      "ODI",
      selections,
    );
    dOdi.stepUntilReady();
    const odiView = dOdi.getLatest().view!;
    const odiInnings = odiView.innings[odiView.activeIndex]!.innings;
    for (const preset of odiView.tacticalAssistant!.presets.filter((p) => p.commandKind === "SET_FIELD")) {
      dOdi.sendAction({
        kind: "SET_FIELD",
        payload: { teamId: odiInnings.bowlingTeamId, fieldSlots: preset.fieldSlots! },
      });
    }
    expect(dOdi.getLatest().view!.lastEventHash).toHaveLength(64);

    // Red-ball field presets obey red-ball legality
    const dRed = createDriver(
      createRed5MatchController(worldBytes, worldManifest, () => "stage5-red-seed"),
      "RED_BALL",
      selections,
    );
    dRed.stepUntilReady();
    const redView = dRed.getLatest().view!;
    const redInnings = redView.innings[redView.activeIndex]!.innings;
    for (const preset of redView.tacticalAssistant!.presets.filter((p) => p.commandKind === "SET_FIELD")) {
      dRed.sendAction({
        kind: "SET_FIELD",
        payload: { teamId: redInnings.bowlingTeamId, fieldSlots: preset.fieldSlots! },
      });
    }
    expect(dRed.getLatest().view!.lastEventHash).toHaveLength(64);
  });

  it("projects factual post-spell and batting-stint plan-vs-outcome summaries across multi-over spells", () => {
    const selections = pickSuggestedSelections();
    const driver = createDriver(
      createMatchController(worldBytes, worldManifest, () => "stage5-spell-review-seed"),
      "T20",
      selections,
    );

    let appliedDefensivePlan = false;
    let spellOneBowlerId: string | null = null;
    let guard = 0;
    while (guard < 120) {
      guard += 1;
      driver.stepUntilReady();
      const v = driver.getLatest().view!;
      const i = v.innings[v.activeIndex]?.innings;
      if (!i || v.phase === "COMPLETE" || i.legalBalls >= 24) break;
      if (spellOneBowlerId === null) spellOneBowlerId = i.bowlerId;
      if (i.bowlerId === spellOneBowlerId && v.bowlingPlan?.line !== "OFF") {
        appliedDefensivePlan = true;
        const preset = v.tacticalAssistant!.presets.find(
          (p) => p.presetId === "BOWL_DISCIPLINED_CHANNEL",
        )!;
        driver.sendAction({
          kind: "SET_BOWLING_PLAN",
          payload: { bowlerId: i.bowlerId!, ...preset.bowlingPatch! },
        });
      }
      driver.sendAction({ kind: "ADVANCE", payload: { scope: "DELIVERY" } });
    }
    expect(appliedDefensivePlan).toBe(true);

    const finalView = driver.getLatest().view!;
    const finalAssistant = finalView.tacticalAssistant!;
    expect(finalAssistant.spellReviews.length).toBeGreaterThanOrEqual(2);
    const totalSpellLegalBalls = finalAssistant.spellReviews.reduce(
      (acc, s) => acc + s.outcomes.legalBalls,
      0,
    );
    expect(totalSpellLegalBalls).toBe(24);

    const firstSpell = finalAssistant.spellReviews.find(
      (s) => s.spellNumberInInnings === 1,
    )!;
    expect(firstSpell.acceptedPlan.primaryLine).toBe("OFF");
    expect(firstSpell.acceptedPlan.primaryLength).toBe("GOOD");
    expect(firstSpell.acceptedPlan.planChangesCount).toBeGreaterThanOrEqual(1);
    expect(
      firstSpell.outcomes.dots +
        firstSpell.outcomes.singles +
        firstSpell.outcomes.boundaries,
    ).toBeLessThanOrEqual(firstSpell.outcomes.deliveryAttempts);
    expect(firstSpell.factualSummary.length).toBeGreaterThan(20);
    expect(firstSpell.factualSummary.toLowerCase()).not.toContain("bonus");
    expect(firstSpell.factualSummary.toLowerCase()).not.toContain("because");

    expect(finalAssistant.battingStintReviews.length).toBeGreaterThanOrEqual(2);
    const totalFaced = finalAssistant.battingStintReviews.reduce(
      (acc, b) => acc + b.outcomes.ballsFaced,
      0,
    );
    expect(totalFaced).toBeGreaterThanOrEqual(24);

    expect(projectSpellAndStintReviews([], finalView.names, []).spellReviews).toHaveLength(0);
    const emptyCheck = projectInMatchTacticalAssistant({
      format: "T20",
      phase: "READY",
      innings: finalView.innings,
      activeIndex: 0,
      events: [],
      names: finalView.names,
      hands: finalView.hands,
      pitch: { seamBp: 5000, turnBp: 5000, wearPoints: 0 },
      fatigueBpByPlayerId: {},
      activeBattingPlans: finalView.battingPlans,
      activeBowlingPlan: finalView.bowlingPlan,
      activeFieldSlots: finalView.fieldSlots,
      outfieldIds: finalView.fieldSlots.map((s) => s.playerId),
      bowlerVariationsByPlayerId: {},
    });
    expect(emptyCheck.version).toBe("LC_TACTICAL_BRIEFING_V1");
  });

  it("surfaces career fixtureBriefing with live squad fatigue and readiness tracking", async () => {
    const seasonRepo = new InMemorySeasonRepo();
    const persistentRepo = new InMemoryPersistentWorldRepo(seasonRepo);
    const service = new CareerApplicationService(
      "stage5-tab",
      seasonRepo,
      undefined,
      persistentRepo,
    );
    await service.boot();
    await service.createCareer("team-01", null, { seed: "stage5-career-briefing" });
    const briefing = service.fixtureBriefing();
    expect(briefing).not.toBeNull();
    expect(briefing!.teams[0].freshInXI + briefing!.teams[0].tiredInXI).toBeLessThanOrEqual(11);
    expect(briefing!.teams[0].selectedCount).toBe(11);
    expect(briefing!.teams[1].selectedCount).toBe(11);
  });
});
