import { describe, expect, test } from "vitest";
import type { SeasonTeamTableRow } from "@lcxxvi/contracts";
import { rankClubStrength, seasonObjective, seasonObjectiveStatus } from "@lcxxvi/projections";

const squad = (teamId: string, base: number) => ({ teamId, ratings: [...Array(11).fill(base), 10, 10, 10] });
const strengths = rankClubStrength([squad("a", 80), squad("b", 78), squad("c", 76), squad("d", 74), squad("e", 72), squad("f", 70), squad("g", 68), squad("h", 66)]);

function table(rows: [teamId: string, played: number, points: number][]): SeasonTeamTableRow[] {
  return rows.map(([teamId, played, points], index) => ({
    rank: index + 1, teamId, played, wins: points / 2, losses: played - points / 2, ties: 0, noResults: 0, points,
    runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrrNumerator: 0, nrrDenominator: null, nrrX1000: null, headToHeadPoints: 0,
  }));
}
const status = (teamId: string, rows: [string, number, number][], seasonComplete = false) =>
  seasonObjectiveStatus({ objective: seasonObjective(strengths, teamId)!, table: table(rows), teamId, totalRounds: 14, seasonComplete })!;

describe("season objective", () => {
  test("strength is the mean of the best eleven, so squad depth beyond eleven does not count", () => {
    expect(strengths.map((entry) => [entry.teamId, entry.strengthX100, entry.rank])).toEqual([
      ["a", 8000, 1], ["b", 7800, 2], ["c", 7600, 3], ["d", 7400, 4], ["e", 7200, 5], ["f", 7000, 6], ["g", 6800, 7], ["h", 6600, 8],
    ]);
    expect(rankClubStrength([{ teamId: "z", ratings: [50] }, { teamId: "y", ratings: [50] }]).map((entry) => entry.teamId)).toEqual(["y", "z"]);
  });

  test("the three strength bands give the three objectives", () => {
    expect(["a", "b"].map((id) => seasonObjective(strengths, id)!.kind)).toEqual(["WIN_TITLE", "WIN_TITLE"]);
    expect(["c", "d", "e"].map((id) => seasonObjective(strengths, id)!.kind)).toEqual(["TOP_FOUR", "TOP_FOUR", "TOP_FOUR"]);
    expect(["f", "g", "h"].map((id) => seasonObjective(strengths, id)!.targetPosition)).toEqual([6, 6, 6]);
    expect(seasonObjective(strengths, "c")).toMatchObject({ label: "Finish in the top four", reason: "The board rates this squad 3rd of 8 on its best eleven." });
    expect(seasonObjective(strengths, "nobody")).toBeNull();
  });

  test("before a ball is bowled the status is the season ahead", () => {
    expect(status("c", [["a", 0, 0], ["b", 0, 0], ["c", 0, 0], ["d", 0, 0], ["e", 0, 0]])).toMatchObject({ kind: "NOT_STARTED", sentence: "14 rounds to play." });
  });

  test("inside the target: ahead with a four-point cushion, otherwise on track", () => {
    const rows: [string, number, number][] = [["a", 6, 12], ["c", 6, 10], ["b", 6, 8], ["d", 6, 8], ["e", 6, 4], ["f", 6, 2]];
    expect(status("c", rows)).toMatchObject({ kind: "AHEAD", position: 2, sentence: "2nd, 6 points clear of 5th with 8 rounds left." });
    expect(status("d", rows)).toMatchObject({ kind: "AHEAD" });
    expect(status("d", [["a", 6, 12], ["c", 6, 10], ["b", 6, 8], ["d", 6, 8], ["e", 6, 6]])).toMatchObject({ kind: "ON_TRACK", label: "On track" });
  });

  test("outside the target: one win away is on track, further is behind, and beyond the points left is out of reach", () => {
    expect(status("e", [["a", 6, 12], ["b", 6, 10], ["c", 6, 8], ["d", 6, 8], ["e", 6, 6]])).toMatchObject({ kind: "ON_TRACK", sentence: "5th, 1 win from the top four with 8 rounds left." });
    expect(status("e", [["a", 6, 12], ["b", 6, 10], ["c", 6, 10], ["d", 6, 10], ["e", 6, 4]])).toMatchObject({ kind: "BEHIND", sentence: "5th, 3 wins from the top four with 8 rounds left." });
    expect(status("e", [["a", 12, 20], ["b", 12, 18], ["c", 12, 16], ["d", 12, 16], ["e", 12, 10]])).toMatchObject({ kind: "OUT_OF_REACH" });
    expect(status("b", [["a", 4, 8], ["b", 4, 8]])).toMatchObject({ kind: "ON_TRACK", sentence: "2nd, level on points with top spot and 10 rounds left." });
  });

  test("the season ends with a verdict", () => {
    const final: [string, number, number][] = [["c", 14, 24], ["a", 14, 22], ["b", 14, 20], ["d", 14, 16], ["e", 14, 12], ["f", 14, 10], ["g", 14, 6], ["h", 14, 2]];
    expect(status("c", final, true)).toMatchObject({ verdict: "EXCEEDED", verdictLabel: "Objective exceeded", sentence: "Finished 1st. The objective was: Finish in the top four." });
    expect(status("d", final, true)).toMatchObject({ verdict: "MET" });
    expect(status("a", final, true)).toMatchObject({ verdict: "MISSED" });
    expect(status("e", final, true)).toMatchObject({ verdict: "MISSED" });
    expect(status("f", final, true)).toMatchObject({ verdict: "MET" });
  });
});
