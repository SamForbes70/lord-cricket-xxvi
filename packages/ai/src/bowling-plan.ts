/**
 * Pavilion P04 (owner direction of 25 November 2026, item 3): keep enough bowling to finish the innings.
 *
 * Limited-overs rules give each bowler a quota of overs and forbid one bowler bowling two overs in a row. A captain
 * that always picks its favourite available bowler can spend the quota so that, late in the innings, the only bowler
 * with overs left is the one who bowled the previous over, and the engine has no legal choice
 * (LC_T20_NO_ELIGIBLE_BOWLER). With six bowling-capable players there is enough slack that it rarely shows; with the
 * five the rules allow, it does. These functions let a captain keep its preferences while never choosing a bowler
 * after whom the rest of the innings cannot be bowled.
 *
 * Pure and deterministic: whole numbers in, a boolean or an id out.
 */
export interface BowlerOvers {
  readonly playerId: string;
  /** Whole overs this bowler may still bowl under the quota. */
  readonly oversLeft: number;
}

/**
 * Whether `oversRemaining` overs can still be bowled by `bowlers`, no bowler bowling consecutive overs and the first
 * of them not bowled by `previousOverBowlerId`.
 *
 * With R overs to bowl, no bowler can take more than ceil(R/2) of them, and the bowler of the previous over not more
 * than floor(R/2), because they cannot open the sequence. The overs can be shared out and ordered exactly when the
 * bowlers' capacities, each capped that way, add up to at least R.
 */
export function canCompleteBowling(oversRemaining: number, bowlers: readonly BowlerOvers[], previousOverBowlerId: string | null): boolean {
  if (!Number.isInteger(oversRemaining) || oversRemaining < 0) throw new Error("LC_AI_INVALID_OVERS_REMAINING");
  if (oversRemaining === 0) return true;
  const open = Math.ceil(oversRemaining / 2);
  const afterPrevious = Math.floor(oversRemaining / 2);
  let capacity = 0;
  for (const b of bowlers) {
    if (!Number.isInteger(b.oversLeft) || b.oversLeft < 0) throw new Error("LC_AI_INVALID_OVERS_LEFT");
    capacity += Math.min(b.oversLeft, b.playerId === previousOverBowlerId ? afterPrevious : open);
  }
  return capacity >= oversRemaining;
}

/**
 * The first of `preferenceOrder` who can bowl the next over and leave the rest of the innings bowlable. When no
 * choice keeps it bowlable (it already was not), the first preference: the captain's choice is unchanged.
 *
 * `bowlers` lists every bowling-capable player with overs left, including the bowler of the previous over.
 */
export function feasibleBowlerChoice(
  preferenceOrder: readonly string[],
  oversRemaining: number,
  bowlers: readonly BowlerOvers[],
  previousOverBowlerId: string | null,
): string | null {
  const left = new Map(bowlers.map((b) => [b.playerId, b.oversLeft]));
  for (const id of preferenceOrder) {
    const overs = left.get(id) ?? 0;
    if (id === previousOverBowlerId || overs < 1) continue;
    const after = bowlers.map((b) => (b.playerId === id ? { playerId: id, oversLeft: overs - 1 } : b));
    if (canCompleteBowling(oversRemaining - 1, after, id)) return id;
  }
  return preferenceOrder[0] ?? null;
}
