import { describe, expect, it } from "vitest";
import { keyMomentBetween, type KeyMomentSnapshot } from "../../apps/web/src/match/key-moments.js";

const snap = (over: Partial<KeyMomentSnapshot> = {}): KeyMomentSnapshot => ({
  format: "T20", inningsIndex: 0, runs: 40, wickets: 2, legalBalls: 48, targetToWin: null, batterRuns: { a: 20, b: 10 }, ...over,
});
const names = { a: "Ava", b: "Bea" };

describe("Pavilion B6: key moments", () => {
  it("plays on through an ordinary ball", () => {
    expect(keyMomentBetween(snap(), snap({ runs: 41, legalBalls: 49, batterRuns: { a: 21, b: 10 } }), names)).toBeNull();
  });

  it("stops for a wicket and for a batter's 50 or 100", () => {
    expect(keyMomentBetween(snap(), snap({ wickets: 3, legalBalls: 49 }), names)).toBe("Wicket.");
    expect(keyMomentBetween(snap({ batterRuns: { a: 48, b: 10 } }), snap({ batterRuns: { a: 52, b: 10 } }), names)).toBe("Ava reaches 50.");
    expect(keyMomentBetween(snap({ batterRuns: { a: 98, b: 10 } }), snap({ batterRuns: { a: 100, b: 10 } }), names)).toBe("Ava reaches 100.");
  });

  it("stops as the death overs begin, in both limited-overs formats", () => {
    expect(keyMomentBetween(snap({ legalBalls: 89 }), snap({ legalBalls: 90 }), names)).toBe("The death overs begin.");
    expect(keyMomentBetween(snap({ format: "ODI", legalBalls: 239 }), snap({ format: "ODI", legalBalls: 240 }), names)).toBe("The death overs begin.");
  });

  it("stops when a chase tightens and for its last over, but not once it is won", () => {
    // 50 needed off 36 is 8.3 an over; after a dot ball 50 off 35 is 8.6; then 50 off 33 is 9.1.
    const chase = (runs: number, legalBalls: number) => snap({ inningsIndex: 1, targetToWin: 141, runs, legalBalls });
    expect(keyMomentBetween(chase(91, 84), chase(91, 85), names)).toBeNull();
    expect(keyMomentBetween(chase(91, 86), chase(91, 87), names)).toBe("The chase is tightening.");
    expect(keyMomentBetween(chase(130, 113), chase(131, 114), names)).toBe("Last over of the chase.");
    expect(keyMomentBetween(chase(139, 113), chase(141, 114), names)).toBeNull();
  });

  it("leaves a new innings and red-ball matches to the ordinary stops", () => {
    expect(keyMomentBetween(snap(), snap({ inningsIndex: 1, wickets: 0 }), names)).toBeNull();
    expect(keyMomentBetween(snap({ format: "RED_BALL" }), snap({ format: "RED_BALL", wickets: 3 }), names)).toBeNull();
  });
});
