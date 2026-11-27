import { describe, expect, test } from "vitest";
import { adviseT20Batting, adviseT20BattingV2, adviseT20CaptainV5, adviseT20CaptainV4, battingSkill, TAIL_BELOW, T20_BATTING_POLICY_ID } from "@lcxxvi/ai";

const specialist = { timing: 70, power: 65, defence: 60, rotation: 65 };
const tailender = { timing: 35, power: 40, defence: 30, rotation: 30 };
const view = { inningsLegalBalls: 0, inningsRuns: 0, wicketsLost: 0, targetToWin: null, striker: specialist, partner: specialist };

describe("Pavilion P04 stage B: LC_T20_BATTING_POLICY_V1", () => {
  test("the fixtures are a specialist and a tail-ender", () => {
    expect(battingSkill(specialist)).toBeGreaterThanOrEqual(TAIL_BELOW);
    expect(battingSkill(tailender)).toBeLessThan(TAIL_BELOW);
  });

  test("is deterministic, versioned and always in range", () => {
    const advice = adviseT20Batting(view);
    expect(advice).toEqual(adviseT20Batting(structuredClone(view)));
    expect(advice.policyId).toBe(T20_BATTING_POLICY_ID);
    for (let balls = 0; balls < 120; balls += 7)
      for (let wickets = 0; wickets <= 9; wickets += 1)
        for (const target of [null, 120, 180, 240]) {
          const a = adviseT20Batting({ ...view, inningsLegalBalls: balls, wicketsLost: wickets, inningsRuns: balls, targetToWin: target });
          expect(a.aggression).toBeGreaterThanOrEqual(1);
          expect(a.aggression).toBeLessThanOrEqual(4);
          expect(["NORMAL", "ROTATE", "PROTECT"]).toContain(a.intent);
        }
  });

  test("setting a total: attacks the powerplay with wickets in hand, builds in the middle, goes hard at the death", () => {
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 12 }).aggression).toBe(3);
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 12, wicketsLost: 3 }).aggression).toBe(2);
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 48, wicketsLost: 2 })).toMatchObject({ aggression: 2, intent: "ROTATE" });
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 96, wicketsLost: 4 }).aggression).toBe(4);
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 112, wicketsLost: 8 }).aggression).toBe(4);
  });

  test("protects the innings when few wickets remain with many balls left", () => {
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 60, wicketsLost: 7 }).aggression).toBeLessThanOrEqual(2);
  });

  test("chasing: aggression follows the required rate, eased when few wickets remain", () => {
    const at = (runs: number, balls: number, wickets = 2) => adviseT20Batting({ ...view, inningsLegalBalls: balls, inningsRuns: runs, wicketsLost: wickets, targetToWin: 160 }).aggression;
    expect(at(110, 60)).toBe(1); // 50 from 60 balls
    expect(at(100, 60)).toBe(2); // 60 from 60, 6 an over
    expect(at(80, 60)).toBe(3); // 80 from 60, 8 an over
    expect(at(50, 60)).toBe(4); // 110 from 60
    expect(at(80, 60, 8)).toBe(2); // same rate, two wickets left
    expect(at(150, 114, 9)).toBe(4); // last over, 10 needed from 6
  });

  test("a tail-ender with a recognised batter at the other end rotates the strike instead of slogging", () => {
    const tail = adviseT20Batting({ ...view, inningsLegalBalls: 96, wicketsLost: 7, striker: tailender, partner: specialist });
    expect(tail.aggression).toBeLessThanOrEqual(2);
    expect(tail.intent).toBe("ROTATE");
    // Two tail-enders, or the last two overs: no holding back.
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 110, wicketsLost: 8, striker: tailender, partner: specialist }).aggression).toBe(4);
    expect(adviseT20Batting({ ...view, inningsLegalBalls: 96, wicketsLost: 4, striker: tailender, partner: tailender }).aggression).toBe(4);
  });

  test("works without knowing the batters", () => {
    expect(adviseT20Batting({ ...view, striker: null, partner: null }).aggression).toBe(3);
  });

  test("rejects malformed input", () => {
    expect(() => adviseT20Batting({ ...view, inningsRuns: Number.NaN })).toThrow(/INVALID/);
    expect(() => adviseT20Batting({ ...view, inningsLegalBalls: 121 })).toThrow(/INVALID/);
  });

  test("captain V4, like V3, takes its batting choices from the policy; captain V5 from policy V2", () => {
    const captainView = { inningsLegalBalls: 96, inningsRuns: 90, wicketsLost: 7, targetToWin: null, availableBatters: 3, bowlingCandidates: [], striker: tailender, partner: specialist };
    const v4 = adviseT20CaptainV4(captainView);
    const batting = adviseT20Batting(captainView);
    expect(v4.policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V4");
    expect([v4.aggression, v4.battingIntent]).toEqual([batting.aggression, batting.intent]);
    const v5 = adviseT20CaptainV5(captainView);
    const v2 = adviseT20BattingV2(captainView);
    expect(v5.policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V5");
    expect([v5.aggression, v5.battingIntent]).toEqual([v2.aggression, v2.intent]);
    // Here (over 17, three wickets left, a tail-ender on strike) V1 holds at 2 and V2 attacks at 3.
    expect([batting.aggression, v2.aggression]).toEqual([2, 3]);
  });
});
