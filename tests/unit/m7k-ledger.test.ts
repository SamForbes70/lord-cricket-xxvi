/** Checks research transitions against explicit synthetic expectations and unchanged scoring rules. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { type DeliveryResolution } from "@lcxxvi/contracts";
import { VERSION, MODEL, createLedger, execute, replay, hash, exportArchive, importArchive, nextAction, transferAward, recover, type ResearchLedger } from "../../scripts/research/m7k-ledger.js";

const context = JSON.parse(readFileSync("tests/fixtures/scoring/corpus.json", "utf8")).deliveries[0].context;
export function seed(targetToWin: number | null = null) {
  return { version: VERSION, model: MODEL, inningsId: "research-first", reviewReference: "SF-2026-10-28",
    context: { ...context, runs: 0, wickets: 0, legalBalls: 0, deliveryIndex: 0, ballAgeLegalBalls: 0, targetToWin },
    battingOrder: ["p1", "p2", ...Array.from({ length: 9 }, (_, i) => `p${i + 3}`)] };
}
function command(s: ResearchLedger, action: object) { return { commandId: `command-${s.events.length}`, sequence: s.events.length, ...action }; }
function send(s: ResearchLedger, action: object) { return execute(s, command(s, action)); }
function dot(s: ResearchLedger): DeliveryResolution {
  return { stage: "DELIVERY", legality: "LEGAL", batRuns: 0, extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
    completedRuns: 0, attemptedRuns: 0, boundary: "NONE", dismissal: null, endsAfter: s.projection.context.endsBefore,
    batContact: false, attemptedStroke: true, shotSector: null, trajectory: null, executedLength: null, fieldOutcome: "NONE", elapsedSeconds: 25 };
}
const evidence = { deadBallConfirmed: true, reviewReference: "SF-2026-10-28" };
function retire(s: ResearchLedger, status = "RETIRED_NOT_OUT") { return send(s, { kind: "RETIRE", playerId: s.projection.context.strikerId, status, returnPermitted: false, ...evidence }); }
function bowlOverBoundary(s: ResearchLedger) {
  const c = s.projection.context;
  const playerId = Object.keys(s.projection.bowling).find(id => id !== c.keeperId && id !== s.projection.previousBowler && s.projection.bowling[id]!.legalBalls < 24)!;
  return send(s, { kind: "BOWLER", playerId, outfieldIds: Object.keys(s.projection.bowling).filter(id => id !== c.keeperId && id !== playerId) });
}

describe("M7K isolated research ledger", () => {
  it("can replace two separately retired batters at explicitly selected ends", () => {
    let s = retire(createLedger(seed()));
    s = send(s, { kind: "RETIRE", playerId: "p2", status: "RETIRED_NOT_OUT", returnPermitted: false, ...evidence });
    s = send(s, { kind: "REPLACE", playerId: "p3", end: "SOUTH" });
    s = send(s, { kind: "REPLACE", playerId: "p4", end: "NORTH" });
    expect(s.projection.context.endsBefore).toEqual({ north: "p4", south: "p3" });
  });
  it("transfers fielding awards atomically to the correct other innings", () => {
    const source = send(createLedger(seed()), { kind: "PENALTY", beneficiary: "FIELDING", ...evidence });
    const second = seed(); second.inningsId = "second";
    second.context.battingTeamId = "team-B"; second.context.bowlingTeamId = "team-A"; second.context.inningsIndex = 1;
    const destination = createLedger(second), before = structuredClone({ source, destination });
    const result = transferAward(source, destination, "command-0", "review");
    expect(result.source.projection.context.runs).toBe(0); expect(result.destination.projection.context.runs).toBe(5);
    expect(result.destination.projection.bowling.b1?.runs).toBe(0);
    expect(() => transferAward(result.source, result.destination, "command-0", "review")).toThrow();
    expect(() => transferAward(source, createLedger(seed()), "command-0", "review")).toThrow();
    expect({ source, destination }).toEqual(before);
    expect(importArchive(exportArchive(result.source))).toEqual(result.source);
    expect(importArchive(exportArchive(result.destination))).toEqual(result.destination);
  });
  it("recovers interruption before acceptance and after acceptance before publication", () => {
    const empty = createLedger(seed()), saved = exportArchive(empty);
    const accepted = send(empty, { kind: "DELIVERY", resolution: dot(empty) });
    expect(recover(saved, [])).toEqual(empty);
    expect(recover(saved, accepted.events)).toEqual(accepted);
    expect(recover(exportArchive(accepted), accepted.events)).toEqual(accepted);
    expect(recover(saved, [...accepted.events, ...accepted.events])).toEqual(accepted);
    const changed = structuredClone(accepted.events); changed[0]!.hash = "bad";
    expect(() => recover(exportArchive(accepted), changed)).toThrow("CONFLICTING_RECEIPT");
    expect(() => recover(saved, changed)).toThrow("TAIL_HASH");
  });
  it("records a dot with reconciled batter, bowler and physical ends", () => {
    let s = createLedger(seed()); s = send(s, { kind: "DELIVERY", resolution: dot(s) });
    expect(s.projection.context).toMatchObject({ runs: 0, wickets: 0, legalBalls: 1, deliveryIndex: 1, endsBefore: { north: "p1", south: "p2" } });
    expect(s.projection.batting.p1).toMatchObject({ runs: 0, balls: 1 }); expect(s.projection.bowling.b1).toEqual({ runs: 0, wickets: 0, legalBalls: 1 });
    expect(s.events[0]?.command.sequence).toBe(0); expect(s.gameplayIntegrationPermitted).toBe(false);
  });
  it("credits a boundary once and preserves the caller", () => {
    const s = createLedger(seed()), original = structuredClone(s), resolution = { ...dot(s), batRuns: 4, boundary: "FOUR", batContact: true };
    const next = send(s, { kind: "DELIVERY", resolution });
    expect(next.projection.context.runs).toBe(4); expect(next.projection.batting.p1).toMatchObject({ runs: 4, balls: 1, fours: 1 });
    expect(next.projection.bowling.b1?.runs).toBe(4); expect(s).toEqual(original);
  });
  it("applies a batting penalty without ball, batter or bowler credit", () => {
    const s = send(createLedger(seed()), { kind: "PENALTY", beneficiary: "BATTING", ...evidence });
    expect(s.projection.context).toMatchObject({ runs: 5, wickets: 0, legalBalls: 0, deliveryIndex: 0 });
    expect(s.projection.extras.penalties).toBe(5); expect(s.projection.batting.p1?.runs).toBe(0); expect(s.projection.bowling.b1?.runs).toBe(0);
  });
  it("keeps a fielding award pending, then records a unique destination", () => {
    let s = send(createLedger(seed()), { kind: "PENALTY", beneficiary: "FIELDING", ...evidence });
    expect(s.projection.context.runs).toBe(0); expect(s.projection.awards["command-0"]).toEqual({ amount: 5, beneficiaryTeamId: "team-B", destinationInningsId: null });
    expect(() => send(s, { kind: "ALLOCATE", awardId: "command-0", destinationInningsId: s.seed.inningsId })).toThrow("DESTINATION");
    s = send(s, { kind: "ALLOCATE", awardId: "command-0", destinationInningsId: "research-second" });
    expect(s.projection.awards["command-0"]?.destinationInningsId).toBe("research-second");
    expect(() => send(s, { kind: "ALLOCATE", awardId: "command-0", destinationInningsId: "another" })).toThrow("DESTINATION");
  });
  it.each(["RETIRED_OUT", "RETIRED_NOT_OUT"])("tracks %s separately from bowler wickets", status => {
    let s = retire(createLedger(seed()), status);
    expect(s.projection.context.wickets).toBe(Number(status === "RETIRED_OUT")); expect(s.projection.bowling.b1?.wickets).toBe(0);
    expect(s.projection.context.endsBefore.north).toBeNull(); expect(nextAction(s)).toBe("SELECT_BATTER");
    expect(() => send(s, { kind: "DELIVERY", resolution: dot(s) })).toThrow("REPLACEMENT");
    s = send(s, { kind: "REPLACE", end: "NORTH", playerId: "p3" }); expect(s.projection.context.strikerId).toBe("p3"); expect(nextAction(s)).toBe("ADVANCE");
  });
  it("requires explicit return permission and prevents return of dismissed batters", () => {
    let s = retire(createLedger(seed()));
    expect(() => send(s, { kind: "REPLACE", end: "NORTH", playerId: "p1" })).toThrow("STATUS");
    s = send(s, { kind: "PERMIT_RETURN", playerId: "p1", reviewReference: "review-return" });
    s = send(s, { kind: "REPLACE", end: "NORTH", playerId: "p1" }); expect(s.projection.batting.p1?.status).toBe("ACTIVE");
    const out = retire(createLedger(seed()), "RETIRED_OUT");
    expect(() => send(out, { kind: "PERMIT_RETURN", playerId: "p1", reviewReference: "review-return" })).toThrow("STATUS");
    expect(() => send(out, { kind: "REPLACE", end: "NORTH", playerId: "p1" })).toThrow("STATUS");
  });
  it("reuses ordinary wicket attribution and replacement rules", () => {
    let s = createLedger(seed()); const c = s.projection.context;
    s = send(s, { kind: "DELIVERY", resolution: { ...dot(s), dismissal: { kind: "BOWLED", playerId: "p1", wicketEnd: c.strikerEnd, fielderId: null }, endsAfter: { north: null, south: "p2" } } });
    expect(s.projection.context.wickets).toBe(1); expect(s.projection.bowling.b1?.wickets).toBe(1); expect(nextAction(s)).toBe("SELECT_BATTER");
  });
  it("supports the frozen wide plus hit-wicket path", () => {
    let s = createLedger(seed());
    s = send(s, { kind: "DELIVERY", resolution: { ...dot(s), legality: "WIDE", attemptedStroke: false, extras: { ...dot(s).extras, wides: 1 }, dismissal: { kind: "HIT_WICKET", playerId: "p1", wicketEnd: "NORTH", fielderId: null }, endsAfter: { north: null, south: "p2" } } });
    expect(s.projection.context).toMatchObject({ runs: 1, wickets: 1, legalBalls: 0 }); expect(s.projection.bowling.b1).toEqual({ runs: 1, wickets: 1, legalBalls: 0 }); expect(s.projection.batting.p1?.balls).toBe(0);
  });
  it("rejects duplicate and out-of-order commands without mutation", () => {
    const s = send(createLedger(seed()), { kind: "DELIVERY", resolution: dot(createLedger(seed())) }), before = structuredClone(s);
    expect(() => execute(s, { ...s.events[0]!.command, sequence: 1 })).toThrow("DUPLICATE");
    expect(() => execute(s, { ...command(s, { kind: "DELIVERY", resolution: dot(s) }), sequence: 4 })).toThrow("SEQUENCE"); expect(s).toEqual(before);
  });
  it("rejects unknown identities and contradictory administration atomically", () => {
    const s = createLedger(seed()), before = structuredClone(s);
    expect(() => send(s, { kind: "RETIRE", playerId: "unknown", status: "RETIRED_OUT", returnPermitted: false, ...evidence })).toThrow();
    expect(() => send(s, { kind: "RETIRE", playerId: "p1", status: "RETIRED_OUT", returnPermitted: true, ...evidence })).toThrow();
    expect(() => send(s, { kind: "PENALTY", beneficiary: "BATTING", ...evidence, deadBallConfirmed: false })).toThrow(); expect(s).toEqual(before);
  });
  it("closes on winning penalty and permits separately ordered post-closure awards", () => {
    let s = send(createLedger(seed(5)), { kind: "PENALTY", beneficiary: "BATTING", ...evidence });
    expect(nextAction(s)).toBe("CLOSED"); expect(() => retire(s)).toThrow("CLOSED");
    s = send(s, { kind: "PENALTY", beneficiary: "FIELDING", ...evidence }); expect(nextAction(s)).toBe("CLOSED"); expect(s.projection.context.runs).toBe(5);
  });
  it("closes on an immediate winning wide without a legal ball", () => {
    const s = createLedger(seed(1));
    const next = send(s, { kind: "DELIVERY", resolution: { ...dot(s), stage: "IMMEDIATE_PENALTY", legality: "WIDE", extras: { ...dot(s).extras, wides: 1 }, attemptedStroke: false } });
    expect(nextAction(next)).toBe("CLOSED"); expect(next.projection.context.legalBalls).toBe(0);
  });
  it("closes at the tenth retirement and rejects further replacement", () => {
    let s = createLedger(seed());
    for (let n = 0; n < 10; n++) { s = retire(s, "RETIRED_OUT"); if (n < 9) s = send(s, { kind: "REPLACE", end: "NORTH", playerId: `p${n + 3}` }); }
    expect(s.projection.context.wickets).toBe(10); expect(nextAction(s)).toBe("CLOSED"); expect(() => send(s, { kind: "REPLACE", end: "NORTH", playerId: "p2" })).toThrow("CLOSED");
  });
  it("closes at 120 legal balls while enforcing over decisions and quotas", () => {
    let s = createLedger(seed());
    for (let n = 0; n < 120; n++) { if (nextAction(s) === "SELECT_BOWLER") s = bowlOverBoundary(s); s = send(s, { kind: "DELIVERY", resolution: dot(s) }); }
    expect(nextAction(s)).toBe("CLOSED"); expect(s.projection.context.legalBalls).toBe(120);
    expect(() => send(s, { kind: "DELIVERY", resolution: dot(s) })).toThrow("CLOSED");
  });
  it("requires a different bowler and complete field identities", () => {
    let s = createLedger(seed()); for (let n = 0; n < 6; n++) s = send(s, { kind: "DELIVERY", resolution: dot(s) });
    expect(nextAction(s)).toBe("SELECT_BOWLER"); expect(() => send(s, { kind: "BOWLER", playerId: "b1", outfieldIds: context.outfieldIds })).toThrow();
    expect(() => send(s, { kind: "BOWLER", playerId: "f1", outfieldIds: context.outfieldIds })).toThrow();
    s = bowlOverBoundary(s); expect(nextAction(s)).toBe("ADVANCE"); expect(s.projection.context.strikerId).toBe("p2");
  });
  it("rejects altered state, unsafe counters and unsupported seed versions", () => {
    const s = createLedger(seed()); s.projection.context.runs = Number.MAX_SAFE_INTEGER;
    expect(() => send(s, { kind: "PENALTY", beneficiary: "BATTING", ...evidence })).toThrow();
    expect(() => createLedger({ ...seed(), version: "LC_T20_MATCH_V1" })).toThrow();
    expect(() => createLedger({ ...seed(), battingOrder: Array(11).fill("p1") })).toThrow();
    expect(() => createLedger({ ...seed(), context: { ...seed().context, deliveryIndex: 1 } })).toThrow();
  });
  it("replays every prefix, including accepted events beyond an older checkpoint", () => {
    let s = createLedger(seed()); s = send(s, { kind: "DELIVERY", resolution: dot(s) }); s = retire(s); s = send(s, { kind: "REPLACE", end: "NORTH", playerId: "p3" }); s = send(s, { kind: "PENALTY", beneficiary: "FIELDING", ...evidence });
    for (let n = 0; n <= s.events.length; n++) {
      const prefix = replay(s.seed, s.events.slice(0, n)); expect(importArchive(exportArchive(prefix))).toEqual(prefix);
      expect(importArchive(exportArchive(s, n))).toEqual(s);
    }
    expect(hash(importArchive(exportArchive(s)).projection)).toBe(hash(s.projection));
  });
  it("rejects damaged checkpoints, reordered events, unknown archives and mismatched model pins", () => {
    let s = createLedger(seed()); s = send(s, { kind: "DELIVERY", resolution: dot(s) }); s = send(s, { kind: "PENALTY", beneficiary: "BATTING", ...evidence });
    const archive = JSON.parse(exportArchive(s));
    for (const bad of [ { ...archive, version: "LC_T20_MATCH_V1" }, { ...archive, model: "synthetic-alpha-01" }, { ...archive, rules: "LC_T20_01" }, { ...archive, checkpoint: { sequence: 99, projectionHash: "bad" } }, { ...archive, checkpoint: { sequence: 1, projectionHash: "bad" } }, { ...archive, events: [...archive.events].reverse() }, { ...archive, events: [...archive.events, archive.events[0]] } ]) expect(() => importArchive(JSON.stringify(bad))).toThrow();
    const tampered = structuredClone(archive); tampered.events[0].projectionHash = "bad"; expect(() => importArchive(JSON.stringify(tampered))).toThrow("HASH");
    expect(importArchive(JSON.stringify({ ...archive, checkpoint: null }))).toEqual(s);
  });
});
