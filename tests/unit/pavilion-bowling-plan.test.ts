import { describe, expect, test } from "vitest";
import { canCompleteBowling, feasibleBowlerChoice, type BowlerOvers } from "@lcxxvi/ai";

/** Exhaustive search: can `overs` be bowled with no bowler twice in a row, quotas respected, `previous` not first? */
function bruteForce(overs: number, quotas: number[], previous: number | null): boolean {
  if (overs === 0) return true;
  for (let b = 0; b < quotas.length; b += 1) {
    if (b === previous || quotas[b]! < 1) continue;
    quotas[b]! -= 1;
    const ok = bruteForce(overs - 1, quotas, b);
    quotas[b]! += 1;
    if (ok) return true;
  }
  return false;
}

describe("Pavilion P04: bowling enough to finish the innings", () => {
  test("agrees with an exhaustive search on every small case", () => {
    let checked = 0;
    for (let overs = 0; overs <= 8; overs += 1)
      for (let n = 1; n <= 4; n += 1) {
        const total = 5 ** n;
        for (let code = 0; code < total; code += 1) {
          const quotas = Array.from({ length: n }, (_, i) => Math.floor(code / 5 ** i) % 5);
          for (const previous of [null, ...quotas.keys()]) {
            const bowlers: BowlerOvers[] = quotas.map((q, i) => ({ playerId: `b${i}`, oversLeft: q }));
            const expected = bruteForce(overs, [...quotas], previous);
            expect(canCompleteBowling(overs, bowlers, previous === null ? null : `b${previous}`)).toBe(expected);
            checked += 1;
          }
        }
      }
    expect(checked).toBeGreaterThan(5000);
  });

  test("five bowlers with four overs each can bowl 20 overs, but not if one is spent early", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => ({ playerId: id, oversLeft: 4 }));
    expect(canCompleteBowling(20, five, null)).toBe(true);
    // Overs 1 to 8 alternate a and b: both are bowled out, and c, d, e (12 overs) must cover the last 12. Still possible.
    const afterAB = [{ playerId: "a", oversLeft: 0 }, { playerId: "b", oversLeft: 0 }, ...five.slice(2)];
    expect(canCompleteBowling(12, afterAB, "b")).toBe(true);
    // a, b, c and d bowled out after 16 overs: e alone cannot bowl the last four.
    const onlyE = [...["a", "b", "c", "d"].map((id) => ({ playerId: id, oversLeft: 0 })), { playerId: "e", oversLeft: 4 }];
    expect(canCompleteBowling(4, onlyE, "d")).toBe(false);
  });

  test("keeps the captain's favourite unless that would strand the innings", () => {
    // 3 overs left; a has 2, b has 1; b bowled the last over. a then b then a works; a is the favourite and is kept.
    const bowlers = [{ playerId: "a", oversLeft: 2 }, { playerId: "b", oversLeft: 1 }, { playerId: "c", oversLeft: 0 }];
    expect(feasibleBowlerChoice(["a", "b"], 3, bowlers, "b")).toBe("a");
    // 4 overs left; a and b have 2 each, c has 1; c bowled the last over. Favourite c is not allowed (previous over).
    // Choosing a or b both work, so the first allowed preference, b, is kept.
    expect(feasibleBowlerChoice(["c", "b", "a"], 4, [{ playerId: "a", oversLeft: 2 }, { playerId: "b", oversLeft: 2 }, { playerId: "c", oversLeft: 1 }], "c")).toBe("b");
    // 5 overs left; a has 3, b has 2. The favourite b would leave a needing 3 of the last 4 overs, which is impossible.
    expect(feasibleBowlerChoice(["b", "a"], 5, [{ playerId: "a", oversLeft: 3 }, { playerId: "b", oversLeft: 2 }], null)).toBe("a");
  });

  test("leaves the choice alone when nothing can save the innings", () => {
    expect(feasibleBowlerChoice(["x", "y"], 4, [{ playerId: "x", oversLeft: 1 }, { playerId: "y", oversLeft: 1 }], null)).toBe("x");
  });
});
