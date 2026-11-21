import type { AppliedSeasonMatch, MatchAwardRecord, T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import { seasonTableAfter } from "./season.js";

/**
 * A match report built only from a completed fixture's scorecard and the season's applied results.
 * Pure and deterministic: nothing here is saved, and the same inputs always give the same report.
 * Every sentence states a recorded fact; no statistic is invented.
 */

/** Starting values for the report's judgements. Tune after playtests; they are design choices, not calibration. */
export const MATCH_REPORT_RULES = {
  thrillerRuns: 5,
  thrillerWickets: 1,
  /** A chase that ends with this many legal balls or fewer left counts as won in the last over. */
  lastOverBallsLeft: 5,
  statementRuns: 50,
  statementWickets: 8,
  bigScore: 75,
  bigHaul: 4,
  /** A collapse is two or more wickets inside this many legal balls. */
  collapseWindowBalls: 12,
  collapseMinWickets: 2,
  inningsBalls: 120,
} as const;

export type MatchReportHeadlineKind = "TIE" | "NO_RESULT" | "THRILLER" | "STATEMENT" | "INDIVIDUAL" | "PLAIN";
export type MatchReportOutcome = "WON" | "LOST" | "TIED" | "NO_RESULT";

export interface MatchReportBatter { playerId: string; runs: number; ballsFaced: number; notOut: boolean }
export interface MatchReportBowler { playerId: string; wickets: number; runsConceded: number; overs: string }
export interface MatchReportInnings {
  battingTeamId: string;
  runs: number;
  wickets: number;
  overs: string;
  topBatters: MatchReportBatter[];
  topBowlers: MatchReportBowler[];
}
export interface MatchReportTurningPoint {
  kind: "COLLAPSE" | "STAND";
  inningsIndex: 0 | 1;
  battingTeamId: string;
  wickets: number;
  runs: number;
  fromOver: string;
  toOver: string;
  text: string;
}
export interface MatchReportPartnership { inningsIndex: 0 | 1; battingTeamId: string; runs: number; wicketNumber: number; unbroken: boolean; text: string }
export interface MatchReportTableMove { before: number; after: number; text: string }

export interface MatchReport {
  fixtureId: string;
  roundNumber: number;
  focusTeamId: string;
  outcome: MatchReportOutcome;
  headlineKind: MatchReportHeadlineKind;
  headline: string;
  resultLine: string;
  innings: [MatchReportInnings, MatchReportInnings];
  playerOfTheMatch: { playerId: string; teamId: string | null; line: string } | null;
  turningPoint: MatchReportTurningPoint | null;
  bestPartnership: MatchReportPartnership | null;
  tableMove: MatchReportTableMove | null;
}

export interface MatchReportInput {
  completion: T20SeasonMatchCompletion;
  /** The team the report is written for (the managed club). */
  focusTeamId: string;
  /** Every applied match of the season so far, including this fixture's round. */
  appliedMatches: readonly AppliedSeasonMatch[];
  teamIds: readonly string[];
  award?: MatchAwardRecord | null;
  teamName: (teamId: string) => string;
  playerName: (playerId: string) => string;
}

function hashPick(key: string, count: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

/** The over and ball of the nth legal ball, in the game's notation: ball 1 is 0.1, ball 6 is 0.6, ball 7 is 1.1. */
export function overOfLegalBall(legalBall: number): string {
  const n = Math.max(1, legalBall);
  return `${Math.floor((n - 1) / 6)}.${((n - 1) % 6) + 1}`;
}

function oversText(legalBalls: number): string {
  return legalBalls % 6 === 0 ? `${legalBalls / 6}` : `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]}`;
}

type Innings = T20SeasonMatchCompletion["scorecard"]["innings"][number];

function inningsSummary(innings: Innings): MatchReportInnings {
  const topBatters = Object.entries(innings.batting)
    .filter(([, line]) => line.ballsFaced > 0 || line.runs > 0)
    .map(([playerId, line]) => ({ playerId, runs: line.runs, ballsFaced: line.ballsFaced, notOut: !line.dismissed }))
    .sort((a, b) => b.runs - a.runs || a.ballsFaced - b.ballsFaced || a.playerId.localeCompare(b.playerId))
    .slice(0, 2);
  const topBowlers = Object.entries(innings.bowling)
    .filter(([, line]) => line.legalBalls > 0)
    .map(([playerId, line]) => ({ playerId, wickets: line.wickets, runsConceded: line.runsConceded, overs: oversText(line.legalBalls) }))
    .sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded || a.playerId.localeCompare(b.playerId))
    .slice(0, 2);
  return { battingTeamId: innings.battingTeamId, runs: innings.runs, wickets: innings.wickets, overs: innings.overs, topBatters, topBowlers };
}

function worstCollapse(innings: Innings, inningsIndex: 0 | 1, teamName: (id: string) => string): MatchReportTurningPoint | null {
  const falls = [...innings.fallOfWickets].sort((a, b) => a.legalBalls - b.legalBalls || a.sequence - b.sequence);
  let best: { wickets: number; runs: number; from: number; to: number } | null = null;
  for (let start = 0; start < falls.length; start += 1) {
    let end = start;
    while (end + 1 < falls.length && falls[end + 1]!.legalBalls - falls[start]!.legalBalls <= MATCH_REPORT_RULES.collapseWindowBalls) end += 1;
    const wickets = end - start + 1;
    if (wickets < MATCH_REPORT_RULES.collapseMinWickets) continue;
    const runs = falls[end]!.runs - falls[start]!.runs;
    if (!best || wickets > best.wickets || (wickets === best.wickets && runs < best.runs)) {
      best = { wickets, runs, from: falls[start]!.legalBalls, to: falls[end]!.legalBalls };
    }
  }
  if (!best) return null;
  const fromOver = overOfLegalBall(best.from), toOver = overOfLegalBall(best.to);
  return {
    kind: "COLLAPSE", inningsIndex, battingTeamId: innings.battingTeamId, wickets: best.wickets, runs: best.runs, fromOver, toOver,
    text: `${teamName(innings.battingTeamId)} lost ${best.wickets} wickets for ${best.runs} ${best.runs === 1 ? "run" : "runs"} between overs ${fromOver} and ${toOver}.`,
  };
}

function partnerships(innings: Innings, inningsIndex: 0 | 1, teamName: (id: string) => string): MatchReportPartnership[] {
  const falls = [...innings.fallOfWickets].sort((a, b) => a.legalBalls - b.legalBalls || a.sequence - b.sequence);
  const stands: MatchReportPartnership[] = [];
  // A scorecard whose fall-of-wickets list does not account for every wicket cannot give honest stands.
  if (falls.length !== innings.wickets) return stands;
  let previousRuns = 0;
  falls.forEach((fall, index) => {
    stands.push({ inningsIndex, battingTeamId: innings.battingTeamId, runs: fall.runs - previousRuns, wicketNumber: index + 1, unbroken: false, text: "" });
    previousRuns = fall.runs;
  });
  if (innings.wickets < 10) {
    stands.push({ inningsIndex, battingTeamId: innings.battingTeamId, runs: innings.runs - previousRuns, wicketNumber: falls.length + 1, unbroken: true, text: "" });
  }
  return stands.map((stand) => ({
    ...stand,
    text: `${teamName(stand.battingTeamId)}: ${stand.runs} for the ${ordinal(stand.wicketNumber)} wicket${stand.unbroken ? ", unbroken" : ""}.`,
  }));
}

const HEADLINES: Record<Exclude<MatchReportHeadlineKind, "INDIVIDUAL">, Record<MatchReportOutcome, readonly string[]>> = {
  TIE: {
    WON: ["Nothing between them"], LOST: ["Nothing between them"], NO_RESULT: ["Nothing between them"],
    TIED: ["Nothing between them", "Scores level at the finish", "A tie, and no one goes home happy"],
  },
  NO_RESULT: { WON: ["No result"], LOST: ["No result"], TIED: ["No result"], NO_RESULT: ["No result", "Honours even: no result"] },
  THRILLER: {
    WON: ["{focus} hold their nerve", "{focus} edge a thriller", "Over the line, just"],
    LOST: ["Heartbreak for {focus}", "So close for {focus}", "{focus} fall just short"],
    TIED: ["Nothing between them"], NO_RESULT: ["No result"],
  },
  STATEMENT: {
    WON: ["{focus} make a statement", "A commanding day for {focus}", "{focus} in total control"],
    LOST: ["A day to forget for {focus}", "{focus} well beaten", "Heavy defeat for {focus}"],
    TIED: ["Nothing between them"], NO_RESULT: ["No result"],
  },
  PLAIN: {
    WON: ["{focus} take the points", "A good day for {focus}", "{focus} get the job done"],
    LOST: ["{focus} come up short", "Not {focus}'s day", "{focus} beaten"],
    TIED: ["Nothing between them"], NO_RESULT: ["No result"],
  },
};

export function buildMatchReport(input: MatchReportInput): MatchReport {
  const { completion, focusTeamId, teamName, playerName } = input;
  const { scorecard } = completion;
  const result = scorecard.result;
  const first = scorecard.innings[0]!, second = scorecard.innings[1]!;
  const innings: [MatchReportInnings, MatchReportInnings] = [inningsSummary(first), inningsSummary(second)];

  const outcome: MatchReportOutcome = result.kind === "WIN"
    ? (result.winnerTeamId === focusTeamId ? "WON" : "LOST")
    : result.kind === "NO_RESULT" ? "NO_RESULT" : "TIED";

  let resultLine: string;
  if (result.kind === "WIN") {
    const margin = result.marginType === "WICKETS" ? result.marginWickets : result.marginRuns;
    const unit = result.marginType === "WICKETS" ? "wicket" : "run";
    resultLine = `${teamName(result.winnerTeamId)} won by ${margin} ${unit}${margin === 1 ? "" : "s"}`;
  } else {
    resultLine = result.kind === "NO_RESULT" ? "No result" : "Match tied";
  }

  // Standout individual performance across both innings, best batter first.
  const allBatters = innings.flatMap((item) => item.topBatters).sort((a, b) => b.runs - a.runs || a.playerId.localeCompare(b.playerId));
  const allBowlers = innings.flatMap((item) => item.topBowlers).sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded || a.playerId.localeCompare(b.playerId));
  const bigBatter = allBatters.find((batter) => batter.runs >= MATCH_REPORT_RULES.bigScore) ?? null;
  const bigBowler = allBowlers.find((bowler) => bowler.wickets >= MATCH_REPORT_RULES.bigHaul) ?? null;

  let headlineKind: MatchReportHeadlineKind;
  if (result.kind === "NO_RESULT") headlineKind = "NO_RESULT";
  else if (result.kind !== "WIN") headlineKind = "TIE";
  else {
    const ballsLeft = MATCH_REPORT_RULES.inningsBalls - second.legalBalls;
    const thriller = result.marginType === "RUNS"
      ? result.marginRuns <= MATCH_REPORT_RULES.thrillerRuns
      : result.marginType === "WICKETS" && (result.marginWickets <= MATCH_REPORT_RULES.thrillerWickets || ballsLeft <= MATCH_REPORT_RULES.lastOverBallsLeft);
    const statement = result.marginType === "WICKETS"
      ? result.marginWickets >= MATCH_REPORT_RULES.statementWickets
      : result.marginRuns >= MATCH_REPORT_RULES.statementRuns;
    headlineKind = thriller ? "THRILLER" : statement ? "STATEMENT" : bigBatter || bigBowler ? "INDIVIDUAL" : "PLAIN";
  }

  let headline: string;
  if (headlineKind === "INDIVIDUAL") {
    headline = bigBatter
      ? `${playerName(bigBatter.playerId)} makes ${bigBatter.runs}${bigBatter.notOut ? " not out" : ""}`
      : `${playerName(bigBowler!.playerId)} takes ${bigBowler!.wickets} for ${bigBowler!.runsConceded}`;
  } else {
    const options = HEADLINES[headlineKind][outcome];
    headline = options[hashPick(completion.fixtureId, options.length)]!.replaceAll("{focus}", teamName(focusTeamId));
  }

  // Turning point: the losing side's worst collapse while batting. Without one, the winner's best stand.
  const loserId = result.kind === "WIN" ? (result.winnerTeamId === first.battingTeamId ? second.battingTeamId : first.battingTeamId) : null;
  const stands = [...partnerships(first, 0, teamName), ...partnerships(second, 1, teamName)];
  const bestOf = (items: MatchReportPartnership[]) => items.reduce<MatchReportPartnership | null>(
    (best, stand) => (!best || stand.runs > best.runs ? stand : best), null);
  const bestPartnership = bestOf(stands);
  let turningPoint: MatchReportTurningPoint | null = null;
  if (loserId) {
    const loserIndex: 0 | 1 = first.battingTeamId === loserId ? 0 : 1;
    turningPoint = worstCollapse(scorecard.innings[loserIndex]!, loserIndex, teamName);
    if (!turningPoint) {
      const winnerStand = bestOf(stands.filter((stand) => stand.battingTeamId !== loserId));
      if (winnerStand && winnerStand.runs > 0) {
        turningPoint = {
          kind: "STAND", inningsIndex: winnerStand.inningsIndex, battingTeamId: winnerStand.battingTeamId, wickets: 0, runs: winnerStand.runs, fromOver: "", toOver: "",
          text: `${teamName(winnerStand.battingTeamId)} put on ${winnerStand.runs} for the ${ordinal(winnerStand.wicketNumber)} wicket${winnerStand.unbroken ? ", unbroken" : ""}.`,
        };
      }
    }
  }

  let playerOfTheMatch: MatchReport["playerOfTheMatch"] = null;
  const award = input.award ?? null;
  if (award && award.status === "AWARDED" && award.winnerPlayerId) {
    const id = award.winnerPlayerId;
    const bat = [first, second].map((item) => item.batting[id]).find((line) => line && (line.ballsFaced > 0 || line.runs > 0));
    const bowl = [first, second].map((item) => item.bowling[id]).find((line) => line && line.legalBalls > 0);
    const parts: string[] = [];
    if (bat) parts.push(`${bat.runs}${bat.dismissed ? "" : " not out"} from ${bat.ballsFaced} balls`);
    if (bowl) parts.push(`${bowl.wickets}/${bowl.runsConceded} from ${oversText(bowl.legalBalls)} overs`);
    playerOfTheMatch = { playerId: id, teamId: award.winnerTeamId, line: parts.join(" and ") };
  }

  let tableMove: MatchReportTableMove | null = null;
  if (input.teamIds.includes(focusTeamId)) {
    const beforeMatches = input.appliedMatches.filter((match) => match.roundNumber < completion.roundNumber);
    const afterMatches = input.appliedMatches.filter((match) => match.roundNumber <= completion.roundNumber);
    const after = seasonTableAfter(input.teamIds, afterMatches).find((row) => row.teamId === focusTeamId)?.rank ?? null;
    const before = beforeMatches.length > 0
      ? seasonTableAfter(input.teamIds, beforeMatches).find((row) => row.teamId === focusTeamId)?.rank ?? null
      : null;
    if (after !== null) {
      const text = before === null ? `${ordinal(after)} on the table after round ${completion.roundNumber}.`
        : after < before ? `Up from ${ordinal(before)} to ${ordinal(after)}.`
        : after > before ? `Down from ${ordinal(before)} to ${ordinal(after)}.`
        : `Still ${ordinal(after)}.`;
      tableMove = { before: before ?? after, after, text };
    }
  }

  return {
    fixtureId: completion.fixtureId, roundNumber: completion.roundNumber, focusTeamId, outcome, headlineKind, headline, resultLine,
    innings, playerOfTheMatch, turningPoint, bestPartnership, tableMove,
  };
}
