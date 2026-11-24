/**
 * Pavilion P07 (first slice): one line of match context at the end of an over in a T20 or one-day innings.
 *
 * The over summary states the over and the score; this adds the story of the innings when there is one, and
 * nothing when there is not. Every line is worked out from the deliveries already committed (the running figures
 * the commentary projection keeps), so it never says anything the scorecard would not back up. Pure and
 * deterministic: no randomness, no ratings. At most one line per over, chosen by the priority below.
 */
export interface OverRecord {
  runs: number;
  wickets: number;
}

export interface OverContextInput {
  format: "T20" | "ODI" | "RED_BALL";
  /** Completed overs of this innings in order, the over just finished last. */
  overs: readonly OverRecord[];
  /** Innings totals after the over. */
  runs: number;
  legalBalls: number;
  targetToWin: number | null;
  bowlerName: string;
  bowlerFigures: string;
  bowlerLegalBalls: number;
  /** Legal balls since the batting side last hit a four or a six (all of them if none yet). */
  ballsSinceBoundary: number;
}

export interface OverContext {
  /** Fact-slot name for the commentary entry. */
  slot: "bowledOut" | "collapse" | "deathOvers" | "askingRate" | "expensiveOver" | "boundaryDrought";
  text: string;
}

const SHAPE = { T20: { balls: 120, deathFrom: 90, quota: 24 }, ODI: { balls: 300, deathFrom: 240, quota: 60 } } as const;
const COLLAPSE_WINDOW_OVERS = 4;
const COLLAPSE_WICKETS = 3;
const EXPENSIVE_MIN_RUNS = 12;
const EXPENSIVE_MIN_OVERS = 3;
const DROUGHT_FIRST = 24;
const DROUGHT_STEP = 12;

/** Asking rate times 100, or null when there is no chase in progress. */
function askingX100(target: number | null, runs: number, legalBalls: number, balls: number): number | null {
  if (target === null) return null;
  const left = balls - legalBalls;
  const needed = target - runs;
  return left > 0 && needed > 0 ? Math.round((needed * 600) / left) : null;
}

export function overContext(input: OverContextInput): OverContext | null {
  if (input.format === "RED_BALL" || input.overs.length === 0) return null;
  const shape = SHAPE[input.format];
  const last = input.overs[input.overs.length - 1]!;
  const chaseOpen = input.targetToWin !== null && input.runs < input.targetToWin && input.legalBalls < shape.balls;

  if (input.bowlerLegalBalls === shape.quota && input.legalBalls < shape.balls)
    return { slot: "bowledOut", text: `${input.bowlerName} bowls out: ${input.bowlerFigures}.` };

  if (last.wickets > 0) {
    const window = input.overs.slice(-COLLAPSE_WINDOW_OVERS);
    const wickets = window.reduce((n, o) => n + o.wickets, 0);
    const runs = window.reduce((n, o) => n + o.runs, 0);
    // Called once, when the window first reaches three wickets, not again on every over it stays there.
    const previous = input.overs.slice(-COLLAPSE_WINDOW_OVERS - 1, -1).reduce((n, o) => n + o.wickets, 0);
    if (wickets >= COLLAPSE_WICKETS && previous < COLLAPSE_WICKETS)
      return { slot: "collapse", text: `${wickets} wickets for ${runs} run${runs === 1 ? "" : "s"} in the last ${window.length} overs.` };
  }

  if (input.legalBalls === shape.deathFrom) return { slot: "deathOvers", text: "Into the death overs." };

  if (chaseOpen) {
    const before = askingX100(input.targetToWin, input.runs - last.runs, input.legalBalls - 6, shape.balls);
    const after = askingX100(input.targetToWin, input.runs, input.legalBalls, shape.balls);
    if (before !== null && after !== null) {
      const rate = (after / 100).toFixed(1);
      for (const mark of [1200, 900]) if (before < mark && after >= mark) return { slot: "askingRate", text: `The asking rate is up to ${rate} an over.` };
      if (before >= 900 && after < 900) return { slot: "askingRate", text: `The asking rate is back under 9 an over, at ${rate}.` };
    }
  }

  const earlier = input.overs.slice(0, -1);
  if (earlier.length >= EXPENSIVE_MIN_OVERS - 1 && last.runs >= EXPENSIVE_MIN_RUNS && earlier.every((o) => o.runs < last.runs))
    return { slot: "expensiveOver", text: "The most expensive over of the innings." };

  // Said when the drought passes 24 balls, then again each time it passes another 12. An over with no boundary
  // adds its six legal balls, so the count at the previous over's end was six fewer.
  const now = input.ballsSinceBoundary, before = now - 6;
  const step = (balls: number) => (balls < DROUGHT_FIRST ? -1 : Math.floor((balls - DROUGHT_FIRST) / DROUGHT_STEP));
  if (now >= DROUGHT_FIRST && step(now) > step(before))
    return { slot: "boundaryDrought", text: `No boundary for ${now} balls.` };

  return null;
}
