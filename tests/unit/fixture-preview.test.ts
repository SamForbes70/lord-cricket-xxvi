import { describe, expect, test } from "vitest";
import type { AppliedSeasonMatch, SeasonPlayerStats, SeasonTeamTableRow, T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import { buildFixturePreview, type FixturePreviewInput, type PreviewMeeting } from "@lcxxvi/projections";

const teamName = (id: string) => ({ us: "Aster Harbour", them: "Copper Vale", x: "Silver Fen" })[id] ?? id;
type Result = T20SeasonMatchCompletion["scorecard"]["result"];
const byRuns = (winner: string, runs: number) => ({ kind: "WIN", winnerTeamId: winner, marginType: "RUNS", marginRuns: runs, marginWickets: null }) as unknown as Result;
const byWickets = (winner: string, wickets: number) => ({ kind: "WIN", winnerTeamId: winner, marginType: "WICKETS", marginRuns: null, marginWickets: wickets }) as unknown as Result;
const tie = { kind: "TIE", winnerTeamId: null } as unknown as Result;
const meeting = (seasonNumber: number, roundNumber: number, home: string, away: string, result: Result): PreviewMeeting => ({
  seasonNumber,
  completion: { fixtureId: `s${seasonNumber}r${roundNumber}`, roundNumber, fixtureOrdinal: roundNumber, homeTeamId: home, awayTeamId: away, scorecard: { result } } as unknown as T20SeasonMatchCompletion,
});
const row = (rank: number, teamId: string, played: number, points: number) => ({ rank, teamId, played, points }) as unknown as SeasonTeamTableRow;
const applied = (roundNumber: number, home: string, away: string, winner: string | null): AppliedSeasonMatch =>
  ({ roundNumber, fixtureOrdinal: roundNumber, homeTeamId: home, awayTeamId: away, resultKind: winner ? "WIN" : "TIE", winnerTeamId: winner }) as unknown as AppliedSeasonMatch;
const stats = (playerId: string, teamId: string, runs: number, bowlingWickets: number) => ({ playerId, teamId, runs, bowlingWickets, bowlingRunsConceded: 0 }) as unknown as SeasonPlayerStats;

const base: FixturePreviewInput = {
  focusTeamId: "us", opponentTeamId: "them", meetings: [], table: [row(1, "us", 0, 0), row(2, "them", 0, 0), row(3, "x", 0, 0)], appliedMatches: [], seasonPlayers: [],
  opponentRatings: [{ playerId: "bat", batting: 74, bowling: 0 }, { playerId: "bowl", batting: 30, bowling: 71 }], objective: { targetPosition: 2, phrase: "the top two" }, teamName,
};

describe("fixture preview", () => {
  test("before any cricket: no history, players to watch by rating, and the season starts here", () => {
    const preview = buildFixturePreview(base);
    expect(preview).toMatchObject({
      opponentPosition: 2, opponentForm: [], rivalry: null, meaning: "The season starts here.",
      headToHead: { played: 0, won: 0, lost: 0, other: 0, lastMeeting: null },
      dangerBatter: { playerId: "bat", text: "their highest-rated batter (74)" },
      dangerBowler: { playerId: "bowl", text: "their highest-rated bowler (71)" },
    });
  });

  test("head to head counts only these two clubs across seasons and reports the last meeting", () => {
    const preview = buildFixturePreview({ ...base, meetings: [
      meeting(2, 3, "us", "them", byRuns("them", 40)), meeting(1, 9, "them", "us", byWickets("us", 6)), meeting(1, 2, "us", "them", tie),
      meeting(2, 1, "us", "x", byRuns("us", 99)),
    ] });
    expect(preview.headToHead).toEqual({ played: 3, won: 1, lost: 1, other: 1, lastMeeting: "Last meeting: Copper Vale won by 40 runs." });
    expect(preview.rivalry).toBeNull();
  });

  test("a rivalry is earned by three close results in the last six meetings, and only then", () => {
    const close = [meeting(1, 2, "us", "them", byRuns("us", 10)), meeting(1, 9, "them", "us", byWickets("them", 2)), meeting(2, 2, "us", "them", tie)];
    const wide = [meeting(2, 9, "us", "them", byRuns("us", 11)), meeting(3, 2, "us", "them", byWickets("us", 3))];
    expect(buildFixturePreview({ ...base, meetings: [...close, ...wide] }).rivalry).toEqual({
      closeMeetings: 3, ofLast: 5, reason: "3 of the last 5 meetings were decided by 10 runs or fewer, 2 wickets or fewer, or a tie.",
    });
    expect(buildFixturePreview({ ...base, meetings: [...close.slice(0, 2), ...wide] }).rivalry).toBeNull();
    // Close results older than the last six meetings no longer count.
    const old = [...close, ...Array.from({ length: 6 }, (_, index) => meeting(4, index + 1, "us", "them", byRuns("us", 50)))];
    expect(buildFixturePreview({ ...base, meetings: old }).rivalry).toBeNull();
  });

  test("opponent form and players to watch come from this season once there are results", () => {
    const preview = buildFixturePreview({ ...base,
      appliedMatches: [applied(3, "them", "x", null), applied(1, "them", "x", "them"), applied(2, "x", "them", "x"), applied(2, "us", "x", "us")],
      seasonPlayers: [stats("a", "them", 88, 1), stats("b", "them", 20, 6), stats("c", "us", 300, 30)],
    });
    expect(preview.opponentForm).toEqual(["W", "L", "T"]);
    expect(preview.dangerBatter).toEqual({ playerId: "a", text: "88 runs this season" });
    expect(preview.dangerBowler).toEqual({ playerId: "b", text: "6 wickets this season" });
  });

  test("what the match means, case by case", () => {
    const meaning = (table: SeasonTeamTableRow[], objective = base.objective) => buildFixturePreview({ ...base, table, objective }).meaning;
    expect(meaning([row(1, "us", 4, 8), row(2, "them", 4, 6)])).toBe("Win to stay top.");
    expect(meaning([row(1, "x", 4, 8), row(2, "us", 4, 8), row(3, "them", 4, 2)])).toBe("A win could take you top.");
    expect(meaning([row(1, "x", 6, 12), row(2, "us", 6, 8), row(3, "them", 6, 2)])).toBe("Win to stay inside the top two.");
    expect(meaning([row(1, "x", 6, 12), row(2, "them", 6, 8), row(3, "us", 6, 6)])).toBe("A win could take you into the top two.");
    expect(meaning([row(1, "x", 6, 12), row(2, "them", 6, 10), row(3, "us", 6, 4)])).toBe("6 points off the top two: win to close the gap.");
    expect(meaning([row(1, "x", 6, 12), row(2, "them", 6, 10), row(3, "us", 6, 4)], null)).toBe("Win to climb the table.");
  });
});
