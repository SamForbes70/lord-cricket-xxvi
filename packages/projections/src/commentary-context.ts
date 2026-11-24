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
    const recent = input.overs.slice(-COLLAPSE_WINDOW_OVERS);
    const wickets = recent.reduce((n, o) => n + o.wickets, 0);
    const runs = recent.reduce((n, o) => n + o.runs, 0);
    // Called once, when the window first reaches three wickets, not again on every over it stays there.
    const previous = input.overs.slice(-COLLAPSE_WINDOW_OVERS - 1, -1).reduce((n, o) => n + o.wickets, 0);
    if (wickets >= COLLAPSE_WICKETS && previous < COLLAPSE_WICKETS)
      return { slot: "collapse", text: `${wickets} wickets for ${runs} run${runs === 1 ? "" : "s"} in the last ${recent.length} overs.` };
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

/**
 * Pavilion P07 (second slice): one line of context when a wicket falls in a T20 or one-day innings, by priority:
 * the partnership it breaks (when worth 30 or more), the equation the new batter walks into in a tight chase (the
 * last 36 balls of a T20 or 60 of a one-day innings, or an asking rate of 9 or more), or how many
 * wickets are left once seven are down. Null when none applies, or when the innings or match is over.
 */
export interface WicketContextInput {
  format: "T20" | "ODI" | "RED_BALL";
  /** The partnership the wicket ended. */
  standRuns: number;
  standBalls: number;
  /** Innings totals after the wicket. */
  runs: number;
  wickets: number;
  legalBalls: number;
  targetToWin: number | null;
}

const BIG_STAND_RUNS = 30;
const TAIL_FROM_WICKETS = 7;

export function wicketContext(input: WicketContextInput): { slot: "standBroken" | "newBatterTask" | "wicketsLeft"; text: string } | null {
  if (input.format === "RED_BALL" || input.wickets >= 10) return null;
  const balls = SHAPE[input.format].balls;
  if (input.legalBalls >= balls || (input.targetToWin !== null && input.runs >= input.targetToWin)) return null;
  if (input.standRuns >= BIG_STAND_RUNS)
    return { slot: "standBroken", text: `That breaks a stand of ${input.standRuns} from ${input.standBalls} ball${input.standBalls === 1 ? "" : "s"}.` };
  if (input.targetToWin !== null) {
    const needed = input.targetToWin - input.runs, left = balls - input.legalBalls;
    // Only when the chase is at its business end or the asking rate is 9 or more: early in a chase it adds little.
    const businessEnd = left <= (input.format === "T20" ? 36 : 60);
    if (businessEnd || needed * 600 >= 900 * left)
      return { slot: "newBatterTask", text: `The new batter comes in with ${needed} needed from ${left} ball${left === 1 ? "" : "s"}.` };
  }
  if (input.wickets >= TAIL_FROM_WICKETS) {
    const left = 10 - input.wickets;
    return { slot: "wicketsLeft", text: `${left} wicket${left === 1 ? "" : "s"} left.` };
  }
  return null;
}

/**
 * Pavilion P07 (second slice): the close of a T20 or one-day innings in one line: the top score and the best
 * bowling. (The target is left to the next innings' opening line, which already states it.) Ties go to fewer balls (batting) or fewer runs (bowling), then
 * the id, so the line never depends on locale. Null in red-ball matches or when nobody scored or took a wicket.
 */
export interface InningsSummaryInput {
  format: "T20" | "ODI" | "RED_BALL";
  batters: ReadonlyMap<string, { runs: number; ballsFaced: number }>;
  bowlers: ReadonlyMap<string, { wickets: number; runsConceded: number; legalBalls: number }>;
  names: Readonly<Record<string, string>>;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function inningsSummary(input: InningsSummaryInput): string | null {
  if (input.format === "RED_BALL") return null;
  const parts: string[] = [];
  const top = [...input.batters].filter(([, b]) => b.runs > 0).sort(([ia, a], [ib, b]) => b.runs - a.runs || a.ballsFaced - b.ballsFaced || byId(ia, ib))[0];
  if (top) parts.push(`Top score: ${input.names[top[0]] ?? "a batter"} ${top[1].runs} (${top[1].ballsFaced}).`);
  const best = [...input.bowlers].filter(([, b]) => b.wickets > 0).sort(([ia, a], [ib, b]) => b.wickets - a.wickets || a.runsConceded - b.runsConceded || byId(ia, ib))[0];
  if (best) parts.push(`Best bowling: ${input.names[best[0]] ?? "a bowler"} ${best[1].wickets}-${best[1].runsConceded}.`);
  return parts.length > 0 ? parts.join(" ") : null;
}
