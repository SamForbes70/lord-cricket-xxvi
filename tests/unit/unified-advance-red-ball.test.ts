import { describe, expect, test } from "vitest";
import { delivery, expectSameMatch, over, play, type Setup } from "./unified-advance-harness.js";

/** Directive 03: see unified-advance-harness.ts. A whole five-day match, played twice. */
describe("unified advance: the same five-day match whichever button is pressed", () => {
  test("five-day red-ball with a computer captain: Next delivery and Finish over", async () => {
    const setup: Setup = { format: "RED_BALL", seed: "unified-advance-red", computer: "second" };
    const byBall = await play(setup, delivery);
    expectSameMatch(byBall, await play(setup, over));
    expect(byBall.captainCommands).toBeGreaterThan(20);
    // With no computer side an over is one engine command in every format; the T20 test in unified-advance.test.ts checks the outcome.
  }, 600_000);
});
