import type { SeasonTeamTableRow } from "@lcxxvi/contracts";

/**
 * The board's season objective and how the club stands against it (E2).
 * Pure and deterministic: derived from squad ratings and the live table, never saved.
 * No consequence follows from the verdict; it is information for the manager.
 */

/** Starting values. Design choices to tune after playtests, not calibration. */
export const SEASON_OBJECTIVE_RULES = {
  bestElevenSize: 11,
  /** Strength rank bands: ranks up to `titleMaxRank` are asked for the title, then top four, then sixth or better. */
  titleMaxRank: 2,
  topFourMaxRank: 5,
  /** Points clear of the first place outside the target that counts as ahead of the objective. */
  aheadCushionPoints: 4,
  /** Points behind the target place that still counts as on track (one win). */
  onTrackGapPoints: 2,
  pointsPerWin: 2,
} as const;

export type SeasonObjectiveKind = "WIN_TITLE" | "TOP_FOUR" | "SIXTH_OR_BETTER";
export type SeasonObjectiveStatusKind = "NOT_STARTED" | "AHEAD" | "ON_TRACK" | "BEHIND" | "OUT_OF_REACH";
export type SeasonObjectiveVerdict = "EXCEEDED" | "MET" | "MISSED";

export interface ClubStrength { teamId: string; strengthX100: number; rank: number }
export interface SeasonObjective { kind: SeasonObjectiveKind; targetPosition: number; label: string; strengthRank: number; reason: string }
export interface SeasonObjectiveStatus {
  kind: SeasonObjectiveStatusKind;
  label: string;
  position: number;
  roundsLeft: number;
  sentence: string;
  verdict: SeasonObjectiveVerdict | null;
  verdictLabel: string | null;
}

function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]}`;
}

/** Ranks clubs by the mean rating of their best eleven, strongest first. Ties fall to team id so the order is stable. */
export function rankClubStrength(teams: readonly { teamId: string; ratings: readonly number[] }[]): ClubStrength[] {
  return teams
    .map((team) => {
      const best = [...team.ratings].sort((a, b) => b - a).slice(0, SEASON_OBJECTIVE_RULES.bestElevenSize);
      const strengthX100 = best.length === 0 ? 0 : Math.round((best.reduce((sum, rating) => sum + rating, 0) * 100) / best.length);
      return { teamId: team.teamId, strengthX100 };
    })
    .sort((a, b) => b.strengthX100 - a.strengthX100 || a.teamId.localeCompare(b.teamId))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

export function seasonObjective(strengths: readonly ClubStrength[], teamId: string): SeasonObjective | null {
  const own = strengths.find((entry) => entry.teamId === teamId);
  if (!own) return null;
  const reason = `The board rates this squad ${ordinal(own.rank)} of ${strengths.length} on its best eleven.`;
  if (own.rank <= SEASON_OBJECTIVE_RULES.titleMaxRank) return { kind: "WIN_TITLE", targetPosition: 1, label: "Win the title", strengthRank: own.rank, reason };
  if (own.rank <= SEASON_OBJECTIVE_RULES.topFourMaxRank) return { kind: "TOP_FOUR", targetPosition: 4, label: "Finish in the top four", strengthRank: own.rank, reason };
  return { kind: "SIXTH_OR_BETTER", targetPosition: 6, label: "Finish sixth or better", strengthRank: own.rank, reason };
}

const TARGET_PHRASE: Record<SeasonObjectiveKind, string> = { WIN_TITLE: "top spot", TOP_FOUR: "the top four", SIXTH_OR_BETTER: "sixth place" };
/** The objective's target as it reads inside a sentence: "top spot", "the top four", "sixth place". */
export const seasonObjectivePhrase = (kind: SeasonObjectiveKind): string => TARGET_PHRASE[kind];

export function seasonObjectiveStatus(input: {
  objective: SeasonObjective;
  table: readonly SeasonTeamTableRow[];
  teamId: string;
  totalRounds: number;
  seasonComplete: boolean;
}): SeasonObjectiveStatus | null {
  const { objective, table, teamId, totalRounds, seasonComplete } = input;
  const own = table.find((row) => row.teamId === teamId);
  if (!own) return null;
  const byRank = (rank: number) => table.find((row) => row.rank === rank) ?? null;
  const roundsLeft = Math.max(0, totalRounds - own.played);
  const target = objective.targetPosition;
  const phrase = TARGET_PHRASE[objective.kind];
  const rounds = (n: number) => `${n} ${n === 1 ? "round" : "rounds"}`;

  if (seasonComplete || roundsLeft === 0) {
    const verdict: SeasonObjectiveVerdict = own.rank > target ? "MISSED" : own.rank <= target - 2 ? "EXCEEDED" : "MET";
    const verdictLabel = verdict === "EXCEEDED" ? "Objective exceeded" : verdict === "MET" ? "Objective met" : "Objective missed";
    return {
      kind: own.rank > target ? "BEHIND" : "ON_TRACK", label: verdictLabel, position: own.rank, roundsLeft: 0, verdict, verdictLabel,
      sentence: `Finished ${ordinal(own.rank)}. The objective was: ${objective.label}.`,
    };
  }
  if (own.played === 0) {
    return { kind: "NOT_STARTED", label: "Season ahead", position: own.rank, roundsLeft, verdict: null, verdictLabel: null, sentence: `${rounds(roundsLeft)} to play.` };
  }
  if (own.rank <= target) {
    const chaser = byRank(target + 1);
    const cushion = chaser ? own.points - chaser.points : 0;
    const ahead = cushion >= SEASON_OBJECTIVE_RULES.aheadCushionPoints;
    return {
      kind: ahead ? "AHEAD" : "ON_TRACK", label: ahead ? "Ahead" : "On track", position: own.rank, roundsLeft, verdict: null, verdictLabel: null,
      sentence: chaser
        ? `${ordinal(own.rank)}, ${cushion} ${cushion === 1 ? "point" : "points"} clear of ${ordinal(target + 1)} with ${rounds(roundsLeft)} left.`
        : `${ordinal(own.rank)} with ${rounds(roundsLeft)} left.`,
    };
  }
  const holder = byRank(target);
  const gap = holder ? holder.points - own.points : 0;
  const winsNeeded = Math.max(1, Math.ceil(gap / SEASON_OBJECTIVE_RULES.pointsPerWin));
  if (gap > roundsLeft * SEASON_OBJECTIVE_RULES.pointsPerWin) {
    return {
      kind: "OUT_OF_REACH", label: "Out of reach", position: own.rank, roundsLeft, verdict: null, verdictLabel: null,
      sentence: `${ordinal(own.rank)}, ${gap} points off ${phrase} with ${rounds(roundsLeft)} left. It cannot be caught on points.`,
    };
  }
  const onTrack = gap <= SEASON_OBJECTIVE_RULES.onTrackGapPoints;
  return {
    kind: onTrack ? "ON_TRACK" : "BEHIND", label: onTrack ? "On track" : "Behind", position: own.rank, roundsLeft, verdict: null, verdictLabel: null,
    sentence: gap === 0
      ? `${ordinal(own.rank)}, level on points with ${phrase} and ${rounds(roundsLeft)} left.`
      : `${ordinal(own.rank)}, ${winsNeeded} ${winsNeeded === 1 ? "win" : "wins"} from ${phrase} with ${rounds(roundsLeft)} left.`,
  };
}
