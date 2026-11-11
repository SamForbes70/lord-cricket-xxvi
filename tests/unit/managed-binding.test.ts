import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { NewGameWorldCopy, SeasonSaveSummary, T20SeasonState } from "@lcxxvi/contracts";
import { ManagedBindingError, ManagedMatchBindings, MemoryManagedBindingKv, managedBindingKey, type ManagedBindingInput } from "@lcxxvi/persistence";
import type { SeasonDurableCommit, SeasonLoadResult } from "@lcxxvi/persistence";
import { CareerApplicationService, type CareerSeasonRepository } from "../../apps/web/src/career/service.js";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { regenerateManagedResult } from "../../apps/web/src/match/managed-result.js";
import { UI_VERSION, type Action } from "../../apps/web/src/match/protocol.js";

const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function input(overrides: Partial<ManagedBindingInput> = {}): ManagedBindingInput {
  return {
    careerKind: "STANDARD", careerSaveId: "career-1", matchGameId: "career-match-f1", matchId: "match-f1", fixtureId: "f1",
    seasonId: "season-1", scheduleSha256: HASH_A, careerStateSha256: HASH_B, launch: { launchVersion: "x", fixtureId: "f1" }, ...overrides,
  };
}

describe("managed match bindings", () => {
  const make = () => {
    const kv = new MemoryManagedBindingKv();
    let tick = 0;
    return { kv, store: new ManagedMatchBindings(kv, () => `2026-11-11T00:00:${String(tick++).padStart(2, "0")}.000Z`) };
  };

  test("creates a pending binding once and treats a repeat as a no-op", async () => {
    const { store } = make();
    const first = await store.create(input());
    const again = await store.create(input());
    expect(again).toEqual(first);
    expect(first.status).toBe("PENDING");
    expect((await store.list()).bindings).toHaveLength(1);
  });

  test("rejects a different pending binding for the same match, and reopening an applied one", async () => {
    const { store } = make();
    await store.create(input());
    await expect(store.create(input({ careerStateSha256: HASH_A }))).rejects.toMatchObject({ code: "BINDING_CONFLICT" });
    await store.resolve("career-match-f1", "APPLIED", "RESULT_APPLIED");
    await expect(store.create(input())).rejects.toMatchObject({ code: "BINDING_ALREADY_APPLIED" });
  });

  test("an abandoned binding can be reopened as pending", async () => {
    const { store } = make();
    await store.create(input());
    await store.resolve("career-match-f1", "ABANDONED", "ABANDONED_BY_PLAYER");
    const reopened = await store.create(input());
    expect(reopened.status).toBe("PENDING");
    expect(reopened.resolution).toBeNull();
  });

  test("terminal states do not change again and resolving is idempotent", async () => {
    const { store } = make();
    await store.create(input());
    const applied = await store.resolve("career-match-f1", "APPLIED", "RESULT_APPLIED");
    expect(await store.resolve("career-match-f1", "APPLIED", "RESULT_APPLIED")).toEqual(applied);
    await expect(store.resolve("career-match-f1", "ABANDONED", "late")).rejects.toBeInstanceOf(ManagedBindingError);
    await expect(store.resolve("career-match-none", "APPLIED", "x")).rejects.toMatchObject({ code: "BINDING_MISSING" });
  });

  test("a tampered record is reported as damaged, preserved, and never used", async () => {
    const { kv, store } = make();
    await store.create(input());
    await store.create(input({ matchGameId: "career-match-f2", matchId: "match-f2", fixtureId: "f2" }));
    const row = kv.rows.get(managedBindingKey("career-match-f1")) as { status: string };
    kv.rows.set(managedBindingKey("career-match-f1"), { ...row, status: "APPLIED" });
    const listing = await store.list();
    expect(listing.bindings.map((b) => b.fixtureId)).toEqual(["f2"]);
    expect(listing.damaged).toEqual([managedBindingKey("career-match-f1")]);
    await expect(store.get("career-match-f1")).rejects.toMatchObject({ code: "BINDING_DAMAGED" });
    await expect(store.create(input())).rejects.toMatchObject({ code: "BINDING_DAMAGED" });
    expect(kv.rows.has(managedBindingKey("career-match-f1"))).toBe(true);
  });

  test("a concurrent write is detected instead of overwritten", async () => {
    const { kv, store } = make();
    await store.create(input());
    const original = kv.compareAndPut.bind(kv);
    kv.compareAndPut = async (key, expected, value) => { await store.remove("career-match-f1"); return original(key, expected, value); };
    await expect(store.resolve("career-match-f1", "APPLIED", "x")).rejects.toMatchObject({ code: "BINDING_RACE" });
  });

  test("filters pending bindings by career and removes them with the career", async () => {
    const { store } = make();
    await store.create(input());
    await store.create(input({ careerSaveId: "career-2", matchGameId: "career-match-g1", matchId: "match-g1", fixtureId: "g1" }));
    expect((await store.pendingForCareer("career-1")).bindings.map((b) => b.fixtureId)).toEqual(["f1"]);
    expect(await store.removeForCareer("career-1")).toBe(1);
    expect((await store.list()).bindings.map((b) => b.fixtureId)).toEqual(["g1"]);
  });
});

