import type { View } from "./protocol.js";
import { dismissalText } from "./dismissal-text.js";

/**
 * CP04 (Studio Production Directive 05): broadcast-style moments for the events that matter, derived only from the
 * authoritative view the worker sends (the innings ledgers, the committed delivery highlights and the result). Nothing
 * here simulates, predicts or stores cricket state: a baseline is a copy of counters the view already carried, used
 * to see what changed between two drawn views. Pure and deterministic, so it is unit tested without a browser.
 */

export type MomentKind = "RESULT" | "HAT_TRICK" | "FIVE_WICKETS" | "HUNDRED" | "WICKET" | "FIFTY" | "SIX" | "FOUR" | "MAIDEN";

/** How much a moment matters; the highest wins when several happen between two drawn views. */
export const MOMENT_WEIGHT: Record<MomentKind, number> = {
  RESULT: 100,
  HAT_TRICK: 90,
  FIVE_WICKETS: 80,
  HUNDRED: 75,
  WICKET: 60,
  FIFTY: 50,
  SIX: 40,
  FOUR: 30,
  MAIDEN: 20,
};

/** The caption word for each kind (rendered in capitals by CSS). */
export const MOMENT_WORD: Record<MomentKind, string> = {
  RESULT: "Full time",
  HAT_TRICK: "Hat-trick",
  FIVE_WICKETS: "Five wickets",
  HUNDRED: "Hundred",
  WICKET: "Wicket",
  FIFTY: "Fifty",
  SIX: "Six",
  FOUR: "Four",
  MAIDEN: "Maiden over",
};

export interface MatchMoment {
  kind: MomentKind;
  /** Unique per event, so the same moment is never shown twice. */
  key: string;
  word: string;
  /** One sentence; names always sit inside a sentence. */
  line: string;
  /** A second, quieter line (figures), or null. */
  detail: string | null;
  /** Whose portrait to show, if anyone's. */
  playerId: string | null;
  /** Whose crest or kit to use. */
  teamId: string | null;
  /** Committed sequence of the delivery behind it (0 for the result), for ordering ties. */
  sequence: number;
}

/** What else happened in a batched advance, counted from the ledgers so a skipped render cannot lose any. */
export interface MomentTally {
  wickets: number;
  fours: number;
  sixes: number;
  runs: number;
  legalBalls: number;
}

/** Counters copied from the last view the moments looked at. */
export interface MomentBaseline {
  matchId: string;
  revision: number;
  lastSequence: number;
  resultText: string | null;
  innings: {
    runs: number;
    wickets: number;
    legalBalls: number;
    batting: Record<string, { runs: number; fours: number; sixes: number }>;
    bowling: Record<string, { wickets: number; maidens: number }>;
  }[];
}

export function momentBaseline(view: View): MomentBaseline {
  return {
    matchId: view.matchId ?? "",
    revision: view.revision,
    lastSequence: view.fieldPresentation?.latestHighlight?.sequence ?? 0,
    resultText: view.resultText,
    innings: view.innings.map((ledger) => ({
      runs: ledger.innings.runs,
      wickets: ledger.innings.wickets,
      legalBalls: ledger.innings.legalBalls,
      batting: Object.fromEntries(Object.entries(ledger.batting).map(([id, b]) => [id, { runs: b.runs, fours: b.fours, sixes: b.sixes }])),
      bowling: Object.fromEntries(Object.entries(ledger.bowling).map(([id, b]) => [id, { wickets: b.wickets, maidens: b.maidens }])),
    })),
  };
}

/** True when the new view continues the match the baseline was taken from (not a load, a new match or a rewind). */
export function continuesFrom(baseline: MomentBaseline, view: View): boolean {
  return baseline.matchId === (view.matchId ?? "") && view.revision >= baseline.revision && view.innings.length >= baseline.innings.length;
}

type Cue = NonNullable<NonNullable<View["fieldPresentation"]>["latestHighlight"]>;
const BOWLER_CREDITED = new Set(["BOWLED", "LBW", "CAUGHT", "STUMPED", "HIT_WICKET"]);

function overs(balls: number): string {
  return balls % 6 === 0 ? `${balls / 6}` : `${Math.floor(balls / 6)}.${balls % 6}`;
}

