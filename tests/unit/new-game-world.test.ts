import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { WorldPackSchema } from "@lcxxvi/contracts";
import { createNewGameWorldCopy, validateNewGameWorldCopy } from "../../apps/web/src/world/new-game-world.js";

const base = WorldPackSchema.parse(JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")));

describe("new-game world copies", () => {
  test("creates a deterministic, independently versioned copy without changing the original", () => {
    const draft = structuredClone(base);
    draft.teams[0]!.name = "Harbour XI";
    draft.teams[0]!.colours = ["#123456", "#abcdef"];
    draft.players[0]!.name = "A <script> player";
    draft.grounds[0]!.name = "The New Ground";
    const before = JSON.stringify(base);
    const copy = createNewGameWorldCopy(draft, base);
    expect(copy).toEqual(createNewGameWorldCopy(draft, base));
    expect(copy.copyVersion).toBe("LC_NEW_GAME_WORLD_COPY_V1");
    expect(copy.world.packId).not.toBe(base.packId);
    expect(copy.world.teams[0]!.teamId).toBe(base.teams[0]!.teamId);
    expect(copy.world.players[0]!.playerId).toBe(base.players[0]!.playerId);
    expect(copy.world.grounds[0]!.groundId).toBe(base.grounds[0]!.groundId);
    expect(copy.world.players[0]!.skills).toEqual(base.players[0]!.skills);
    expect(validateNewGameWorldCopy(JSON.parse(JSON.stringify(copy)), base)).toEqual(copy);
    expect(JSON.stringify(base)).toBe(before);
    expect(draft.packId).toBe(base.packId);
  });

  test("rejects identity, rating, roster and pitch changes", () => {
    for (const mutate of [
      (draft: typeof base) => { draft.players[0]!.playerId = "changed"; },
      (draft: typeof base) => { draft.players[0]!.skills.T20!.power += 1; },
      (draft: typeof base) => { draft.teams[0]!.squadIds.reverse(); },
      (draft: typeof base) => { draft.grounds[0]!.pitchPrior.seamBp += 1; },
    ]) {
      const draft = structuredClone(base);
      mutate(draft);
      expect(() => createNewGameWorldCopy(draft, base)).toThrow();
    }
  });

  test("rejects malformed names, colours and copies with altered content or versions", () => {
    for (const name of ["", "  Team", "Team\nName", "x".repeat(81)]) {
      const draft = structuredClone(base);
      draft.teams[0]!.name = name;
      expect(() => createNewGameWorldCopy(draft, base)).toThrow();
    }
    const invalidColour = structuredClone(base);
    invalidColour.teams[0]!.colours[0] = "red";
    expect(() => createNewGameWorldCopy(invalidColour, base)).toThrow();
    const copy = createNewGameWorldCopy(base, base);
    const altered = structuredClone(copy);
    altered.world.players[0]!.name = "Changed after sealing";
    expect(() => validateNewGameWorldCopy(altered, base)).toThrow(/hash/i);
    expect(() => validateNewGameWorldCopy({ ...copy, copyVersion: "LC_NEW_GAME_WORLD_COPY_V2" }, base)).toThrow(/version/i);
    expect(() => validateNewGameWorldCopy({ ...copy, extra: true }, base)).toThrow();
  });
});
