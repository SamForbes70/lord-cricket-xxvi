import { describe, expect, it } from "vitest";
import { oppositionWatch, type OppositionWatchInput } from "@lcxxvi/projections";

const names = { a: "Ava", b: "Bea", c: "Cal", d: "Dee" };
const bowl = (runsConceded: number, legalBalls: number, wickets: number, maidens = 0) => ({ runsConceded, legalBalls, wickets, maidens });
const bat = (runs: number, ballsFaced: number, dismissed = false) => ({ runs, ballsFaced, dismissed });
const base: OppositionWatchInput = { format: "T20", playerSide: "BATTING", batting: {}, bowling: {}, atCrease: [], battingElevenSize: 11, names };

describe("Pavilion B9: opposition watch", () => {
  it("names their most dangerous bowler today and the overs each bowler has left", () => {
    const w = oppositionWatch({ ...base, bowling: { a: bowl(9, 12, 2), b: bowl(20, 18, 1), c: bowl(14, 12, 0) } });
    expect(w.heading).toBe("Their bowling");
    expect(w.headline).toBe("Most dangerous today: Ava, 2-0-9-2, 2 overs left.");
    expect(w.facts).toEqual(["Overs left: Ava 2, Bea 1, Cal 2"]);
  });

  it("breaks a tie on wickets by runs per ball, and says when the danger man has bowled out", () => {
    expect(oppositionWatch({ ...base, bowling: { a: bowl(20, 12, 1), b: bowl(8, 12, 1) } }).headline).toContain("Bea");
    const done = oppositionWatch({ ...base, bowling: { a: bowl(18, 24, 3, 1), b: bowl(30, 18, 1), c: bowl(40, 24, 0) } });
    expect(done.headline).toBe("Ava has bowled out (4-1-18-3): their most dangerous bowler today is done.");
    expect(done.facts).toEqual(["Overs left: Bea 1", "Bowled out: Ava, Cal"]);
  });

  it("has nothing to say before a ball, and says so plainly before a wicket", () => {
    expect(oppositionWatch(base).headline).toBeNull();
    expect(oppositionWatch({ ...base, bowling: { a: bowl(10, 6, 0) } }).headline).toBe("No wickets for their bowlers yet.");
  });

  it("uses the one-day allocation of ten overs", () => {
    expect(oppositionWatch({ ...base, format: "ODI", bowling: { a: bowl(20, 30, 1) } }).headline).toBe("Most dangerous today: Ava, 5-0-20-1, 5 overs left.");
  });

  // As in the real ledger, the batting record lists the whole eleven from the first ball.
  const eleven = (lines: Record<string, ReturnType<typeof bat>>) =>
    ({ ...Object.fromEntries([..."abcdefghijk"].map((id) => [id, bat(0, 0)])), ...lines });

  it("when the player bowls: their set batter, batters still to come and their top score so far", () => {
    const w = oppositionWatch({ ...base, playerSide: "BOWLING", atCrease: ["c", "d"],
      batting: eleven({ a: bat(30, 20, true), b: bat(4, 6, true), c: bat(22, 15), d: bat(3, 2) }) });
    expect(w.heading).toBe("Their batting");
    expect(w.headline).toBe("Set batter: Cal, 22 from 15 balls.");
    expect(w.facts).toEqual(["7 batters still to come", "Top score so far: Ava 30, out"]);
  });

  it("counts the whole eleven before a ball, a new batter who has not faced yet, and the last pair", () => {
    expect(oppositionWatch({ ...base, playerSide: "BOWLING", atCrease: ["a", "b"], batting: eleven({}) }).facts[0]).toBe("9 batters still to come");
    const lastPair = oppositionWatch({ ...base, playerSide: "BOWLING", atCrease: ["j", "k"],
      batting: eleven(Object.fromEntries([..."abcdefghi"].map((id) => [id, bat(1, 1, true)]))) });
    expect(lastPair.headline).toBeNull();
    expect(lastPair.facts[0]).toBe("No batters left to come");
  });
});
