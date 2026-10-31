import { expect, test } from "@playwright/test";
import path from "node:path";

test("roster career saves atomically and recovers an earlier checkpoint", async ({ page }) => {
  await page.goto("/#exhibition");
  const paths = {
    persistence: `/@fs/${path.resolve("packages/persistence/src/season.ts")}`,
    simulation: `/@fs/${path.resolve("packages/simulation/src/index.ts")}`,
    career: `/@fs/${path.resolve("apps/web/src/career/roster-season.ts")}`,
    world: `/@fs/${path.resolve("packages/data/worlds/fictional-eight-01.json")}`,
  };
  const result = await page.evaluate(async urls => {
    const persistence = await import(urls.persistence) as typeof import("../../packages/persistence/src/season.js");
    const simulation = await import(urls.simulation) as typeof import("../../packages/simulation/src/index.js");
    const career = await import(urls.career) as typeof import("../../apps/web/src/career/roster-season.js");
    const world = await fetch(urls.world).then(response => response.json());
    const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
    const pack = simulation.createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "career-test", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const state = career.createRosterSeason(pack, { careerId: "career", controlledTeamId: world.teams[0].teamId, seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const databaseName = `roster-career-${crypto.randomUUID()}`;
    const repo = new persistence.IndexedDbSeasonRepository(databaseName), now = Date.now();
    await repo.acquireLease("career", "owner", now);
    const base = { saveId: "career", kind: "AUTO" as const, title: "Roster career", expectedRevision: null, state, rosterPack: pack, command: null, ownerId: "owner", now, updatedAt: "2026-10-30T00:00:00.000Z" };
    let aborted = "";
    try { await repo.commitRoster({ ...base, testAbortAfterWrites: true }); } catch (error) { aborted = String(error); }
    const empty = await repo.loadRoster("career");
    await repo.commitRoster(base);
    const next = career.simulateNextRosterSeasonFixture(state, pack);
    const command = { commandId: "simulate-1", requestCanonical: "{}", responseJson: "{}", committedRevision: next.revision };
    await repo.commitRoster({ ...base, expectedRevision: 0, state: next, command });
    const later = career.simulateNextRosterSeasonFixture(next, pack);
    let duplicate = "";
    try { await repo.commitRoster({ ...base, expectedRevision: 1, state: later, command: { ...command, committedRevision: later.revision } }); } catch (error) { duplicate = String(error); }
    const active = await repo.activeRosterSaveId(), listed = await repo.listRoster();
    await repo.corruptCurrentCheckpoint("career");
    const recovered = await repo.loadRoster("career");
    const validated = career.validateRosterSeasonState(recovered!.state, recovered!.rosterPack);
    return { aborted, empty, active, count: listed.length, duplicate, recovered: recovered?.recovered, revision: validated.revision };
  }, paths);
  expect(result.aborted).toContain("ROSTER_SEASON_INJECTED_ABORT");
  expect(result.empty).toBeNull();
  expect(result.active).toBe("career");
  expect(result.count).toBe(1);
  expect(result.duplicate).toContain("ROSTER_SEASON_DUPLICATE_COMMAND");
  expect(result.recovered).toBe(true);
  expect(result.revision).toBe(0);
});
