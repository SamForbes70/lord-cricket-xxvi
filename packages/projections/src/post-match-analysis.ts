import type { DeliveryRecorded, T20Command, T20MatchEvent, T20Scorecard } from "@lcxxvi/contracts";

/**
 * LC_POST_MATCH_ANALYSIS_V1 (Directive 02 item B4, first slice).
 *
 * A post-match analysis of one completed T20 match, derived on read from the authoritative match record: the
 * committed event chain, the accepted commands and the scorecard. Pure and deterministic. Nothing is saved, no
 * persisted format changes, and the simulation is never consulted. Every line states a recorded fact. Decisions are
 * shown next to what happened afterwards; nothing here claims a decision caused it. See
 * docs/pavilion/POST_MATCH_ANALYSIS_V1.md.
 */
export const POST_MATCH_ANALYSIS_VERSION = "LC_POST_MATCH_ANALYSIS_V1" as const;

/** Fixed rule values. Design choices for presentation, not calibration; changing one needs a new version. */
export const POST_MATCH_ANALYSIS_RULES = {
  /** T20 phases by over number (overs counted from 1). */
  phases: [
    { phase: "POWERPLAY", fromOver: 1, toOver: 6 },
    { phase: "MIDDLE", fromOver: 7, toOver: 15 },
    { phase: "DEATH", fromOver: 16, toOver: 20 },
  ],
  /** Turning points look at windows of this many consecutive overs. */
  windowOvers: 3,
  /** A collapse is at least this many wickets inside one window. */
  collapseMinWickets: 3,
  /** A surge or squeeze is a window this many runs above or below the innings' own rate. */
  swingMinRuns: 12,
  /** A stand is listed when it reaches this many runs. */
  standMinRuns: 40,
  /** Death overs are compared when the two sides' rates differ by this many runs over the five overs. */
  deathGapMinRuns: 12,
  maxTurningPoints: 4,
  /** "What followed" covers this many legal balls after a decision (two overs). */
  followLegalBalls: 12,
  inningsLegalBalls: 120,
} as const;

export type PostMatchPhase = "POWERPLAY" | "MIDDLE" | "DEATH";
export interface PostMatchPhaseLine {
  phase: PostMatchPhase;
  fromOver: number;
  toOver: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  /** False when the innings ended before this phase began. */
  reached: boolean;
}
export interface PostMatchPhaseInnings {
  inningsIndex: number;
  battingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  lines: PostMatchPhaseLine[];
}

export type PostMatchTurningPointKind = "COLLAPSE" | "STAND" | "SURGE" | "SQUEEZE" | "DEATH_OVERS";
export interface PostMatchTurningPoint {
  kind: PostMatchTurningPointKind;
  inningsIndex: number;
  teamId: string;
  fromOver: number;
  toOver: number;
  runs: number;
  wickets: number;
  text: string;
}

/** What the current measurements (docs/pavilion/TACTICAL_VALIDATION.md) say about a kind of decision. */
export type PostMatchMeasuredEffect = "CLEAR" | "SMALL" | "NONE_DETECTED" | "NOT_MEASURED";
export const POST_MATCH_MEASURED_NOTES: Readonly<Record<PostMatchMeasuredEffect, string>> = {
  CLEAR: "Measured: a clear effect on results in the current model.",
  SMALL: "Measured: a small effect at most (about 3 runs an innings at the extreme settings, within the margin of error).",
  NONE_DETECTED: "Measured: no detectable effect on results in the current model. Shown as a record only.",
  NOT_MEASURED: "Not measured.",
};

export type PostMatchDecisionKind = "SELECTION" | "TOSS" | "INNINGS_CHOICE" | "BATTING_PLAN" | "BOWLING_PLAN" | "FIELD" | "BOWLER" | "BATTER";
export const POST_MATCH_DECISION_EFFECT: Readonly<Record<PostMatchDecisionKind, PostMatchMeasuredEffect>> = {
  SELECTION: "CLEAR",
  BATTER: "CLEAR",
  BATTING_PLAN: "SMALL",
  BOWLING_PLAN: "NONE_DETECTED",
  FIELD: "NONE_DETECTED",
  BOWLER: "NONE_DETECTED",
  TOSS: "NOT_MEASURED",
  INNINGS_CHOICE: "NOT_MEASURED",
};

export interface PostMatchFollowUp {
  legalBalls: number;
  runs: number;
  wickets: number;
  /** The innings ended inside the window. */
  inningsEnded: boolean;
  /** Another plan or field decision by the same side came inside the window. */
  overlapped: boolean;
  /** Runs an over in the innings before the decision, to one decimal place; null at the start of an innings. */
  rateBefore: number | null;
}

export interface PostMatchDecision {
  kind: PostMatchDecisionKind;
  teamId: string;
  /** Who made it, from the command's recorded actor. SETUP is the eleven fixed before the match began. */
  actor: "USER" | "AI" | "SETUP";
  /** Null for decisions before play. */
  inningsIndex: number | null;
  /** Legal balls already bowled in that innings when it was made. */
  atLegalBall: number | null;
  /** "Over 4.2, 31 for 1", or "Before play". */
  when: string;
  summary: string;
  followUp: PostMatchFollowUp | null;
  /** The follow-up as a sentence of recorded facts, or null. */
  followed: string | null;
  measured: PostMatchMeasuredEffect;
}

export interface PostMatchAnalysis {
  version: typeof POST_MATCH_ANALYSIS_VERSION;
  matchId: string;
  phases: PostMatchPhaseInnings[];
  turningPoints: PostMatchTurningPoint[];
  decisions: PostMatchDecision[];
  /** Team decisions (not the match clock) recorded from each actor kind, by team. */
  commandCounts: Record<string, { user: number; ai: number }>;
}

