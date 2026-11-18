import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TournamentAuctionRecordSchema, type TournamentResult, type WorldPack } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK, isBowlingCapable } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import {
  AUCTION_BUDGET,
  AUCTION_MIN_BOWLERS,
  AUCTION_SQUAD_SIZE,
  auctionSquads,
  auctionSquadsSha256,
  awaitingPlayer,
  createAuction,
  decideLot,
  maxAffordable,
  replayAuction,
  reservePrice,
  type AuctionDecision,
  type AuctionState,
} from "../../apps/web/src/tournament/auction.js";
import { generatedRosterPack, playGeneratedFixture } from "../../apps/web/src/tournament/generated-roster.js";
import { buildUserCompetition } from "../../apps/web/src/tournament/user-competitions.js";

// Stage 15 tournament auctions (owner decisions B1a, B2b, B3a and B4a, 18 November 2026).
const root = resolve(import.meta.dirname, "../..");
const world = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json"), "utf8")) as WorldPack;
const eight = TOURNAMENT_PACK.competitions[0]!;
const byId = new Map(world.players.map((p) => [p.playerId, p]));

/** Plays the player's side with a simple strategy: bid the reserve plus 2 on keepers and bowlers, otherwise pass. */
function run(seed: string, team: string | null, autoAfter = Infinity): AuctionState {
  let s = createAuction(world, eight, seed, team);
  for (let n = 0; !s.complete; n++) {
    const p = byId.get(s.order[s.nextLot]!)!;
    const yours = s.teams.find((t) => t.teamId === team)!;
    const want = p.role === "KEEPER" || isBowlingCapable(p);
    const max = Math.min(maxAffordable(world, yours), reservePrice(p, s.format) + 2);
    const d: AuctionDecision = n >= autoAfter ? { kind: "AUTO" } : want && max >= reservePrice(p, s.format) ? { kind: "BID", max } : { kind: "PASS" };
    s = decideLot(world, s, d);
  }
  return s;
}

function checkSquads(s: AuctionState): void {
  const all = s.teams.flatMap((t) => t.squadIds);
  expect(new Set(all).size).toBe(all.length);
  for (const t of s.teams) {
    expect(t.squadIds).toHaveLength(AUCTION_SQUAD_SIZE);
    expect(t.budget).toBeGreaterThanOrEqual(0);
    const squad = t.squadIds.map((id) => byId.get(id)!);
    expect(squad.some((p) => p.role === "KEEPER")).toBe(true);
    expect(squad.filter(isBowlingCapable).length).toBeGreaterThanOrEqual(AUCTION_MIN_BOWLERS);
    const spent = s.lots.filter((l) => l.winnerTeamId === t.teamId).reduce((a, l) => a + l.price, 0);
    expect(spent + t.budget).toBe(AUCTION_BUDGET);
  }
}

describe("Stage 15 tournament auctions", () => {
  it("completes balanced squads within budget, with the AI bidding for every team", () => {
    for (const seed of ["a-1", "a-2", "a-3"]) {
      const s = createAuction(world, eight, seed, null);
      expect(s.complete).toBe(true);
      expect(s.decisions).toEqual([]);
      checkSquads(s);
      // The AI paces its purse: no team buys its last players for nothing.
      expect(s.lots.filter((l) => l.winnerTeamId && l.price === 0)).toEqual([]);
    }
  });

  it("lets the player bid for one team, and is reproduced exactly from the stored decisions", () => {
    const s = run("p-1", "team-01");
    checkSquads(s);
    expect(s.decisions.length).toBeGreaterThan(5);
    const again = replayAuction(world, eight, "p-1", "team-01", s.decisions);
    expect(auctionSquadsSha256(auctionSquads(world, again))).toBe(auctionSquadsSha256(auctionSquads(world, s)));
    // Handing over to the AI part-way still completes.
    const handed = run("p-2", "team-04", 3);
    checkSquads(handed);
    expect(handed.decisions.at(-1)).toEqual({ kind: "AUTO" });
    const record = TournamentAuctionRecordSchema.parse({
      schemaId: "LC_TOURNAMENT_AUCTION_V1",
      runId: "run-x",
      competitionId: eight.competitionId,
      seed: "p-1",
      playerTeamId: "team-01",
      decisions: s.decisions,
      squadsSha256: auctionSquadsSha256(auctionSquads(world, s)),
    });
    // A changed decision gives different squads (or is refused), so a tampered record fails its check.
    const tampered = record.decisions.map((d) => (d.kind === "BID" ? { kind: "PASS" as const } : d));
    let differs = true;
    try {
      differs = auctionSquadsSha256(auctionSquads(world, replayAuction(world, eight, "p-1", "team-01", tampered))) !== record.squadsSha256;
    } catch {
      differs = true;
    }
    expect(differs).toBe(true);
  });

  it("refuses bids the rules do not allow, without changing the auction", () => {
    let s = createAuction(world, eight, "r-1", "team-02");
    expect(awaitingPlayer(world, s)).toBe(true);
    const p = byId.get(s.order[s.nextLot]!)!;
    const yours = s.teams.find((t) => t.teamId === "team-02")!;
    expect(() => decideLot(world, s, { kind: "BID", max: reservePrice(p, "T20") - 1 })).toThrow("AUCTION_BID_BELOW_RESERVE");
    expect(() => decideLot(world, s, { kind: "BID", max: maxAffordable(world, yours) + 1 })).toThrow("AUCTION_BID_OVER_BUDGET");
    expect(s.nextLot).toBe(0);
    s = decideLot(world, s, { kind: "BID", max: maxAffordable(world, yours) });
    // The top bid always wins the lot (it may tie only with another maximum bid).
    expect(s.lots[0]!.winnerTeamId).not.toBeNull();
    expect(() => createAuction(world, eight, "r-2", "team-99")).toThrow("AUCTION_TEAM_UNKNOWN");
  });

  it("plays a tournament with auctioned squads on the frozen rules", () => {
    const comp = buildUserCompetition({ title: "Auction Cup", format: "T20", structure: "ROUND_ROBIN", seriesMatches: 3, teamIds: ["team-02", "team-05", "team-08"], groundIds: ["ground-02"] }, "user-auction", world);
    const s = createAuction(world, comp, "auction-play", null);
    const squads = auctionSquads(world, s);
    const pack = generatedRosterPack(world, "auction-run", squads);
    const results: TournamentResult[] = [];
    for (let guard = 0; guard < 5; guard++) {
      const next = viewTournament(comp, results).next;
      if (!next) break;
      results.push(playGeneratedFixture({ world, pack, squads, competition: comp, fixture: next, runId: "auction-run", runSeed: "seed", teamName: (id) => id }));
    }
    expect(results).toHaveLength(3);
    expect(viewTournament(comp, results).outcome.status).not.toBe("IN_PROGRESS");
  }, 120_000);
});
