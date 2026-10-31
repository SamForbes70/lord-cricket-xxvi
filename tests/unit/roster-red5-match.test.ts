import { describe, expect, it } from "vitest";
import { FROZEN_WORLD_PINS } from "@lcxxvi/data";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import {
  createRosterRed5Session, createStagedRosterPack, createRed5Session, executeRosterRed5Command, red5FixtureAutopilotStep,
  rehydrateRosterRed5Session, replayRosterRed5Session, type FrozenRed5Setup, type RosterRed5Session, type Red5Session,
} from "@lcxxvi/simulation";

function roster(rating?: number) {
  const players = world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
  if (rating !== undefined) for (const player of players) {
    const skills = (player.skills as typeof world.players[number]["skills"]).RED_BALL;
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
  const session = createRosterRed5Session(pack, { gameId: "roster-game", matchId: "roster-match", seed: "test-seed", format: "RED_BALL", selection: { groundId: pack.world.grounds[0]!.groundId, teams } });
  return { pack, session };
}
function next(session: RosterRed5Session) {
  return executeRosterRed5Command(session, red5FixtureAutopilotStep(session as unknown as Red5Session)).session;
}

describe("roster-aware red-ball match", () => {
  it("plays a complete match and reconstructs saved command prefixes", async () => {
    const { pack, session } = start();
    expect(session.executionManifest.engine).toBe("LC_RED5_MATCH_ROSTER_V2");
    expect(session.setup.versions.worldHash).not.toBe(FROZEN_WORLD_PINS.worldCanonicalSha256);
    expect(() => createRed5Session(session.setup as unknown as FrozenRed5Setup)).toThrow("INVALID_FROZEN_SETUP");
    let current = session;
    for (let steps = 0; current.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(3000);
      current = next(current);
      if (steps % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
      if (steps === 5 || steps === 20 || steps === 50) {
        expect(rehydrateRosterRed5Session(structuredClone(current), pack)).toEqual(current);
      }
    }
    expect(current.events.length).toBeGreaterThan(0);
    expect(rehydrateRosterRed5Session(structuredClone(current), pack)).toEqual(current);
    expect(replayRosterRed5Session(current, pack).core).toEqual(current.core);
  }, 180_000);

  it("uses imported ratings in delivery outcomes", async () => {
    let low = start(0).session;
    let high = start(100).session;
    for (let steps = 0; low.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(3000);
      low = next(low);
      if (steps % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    for (let steps = 0; high.core.phase !== "COMPLETE"; steps++) {
      expect(steps).toBeLessThan(3000);
      high = next(high);
      if (steps % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(low.core.innings.map(innings => innings.innings.runs)).not.toEqual(high.core.innings.map(innings => innings.innings.runs));
  }, 180_000);

  it("rejects a damaged pack, tampered session and unverified execution", () => {
    const { pack, session } = start();
    const saved = structuredClone(next(session));
    const corrupted = structuredClone(pack);
    corrupted.world.players[0]!.name = "Changed";
    expect(() => rehydrateRosterRed5Session(saved, corrupted)).toThrow();
    const damaged = structuredClone(saved);
    damaged.events[0]!.eventHash = "0".repeat(64);
    expect(() => rehydrateRosterRed5Session(damaged, pack)).toThrow("SAVE_REPLAY_MISMATCH");
    expect(() => next(structuredClone(session))).toThrow("SESSION_UNVERIFIED");
    session.core.phase = "COMPLETE";
    expect(() => executeRosterRed5Command(session, { commandId: "test", expectedRevision: 0, actorId: "SYSTEM", kind: "CONFIRM_TEAMS", payload: {} })).toThrow("SESSION_TAMPERED");
  });
});