export interface PostMatchAnalysisInput {
  events: readonly T20MatchEvent[];
  commands: readonly T20Command[];
  scorecard: T20Scorecard;
  /** Each side's eleven, in the match setup's order. */
  teams: readonly { teamId: string; playerIds: readonly string[] }[];
  /** The suggested eleven on ratings alone, by team, when one can be worked out. */
  suggestedXi?: Readonly<Record<string, readonly string[]>>;
  names: Readonly<Record<string, string>>;
  teamNames: Readonly<Record<string, string>>;
}

type Ball = { legalBefore: number; over: number; runs: number; wicket: boolean; legal: boolean; bowlerId: string };
type Position = { inningsIndex: number | null; legalBalls: number; runs: number; wickets: number };

const DEFAULT_BATTING = { aggression: 2, intent: "NORMAL" } as const;
const DEFAULT_BOWLING = { line: "STUMPS", length: "GOOD", variationId: "stock", effort: "NORMAL" } as const;
const AGGRESSION = ["Defend", "Cautious", "Balanced", "Positive", "Attack"];
const DECISION_KINDS: Readonly<Partial<Record<T20Command["kind"], PostMatchDecisionKind>>> = {
  CALL_TOSS: "TOSS", CHOOSE_INNINGS: "INNINGS_CHOICE", SET_BATTER: "BATTER", SET_BOWLER: "BOWLER",
  SET_FIELD: "FIELD", SET_BATTING_PLAN: "BATTING_PLAN", SET_BOWLING_PLAN: "BOWLING_PLAN",
};

function deliveryRuns(d: DeliveryRecorded): number {
  return d.batRuns + d.extras.wides + d.extras.noBalls + d.extras.byes + d.extras.legByes + d.extras.penalties;
}
function plural(n: number, one: string, many = `${one}s`): string { return `${n} ${n === 1 ? one : many}`; }
function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]}`;
}
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
/** Runs an over to one decimal place, from integers, so the text is the same on every platform. */
function rate(runs: number, legalBalls: number): number { return Math.round((runs * 60) / legalBalls) / 10; }
function rateText(value: number): string { return value.toFixed(1); }
function oversText(legalBalls: number): string { return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`; }
function overRange(from: number, to: number): string { return from === to ? `over ${from}` : `overs ${from} to ${to}`; }
function words(id: string): string { return id.toLowerCase().replaceAll(/[-_]/g, " "); }

/** One pass over the event chain: every delivery by innings, checked against the scorecard. Shared by V1 and the archive variant. */
function walkRecord(
  events: readonly T20MatchEvent[],
  scorecard: T20Scorecard,
  onEvent?: (event: T20MatchEvent, at: Position) => void,
) {
  const inningsCount = scorecard.innings.length;
  const balls: Ball[][] = Array.from({ length: inningsCount }, () => []);
  const legal = Array<number>(inningsCount).fill(0), runs = Array<number>(inningsCount).fill(0), wickets = Array<number>(inningsCount).fill(0);
  const battingOrder: { playerId: string; inningsIndex: number; commandId: string }[] = [];
  let active: number | null = null;
  let toss: { winnerId: string; call: string; coin: string } | null = null;
  let lastSequence = 0;

  for (const event of events) {
    if (event.sequence !== lastSequence + 1) throw new Error("LC_POST_MATCH_ANALYSIS_SEQUENCE_ORDER");
    lastSequence = event.sequence;
    onEvent?.(event, active === null
      ? { inningsIndex: null, legalBalls: 0, runs: 0, wickets: 0 }
      : { inningsIndex: active, legalBalls: legal[active]!, runs: runs[active]!, wickets: wickets[active]! });
    const payload = event.payload as Record<string, unknown>;
    if (event.type === "TOSS_RESOLVED") toss = { winnerId: String(payload.winnerId), call: String(payload.call), coin: String(payload.coin) };
    else if (event.type === "INNINGS_STARTED") active = Number(payload.inningsIndex);
    else if (event.type === "BATTER_SELECTED" && active !== null) battingOrder.push({ playerId: String(payload.playerId), inningsIndex: active, commandId: event.commandId });
    else if (event.type === "DELIVERY_RECORDED") {
      const d = (payload as { event: DeliveryRecorded }).event;
      const i = d.inningsIndex;
      if (!Number.isInteger(i) || i < 0 || i >= inningsCount) throw new Error("LC_POST_MATCH_ANALYSIS_INNINGS_INDEX");
      const earned = deliveryRuns(d);
      balls[i]!.push({ legalBefore: legal[i]!, over: Math.floor(legal[i]! / 6) + 1, runs: earned, wicket: d.dismissal !== null, legal: d.legalBall, bowlerId: d.bowlerId });
      runs[i]! += earned;
      wickets[i]! += Number(d.dismissal !== null);
      legal[i]! += Number(d.legalBall);
    }
  }
  scorecard.innings.forEach((innings, i) => {
    // The event chain must agree with the scorecard; a mismatch means the inputs are not one match record.
    if (innings.legalBalls !== legal[i] || innings.runs !== runs[i] || innings.wickets !== wickets[i]) throw new Error("LC_POST_MATCH_ANALYSIS_SCORECARD_MISMATCH");
  });
  return { balls, battingOrder, toss };
}

