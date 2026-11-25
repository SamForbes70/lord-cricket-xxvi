import { describe, expect, test } from "vitest";
import type { AppliedSeasonMatch, MatchAwardRecord, T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import { buildMatchReport, overOfLegalBall } from "@lcxxvi/projections";

type Scorecard = T20SeasonMatchCompletion["scorecard"];
type Innings = Scorecard["innings"][number];
const H = "a".repeat(64);
const TEAMS = ["t1", "t2", "t3", "t4"];
const teamName = (id: string) => ({ t1: "Aster Harbour", t2: "Copper Vale", t3: "Silver Fen", t4: "Larchwood" })[id] ?? id;
const playerName = (id: string) => `Player ${id}`;
const noExtras = { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 };

function innings(battingTeamId: string, bowlingTeamId: string, runs: number, wickets: number, legalBalls: number, overrides: Partial<Innings> = {}): Innings {
  return {
    battingTeamId, bowlingTeamId, runs, wickets, legalBalls, overs: `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`, extras: noExtras,
    batting: {}, bowling: {}, fallOfWickets: [], targetToWin: null, ...overrides,
  };
}

function completion(roundNumber: number, first: Innings, second: Innings, result: Scorecard["result"], fixtureId = `f${roundNumber}`): T20SeasonMatchCompletion {
  return {
    completionVersion: "LC_T20_SEASON_MATCH_COMPLETION_V1", seasonId: "s1", scheduleSha256: H, fixtureId, matchId: `m-${fixtureId}`,
    fixtureOrdinal: 0, roundNumber, matchDayDate: "2027-03-01", homeTeamId: first.battingTeamId, awayTeamId: second.battingTeamId,
    source: "OFFSCREEN", sourceCompletionSha256: H, scorecardSha256: H,
    selectedTeams: [] as unknown as T20SeasonMatchCompletion["selectedTeams"],
    scorecard: { matchId: `m-${fixtureId}`, innings: [first, second], result } as Scorecard,
  };
}

function applied(roundNumber: number, home: string, away: string, winner: string | null, ordinal: number): AppliedSeasonMatch {
  return {
    fixtureId: `a${ordinal}`, matchId: `am${ordinal}`, fixtureOrdinal: ordinal, roundNumber, homeTeamId: home, awayTeamId: away, sourceCompletionSha256: H,
    resultKind: winner ? "WIN" : "TIE", winnerTeamId: winner, homePoints: winner === home ? 2 : winner ? 0 : 1, awayPoints: winner === away ? 2 : winner ? 0 : 1,
    nrrEligible: true, homeRuns: winner === home ? 160 : 140, homeBalls: 120, awayRuns: winner === away ? 160 : 140, awayBalls: 120,
  };
}

const winByRuns = (winnerTeamId: string, marginRuns: number): Scorecard["result"] =>
  ({ kind: "WIN", winnerTeamId, marginType: "RUNS", marginRuns, marginWickets: null, completionReason: "TARGET_NOT_REACHED" });
const winByWickets = (winnerTeamId: string, marginWickets: number): Scorecard["result"] =>
  ({ kind: "WIN", winnerTeamId, marginType: "WICKETS", marginRuns: null, marginWickets, completionReason: "TARGET_REACHED" });

describe("match report", () => {
  test("a three-run defeat is a thriller written from the losing side, with the collapse as the turning point", () => {
    const first = innings("t2", "t1", 151, 7, 120, {
      batting: { b1: { runs: 62, ballsFaced: 41, fours: 6, sixes: 2, dismissed: true }, b2: { runs: 30, ballsFaced: 22, fours: 3, sixes: 0, dismissed: false }, b3: { runs: 30, ballsFaced: 25, fours: 2, sixes: 0, dismissed: true } },
    });
    const second = innings("t1", "t2", 148, 4, 120, {
      bowling: { w1: { runsConceded: 21, legalBalls: 24, wickets: 3, maidens: 0 }, w2: { runsConceded: 35, legalBalls: 24, wickets: 2, maidens: 0 } },
      fallOfWickets: [
        { playerId: "x1", runs: 40, legalBalls: 30, sequence: 1 },
        { playerId: "x2", runs: 120, legalBalls: 86, sequence: 2 },
        { playerId: "x3", runs: 124, legalBalls: 90, sequence: 3 },
        { playerId: "x4", runs: 126, legalBalls: 97, sequence: 4 },
      ],
    });
    const report = buildMatchReport({
      completion: completion(2, first, second, winByRuns("t2", 3)), focusTeamId: "t1", teamIds: TEAMS, teamName, playerName,
      appliedMatches: [applied(1, "t1", "t3", "t1", 0), applied(1, "t2", "t4", "t4", 1), applied(2, "t2", "t1", "t2", 2), applied(2, "t3", "t4", "t4", 3)],
    });
    expect(report.outcome).toBe("LOST");
    expect(report.headlineKind).toBe("THRILLER");
    expect(report.headline).toMatch(/Aster Harbour/);
    expect(report.resultLine).toBe("Copper Vale won by 3 runs");
    expect(report.innings[0].topBatters.map((b) => b.playerId)).toEqual(["b1", "b2"]);
    expect(report.innings[1].topBowlers[0]).toEqual({ playerId: "w1", wickets: 3, runsConceded: 21, overs: "4" });
    expect(report.turningPoint).toMatchObject({ kind: "COLLAPSE", battingTeamId: "t1", wickets: 3, runs: 6, fromOver: "14.2", toOver: "16.1" });
    expect(report.turningPoint?.text).toBe("Aster Harbour lost 3 wickets for 6 runs between overs 14.2 and 16.1.");
    expect(report.bestPartnership).toMatchObject({ inningsIndex: 1, runs: 80, wicketNumber: 2, unbroken: false });
    expect(report.tableMove).toEqual({ before: 1, after: 3, text: "Down from 1st to 3rd." });
  });

  test("a nine-wicket chase is a statement win and falls back to the winning stand when the loser never collapsed", () => {
    const first = innings("t2", "t1", 120, 4, 120, { fallOfWickets: [
      { playerId: "x1", runs: 20, legalBalls: 20, sequence: 1 }, { playerId: "x2", runs: 50, legalBalls: 50, sequence: 2 },
      { playerId: "x3", runs: 80, legalBalls: 80, sequence: 3 }, { playerId: "x4", runs: 110, legalBalls: 110, sequence: 4 },
    ] });
    const second = innings("t1", "t2", 121, 1, 80, { fallOfWickets: [{ playerId: "y1", runs: 15, legalBalls: 12, sequence: 1 }] });
    const report = buildMatchReport({
      completion: completion(1, first, second, winByWickets("t1", 9)), focusTeamId: "t1", teamIds: TEAMS, teamName, playerName,
      appliedMatches: [applied(1, "t2", "t1", "t1", 0)],
    });
    expect(report.outcome).toBe("WON");
    expect(report.headlineKind).toBe("STATEMENT");
    expect(report.turningPoint).toMatchObject({ kind: "STAND", battingTeamId: "t1", runs: 106 });
    expect(report.turningPoint?.text).toBe("Aster Harbour put on 106 for the 2nd wicket, unbroken.");
    expect(report.tableMove?.text).toBe("1st on the table after round 1.");
  });

  test("a chase won in the last over is a thriller even with wickets in hand", () => {
    const report = buildMatchReport({
      completion: completion(1, innings("t2", "t1", 150, 6, 120), innings("t1", "t2", 151, 5, 118), winByWickets("t1", 5)),
      focusTeamId: "t1", teamIds: TEAMS, teamName, playerName, appliedMatches: [],
    });
    expect(report.headlineKind).toBe("THRILLER");
  });

  test("a big individual score names the player when the match was neither close nor one-sided", () => {
    const first = innings("t1", "t2", 170, 5, 120, { batting: { b9: { runs: 88, ballsFaced: 52, fours: 9, sixes: 3, dismissed: false } } });
    const report = buildMatchReport({
      completion: completion(1, first, innings("t2", "t1", 145, 8, 120), winByRuns("t1", 25)),
      focusTeamId: "t1", teamIds: TEAMS, teamName, playerName, appliedMatches: [],
    });
    expect(report.headlineKind).toBe("INDIVIDUAL");
    expect(report.headline).toBe("Player b9 makes 88 not out");
  });

  test("a tie has no winner, no turning point, and names the player of the match from the award", () => {
    const first = innings("t1", "t2", 140, 6, 120, { batting: { p7: { runs: 55, ballsFaced: 40, fours: 5, sixes: 1, dismissed: true } } });
    const second = innings("t2", "t1", 140, 9, 120, { bowling: { p7: { runsConceded: 18, legalBalls: 24, wickets: 2, maidens: 0 } } });
    const tie = { kind: "TIE", winnerTeamId: null, marginType: null, marginRuns: null, marginWickets: null, completionReason: "SCORES_LEVEL" } as unknown as Scorecard["result"];
    const award = { status: "AWARDED", winnerPlayerId: "p7", winnerTeamId: "t1" } as unknown as MatchAwardRecord;
    const report = buildMatchReport({ completion: completion(1, first, second, tie), focusTeamId: "t1", teamIds: TEAMS, teamName, playerName, appliedMatches: [], award });
    expect(report.outcome).toBe("TIED");
    expect(report.headlineKind).toBe("TIE");
    expect(report.resultLine).toBe("Match tied");
    expect(report.turningPoint).toBeNull();
    expect(report.playerOfTheMatch).toEqual({ playerId: "p7", teamId: "t1", line: "55 from 40 balls and 2/18 from 4 overs" });
  });

  test("the same inputs always give the same report, and inputs are not changed", () => {
    const make = () => completion(3, innings("t2", "t1", 151, 7, 120), innings("t1", "t2", 148, 8, 120), winByRuns("t2", 3), "fixture-xyz");
    const input = { completion: make(), focusTeamId: "t1", teamIds: TEAMS, teamName, playerName, appliedMatches: [applied(3, "t2", "t1", "t2", 0)] };
    const before = JSON.stringify(input.completion);
    expect(buildMatchReport(input)).toEqual(buildMatchReport({ ...input, completion: make() }));
    expect(JSON.stringify(input.completion)).toBe(before);
  });

  test("over notation counts balls the way the scoreboard does", () => {
    expect([1, 6, 7, 86, 90, 97, 120].map(overOfLegalBall)).toEqual(["0.1", "0.6", "1.1", "14.2", "14.6", "16.1", "19.6"]);
  });
});
