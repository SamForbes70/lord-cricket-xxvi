/**
 * CP07 Clubhouse front page: small pure projections for the manager's home screen. Every value here is read from the
 * season projection (table rows and applied matches) or from values the screen already derives (squad condition,
 * recorded form, career milestones, contracts). Nothing is invented, nothing is saved, and no clock or random number
 * is read, so no persisted format or match result can depend on it.
 */
import type { AppliedSeasonMatch, SeasonTeamTableRow } from "@lcxxvi/contracts";
import { FRESHEN_UP_FATIGUE_BP } from "./training-presets.js";

/** Presentation choices for the front page, not calibration. */
export const CLUBHOUSE_FRONT_PAGE_RULES = {
  /** Results shown in the form guide, as in the fixture preview. */
  formMatches: 5,
  /** Faces in the squad strip. */
  squadFaces: 6,
  /** A player at or above this fatigue is called tired: the same line the "Freshen up" training plan uses. */
  tiredFatigueBp: FRESHEN_UP_FATIGUE_BP,
  /** League rounds in a season. */
  totalRounds: 14,
} as const;

export type FormOutcome = "W" | "L" | "T" | "N";
export interface FormGuideEntry {
  fixtureId: string;
  roundNumber: number;
  opponentTeamId: string;
  home: boolean;
  outcome: FormOutcome;
}

/** The club's most recent applied results this season, oldest first: W, L, T (tie) or N (no result). */
export function clubFormGuide(
  appliedMatches: readonly AppliedSeasonMatch[],
  teamId: string,
  count: number = CLUBHOUSE_FRONT_PAGE_RULES.formMatches,
): FormGuideEntry[] {
  return appliedMatches
    .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
    .sort((a, b) => a.roundNumber - b.roundNumber || a.fixtureOrdinal - b.fixtureOrdinal)
    .slice(-count)
    .map((match) => ({
      fixtureId: match.fixtureId,
      roundNumber: match.roundNumber,
      opponentTeamId: match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId,
      home: match.homeTeamId === teamId,
      outcome: match.resultKind === "WIN" ? (match.winnerTeamId === teamId ? "W" : "L") : match.resultKind === "NO_RESULT" ? "N" : "T",
    }));
}

export const FORM_OUTCOME_WORD: Record<FormOutcome, string> = { W: "Won", L: "Lost", T: "Tied", N: "No result" };

export type ClubStanding =
  | { kind: "NOT_STARTED"; roundsToPlay: number }
  | {
      kind: "TABLE";
      rank: number;
      teams: number;
      played: number;
      wins: number;
      losses: number;
      ties: number;
      noResults: number;
      points: number;
      /** Net run rate to three places, or null before it can be worked out. */
      nrr: string | null;
      /** Points behind the club in first place; 0 when the club is top. */
      pointsOffTop: number;
      roundsLeft: number;
    };

/**
 * Where the club stands. Before the club has played (every table row starts level at rank 1), the honest answer is
 * that the season has not started, so no position is given.
 */
export function clubStanding(
  table: readonly SeasonTeamTableRow[],
  teamId: string,
  totalRounds: number = CLUBHOUSE_FRONT_PAGE_RULES.totalRounds,
): ClubStanding | null {
  const row = table.find((candidate) => candidate.teamId === teamId);
  if (!row) return null;
  if (row.played === 0) return { kind: "NOT_STARTED", roundsToPlay: totalRounds };
  const leader = table.find((candidate) => candidate.rank === 1) ?? row;
  return {
    kind: "TABLE",
    rank: row.rank,
    teams: table.length,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    noResults: row.noResults,
    points: row.points,
    nrr: row.nrrX1000 === null ? null : (row.nrrX1000 / 1000).toFixed(3),
    pointsOffTop: Math.max(0, leader.points - row.points),
    roundsLeft: Math.max(0, totalRounds - row.played),
  };
}

export const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

export type SquadNoteKind = "UNAVAILABLE" | "TIRED" | "MILESTONE" | "FORM_UP" | "FORM_DOWN" | "CONTRACT" | "PROFILE";
export interface SquadNote { kind: SquadNoteKind; text: string }