/** Phase by phase and turning points: the same fixed rules for the live and the archived analysis. */
function phasesAndTurningPoints(balls: readonly Ball[][], scorecard: T20Scorecard, team: (id: string) => string) {
  // Phase summary.
  const phases: PostMatchPhaseInnings[] = scorecard.innings.map((innings, i) => ({
    inningsIndex: i, battingTeamId: innings.battingTeamId, runs: innings.runs, wickets: innings.wickets, legalBalls: innings.legalBalls,
    lines: POST_MATCH_ANALYSIS_RULES.phases.map(({ phase, fromOver, toOver }) => {
      const inPhase = balls[i]!.filter((ball) => ball.over >= fromOver && ball.over <= toOver);
      return {
        phase, fromOver, toOver,
        runs: inPhase.reduce((sum, ball) => sum + ball.runs, 0),
        wickets: inPhase.filter((ball) => ball.wicket).length,
        legalBalls: inPhase.filter((ball) => ball.legal).length,
        reached: inPhase.length > 0,
      };
    }),
  }));

  // Turning points.
  const overs = balls.map((list) => {
    const byOver = new Map<number, { runs: number; wickets: number; legalBalls: number }>();
    for (const ball of list) {
      const over = byOver.get(ball.over) ?? { runs: 0, wickets: 0, legalBalls: 0 };
      over.runs += ball.runs; over.wickets += Number(ball.wicket); over.legalBalls += Number(ball.legal);
      byOver.set(ball.over, over);
    }
    return [...byOver.entries()].sort((a, b) => a[0] - b[0]).map(([over, value]) => ({ over, ...value }));
  });
  type Candidate = PostMatchTurningPoint & { priority: number; magnitude: number };
  const candidates: Candidate[] = [];
  const W = POST_MATCH_ANALYSIS_RULES.windowOvers;
  scorecard.innings.forEach((innings, i) => {
    const list = overs[i]!;
    if (list.length === 0 || innings.legalBalls === 0) return;
    const windows = [] as { from: number; to: number; runs: number; wickets: number; legalBalls: number; deltaX: number }[];
    for (let start = 0; start + Math.min(W, list.length) <= list.length; start += 1) {
      const slice = list.slice(start, start + Math.min(W, list.length));
      const r = slice.reduce((s, o) => s + o.runs, 0), w = slice.reduce((s, o) => s + o.wickets, 0), b = slice.reduce((s, o) => s + o.legalBalls, 0);
      // Runs above the innings' own rate, scaled by the innings' legal balls so the comparison stays in integers.
      windows.push({ from: slice[0]!.over, to: slice.at(-1)!.over, runs: r, wickets: w, legalBalls: b, deltaX: r * innings.legalBalls - innings.runs * b });
    }
    const base = rateText(rate(innings.runs, innings.legalBalls));
    const delta = (x: number) => Math.round(Math.abs(x) / innings.legalBalls);
    let collapse: (typeof windows)[number] | null = null;
    for (const win of windows) {
      if (win.wickets < POST_MATCH_ANALYSIS_RULES.collapseMinWickets) continue;
      if (!collapse || win.wickets > collapse.wickets || (win.wickets === collapse.wickets && win.runs < collapse.runs)) collapse = win;
    }
    if (collapse) candidates.push({
      kind: "COLLAPSE", inningsIndex: i, teamId: innings.battingTeamId, fromOver: collapse.from, toOver: collapse.to, runs: collapse.runs, wickets: collapse.wickets,
      priority: 0, magnitude: collapse.wickets * 1000 - collapse.runs,
      text: `${team(innings.battingTeamId)} lost ${plural(collapse.wickets, "wicket")} for ${plural(collapse.runs, "run")} in ${overRange(collapse.from, collapse.to)}.`,
    });
    let surge: (typeof windows)[number] | null = null, squeeze: (typeof windows)[number] | null = null;
    for (const win of windows) {
      if (!surge || win.deltaX > surge.deltaX) surge = win;
      if (!squeeze || win.deltaX < squeeze.deltaX) squeeze = win;
    }
    const threshold = POST_MATCH_ANALYSIS_RULES.swingMinRuns * innings.legalBalls;
    if (surge && surge.deltaX >= threshold) candidates.push({
      kind: "SURGE", inningsIndex: i, teamId: innings.battingTeamId, fromOver: surge.from, toOver: surge.to, runs: surge.runs, wickets: surge.wickets,
      priority: 2, magnitude: delta(surge.deltaX),
      text: `${team(innings.battingTeamId)} scored ${plural(surge.runs, "run")} in ${overRange(surge.from, surge.to)}, ${delta(surge.deltaX)} more than their innings rate of ${base} an over would give.`,
    });
    const overlapsCollapse = (win: { from: number; to: number }) => collapse !== null && win.from <= collapse.to && win.to >= collapse.from;
    if (squeeze && -squeeze.deltaX >= threshold && !overlapsCollapse(squeeze)) candidates.push({
      kind: "SQUEEZE", inningsIndex: i, teamId: innings.battingTeamId, fromOver: squeeze.from, toOver: squeeze.to, runs: squeeze.runs, wickets: squeeze.wickets,
      priority: 2, magnitude: delta(squeeze.deltaX),
      text: `${team(innings.battingTeamId)} scored ${plural(squeeze.runs, "run")} for ${plural(squeeze.wickets, "wicket")} in ${overRange(squeeze.from, squeeze.to)}, ${delta(squeeze.deltaX)} fewer than their innings rate of ${base} an over would give.`,
    });
  });
  // Largest stand of the match: runs between the fall of one wicket and the next, from the event chain.
  let best: { inningsIndex: number; runs: number; legalBalls: number; wicketNumber: number; unbroken: boolean; from: number; to: number } | null = null;
  scorecard.innings.forEach((innings, i) => {
    let startRuns = 0, startLegal = 0, wicketNumber = 1, r = 0, l = 0;
    const consider = (unbroken: boolean) => {
      if (!best || r - startRuns > best.runs) best = {
        inningsIndex: i, runs: r - startRuns, legalBalls: l - startLegal, wicketNumber, unbroken,
        from: Math.floor(startLegal / 6) + 1, to: Math.max(1, Math.ceil(l / 6)),
      };
    };
    for (const ball of balls[i]!) {
      r += ball.runs; l += Number(ball.legal);
      if (ball.wicket) { consider(false); startRuns = r; startLegal = l; wicketNumber += 1; }
    }
    if (innings.wickets < 10 && r > startRuns) consider(true);
  });
  const stand = best as { inningsIndex: number; runs: number; legalBalls: number; wicketNumber: number; unbroken: boolean; from: number; to: number } | null;
  if (stand && stand.runs >= POST_MATCH_ANALYSIS_RULES.standMinRuns) {
    const innings = scorecard.innings[stand.inningsIndex]!;
    candidates.push({
      kind: "STAND", inningsIndex: stand.inningsIndex, teamId: innings.battingTeamId, fromOver: stand.from, toOver: stand.to, runs: stand.runs, wickets: 0,
      priority: 1, magnitude: stand.runs,
      text: `${team(innings.battingTeamId)} put on ${plural(stand.runs, "run")} from ${plural(stand.legalBalls, "ball")} for the ${ordinal(stand.wicketNumber)} wicket${stand.unbroken ? ", unbroken" : ""}, in ${overRange(stand.from, stand.to)}.`,
    });
  }
  // Death overs: both sides compared, when both batted in them.
  const death = phases.map((p) => p.lines.find((line) => line.phase === "DEATH")!);
  if (death.length === 2 && death.every((line) => line.reached && line.legalBalls > 0)) {
    const [a, b] = death as [PostMatchPhaseLine, PostMatchPhaseLine];
    // Runs over five overs at each side's death rate, compared in integers: (ra/ba - rb/bb) * 30.
    const gapX = (a.runs * b.legalBalls - b.runs * a.legalBalls) * 30;
    const scale = a.legalBalls * b.legalBalls;
    if (Math.abs(gapX) >= POST_MATCH_ANALYSIS_RULES.deathGapMinRuns * scale) {
      const [first, second] = [phases[0]!.battingTeamId, phases[1]!.battingTeamId];
      const lead = gapX > 0 ? 0 : 1;
      candidates.push({
        kind: "DEATH_OVERS", inningsIndex: lead, teamId: lead === 0 ? first : second, fromOver: 16, toOver: 20, runs: death[lead]!.runs, wickets: death[lead]!.wickets,
        priority: 3, magnitude: Math.round(Math.abs(gapX) / scale),
        text: `Overs 16 to 20: ${team(first)} scored ${a.runs} for ${a.wickets} (${rateText(rate(a.runs, a.legalBalls))} an over); ${team(second)} scored ${b.runs} for ${b.wickets} (${rateText(rate(b.runs, b.legalBalls))} an over).`,
      });
    }
  }
  const turningPoints: PostMatchTurningPoint[] = candidates
    .sort((x, y) => x.priority - y.priority || y.magnitude - x.magnitude || x.inningsIndex - y.inningsIndex || x.fromOver - y.fromOver)
    .slice(0, POST_MATCH_ANALYSIS_RULES.maxTurningPoints)
    .sort((x, y) => x.inningsIndex - y.inningsIndex || x.fromOver - y.fromOver || x.priority - y.priority)
    .map((candidate): PostMatchTurningPoint => ({ kind: candidate.kind, inningsIndex: candidate.inningsIndex, teamId: candidate.teamId, fromOver: candidate.fromOver, toOver: candidate.toOver, runs: candidate.runs, wickets: candidate.wickets, text: candidate.text }));

  return { phases, turningPoints };
}

