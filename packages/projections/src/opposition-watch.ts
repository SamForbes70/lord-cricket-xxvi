/**
 * Pavilion B9 (second part): opposition intelligence in the match view. What the other side has done in this match
 * and what it still has: its most dangerous bowler today and the overs its bowlers have left, or its set batter and
 * how many batters it has still to come. Pure and deterministic; it reads the innings ledger only, so every line is
 * grounded in what has happened in this match. No ratings, no guesses.
 */
export interface OppositionWatchInput {
  format: "T20" | "ODI";
  /** Whether the player's own side is batting or bowling in the current innings. */
  playerSide: "BATTING" | "BOWLING";
  batting: Readonly<Record<string, { runs: number; ballsFaced: number; dismissed: boolean }>>;
  bowling: Readonly<Record<string, { runsConceded: number; legalBalls: number; wickets: number; maidens: number }>>;
  /** The two batters at the crease, if selected. */
  atCrease: readonly (string | null)[];
  /** Players in the batting side's eleven. */
  battingElevenSize: number;
  names: Readonly<Record<string, string>>;
}

export interface OppositionWatch {
  heading: "Their bowling" | "Their batting";
  /** The main point, one sentence. Null before there is anything to say. */
  headline: string | null;
  /** Supporting facts, each a short phrase. */
  facts: string[];
}

const QUOTA_BALLS = { T20: 24, ODI: 60 } as const;
const overs = (balls: number) => `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ""}`;
const figures = (b: { runsConceded: number; legalBalls: number; wickets: number; maidens: number }) => `${overs(b.legalBalls)}-${b.maidens}-${b.runsConceded}-${b.wickets}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const name = (names: Readonly<Record<string, string>>, id: string) => names[id] ?? "A player";

export function oppositionWatch(input: OppositionWatchInput): OppositionWatch {
  if (input.playerSide === "BATTING") {
    const quota = QUOTA_BALLS[input.format];
    const used = Object.entries(input.bowling).filter(([, b]) => b.legalBalls > 0);
    // Most wickets first; then the fewest runs per ball; then the id, so the order never depends on locale.
    const ranked = [...used].sort(([ia, a], [ib, b]) =>
      b.wickets - a.wickets || a.runsConceded * b.legalBalls - b.runsConceded * a.legalBalls || (ia < ib ? -1 : ia > ib ? 1 : 0));
    const danger = ranked.find(([, b]) => b.wickets > 0) ?? null;
    const headline = danger
      ? danger[1].legalBalls >= quota
        ? `${name(input.names, danger[0])} has bowled out (${figures(danger[1])}): their most dangerous bowler today is done.`
        : `Most dangerous today: ${name(input.names, danger[0])}, ${figures(danger[1])}, ${plural(Math.ceil((quota - danger[1].legalBalls) / 6), "over")} left.`
      : used.length > 0 ? "No wickets for their bowlers yet." : null;
    const left = ranked
      .filter(([, b]) => b.legalBalls < quota)
      .map(([id, b]) => `${name(input.names, id)} ${overs(quota - b.legalBalls)}`);
    const facts = left.length > 0 ? [`Overs left: ${left.join(", ")}`] : [];
    const done = ranked.filter(([, b]) => b.legalBalls >= quota).map(([id]) => name(input.names, id));
    if (done.length > 0 && !(danger && danger[1].legalBalls >= quota && done.length === 1)) facts.push(`Bowled out: ${done.join(", ")}`);
    return { heading: "Their bowling", headline, facts };
  }

  const batted = Object.entries(input.batting);
  const atCrease = new Set(input.atCrease.filter((id): id is string => id !== null));
  const set = batted
    .filter(([id, b]) => atCrease.has(id) && !b.dismissed && b.ballsFaced > 0)
    .sort(([ia, a], [ib, b]) => b.runs - a.runs || a.ballsFaced - b.ballsFaced || (ia < ib ? -1 : ia > ib ? 1 : 0))[0] ?? null;
  const headline = set ? `Set batter: ${name(input.names, set[0])}, ${set[1].runs} from ${plural(set[1].ballsFaced, "ball")}.` : null;
  const facts: string[] = [];
  // The ledger lists the whole eleven from the first ball, so "still to come" is everyone neither out nor in.
  const out = batted.filter(([, b]) => b.dismissed).length;
  const inNow = [...atCrease].filter((id) => !input.batting[id]?.dismissed).length;
  const toCome = Math.max(0, input.battingElevenSize - out - inNow);
  facts.push(toCome === 0 ? "No batters left to come" : `${plural(toCome, "batter")} still to come`);
  const top = batted.filter(([, b]) => b.dismissed).sort(([ia, a], [ib, b]) => b.runs - a.runs || (ia < ib ? -1 : ia > ib ? 1 : 0))[0];
  if (top && top[1].runs > 0) facts.push(`Top score so far: ${name(input.names, top[0])} ${top[1].runs}, out`);
  return { heading: "Their batting", headline, facts };
}
