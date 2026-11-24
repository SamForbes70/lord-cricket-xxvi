import { describe, expect, it } from "vitest";
import { routinePickMoment } from "../../apps/web/src/match/routine-picks.js";

const t20 = (decision: "BATTER" | "BOWLER", legalBalls: number, wickets = 0, runsNeeded: number | null = null) =>
  routinePickMoment({ format: "T20", decision, legalBalls, wickets, runsNeeded });

describe("Pavilion B2: routine picks and key moments", () => {
  it("asks the player for the openers, the opening bowler and the first over after the powerplay", () => {
    expect(t20("BATTER", 0).key).toBe(true);
    expect(t20("BOWLER", 0).key).toBe(true);
    expect(t20("BOWLER", 36).key).toBe(true);
  });

  it("makes middle-overs picks for the player", () => {
    expect(t20("BOWLER", 6).key).toBe(false);
    expect(t20("BOWLER", 60).key).toBe(false);
    expect(t20("BATTER", 40, 2).key).toBe(false);
  });

  it("asks at the death, for the lower order and in a tight chase", () => {
    expect(t20("BOWLER", 90).key).toBe(true);
    expect(t20("BATTER", 100, 2).key).toBe(true);
    expect(t20("BATTER", 40, 5).key).toBe(true);
    // 60 needed off 36 balls is 10 an over: tight. 30 off 60 is 3 an over: routine.
    expect(t20("BOWLER", 84, 3, 60).key).toBe(true);
    expect(t20("BOWLER", 60, 3, 30).key).toBe(false);
  });

  it("uses the one-day shape and never automates red-ball choices", () => {
    expect(routinePickMoment({ format: "ODI", decision: "BOWLER", legalBalls: 60, wickets: 0, runsNeeded: null }).key).toBe(true);
    expect(routinePickMoment({ format: "ODI", decision: "BOWLER", legalBalls: 120, wickets: 0, runsNeeded: null }).key).toBe(false);
    expect(routinePickMoment({ format: "ODI", decision: "BOWLER", legalBalls: 240, wickets: 0, runsNeeded: null }).key).toBe(true);
    expect(routinePickMoment({ format: "RED_BALL", decision: "BOWLER", legalBalls: 120, wickets: 0, runsNeeded: null }).key).toBe(true);
  });

  it("asks for 7 of the 20 bowler choices in a T20 innings with no chase pressure", () => {
    const asked = Array.from({ length: 20 }, (_, over) => t20("BOWLER", over * 6).key).filter(Boolean).length;
    expect(asked).toBe(7);
  });
});
