import { describe, expect, it } from "vitest";
import { coachTip } from "../../apps/web/src/match/GuidedCoach.js";

type V = Parameters<typeof coachTip>[0];
const at = (phase: string, extra: Partial<V> = {}): V => ({ phase, fieldPresentation: null, activeIndex: 0, innings: [], ...extra }) as V;

describe("guided first match coach", () => {
  it("has a tip for every decision the match can ask for", () => {
    for (const phase of ["TOSS", "AWAITING_INNINGS", "AWAITING_FOLLOW_ON", "AWAITING_BATTER", "AWAITING_BOWLER", "READY", "COMPLETE", "SOMETHING_NEW"]) {
      const tip = coachTip(at(phase));
      expect(tip.title.length).toBeGreaterThan(3);
      expect(tip.text.length).toBeGreaterThan(20);
    }
    expect(coachTip(at("TOSS")).title).toBe("The toss");
    expect(coachTip(at("READY")).title).toBe("Play the first ball");
  });
  it("reacts to a wicket and a boundary", () => {
    const wicket = { latestHighlight: { dismissalKind: "CAUGHT", boundary: "NONE" } } as unknown as V["fieldPresentation"];
    expect(coachTip(at("AWAITING_BATTER", { fieldPresentation: wicket })).title).toMatch(/Wicket/);
    const six = { latestHighlight: { dismissalKind: null, boundary: "SIX" } } as unknown as V["fieldPresentation"];
    expect(coachTip(at("READY", { fieldPresentation: six })).title).toBe("Boundary!");
  });
});
