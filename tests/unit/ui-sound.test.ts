import { describe, expect, it } from "vitest";
import { crowdBed } from "../../apps/web/src/ui-sound.js";

describe("crowd ambience", () => {
  it("is deterministic, bounded and loops without a click", () => {
    const a = crowdBed(22050);
    expect(a.length).toBe(44100);
    expect(Array.from(crowdBed(22050).slice(0, 64))).toEqual(Array.from(a.slice(0, 64)));
    let peak = 0;
    let maxStep = 0;
    for (let i = 0; i < a.length; i += 1) {
      expect(Number.isFinite(a[i])).toBe(true);
      peak = Math.max(peak, Math.abs(a[i]!));
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(a[i]! - a[i - 1]!));
    }
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.01);
    // The jump from the last sample back to the first is no bigger than an ordinary step inside the loop.
    expect(Math.abs(a[0]! - a[a.length - 1]!)).toBeLessThanOrEqual(maxStep * 1.5);
  });
});
