import type { AppliedSeasonMatch, SeasonPlayerStats, SeasonTeamTableRow, T20SeasonMatchCompletion } from "@lcxxvi/contracts";

/**
 * The fixture preview (E7): who the opponent is, how the two clubs have gone against each other,
 * who to watch, and what the match means. Pure and deterministic, built from recorded results only.
 * A rivalry is earned from close finishes, never assigned.
 */

/** Starting values. Design choices to tune after playtests, not calibration. */
export const FIXTURE_PREVIEW_RULES = {
  formMatches: 5,
  rivalryWindow: 6,
  rivalryCloseMeetings: 3,
  closeRuns: 10,
  closeWickets: 2,
  pointsPerWin: 2,
} as const;

export interface PreviewMeeting { seasonNumber: number; completion: T20SeasonMatchCompletion }
export interface PreviewDangerPlayer { playerId: string; text: string }
export interface FixturePreview {
  opponentTeamId: string;
  opponentPosition: number | null;
  /** Opponent's most recent results this season, oldest first: W, L, T or N. */
  opponentForm: string[];
  headToHead: { played: number; won: number; lost: number; other: number; lastMeeting: string | null };
  dangerBatter: PreviewDangerPlayer | null;
  dangerBowler: PreviewDangerPlayer | null;
  rivalry: { closeMeetings: number; ofLast: number; reason: string } | null;
  meaning: string;
}

export interface FixturePreviewInput {
  focusTeamId: string;
  opponentTeamId: string;
  /** Every completed match available, from past seasons and this one. Other clubs' matches are ignored. */
  meetings: readonly PreviewMeeting[];
  table: readonly SeasonTeamTableRow[];
  appliedMatches: readonly AppliedSeasonMatch[];
  seasonPlayers: readonly SeasonPlayerStats[];
  /** Used for the players to watch before the opponent has recorded any runs or wickets this season. */
  opponentRatings: readonly { playerId: string; batting: number; bowling: number }[];
  /** The board's target position (E2), when there is one. */
  objective: { targetPosition: number; phrase: string } | null;
  teamName: (teamId: string) => string;
}

function isClose(completion: T20SeasonMatchCompletion): boolean {
  const result = completion.scorecard.result;
  if (result.kind === "NO_RESULT") return false;
  if (result.kind !== "WIN") return true;
  if (result.marginType === "RUNS") return result.marginRuns <= FIXTURE_PREVIEW_RULES.closeRuns;
  return result.marginType === "WICKETS" && result.marginWickets <= FIXTURE_PREVIEW_RULES.closeWickets;
}

function resultText(completion: T20SeasonMatchCompletion, teamName: (id: string) => string): string {
  const result = completion.scorecard.result;
  if (result.kind === "NO_RESULT") return "no result";
  if (result.kind !== "WIN") return "a tie";
  const margin = result.marginType === "RUNS" ? result.marginRuns : result.marginWickets;
  const unit = result.marginType === "RUNS" ? "run" : "wicket";
  return `${teamName(result.winnerTeamId)} won by ${margin} ${unit}${margin === 1 ? "" : "s"}`;
}

