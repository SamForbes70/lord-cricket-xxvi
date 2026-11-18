import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RainMatchRecordSchema, RAIN_MATCH_RECORD_SCHEMA_ID, type RainCommand } from "@lcxxvi/contracts";
import {
  buildRainSetup,
  createRainMatch,
  drawRainPlan,
  eligibleRainBowlers,
  executeRainCommand,
  inningsResources,
  parAtStoppage,
  rainAutopilotCommand,
  rainBowlerLimitBalls,
  rainMatchRecord,
  rainPendingDecision,
  rainStateSha256,
  replayRainMatch,
  revisedTarget,
  runAutopilotRainMatch,
  verifyRainMatchRecord,
  type RainMatchState,
  type RainSetup,
} from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";

// Stage 14 rain-affected exhibitions (owner decisions of 17 and 18 November 2026: seeded rain, opt-in, exhibitions only,
// a separate engine wrapping the frozen one, fictional resource table `LC_RESOURCE_TABLE_01`).
const root = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
const catalog = createMatchController(worldBytes, manifest, () => "catalog").currentResponse("ui-0").catalog!;
const pick = (id: string) => catalog.teams.find((t) => t.id === id)!.suggested;

function setupFor(format: "T20" | "ODI", seed: string, a = "team-01", b = "team-02", ground = "ground-01"): RainSetup {
  return buildRainSetup({ format, gameId: `rain-g-${seed}`, matchId: `rain-m-${seed}`, seed, groundId: ground, selectedTeams: [pick(a), pick(b)] }, worldBytes, manifest);
}

/** Finds the first seed (by number) whose plan satisfies `test`, using only the cheap plan draw. */
function findSeed(format: "T20" | "ODI", test: (setup: RainSetup) => boolean): string {
  for (let n = 0; n < 400; n++) {
    const seed = `${format.toLowerCase()}-find-${n}`;
    if (test(setupFor(format, seed))) return seed;
  }
  throw new Error("no seed found");
}

/** Re-derives the second innings target from the recorded stoppages with the resource-table functions. */
function expectedTarget(format: "T20" | "ODI", state: RainMatchState): number {
  const firstRuns = state.innings[0]!.innings.runs;
  if (state.stoppages.length === 0) return firstRuns + 1;
  const list = (index: 0 | 1) =>
    state.stoppages.filter((s) => s.inningsIndex === index && !s.terminal).map((s) => ({ ballsBowled: s.legalBalls, wicketsLost: s.wickets, ballsLost: s.ballsLost }));
  const r1 = inningsResources(format, state.startAllocations[0], list(0));
  const r2 = inningsResources(format, state.startAllocations[1], list(1));
  return revisedTarget(format, firstRuns, r1, r2);
}