export function projectPostMatchAnalysis(input: PostMatchAnalysisInput): PostMatchAnalysis {
  const { scorecard, names, teamNames } = input;
  const name = (id: string) => names[id] ?? id;
  const team = (id: string) => teamNames[id] ?? id;
  const commandById = new Map(input.commands.map((command) => [command.commandId, command]));
  const positions = new Map<string, Position>();
  const { balls, battingOrder, toss } = walkRecord(input.events, scorecard, (event, at) => {
    const command = commandById.get(event.commandId);
    if (command && DECISION_KINDS[command.kind] && !positions.has(command.commandId)) positions.set(command.commandId, at);
  });
  const { phases, turningPoints } = phasesAndTurningPoints(balls, scorecard, team);

  // Decisions.
  const commandCounts: Record<string, { user: number; ai: number }> = Object.fromEntries(input.teams.map((t) => [t.teamId, { user: 0, ai: 0 }]));
  const decided = input.commands
    .filter((command) => DECISION_KINDS[command.kind] && positions.has(command.commandId))
    .map((command) => {
      const actor = command.actorId.startsWith("USER:") ? "USER" as const : command.actorId.startsWith("AI:") ? "AI" as const : null;
      const teamId = command.actorId.slice(command.actorId.indexOf(":") + 1);
      return { command, actor, teamId, position: positions.get(command.commandId)! };
    })
    .filter((entry): entry is typeof entry & { actor: "USER" | "AI" } => entry.actor !== null);
  for (const entry of decided) {
    const counts = commandCounts[entry.teamId] ??= { user: 0, ai: 0 };
    if (entry.actor === "USER") counts.user += 1; else counts.ai += 1;
  }

  const when = (p: Position) => p.inningsIndex === null ? "Before play" : p.legalBalls === 0 ? `Start of innings ${p.inningsIndex + 1}, 0 for 0` : `Over ${oversText(p.legalBalls)}, ${p.runs} for ${p.wickets}`;
  const isPlanKind = (kind: T20Command["kind"]) => kind === "SET_BATTING_PLAN" || kind === "SET_BOWLING_PLAN" || kind === "SET_FIELD";
  const followUp = (teamId: string, p: Position, excludeIds: ReadonlySet<string>): PostMatchFollowUp | null => {
    if (p.inningsIndex === null) return null;
    const i = p.inningsIndex, end = p.legalBalls + POST_MATCH_ANALYSIS_RULES.followLegalBalls;
    const span = balls[i]!.filter((ball) => ball.legalBefore >= p.legalBalls && ball.legalBefore < end);
    const legalBalls = span.filter((ball) => ball.legal).length;
    const overlapped = decided.some((other) => other.teamId === teamId && isPlanKind(other.command.kind) && !excludeIds.has(other.command.commandId) &&
      other.position.inningsIndex === i && other.position.legalBalls > p.legalBalls && other.position.legalBalls < end);
    return {
      legalBalls, runs: span.reduce((sum, ball) => sum + ball.runs, 0), wickets: span.filter((ball) => ball.wicket).length,
      inningsEnded: legalBalls < POST_MATCH_ANALYSIS_RULES.followLegalBalls, overlapped,
      rateBefore: p.legalBalls > 0 ? rate(p.runs, p.legalBalls) : null,
    };
  };
  const followedText = (f: PostMatchFollowUp | null): string | null => {
    if (!f) return null;
    if (f.legalBalls === 0) return "No more balls were bowled in the innings.";
    const span = f.inningsEnded ? `The next ${plural(f.legalBalls, "ball")} (the innings then ended)` : "The next 2 overs";
    const before = f.rateBefore === null ? "" : ` Before it: ${rateText(f.rateBefore)} an over.`;
    const overlap = f.overlapped ? " Another plan or field change came within those balls." : "";
    return `${span}: ${plural(f.runs, "run")}, ${plural(f.wickets, "wicket")}.${before}${overlap}`;
  };

  const decisions: PostMatchDecision[] = [];
  // Selection: the eleven each side fielded, against the suggested eleven when there is one.
  for (const side of input.teams) {
    const suggested = input.suggestedXi?.[side.teamId];
    const sideBalls = scorecard.innings.find((innings) => innings.battingTeamId === side.teamId);
    const fieldBalls = scorecard.innings.find((innings) => innings.bowlingTeamId === side.teamId);
    const order = battingOrder.filter((entry) => sideBalls && scorecard.innings[entry.inningsIndex]?.battingTeamId === side.teamId).map((entry) => entry.playerId);
    const topSix = order.slice(0, 6).reduce((sum, id) => sum + (sideBalls?.batting[id]?.runs ?? 0), 0);
    let summary: string;
    if (!suggested || suggested.length === 0) summary = "No suggested eleven to compare with.";
    else {
      const picked = side.playerIds.filter((id) => !suggested.includes(id));
      const left = suggested.filter((id) => !side.playerIds.includes(id));
      summary = picked.length === 0
        ? "The eleven matched the suggested eleven."
        : `${plural(picked.length, "change")} from the suggested eleven: picked ${listText(picked.map(name))}; left out ${listText(left.map(name))}.`;
    }
    const followed = [
      sideBalls && order.length > 0 ? `The first ${Math.min(6, order.length)} in the batting order scored ${plural(topSix, "run")}.` : "",
      fieldBalls ? `The bowlers took ${plural(fieldBalls.wickets, "wicket")} for ${plural(fieldBalls.runs, "run")}.` : "",
    ].filter(Boolean).join(" ");
    decisions.push({ kind: "SELECTION", teamId: side.teamId, actor: "SETUP", inningsIndex: null, atLegalBall: null, when: "Before play", summary, followUp: null, followed: followed || null, measured: "CLEAR" });
  }

  const battingPlans = new Map<string, { aggression: number; intent: string }>();
  const bowlingPlans = new Map<string, { line: string; length: string; variationId: string; effort: string }>();
  const fields = new Map<string, readonly string[]>();
  const bowlerSpells = new Map<string, PostMatchDecision & { overs: number[] }>();
  for (let n = 0; n < decided.length; n += 1) {
    const entry = decided[n]!;
    const { command, actor, teamId, position } = entry;
    const kind = DECISION_KINDS[command.kind]!;
    if (command.kind === "CALL_TOSS") {
      decisions.push({ kind, teamId, actor, inningsIndex: null, atLegalBall: null, when: "Before play", followUp: null, measured: POST_MATCH_DECISION_EFFECT[kind],
        summary: `Called ${command.payload.call.toLowerCase()}.`,
        followed: toss ? `The coin landed ${toss.coin.toLowerCase()}: ${team(toss.winnerId)} won the toss.` : null });
    } else if (command.kind === "CHOOSE_INNINGS") {
      const first = scorecard.innings[0]!;
      decisions.push({ kind, teamId, actor, inningsIndex: null, atLegalBall: null, when: "Before play", followUp: null, measured: POST_MATCH_DECISION_EFFECT[kind],
        summary: `Chose to ${command.payload.choice === "BAT" ? "bat" : "bowl"} first.`,
        followed: `${team(first.battingTeamId)} made ${first.runs} for ${first.wickets} batting first.` });
    } else if (command.kind === "SET_BATTER") {
      const id = command.payload.playerId;
      const i = position.inningsIndex ?? 0;
      const slot = battingOrder.filter((b) => b.inningsIndex === i).findIndex((b) => b.commandId === command.commandId) + 1;
      const line = scorecard.innings[i]?.batting[id];
      decisions.push({ kind, teamId, actor, inningsIndex: position.inningsIndex, atLegalBall: position.legalBalls, when: when(position), followUp: null, measured: POST_MATCH_DECISION_EFFECT[kind],
        summary: `Sent in ${name(id)}${slot > 0 ? ` at number ${slot}` : ""}.`,
        followed: line ? `${name(id)} made ${line.runs}${line.dismissed ? "" : " not out"} from ${plural(line.ballsFaced, "ball")}.` : null });
    } else if (command.kind === "SET_BOWLER") {
      const i = position.inningsIndex ?? 0;
      const key = `${teamId}|${actor}|${i}|${command.payload.bowlerId}`;
      const over = Math.floor(position.legalBalls / 6) + 1;
      const spell = bowlerSpells.get(key);
      if (spell) spell.overs.push(over);
      else {
        const created = { kind, teamId, actor, inningsIndex: i, atLegalBall: position.legalBalls, when: when(position), followUp: null, followed: null, summary: command.payload.bowlerId, measured: POST_MATCH_DECISION_EFFECT[kind], overs: [over] };
        bowlerSpells.set(key, created);
        decisions.push(created);
      }
    } else if (isPlanKind(command.kind)) {
      // Consecutive plan commands of one kind at the same ball (for example one per batter) are one decision.
      const group = [entry];
      while (n + 1 < decided.length) {
        const next = decided[n + 1]!;
        if (next.command.kind !== command.kind || next.teamId !== teamId || next.actor !== actor ||
          next.position.inningsIndex !== position.inningsIndex || next.position.legalBalls !== position.legalBalls) break;
        group.push(next); n += 1;
      }
      const parts: string[] = [];
      for (const { command: c } of group) {
        if (c.kind === "SET_BATTING_PLAN") {
          const before = battingPlans.get(c.payload.playerId) ?? DEFAULT_BATTING;
          battingPlans.set(c.payload.playerId, { aggression: c.payload.aggression, intent: c.payload.intent });
          const changes: string[] = [];
          if (before.aggression !== c.payload.aggression) changes.push(`aggression ${AGGRESSION[before.aggression]} to ${AGGRESSION[c.payload.aggression]}`);
          if (before.intent !== c.payload.intent) changes.push(`intent ${words(before.intent)} to ${words(c.payload.intent)}`);
          parts.push(`${name(c.payload.playerId)}: ${changes.length ? changes.join(", ") : `kept at ${AGGRESSION[c.payload.aggression]}, ${words(c.payload.intent)}`}`);
        } else if (c.kind === "SET_BOWLING_PLAN") {
          const before = bowlingPlans.get(c.payload.bowlerId) ?? DEFAULT_BOWLING;
          bowlingPlans.set(c.payload.bowlerId, { line: c.payload.line, length: c.payload.length, variationId: c.payload.variationId, effort: c.payload.effort });
          const changes = (["line", "length", "variationId", "effort"] as const)
            .filter((field) => before[field] !== c.payload[field])
            .map((field) => `${field === "variationId" ? "variation" : field} ${words(before[field])} to ${words(c.payload[field])}`);
          parts.push(`${name(c.payload.bowlerId)}: ${changes.length ? changes.join(", ") : "plan kept"}`);
        } else if (c.kind === "SET_FIELD") {
          const slots = c.payload.fieldSlots.map((slot) => slot.slotId);
          const before = fields.get(teamId);
          fields.set(teamId, slots);
          if (!before) parts.push(`set a field with ${listText(slots.map(words))}`);
          else {
            const added = slots.filter((slot) => !before.includes(slot)), removed = before.filter((slot) => !slots.includes(slot));
            parts.push(added.length === 0 ? "field positions kept" : `moved fielders to ${listText(added.map(words))}, away from ${listText(removed.map(words))}`);
          }
        }
      }
      const label = kind === "BATTING_PLAN" ? "Batting plan" : kind === "BOWLING_PLAN" ? "Bowling plan" : "Field";
      const f = followUp(teamId, position, new Set(group.map((g) => g.command.commandId)));
      decisions.push({ kind, teamId, actor, inningsIndex: position.inningsIndex, atLegalBall: position.legalBalls, when: when(position), measured: POST_MATCH_DECISION_EFFECT[kind],
        summary: `${label}: ${parts.join("; ")}.`, followUp: f, followed: followedText(f) });
    }
  }
  // Bowler choices: one line per bowler and innings, with what happened in the overs they were given.
  for (const spell of bowlerSpells.values()) {
    const bowlerId = spell.summary;
    const i = spell.inningsIndex ?? 0;
    const inOvers = balls[i]!.filter((ball) => spell.overs.includes(ball.over) && ball.bowlerId === bowlerId);
    const r = inOvers.reduce((sum, ball) => sum + ball.runs, 0), w = inOvers.filter((ball) => ball.wicket).length;
    spell.summary = `Gave ${name(bowlerId)} ${spell.overs.length === 1 ? "over" : "overs"} ${listText(spell.overs.map(String))}.`;
    spell.followed = `In those overs: ${plural(r, "run")}, ${plural(w, "wicket")}.`;
    delete (spell as Partial<typeof spell>).overs;
  }

  const order = (d: PostMatchDecision) => d.inningsIndex === null ? -1 : d.inningsIndex;
  const stable = decisions.map((d, index) => ({ d, index }))
    .sort((a, b) => order(a.d) - order(b.d) || (a.d.atLegalBall ?? 0) - (b.d.atLegalBall ?? 0) || a.index - b.index)
    .map(({ d }) => d);
  return { version: POST_MATCH_ANALYSIS_VERSION, matchId: scorecard.matchId, phases, turningPoints, decisions: stable, commandCounts };
}

