import { describe, expect, test } from "vitest";
import type { SeasonSaveSummary, T20SeasonState } from "@lcxxvi/contracts";
import type { SeasonDurableCommit, SeasonLoadResult } from "@lcxxvi/persistence";
import { CareerApplicationService, type CareerSeasonRepository } from "../../apps/web/src/career/service.js";

class MemorySeasonRepository implements CareerSeasonRepository {
  private rows = new Map<string, { summary: SeasonSaveSummary; state: T20SeasonState }>();
  private leases = new Map<string, string>();
  private active: string | null = null;

  async list() { return [...this.rows.values()].map((x) => x.summary); }
  async acquireLease(saveId: string, ownerId: string) {
    const held = this.leases.get(saveId);
    if (held && held !== ownerId) return false;
    this.leases.set(saveId, ownerId); return true;
  }
  async releaseLease(saveId: string, ownerId: string) { if (this.leases.get(saveId) === ownerId) this.leases.delete(saveId); }
  async commit(input: SeasonDurableCommit) {
    const prior = this.rows.get(input.saveId);
    if (input.expectedRevision !== null && prior?.state.revision !== input.expectedRevision) throw new Error("STALE");
    const summary: SeasonSaveSummary = {
      saveId: input.saveId, kind: input.kind, title: input.title, seasonId: input.state.seasonId,
      careerId: input.state.careerId, controlledTeamId: input.state.controlledTeamId,
      currentDate: input.state.careerState.currentDate, revision: input.state.revision,
      completedFixtures: input.state.completedMatches.length, phase: input.state.phase,
      stateSha256: input.state.stateSha256, updatedAt: input.updatedAt,
    };
    this.rows.set(input.saveId, { summary, state: structuredClone(input.state) });
    if (input.setActive !== false) this.active = input.saveId;
    return summary;
  }
  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const row = this.rows.get(saveId); if (!row) return null;
    return { summary: row.summary, state: structuredClone(row.state), recovered: false, recoveredFromGeneration: null, corruptedGenerations: [] };
  }
  async activeSaveId() { return this.active; }
}

describe("Pass 12G-R career application service", () => {
  test("creates a durable career, persists training, stops at the user fixture and completes it exactly once", async () => {
    const repo = new MemorySeasonRepository();
    const service = new CareerApplicationService("owner-a", repo);
    const initial = await service.createCareer("team-01");
    expect(initial.schedule.rounds).toHaveLength(14);
    expect(initial.schedule.fixtures).toHaveLength(56);
    expect((await repo.list())).toHaveLength(1);
    const playerId = service.squadView()!.players[0]!.playerId;
    await service.setTraining(playerId, "BATTING_PRACTICE");
    expect(service.squadView()!.players.find((p) => p.playerId === playerId)!.directive).toBe("BATTING_PRACTICE");

    await service.simulateToNextUserFixture();
    const required = service.nextManagedFixture()!;
    expect(service.getState()!.careerState.currentDate).toBe(required.matchDayDate);
    expect(service.getState()!.completedMatches.every((m) => ![m.homeTeamId, m.awayTeamId].includes("team-01"))).toBe(true);
    const before = service.getState()!.completedMatches.length;
    await service.simulateManagedFixture();
    expect(service.getState()!.completedMatches).toHaveLength(before + 1);
    expect(service.getState()!.careerState.appliedMatchConditions).toHaveLength(before + 1);

    const saveId = service.getSaveId()!;
    const reloaded = new CareerApplicationService("owner-a", repo);
    await reloaded.loadCareer(saveId);
    expect(reloaded.getState()!.stateSha256).toBe(service.getState()!.stateSha256);
    expect(reloaded.squadView()!.players.find((p) => p.playerId === playerId)!.directive).toBe("BATTING_PRACTICE");
  }, 20_000);

  test("a second owner loads the same active save read-only", async () => {
    const repo = new MemorySeasonRepository();
    const writer = new CareerApplicationService("writer", repo);
    await writer.createCareer("team-02");
    const reader = new CareerApplicationService("reader", repo);
    await reader.loadCareer(writer.getSaveId()!);
    expect(reader.isReadOnly()).toBe(true);
    await expect(reader.setTraining(reader.squadView()!.players[0]!.playerId, "REST")).rejects.toThrow(/read-only/i);
  });
});
