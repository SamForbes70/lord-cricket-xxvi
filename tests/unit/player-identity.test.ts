import { describe, expect, test } from "vitest";
import type { T20SeasonMatchCompletion } from "@lcxxvi/contracts";
import { playerForm, playerMilestones, squadPlayerTags, type IdentityPlayer, type IdentitySkills } from "@lcxxvi/projections";

const flat = (value: number): IdentitySkills => ({
  defence: value, timing: value, power: value, rotation: value, vsPace: value, vsSpin: value, control: value, movement: value,
  variation: value, stamina: value, catching: value, groundFielding: value, throwing: value, keeping: value,
});
const player = (playerId: string, role: string, skills: Partial<IdentitySkills>, base = 40): IdentityPlayer =>
  ({ playerId, role, bowlingCapable: role === "BOWLER" || role === "ALLROUNDER", skills: { ...flat(base), ...skills } });

describe("player tags", () => {
  const squad = [
    player("hitter", "BATTER", { power: 82, rotation: 70 }),
    player("anchor", "BATTER", { defence: 76, timing: 74 }),
    player("keeper", "KEEPER", { keeping: 80, catching: 71 }),
    player("seamer", "BOWLER", { control: 77, movement: 72, stamina: 68 }),
    player("batter-who-cannot-bowl", "BATTER", { control: 90 }),
    player("fourth-best-power", "BATTER", { power: 66 }),
    player("second-power", "ALLROUNDER", { power: 70 }),
    player("third-power", "BATTER", { power: 68 }),
    player("plain", "BATTER", {}),
  ];
  const tags = squadPlayerTags(squad);
  const labels = (id: string) => tags[id]!.map((tag) => tag.label);

  test("tags come from the highest skills, at most two each, strongest first", () => {
    expect(labels("hitter")).toEqual(["Power hitter", "Strike rotator"]);
    expect(labels("anchor")).toEqual(["Anchor"]);
    expect(labels("keeper")).toEqual(["Glovesman", "Safe hands"]);
    expect(labels("seamer")).toEqual(["Metronome", "Moves it"]);
    expect(tags.hitter![0]).toEqual({ id: "POWER_HITTER", label: "Power hitter", value: 82 });
  });
  test("a tag needs the skill at 65 or more and a place in the squad's top three", () => {
    expect(labels("second-power")).toEqual(["Power hitter"]);
    expect(labels("third-power")).toEqual(["Power hitter"]);
    expect(labels("fourth-best-power")).toEqual([]);
    expect(labels("plain")).toEqual([]);
  });
  test("bowling tags are only for players who bowl, and the keeping tag only for keepers", () => {
    expect(labels("batter-who-cannot-bowl")).toEqual([]);
    expect(squadPlayerTags([player("not-a-keeper", "BATTER", { keeping: 90 })])["not-a-keeper"]).toEqual([]);
  });
  test("the result does not depend on squad order", () => {
    expect(squadPlayerTags([...squad].reverse())).toEqual(tags);
  });
});

function completion(roundNumber: number, batting: Record<string, [runs: number, balls: number, out: boolean]>, bowling: Record<string, [wickets: number, runs: number]>): T20SeasonMatchCompletion {
  const bat = Object.fromEntries(Object.entries(batting).map(([id, [runs, ballsFaced, dismissed]]) => [id, { runs, ballsFaced, fours: 0, sixes: 0, dismissed }]));
  const bowl = Object.fromEntries(Object.entries(bowling).map(([id, [wickets, runsConceded]]) => [id, { wickets, runsConceded, legalBalls: 24, maidens: 0 }]));
  return { fixtureId: `f${roundNumber}`, roundNumber, fixtureOrdinal: roundNumber, scorecard: { innings: [{ batting: bat, bowling: {} }, { batting: {}, bowling: bowl }] } } as unknown as T20SeasonMatchCompletion;
}

describe("player form", () => {
  test("a batter's last five scores, oldest first, with a rising trend", () => {
    const matches = [[4, true], [10, true], [12, true], [9, true], [35, true], [41, false]].map(([runs, out], index) =>
      completion(index + 1, { b: [runs as number, 20, out as boolean] }, {}));
    const form = playerForm([...matches].reverse(), "b");
    expect(form).toMatchObject({ discipline: "BATTING", trend: "UP", text: "10, 12, 9, 35, 41*" });
    expect(form.entries.map((entry) => entry.roundNumber)).toEqual([2, 3, 4, 5, 6]);
  });
  test("a bowler's figures and a falling trend; too few matches gives no trend", () => {
    const matches = [[3, 20], [2, 18], [3, 25], [0, 40], [1, 33]].map(([wickets, runs], index) => completion(index + 1, {}, { w: [wickets!, runs!] }));
    expect(playerForm(matches, "w")).toMatchObject({ discipline: "BOWLING", trend: "DOWN", text: "3/20, 2/18, 3/25, 0/40, 1/33" });
    expect(playerForm(matches.slice(0, 2), "w")).toMatchObject({ trend: null, text: "3/20, 2/18" });
  });
  test("a player who has not appeared has no form", () => {
    expect(playerForm([completion(1, { other: [5, 5, true] }, {})], "b")).toEqual({ entries: [], trend: null, discipline: null, text: "" });
  });
  test("a duck counts as an innings", () => {
    expect(playerForm([completion(1, { b: [0, 0, true] }, {})], "b").text).toBe("0");
  });
});

describe("milestones", () => {
  test("runs within 50 of a 500 step, wickets within 5 of a 25 step, and a 50th appearance", () => {
    expect(playerMilestones({ runs: 966, wickets: 21, matches: 49 }).map((m) => m.text)).toEqual([
      "34 runs from 1000 career runs", "4 wickets from 25 career wickets", "Next match is appearance number 50",
    ]);
    expect(playerMilestones({ runs: 449, wickets: 19, matches: 12 })).toEqual([]);
    expect(playerMilestones({ runs: 499, wickets: 24, matches: 0 }).map((m) => m.text)).toEqual(["1 run from 500 career runs", "1 wicket from 25 career wickets"]);
    expect(playerMilestones({ runs: 500, wickets: 25, matches: 50 })).toEqual([]);
  });
});