export function buildFixturePreview(input: FixturePreviewInput): FixturePreview {
  const { focusTeamId, opponentTeamId, teamName, table } = input;
  const between = input.meetings
    .filter(({ completion }) =>
      (completion.homeTeamId === focusTeamId && completion.awayTeamId === opponentTeamId) ||
      (completion.homeTeamId === opponentTeamId && completion.awayTeamId === focusTeamId))
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.completion.roundNumber - b.completion.roundNumber || a.completion.fixtureOrdinal - b.completion.fixtureOrdinal);

  let won = 0, lost = 0, other = 0;
  for (const { completion } of between) {
    const result = completion.scorecard.result;
    if (result.kind === "WIN") { if (result.winnerTeamId === focusTeamId) won += 1; else lost += 1; } else other += 1;
  }
  const last = between.at(-1) ?? null;
  const lastMeeting = last ? `Last meeting: ${resultText(last.completion, teamName)}.` : null;

  const recent = between.slice(-FIXTURE_PREVIEW_RULES.rivalryWindow);
  const closeMeetings = recent.filter(({ completion }) => isClose(completion)).length;
  const rivalry = closeMeetings >= FIXTURE_PREVIEW_RULES.rivalryCloseMeetings
    ? { closeMeetings, ofLast: recent.length, reason: `${closeMeetings} of the last ${recent.length} meetings were decided by ${FIXTURE_PREVIEW_RULES.closeRuns} runs or fewer, ${FIXTURE_PREVIEW_RULES.closeWickets} wickets or fewer, or a tie.` }
    : null;

  const opponentForm = input.appliedMatches
    .filter((match) => match.homeTeamId === opponentTeamId || match.awayTeamId === opponentTeamId)
    .sort((a, b) => a.roundNumber - b.roundNumber || a.fixtureOrdinal - b.fixtureOrdinal)
    .slice(-FIXTURE_PREVIEW_RULES.formMatches)
    .map((match) => (match.resultKind === "WIN" ? (match.winnerTeamId === opponentTeamId ? "W" : "L") : match.resultKind === "NO_RESULT" ? "N" : "T"));

  const theirs = input.seasonPlayers.filter((player) => player.teamId === opponentTeamId);
  const topRuns = [...theirs].sort((a, b) => b.runs - a.runs || a.playerId.localeCompare(b.playerId))[0];
  const topWickets = [...theirs].sort((a, b) => b.bowlingWickets - a.bowlingWickets || a.bowlingRunsConceded - b.bowlingRunsConceded || a.playerId.localeCompare(b.playerId))[0];
  const bestBat = [...input.opponentRatings].sort((a, b) => b.batting - a.batting || a.playerId.localeCompare(b.playerId))[0];
  const bestBowl = [...input.opponentRatings].sort((a, b) => b.bowling - a.bowling || a.playerId.localeCompare(b.playerId))[0];
  const dangerBatter: PreviewDangerPlayer | null = topRuns && topRuns.runs > 0
    ? { playerId: topRuns.playerId, text: `${topRuns.runs} runs this season` }
    : bestBat ? { playerId: bestBat.playerId, text: `their highest-rated batter (${bestBat.batting})` } : null;
  const dangerBowler: PreviewDangerPlayer | null = topWickets && topWickets.bowlingWickets > 0
    ? { playerId: topWickets.playerId, text: `${topWickets.bowlingWickets} ${topWickets.bowlingWickets === 1 ? "wicket" : "wickets"} this season` }
    : bestBowl && bestBowl.bowling > 0 ? { playerId: bestBowl.playerId, text: `their highest-rated bowler (${bestBowl.bowling})` } : null;

  const own = table.find((row) => row.teamId === focusTeamId) ?? null;
  const leader = table.find((row) => row.rank === 1) ?? null;
  const win = FIXTURE_PREVIEW_RULES.pointsPerWin;
  let meaning: string;
  if (!own || table.every((row) => row.played === 0)) meaning = "The season starts here.";
  else if (own.rank === 1) meaning = "Win to stay top.";
  else if (leader && own.points + win > leader.points) meaning = "A win could take you top.";
  else if (input.objective) {
    const { targetPosition, phrase } = input.objective;
    const holder = table.find((row) => row.rank === targetPosition) ?? null;
    if (own.rank <= targetPosition) meaning = `Win to stay inside ${phrase}.`;
    else if (holder && own.points + win >= holder.points) meaning = `A win could take you into ${phrase}.`;
    else meaning = holder ? `${holder.points - own.points} points off ${phrase}: win to close the gap.` : "Win to climb the table.";
  } else meaning = "Win to climb the table.";

  return {
    opponentTeamId,
    opponentPosition: table.find((row) => row.teamId === opponentTeamId)?.rank ?? null,
    opponentForm,
    headToHead: { played: between.length, won, lost, other, lastMeeting },
    dangerBatter, dangerBowler, rivalry, meaning,
  };
}
