import { describe, expect, it } from "vitest";
import { overContext, type OverContextInput } from "../../packages/projections/src/commentary-context.js";

const over = (runs: number, wickets = 0) => ({ runs, wickets });
const base: OverContextInput = {
  format: "T20", overs: [over(6), over(7), over(5), over(8)], runs: 26, legalBalls: 24, targetToWin: null,
  bowlerName: "Isen Kelholt", bowlerFigures: "2-0-14-1", bowlerLegalBalls: 12, ballsSinceBoundary: 3,
};

describe("Pavilion P07: over context", () => {
  it("says nothing on an ordinary over", () => {
    expect(overContext(base)).toBeNull();
  });

  it("notes a bowler bowling out, before anything else", () => {
    expect(overContext({ ...base, bowlerLegalBalls: 24, bowlerFigures: "4-0-18-3", overs: [...base.overs, over(3, 3)] }))
      .toEqual({ slot: "bowledOut", text: "Isen Kelholt bowls out: 4-0-18-3." });
  });

  it("calls a collapse: three or more wickets in the last four overs, when this over took one", () => {
    expect(overContext({ ...base, overs: [over(9), over(4, 1), over(3, 1), over(2), over(2, 1)], runs: 20, legalBalls: 30 }))
      .toEqual({ slot: "collapse", text: "3 wickets for 11 runs in the last 4 overs." });
    // The same window without a wicket in the latest over is not called again.
    expect(overContext({ ...base, overs: [over(4, 1), over(3, 1), over(2, 1), over(5)], runs: 14 })).toBeNull();
    // Nor is it called again while the previous window already held three wickets.
    expect(overContext({ ...base, overs: [over(4, 1), over(3, 1), over(2, 1), over(5, 1)], runs: 14 })).toBeNull();
  });

  it("marks the start of the death overs in both formats", () => {
    expect(overContext({ ...base, legalBalls: 90, overs: Array.from({ length: 15 }, () => over(5)) })!.text).toBe("Into the death overs.");
    expect(overContext({ ...base, format: "ODI", legalBalls: 240, overs: Array.from({ length: 40 }, () => over(5)) })!.text).toBe("Into the death overs.");
  });

  it("tracks the asking rate crossing 9 and 12 an over, and falling back under 9", () => {
    const chase = (runs: number, legalBalls: number, lastRuns: number) =>
      overContext({ ...base, targetToWin: 151, runs, legalBalls, overs: [over(5), over(5), over(lastRuns)] });
    // Before: 151 - 95 = 56 off 42 (8.0). After a 2-run over: 54 off 36 (9.0).
    expect(chase(97, 84, 2)).toEqual({ slot: "askingRate", text: "The asking rate is up to 9.0 an over." });
    // Before: 151 - 77 = 74 off 42 (10.6). After a 2-run over: 72 off 36 (12.0).
    expect(chase(79, 84, 2)!.text).toBe("The asking rate is up to 12.0 an over.");
    // Before: 151 - 82 = 69 off 42 (9.9). After an 18-run over: 51 off 36 (8.5).
    expect(chase(100, 84, 18)!.text).toBe("The asking rate is back under 9 an over, at 8.5.");
    // The start of the death overs takes priority over the asking rate.
    expect(chase(91, 90, 1)!.text).toBe("Into the death overs.");
  });

  it("names the most expensive over of the innings, from the third over on", () => {
    expect(overContext({ ...base, overs: [over(6), over(7), over(15)], runs: 28, legalBalls: 18 })!.slot).toBe("expensiveOver");
    expect(overContext({ ...base, overs: [over(6), over(15)], runs: 21, legalBalls: 12 })).toBeNull();
    expect(overContext({ ...base, overs: [over(6), over(15), over(15)], runs: 36, legalBalls: 18 })).toBeNull();
  });

  it("notes a boundary drought as it passes 24 balls, and each 12 after", () => {
    expect(overContext({ ...base, ballsSinceBoundary: 24 })!.text).toBe("No boundary for 24 balls.");
    expect(overContext({ ...base, ballsSinceBoundary: 27 })!.text).toBe("No boundary for 27 balls.");
    expect(overContext({ ...base, ballsSinceBoundary: 30 })).toBeNull();
    expect(overContext({ ...base, ballsSinceBoundary: 36 })!.text).toBe("No boundary for 36 balls.");
  });

  it("stays silent in red-ball matches", () => {
    expect(overContext({ ...base, format: "RED_BALL", ballsSinceBoundary: 24 })).toBeNull();
  });
});

