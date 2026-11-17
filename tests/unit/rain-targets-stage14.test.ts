import { describe, expect, it } from "vitest";
import { RESOURCE_TABLE_AVERAGE_SCORE, resourcesRemaining } from "@lcxxvi/data";
import { inningsResources, parAtStoppage, parScore, revisedTarget } from "@lcxxvi/simulation";

// Stage 14 rain-revised targets: the fictional resource table and target arithmetic (owner decision 2a).
// No engine uses them yet; the frozen ledger cannot represent a shortened innings (see the PR).

describe("LC_RESOURCE_TABLE_01", () => {
  it("is a full innings at the start, nothing when out of balls or wickets, and monotonic", () => {
    for (const format of ["T20", "ODI"] as const) {
      const max = format === "T20" ? 120 : 300;
      expect(resourcesRemaining(format, max, 0)).toBe(10000);
      expect(resourcesRemaining(format, 0, 0)).toBe(0);
      expect(resourcesRemaining(format, max, 10)).toBe(0);
      for (let w = 0; w < 10; w += 1)
        for (let b = 1; b <= max; b += 1) {
          expect(resourcesRemaining(format, b, w)).toBeGreaterThanOrEqual(resourcesRemaining(format, b - 1, w));
          if (w > 0) expect(resourcesRemaining(format, b, w)).toBeLessThanOrEqual(resourcesRemaining(format, b, w - 1));
        }
      expect(() => resourcesRemaining(format, max + 1, 0)).toThrow("RESOURCE_INPUT_INVALID");
    }
  });
});

describe("Rain-revised targets", () => {
  it("leaves an uninterrupted chase at runs plus one", () => {
    const full = inningsResources("ODI", 300, []);
    expect(full).toBe(10000);
    expect(revisedTarget("ODI", 250, full, full)).toBe(251);
  });

  it("scales the target down when the side batting second loses overs", () => {
    const first = inningsResources("ODI", 300, []);
    const second = inningsResources("ODI", 120, []); // a 20-over chase from the start
    expect(second).toBe(resourcesRemaining("ODI", 120, 0));
    expect(revisedTarget("ODI", 250, first, second)).toBe(Math.floor((250 * second) / first) + 1);
    expect(revisedTarget("ODI", 250, first, second)).toBeLessThan(251);
  });

  it("charges an interruption by the resources it took away", () => {
    // 10 overs lost after 20 overs with 3 down.
    const r = inningsResources("ODI", 300, [{ ballsBowled: 120, wicketsLost: 3, ballsLost: 60 }]);
    const lost = resourcesRemaining("ODI", 180, 3) - resourcesRemaining("ODI", 120, 3);
    expect(r).toBe(10000 - lost);
    expect(() => inningsResources("ODI", 300, [{ ballsBowled: 301, wicketsLost: 0, ballsLost: 0 }])).toThrow("RAIN_INTERRUPTION_INVALID");
  });

  it("gives extra runs from the fictional average score when the chasing side has more resources", () => {
    // First innings cut short at 40 overs with 2 down; the chase has the full 50.
    const first = inningsResources("ODI", 300, [{ ballsBowled: 240, wicketsLost: 2, ballsLost: 60 }]);
    const second = inningsResources("ODI", 300, []);
    expect(second).toBeGreaterThan(first);
    expect(parScore("ODI", 200, first, second)).toBe(200 + Math.floor((RESOURCE_TABLE_AVERAGE_SCORE.ODI * (second - first)) / 10000));
  });

  it("works out par at a stoppage from the resources used so far", () => {
    const par = parAtStoppage({ format: "T20", firstInningsRuns: 160, firstResources: 10000, secondResourcesAvailable: 10000, ballsLeft: 60, wicketsLost: 2 });
    const used = 10000 - resourcesRemaining("T20", 60, 2);
    expect(par).toBe(Math.floor((160 * used) / 10000));
  });
});
