import type { WorldPack } from "@lcxxvi/contracts";
import { isBowlingCapable } from "./world.js";

type Player = WorldPack["players"][number];
export type ElevenFormat = keyof Player["skills"];

/**
 * Bowling-capable players a suggested eleven always carries. Five can cover 20 or 50 overs on quota alone, but with no
 * bowler allowed consecutive overs the fixture autopilot can then run out of eligible bowlers late in an innings
 * (LC_T20_NO_ELIGIBLE_BOWLER, found by scripts/pavilion-p04a-measure.ts), so six, as the old rule carried.
 */
export const SUGGESTED_ELEVEN_MIN_BOWLERS = 6;
const ATTACK_CORE = 4;

const battingScore = (p: Player, format: ElevenFormat) => {
  const s = p.skills[format];
  return s.timing + s.power + s.defence + s.rotation;
};
const bowlingScore = (p: Player, format: ElevenFormat) => {
  const s = p.skills[format];
  return s.control + s.movement + s.variation;
};
const byId = (a: Player, b: Player) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);

/**
 * Pavilion P04 stage A: the eleven a side is offered by default, and its batting order.
 *
 * The keeper with the best batting; the four best bowling-capable players by bowling; then the six best remaining
 * players by batting. If that leaves fewer than six bowling-capable players, the weakest batter who cannot bowl gives
 * way to the best remaining bowler. The batting order is batting skill, best first, so the autopilot (which sends in
 * the next unused player in eleven order) bats the specialists at the top. Ties break on playerId, so the result never
 * depends on squad order or locale. Pure: it reads skills and roles only, never randomness.
 *
 * Replaces "keeper, the first six bowling-capable players, then squad order", which with squads stored as keepers,
 * bowlers, all-rounders, batters left every specialist batter out and batted the bowlers at 2 to 7
 * (docs/pavilion/P04_CALIBRATION_DIAGNOSIS.md, cause C1).
 */
export function suggestedEleven(
  squad: readonly Player[],
  format: ElevenFormat,
): { playerIds: string[]; captainId: string; keeperId: string } {
  return rankedEleven(squad, (p) => battingScore(p, format), (p) => bowlingScore(p, format), byId);
}

/** What `rankedEleven` needs of a player: its id, its role and whether it bowls. */
export type ElevenCandidate = Pick<Player, "playerId" | "role" | "bowlingStyle">;

/**
 * The suggested-eleven rule with the scores and the tie-break supplied by the caller, so a selector that also weighs
 * condition (readiness, fatigue) applies exactly the approved stage A rule. `suggestedEleven` is this rule with raw
 * skills and a playerId tie-break. `tieBreak` must order any two distinct players (end on playerId) so the result
 * never depends on squad order.
 */
export function rankedEleven<P extends ElevenCandidate>(
  squad: readonly P[],
  batting: (p: P) => number,
  bowling: (p: P) => number,
  tieBreak: (a: P, b: P) => number,
): { playerIds: string[]; captainId: string; keeperId: string } {
  const bat = (a: P, b: P) => batting(b) - batting(a) || tieBreak(a, b);
  const bowl = (a: P, b: P) => bowling(b) - bowling(a) || tieBreak(a, b);
  const keeper = squad.filter((p) => p.role === "KEEPER").sort(bat)[0];
  if (!keeper) throw new Error("A squad needs a keeper.");
  const rest = squad.filter((p) => p.playerId !== keeper.playerId);
  const attack = rest.filter(isBowlingCapable).sort(bowl).slice(0, ATTACK_CORE);
  const chosen = new Set(attack.map((p) => p.playerId));
  const others = rest.filter((p) => !chosen.has(p.playerId)).sort(bat).slice(0, 10 - attack.length);
  const eleven = [keeper, ...attack, ...others];
  for (let bowlers = eleven.filter(isBowlingCapable).length; bowlers < SUGGESTED_ELEVEN_MIN_BOWLERS; bowlers += 1) {
    const inXI = new Set(eleven.map((p) => p.playerId));
    const incoming = rest.filter((p) => !inXI.has(p.playerId) && isBowlingCapable(p)).sort(bowl)[0];
    const outgoing = eleven.filter((p) => p !== keeper && !isBowlingCapable(p)).sort(bat).at(-1);
    if (!incoming || !outgoing) break;
    eleven[eleven.indexOf(outgoing)] = incoming;
  }
  const order = eleven.slice(0, 11).sort(bat);
  return { playerIds: order.map((p) => p.playerId), captainId: keeper.playerId, keeperId: keeper.playerId };
}
