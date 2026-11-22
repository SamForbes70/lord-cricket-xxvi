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
    const projectedTotal = steady && wicketsInHand > 0 ? Math.round((input.runs * inningsBalls) / input.legalBalls) : null;
    if (projectedTotal !== null) facts.push(`On course for ${projectedTotal} at this rate`);
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