describe("Stage 14 rain-affected exhibitions", () => {
  it("draws a deterministic, bounded weather plan from the seed", () => {
    for (const format of ["T20", "ODI"] as const) {
      const full = format === "T20" ? 120 : 300;
      for (let n = 0; n < 60; n++) {
        const setup = setupFor(format, `plan-${n}`);
        const plan = drawRainPlan(setup);
        expect(drawRainPlan(setup)).toEqual(plan);
        expect(plan.stoppages.length).toBeGreaterThanOrEqual(1);
        expect(plan.stoppages.length).toBeLessThanOrEqual(2);
        plan.stoppages.forEach((s, i) => {
          expect(s.atLegalBall % 6).toBe(0);
          expect(s.atLegalBall).toBeGreaterThanOrEqual(12);
          expect(s.atLegalBall).toBeLessThan(full - 12);
          // Only the last stoppage can end the match, and only in the second innings.
          if (s.terminal) expect(s.inningsIndex === 1 && i === plan.stoppages.length - 1).toBe(true);
        });
      }
    }
    // A different seed gives a different plan for at least some matches.
    const plans = new Set(Array.from({ length: 20 }, (_, n) => JSON.stringify(drawRainPlan(setupFor("T20", `plan-${n}`)))));
    expect(plans.size).toBeGreaterThan(5);
  });

  it("plays T20 and one-day matches to a result whose target follows the resource table", () => {
    for (const [format, seeds] of [
      ["T20", ["rain-a", "rain-b", "rain-c", "rain-d", "rain-e", "rain-f"]],
      ["ODI", ["rain-a", "rain-b"]],
    ] as const) {
      for (const seed of seeds) {
        const setup = setupFor(format, seed);
        const { state } = runAutopilotRainMatch(setup);
        expect(state.phase).toBe("COMPLETE");
        expect(state.result).not.toBeNull();
        expect(state.target).toBe(expectedTarget(format, state));
        // Each innings stays within its (possibly shortened) allocation, and bowlers within their limit.
        state.innings.forEach((ledger, index) => {
          expect(ledger.innings.legalBalls).toBeLessThanOrEqual(state.allocations[index as 0 | 1]);
          const limit = Math.max(rainBowlerLimitBalls(state.allocations[index as 0 | 1]), rainBowlerLimitBalls(state.startAllocations[index as 0 | 1]));
          for (const figures of Object.values(ledger.bowling)) expect(figures.legalBalls).toBeLessThanOrEqual(limit);
        });
        if (state.result!.kind === "WIN" && state.result!.marginType === "WICKETS") {
          expect(state.innings[1]!.innings.runs).toBeGreaterThanOrEqual(state.target!);
        }
        expect(state.result!.method).toBe(state.stoppages.length ? "RESOURCE_TABLE" : "STANDARD");
      }
    }
  }, 60_000);

  it("shortens both innings for a first-innings stoppage, and only the chase for a second-innings one", () => {
    const first = findSeed("T20", (s) => {
      const p = drawRainPlan(s).stoppages;
      return p.length === 1 && p[0]!.inningsIndex === 0 && p[0]!.atLegalBall <= 30;
    });
    const a = runAutopilotRainMatch(setupFor("T20", first)).state;
    expect(a.stoppages).toHaveLength(1);
    {
      const stop = a.stoppages[0]!;
      expect(stop.inningsIndex).toBe(0);
      expect(stop.allocations[0]).toBe(stop.allocations[1]);
      expect(stop.allocations[0]).toBe(120 - stop.ballsLost);
      expect(a.startAllocations[1]).toBe(stop.allocations[1]);
    }
    const second = findSeed("T20", (s) => {
      const p = drawRainPlan(s).stoppages;
      return p.length === 1 && p[0]!.inningsIndex === 1 && !p[0]!.terminal && p[0]!.atLegalBall <= 24;
    });
    const b = runAutopilotRainMatch(setupFor("T20", second)).state;
    expect(b.stoppages).toHaveLength(1);
    const stop = b.stoppages[0]!;
    expect(stop.inningsIndex).toBe(1);
    expect(stop.allocations[0]).toBe(120);
    expect(stop.allocations[1]).toBeLessThan(120);
    expect(stop.targetAfter).toBe(b.target);
    expect(b.innings[1]!.innings.targetToWin).toBe(b.target);
  }, 60_000);

  it("decides a match abandoned in the chase on the par score, or as no result before the minimum overs", () => {
    const decided = findSeed("T20", (s) => {
      const p = drawRainPlan(s).stoppages;
      return p.length === 1 && p[0]!.terminal && p[0]!.atLegalBall >= 30;
    });
    const setup = setupFor("T20", decided);
    const state = runAutopilotRainMatch(setup).state;
    const terminal = state.stoppages.find((s) => s.terminal);
    expect(terminal).toBeDefined();
    if (terminal) {
      const par = parAtStoppage({
        format: "T20",
        firstInningsRuns: state.innings[0]!.innings.runs,
        firstResources: inningsResources("T20", 120, []),
        secondResourcesAvailable: inningsResources("T20", state.startAllocations[1], []),
        ballsLeft: terminal.ballsLost,
        wicketsLost: terminal.wickets,
      });
      const runs = terminal.runs;
      const r = state.result!;
      expect(r.method).toBe("RESOURCE_TABLE");
      if (runs > par) expect(r).toMatchObject({ kind: "WIN", winnerTeamId: state.innings[1]!.innings.battingTeamId, margin: runs - par });
      else if (runs === par) expect(r.kind).toBe("TIE");
      else expect(r).toMatchObject({ kind: "WIN", winnerTeamId: state.innings[1]!.innings.bowlingTeamId, margin: par - runs });
    }
    const early = findSeed("T20", (s) => {
      const p = drawRainPlan(s).stoppages;
      return p.length === 1 && p[0]!.terminal && p[0]!.atLegalBall < 30;
    });
    const abandoned = runAutopilotRainMatch(setupFor("T20", early)).state;
    expect(abandoned.stoppages.some((s) => s.terminal)).toBe(true);
    expect(abandoned.result).toMatchObject({ kind: "NO_RESULT", winnerTeamId: null });
  }, 60_000);

  it("rejects illegal commands without changing the state, and enforces bowler choices", () => {
    const setup = setupFor("T20", "rain-rules");
    let state = createRainMatch(setup);
    const before = rainStateSha256(state);
    expect(() => executeRainCommand(setup, state, { kind: "BOWL", scope: "BALL" })).toThrow("LC_RAIN_WRONG_PHASE");
    expect(() => executeRainCommand(setup, state, { kind: "CHOOSE_INNINGS", teamId: "team-01", choice: "BAT" })).toThrow("LC_RAIN_WRONG_PHASE");
    expect(rainStateSha256(state)).toBe(before);
    state = executeRainCommand(setup, state, { kind: "CALL_TOSS", teamId: "team-01", call: "HEADS" });
    const loser = state.tossWinnerId === "team-01" ? "team-02" : "team-01";
    expect(() => executeRainCommand(setup, state, { kind: "CHOOSE_INNINGS", teamId: loser, choice: "BAT" })).toThrow("LC_RAIN_NOT_TOSS_WINNER");
    // Play to the second over: the first over's bowler cannot bowl again straight away.
    while (!(state.phase === "AWAITING_BOWLER" && state.innings[0]!.innings.legalBalls === 6)) state = executeRainCommand(setup, state, rainAutopilotCommand(setup, state)!);
    const previous = state.innings[0]!.innings.previousOverBowlerId!;
    expect(eligibleRainBowlers(setup, state)).not.toContain(previous);
    const pending = rainPendingDecision(setup, state)!;
    expect(pending.decision).toBe("BOWLER");
    expect(() => executeRainCommand(setup, state, { kind: "SET_BOWLER", teamId: pending.teamId, playerId: previous })).toThrow("LC_RAIN_INELIGIBLE_BOWLER");
    const keeper = setup.teams.find((t) => t.teamId === pending.teamId)!.keeperId;
    expect(() => executeRainCommand(setup, state, { kind: "SET_BOWLER", teamId: pending.teamId, playerId: keeper })).toThrow("LC_RAIN_INELIGIBLE_BOWLER");
    expect(rainBowlerLimitBalls(120)).toBe(24);
    expect(rainBowlerLimitBalls(300)).toBe(60);
    expect(rainBowlerLimitBalls(66)).toBe(18);
  });

  it("replays from its record, and rejects a record that does not match", () => {
    const setup = setupFor("T20", "rain-record");
    const { state, commands } = runAutopilotRainMatch(setup);
    expect(rainStateSha256(replayRainMatch(setup, commands))).toBe(rainStateSha256(state));
    const record = rainMatchRecord(setup, state, commands);
    expect(record.schemaId).toBe(RAIN_MATCH_RECORD_SCHEMA_ID);
    expect(RainMatchRecordSchema.parse(JSON.parse(JSON.stringify(record)))).toEqual(record);
    // The record carries everything needed to rebuild the setup.
    const rebuilt = buildRainSetup({ format: "T20", ...record }, worldBytes, manifest);
    expect(rainStateSha256(verifyRainMatchRecord(rebuilt, record))).toBe(rainStateSha256(state));
    expect(() => verifyRainMatchRecord(setup, { ...record, stateSha256: "0".repeat(64) })).toThrow("LC_RAIN_RECORD_STATE_MISMATCH");
    expect(() => verifyRainMatchRecord(setup, { ...record, seed: "another-seed" })).toThrow("LC_RAIN_RECORD_SETUP_MISMATCH");
    expect(() => verifyRainMatchRecord(setupFor("ODI", "rain-record"), record)).toThrow("LC_RAIN_RECORD_FORMAT_MISMATCH");
    const shortened: RainCommand[] = commands.slice(0, -1);
    expect(() => verifyRainMatchRecord(setup, { ...record, commands: shortened })).toThrow("LC_RAIN_RECORD_STATE_MISMATCH");
  }, 60_000);

  it("only accepts a verified frozen setup", () => {
    const setup = setupFor("T20", "rain-frozen");
    expect(() => createRainMatch(structuredClone(setup) as RainSetup)).toThrow("LC_RAIN_INVALID_FROZEN_SETUP");
  });
});
