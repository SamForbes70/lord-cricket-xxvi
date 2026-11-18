import type { Competition, TournamentFixture, TournamentResult, TournamentStage } from "@lcxxvi/contracts";

/**
 * Stage 15 tournament logic. Pure and deterministic: fixtures, standings, knockout progression and the champion all
 * come from the competition manifest and the recorded results.
 *
 * Rules as built:
 * - Round robins use the circle method; a bye is added for an odd number of teams.
 * - Standings order: points, wins, net run rate, then team id. A side bowled out is charged its full quota of balls
 *   (120 for T20, 300 for one-day) in net run rate, the usual convention.
 * - A tied knockout match goes to the super-over winner. If the super overs also stay tied, the side placed higher
 *   in the league or group goes through.
 * - A series ends once one side cannot be caught. A tied series match counts for neither side, so an even series is
 *   drawn.
 */

export type StandingRow = {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
  /** Net run rate, rounded to three decimal places. */
  netRunRate: number;
};

export type TournamentOutcome =
  | { status: "IN_PROGRESS" }
  | { status: "CHAMPION"; teamId: string; how: string }
  | { status: "SERIES_DRAWN"; how: string };

function quota(c: Competition): number {
  return c.format === "T20" ? 120 : 300;
}

/** Circle-method pairings, deterministic in the given team order. */
export function roundRobinPairings(teamIds: readonly string[], legs: 1 | 2): [string, string][] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const rounds: [string, string][] = [];
  const order = [...teams];
  for (let round = 0; round < n - 1; round += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const a = order[i]!;
      const b = order[n - 1 - i]!;
      if (a !== null && b !== null) rounds.push(round % 2 === 0 ? [a, b] : [b, a]);
    }
    order.splice(1, 0, order.pop()!);
  }
  return legs === 1 ? rounds : [...rounds, ...rounds.map(([a, b]) => [b, a] as [string, string])];
}

function fixture(c: Competition, matchNumber: number, stage: TournamentStage, home: string, away: string): TournamentFixture {
  return {
    fixtureId: `${c.competitionId}:m${matchNumber}`,
    matchNumber,
    stage,
    homeTeamId: home,
    awayTeamId: away,
    groundId: c.groundIds[(matchNumber - 1) % c.groundIds.length]!,
  };
}

function resultFor(results: readonly TournamentResult[], fixtureId: string): TournamentResult | null {
  return results.find((r) => r.fixtureId === fixtureId) ?? null;
}

function isAllOut(wickets: number): boolean {
  return wickets >= 10;
}

export function computeStandings(
  c: Competition,
  teamIds: readonly string[],
  fixtures: readonly TournamentFixture[],
  results: readonly TournamentResult[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, lost: 0, tied: 0, points: 0, runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0, netRunRate: 0 }]),
  );
  for (const f of fixtures) {
    const r = resultFor(results, f.fixtureId);
    if (!r) continue;
    const sides = [
      { id: r.homeTeamId, runs: r.homeRuns, wickets: r.homeWickets, balls: r.homeLegalBalls },
      { id: r.awayTeamId, runs: r.awayRuns, wickets: r.awayWickets, balls: r.awayLegalBalls },
    ];
    for (const [self, other] of [[sides[0]!, sides[1]!], [sides[1]!, sides[0]!]] as const) {
      const row = rows.get(self.id);
      if (!row) continue;
      row.played += 1;
      row.runsFor += self.runs;
      row.ballsFaced += isAllOut(self.wickets) ? quota(c) : self.balls;
      row.runsAgainst += other.runs;
      row.ballsBowled += isAllOut(other.wickets) ? quota(c) : other.balls;
      if (r.resultKind === "TIE") {
        row.tied += 1;
        row.points += c.points.tie;
      } else if (r.winnerTeamId === self.id) {
        row.won += 1;
        row.points += c.points.win;
      } else {
        row.lost += 1;
        row.points += c.points.loss;
      }
    }
  }
  for (const row of rows.values()) {
    const forRate = row.ballsFaced ? (row.runsFor * 6) / row.ballsFaced : 0;
    const againstRate = row.ballsBowled ? (row.runsAgainst * 6) / row.ballsBowled : 0;
    row.netRunRate = Math.round((forRate - againstRate) * 1000) / 1000;
  }
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.won - a.won || b.netRunRate - a.netRunRate || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0),
  );
}

/** The winner of a knockout match: match winner, else super-over winner, else the higher-placed side. */
export function knockoutWinner(r: TournamentResult, higherPlaced: string): string {
  if (r.winnerTeamId) return r.winnerTeamId;
  if (r.superOverWinnerTeamId) return r.superOverWinnerTeamId;
  return higherPlaced;
}

