import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  PLAYER_IDENTITY_RULES,
  PLAYER_IDENTITY_V3_RULES,
  PLAYER_IDENTITY_V3_VERSION,
  liveMilestone,
  matchIntroductionV2,
  matchIntroductionV3,
  type CareerIntroRecord,
  type PlayingStyle,
} from "@lcxxvi/projections";
import {
  careerIntroFor,
  handOverCareerIntro,
  requestInspectPlayer,
  takeInspectPlayer,
} from "../../apps/web/src/match/career-intro-handoff.js";

// LC_PLAYER_IDENTITY_V3 (docs/pavilion/PLAYER_IDENTITY_V3.md).
const root = resolve(import.meta.dirname, "../..");

const anchor: PlayingStyle = { id: "ANCHOR", label: "Anchor", discipline: "BATTING", basis: [{ skill: "defence", label: "defence", value: 70 }] };
const seamer: PlayingStyle = { id: "LINE_AND_LENGTH", label: "Line-and-length seamer", discipline: "BOWLING", basis: [{ skill: "control", label: "control", value: 71 }] };

const record = (over: Partial<CareerIntroRecord> = {}): CareerIntroRecord => ({
  playerId: "p1", matches: 20, battingInnings: 18, runs: 0, highScore: { runs: 77, notOut: true }, fifties: 3, hundreds: 0,
  bowlingLegalBalls: 240, bowlingInnings: 12, wickets: 0, bestBowling: { wickets: 4, runs: 19 }, recentBatting: ["9", "41*", "30"],
  recentBowling: ["1/20", "0/31", "2/18"], ...over,
});

const numbers = (text: string) => [...text.matchAll(/\d+/g)].map((m) => m[0]);
const supported = (facts: { value: number | string }[]) => new Set(facts.flatMap((f) => numbers(String(f.value))));

describe("live milestone", () => {
  test("a runs milestone within the threshold, from the pre-match record plus this innings", () => {
    const live = liveMilestone(record({ runs: 480 }), "BATTER", { runs: 12 });
    expect(live).toMatchObject({ kind: "RUNS", state: "CLOSE", target: 500, needed: 8, before: 480, inMatch: 12 });
    expect(live!.visible).toBe("8 more for 500 league runs");
    expect(live!.sentence).toBe("League runs: 480 before this match, 12 in this innings, 492 in all. 8 runs short of 500.");
  });

  test("one run or one wicket short reads 'One more'", () => {
    expect(liveMilestone(record({ runs: 490 }), "BATTER", { runs: 9 })!.visible).toBe("One more for 500 league runs");
    expect(liveMilestone(record({ wickets: 23 }), "BOWLER", { wickets: 1 })!.visible).toBe("One more for 25 league wickets");
    expect(liveMilestone(record({ wickets: 24 }), "BOWLER", { wickets: 0 })!.sentence).toContain("One wicket short of 25.");
  });

  test("nothing is shown outside the thresholds", () => {
    const runsEdge = 500 - PLAYER_IDENTITY_V3_RULES.liveRunsWithin;
    expect(liveMilestone(record({ runs: runsEdge - 1 }), "BATTER", { runs: 0 })).toBeNull();
    expect(liveMilestone(record({ runs: runsEdge - 5 }), "BATTER", { runs: 5 })!.needed).toBe(PLAYER_IDENTITY_V3_RULES.liveRunsWithin);
    const wicketsEdge = 25 - PLAYER_IDENTITY_V3_RULES.liveWicketsWithin;
    expect(liveMilestone(record({ wickets: wicketsEdge - 1 }), "BOWLER", { wickets: 0 })).toBeNull();
    expect(liveMilestone(record({ wickets: wicketsEdge }), "BOWLER", { wickets: 0 })!.visible).toBe("2 more for 25 league wickets");
    // A new player with few runs is far from any milestone.
    expect(liveMilestone(record({ runs: 41 }), "BATTER", { runs: 30 })).toBeNull();
  });

  test("a milestone passed in this innings stays as reached; one passed before the match does not", () => {
    const reached = liveMilestone(record({ runs: 495 }), "BATTER", { runs: 17 });
    expect(reached).toMatchObject({ state: "REACHED", target: 500, needed: 0 });
    expect(reached!.visible).toBe("Reached 500 league runs");
    expect(reached!.sentence).toBe("League runs: 495 before this match, 17 in this innings, 512 in all. Reached 500 league runs in this innings.");
    expect(liveMilestone(record({ runs: 499 }), "BATTER", { runs: 1 })!.state).toBe("REACHED");
    expect(liveMilestone(record({ wickets: 24 }), "BOWLER", { wickets: 2 })!.visible).toBe("Reached 25 league wickets");
    // Already at 500 before the match: not reached here, and 1000 is far away.
    expect(liveMilestone(record({ runs: 500 }), "BATTER", { runs: 40 })).toBeNull();
    expect(liveMilestone(record({ wickets: 25 }), "BOWLER", { wickets: 3 })).toBeNull();
    expect(liveMilestone(record({ runs: 990 }), "BATTER", { runs: 3 })!.visible).toBe("7 more for 1000 league runs");
  });

  test("runs and wickets are separate: a bowler's chip reads wickets only", () => {
    expect(liveMilestone(record({ runs: 495, wickets: 3 }), "BOWLER", { wickets: 0 })).toBeNull();
    expect(liveMilestone(record({ runs: 3, wickets: 24 }), "BATTER", { runs: 0 })).toBeNull();
  });

  test("no record, no line or a malformed line gives nothing", () => {
    expect(liveMilestone(null, "BATTER", { runs: 10 })).toBeNull();
    expect(liveMilestone(record({ runs: 495 }), "BATTER", null)).toBeNull();
    expect(liveMilestone(record({ runs: 495 }), "BATTER", { wickets: 1 })).toBeNull();
    expect(liveMilestone(record({ runs: 495 }), "BATTER", { runs: -1 })).toBeNull();
    expect(liveMilestone(record({ runs: 495 }), "BATTER", { runs: 1.5 })).toBeNull();
  });

  test("every number shown is a listed fact, and the chip text stays short", () => {
    for (let before = 0; before <= 2_100; before += 7) {
      for (const inMatch of [0, 1, 4, 9, 23, 61]) {
        for (const kind of ["BATTER", "BOWLER"] as const) {
          const scaled = kind === "BATTER" ? before : Math.floor(before / 20);
          const line = kind === "BATTER" ? { runs: inMatch } : { wickets: Math.min(inMatch, 10) };
          const live = liveMilestone(record({ runs: scaled, wickets: scaled }), kind, line);
          if (!live) continue;
          const allowed = supported(live.facts);
          for (const n of numbers(`${live.visible} ${live.sentence}`)) expect(allowed.has(n), `${n} in ${live.sentence}`).toBe(true);
          expect(live.visible.length).toBeLessThanOrEqual(32);
          expect(live.visible).toMatch(/^(One more|\d+ more) for \d+ league (runs|wickets)$|^Reached \d+ league (runs|wickets)$/);
        }
      }
    }
  });

  test("milestones use the E6 steps", () => {
    expect(PLAYER_IDENTITY_RULES.runsStep).toBe(500);
    expect(PLAYER_IDENTITY_RULES.wicketsStep).toBe(25);
    expect(PLAYER_IDENTITY_V3_VERSION).toBe("LC_PLAYER_IDENTITY_V3");
  });
});

