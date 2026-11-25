import { describe, expect, it } from "vitest";
import { likelyT20Total, matchSituation, T20_EXPECTATION_TABLE } from "@lcxxvi/projections";

/** Pavilion B7: the likely T20 total comes from the game's own model, not the current run rate. */
describe("Pavilion B7: likely T20 total", () => {
  it("is built from the full 100-innings corpus and starts at the model's mean first-innings total", () => {
    expect(T20_EXPECTATION_TABLE.innings).toBe(100);
    expect(T20_EXPECTATION_TABLE.rows).toHaveLength(20);
    expect(T20_EXPECTATION_TABLE.rows[0]![0]!.n).toBe(100);
    // Table V3 (the suggested eleven): the corpus mean first innings is 103.8 runs; rounded to the nearest 5.
    expect(likelyT20Total(0, 0, 0)).toBe(105);
  });

  it("does not extrapolate a fast start the way a run-rate projection does", () => {
    // 16 for 1 after two overs reads 160 at the current rate; the model expects far fewer.
    expect(Math.round((16 * 120) / 12)).toBe(160);
    expect(likelyT20Total(16, 1, 12)).toBe(110);
  });

  it("rises with runs on the board, rounds to fives, and is the score itself when the innings is over", () => {
    const totals = [60, 70, 80, 90, 100].map((runs) => likelyT20Total(runs, 2, 60)!);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    for (const t of totals) expect(t % 5).toBe(0);
    expect(likelyT20Total(71, 10, 98)).toBe(71);
    expect(likelyT20Total(93, 6, 120)).toBe(93);
  });

  it("is what the match situation shows for a T20, while a one-day innings keeps the run-rate wording", () => {
    const t20 = matchSituation({ format: "T20", runs: 16, wickets: 1, legalBalls: 12, targetToWin: null, lastWicket: null, partnershipKnown: false, matchComplete: false })!;
    expect(t20.facts).toContain("Likely total about 110");
    const odi = matchSituation({ format: "ODI", runs: 100, wickets: 2, legalBalls: 120, targetToWin: null, lastWicket: null, partnershipKnown: false, matchComplete: false })!;
    expect(odi.facts).toContain("On course for 250 at this rate");
  });
});