/** What the screen already knows about one squad player. */
export interface SquadStripPlayer {
  playerId: string;
  /** Overall T20 rating, used only to order players. */
  rating: number;
  unavailable: boolean;
  unavailableReason: string | null;
  fatigueBp: number;
  /** From playerForm: null until three innings or spells are recorded. */
  formTrend: "UP" | "LEVEL" | "DOWN" | null;
  /** From playerForm, for example "45, 12*, 67" or "2/24, 0/31". */
  formText: string;
  formDiscipline: "BATTING" | "BOWLING" | null;
  /** From playerMilestones: career milestones within reach. */
  milestones: readonly string[];
  /** True when the player's contract runs out at the end of this season. */
  contractEnding: boolean;
  /** The player's playing style label, from T20 ratings. */
  style: string;
}

export interface SquadFace { playerId: string; notes: SquadNote[] }
export interface SquadStrip {
  /** True when at least one face carries a development; false when the strip shows the leading players instead. */
  developments: boolean;
  faces: SquadFace[];
  unavailable: number;
  /** Null before the club has played: no fatigue is reported before a match. */
  tired: number | null;
  /** Contracts that end this season. Counted once in the summary, and shown on a face only as a second note. */
  contractsEnding: number;
}

const NOTE_ORDER: readonly SquadNoteKind[] = ["UNAVAILABLE", "TIRED", "MILESTONE", "FORM_UP", "FORM_DOWN"];

/**
 * The squad strip: up to six players with something worth knowing, most pressing first (unavailable, tired, a
 * milestone in reach, form rising, form falling). With nothing to report it shows the highest-rated players with
 * their playing style, and says so. A contract ending is counted in the summary and added to a face as a second note,
 * so a list of identical contract lines never fills the strip. Fatigue is left out until the club has played a match.
 */
export function squadStrip(
  players: readonly SquadStripPlayer[],
  clubMatchesPlayed: number,
  limit: number = CLUBHOUSE_FRONT_PAGE_RULES.squadFaces,
): SquadStrip {
  const notesOf = (player: SquadStripPlayer): SquadNote[] => {
    const notes: SquadNote[] = [];
    if (player.unavailable) notes.push({ kind: "UNAVAILABLE", text: player.unavailableReason ? `Unavailable: ${player.unavailableReason}` : "Unavailable" });
    if (clubMatchesPlayed > 0 && player.fatigueBp >= CLUBHOUSE_FRONT_PAGE_RULES.tiredFatigueBp) {
      notes.push({ kind: "TIRED", text: `Tired, ${Math.round(player.fatigueBp / 100)}% fatigue` });
    }
    for (const milestone of player.milestones) notes.push({ kind: "MILESTONE", text: milestone });
    const recent = player.formDiscipline === "BOWLING" ? "spells" : "innings";
    if (player.formTrend === "UP") notes.push({ kind: "FORM_UP", text: `Form rising: last ${recent} ${player.formText}` });
    if (player.formTrend === "DOWN") notes.push({ kind: "FORM_DOWN", text: `Form falling: last ${recent} ${player.formText}` });
    return notes;
  };
  const withContract = (player: SquadStripPlayer, notes: SquadNote[]): SquadNote[] =>
    player.contractEnding ? [...notes, { kind: "CONTRACT", text: "Contract ends this season" }] : notes;
  const byRating = (a: SquadStripPlayer, b: SquadStripPlayer) => b.rating - a.rating || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
  const noted = players
    .map((player) => ({ player, notes: notesOf(player) }))
    .filter((entry) => entry.notes.length > 0)
    .sort((a, b) => NOTE_ORDER.indexOf(a.notes[0]!.kind) - NOTE_ORDER.indexOf(b.notes[0]!.kind) || byRating(a.player, b.player))
    .slice(0, limit);
  const unavailable = players.filter((player) => player.unavailable).length;
  const tired = clubMatchesPlayed > 0 ? players.filter((player) => player.fatigueBp >= CLUBHOUSE_FRONT_PAGE_RULES.tiredFatigueBp).length : null;
  const contractsEnding = players.filter((player) => player.contractEnding).length;
  if (noted.length > 0) {
    return { developments: true, faces: noted.map(({ player, notes }) => ({ playerId: player.playerId, notes: withContract(player, notes) })), unavailable, tired, contractsEnding };
  }
  return {
    developments: false,
    faces: [...players].sort(byRating).slice(0, limit).map((player) => ({ playerId: player.playerId, notes: withContract(player, [{ kind: "PROFILE", text: player.style }]) })),
    unavailable,
    tired,
    contractsEnding,
  };
}
