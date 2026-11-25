import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ELEVEN_ALL_ROUND_BATTING_WEIGHT, ELEVEN_ALL_ROUND_BOWLING_WEIGHT, SUGGESTED_ELEVEN_MIN_BOWLERS, isBowlingCapable, suggestedEleven } from "@lcxxvi/data";
import type { WorldPack } from "@lcxxvi/contracts";

const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")) as WorldPack;
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const squadOf = (teamId: string) => world.teams.find((t) => t.teamId === teamId)!.squadIds.map((id) => byId.get(id)!);
const batting = (id: string, format: "T20" | "ODI" | "RED_BALL") => {
  const s = byId.get(id)!.skills[format];
  return s.timing + s.power + s.defence + s.rotation;
};

describe("Pavilion P04 stage A: the suggested eleven", () => {
  for (const format of ["T20", "ODI", "RED_BALL"] as const) {
    test(`${format}: every club fields a keeper, specialist batters and at least six bowlers, in batting order`, () => {
      for (const team of world.teams) {
        const squad = squadOf(team.teamId);
        const xi = suggestedEleven(squad, format);
        const players = xi.playerIds.map((id) => byId.get(id)!);
        expect(new Set(xi.playerIds).size).toBe(11);
        expect(xi.playerIds.every((id) => team.squadIds.includes(id))).toBe(true);
        expect(byId.get(xi.keeperId)!.role).toBe("KEEPER");
        expect(xi.playerIds).toContain(xi.keeperId);
        expect(xi.captainId).toBe(xi.keeperId);
        expect(players.filter(isBowlingCapable).length).toBeGreaterThanOrEqual(SUGGESTED_ELEVEN_MIN_BOWLERS);
        expect(players.filter((p) => p.role === "BATTER").length).toBeGreaterThanOrEqual(3);
        const scores = xi.playerIds.map((id) => batting(id, format));
        expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      }
    });
  }

  test("ignores squad order and is deterministic", () => {
    const squad = squadOf(world.teams[0]!.teamId);
    const a = suggestedEleven(squad, "T20");
    expect(suggestedEleven([...squad].reverse(), "T20")).toEqual(a);
    expect(suggestedEleven(squad, "T20")).toEqual(a);
  });

  test("brings in a bowler when the best batters leave too few", () => {
    const squad = squadOf(world.teams[0]!.teamId);
    const keepers = squad.filter((p) => p.role === "KEEPER");
    const batters = squad.filter((p) => p.role === "BATTER");
    const bowlers = squad.filter(isBowlingCapable).slice(0, 6);
    const xi = suggestedEleven([...keepers, ...batters, ...bowlers], "T20");
    expect(xi.playerIds.map((id) => byId.get(id)!).filter(isBowlingCapable).length).toBe(6);
  });

  test("tops up the bowling with the player who adds most in all, so an all-rounder beats a slightly better bowler", () => {
    // Owner decision, 25 November 2026: 3 x batting + 4 x bowling (batting and bowling per skill) picks the top-up.
    expect([ELEVEN_ALL_ROUND_BATTING_WEIGHT, ELEVEN_ALL_ROUND_BOWLING_WEIGHT]).toEqual([3, 4]);
    const bowlingOf = (id: string) => { const k = byId.get(id)!.skills.T20; return k.control + k.movement + k.variation; };
    const allRound = (id: string) => 3 * batting(id, "T20") + 4 * bowlingOf(id);
    let allRoundersPicked = 0;
    for (const team of world.teams) {
      const squad = squadOf(team.teamId);
      const xi = suggestedEleven(squad, "T20");
      const inXI = new Set(xi.playerIds);
      const attack = squad.filter(isBowlingCapable).sort((a, b) => bowlingOf(b.playerId) - bowlingOf(a.playerId) || (a.playerId < b.playerId ? -1 : 1)).slice(0, 4);
      const toppedUp = xi.playerIds.filter((id) => isBowlingCapable(byId.get(id)!) && !attack.some((p) => p.playerId === id));
      const benched = squad.filter((p) => isBowlingCapable(p) && !inXI.has(p.playerId));
      // No bowling-capable player left out adds more in all than one brought in to top up the bowling.
      for (const id of toppedUp) for (const out of benched) expect(allRound(id)).toBeGreaterThanOrEqual(allRound(out.playerId));
      allRoundersPicked += xi.playerIds.filter((id) => byId.get(id)!.role === "ALLROUNDER").length;
    }
    expect(allRoundersPicked).toBeGreaterThan(0);
  });

  test("a squad without a keeper is refused", () => {
    expect(() => suggestedEleven(squadOf(world.teams[0]!.teamId).filter((p) => p.role !== "KEEPER"), "T20")).toThrow("A squad needs a keeper.");
  });
});
