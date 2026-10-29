/** Checks synthetic expectations in both orientations without claiming historical adjudication. */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { createLedger, execute, replay, recover, exportArchive, importArchive, nextAction } from "../../scripts/research/m7k-ledger.js";
import { mirrorEnds } from "../support/m7k-orientation.js";

const fixtures = JSON.parse(readFileSync("tests/fixtures/m7k/engineering-oracles.json", "utf8"));
describe("M7K engineering oracle acceptance", () => {
  for (const original of fixtures.cases) for (const mirrored of [false, true]) {
    const fixture = mirrored ? mirrorEnds(original) : original;
    it(`${fixture.id}: ${mirrored ? "mirrored" : "original"} ends, every prefix and rejected receipt`, () => {
      let state = createLedger(fixture.seed);
      for (const command of fixture.commands) {
        const before = structuredClone(state);
        const checkpoint = exportArchive(state);
        const accepted = execute(state, command);
        if (fixture.expectedPrefixes) expect(accepted.projection).toMatchObject(fixture.expectedPrefixes[accepted.events.length - 1]);
        expect(state).toEqual(before);
        expect(recover(checkpoint, accepted.events)).toEqual(accepted);
        expect(recover(exportArchive(accepted), accepted.events)).toEqual(accepted);
        expect(replay(accepted.seed, accepted.events)).toEqual(accepted);
        expect(importArchive(exportArchive(accepted))).toEqual(accepted);
        const frozen = structuredClone(accepted);
        expect(() => execute(accepted, { ...command, sequence: accepted.events.length })).toThrow(/DUPLICATE_COMMAND/);
        expect(() => execute(accepted, { ...command, commandId: "out-of-order", sequence: accepted.events.length + 1 })).toThrow(/SEQUENCE/);
        expect(accepted).toEqual(frozen);
        state = accepted;
      }
      expect(state.projection).toMatchObject(fixture.expected);
      expect(nextAction(state)).toBe(fixture.nextAction);
      expect(state.gameplayIntegrationPermitted).toBe(false);
      expect(mirrorEnds(mirrorEnds(fixture))).toEqual(fixture);
    });
  }
});