function name(view: View, id: string | null | undefined): string {
  return id ? (view.names[id] ?? id) : "";
}

function teamOf(view: View, playerId: string): string | null {
  return view.teams.find((team) => team.playerIds.includes(playerId))?.id ?? null;
}

function teamName(view: View, id: string | null | undefined): string {
  return view.teams.find((team) => team.id === id)?.name ?? id ?? "";
}

/** The player a wicket cue dismissed: only the striker can be out other than run out; a run out is matched by name. */
function dismissedId(view: View, cue: Cue): string | null {
  const ledger = view.innings[cue.inningsIndex];
  if (!ledger || !cue.dismissalKind) return null;
  if (cue.dismissalKind !== "RUN_OUT") return cue.strikerId;
  const match = Object.entries(ledger.dismissals).find(([id, d]) => d.kind === "RUN_OUT" && name(view, id) === cue.dismissedPlayerName);
  return match ? match[0] : cue.dismissedPlayerName === cue.strikerName ? cue.strikerId : null;
}

/** A batter's score as a scorecard prints it: 34 (22). */
function batterFigures(view: View, inningsIndex: number, playerId: string): string {
  const b = view.innings[inningsIndex]?.batting[playerId];
  return b ? `${b.runs} (${b.ballsFaced})` : "";
}

/** A bowler's figures: 3/21 from 3.4 overs. */
function bowlerFigures(view: View, inningsIndex: number, playerId: string): string {
  const b = view.innings[inningsIndex]?.bowling[playerId];
  return b ? `${b.wickets}/${b.runsConceded} from ${overs(b.legalBalls)} ${b.legalBalls === 6 ? "over" : "overs"}` : "";
}

/**
 * A hat-trick: the bowler's last three deliveries of the innings (wides and no-balls included) each took a wicket
 * credited to the bowler. Read from the committed highlights, which hold the latest 24 deliveries; because older
 * deliveries are the ones dropped, a bowler's latest three are always complete when three are present.
 */
export function isHatTrick(cues: readonly Cue[], latest: Cue): boolean {
  const own = cues.filter((c) => c.inningsIndex === latest.inningsIndex && c.bowlerId === latest.bowlerId && c.sequence <= latest.sequence);
  const lastThree = own.slice(-3);
  return lastThree.length === 3 && lastThree.every((c) => c.dismissalKind !== null && BOWLER_CREDITED.has(c.dismissalKind));
}

/** The result line with the winner, from the view's own result text. */
function resultMoment(view: View): MatchMoment {
  const result = (view.scorecard as { result?: { kind?: string; winnerTeamId?: string } } | null)?.result;
  const winner = result?.kind === "WIN" && result.winnerTeamId ? result.winnerTeamId : null;
  return {
    kind: "RESULT",
    key: `result:${view.matchId ?? ""}`,
    word: MOMENT_WORD.RESULT,
    line: view.resultText ?? "",
    detail: view.innings
      .map((l) => `${teamName(view, l.innings.battingTeamId)} ${l.innings.runs}${l.innings.wickets < 10 ? `/${l.innings.wickets}` : " all out"}`)
      .join(" · "),
    playerId: null,
    teamId: winner,
    sequence: Number.MAX_SAFE_INTEGER,
  };
}

/**
 * Every moment between the baseline and the view, unordered. Deliveries come from the committed highlights newer
 * than the baseline; milestones, hauls and maidens from the ledger counters crossing their thresholds, so they are
 * found even when several overs pass between two drawn views.
 */
