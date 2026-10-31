import { describe, expect, it } from "vitest";
import { FROZEN_WORLD_PINS } from "@lcxxvi/data";
import { createPortableArchive, readPortableArchive, type ArchivePins, type SaveSummary } from "@lcxxvi/persistence";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import {
  createRosterT20Session, createStagedRosterPack, createT20Session, executeRosterT20Command, fixtureAutopilotStep,
  rehydrateRosterT20Session, replayRosterT20Session, type FrozenT20Setup, type RosterT20Session, type T20Session,
} from "@lcxxvi/simulation";

function roster(rating?: number) {
  const players = world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
  if (rating !== undefined) for (const player of players) {
    const skills = (player.skills as typeof world.players[number]["skills"]).T20;
    for (const key of Object.keys(skills) as Array<keyof typeof skills>) skills[key] = rating;
  }
  const first = players[0]!;
  first.name = "Imported Player";
  const source = { version: "LC_ROSTER_IMPORT_V1", sourceId: "test-roster", world: { ...structuredClone(world), players } };
  return createStagedRosterPack(JSON.stringify(source), world.rulesIds, ["stock"]);
}
function start(rating?: number) {
  const pack = roster(rating);
  const teams = pack.world.teams.slice(0, 2).map(team => {
    const squad = team.squadIds.map(id => pack.world.players.find(player => player.playerId === id)!);
    const keeper = squad.find(player => player.role === "KEEPER")!;
    const bowlers = squad.filter(player => player.bowlingStyle && ["BOWLER", "ALLROUNDER"].includes(player.role)).slice(0, 5);
    const selected = [keeper, ...bowlers, ...squad.filter(player => player !== keeper && !bowlers.includes(player))].slice(0, 11);
    return { teamId: team.teamId, playerIds: selected.map(player => player.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
  });
  const session = createRosterT20Session(pack, { gameId: "roster-game", matchId: "roster-match", seed: "test-seed", format: "T20", selection: { groundId: pack.world.grounds[0]!.groundId, teams } });
  return { pack, session };
}
function next(session: RosterT20Session) {
  return executeRosterT20Command(session, fixtureAutopilotStep(session as unknown as T20Session)).session;
}

describe("roster-aware T20 match", () => {
  it("plays a complete match and reconstructs saved command prefixes", () => {
    const { pack, session } = start();
    expect(session.executionManifest.engine).toBe("LC_T20_MATCH_ROSTER_V2");
    expect(session.setup.versions.worldHash).not.toBe(FROZEN_WORLD_PINS.worldCanonicalSha256);
    expect(() => createT20Session(session.setup as unknown as FrozenT20Setup)).toThrow("INVALID_FROZEN_SETUP");
    let current = session;
    for (let steps = 0; current.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(500);
      current = next(current);
      if (steps === 5 || steps === 20 || steps === 50) {
        expect(rehydrateRosterT20Session(structuredClone(current), pack)).toEqual(current);
      }
    }
    expect(current.events.length).toBeGreaterThan(0);
    expect(rehydrateRosterT20Session(structuredClone(current), pack)).toEqual(current);
    expect(replayRosterT20Session(current, pack).core).toEqual(current.core);
  }, 30_000);

  it("uses imported ratings in delivery outcomes", () => {
    let low = start(0).session;
    let high = start(100).session;
    for (let steps = 0; low.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(500);
      low = next(low);
    }
    for (let steps = 0; high.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(500);
      high = next(high);
    }
    expect(low.core.innings.map(innings => innings.innings.runs)).not.toEqual(high.core.innings.map(innings => innings.innings.runs));
  }, 30_000);

  it("round-trips a roster archive and restores the match from its embedded pack", async () => {
    const { pack, session } = start();
    const saved = next(session);
    const pins: ArchivePins = { engine: saved.executionManifest.engine, eventChain: saved.executionManifest.eventChain, random: saved.setup.versions.random, model: saved.setup.versions.model, modelHash: saved.setup.versions.modelHash, rules: saved.setup.versions.rules, rulesHash: saved.setup.versions.rulesHash, worldHash: saved.setup.versions.worldHash };
    const summary: SaveSummary = { saveId: "save", kind: "AUTO", title: "Roster", matchGameId: saved.setup.gameId, matchId: saved.setup.matchId, teams: [saved.setup.teams[0].name, saved.setup.teams[1].name], ground: saved.setup.ground.name, phase: saved.core.phase, revision: saved.revision, eventCount: saved.events.length, lastEventHash: saved.lastEventHash, updatedAt: "2026-10-30T00:00:00Z", completed: false };
    await expect(createPortableArchive(saved, summary, { ...pins, rulesHash: "0".repeat(64) }, summary.updatedAt, null, pack)).rejects.toThrow("ARCHIVE_ROSTER_PINS_MISMATCH");
    const bytes = await createPortableArchive(saved, summary, pins, summary.updatedAt, null, pack);
    const archive = await readPortableArchive(bytes, pins);
    expect(archive.manifest.archiveVersion).toBe("LC_ARCHIVE_V3_ROSTER");
    expect(rehydrateRosterT20Session(archive.session, archive.rosterPack!)).toEqual(saved);
    const damaged = new Uint8Array(bytes);
    damaged[100] = damaged[100]! ^ 1;
    await expect(readPortableArchive(damaged, pins)).rejects.toThrow();
  });

  it("refuses to export a roster session as an older archive", async () => {
    const { session } = start();
    await expect(createPortableArchive(session, {} as SaveSummary, {} as ArchivePins, "2026-10-30T00:00:00Z")).rejects.toThrow("ARCHIVE_ROSTER_REQUIRED");
  });

  it("rejects a damaged pack, tampered session and unverified execution", () => {
    const { pack, session } = start();
    const saved = structuredClone(next(session));
    const corrupted = structuredClone(pack);
    corrupted.world.players[0]!.name = "Changed";
    expect(() => rehydrateRosterT20Session(saved, corrupted)).toThrow();
    const damaged = structuredClone(saved);
    damaged.events[0]!.eventHash = "0".repeat(64);
    expect(() => rehydrateRosterT20Session(damaged, pack)).toThrow("SAVE_REPLAY_MISMATCH");
    expect(() => next(structuredClone(session))).toThrow("SESSION_UNVERIFIED");
    session.core.phase = "COMPLETE";
    expect(() => executeRosterT20Command(session, { commandId: "test", expectedRevision: 0, actorId: "SYSTEM", kind: "CONFIRM_TEAMS", payload: {} })).toThrow("SESSION_TAMPERED");
  });
});