import { inningsSummary, wicketContext, type WicketContextInput } from "../../packages/projections/src/commentary-context.js";

describe("Pavilion P07: wicket context", () => {
  const w: WicketContextInput = { format: "T20", standRuns: 12, standBalls: 10, runs: 60, wickets: 3, legalBalls: 54, targetToWin: null };

  it("names a broken stand of 30 or more first", () => {
    expect(wicketContext({ ...w, standRuns: 43, standBalls: 31, targetToWin: 150 })).toEqual({ slot: "standBroken", text: "That breaks a stand of 43 from 31 balls." });
  });

  it("in a tight chase, gives the new batter's equation; early in an easy chase, says nothing", () => {
    expect(wicketContext({ ...w, targetToWin: 106, runs: 60, legalBalls: 90 })!.text).toBe("The new batter comes in with 46 needed from 30 balls.");
    // 70 needed from 42 balls is 10 an over: tight even before the last 36 balls.
    expect(wicketContext({ ...w, targetToWin: 130, runs: 60, legalBalls: 78 })!.slot).toBe("newBatterTask");
    // 47 needed from 92 balls early in the chase: nothing.
    expect(wicketContext({ ...w, targetToWin: 107, runs: 60, legalBalls: 28 })).toBeNull();
  });

  it("late in an innings, counts the wickets left", () => {
    expect(wicketContext({ ...w, wickets: 7 })!.text).toBe("3 wickets left.");
    expect(wicketContext({ ...w, wickets: 9 })!.text).toBe("1 wicket left.");
    expect(wicketContext({ ...w, wickets: 6 })).toBeNull();
  });

  it("says nothing once the innings or the chase is over, or in red-ball matches", () => {
    expect(wicketContext({ ...w, wickets: 10 })).toBeNull();
    expect(wicketContext({ ...w, legalBalls: 120 })).toBeNull();
    expect(wicketContext({ ...w, targetToWin: 60 })).toBeNull();
    expect(wicketContext({ ...w, format: "RED_BALL", standRuns: 80 })).toBeNull();
  });
});

describe("Pavilion P07: innings summary", () => {
  const names = { a: "Ava", b: "Bea", x: "Xan", y: "Yul" };
  it("gives the top score and best bowling, breaking ties by balls and runs", () => {
    const batters = new Map([["a", { runs: 34, ballsFaced: 28 }], ["b", { runs: 34, ballsFaced: 25 }]]);
    const bowlers = new Map([["x", { wickets: 3, runsConceded: 18, legalBalls: 24 }], ["y", { wickets: 3, runsConceded: 12, legalBalls: 18 }]]);
    expect(inningsSummary({ format: "T20", batters, bowlers, names })).toBe("Top score: Bea 34 (25). Best bowling: Yul 3-12.");
  });

  it("leaves out what did not happen, and stays silent in red-ball matches", () => {
    expect(inningsSummary({ format: "ODI", batters: new Map([["a", { runs: 10, ballsFaced: 12 }]]), bowlers: new Map([["x", { wickets: 0, runsConceded: 30, legalBalls: 36 }]]), names })).toBe("Top score: Ava 10 (12).");
    expect(inningsSummary({ format: "T20", batters: new Map(), bowlers: new Map(), names })).toBeNull();
    expect(inningsSummary({ format: "RED_BALL", batters: new Map([["a", { runs: 10, ballsFaced: 12 }]]), bowlers: new Map(), names })).toBeNull();
  });
});
