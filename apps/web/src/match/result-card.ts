import type { View } from "./protocol.js";
import { marginText } from "./margin-text.js";

/**
 * CP11 (CD-024): the facts on the full-time result card, read only from the completed view. The player of the match
 * is the game's existing award (`LC_AWARDS_HEURISTIC_GAME_V1`, `view.matchAward`, worked out in the worker from the
 * scorecard and events); this file does not rank players itself. Top performances use the ordering the career match
 * report already uses (`packages/projections/src/match-report.ts`): most runs, then fewer balls; most wickets, then
 * fewer runs conceded.
 */

export interface Performance {
  playerId: string;
  teamId: string;
  text: string;
}

export interface ResultFacts {
  kind: "WIN" | "TIE" | "NO_RESULT" | "OTHER";
  winnerTeamId: string | null;
  /** From the player's side, when the player captained one side. */
  outcome: "WON" | "LOST" | "TIED" | "NO_RESULT" | null;
  /** A plain explanation of the margin from the losing side's point of view, never a judgement. */
  marginNote: string | null;
}

function overs(balls: number): string {
  return balls % 6 === 0 ? `${balls / 6}` : `${Math.floor(balls / 6)}.${balls % 6}`;
}
function teamName(view: View, id: string | null | undefined): string {
  return view.teams.find((team) => team.id === id)?.name ?? id ?? "";
}

type ResultShape = { kind?: string; winnerTeamId?: string; marginType?: string; marginRuns?: number | null; marginWickets?: number | null };

export function resultFacts(view: View, focusTeamId: string | null): ResultFacts {
  const r = (view.scorecard as { result?: ResultShape } | null)?.result;
  if (!r) return { kind: "OTHER", winnerTeamId: null, outcome: null, marginNote: null };
  if (r.kind === "WIN" && r.winnerTeamId) {
    const loser = view.teams.find((team) => team.id !== r.winnerTeamId)?.id ?? null;
    const outcome = focusTeamId ? (focusTeamId === r.winnerTeamId ? "WON" : "LOST") : null;
    let marginNote: string | null = null;
    if (r.marginType === "RUNS") marginNote = `${teamName(view, loser)} finished ${marginText(r)} short of the target.`;
    else if (r.marginType === "WICKETS") {
      const chase = view.innings[view.innings.length - 1]?.innings;
      const left = chase?.allocatedBalls != null ? chase.allocatedBalls - chase.legalBalls : null;
      marginNote = `${teamName(view, r.winnerTeamId)} reached the target with ${marginText(r)} in hand${left && left > 0 ? ` and ${left} ${left === 1 ? "ball" : "balls"} to spare` : ""}.`;
    }
    return { kind: "WIN", winnerTeamId: r.winnerTeamId, outcome, marginNote };
  }
  if (r.kind === "NO_RESULT") return { kind: "NO_RESULT", winnerTeamId: null, outcome: focusTeamId ? "NO_RESULT" : null, marginNote: null };
  if (r.kind === "TIE") return { kind: "TIE", winnerTeamId: null, outcome: focusTeamId ? "TIED" : null, marginNote: "The scores finished level." };
  return { kind: "OTHER", winnerTeamId: null, outcome: null, marginNote: null };
}

/** For each innings: the best batter of the batting side and the best bowler against them. */
export function topPerformances(view: View): { batting: Performance[]; bowling: Performance[] } {
  const batting: Performance[] = [];
  const bowling: Performance[] = [];
  for (const ledger of view.innings) {
    const bat = Object.entries(ledger.batting)
      .filter(([, b]) => b.ballsFaced > 0 || b.runs > 0)
      .sort(([a, x], [b, y]) => y.runs - x.runs || x.ballsFaced - y.ballsFaced || (a < b ? -1 : a > b ? 1 : 0))[0];
    if (bat) {
      const [id, b] = bat;
      batting.push({ playerId: id, teamId: ledger.innings.battingTeamId, text: `${view.names[id] ?? id} ${b.runs}${b.dismissed ? "" : "*"} (${b.ballsFaced})` });
    }
    const bowl = Object.entries(ledger.bowling)
      .filter(([, b]) => b.legalBalls > 0)
      .sort(([a, x], [b, y]) => y.wickets - x.wickets || x.runsConceded - y.runsConceded || (a < b ? -1 : a > b ? 1 : 0))[0];
    if (bowl) {
      const [id, b] = bowl;
      bowling.push({ playerId: id, teamId: ledger.innings.bowlingTeamId, text: `${view.names[id] ?? id} ${b.wickets}/${b.runsConceded} (${overs(b.legalBalls)})` });
    }
  }
  return { batting, bowling };
}

/** The game's own player of the match award, if the worker made one. */
export function playerOfTheMatch(view: View): { playerId: string; teamId: string | null; line: string | null } | null {
  const award = view.matchAward;
  if (!award || award.status !== "AWARDED" || !award.winnerPlayerId) return null;
  const line = award.candidates.find((c) => c.playerId === award.winnerPlayerId)?.summaryLine ?? null;
  return { playerId: award.winnerPlayerId, teamId: award.winnerTeamId, line };
}

/** Up to two turning points already found by the post-match analysis (T20 only). */
export function turningPointLines(view: View): string[] {
  return (view.postMatchAnalysis?.turningPoints ?? []).slice(0, 2).map((p) => p.text);
}
