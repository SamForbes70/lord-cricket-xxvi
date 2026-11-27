import { describe, expect, test } from "vitest";
import { delivery, expectSameMatch, mixed, over, play, type Setup } from "./unified-advance-harness.js";

/** Directive 03: see unified-advance-harness.ts. */
describe("unified advance: the same match whichever button is pressed", () => {
  test("T20 with a computer captain: Next delivery, Finish over, batches and a mix give identical matches", async () => {
    const setup: Setup = { format: "T20", seed: "unified-advance-t20", computer: "second" };
    const byBall = await play(setup, delivery);
    const byOver = await play(setup, over);
    expectSameMatch(byBall, byOver);
    expectSameMatch(byBall, await play(setup, mixed));
    expect(byBall.captainCommands).toBeGreaterThan(20);
    // Before Directive 03 "Finish match" let the computer act only at its own decisions: a different match.
    const old = await play(setup, { kind: "old-batch" });
    expect(old.events).not.toEqual(byBall.events);
    console.log(`T20 computer side: ${byBall.deliveries} deliveries, ${byBall.captainCommands} captain commands; ${byBall.result}. Old batch: ${old.result}`);
  }, 120_000);

  test("T20 with the computer on the other side, club style and a delegated plan category", async () => {
    const setup: Setup = { format: "T20", seed: "unified-advance-t20-b", computer: "first", flags: { matchAware: true, clubStyle: true },
      delegate: { side: "second", categories: ["BATTING_PLAN", "FIELD"] } };
    const byBall = await play(setup, delivery);
    expectSameMatch(byBall, await play(setup, over));
    expectSameMatch(byBall, await play(setup, mixed));
  }, 120_000);

  test("T20 with no computer side: deliveries and single-command overs give identical matches", async () => {
    const setup: Setup = { format: "T20", seed: "unified-advance-t20-manual", computer: null };
    const byBall = await play(setup, delivery);
    const byOver = await play(setup, over);
    expectSameMatch(byBall, byOver);
    // Without a seat an over stays one engine command, as before.
    expect(byOver.commands).toBeLessThan(byBall.commands);
    expect(byOver.captainCommands).toBe(0);
    // And the old over-per-command batch plays the same match too.
    expectSameMatch(byBall, await play(setup, { kind: "old-batch" }));
  }, 120_000);

  test("ODI with a computer captain: Next delivery and Finish over", async () => {
    const setup: Setup = { format: "ODI", seed: "unified-advance-odi", computer: "second" };
    const byBall = await play(setup, delivery);
    expectSameMatch(byBall, await play(setup, over));
    expect(byBall.captainCommands).toBeGreaterThan(20);
    // With no computer side an over is one engine command in every format; the T20 test above checks the outcome.
  }, 300_000);
});
