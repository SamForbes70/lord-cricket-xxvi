import type { Competition, WorldPack } from "@lcxxvi/contracts";
import { isBowlingCapable } from "@lcxxvi/data";
import { createRandomService, createStateHasher } from "@lcxxvi/simulation";
import type { GeneratedSquad } from "./generated-roster.js";

/**
 * Stage 15 tournament auctions (owner decisions B1a, B2b, B3a and B4a, 18 November 2026).
 *
 * Before one of the player's own tournaments starts, every team's squad is rebuilt by an auction of the fictional
 * world's 160 players. Pure and deterministic: the result is a function of the competition, the run seed and the
 * player's decisions, so a stored auction is checked by running it again.
 *
 * Rules as built:
 * - Each team buys `AUCTION_SQUAD_SIZE` players with a budget of `AUCTION_BUDGET` credits (fictional, no real money).
 * - Players come up one at a time, best rated first (ties in a seeded order). A player's reserve price is 1 to 5 credits
 *   by rating.
 * - Every team gives a maximum bid (or none). The highest maximum wins, paying one credit more than the second-highest
 *   maximum, never more than its own maximum and never less than the reserve. A tie goes to a seeded order.
 * - Squad balance (B4a): a team may only buy a player if it can still complete a squad with a keeper and
 *   `AUCTION_MIN_BOWLERS` bowling-capable players, and it must always keep 1 credit for each slot it still has to fill.
 * - The AI bids for every team but the player's (B3a), from public ratings only, with a small seeded variation per
 *   team and player so teams value players differently. The player can hand their own bidding to the AI at any point.
 * - If a team is still short when every player has come up, it takes the best unsold players it may take, at reserve.
 */

export const AUCTION_BUDGET = 100;
export const AUCTION_SQUAD_SIZE = 13;
export const AUCTION_MIN_BOWLERS = 5;

type Player = WorldPack["players"][number];
export type AuctionDecision = { kind: "BID"; max: number } | { kind: "PASS" } | { kind: "AUTO" };

export type AuctionLotResult = { playerId: string; winnerTeamId: string | null; price: number };
export type AuctionTeamState = { teamId: string; budget: number; squadIds: string[] };
export type AuctionState = {
  competitionId: string;
  format: "T20" | "ODI";
  seed: string;
  playerTeamId: string | null;
  /** The player handed their bidding to the AI. */
  auto: boolean;
  order: string[];
  nextLot: number;
  teams: AuctionTeamState[];
  lots: AuctionLotResult[];
  decisions: AuctionDecision[];
  complete: boolean;
};

const random = createRandomService();
const hash = (v: unknown) => createStateHasher().hash(v);

/** A player's public rating for a format: the better of their batting, bowling and keeping-and-batting. */
export function playerRating(p: Player, format: "T20" | "ODI"): number {
  const s = p.skills[format];
  const bat = (s.timing + s.power + s.defence + s.rotation) / 4;
  const bowl = isBowlingCapable(p) ? (s.control + s.movement) / 2 : 0;
  const keep = p.role === "KEEPER" ? (s.keeping + bat) / 2 : 0;
  return Math.round(Math.max(bat, bowl, keep));
}

/** The reserve price: 1 to 4 credits by rating. */
export function reservePrice(p: Player, format: "T20" | "ODI"): number {
  return Math.min(4, Math.max(1, 1 + Math.floor((playerRating(p, format) - 50) / 8)));
}

function draw(seed: string, entity: string, stage: string): number {
  return random.uint32({ seed, domain: "AI_TIE_BREAK", entityId: entity.slice(0, 128), eventOrdinal: 0, stageName: stage, drawIndex: 0 });
}

function players(world: WorldPack): Map<string, Player> {
  return new Map(world.players.map((p) => [p.playerId, p]));
}

function needs(world: WorldPack, team: AuctionTeamState): { keeper: number; bowlers: number; slots: number } {
  const byId = players(world);
  const squad = team.squadIds.map((id) => byId.get(id)!);
  return {
    keeper: squad.some((p) => p.role === "KEEPER") ? 0 : 1,
    bowlers: Math.max(0, AUCTION_MIN_BOWLERS - squad.filter(isBowlingCapable).length),
    slots: AUCTION_SQUAD_SIZE - squad.length,
  };
}

