import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UserCompetitionSchema, UserTourSchema, type TournamentResult, type UserTour, type WorldPack } from "@lcxxvi/contracts";
import { isBowlingCapable } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { generatedRosterPack, playGeneratedFixture, squadXI, tourCompetition, tourSquads, touringTeamId, touringXI } from "../../apps/web/src/tournament/generated-roster.js";

// Stage 15 tours (owner decisions A1a and A2a, 18 November 2026): a tournament-only series against a touring XI picked
// automatically from the other seven clubs, played through the roster path on the frozen rules.
const root = resolve(import.meta.dirname, "../..");
const world = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json"), "utf8")) as WorldPack;
const tour = (over: Partial<UserTour> = {}): UserTour =>
  UserTourSchema.parse({ tourId: "user-tour-test", title: "Ridge Tour", format: "T20", hostTeamId: "team-03", touringName: "Invitation XI", matches: 3, groundIds: ["ground-03"], ...over });

function playTour(t: UserTour, runSeed: string): TournamentResult[] {
  const squads = tourSquads(world, t);
  const pack = generatedRosterPack(world, t.tourId, squads);
  const competition = tourCompetition(t);
  const results: TournamentResult[] = [];
  for (let guard = 0; guard < 8; guard++) {
    const next = viewTournament(competition, results).next;
    if (!next) break;
    results.push(playGeneratedFixture({ world, pack, squads, competition, fixture: next, runId: "tour-run", runSeed, teamName: (id) => squads.find((s) => s.teamId === id)!.name }));
  }
  return results;
}

describe("Stage 15 tours", () => {
  it("picks the touring XI by the fixed rating rule, never from the host club", () => {
    for (const host of world.teams) {
      for (const format of ["T20", "ODI"] as const) {
        const xi = touringXI(world, host.teamId, format);
        expect(xi.squadIds).toHaveLength(11);
        expect(new Set(xi.squadIds).size).toBe(11);
        expect(xi.squadIds.some((id) => host.squadIds.includes(id))).toBe(false);
        const players = xi.squadIds.map((id) => world.players.find((p) => p.playerId === id)!);
        expect(players.filter((p) => p.role === "KEEPER").map((p) => p.playerId)).toEqual([xi.keeperId]);
        expect(players.filter(isBowlingCapable).length).toBeGreaterThanOrEqual(5);
        expect(touringXI(world, host.teamId, format)).toEqual(xi);
      }
    }
    // The keeper is the best by keeping plus batting among every non-host keeper.
    const xi = touringXI(world, "team-03", "T20");
    const keeperScore = (id: string) => {
      const s = world.players.find((p) => p.playerId === id)!.skills.T20;
      return s.keeping + s.timing + s.defence;
    };
    const hostIds = new Set(world.teams.find((t) => t.teamId === "team-03")!.squadIds);
    const others = world.players.filter((p) => p.role === "KEEPER" && !hostIds.has(p.playerId));
    expect(Math.max(...others.map((p) => keeperScore(p.playerId)))).toBe(keeperScore(xi.keeperId));
  });

  it("plays a tour series to a result on the frozen rules, deterministically", () => {
    const t = tour();
    const a = playTour(t, "seed-1");
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(playTour(t, "seed-1")).toEqual(a);
    expect(viewTournament(tourCompetition(t), a).outcome.status).not.toBe("IN_PROGRESS");
    for (const r of a) expect([r.homeTeamId, r.awayTeamId].sort()).toEqual(["team-03", touringTeamId(t)].sort());
    // A one-day tour works the same way.
    const odi = playTour(tour({ tourId: "user-tour-odi", format: "ODI", matches: 1, hostTeamId: "team-07", groundIds: ["ground-07"] }), "seed-2");
    expect(odi).toHaveLength(1);
  }, 180_000);

  it("keeps a tour's series an ordinary user-authored competition", () => {
    const t = tour();
    const c = tourCompetition(t);
    expect(UserCompetitionSchema.parse(c)).toEqual(c);
    expect(c.teamIds).toEqual(["team-03", "xi-test"]);
    expect(() => UserTourSchema.parse({ ...t, tourId: "user-test" })).toThrow();
    // The generated roster holds just the two sides and passes the normal roster checks.
    const pack = generatedRosterPack(world, t.tourId, tourSquads(world, t));
    expect(pack.world.teams.map((x) => x.teamId)).toEqual(["team-03", "xi-test"]);
    expect(pack.world.players).toHaveLength(31);
    expect(squadXI(world, tourSquads(world, t)[1].squadIds).playerIds).toHaveLength(11);
  });
});