export function momentsBetween(baseline: MomentBaseline, view: View): MatchMoment[] {
  const out: MatchMoment[] = [];
  const cues = view.fieldPresentation?.recentHighlights ?? [];
  const fresh = cues.filter((c) => c.sequence > baseline.lastSequence);
  for (const cue of fresh) {
    if (cue.dismissalKind) {
      const outId = dismissedId(view, cue);
      const ledger = view.innings[cue.inningsIndex];
      const how = outId && ledger?.dismissals[outId] ? dismissalText(ledger.dismissals[outId]!, view.names, ledger.keeperId) : null;
      const hatTrick = BOWLER_CREDITED.has(cue.dismissalKind) && isHatTrick(cues, cue);
      out.push({
        kind: hatTrick ? "HAT_TRICK" : "WICKET",
        key: `${hatTrick ? "hat-trick" : "wicket"}:${cue.sequence}`,
        word: MOMENT_WORD[hatTrick ? "HAT_TRICK" : "WICKET"],
        line: hatTrick
          ? `${cue.bowlerName} takes three wickets in three balls: ${cue.dismissedPlayerName ?? ""} ${how ?? ""}`.trim()
          : `${cue.dismissedPlayerName ?? cue.strikerName} ${how ?? "out"}${outId ? `, ${batterFigures(view, cue.inningsIndex, outId)}` : ""}`,
        detail: BOWLER_CREDITED.has(cue.dismissalKind) ? `${cue.bowlerName} ${bowlerFigures(view, cue.inningsIndex, cue.bowlerId)}` : null,
        playerId: outId,
        teamId: outId ? teamOf(view, outId) : null,
        sequence: cue.sequence,
      });
    } else if (cue.boundary === "SIX" || cue.boundary === "FOUR") {
      const kind = cue.boundary;
      out.push({
        kind,
        key: `${kind.toLowerCase()}:${cue.sequence}`,
        word: MOMENT_WORD[kind],
        line: `${cue.strikerName} ${kind === "SIX" ? "clears the rope" : "finds the boundary"} off ${cue.bowlerName}`,
        detail: `${cue.strikerName} ${batterFigures(view, cue.inningsIndex, cue.strikerId)}`,
        playerId: cue.strikerId,
        teamId: teamOf(view, cue.strikerId),
        sequence: cue.sequence,
      });
    }
  }
  const lastSeq = fresh.length > 0 ? fresh[fresh.length - 1]!.sequence : baseline.lastSequence;
  view.innings.forEach((ledger, index) => {
    const before = baseline.innings[index];
    for (const [id, line] of Object.entries(ledger.batting)) {
      const was = before?.batting[id]?.runs ?? 0;
      const kind: MomentKind | null = was < 100 && line.runs >= 100 ? "HUNDRED" : was < 50 && line.runs >= 50 ? "FIFTY" : null;
      if (!kind) continue;
      out.push({
        kind,
        key: `${kind.toLowerCase()}:${index}:${id}`,
        word: MOMENT_WORD[kind],
        line: `${name(view, id)} reaches ${kind === "HUNDRED" ? "a hundred" : "fifty"}: ${line.runs} from ${line.ballsFaced} balls`,
        detail: `${line.fours} ${line.fours === 1 ? "four" : "fours"}, ${line.sixes} ${line.sixes === 1 ? "six" : "sixes"}`,
        playerId: id,
        teamId: ledger.innings.battingTeamId,
        sequence: lastSeq,
      });
    }
    for (const [id, line] of Object.entries(ledger.bowling)) {
      const was = before?.bowling[id] ?? { wickets: 0, maidens: 0 };
      if (was.wickets < 5 && line.wickets >= 5) {
        out.push({
          kind: "FIVE_WICKETS",
          key: `five:${index}:${id}`,
          word: MOMENT_WORD.FIVE_WICKETS,
          line: `${name(view, id)} takes five wickets`,
          detail: `${name(view, id)} ${bowlerFigures(view, index, id)}`,
          playerId: id,
          teamId: ledger.innings.bowlingTeamId,
          sequence: lastSeq,
        });
      }
      if (line.maidens > was.maidens) {
        out.push({
          kind: "MAIDEN",
          key: `maiden:${index}:${id}:${line.maidens}`,
          word: MOMENT_WORD.MAIDEN,
          line: `${name(view, id)} bowls a maiden over`,
          detail: `${name(view, id)} ${bowlerFigures(view, index, id)}`,
          playerId: id,
          teamId: ledger.innings.bowlingTeamId,
          sequence: lastSeq,
        });
      }
    }
  });
  if (view.resultText && !baseline.resultText) out.push(resultMoment(view));
  return out;
}

