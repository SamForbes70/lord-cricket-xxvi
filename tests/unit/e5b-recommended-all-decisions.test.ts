import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateT20MatchSetup, createT20Session, executeT20Command, fixtureAutopilotStep,
} from "@lcxxvi/simulation";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";
import { recommendDecisions } from "../../apps/web/src/match/recommendation.js";

const world = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));

function fixture() {
  const request = structuredClone(template);
  request.setup.seed = "e5b-recommended-all-fixture-seed";
  return createT20Session(validateT20MatchSetup(request, world, manifest));
}

const innings = { battingTeamId: "BAT", bowlingTeamId: "BOWL", strikerEnd: "NORTH" as const, northBatterId: "s1", southBatterId: "s2" };
const base = { decisionTeamId: "BAT", innings, battingPlans: { s1: { aggression: 1 } }, bowlingPlan: { length: "GOOD", effort: "NORMAL" } };

describe("E5b recommended on every decision", () => {
  test("innings and follow-on choices come from the captain's command", () => {
    expect(recommendDecisions({ ...base, phase: "AWAITING_INNINGS", propose: () => ({ kind: "CHOOSE_INNINGS", payload: { choice: "BOWL" } }) }))
      .toEqual({ innings: "BOWL" });
    expect(recommendDecisions({ ...base, phase: "AWAITING_FOLLOW_ON", propose: () => ({ kind: "CHOOSE_FOLLOW_ON", payload: { enforce: false } }) }))
      .toEqual({ followOn: false });
  });

  test("red-ball declare and new ball are marked only when the captain would do them now", () => {
    const propose = (teamId: string, cats: readonly string[]) =>
      cats[0] === "DECLARATION" && teamId === "BAT" ? { kind: "DECLARE", payload: {} }
        : cats[0] === "NEW_BALL" && teamId === "BOWL" ? { kind: "TAKE_NEW_BALL", payload: {} } : null;
    const r = recommendDecisions({ ...base, phase: "READY", redBall: true, newBallAvailable: true, propose });
    expect(r.declare).toBe(true);
    expect(r.newBall).toBe(true);
    expect(recommendDecisions({ ...base, phase: "READY", redBall: true, newBallAvailable: false, propose }).newBall).toBeUndefined();
    expect(recommendDecisions({ ...base, phase: "READY", propose }).declare).toBeUndefined();
  });

  test("plans: a proposed change is the recommendation, no change means the current plan is, a refusal marks nothing", () => {
    const change = recommendDecisions({ ...base, phase: "READY", propose: (_t, cats) =>
      cats[0] === "BATTING_PLAN" ? { kind: "SET_BATTING_PLAN", payload: { playerId: "s1", aggression: 4 } }
        : cats[0] === "BOWLING_PLAN" ? { kind: "SET_BOWLING_PLAN", payload: { length: "YORKER", effort: "MAXIMUM" } } : null });
    expect(change.aggression).toEqual({ playerId: "s1", level: 4 });
    expect(change.bowling).toEqual({ length: "YORKER", effort: "MAXIMUM" });
    const keep = recommendDecisions({ ...base, phase: "READY", propose: () => null });
    expect(keep.aggression).toEqual({ playerId: "s1", level: 1 });
    expect(keep.bowling).toEqual({ length: "GOOD", effort: "NORMAL" });
    expect(recommendDecisions({ ...base, phase: "READY", propose: () => { throw new Error("LC_AI_REFUSED"); } })).toEqual({});
  });

  test("asking for every recommendation through a whole T20 leaves each session unchanged and the match plays out the same", () => {
    let withAdvice = fixture();
    let plain = fixture();
    const seen = { innings: 0, aggression: 0, bowling: 0 };
    while (withAdvice.core.phase !== "COMPLETE") {
      if (withAdvice.revision >= 900) throw new Error("E5B_MATCH_STALLED");
      const c = withAdvice.core;
      const i = c.innings[c.activeInningsIndex]?.innings;
      const before = JSON.stringify(withAdvice);
      const r = recommendDecisions({
        phase: c.phase,
        decisionTeamId: c.phase === "AWAITING_INNINGS" ? c.tossWinnerId : null,
        innings: i,
        battingPlans: c.battingPlans,
        bowlingPlan: c.bowlingPlan,
        propose: (teamId, categories) => proposeOpponentT20Command(withAdvice, teamId, categories),
      });
      expect(JSON.stringify(withAdvice)).toBe(before);
      if (r.innings) seen.innings += 1;
      if (r.aggression) seen.aggression += 1;
      if (r.bowling) seen.bowling += 1;
      withAdvice = executeT20Command(withAdvice, fixtureAutopilotStep(withAdvice)).session;
      plain = executeT20Command(plain, fixtureAutopilotStep(plain)).session;
    }
    expect(seen.innings).toBe(1);
    expect(seen.aggression).toBeGreaterThan(50);
    expect(seen.bowling).toBeGreaterThan(50);
    expect(JSON.stringify(withAdvice.events)).toBe(JSON.stringify(plain.events));
  }, 120000);
});
