import { describe, expect, it } from "vitest";
import world from "../../packages/data/worlds/fictional-eight-01.json" with { type: "json" };
import { createStagedRosterPack, prepareRosterMatch, stageRosterImport, validateRosterMatchSelection, validateStagedRosterPack } from "@lcxxvi/simulation";

function input() {
  return {
    version: "LC_ROSTER_IMPORT_V1",
    sourceId: "user-roster",
    world: {
      ...structuredClone(world),
      players: world.players.map(player => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")) as Omit<typeof player, "provenance">),
    },
  };
}
const stage = (value: unknown) => stageRosterImport(JSON.stringify(value), world.rulesIds, ["stock"]);

describe("staged roster import", () => {
  it("preserves supplied ratings and records missing fields as low-confidence priors", () => {
    const source = input();
    const player = source.world.players[0]!;
    const profiles = player.skills as Partial<typeof player.skills>;
    delete profiles.ODI;
    const exposure = player.exposureBalls as Partial<typeof player.exposureBalls>;
    delete exposure.ODI;
    const result = stage(source);
    expect(result.world.packId).toBe(`world-import-${result.sourceHash}`);
    expect(result.world.players[0]!.skills.T20).toEqual(player.skills.T20);
    expect(result.world.players[0]!.skills.ODI.defence).toBe(50);
    expect(result.world.players[0]!.exposureBalls.ODI).toBe(0);
    expect(result.world.players[0]!.provenance).toMatchObject({ kind: "USER_SUPPLIED", sourceId: "user-roster", sourceHash: result.sourceHash, confidenceBp: 1000 });
    expect(result.priorFields).toContainEqual(expect.objectContaining({ playerId: player.playerId, format: "ODI", exposureMissing: true }));
    expect(stage(source).sourceHash).toBe(result.sourceHash);
  });

  it("rejects oversized new packs while retaining validation of earlier packs", () => {
    const sourceText = JSON.stringify(input()) + " ".repeat(8 * 1024 * 1024);
    expect(() => createStagedRosterPack(sourceText, world.rulesIds, ["stock"])).toThrow("8 MiB");
    const existing = { version: "LC_STAGED_ROSTER_PACK_V1" as const, sourceText, ...stageRosterImport(sourceText, world.rulesIds, ["stock"]) };
    expect(validateStagedRosterPack(existing, world.rulesIds, ["stock"]).sourceHash).toBe(existing.sourceHash);
  }, 30_000);

  it("fills all three profiles when statistical objects are absent", () => {
    const source = input();
    const player = source.world.players[0]!;
    const missing = player as Partial<typeof player>;
    delete missing.skills;
    delete missing.exposureBalls;
    const result = stage(source);
    expect(result.priorFields.filter(item => item.playerId === player.playerId)).toHaveLength(3);
    expect(result.world.players[0]!.skills.RED_BALL.keeping).toBe(50);
  });

  it("rebuilds a staged pack and rejects changed players, priors and versions", () => {
    const source = input();
    delete (source.world.players[0]!.skills as Partial<typeof source.world.players[number]["skills"]>).ODI;
    const pack = createStagedRosterPack(JSON.stringify(source), world.rulesIds, ["stock"]);
    expect(validateStagedRosterPack(pack, world.rulesIds, ["stock"])).toEqual(pack);
    const altered = structuredClone(pack);
    altered.world.players[0]!.skills.T20.power = 99;
    expect(() => validateStagedRosterPack(altered, world.rulesIds, ["stock"])).toThrow(/do not match/);
    const changedPriors = structuredClone(pack);
    changedPriors.priorFields[0]!.fields = [];
    expect(() => validateStagedRosterPack(changedPriors, world.rulesIds, ["stock"])).toThrow(/do not match/);
    const version = { ...pack, version: "LC_STAGED_ROSTER_PACK_V2" };
    expect(() => validateStagedRosterPack(version, world.rulesIds, ["stock"])).toThrow();
  });

  it("validates the actual two XIs, captain, keeper and bowling capacity", () => {
    const pack = createStagedRosterPack(JSON.stringify(input()), world.rulesIds, ["stock"]);
    const teams = pack.world.teams.slice(0, 2).map(team => {
      const squad = team.squadIds.map(id => pack.world.players.find(player => player.playerId === id)!);
      const keeper = squad.find(player => player.role === "KEEPER")!;
      const bowlers = squad.filter(player => player.bowlingStyle && ["BOWLER", "ALLROUNDER"].includes(player.role)).slice(0, 5);
      const selected = [keeper, ...bowlers, ...squad.filter(player => player !== keeper && !bowlers.includes(player))].slice(0, 11);
      return { teamId: team.teamId, playerIds: selected.map(player => player.playerId), keeperId: keeper.playerId, captainId: selected[0]!.playerId };
    });
    const match = { groundId: pack.world.grounds[0]!.groundId, teams };
    expect(validateRosterMatchSelection(pack, match, world.rulesIds, ["stock"]).selection.teams).toHaveLength(2);
    for (const format of ["T20", "ODI", "RED_BALL"]) {
      const setup = prepareRosterMatch(pack, { gameId: "game", matchId: "match", seed: "seed", format, selection: match });
      expect(setup.format).toBe(format);
      expect(setup.teams[0]!.xi.map(player => player.playerId)).toEqual(teams[0]!.playerIds);
      expect(Object.isFrozen(setup.teams[0]!.xi[0]!.skills.T20)).toBe(true);
      expect(setup.worldHash).toMatch(/^[a-f0-9]{64}$/);
    }
    const invalid = structuredClone(match);
    invalid.teams[0]!.playerIds[1] = invalid.teams[0]!.playerIds[0]!;
    expect(() => validateRosterMatchSelection(pack, invalid, world.rulesIds, ["stock"])).toThrow(/XI membership/);
    const keeper = structuredClone(match);
    keeper.teams[0]!.keeperId = keeper.teams[0]!.playerIds[1]!;
    expect(() => validateRosterMatchSelection(pack, keeper, world.rulesIds, ["stock"])).toThrow(/eligible captain and keeper/);
    const noBowlers = structuredClone(match);
    const side = pack.world.teams.find(team => team.teamId === noBowlers.teams[0]!.teamId)!;
    const others = side.squadIds.filter(id => {
      const player = pack.world.players.find(item => item.playerId === id)!;
      return id !== noBowlers.teams[0]!.keeperId && !(player.bowlingStyle && ["BOWLER", "ALLROUNDER"].includes(player.role));
    });
    noBowlers.teams[0]!.playerIds = [noBowlers.teams[0]!.keeperId, ...others].slice(0, 11);
    expect(() => validateRosterMatchSelection(pack, noBowlers, world.rulesIds, ["stock"])).toThrow(/five bowling-capable/);
  });

  it("rejects oversized files, unknown versions, missing structure and model variations", () => {
    expect(() => stageRosterImport(" ".repeat(25_000_001), world.rulesIds, ["stock"])).toThrow(/25 MB/);
    const version = input();
    version.version = "LC_ROSTER_IMPORT_V2";
    expect(() => stage(version)).toThrow();
    const structural = input();
    delete (structural.world.players[0] as Partial<typeof structural.world.players[number]>).birthDate;
    expect(() => stage(structural)).toThrow();
    const variation = input();
    variation.world.players[0]!.variations = ["unapproved"];
    expect(() => stage(variation)).toThrow(/variation/);
  });

  it("rejects executable fields, unresolved and shared players, and a squad with no keeper", () => {
    const controls = input();
    controls.world.players[0]!.name = "Invalid\nName";
    expect(() => stage(controls)).toThrow(/control characters/);
    const script = input();
    Object.assign(script.world.players[0]!, { script: "alert(1)" });
    expect(() => stage(script)).toThrow();
    const missing = input();
    missing.world.teams[0]!.squadIds[0] = "unknown";
    expect(() => stage(missing)).toThrow();
    const shared = input();
    shared.world.teams[1]!.squadIds[0] = shared.world.teams[0]!.squadIds[0]!;
    expect(() => stage(shared)).toThrow(/multiple squads/);
    const noKeeper = input();
    const ids = new Set(noKeeper.world.teams[0]!.squadIds);
    for (const player of noKeeper.world.players) if (ids.has(player.playerId) && player.role === "KEEPER") player.role = "BATTER";
    expect(() => stage(noKeeper)).toThrow(/valid XI/);
    const noBowlers = input();
    const squadIds = new Set(noBowlers.world.teams[0]!.squadIds);
    for (const player of noBowlers.world.players) if (squadIds.has(player.playerId)) player.bowlingStyle = null as unknown as typeof player.bowlingStyle;
    expect(() => stage(noBowlers)).toThrow(/valid XI/);
  });
});
