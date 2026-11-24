/**
 * The match situation in plain words (E4): what the game needs right now.
 * Pure and deterministic. It reads scores only; it runs no simulation and never touches the match random stream.
 * The pressure reading is a guide built from the rates and wickets on the board. It is not a win probability.
 */

/** Starting values. Design choices to tune after playtests, not calibration. */
export const MATCH_SITUATION_RULES = {
  /** Balls that must be bowled in an innings before a rate is steady enough to judge pressure or project a total. */
  minBallsForReading: 12,
  /** Wickets lost beyond this add to the pressure on a chasing side. */
  wicketsBeforePenalty: 5,
  penaltyPerWicket: 0.5,
  /** Pressure score (required rate minus current rate, plus wicket penalty): below the first is in control, above the second is under pressure. */
  inTheBalanceFrom: 0,
  underPressureFrom: 3,
} as const;

import { T20_EXPECTATION_TABLE } from "./t20-expectation-table.js";

/** Cells with fewer innings than this fall back to every wicket band at that over. */
const MIN_CELL_INNINGS = 5;

/**
 * Pavilion B7: the likely T20 first-innings total from the game's own model: runs so far plus the mean runs that
 * innings in the model's 100-match corpus went on to add from the same over and wicket band, interpolated within
 * the over and rounded to the nearest 5. Null before the first ball or once ten wickets are down.
 */
export function likelyT20Total(runs: number, wickets: number, legalBalls: number): number | null {
  if (wickets >= 10 || legalBalls >= 120) return runs;
  const band = wickets >= 6 ? 3 : Math.floor(wickets / 2);
  const remainingAt = (over: number): number | null => {
    if (over >= 20) return 0;
    const row = T20_EXPECTATION_TABLE.rows[over]!;
    const cell = row[band]!;
    if (cell.n >= MIN_CELL_INNINGS && cell.meanX10 !== null) return cell.meanX10 / 10;
    let n = 0, sumX10 = 0;
    for (const c of row) if (c.meanX10 !== null) { n += c.n; sumX10 += c.meanX10 * c.n; }
    return n >= MIN_CELL_INNINGS ? sumX10 / n / 10 : null;
  };
  const over = Math.floor(legalBalls / 6);
  const from = remainingAt(over), to = remainingAt(over + 1);
  if (from === null || to === null) return null;
  const within = (legalBalls % 6) / 6;
  return Math.round((runs + from + (to - from) * within) / 5) * 5;
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26; error below 1.5e-7). Deterministic. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Mean and spread of the runs still to come from a point in a T20 innings, from the model's own table. */
function t20RemainingRuns(wickets: number, legalBalls: number): { mean: number; sd: number } | null {
  const band = wickets >= 6 ? 3 : Math.floor(wickets / 2);
  const at = (over: number): { mean: number; sd: number } | null => {
    if (over >= 20) return { mean: 0, sd: 0 };
    const row = T20_EXPECTATION_TABLE.rows[over]!;
    const cell = row[band]!;
    if (cell.n >= MIN_CELL_INNINGS && cell.meanX10 !== null && cell.sdX10 !== null) return { mean: cell.meanX10 / 10, sd: cell.sdX10 / 10 };
    let n = 0, mean = 0, square = 0;
    for (const c of row) if (c.meanX10 !== null && c.sdX10 !== null) {
      n += c.n; mean += (c.meanX10 / 10) * c.n; square += ((c.sdX10 / 10) ** 2 + (c.meanX10 / 10) ** 2) * c.n;
    }
    if (n < MIN_CELL_INNINGS) return null;
    mean /= n;
    return { mean, sd: Math.sqrt(Math.max(0, square / n - mean * mean)) };
  };
  const over = Math.floor(legalBalls / 6);
  const from = at(over), to = at(over + 1);
  if (!from || !to) return null;
  const within = (legalBalls % 6) / 6;
  return { mean: from.mean + (to.mean - from.mean) * within, sd: from.sd + (to.sd - from.sd) * within };
}

/**
 * Pavilion B9: the chasing side's chance of winning a T20, in percent, from the game's own model: the runs still
 * needed against the spread of runs the model's first innings went on to add from the same over and wicket band.
 * Returns 100 or 0 once the chase is decided, otherwise a multiple of 5 from 5 to 95. Null when the table has too
 * few innings at that point. It describes this synthetic model, not real cricket.
 */
export function t20ChaseWinChance(runsNeeded: number, wickets: number, legalBalls: number): number | null {
  if (runsNeeded <= 0) return 100;
  if (wickets >= 10 || legalBalls >= 120) return 0;
  const raw = t20ChaseWinChanceRaw(runsNeeded, wickets, legalBalls);
  if (raw === null) return null;
  // Nearest 5, and never 0 or 100 while the chase is open: on the corpus the estimate is off by up to about 14
  // points in the middle range (docs/pavilion/b9), so more precision would be false.
  return Math.min(95, Math.max(5, Math.round(raw * 20) * 5));
}