/** The one moment to show: the most significant, the latest of equals. */
export function pickMoment(moments: readonly MatchMoment[]): MatchMoment | null {
  let best: MatchMoment | null = null;
  for (const m of moments) {
    if (!best || MOMENT_WEIGHT[m.kind] > MOMENT_WEIGHT[best.kind] || (MOMENT_WEIGHT[m.kind] === MOMENT_WEIGHT[best.kind] && m.sequence >= best.sequence)) best = m;
  }
  return best;
}

/** Wickets, boundaries, runs and balls between the baseline and the view, from the ledgers. */
export function tallyBetween(baseline: MomentBaseline, view: View): MomentTally {
  const tally: MomentTally = { wickets: 0, fours: 0, sixes: 0, runs: 0, legalBalls: 0 };
  view.innings.forEach((ledger, index) => {
    const before = baseline.innings[index];
    tally.wickets += ledger.innings.wickets - (before?.wickets ?? 0);
    tally.runs += ledger.innings.runs - (before?.runs ?? 0);
    tally.legalBalls += ledger.innings.legalBalls - (before?.legalBalls ?? 0);
    for (const [id, line] of Object.entries(ledger.batting)) {
      tally.fours += line.fours - (before?.batting[id]?.fours ?? 0);
      tally.sixes += line.sixes - (before?.batting[id]?.sixes ?? 0);
    }
  });
  return tally;
}

/** "In that over: 10 runs, 2 fours." or "In those 4 overs: 31 runs, 2 wickets, 3 fours, 1 six." Null for one ball or none. */
export function tallyText(tally: MomentTally): string | null {
  if (tally.legalBalls < 2) return null;
  const parts = [`${tally.runs} ${tally.runs === 1 ? "run" : "runs"}`];
  if (tally.wickets) parts.push(`${tally.wickets} ${tally.wickets === 1 ? "wicket" : "wickets"}`);
  if (tally.fours) parts.push(`${tally.fours} ${tally.fours === 1 ? "four" : "fours"}`);
  if (tally.sixes) parts.push(`${tally.sixes} ${tally.sixes === 1 ? "six" : "sixes"}`);
  const span = tally.legalBalls === 6 ? "over" : tally.legalBalls > 6 ? `${overs(tally.legalBalls)} overs` : `${tally.legalBalls} balls`;
  return `${span === "over" ? "In that over" : `In those ${span}`}: ${parts.join(", ")}.`;
}

/**
 * The batching rule. A batched advance (Finish innings, Finish match, Next key moment, and a Finish over, which the
 * worker answers in one reply) produces no moment while it runs. When it settles, at most one moment is shown: the
 * most significant event of the whole batch, with a one-line tally when the batch covered more than one ball. Moments
 * never queue: a new one replaces the one on screen, and nothing from a finished batch is replayed afterwards.
 */
export function settleMoment(baseline: MomentBaseline, view: View): { moment: MatchMoment | null; summary: string | null } {
  if (!continuesFrom(baseline, view)) return { moment: null, summary: null };
  const moment = pickMoment(momentsBetween(baseline, view));
  if (!moment) return { moment: null, summary: null };
  const summary = moment.kind === "RESULT" ? null : tallyText(tallyBetween(baseline, view));
  return { moment, summary };
}

/** The per-browser preference: Full, Brief or Off. Stored like the other match presentation preferences. */
export type MomentsPreference = "full" | "brief" | "off";
export const MOMENTS_PREFERENCE_KEY = "lcxxvi-match-moments";
export function readMomentsPreference(): MomentsPreference {
  try {
    const saved = localStorage.getItem(MOMENTS_PREFERENCE_KEY);
    return saved === "brief" || saved === "off" ? saved : "full";
  } catch {
    return "full";
  }
}
export function writeMomentsPreference(value: MomentsPreference): void {
  try {
    localStorage.setItem(MOMENTS_PREFERENCE_KEY, value);
  } catch {
    /* a preference only; the default applies next time */
  }
}
/** How long a moment stays before it clears itself (it also clears on the next moment or when dismissed). */
export const MOMENT_DURATION_MS: Record<Exclude<MomentsPreference, "off">, number> = { full: 3200, brief: 1800 };
