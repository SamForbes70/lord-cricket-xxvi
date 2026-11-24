/**
 * Project Pavilion B6: "Next key moment". The match plays on ball by ball and stops when something worth the player's
 * attention happens: a wicket, a batter reaching 50 or 100, the start of the death overs, a chase tightening, or the
 * last over of a chase. Decisions that are the player's (after B2's routine picks) and the end of an innings or the
 * match stop it too, as every advance does.
 *
 * Pure and presentation-only: it compares two snapshots of the board the view already shows.
 */
export type KeyMomentSnapshot = {
  format: "T20" | "ODI" | "RED_BALL";
  inningsIndex: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  targetToWin: number | null;
  /** Runs per batter in the current innings. */
  batterRuns: Record<string, number>;
};

const SHAPE = { T20: { balls: 120, deathFrom: 90 }, ODI: { balls: 300, deathFrom: 240 } } as const;
/** An asking rate of 9 an over or more, scaled by 100 to stay in integers. */
const TIGHT_RATE_X100 = 900;

function tight(s: KeyMomentSnapshot, balls: number): boolean {
  if (s.targetToWin === null) return false;
  const left = balls - s.legalBalls;
  const needed = s.targetToWin - s.runs;
  return left > 0 && needed > 0 && needed * 600 >= TIGHT_RATE_X100 * left;
}

/**
 * Why the match should stop between `before` and `after`, or null to play on. `names` turns batter ids into names.
 * A new innings is not a key moment here: the advance stops there on its own.
 */
export function keyMomentBetween(before: KeyMomentSnapshot, after: KeyMomentSnapshot, names: Record<string, string>): string | null {
  if (after.format === "RED_BALL" || after.inningsIndex !== before.inningsIndex) return null;
  if (after.wickets > before.wickets) return "Wicket.";
  for (const [id, runs] of Object.entries(after.batterRuns)) {
    const was = before.batterRuns[id] ?? 0;
    for (const mark of [100, 50]) if (was < mark && runs >= mark) return `${names[id] ?? "The batter"} reaches ${mark}.`;
  }
  const shape = SHAPE[after.format];
  if (before.legalBalls < shape.deathFrom && after.legalBalls >= shape.deathFrom) return "The death overs begin.";
  if (after.targetToWin !== null && after.runs < after.targetToWin) {
    if (before.legalBalls < shape.balls - 6 && after.legalBalls >= shape.balls - 6) return "Last over of the chase.";
    if (!tight(before, shape.balls) && tight(after, shape.balls)) return "The chase is tightening.";
  }
  return null;
}