/** Whether `team` may buy `p` under the squad-balance rule (B4a). */
export function mayBuy(world: WorldPack, team: AuctionTeamState, p: Player): boolean {
  const n = needs(world, team);
  if (n.slots <= 0) return false;
  const keeper = Math.max(0, n.keeper - (p.role === "KEEPER" ? 1 : 0));
  const bowlers = Math.max(0, n.bowlers - (isBowlingCapable(p) ? 1 : 0));
  return keeper + bowlers <= n.slots - 1;
}

/** The most a team may bid now: it keeps 1 credit for every other slot it still has to fill. */
export function maxAffordable(world: WorldPack, team: AuctionTeamState): number {
  return team.budget - Math.max(0, needs(world, team).slots - 1);
}

/** The AI's maximum bid for a player (public ratings and squad needs only), or null for no bid. */
export function aiMaxBid(world: WorldPack, state: AuctionState, team: AuctionTeamState, p: Player): number | null {
  if (!mayBuy(world, team, p)) return null;
  const n = needs(world, team);
  const reserve = reservePrice(p, state.format);
  const rating = playerRating(p, state.format);
  const noise = (draw(state.seed, `${team.teamId}:${p.playerId}`, "auction-value") % 5) - 2;
  const needBonus = (n.keeper && p.role === "KEEPER" ? 3 : 0) + (n.bowlers && isBowlingCapable(p) ? 1 : 0);
  // Pace the purse: value a player against the team's share per remaining slot, more for a better player, and keep
  // about 2 credits for each other slot still to fill.
  const share = n.slots > 0 ? team.budget / n.slots : 0;
  const value = Math.round(share * (rating / 62) ** 3 + needBonus + noise);
  const max = Math.min(value, maxAffordable(world, team), team.budget - 2 * Math.max(0, n.slots - 1));
  return max >= reserve ? max : null;
}

export function createAuction(world: WorldPack, competition: Competition, seed: string, playerTeamId: string | null): AuctionState {
  if (playerTeamId !== null && !competition.teamIds.includes(playerTeamId)) throw new Error("AUCTION_TEAM_UNKNOWN");
  const format = competition.format;
  const order = [...world.players]
    .sort((a, b) => playerRating(b, format) - playerRating(a, format) || draw(seed, a.playerId, "auction-order") - draw(seed, b.playerId, "auction-order"))
    .map((p) => p.playerId);
  const state: AuctionState = {
    competitionId: competition.competitionId,
    format,
    seed,
    playerTeamId,
    auto: playerTeamId === null,
    order,
    nextLot: 0,
    teams: competition.teamIds.map((teamId) => ({ teamId, budget: AUCTION_BUDGET, squadIds: [] })),
    lots: [],
    decisions: [],
    complete: false,
  };
  advance(world, state);
  return state;
}

/** Whether the player must decide the current lot. */
export function awaitingPlayer(world: WorldPack, state: AuctionState): boolean {
  if (state.complete || state.auto || state.playerTeamId === null) return false;
  const team = state.teams.find((t) => t.teamId === state.playerTeamId)!;
  const p = players(world).get(state.order[state.nextLot]!)!;
  return mayBuy(world, team, p) && maxAffordable(world, team) >= reservePrice(p, state.format);
}

