import { describe, expect, test } from "vitest";
import { matchSituation, type MatchSituationInput } from "@lcxxvi/projections";

const base: MatchSituationInput = { format: "T20", runs: 0, wickets: 0, legalBalls: 0, targetToWin: null, lastWicket: null, partnershipKnown: true, matchComplete: false };
const at = (overrides: Partial<MatchSituationInput>) => matchSituation({ ...base, ...overrides });

describe("match situation", () => {
  test("first innings: rate, the model's likely total and partnership from the board", () => {
    const s = at({ runs: 84, wickets: 2, legalBalls: 60, lastWicket: { runs: 50, legalBalls: 38 } })!;
    expect(s).toMatchObject({ kind: "FIRST_INNINGS", currentRateX100: 840, projectedTotal: 135, partnership: { runs: 34, balls: 22 }, pressure: null, ballsLeft: 60, wicketsInHand: 8 });
    expect(s.headline).toBe("60 balls left, 8 wickets in hand.");
    expect(s.facts).toEqual(["Run rate 8.40", "Likely total about 135", "Partnership 34 from 22 balls"]);
  });

  test("no projection or pressure reading before two overs are bowled, and no partnership when wickets are unaccounted for", () => {
    expect(at({ runs: 12, legalBalls: 11 })).toMatchObject({ projectedTotal: null, currentRateX100: 655 });
    expect(at({ runs: 12, legalBalls: 12 })).toMatchObject({ projectedTotal: 105 });
    expect(at({ runs: 40, wickets: 3, legalBalls: 30, partnershipKnown: false })!.partnership).toBeNull();
    expect(at({ runs: 5, legalBalls: 6, targetToWin: 150 })!.pressure).toBeNull();
    expect(at({})).toMatchObject({ currentRateX100: null, facts: [] });
  });

  test("a chase states the equation and reads pressure in three steps", () => {
    const control = at({ targetToWin: 150, runs: 110, wickets: 3, legalBalls: 84 })!;
    expect(control.headline).toBe("40 needed from 36 balls, 7 wickets in hand.");
    expect(control).toMatchObject({ kind: "CHASE", runsNeeded: 40, requiredRateX100: 667, currentRateX100: 786, pressure: { level: "IN_CONTROL", label: "In control" } });
    expect(control.facts.slice(0, 2)).toEqual(["Required rate 6.67", "Run rate 7.86"]);
    expect(at({ targetToWin: 150, runs: 100, wickets: 4, legalBalls: 84 })!.pressure).toEqual({ level: "IN_THE_BALANCE", label: "In the balance" });
    expect(at({ targetToWin: 170, runs: 90, wickets: 4, legalBalls: 90 })!.pressure?.level).toBe("UNDER_PRESSURE");
  });

  test("wickets lost beyond five add to the pressure on the same equation", () => {
    const equation = { targetToWin: 160, runs: 104, legalBalls: 84 };
    expect(at({ ...equation, wickets: 5 })!.pressure?.level).toBe("IN_THE_BALANCE");
    expect(at({ ...equation, wickets: 9 })!.pressure?.level).toBe("UNDER_PRESSURE");
  });

  test("singular wording, one-day length, and nothing for finished or five-day matches", () => {
    expect(at({ targetToWin: 150, runs: 149, wickets: 9, legalBalls: 119 })!.headline).toBe("1 needed from 1 ball, 1 wicket in hand.");
    expect(at({ format: "ODI", runs: 100, legalBalls: 120 })).toMatchObject({ ballsLeft: 180, projectedTotal: 250 });
    expect(at({ format: "RED_BALL", runs: 100, legalBalls: 120 })).toBeNull();
    expect(at({ runs: 100, legalBalls: 120, matchComplete: true })).toBeNull();
  });
});
