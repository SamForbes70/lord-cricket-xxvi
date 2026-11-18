import { describe, expect, it } from "vitest";
import { leavesInningsFinishable, strandingReasons, type BowlerState } from "../../apps/web/src/match/bowler-plan.js";

const b = (id: string, overs: number, eligible = true): BowlerState => ({ id, eligible, legalBalls: overs * 6 });

describe("bowler plan: a person choosing bowlers can always finish the innings", () => {
  it("refuses the pick that strands a five-bowler T20 side, and allows the one that does not", () => {
    // After 13 overs: A 4, B 4, C 3 (bowled over 13), D 2, E 0; the keeper K cannot bowl. Seven overs remain.
    // D now would leave C 1, D 1 and E 4 for six overs, and E cannot bowl four of six without two in a row.
    const bowlers = [b("A", 4), b("B", 4), b("C", 3), b("D", 2), b("E", 0), b("K", 0, false)];
    expect(leavesInningsFinishable("D", bowlers, 7, 24)).toBe(false);
    expect(leavesInningsFinishable("E", bowlers, 7, 24)).toBe(true);
    const reasons = strandingReasons(bowlers, 7, 24);
    expect(reasons.get("D")).toBe("Would leave overs that no one could bowl");
    expect(reasons.has("E")).toBe(false);
    expect(reasons.has("K")).toBe(false);
  });

  it("matches a brute-force search on small cases", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const brute = (choice: string, left: Record<string, number>, n: number): boolean => {
      if (left[choice]! < 1) return false;
      const rest = { ...left, [choice]: left[choice]! - 1 };
      const go = (prev: string, remaining: number, l: Record<string, number>): boolean =>
        remaining === 0 || ids.some((id) => id !== prev && l[id]! > 0 && go(id, remaining - 1, { ...l, [id]: l[id]! - 1 }));
      return go(choice, n - 1, rest);
    };
    for (let seed = 0; seed < 400; seed++) {
      const left: Record<string, number> = {};
      let x = seed * 2654435761;
      for (const id of ids) { x = (x * 1103515245 + 12345) >>> 0; left[id] = x % 5; }
      const n = 1 + (seed % 8);
      const bowlers = ids.map((id) => b(id, 4 - left[id]!));
      for (const choice of ids) expect(leavesInningsFinishable(choice, bowlers, n, 24)).toBe(brute(choice, left, n));
    }
  });

  it("never refuses every choice, so an innings already stuck is left as it was", () => {
    const stuck = [b("A", 4), b("B", 4), b("C", 4), b("D", 4), b("E", 2)];
    expect(strandingReasons(stuck, 3, 24).size).toBe(0);
  });

  it("with six bowlers no first-available order can strand a T20 innings", () => {
    const ids = ["A", "B", "C", "D", "E", "F"];
    const balls: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let prev = "";
    for (let over = 0; over < 20; over++) {
      const bowlers = ids.map((id) => ({ id, eligible: true, legalBalls: balls[id]! }));
      const reasons = strandingReasons(bowlers, 20 - over, 24);
      const pick = ids.find((id) => id !== prev && balls[id]! < 24 && !reasons.has(id));
      expect(pick).toBeDefined();
      balls[pick!]! += 6;
      prev = pick!;
    }
  });

  it("with five bowlers, a first-available order guided by the check finishes the innings", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const balls: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    let prev = "";
    for (let over = 0; over < 20; over++) {
      const bowlers = ids.map((id) => ({ id, eligible: true, legalBalls: balls[id]! }));
      const reasons = strandingReasons(bowlers, 20 - over, 24);
      const pick = ids.find((id) => id !== prev && balls[id]! < 24 && !reasons.has(id));
      expect(pick).toBeDefined();
      balls[pick!]! += 6;
      prev = pick!;
    }
    expect(Object.values(balls).every((v) => v === 24)).toBe(true);
  });
});