function resolveLot(world: WorldPack, state: AuctionState, playerMax: number | null): void {
  const p = players(world).get(state.order[state.nextLot]!)!;
  const reserve = reservePrice(p, state.format);
  const bids: { teamId: string; max: number; tie: number }[] = [];
  for (const team of state.teams) {
    const max = team.teamId === state.playerTeamId && !state.auto ? playerMax : aiMaxBid(world, state, team, p);
    if (max !== null && max >= reserve && mayBuy(world, team, p) && max <= maxAffordable(world, team)) {
      bids.push({ teamId: team.teamId, max, tie: draw(state.seed, `${state.nextLot}:${team.teamId}`, "auction-tie") });
    }
  }
  bids.sort((a, b) => b.max - a.max || a.tie - b.tie);
  const winner = bids[0];
  if (!winner) state.lots.push({ playerId: p.playerId, winnerTeamId: null, price: 0 });
  else {
    const price = Math.max(reserve, Math.min(winner.max, (bids[1]?.max ?? reserve - 1) + 1));
    const team = state.teams.find((t) => t.teamId === winner.teamId)!;
    team.budget -= price;
    team.squadIds.push(p.playerId);
    state.lots.push({ playerId: p.playerId, winnerTeamId: winner.teamId, price });
  }
  state.nextLot += 1;
}

/** Fills any squad still short at the end with the best unsold players it may take, at reserve. */
function finish(world: WorldPack, state: AuctionState): void {
  const byId = players(world);
  const sold = new Set(state.teams.flatMap((t) => t.squadIds));
  for (const team of state.teams) {
    for (const id of state.order) {
      if (needs(world, team).slots === 0) break;
      const p = byId.get(id)!;
      if (sold.has(id) || !mayBuy(world, team, p)) continue;
      const price = Math.min(reservePrice(p, state.format), Math.max(0, team.budget));
      team.budget -= price;
      team.squadIds.push(id);
      sold.add(id);
      state.lots.push({ playerId: id, winnerTeamId: team.teamId, price });
    }
    if (needs(world, team).slots !== 0) throw new Error("AUCTION_SQUAD_INCOMPLETE");
  }
  state.complete = true;
}

/** Resolves lots the player has no say in, stopping at the next lot that needs the player (or the end). */
function advance(world: WorldPack, state: AuctionState): void {
  while (!state.complete) {
    if (state.teams.every((t) => needs(world, t).slots === 0) || state.nextLot >= state.order.length) {
      finish(world, state);
      return;
    }
    if (awaitingPlayer(world, state)) return;
    resolveLot(world, state, null);
  }
}

/** Applies the player's decision on the current lot. Throws on a bid the rules do not allow; the input is unchanged. */
export function decideLot(world: WorldPack, input: AuctionState, decision: AuctionDecision): AuctionState {
  if (!awaitingPlayer(world, input)) throw new Error("AUCTION_NOT_AWAITING_PLAYER");
  const state = structuredClone(input);
  const team = state.teams.find((t) => t.teamId === state.playerTeamId)!;
  const p = players(world).get(state.order[state.nextLot]!)!;
  if (decision.kind === "BID") {
    if (!Number.isInteger(decision.max) || decision.max < reservePrice(p, state.format)) throw new Error("AUCTION_BID_BELOW_RESERVE");
    if (decision.max > maxAffordable(world, team)) throw new Error("AUCTION_BID_OVER_BUDGET");
  }
  state.decisions.push(decision);
  if (decision.kind === "AUTO") state.auto = true;
  else resolveLot(world, state, decision.kind === "BID" ? decision.max : null);
  advance(world, state);
  return state;
}

/** Runs a stored auction again from its decisions. Throws if any decision is not allowed. */
export function replayAuction(world: WorldPack, competition: Competition, seed: string, playerTeamId: string | null, decisions: readonly AuctionDecision[]): AuctionState {
  let state = createAuction(world, competition, seed, playerTeamId);
  for (const d of decisions) state = decideLot(world, state, d);
  return state;
}

/** The squads an auction produced, for the generated-roster match path. */
export function auctionSquads(world: WorldPack, state: AuctionState): GeneratedSquad[] {
  if (!state.complete) throw new Error("AUCTION_NOT_COMPLETE");
  return state.teams.map((t) => {
    const team = world.teams.find((w) => w.teamId === t.teamId)!;
    return { teamId: t.teamId, name: team.name, colours: [team.colours[0]!, team.colours[1]!], squadIds: [...t.squadIds] };
  });
}

export function auctionSquadsSha256(squads: readonly GeneratedSquad[]): string {
  return hash(squads.map((s) => ({ teamId: s.teamId, squadIds: s.squadIds })));
}
