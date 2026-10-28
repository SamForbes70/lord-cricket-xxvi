/** Tests source-addressed arithmetic under explicit assumptions without accepting missing historical context. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { scoreDelivery, reduceScoringBoundary } from "@lcxxvi/domain";
const probes = JSON.parse(readFileSync("tests/fixtures/m7k/conditional-source-probes.json", "utf8"));
const register = JSON.parse(readFileSync("docs/verification-m7j/LC_M7I_INPUT_REGISTER.json", "utf8"));
const source = JSON.parse(readFileSync("docs/verification-m7k/source-context/SOURCE_CONTEXT.json", "utf8"));
describe("M7K conditional historical wide-hit-wicket probes", () => {
  for (const probe of probes.probes) for (const orientation of ["NORTH", "SOUTH"] as const) it(`${probe.matchId} with canonical striker end ${orientation}`, () => {
    const row = register.exceptions.find((row: { sourceEventSha256: string }) => row.sourceEventSha256 === probe.sourceEventSha256);
    expect(row).toMatchObject({ matchId: probe.matchId, innings: probe.innings, over: probe.over, attempt: probe.attempt });
    expect(source.events.find((row: { sourceEventSha256: string }) => row.sourceEventSha256 === probe.sourceEventSha256)?.matchFileSha256).toBe(probe.sourceFileSha256);
    const north = orientation === "NORTH", ends = { north: north ? "probe-striker" : "probe-nonstriker", south: north ? "probe-nonstriker" : "probe-striker" };
    const context = { rulesId: "LC_T20_01", inningsIndex: probe.innings - 1, ...probe.before, battingTeamId: "probe-A", bowlingTeamId: "probe-B", strikerId: "probe-striker", nonStrikerId: "probe-nonstriker", bowlerId: "probe-bowler", keeperId: "probe-keeper", outfieldIds: Array.from({ length: 9 }, (_, n) => `probe-f${n}`), endsBefore: ends, strikerEnd: orientation, allocatedBalls: 120, targetToWin: null, freeHitPending: false, ballAgeLegalBalls: probe.before.legalBalls };
    const resolution = { stage: "DELIVERY", legality: "WIDE", batRuns: 0, extras: { wides: 1, noBalls: 0, byes: 0, legByes: 0, penalties: 0 }, completedRuns: 0, attemptedRuns: 0, boundary: "NONE", dismissal: { kind: "HIT_WICKET", playerId: "probe-striker", wicketEnd: orientation, fielderId: null }, endsAfter: { north: north ? null : ends.north, south: north ? ends.south : null }, batContact: false, attemptedStroke: false, shotSector: null, trajectory: null, executedLength: null, fieldOutcome: "NONE", elapsedSeconds: 25 };
    const result = reduceScoringBoundary(context, scoreDelivery(context, resolution));
    expect(result.totals).toMatchObject({ runs: probe.expected.runs, wickets: probe.expected.wickets, legalBalls: probe.expected.legalBalls });
    expect(result.delta).toMatchObject({ batterRuns: 0, ballsFaced: 0, bowlerRuns: 1, bowlerWickets: 1 });
    expect(result.requiredBatterEnd).toBe(orientation); expect(result.nextAction).toBe(probe.expected.nextAction);
    expect(probe.completeHistoricalFixture).toBe(false);
  });
});