function allPlayed(fixtures: readonly TournamentFixture[], results: readonly TournamentResult[]): boolean {
  return fixtures.every((f) => resultFor(results, f.fixtureId) !== null);
}

export type TournamentView = {
  fixtures: TournamentFixture[];
  /** League or group tables, keyed by stage. */
  tables: { stage: TournamentStage; rows: StandingRow[] }[];
  outcome: TournamentOutcome;
  /** The first fixture with no result, or null when the tournament is over. */
  next: TournamentFixture | null;
};

export function viewTournament(c: Competition, results: readonly TournamentResult[]): TournamentView {
  const s = c.structure;
  const fixtures: TournamentFixture[] = [];
  const tables: TournamentView["tables"] = [];
  let outcome: TournamentOutcome = { status: "IN_PROGRESS" };
  let n = 0;
  const add = (stage: TournamentStage, home: string, away: string) => {
    n += 1;
    const f = fixture(c, n, stage, home, away);
    fixtures.push(f);
    return f;
  };

  if (s.kind === "SERIES") {
    const [a, b] = c.teamIds as [string, string];
    const needed = Math.floor(s.matches / 2) + 1;
    let winsA = 0;
    let winsB = 0;
    for (let m = 0; m < s.matches; m += 1) {
      const f = add("SERIES", m % 2 === 0 ? a : b, m % 2 === 0 ? b : a);
      const r = resultFor(results, f.fixtureId);
      if (!r) break;
      if (r.winnerTeamId === a) winsA += 1;
      if (r.winnerTeamId === b) winsB += 1;
      if (winsA >= needed || winsB >= needed) break;
    }
    const finished = winsA >= needed || winsB >= needed || allPlayed(fixtures, results) && fixtures.length === s.matches;
    if (finished) {
      const how = `Series ${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`;
      outcome = winsA === winsB ? { status: "SERIES_DRAWN", how: `Series drawn ${winsA}-${winsB}` } : { status: "CHAMPION", teamId: winsA > winsB ? a : b, how };
    }
    tables.push({ stage: "SERIES", rows: computeStandings(c, c.teamIds, fixtures, results) });
  } else if (s.kind === "ROUND_ROBIN") {
    for (const [home, away] of roundRobinPairings(c.teamIds, s.legs)) add("LEAGUE", home, away);
    const league = fixtures.slice();
    const rows = computeStandings(c, c.teamIds, league, results);
    tables.push({ stage: "LEAGUE", rows });
    if (allPlayed(league, results)) {
      if (!s.finalTopTwo) outcome = { status: "CHAMPION", teamId: rows[0]!.teamId, how: "Top of the table" };
      else {
        const final = add("FINAL", rows[0]!.teamId, rows[1]!.teamId);
        const r = resultFor(results, final.fixtureId);
        if (r) outcome = { status: "CHAMPION", teamId: knockoutWinner(r, rows[0]!.teamId), how: "Won the final" };
      }
    }
  } else {
    const stages: ["GROUP_A", "GROUP_B"] = ["GROUP_A", "GROUP_B"];
    s.groups.forEach((group, index) => {
      for (const [home, away] of roundRobinPairings(group, 1)) add(stages[index]!, home, away);
    });
    const groupFixtures = (stage: TournamentStage) => fixtures.filter((f) => f.stage === stage);
    const a = computeStandings(c, s.groups[0], groupFixtures("GROUP_A"), results);
    const b = computeStandings(c, s.groups[1], groupFixtures("GROUP_B"), results);
    tables.push({ stage: "GROUP_A", rows: a }, { stage: "GROUP_B", rows: b });
    if (allPlayed(fixtures, results)) {
      const semi1 = add("SEMI_FINAL", a[0]!.teamId, b[1]!.teamId);
      const semi2 = add("SEMI_FINAL", b[0]!.teamId, a[1]!.teamId);
      const r1 = resultFor(results, semi1.fixtureId);
      const r2 = resultFor(results, semi2.fixtureId);
      if (r1 && r2) {
        const w1 = knockoutWinner(r1, a[0]!.teamId);
        const w2 = knockoutWinner(r2, b[0]!.teamId);
        // The group winner hosts; between two group winners, group A's.
        const final = add("FINAL", w1, w2);
        const rf = resultFor(results, final.fixtureId);
        if (rf) outcome = { status: "CHAMPION", teamId: knockoutWinner(rf, w1), how: "Won the final" };
      }
    }
  }
  const next = outcome.status === "IN_PROGRESS" ? (fixtures.find((f) => !resultFor(results, f.fixtureId)) ?? null) : null;
  return { fixtures, tables, outcome, next };
}
