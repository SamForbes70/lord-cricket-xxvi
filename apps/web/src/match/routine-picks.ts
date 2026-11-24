/**
 * Project Pavilion B2: which batter and bowler choices are routine, and which are key moments the player should make.
 *
 * Pure and presentation-only. A routine pick is made by sending the same command the player's click on the
 * "Recommended" candidate would send, so it changes nothing in the engine, the replay or the save. Red-ball matches
 * are never automated: their over-by-over bowling is a different kind of decision.
 */
export type RoutinePickInput = {
  format: "T20" | "ODI" | "RED_BALL";
  decision: "BATTER" | "BOWLER";
  /** Legal balls bowled so far in the current innings. */
  legalBalls: number;
  /** Wickets fallen in the current innings. */
  wickets: number;
  /** Runs still needed in a chase, or null in a first innings. */
  runsNeeded: number | null;
};

export type RoutinePickMoment = { key: true; reason: string } | { key: false };

const SHAPE = {
  T20: { balls: 120, powerplayEnd: 36, deathFrom: 90 },
  ODI: { balls: 300, powerplayEnd: 60, deathFrom: 240 },
} as const;

/** A chase is tight when the asking rate is at least this many runs an over, scaled by 100 to stay in integers. */
const TIGHT_CHASE_RATE_X100 = 900;

export function routinePickMoment(input: RoutinePickInput): RoutinePickMoment {
  if (input.format === "RED_BALL") return { key: true, reason: "Red-ball choices are always yours." };
  const shape = SHAPE[input.format];
  const ballsLeft = Math.max(0, shape.balls - input.legalBalls);
  if (input.runsNeeded !== null && ballsLeft > 0 && input.runsNeeded * 600 >= TIGHT_CHASE_RATE_X100 * ballsLeft)
    return { key: true, reason: "Key moment: a tight chase." };
  if (input.legalBalls >= shape.deathFrom) return { key: true, reason: "Key moment: the death overs." };
  if (input.decision === "BOWLER") {
    if (input.legalBalls === 0) return { key: true, reason: "Key moment: who opens the bowling." };
    if (input.legalBalls === shape.powerplayEnd) return { key: true, reason: "Key moment: the first over after the powerplay." };
    return { key: false };
  }
  if (input.legalBalls === 0 && input.wickets === 0) return { key: true, reason: "Key moment: your openers." };
  if (input.wickets >= 5) return { key: true, reason: "Key moment: the lower order." };
  return { key: false };
}

/** Per-viewer preference, kept in this browser only. On unless the player turned it off. */
export const ROUTINE_PICKS_KEY = "lcxxvi-routine-picks";
export function readRoutinePicks(): boolean {
  try {
    return localStorage.getItem(ROUTINE_PICKS_KEY) !== "off";
  } catch {
    return true;
  }
}
export function writeRoutinePicks(on: boolean): void {
  try {
    localStorage.setItem(ROUTINE_PICKS_KEY, on ? "on" : "off");
  } catch {
    /* Storage blocked: the choice lasts for this page only. */
  }
}