class MemorySeasonRepository implements CareerSeasonRepository {
  private rows = new Map<string, { summary: SeasonSaveSummary; state: T20SeasonState; worldCopy: NewGameWorldCopy | null }>();
  private active: string | null = null;
  async list() { return [...this.rows.values()].map((x) => x.summary); }
  async acquireLease() { return true; }
  async releaseLease() { /* single owner */ }
  async commit(input: SeasonDurableCommit) {
    const summary: SeasonSaveSummary = {
      saveId: input.saveId, kind: input.kind, title: input.title, seasonId: input.state.seasonId, careerId: input.state.careerId,
      controlledTeamId: input.state.controlledTeamId, currentDate: input.state.careerState.currentDate, revision: input.state.revision,
      completedFixtures: input.state.completedMatches.length, phase: input.state.phase, stateSha256: input.state.stateSha256, updatedAt: input.updatedAt,
    };
    this.rows.set(input.saveId, { summary, state: structuredClone(input.state), worldCopy: structuredClone(input.worldCopy ?? null) });
    if (input.setActive !== false) this.active = input.saveId;
    return summary;
  }
  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const row = this.rows.get(saveId); if (!row) return null;
    return { summary: row.summary, state: structuredClone(row.state), recovered: false, recoveredFromGeneration: null, corruptedGenerations: [], worldCopy: structuredClone(row.worldCopy) };
  }
  async activeSaveId() { return this.active; }
  async clearActiveSaveId(saveId: string) { if (this.active === saveId) this.active = null; }
}

type Launch = Awaited<ReturnType<CareerApplicationService["prepareUserMatch"]>>;
function playLive(launch: Launch, stopAfter: number | null) {
  const controller = createMatchController(worldBytes, manifest, () => "unused-live-seed");
  let serial = 0;
  let response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "BOOT", careerFixture: launch });
  const send = (body: object) => {
    response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: response.revision, ...body } as never);
    expect(response.error).toBeNull();
  };
  send({ type: "START", format: "T20", selections: launch.selections, groundId: launch.groundId, careerFixture: launch });
  const act = (action: Action) => {
    const view = response.view!;
    const innings = view.innings[view.activeIndex]?.innings;
    const teamId = "teamId" in action.payload ? action.payload.teamId : innings?.bowlingTeamId;
    send({ type: "COMMAND", origin: "HUMAN", command: { ...action, commandId: `ui-${serial + 1}`, expectedRevision: response.revision, actorId: action.kind === "ADVANCE" ? "SYSTEM" : `USER:${teamId}` } });
  };
  for (let steps = 0; response.view!.phase !== "COMPLETE" && (stopAfter === null || steps < stopAfter); steps++) {
    expect(steps).toBeLessThan(2000);
    const view = response.view!;
    if (view.phase === "TOSS") act({ kind: "CALL_TOSS", payload: { teamId: view.decisionTeamId!, call: "HEADS" } });
    else if (view.phase === "AWAITING_INNINGS") act({ kind: "CHOOSE_INNINGS", payload: { teamId: view.decisionTeamId!, choice: "BAT" } });
    else if (view.phase === "AWAITING_BATTER") act({ kind: "SET_BATTER", payload: { teamId: view.decisionTeamId!, playerId: view.candidates.find((p) => !p.reason)!.id } });
    else if (view.phase === "AWAITING_BOWLER") act({ kind: "SET_BOWLER", payload: { teamId: view.decisionTeamId!, bowlerId: view.candidates.find((p) => !p.reason)!.id } });
    else act({ kind: "ADVANCE", payload: { scope: "OVER" } });
  }
  return { response, session: JSON.parse(JSON.stringify(controller.snapshot())) as unknown };
}

describe("regenerating a managed result from a durable match", () => {
  test("rebuilds the same result without a live tab, applies once, and rejects mismatches", async () => {
    const service = new CareerApplicationService("owner", new MemorySeasonRepository());
    await service.createCareer("team-01");
    await service.simulateToNextUserFixture();
    const launch = await service.prepareUserMatch();

    const partial = playLive(launch, 8);
    expect(regenerateManagedResult({ session: partial.session }, launch, worldBytes, manifest)).toEqual({ complete: false });

    const done = playLive(launch, null);
    const rebuilt = regenerateManagedResult({ session: done.session }, launch, worldBytes, manifest);
    expect(rebuilt.complete).toBe(true);
    if (!rebuilt.complete) return;
    expect(rebuilt.careerResult).toEqual(done.response.careerResult);
    expect(rebuilt.careerResult).not.toBeNull();

    const before = service.getState()!.completedMatches.length;
    await service.completeUserMatch(rebuilt.careerResult!);
    await service.completeUserMatch(rebuilt.careerResult!);
    expect(service.getState()!.completedMatches).toHaveLength(before + 1);
    await expect(service.completeUserMatch({ ...rebuilt.careerResult!, sourceCompletionSha256: "f".repeat(64) })).rejects.toThrow("Conflicting managed fixture completion.");

    expect(() => regenerateManagedResult({ session: done.session }, { ...launch, matchGameId: "career-match-other" }, worldBytes, manifest)).toThrow();
    expect(() => regenerateManagedResult({ session: done.session, worldCopy: {} as NewGameWorldCopy }, launch, worldBytes, manifest)).toThrow("different world copy");
  }, 120_000);
});
