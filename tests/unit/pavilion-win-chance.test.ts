import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t20ChaseWinChance, t20ChaseWinChanceRaw } from "@lcxxvi/projections";

/** Pavilion B9: a T20 chase's win chance from the game's own model, rounded so it claims no false precision. */
describe("Pavilion B9: T20 chase win chance", () => {
  it("is decided at the ends and a multiple of 5 between 5 and 95 while the chase is open", () => {
    expect(t20ChaseWinChance(0, 4, 90)).toBe(100);
    expect(t20ChaseWinChance(12, 10, 100)).toBe(0);
    expect(t20ChaseWinChance(3, 4, 120)).toBe(0);
    for (const [need, wkts, balls] of [[84, 0, 0], [40, 3, 84], [60, 3, 84], [10, 8, 108], [1, 9, 119], [200, 0, 0]] as const) {
      const c = t20ChaseWinChance(need, wkts, balls)!;
      expect(c % 5).toBe(0);
      expect(c).toBeGreaterThanOrEqual(5);
      expect(c).toBeLessThanOrEqual(95);
    }
  });

  it("falls as more runs are needed from the same point, and rises as balls are used well", () => {
    const needs = [20, 30, 40, 50, 60].map((n) => t20ChaseWinChanceRaw(n, 3, 84)!);
    expect([...needs].sort((a, b) => b - a)).toEqual(needs);
    expect(t20ChaseWinChanceRaw(30, 3, 90)!).toBeGreaterThan(t20ChaseWinChanceRaw(40, 3, 84)!);
  });

  it("is close to an even contest at the start of a chase of the model's average total", () => {
    // Table V3 (the suggested eleven): the model's mean first innings is 103.8 runs, so a target of 105.
    expect(t20ChaseWinChance(105, 0, 0)).toBeGreaterThanOrEqual(40);
    expect(t20ChaseWinChance(105, 0, 0)).toBeLessThanOrEqual(60);
  });

  it("ships with its recorded evaluation: better than the base rate on the corpus chases", () => {
    const evaluation = JSON.parse(readFileSync("docs/pavilion/b9/win-chance-evaluation.json", "utf8"));
    expect(evaluation.chases).toBe(100);
    expect(evaluation.brier.raw).toBeLessThan(evaluation.brier.baseRate);
  });
});