describe("match introduction V3", () => {
  test("before the first ball it is the V2 introduction unchanged", () => {
    const rec = record({ runs: 495 });
    const v2 = matchIntroductionV2("Vero Jorcroft", anchor, "BATTER", rec, true);
    const v3 = matchIntroductionV3("Vero Jorcroft", anchor, "BATTER", rec, true, { runs: 0 });
    expect({ ...v3, live: undefined }).toEqual({ ...v2, live: undefined });
    expect(v3.live).toBeNull();
    expect(v3.visible).toBe("Walks out: 5 from 500 runs");
  });

  test("after the first ball: the live milestone when close, otherwise the style alone", () => {
    const close = matchIntroductionV3("Vero Jorcroft", anchor, "BATTER", record({ runs: 480 }), false, { runs: 14 });
    expect(close.visible).toBe("6 more for 500 league runs");
    expect(close.sentence.endsWith("6 runs short of 500.")).toBe(true);
    const far = matchIntroductionV3("Vero Jorcroft", anchor, "BATTER", record({ runs: 300 }), false, { runs: 14 });
    expect(far.visible).toBe("Anchor");
    expect(far).toEqual({ ...matchIntroductionV2("Vero Jorcroft", anchor, "BATTER", record({ runs: 300 }), false), live: null });
    const bowler = matchIntroductionV3("Talor Elmholt", seamer, "BOWLER", record({ wickets: 23 }), false, { wickets: 1 });
    expect(bowler.visible).toBe("One more for 25 league wickets");
  });

  test("without a career record (exhibitions, tournaments, tours, auctions) the chip is unchanged", () => {
    const v3 = matchIntroductionV3("Vero Jorcroft", anchor, "BATTER", null, false, { runs: 499 });
    expect(v3.source).toBe("STYLE_ONLY");
    expect(v3.visible).toBe("Anchor");
    expect(v3.live).toBeNull();
  });

  test("deterministic: no clock and no Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const a = matchIntroductionV3("A", anchor, "BATTER", record({ runs: 492 }), false, { runs: 3 });
    const b = matchIntroductionV3("A", anchor, "BATTER", record({ runs: 492 }), false, { runs: 3 });
    expect(a).toEqual(b);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  test("the module imports nothing from the simulation, its random stream or the probability tables", () => {
    const text = readFileSync(resolve(root, "packages/projections/src/player-identity-v3.ts"), "utf8");
    const imports = [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./player-identity.js", "./player-identity-v1.js", "./player-identity-v2.js"]);
  });
});

describe("handoff", () => {
  test("the player page request is taken once and lives in memory only", () => {
    expect(takeInspectPlayer()).toBeNull();
    requestInspectPlayer({ playerId: "p9", origin: "STATISTICS" });
    expect(takeInspectPlayer()).toEqual({ playerId: "p9", origin: "STATISTICS" });
    expect(takeInspectPlayer()).toBeNull();
    const source = readFileSync(resolve(root, "apps/web/src/match/career-intro-handoff.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/sessionStorage|localStorage|indexedDB/);
  });

  test("the V2 summary handover is unchanged", () => {
    handOverCareerIntro({ version: "LC_PLAYER_IDENTITY_V2", matchGameId: "g1", players: {} });
    expect(careerIntroFor("g1")?.matchGameId).toBe("g1");
    expect(careerIntroFor("g2")).toBeNull();
    handOverCareerIntro(null);
  });
});