/** The unrounded chance as a probability (0 to 1), or null where the table is too thin. Used by the evaluation script. */
export function t20ChaseWinChanceRaw(runsNeeded: number, wickets: number, legalBalls: number): number | null {
  if (runsNeeded <= 0) return 1;
  if (wickets >= 10 || legalBalls >= 120) return 0;
  const remaining = t20RemainingRuns(wickets, legalBalls);
  if (!remaining) return null;
  // Needing r runs means scoring at least r: the continuity correction takes the half run below.
  return remaining.sd > 0 ? 1 - normalCdf((runsNeeded - 0.5 - remaining.mean) / remaining.sd) : remaining.mean >= runsNeeded ? 1 : 0;
}

export type PressureLevel = "IN_CONTROL" | "IN_THE_BALANCE" | "UNDER_PRESSURE";

export interface MatchSituationInput {
  format: "T20" | "ODI" | "RED_BALL";
  runs: number;
  wickets: number;
  legalBalls: number;
  targetToWin: number | null;
  /** Score and ball count when the last wicket fell, or null when no wicket has fallen or it is not known. */
  lastWicket: { runs: number; legalBalls: number } | null;
  /** True when the fall-of-wickets record accounts for every wicket, so a partnership can be stated honestly. */
  partnershipKnown: boolean;
  matchComplete: boolean;
}

export interface MatchSituation {
  kind: "FIRST_INNINGS" | "CHASE";
  currentRateX100: number | null;
  projectedTotal: number | null;
  partnership: { runs: number; balls: number } | null;
  runsNeeded: number | null;
  ballsLeft: number;
  wicketsInHand: number;
  requiredRateX100: number | null;
  pressure: { level: PressureLevel; label: string } | null;
  /** The equation or the innings state as one sentence. */
  headline: string;
  /** Supporting facts, each a short phrase. */
  facts: string[];
}

const PRESSURE_LABEL: Record<PressureLevel, string> = { IN_CONTROL: "In control", IN_THE_BALANCE: "In the balance", UNDER_PRESSURE: "Under pressure" };
const rate = (x100: number) => (x100 / 100).toFixed(2);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function matchSituation(input: MatchSituationInput): MatchSituation | null {
  if (input.format === "RED_BALL" || input.matchComplete) return null;
  const inningsBalls = input.format === "ODI" ? 300 : 120;
  const ballsLeft = Math.max(0, inningsBalls - input.legalBalls);
  const wicketsInHand = Math.max(0, 10 - input.wickets);
  const steady = input.legalBalls >= MATCH_SITUATION_RULES.minBallsForReading;
  const currentRateX100 = input.legalBalls > 0 ? Math.round((input.runs * 600) / input.legalBalls) : null;
  const partnership = input.partnershipKnown
    ? { runs: input.runs - (input.lastWicket?.runs ?? 0), balls: input.legalBalls - (input.lastWicket?.legalBalls ?? 0) }
    : null;
  const facts: string[] = [];
  if (currentRateX100 !== null) facts.push(`Run rate ${rate(currentRateX100)}`);

  if (input.targetToWin === null) {
    // T20 reads the model's own scoring; a one-day innings still reads the current rate, and says so.
    const projectedTotal = !steady || wicketsInHand === 0 ? null
      : input.format === "T20" ? likelyT20Total(input.runs, input.wickets, input.legalBalls)
      : Math.round((input.runs * inningsBalls) / input.legalBalls);
    if (projectedTotal !== null) facts.push(input.format === "T20" ? `Likely total about ${projectedTotal}` : `On course for ${projectedTotal} at this rate`);
    if (partnership && partnership.balls > 0) facts.push(`Partnership ${partnership.runs} from ${plural(partnership.balls, "ball")}`);
    return {
      kind: "FIRST_INNINGS", currentRateX100, projectedTotal, partnership, runsNeeded: null, ballsLeft, wicketsInHand, requiredRateX100: null, pressure: null,
      headline: `${plural(ballsLeft, "ball")} left, ${plural(wicketsInHand, "wicket")} in hand.`,
      facts,
    };
  }

  const runsNeeded = Math.max(0, input.targetToWin - input.runs);
  const requiredRateX100 = ballsLeft > 0 ? Math.round((runsNeeded * 600) / ballsLeft) : null;
  if (requiredRateX100 !== null) facts.unshift(`Required rate ${rate(requiredRateX100)}`);
  if (partnership && partnership.balls > 0) facts.push(`Partnership ${partnership.runs} from ${plural(partnership.balls, "ball")}`);
  let pressure: MatchSituation["pressure"] = null;
  if (steady && requiredRateX100 !== null && currentRateX100 !== null && runsNeeded > 0) {
    const penalty = Math.max(0, input.wickets - MATCH_SITUATION_RULES.wicketsBeforePenalty) * MATCH_SITUATION_RULES.penaltyPerWicket;
    const score = (requiredRateX100 - currentRateX100) / 100 + penalty;
    const level: PressureLevel = score < MATCH_SITUATION_RULES.inTheBalanceFrom ? "IN_CONTROL" : score > MATCH_SITUATION_RULES.underPressureFrom ? "UNDER_PRESSURE" : "IN_THE_BALANCE";
    pressure = { level, label: PRESSURE_LABEL[level] };
  }
  return {
    kind: "CHASE", currentRateX100, projectedTotal: null, partnership, runsNeeded, ballsLeft, wicketsInHand, requiredRateX100, pressure,
    headline: `${runsNeeded} needed from ${plural(ballsLeft, "ball")}, ${plural(wicketsInHand, "wicket")} in hand.`,
    facts,
  };
}
