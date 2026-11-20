import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { WorldPack } from "@lcxxvi/contracts";
import { overallRating, playerStrengths, portraitSpec, ratingTier } from "../../apps/web/src/world/player-visuals.js";
import { playerRating } from "../../apps/web/src/tournament/auction.js";

// Visual overhaul phase 2: portraits are stable identities, and the rating on cards is the auction's public rating.
const world = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../packages/data/worlds/fictional-eight-01.json"), "utf8")) as WorldPack;

describe("player visuals", () => {
  it("draws the same face for the same player, in the club's kit, and varies faces across a squad", () => {
    const p = world.players[0]!;
    const kit = world.teams[0]!.colours;
    expect(portraitSpec(p.playerId, p.role, kit)).toEqual(portraitSpec(p.playerId, p.role, kit));
    expect(portraitSpec(p.playerId, p.role, kit).shirt).toBe(kit[0]);
    const faces = new Set(world.teams[0]!.squadIds.map((id) => JSON.stringify({ ...portraitSpec(id, "BATTER", kit), headgear: null })));
    expect(faces.size).toBeGreaterThan(10);
    expect(portraitSpec("x", "KEEPER", ["not-a-colour"]).shirt).toBe("#2f4f4f");
    expect(portraitSpec("x", "KEEPER", kit).headgear).toBe("HELMET");
    expect(portraitSpec("x", "BOWLER", kit).headgear).toBe("CAP");
  });

  it("shows the auction's public rating for every player and format, and strengths within 0 to 100", () => {
    for (const p of world.players) {
      for (const format of ["T20", "ODI"] as const) expect(overallRating(p, format)).toBe(playerRating(p, format));
      const s = playerStrengths(p, "T20");
      for (const v of Object.values(s)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    expect([ratingTier(85), ratingTier(72), ratingTier(61), ratingTier(40)]).toEqual(["ELITE", "STRONG", "SOLID", "DEVELOPING"]);
  });
});