/**
 * LC_POST_MATCH_ANALYSIS_ARCHIVE_V1: the post-match analysis of a completed career fixture, reopened from the
 * stored career event archive. The archive keeps the committed events but not the commands, so the record shows
 * what changed and when, but not who asked for it. Phase by phase and turning points use the V1 rules unchanged
 * (`rulesVersion`). Plan and field changes are listed from their events without saying who made them; there is no
 * "your decisions" section and no comparison with a suggested eleven. Pure, derived on read, nothing saved.
 */
export const ARCHIVED_POST_MATCH_ANALYSIS_VERSION = "LC_POST_MATCH_ANALYSIS_ARCHIVE_V1" as const;

export type ArchivedMatchChangeKind = "BATTING_PLAN" | "BOWLING_PLAN" | "FIELD";
export interface ArchivedMatchChange {
  kind: ArchivedMatchChangeKind;
  /** The side whose setting changed: the batting side for a batting plan, the fielding side otherwise. */
  teamId: string;
  inningsIndex: number;
  atLegalBall: number;
  /** "Over 4.2, 31 for 1". */
  when: string;
  summary: string;
  followUp: PostMatchFollowUp;
  followed: string;
  measured: PostMatchMeasuredEffect;
}

export interface ArchivedPostMatchAnalysis {
  version: typeof ARCHIVED_POST_MATCH_ANALYSIS_VERSION;
  /** Phases and turning points follow these rules. */
  rulesVersion: typeof POST_MATCH_ANALYSIS_VERSION;
  matchId: string;
  phases: PostMatchPhaseInnings[];
  turningPoints: PostMatchTurningPoint[];
  /** The coin and who batted first, as recorded. */
  toss: string | null;
  changes: ArchivedMatchChange[];
  /** Listed changes by side. */
  changeCounts: Record<string, number>;
}

