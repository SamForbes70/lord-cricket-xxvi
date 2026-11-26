import type { AppliedSeasonMatch, T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import { PLAYER_IDENTITY_V3_RULES } from "./player-identity-v3.js";
import { seasonTableAfter } from "./season.js";

/**
 * LC_SEASON_REVIEW_V1 (Directive 02, items C6 and D4, first slice, 26 November 2026). The season review shown when the
 * last league fixture of a career season is complete: how the title was won, your club's season told only from
 * recorded results, awards for the league and for your club by fixed rules, your cricketers' season lines and the
 * league milestones they passed, the development recorded at the last rollover, and what is known about the next
 * season.
 *
 * Pure and deterministic. It reads only the completed fixtures' scorecards, the applied results, and records the
 * career already holds (lifecycle transitions, contracts, academy). It reads no clock, no `Math.random` and no
 * simulation random stream, and nothing it returns is saved, so no persisted format changes and no result can
 * depend on it. Every number in a sentence is listed in that item's `facts`.
 */
export const SEASON_REVIEW_V1_VERSION = "LC_SEASON_REVIEW_V1" as const;

/** Presentation rules. Design choices for playtests, not calibration. Changing any of them needs a new version. */
export const SEASON_REVIEW_V1_RULES = {
  /** Legal balls in a full T20 innings: balls to spare in a chase are counted from this. */
  inningsBalls: 120,
  /** A collapse is at least this many wickets in a row... */
  collapseMinWickets: 4,
  /** ...falling for this many runs or fewer, counted from the score at the wicket before the first of them. */
  collapseMaxRuns: 25,
  /** A run of wins or defeats is told when it reaches this many league matches in a row. */
  streakMin: 3,
  /** League best economy: at least this many legal balls bowled in the season (20 overs). */
  leagueEconomyMinBalls: 120,
  /** Club best economy: at least this many legal balls bowled for the club (10 overs). */
  clubEconomyMinBalls: 60,
  /** Club player of the season: runs plus this many points a wicket, both for the club in this season. */
  clubPointsPerWicket: 20,
  /** A score of this many is a hundred (a fifty is the V3 identity rule). */
  hundred: 100,
} as const;

export interface SeasonReviewFact { key: string; value: number | string }

export type SeasonStoryKind =
  | "BIGGEST_WIN_RUNS"
  | "BIGGEST_WIN_CHASE"
  | "HEAVIEST_DEFEAT_RUNS"
  | "HEAVIEST_DEFEAT_CHASE"
  | "TIE"
  | "WIN_STREAK"
  | "LOSING_STREAK"
  | "COLLAPSE_SUFFERED"
  | "COLLAPSE_INFLICTED"
  | "HIGHEST_TEAM_TOTAL"
  | "HIGHEST_SCORE"
  | "BEST_BOWLING";

export interface SeasonStoryItem {
  kind: SeasonStoryKind;
  /** The round it happened in, or the first round of a run. */
  roundNumber: number;
  /** "CLUB" items are about the focus club; "LEAGUE" items are league records of the season. */
  scope: "CLUB" | "LEAGUE";
  label: string;
  text: string;
  facts: SeasonReviewFact[];
}

export interface SeasonTitleRace {
  championTeamId: string;
  runnerUpTeamId: string | null;
  /** The first round from which the champion was top after every round; null when never top before the end. */
  topFromRound: number | null;
  text: string;
  facts: SeasonReviewFact[];
}

export interface SeasonClubJourney {
  teamId: string;
  finalPosition: number;
  /** Position after each completed round, in round order. */
  positions: { roundNumber: number; position: number }[];
  highest: { position: number; roundNumber: number };
  lowest: { position: number; roundNumber: number };
  record: { played: number; wins: number; losses: number; ties: number; noResults: number; points: number };
  text: string;
  facts: SeasonReviewFact[];
}

export type SeasonReviewAwardId =
  | "LEAGUE_BEST_ECONOMY"
  | "CLUB_PLAYER_OF_SEASON"
  | "CLUB_TOP_RUN_SCORER"
  | "CLUB_TOP_WICKET_TAKER"
  | "CLUB_BEST_ECONOMY";

export interface SeasonReviewAward {
  id: SeasonReviewAwardId;
  label: string;
  /** The rule, in words, as shown to the player. */
  rule: string;
  playerId: string | null;
  teamId: string | null;
  /** The winning figure, such as "412 runs" or "6.85 an over (31 overs)", or why there is no winner. */
  value: string;
  facts: SeasonReviewFact[];
}

export interface SquadSeasonLine {
  playerId: string;
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  ballsFaced: number;
  highScore: { runs: number; notOut: boolean } | null;
  fifties: number;
  hundreds: number;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  bestBowling: { wickets: number; runs: number } | null;
  /** League milestones passed in this season, by the V3 identity marks; one sentence each. */
  milestones: { text: string; facts: SeasonReviewFact[] }[];
}

export interface SeasonDevelopmentLine {
  playerId: string;
  batting: number;
  bowling: number;
  fielding: number;
  keeping: number;
  /** Sum of the four skill changes. Stamina is listed but not counted. */
  net: number;
  stamina: number;
  text: string;
}

export interface SeasonReviewDevelopment {
  /** The season whose close recorded these changes. */
  fromSeasonNumber: number;
  improved: SeasonDevelopmentLine[];
  declined: SeasonDevelopmentLine[];
  unchanged: number;
}

export interface SeasonReviewAhead {
  nextSeasonNumber: number | null;
  contractsEnding: string[];
  academyProspects: { playerId: string; queued: boolean }[];
  sentences: { text: string; facts: SeasonReviewFact[] }[];
}

export interface SeasonReview {
  version: typeof SEASON_REVIEW_V1_VERSION;
  seasonNumber: number;
  matchesCompleted: number;
  titleRace: SeasonTitleRace | null;
  club: SeasonClubJourney | null;
  story: SeasonStoryItem[];
  awards: SeasonReviewAward[];
  squad: SquadSeasonLine[];
  /** Null when there is no lifecycle, or no rollover has happened yet before this season. */
  development: SeasonReviewDevelopment | null;
  ahead: SeasonReviewAhead | null;
}

export interface SeasonReviewDevelopmentReport {
  playerId: string;
  teamId: string;
  deltas: { battingDelta: number; bowlingDelta: number; fieldingDelta: number; keepingDelta: number; staminaDelta: number };
}

export interface SeasonReviewInput {
  seasonNumber: number;
  /** This season's completed league fixtures. */
  completedMatches: readonly T20SeasonMatchCompletion[];
  /** This season's applied results, as the live table uses them. */
  appliedMatches: readonly AppliedSeasonMatch[];
  teamIds: readonly string[];
  /** Earlier seasons of this career's league, for league records and milestone totals. */
  priorSeasons?: readonly { seasonNumber: number; completedMatches: readonly T20SeasonMatchCompletion[] }[];
  focusTeamId: string | null;
  teamName: (teamId: string) => string;
  playerName: (playerId: string) => string;
  /** The lifecycle transition that opened this season (its `toSeasonNumber` is this season), if any. */
  lastRollover?: { fromSeasonNumber: number; toSeasonNumber: number; developedPlayers: readonly SeasonReviewDevelopmentReport[] } | null;
  /** Null for a career without a next season (a single-season save). */
  ahead?: {
    /** Contracts of the focus club, as they stand now. */
    contracts: readonly { playerId: string; teamId: string; expiresAfterSeasonNumber: number }[];
    /** The focus club's academy, as it stands now. */
    academy: readonly { playerId: string; teamId: string; generatedInSeasonNumber: number; promotedInSeasonNumber: number | null; queuedForPromotion: boolean }[];
  } | null;
}

function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]}`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Economy to two places, from integers only so the text is the same on every platform. */
function economyText(runs: number, balls: number): string {
  const x100 = Math.round((runs * 600) / balls);
  return `${Math.floor(x100 / 100)}.${String(x100 % 100).padStart(2, "0")}`;
}
const oversText = (balls: number) => (balls % 6 === 0 ? `${balls / 6}` : `${Math.floor(balls / 6)}.${balls % 6}`);

type Innings = T20SeasonMatchCompletion["scorecard"]["innings"][number];

interface Aggregate {
  playerId: string;
  teamId: string;
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  ballsFaced: number;
  highScore: { runs: number; notOut: boolean; ballsFaced: number } | null;
  fifties: number;
  hundreds: number;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  bestBowling: { wickets: number; runs: number } | null;
}

function emptyAggregate(playerId: string, teamId: string): Aggregate {
  return {
    playerId, teamId, matches: 0, innings: 0, notOuts: 0, runs: 0, ballsFaced: 0, highScore: null, fifties: 0, hundreds: 0,
    legalBalls: 0, runsConceded: 0, wickets: 0, bestBowling: null,
  };
}

/** Totals per player over the given matches. With `teamId`, only lines for that club count. */
function aggregate(matches: readonly T20SeasonMatchCompletion[], teamId: string | null = null): Map<string, Aggregate> {
  const byPlayer = new Map<string, Aggregate>();
  const get = (playerId: string, team: string) => {
    let entry = byPlayer.get(playerId);
    if (!entry) byPlayer.set(playerId, (entry = emptyAggregate(playerId, team)));
    return entry;
  };
  for (const match of matches) {
    for (const side of match.selectedTeams ?? []) {
      if (teamId !== null && side.teamId !== teamId) continue;
      for (const playerId of side.playerIds) get(playerId, side.teamId).matches += 1;
    }
    for (const innings of match.scorecard.innings) {
      if (teamId === null || innings.battingTeamId === teamId) {
        for (const [playerId, line] of Object.entries(innings.batting)) {
          const entry = get(playerId, innings.battingTeamId);
          entry.innings += 1;
          if (!line.dismissed) entry.notOuts += 1;
          entry.runs += line.runs;
          entry.ballsFaced += line.ballsFaced;
          if (line.runs >= SEASON_REVIEW_V1_RULES.hundred) entry.hundreds += 1;
          else if (line.runs >= PLAYER_IDENTITY_V3_RULES.fifty) entry.fifties += 1;
          const best = entry.highScore;
          if (!best || line.runs > best.runs || (line.runs === best.runs && !line.dismissed && best.notOut === false)) {
            entry.highScore = { runs: line.runs, notOut: !line.dismissed, ballsFaced: line.ballsFaced };
          }
        }
      }
      if (teamId === null || innings.bowlingTeamId === teamId) {
        for (const [playerId, line] of Object.entries(innings.bowling)) {
          if (line.legalBalls === 0 && line.runsConceded === 0 && line.wickets === 0) continue;
          const entry = get(playerId, innings.bowlingTeamId);
          entry.legalBalls += line.legalBalls;
          entry.runsConceded += line.runsConceded;
          entry.wickets += line.wickets;
          const best = entry.bestBowling;
          if (!best || line.wickets > best.wickets || (line.wickets === best.wickets && line.runsConceded < best.runs)) {
            entry.bestBowling = { wickets: line.wickets, runs: line.runsConceded };
          }
        }
      }
    }
  }
  return byPlayer;
}

const byRound = (a: T20SeasonMatchCompletion, b: T20SeasonMatchCompletion) =>
  a.roundNumber - b.roundNumber || a.fixtureOrdinal - b.fixtureOrdinal || compare(a.fixtureId, b.fixtureId);

/** The V3 league marks at or below a value, in ascending order. */
function marksUpTo(value: number, marks: readonly number[], every: number): number[] {
  const found = marks.filter((mark) => mark <= value);
  const last = marks[marks.length - 1]!;
  for (let mark = last + every; mark <= value; mark += every) found.push(mark);
  return found;
}

interface Collapse { wickets: number; runs: number; fromScore: string; toScore: string }

/** The worst collapse in an innings by the rules, or null. */
function worstCollapse(innings: Innings): Collapse | null {
  const fall = [...innings.fallOfWickets].sort((a, b) => a.sequence - b.sequence);
  let best: Collapse | null = null;
  for (let i = 0; i < fall.length; i += 1) {
    const startRuns = i === 0 ? 0 : fall[i - 1]!.runs;
    for (let j = i + SEASON_REVIEW_V1_RULES.collapseMinWickets - 1; j < fall.length; j += 1) {
      const runs = fall[j]!.runs - startRuns;
      if (runs > SEASON_REVIEW_V1_RULES.collapseMaxRuns) break;
      const wickets = j - i + 1;
      if (!best || wickets > best.wickets || (wickets === best.wickets && runs < best.runs)) {
        best = { wickets, runs, fromScore: `${startRuns}/${i}`, toScore: `${fall[j]!.runs}/${j + 1}` };
      }
    }
  }
  return best;
}

export function projectSeasonReview(input: SeasonReviewInput): SeasonReview {
  const rules = SEASON_REVIEW_V1_RULES;
  const { teamName, playerName } = input;
  const matches = [...input.completedMatches].sort(byRound);
  const priorSeasons = [...(input.priorSeasons ?? [])].sort((a, b) => a.seasonNumber - b.seasonNumber);
  const focus = input.focusTeamId && input.teamIds.includes(input.focusTeamId) ? input.focusTeamId : null;

  // Positions after each round, from the applied results.
  const applied = [...input.appliedMatches].sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal);
  const rounds = [...new Set(applied.map((m) => m.roundNumber))].sort((a, b) => a - b);
  const tables = rounds.map((round) => ({ round, table: seasonTableAfter(input.teamIds, applied.filter((m) => m.roundNumber <= round)) }));
  const finalTable = tables.at(-1)?.table ?? null;

  // 1. How the title was won.
  let titleRace: SeasonTitleRace | null = null;
  if (finalTable) {
    const champion = finalTable[0]!;
    const second = finalTable[1] ?? null;
    let topFromRound: number | null = null;
    for (let index = tables.length - 1; index >= 0; index -= 1) {
      if (tables[index]!.table[0]!.teamId !== champion.teamId) break;
      topFromRound = tables[index]!.round;
    }
    const facts: SeasonReviewFact[] = [{ key: "points", value: champion.points }, { key: "wins", value: champion.wins }, { key: "played", value: champion.played }];
    let margin = "";
    if (second) {
      const gap = champion.points - second.points;
      if (gap > 0) {
        margin = ` ${plural(gap, "point")} clear of ${teamName(second.teamId)}`;
        facts.push({ key: "pointsClear", value: gap });
      } else if (champion.wins !== second.wins) {
        margin = ` level on points with ${teamName(second.teamId)}, ahead on wins`;
      } else if (champion.nrrX1000 !== second.nrrX1000) {
        margin = ` level on points and wins with ${teamName(second.teamId)}, ahead on net run rate`;
      } else {
        margin = ` level with ${teamName(second.teamId)} on points, wins and net run rate, ahead on head-to-head points`;
      }
    }
    const lastRound = tables.at(-1)!.round;
    let lead: string;
    if (topFromRound === null) lead = "";
    else if (topFromRound === rounds[0]) lead = ` They were top of the table after every round.`;
    else if (topFromRound === lastRound) lead = ` They went top in the final round.`;
    else lead = ` They were top from round ${topFromRound} to the end.`;
    if (topFromRound !== null && topFromRound !== rounds[0] && topFromRound !== lastRound) facts.push({ key: "topFromRound", value: topFromRound });
    titleRace = {
      championTeamId: champion.teamId,
      runnerUpTeamId: second?.teamId ?? null,
      topFromRound,
      text: `${teamName(champion.teamId)} won the title with ${champion.points} points from ${plural(champion.played, "match", "matches")} (${champion.wins} won),${margin}.${lead}`,
      facts,
    };
  }

  // 2. The focus club's season in the table.
  let club: SeasonClubJourney | null = null;
  if (focus && finalTable) {
    const row = finalTable.find((r) => r.teamId === focus)!;
    const positions = tables.map(({ round, table }) => ({ roundNumber: round, position: table.findIndex((r) => r.teamId === focus) + 1 }));
    let highest = positions[0]!;
    let lowest = positions[0]!;
    for (const p of positions) {
      if (p.position < highest.position) highest = p;
      if (p.position > lowest.position) lowest = p;
    }
    const facts: SeasonReviewFact[] = [
      { key: "finalPosition", value: row.rank }, { key: "wins", value: row.wins }, { key: "losses", value: row.losses }, { key: "points", value: row.points },
    ];
    let range = "";
    if (highest.position !== lowest.position) {
      range = ` Their highest place was ${ordinal(highest.position)}, after round ${highest.roundNumber}; their lowest was ${ordinal(lowest.position)}, after round ${lowest.roundNumber}.`;
      facts.push(
        { key: "highest", value: highest.position }, { key: "highestRound", value: highest.roundNumber },
        { key: "lowest", value: lowest.position }, { key: "lowestRound", value: lowest.roundNumber },
      );
    } else {
      range = ` They were ${ordinal(highest.position)} after every round.`;
    }
    const extra = [row.ties > 0 ? plural(row.ties, "tie") : "", row.noResults > 0 ? plural(row.noResults, "no result", "no results") : ""].filter(Boolean);
    if (row.ties > 0) facts.push({ key: "ties", value: row.ties });
    if (row.noResults > 0) facts.push({ key: "noResults", value: row.noResults });
    club = {
      teamId: focus,
      finalPosition: row.rank,
      positions,
      highest,
      lowest,
      record: { played: row.played, wins: row.wins, losses: row.losses, ties: row.ties, noResults: row.noResults, points: row.points },
      text: `${teamName(focus)} finished ${ordinal(row.rank)} with ${row.wins} won, ${row.losses} lost${extra.length ? `, ${extra.join(", ")}` : ""} and ${plural(row.points, "point")}.${range}`,
      facts,
    };
  }

  // 3. The season story: the focus club's results by fixed rules, then league records of the season.
  const story: SeasonStoryItem[] = [];
  if (focus) {
    const own = matches.filter((m) => m.homeTeamId === focus || m.awayTeamId === focus);
    const opponent = (m: T20SeasonMatchCompletion) => (m.homeTeamId === focus ? m.awayTeamId : m.homeTeamId);
    type Pick = { match: T20SeasonMatchCompletion; primary: number; secondary: number };
    const pickMax = (list: Pick[]) =>
      list.reduce<Pick | null>((best, p) => (!best || p.primary > best.primary || (p.primary === best.primary && p.secondary > best.secondary) ? p : best), null);
    const runsWins: Pick[] = [], chaseWins: Pick[] = [], runsDefeats: Pick[] = [], chaseDefeats: Pick[] = [];
    for (const match of own) {
      const result = match.scorecard.result;
      if (result.kind !== "WIN") continue;
      const chase = match.scorecard.innings[1]!;
      const won = result.winnerTeamId === focus;
      if (result.marginType === "RUNS") (won ? runsWins : runsDefeats).push({ match, primary: result.marginRuns ?? 0, secondary: 0 });
      else (won ? chaseWins : chaseDefeats).push({ match, primary: rules.inningsBalls - chase.legalBalls, secondary: result.marginWickets ?? 0 });
    }
    const runsItem = (kind: SeasonStoryKind, label: string, verb: string, pick: Pick | null) => {
      if (!pick) return;
      const m = pick.match;
      story.push({
        kind, roundNumber: m.roundNumber, scope: "CLUB", label,
        text: `${verb} ${teamName(opponent(m))} by ${plural(pick.primary, "run")} in round ${m.roundNumber}.`,
        facts: [{ key: "marginRuns", value: pick.primary }, { key: "roundNumber", value: m.roundNumber }],
      });
    };
    const chaseItem = (kind: SeasonStoryKind, label: string, text: (m: T20SeasonMatchCompletion, balls: number, wickets: number) => string, pick: Pick | null) => {
      if (!pick) return;
      const m = pick.match;
      story.push({
        kind, roundNumber: m.roundNumber, scope: "CLUB", label, text: text(m, pick.primary, pick.secondary),
        facts: [{ key: "ballsToSpare", value: pick.primary }, { key: "marginWickets", value: pick.secondary }, { key: "roundNumber", value: m.roundNumber }],
      });
    };
    runsItem("BIGGEST_WIN_RUNS", "Biggest win defending", "Beat", pickMax(runsWins));
    chaseItem("BIGGEST_WIN_CHASE", "Quickest chase", (m, balls, wickets) =>
      `Beat ${teamName(opponent(m))} by ${plural(wickets, "wicket")} with ${plural(balls, "ball")} to spare in round ${m.roundNumber}.`, pickMax(chaseWins));
    runsItem("HEAVIEST_DEFEAT_RUNS", "Heaviest defeat batting second", "Lost to", pickMax(runsDefeats));
    chaseItem("HEAVIEST_DEFEAT_CHASE", "Heaviest defeat defending", (m, balls, wickets) =>
      `${teamName(opponent(m))} chased down their total with ${plural(balls, "ball")} to spare and ${plural(wickets, "wicket")} in hand in round ${m.roundNumber}.`, pickMax(chaseDefeats));
    for (const match of own) {
      if (match.scorecard.result.kind !== "TIE") continue;
      const runs = match.scorecard.innings[0]!.runs;
      story.push({
        kind: "TIE", roundNumber: match.roundNumber, scope: "CLUB", label: "A tie",
        text: `Tied with ${teamName(opponent(match))} in round ${match.roundNumber}, both sides on ${runs}.`,
        facts: [{ key: "runs", value: runs }, { key: "roundNumber", value: match.roundNumber }],
      });
    }

    // Runs of results, by round order.
    const outcomes = own.map((m) => ({
      round: m.roundNumber,
      outcome: m.scorecard.result.kind === "WIN" ? (m.scorecard.result.winnerTeamId === focus ? "W" : "L") : "O",
    }));
    const longestRun = (want: "W" | "L") => {
      let best: { length: number; from: number; to: number } | null = null;
      let start = 0;
      for (let i = 0; i <= outcomes.length; i += 1) {
        if (i < outcomes.length && outcomes[i]!.outcome === want) continue;
        const length = i - start;
        if (length >= rules.streakMin && (!best || length > best.length)) best = { length, from: outcomes[start]!.round, to: outcomes[i - 1]!.round };
        start = i + 1;
      }
      return best;
    };
    const wins = longestRun("W");
    if (wins) story.push({
      kind: "WIN_STREAK", roundNumber: wins.from, scope: "CLUB", label: "Longest winning run",
      text: `Won ${wins.length} league matches in a row, from round ${wins.from} to round ${wins.to}.`,
      facts: [{ key: "length", value: wins.length }, { key: "fromRound", value: wins.from }, { key: "toRound", value: wins.to }],
    });
    const defeats = longestRun("L");
    if (defeats) story.push({
      kind: "LOSING_STREAK", roundNumber: defeats.from, scope: "CLUB", label: "Longest losing run",
      text: `Lost ${defeats.length} league matches in a row, from round ${defeats.from} to round ${defeats.to}.`,
      facts: [{ key: "length", value: defeats.length }, { key: "fromRound", value: defeats.from }, { key: "toRound", value: defeats.to }],
    });

    // Collapses, from the fall of wickets.
    type CollapsePick = { match: T20SeasonMatchCompletion; collapse: Collapse };
    const worse = (a: CollapsePick | null, b: CollapsePick) =>
      !a || b.collapse.wickets > a.collapse.wickets || (b.collapse.wickets === a.collapse.wickets && b.collapse.runs < a.collapse.runs) ? b : a;
    let suffered: CollapsePick | null = null, inflicted: CollapsePick | null = null;
    for (const match of own) {
      for (const innings of match.scorecard.innings) {
        const collapse = worstCollapse(innings);
        if (!collapse) continue;
        if (innings.battingTeamId === focus) suffered = worse(suffered, { match, collapse });
        else inflicted = worse(inflicted, { match, collapse });
      }
    }
    const collapseItem = (kind: SeasonStoryKind, label: string, who: string, pick: CollapsePick | null) => {
      if (!pick) return;
      const { match: m, collapse: c } = pick;
      story.push({
        kind, roundNumber: m.roundNumber, scope: "CLUB", label,
        text: `${who} lost ${c.wickets} wickets for ${plural(c.runs, "run")}, from ${c.fromScore} to ${c.toScore}, in round ${m.roundNumber} against ${kind === "COLLAPSE_SUFFERED" ? teamName(opponent(m)) : teamName(focus)}.`,
        facts: [
          { key: "wickets", value: c.wickets }, { key: "runs", value: c.runs }, { key: "fromScore", value: c.fromScore },
          { key: "toScore", value: c.toScore }, { key: "roundNumber", value: m.roundNumber },
        ],
      });
    };
    collapseItem("COLLAPSE_SUFFERED", "Worst collapse", teamName(focus), suffered);
    if (inflicted) collapseItem("COLLAPSE_INFLICTED", "Best collapse forced", teamName(inflicted.match.homeTeamId === focus ? inflicted.match.awayTeamId : inflicted.match.homeTeamId), inflicted);
    story.sort((a, b) => a.roundNumber - b.roundNumber);
  }

  // League records of the season, compared with earlier seasons of this career's league.
  type TotalPick = { seasonNumber: number; match: T20SeasonMatchCompletion; innings: Innings };
  type ScorePick = { seasonNumber: number; match: T20SeasonMatchCompletion; teamId: string; playerId: string; runs: number; balls: number; notOut: boolean };
  type BowlPick = { seasonNumber: number; match: T20SeasonMatchCompletion; teamId: string; playerId: string; wickets: number; runs: number };
  const scan = (seasonNumber: number, list: readonly T20SeasonMatchCompletion[]) => {
    let total: TotalPick | null = null, score: ScorePick | null = null, bowl: BowlPick | null = null;
    for (const match of [...list].sort(byRound)) {
      for (const innings of match.scorecard.innings) {
        if (!total || innings.runs > total.innings.runs) total = { seasonNumber, match, innings };
        for (const [playerId, line] of Object.entries(innings.batting).sort(([a], [b]) => compare(a, b))) {
          if (!score || line.runs > score.runs || (line.runs === score.runs && line.ballsFaced < score.balls)) {
            score = { seasonNumber, match, teamId: innings.battingTeamId, playerId, runs: line.runs, balls: line.ballsFaced, notOut: !line.dismissed };
          }
        }
        for (const [playerId, line] of Object.entries(innings.bowling).sort(([a], [b]) => compare(a, b))) {
          if (line.legalBalls === 0) continue;
          if (!bowl || line.wickets > bowl.wickets || (line.wickets === bowl.wickets && line.runsConceded < bowl.runs)) {
            bowl = { seasonNumber, match, teamId: innings.bowlingTeamId, playerId, wickets: line.wickets, runs: line.runsConceded };
          }
        }
      }
    }
    return { total, score, bowl };
  };
  const now = scan(input.seasonNumber, matches);
  let pTotal: TotalPick | null = null, pScore: ScorePick | null = null, pBowl: BowlPick | null = null;
  for (const season of priorSeasons) {
    const s = scan(season.seasonNumber, season.completedMatches);
    if (s.total && (!pTotal || s.total.innings.runs > pTotal.innings.runs)) pTotal = s.total;
    if (s.score && (!pScore || s.score.runs > pScore.runs || (s.score.runs === pScore.runs && s.score.balls < pScore.balls))) pScore = s.score;
    if (s.bowl && (!pBowl || s.bowl.wickets > pBowl.wickets || (s.bowl.wickets === pBowl.wickets && s.bowl.runs < pBowl.runs))) pBowl = s.bowl;
  }
  const hasPrior = priorSeasons.some((s) => s.completedMatches.length > 0);
  /** How a season best compares with the earlier seasons' best: 1 better, 0 equal, -1 not. */
  const recordNote = (cmp: number, priorText: string, priorFacts: SeasonReviewFact[]): { text: string; facts: SeasonReviewFact[] } => {
    if (!hasPrior || cmp < 0) return { text: "", facts: [] };
    return cmp > 0
      ? { text: ` A league record: the best before was ${priorText}.`, facts: priorFacts }
      : { text: ` It equals the league record, ${priorText}.`, facts: priorFacts };
  };
  if (now.total) {
    const t = now.total;
    const cmp = !pTotal ? 1 : Math.sign(t.innings.runs - pTotal.innings.runs);
    const note = pTotal
      ? recordNote(cmp, `${pTotal.innings.runs}/${pTotal.innings.wickets} by ${teamName(pTotal.innings.battingTeamId)} in Season ${pTotal.seasonNumber}`,
        [{ key: "priorRuns", value: pTotal.innings.runs }, { key: "priorWickets", value: pTotal.innings.wickets }, { key: "priorSeason", value: pTotal.seasonNumber }])
      : { text: "", facts: [] };
    story.push({
      kind: "HIGHEST_TEAM_TOTAL", roundNumber: t.match.roundNumber, scope: "LEAGUE", label: "Highest total",
      text: `${teamName(t.innings.battingTeamId)} made ${t.innings.runs}/${t.innings.wickets} against ${teamName(t.innings.bowlingTeamId)} in round ${t.match.roundNumber}.${note.text}`,
      facts: [{ key: "runs", value: t.innings.runs }, { key: "wickets", value: t.innings.wickets }, { key: "roundNumber", value: t.match.roundNumber }, ...note.facts],
    });
  }
  if (now.score) {
    const s = now.score;
    const cmp = !pScore ? 1 : s.runs !== pScore.runs ? Math.sign(s.runs - pScore.runs) : Math.sign(pScore.balls - s.balls);
    const note = pScore
      ? recordNote(cmp, `${pScore.runs}${pScore.notOut ? "*" : ""} by ${playerName(pScore.playerId)} in Season ${pScore.seasonNumber}`,
        [{ key: "priorRuns", value: pScore.runs }, { key: "priorSeason", value: pScore.seasonNumber }])
      : { text: "", facts: [] };
    const against = s.match.homeTeamId === s.teamId ? s.match.awayTeamId : s.match.homeTeamId;
    story.push({
      kind: "HIGHEST_SCORE", roundNumber: s.match.roundNumber, scope: "LEAGUE", label: "Highest score",
      text: `${playerName(s.playerId)} (${teamName(s.teamId)}) made ${s.runs}${s.notOut ? " not out" : ""} from ${plural(s.balls, "ball")} against ${teamName(against)} in round ${s.match.roundNumber}.${note.text}`,
      facts: [{ key: "runs", value: s.runs }, { key: "balls", value: s.balls }, { key: "roundNumber", value: s.match.roundNumber }, ...note.facts],
    });
  }
  if (now.bowl && now.bowl.wickets > 0) {
    const b = now.bowl;
    const cmp = !pBowl ? 1 : b.wickets !== pBowl.wickets ? Math.sign(b.wickets - pBowl.wickets) : Math.sign(pBowl.runs - b.runs);
    const note = pBowl
      ? recordNote(cmp, `${pBowl.wickets}/${pBowl.runs} by ${playerName(pBowl.playerId)} in Season ${pBowl.seasonNumber}`,
        [{ key: "priorWickets", value: pBowl.wickets }, { key: "priorRuns", value: pBowl.runs }, { key: "priorSeason", value: pBowl.seasonNumber }])
      : { text: "", facts: [] };
    const against = b.match.homeTeamId === b.teamId ? b.match.awayTeamId : b.match.homeTeamId;
    story.push({
      kind: "BEST_BOWLING", roundNumber: b.match.roundNumber, scope: "LEAGUE", label: "Best bowling",
      text: `${playerName(b.playerId)} (${teamName(b.teamId)}) took ${b.wickets}/${b.runs} against ${teamName(against)} in round ${b.match.roundNumber}.${note.text}`,
      facts: [{ key: "wickets", value: b.wickets }, { key: "runs", value: b.runs }, { key: "roundNumber", value: b.match.roundNumber }, ...note.facts],
    });
  }

  // 4. Awards by fixed rules: league best economy, then the focus club's four.
  const awards: SeasonReviewAward[] = [];
  const economyAward = (id: SeasonReviewAwardId, label: string, pool: Map<string, Aggregate>, minBalls: number): SeasonReviewAward => {
    const qualified = [...pool.values()].filter((p) => p.legalBalls >= minBalls);
    qualified.sort((a, b) => a.runsConceded * b.legalBalls - b.runsConceded * a.legalBalls || b.legalBalls - a.legalBalls || compare(a.playerId, b.playerId));
    const rule = `Fewest runs an over, with at least ${minBalls / 6} overs bowled. Ties: more overs bowled.`;
    const top = qualified[0];
    if (!top) return { id, label, rule, playerId: null, teamId: null, value: `No bowler reached ${minBalls / 6} overs.`, facts: [{ key: "minOvers", value: minBalls / 6 }] };
    return {
      id, label, rule, playerId: top.playerId, teamId: top.teamId,
      value: `${economyText(top.runsConceded, top.legalBalls)} an over (${oversText(top.legalBalls)} overs, ${plural(top.wickets, "wicket")})`,
      facts: [{ key: "economy", value: economyText(top.runsConceded, top.legalBalls) }, { key: "overs", value: oversText(top.legalBalls) }, { key: "wickets", value: top.wickets }],
    };
  };
  awards.push(economyAward("LEAGUE_BEST_ECONOMY", "Best economy in the league", aggregate(matches), rules.leagueEconomyMinBalls));
  if (focus) {
    const clubPool = aggregate(matches.filter((m) => m.homeTeamId === focus || m.awayTeamId === focus), focus);
    const players = [...clubPool.values()];
    const points = (p: Aggregate) => p.runs + rules.clubPointsPerWicket * p.wickets;
    const pots = [...players].sort((a, b) => points(b) - points(a) || b.wickets - a.wickets || b.runs - a.runs || compare(a.playerId, b.playerId))[0];
    awards.push(pots && points(pots) > 0
      ? {
        id: "CLUB_PLAYER_OF_SEASON", label: "Club player of the season",
        rule: `Most points for the club: one a run and ${rules.clubPointsPerWicket} a wicket. Ties: more wickets, then more runs.`,
        playerId: pots.playerId, teamId: focus,
        value: `${points(pots)} points (${plural(pots.runs, "run")}, ${plural(pots.wickets, "wicket")})`,
        facts: [{ key: "points", value: points(pots) }, { key: "runs", value: pots.runs }, { key: "wickets", value: pots.wickets }],
      }
      : { id: "CLUB_PLAYER_OF_SEASON", label: "Club player of the season", rule: "", playerId: null, teamId: null, value: "No runs or wickets recorded.", facts: [] });
    const topRuns = [...players].filter((p) => p.runs > 0).sort((a, b) => b.runs - a.runs || a.ballsFaced - b.ballsFaced || compare(a.playerId, b.playerId))[0];
    awards.push({
      id: "CLUB_TOP_RUN_SCORER", label: "Club top run scorer", rule: "Most runs for the club. Ties: fewer balls faced.",
      playerId: topRuns?.playerId ?? null, teamId: topRuns ? focus : null,
      value: topRuns ? `${plural(topRuns.runs, "run")} in ${plural(topRuns.innings, "innings", "innings")}, best ${topRuns.highScore!.runs}${topRuns.highScore!.notOut ? "*" : ""}` : "No runs recorded.",
      facts: topRuns ? [{ key: "runs", value: topRuns.runs }, { key: "innings", value: topRuns.innings }, { key: "best", value: topRuns.highScore!.runs }] : [],
    });
    const topWickets = [...players].filter((p) => p.wickets > 0).sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded || compare(a.playerId, b.playerId))[0];
    awards.push({
      id: "CLUB_TOP_WICKET_TAKER", label: "Club top wicket taker", rule: "Most wickets for the club. Ties: fewer runs conceded.",
      playerId: topWickets?.playerId ?? null, teamId: topWickets ? focus : null,
      value: topWickets ? `${plural(topWickets.wickets, "wicket")}, best ${topWickets.bestBowling!.wickets}/${topWickets.bestBowling!.runs}` : "No wickets recorded.",
      facts: topWickets ? [{ key: "wickets", value: topWickets.wickets }, { key: "bestWickets", value: topWickets.bestBowling!.wickets }, { key: "bestRuns", value: topWickets.bestBowling!.runs }] : [],
    });
    awards.push(economyAward("CLUB_BEST_ECONOMY", "Club best economy", clubPool, rules.clubEconomyMinBalls));
  }

  // 5. The focus club's cricketers: season lines for the club and league milestones passed in the season.
  const squad: SquadSeasonLine[] = [];
  if (focus) {
    const clubPool = aggregate(matches.filter((m) => m.homeTeamId === focus || m.awayTeamId === focus), focus);
    const before = aggregate(priorSeasons.flatMap((s) => s.completedMatches));
    const season = aggregate(matches);
    const v3 = PLAYER_IDENTITY_V3_RULES;
    for (const line of clubPool.values()) {
      const prior = before.get(line.playerId) ?? emptyAggregate(line.playerId, focus);
      const thisSeason = season.get(line.playerId) ?? line;
      const milestones: SquadSeasonLine["milestones"] = [];
      if (prior.matches === 0 && hasPrior) milestones.push({ text: "First league season.", facts: [] });
      const runsAfter = prior.runs + thisSeason.runs;
      const runMark = marksUpTo(runsAfter, v3.runsMarks, v3.runsEvery).filter((m) => m > prior.runs).at(-1);
      if (runMark !== undefined) milestones.push({ text: `Passed ${runMark} league runs (${runsAfter} in all).`, facts: [{ key: "mark", value: runMark }, { key: "total", value: runsAfter }] });
      const wicketsAfter = prior.wickets + thisSeason.wickets;
      const wicketMark = marksUpTo(wicketsAfter, v3.wicketsMarks, v3.wicketsEvery).filter((m) => m > prior.wickets).at(-1);
      if (wicketMark !== undefined) milestones.push({ text: `Passed ${wicketMark} league wickets (${wicketsAfter} in all).`, facts: [{ key: "mark", value: wicketMark }, { key: "total", value: wicketsAfter }] });
      // Firsts are told only once the league has an earlier season: in its first season every one is a first.
      if (hasPrior && prior.hundreds === 0 && thisSeason.hundreds > 0) milestones.push({ text: `First league hundred (best ${thisSeason.highScore!.runs}${thisSeason.highScore!.notOut ? "*" : ""}).`, facts: [{ key: "best", value: thisSeason.highScore!.runs }] });
      else if (hasPrior && prior.fifties + prior.hundreds === 0 && thisSeason.fifties > 0) milestones.push({ text: `First league fifty (best ${thisSeason.highScore!.runs}${thisSeason.highScore!.notOut ? "*" : ""}).`, facts: [{ key: "best", value: thisSeason.highScore!.runs }] });
      if (hasPrior && prior.wickets === 0 && thisSeason.wickets > 0) milestones.push({ text: "First league wicket.", facts: [] });
      const { highScore, ...rest } = line;
      squad.push({ ...rest, highScore: highScore ? { runs: highScore.runs, notOut: highScore.notOut } : null, milestones });
    }
    squad.sort((a, b) => b.matches - a.matches || (b.runs + rules.clubPointsPerWicket * b.wickets) - (a.runs + rules.clubPointsPerWicket * a.wickets) || compare(a.playerId, b.playerId));
  }

  // 6. Development recorded at the rollover that opened this season.
  let development: SeasonReviewDevelopment | null = null;
  if (focus && input.lastRollover && input.lastRollover.toSeasonNumber === input.seasonNumber) {
    const lines: SeasonDevelopmentLine[] = input.lastRollover.developedPlayers
      .filter((r) => r.teamId === focus)
      .map((r) => {
        const d = r.deltas;
        const net = d.battingDelta + d.bowlingDelta + d.fieldingDelta + d.keepingDelta;
        const parts = ([["batting", d.battingDelta], ["bowling", d.bowlingDelta], ["fielding", d.fieldingDelta], ["keeping", d.keepingDelta], ["stamina", d.staminaDelta]] as const)
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`);
        return {
          playerId: r.playerId, batting: d.battingDelta, bowling: d.bowlingDelta, fielding: d.fieldingDelta, keeping: d.keepingDelta,
          stamina: d.staminaDelta, net, text: parts.length ? `${parts.join(", ")}.` : "No change.",
        };
      });
    const order = (a: SeasonDevelopmentLine, b: SeasonDevelopmentLine) => Math.abs(b.net) - Math.abs(a.net) || compare(a.playerId, b.playerId);
    development = {
      fromSeasonNumber: input.lastRollover.fromSeasonNumber,
      improved: lines.filter((l) => l.net > 0).sort(order),
      declined: lines.filter((l) => l.net < 0).sort(order),
      unchanged: lines.filter((l) => l.net === 0).length,
    };
  }

  // 7. What is known about the next season.
  let ahead: SeasonReviewAhead | null = null;
  if (focus && input.ahead) {
    const contractsEnding = input.ahead.contracts
      .filter((c) => c.teamId === focus && c.expiresAfterSeasonNumber <= input.seasonNumber)
      .map((c) => c.playerId)
      .sort(compare);
    const academyProspects = input.ahead.academy
      .filter((p) => p.teamId === focus && p.promotedInSeasonNumber === null && p.generatedInSeasonNumber === input.seasonNumber)
      .map((p) => ({ playerId: p.playerId, queued: p.queuedForPromotion }))
      .sort((a, b) => compare(a.playerId, b.playerId));
    const next = input.seasonNumber + 1;
    const sentences: SeasonReviewAhead["sentences"] = [];
    sentences.push(contractsEnding.length === 0
      ? { text: "No contract at your club ends with this season.", facts: [] }
      : {
        text: `${plural(contractsEnding.length, "contract")} at your club ${contractsEnding.length === 1 ? "ends" : "end"} with this season: ${contractsEnding.map(playerName).join(", ")}. A contract not renewed by the close ends then, and the player joins the free-agent pool.`,
        facts: [{ key: "contractsEnding", value: contractsEnding.length }],
      });
    const queued = academyProspects.filter((p) => p.queued);
    sentences.push(academyProspects.length === 0
      ? { text: "Your academy has no prospect from this season's intake waiting for promotion.", facts: [] }
      : {
        text: `Your academy holds ${plural(academyProspects.length, "prospect")} from this season's intake. ${queued.length === 0 ? "None is queued for promotion." : `Queued for promotion at the close: ${queued.map((p) => playerName(p.playerId)).join(", ")}.`}`,
        facts: [{ key: "prospects", value: academyProspects.length }],
      });
    sentences.push({
      text: `Closing the season starts Season ${next}: players age and develop, and the board sets Season ${next}'s objective from each club's best eleven after those changes.`,
      facts: [{ key: "nextSeasonNumber", value: next }],
    });
    ahead = { nextSeasonNumber: next, contractsEnding, academyProspects, sentences };
  }

  return {
    version: SEASON_REVIEW_V1_VERSION,
    seasonNumber: input.seasonNumber,
    matchesCompleted: matches.length,
    titleRace,
    club,
    story,
    awards,
    squad,
    development,
    ahead,
  };
}