export interface ArchivedPostMatchAnalysisInput {
  events: readonly T20MatchEvent[];
  /** The scorecard stored with the fixture's completion; the events must add up to it. */
  scorecard: T20Scorecard;
  /** Both sides' elevens and keepers, in the match setup's order. */
  teams: readonly { teamId: string; playerIds: readonly string[]; keeperId: string }[];
  names: Readonly<Record<string, string>>;
  teamNames: Readonly<Record<string, string>>;
  /**
   * The field the engine sets when a bowler comes on: the powerplay positions before `powerplayLegalBalls` legal
   * balls of the innings, the later positions after. The engine puts the outfielders (the eleven without the keeper
   * and the bowler) into those positions in sorted order. A new bowler also resets the bowling plan to the default.
   */
  defaultField: { powerplay: readonly string[]; later: readonly string[]; powerplayLegalBalls: number };
}

/** One recorded setting change: `key` names the setting (a batter's plan, the bowler's plan, the field). */
type RecordedChange = {
  kind: ArchivedMatchChangeKind; teamId: string; position: Position & { inningsIndex: number };
  key: string; before: unknown; after: unknown; describe: (before: unknown, after: unknown) => string | null;
};

export function projectArchivedPostMatchAnalysis(input: ArchivedPostMatchAnalysisInput): ArchivedPostMatchAnalysis {
  const { scorecard, names, teamNames, defaultField } = input;
  const name = (id: string) => names[id] ?? id;
  const team = (id: string) => teamNames[id] ?? id;
  const teamIds = input.teams.map((t) => t.teamId);
  if (scorecard.innings.length !== 2 || teamIds.length !== 2 || teamIds[0] === teamIds[1]) throw new Error("LC_POST_MATCH_ANALYSIS_ARCHIVE_TEAMS");
  for (const innings of scorecard.innings) {
    if (!teamIds.includes(innings.battingTeamId) || !teamIds.includes(innings.bowlingTeamId)) throw new Error("LC_POST_MATCH_ANALYSIS_ARCHIVE_TEAMS");
  }

  // The settings in force, rebuilt from the events the way the engine applies them.
  const battingPlans = new Map<string, { aggression: number; intent: string }>();
  let bowlingPlan: { line: string; length: string; variationId: string; effort: string } | null = null;
  let field: { slotId: string; playerId: string }[] = [];
  const recorded: RecordedChange[] = [];
  let battingFirst: string | null = null;
  const { balls, toss } = walkRecord(input.events, scorecard, (event, at) => {
    const payload = event.payload as Record<string, unknown>;
    if (event.type === "INNINGS_STARTED") {
      if (Number(payload.inningsIndex) === 0) battingFirst = String(payload.battingTeamId);
      bowlingPlan = null; field = []; return;
    }
    if (event.type === "BOWLER_SELECTED") {
      bowlingPlan = { ...DEFAULT_BOWLING };
      const fielding = at.inningsIndex === null ? undefined : input.teams.find((t) => t.teamId === scorecard.innings[at.inningsIndex!]?.bowlingTeamId);
      if (!fielding) throw new Error("LC_POST_MATCH_ANALYSIS_ARCHIVE_FIELD");
      const bowlerId = String(payload.playerId);
      const outfield = fielding.playerIds.filter((id) => id !== fielding.keeperId && id !== bowlerId).sort();
      const slots = at.legalBalls < defaultField.powerplayLegalBalls ? defaultField.powerplay : defaultField.later;
      if (outfield.length !== slots.length) throw new Error("LC_POST_MATCH_ANALYSIS_ARCHIVE_FIELD");
      field = slots.map((slotId, n) => ({ slotId, playerId: outfield[n]! }));
      return;
    }
    if (at.inningsIndex === null) return;
    const innings = scorecard.innings[at.inningsIndex];
    if (!innings) return;
    const position = { ...at, inningsIndex: at.inningsIndex };
    if (event.type === "BATTING_PLAN_CHANGED") {
      const playerId = String(payload.playerId), after = { aggression: Number(payload.aggression), intent: String(payload.intent) };
      const before = battingPlans.get(playerId) ?? DEFAULT_BATTING;
      battingPlans.set(playerId, after);
      recorded.push({ kind: "BATTING_PLAN", teamId: innings.battingTeamId, position, key: playerId, before, after, describe: (b, a) => {
        const x = b as typeof after, y = a as typeof after, changes: string[] = [];
        if (x.aggression !== y.aggression) changes.push(`aggression ${AGGRESSION[x.aggression]} to ${AGGRESSION[y.aggression]}`);
        if (x.intent !== y.intent) changes.push(`intent ${words(x.intent)} to ${words(y.intent)}`);
        return changes.length ? `${name(playerId)}: ${changes.join(", ")}` : null;
      } });
    } else if (event.type === "BOWLING_PLAN_CHANGED") {
      const bowlerId = String(payload.bowlerId);
      const after = { line: String(payload.line), length: String(payload.length), variationId: String(payload.variationId), effort: String(payload.effort) };
      const before: typeof after = bowlingPlan ?? { ...DEFAULT_BOWLING };
      bowlingPlan = after;
      recorded.push({ kind: "BOWLING_PLAN", teamId: innings.bowlingTeamId, position, key: bowlerId, before, after, describe: (b, a) => {
        const x = b as typeof after, y = a as typeof after;
        const changes = (["line", "length", "variationId", "effort"] as const)
          .filter((key) => x[key] !== y[key])
          .map((key) => `${key === "variationId" ? "variation" : key} ${words(x[key])} to ${words(y[key])}`);
        return changes.length ? `${name(bowlerId)}: ${changes.join(", ")}` : null;
      } });
    } else if (event.type === "FIELD_CHANGED") {
      const after = (payload.fieldSlots as { slotId: string; playerId: string }[]).map((slot) => ({ slotId: String(slot.slotId), playerId: String(slot.playerId) }));
      const before = field;
      field = after;
      recorded.push({ kind: "FIELD", teamId: innings.bowlingTeamId, position, key: "field", before, after, describe: (b, a) => {
        const x = b as typeof after, y = a as typeof after;
        const beforeSlots = x.map((slot) => slot.slotId), afterSlots = y.map((slot) => slot.slotId);
        const added = afterSlots.filter((slot) => !beforeSlots.includes(slot)), removed = beforeSlots.filter((slot) => !afterSlots.includes(slot));
        const moved = y.some((slot) => x.find((old) => old.slotId === slot.slotId)?.playerId !== slot.playerId);
        return added.length > 0
          ? `fielders moved to ${listText(added.map(words))}, away from ${listText(removed.map(words))}`
          : moved ? "the same positions, with fielders swapped between them" : null;
      } });
    }
  });
  const { phases, turningPoints } = phasesAndTurningPoints(balls, scorecard, team);

  // Several changes of one kind for one side at the same ball (for example one per batter) are one line; a change
  // that left the setting as it was is not listed.
  const groups: RecordedChange[][] = [];
  for (const change of recorded) {
    const last = groups.at(-1)?.[0];
    if (last && last.kind === change.kind && last.teamId === change.teamId && last.position.inningsIndex === change.position.inningsIndex &&
      last.position.legalBalls === change.position.legalBalls) groups.at(-1)!.push(change);
    else groups.push([change]);
  }
  // Within a line, each setting is described from its value before the first change to its value after the last, so
  // a setting changed and changed back at the same ball is not listed.
  const listed = groups.map((group) => {
    const net = new Map<string, { before: unknown; after: unknown; describe: RecordedChange["describe"] }>();
    for (const change of group) {
      const seen = net.get(change.key);
      if (seen) seen.after = change.after;
      else net.set(change.key, { before: change.before, after: change.after, describe: change.describe });
    }
    const parts = [...net.values()].map((entry) => entry.describe(entry.before, entry.after)).filter((part): part is string => part !== null);
    return { first: group[0]!, parts };
  }).filter((group) => group.parts.length > 0);
  const label = { BATTING_PLAN: "Batting plan changed", BOWLING_PLAN: "Bowling plan changed", FIELD: "Field changed" } as const;
  const changes: ArchivedMatchChange[] = listed.map(({ first, parts }) => {
    const p = first.position, i = p.inningsIndex, end = p.legalBalls + POST_MATCH_ANALYSIS_RULES.followLegalBalls;
    const span = balls[i]!.filter((ball) => ball.legalBefore >= p.legalBalls && ball.legalBefore < end);
    const legalBalls = span.filter((ball) => ball.legal).length;
    const overlapped = listed.some((other) => other.first !== first && other.first.teamId === first.teamId && other.first.position.inningsIndex === i &&
      other.first.position.legalBalls > p.legalBalls && other.first.position.legalBalls < end);
    const followUp: PostMatchFollowUp = {
      legalBalls, runs: span.reduce((sum, ball) => sum + ball.runs, 0), wickets: span.filter((ball) => ball.wicket).length,
      inningsEnded: legalBalls < POST_MATCH_ANALYSIS_RULES.followLegalBalls, overlapped,
      rateBefore: p.legalBalls > 0 ? rate(p.runs, p.legalBalls) : null,
    };
    let followed: string;
    if (followUp.legalBalls === 0) followed = "No more balls were bowled in the innings.";
    else {
      const spanText = followUp.inningsEnded ? `The next ${plural(followUp.legalBalls, "ball")} (the innings then ended)` : "The next 2 overs";
      const before = followUp.rateBefore === null ? "" : ` Before it: ${rateText(followUp.rateBefore)} an over.`;
      const overlap = followUp.overlapped ? " Another plan or field change for this side came within those balls." : "";
      followed = `${spanText}: ${plural(followUp.runs, "run")}, ${plural(followUp.wickets, "wicket")}.${before}${overlap}`;
    }
    return {
      kind: first.kind, teamId: first.teamId, inningsIndex: i, atLegalBall: p.legalBalls,
      when: p.legalBalls === 0 ? `Start of innings ${i + 1}, 0 for 0` : `Over ${oversText(p.legalBalls)}, ${p.runs} for ${p.wickets}`,
      summary: `${label[first.kind]}: ${parts.join("; ")}.`, followUp, followed, measured: POST_MATCH_DECISION_EFFECT[first.kind],
    };
  });
  const changeCounts: Record<string, number> = Object.fromEntries(teamIds.map((id) => [id, 0]));
  for (const change of changes) changeCounts[change.teamId] = (changeCounts[change.teamId] ?? 0) + 1;

  const first = battingFirst as string | null;
  const tossText = toss
    ? `The coin landed ${toss.coin.toLowerCase()}: ${team(toss.winnerId)} won the toss.${first ? ` ${team(first)} batted first.` : ""}`
    : null;
  return {
    version: ARCHIVED_POST_MATCH_ANALYSIS_VERSION, rulesVersion: POST_MATCH_ANALYSIS_VERSION, matchId: scorecard.matchId,
    phases, turningPoints, toss: tossText, changes, changeCounts,
  };
}
