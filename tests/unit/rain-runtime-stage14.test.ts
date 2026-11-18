import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRainRuntime } from "../../apps/web/src/rain/rain-runtime.js";

// Stage 14 rain-affected exhibitions: the page-facing runtime that the rain worker wraps.
const root = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));

const start = { format: "T20" as const, gameId: "rain-test-g", matchId: "rain-test-m", seed: "rain-test-seed", groundId: "ground-01", teamIds: ["team-01", "team-02"] as [string, string] };

describe("Stage 14 rain match runtime", () => {
  it("lets the player take their own decisions while the AI captain takes the other side's", () => {
    const runtime = createRainRuntime(worldBytes, manifest);
    let m = runtime.start(start);
    expect(m.view.pending).toMatchObject({ teamId: "team-01", decision: "TOSS" });
    expect(m.view.stoppages).toEqual([]);
    m = runtime.command(m.record, { kind: "CALL_TOSS", teamId: "team-01", call: "HEADS" });
    if (m.view.pending?.teamId === "team-01") m = runtime.command(m.record, { kind: "CHOOSE_INNINGS", teamId: "team-01", choice: "BAT" });
    else m = runtime.aiDecisions(m.record, "team-01");
    // The AI never takes the player's decisions.
    for (let guard = 0; guard < 20 && m.view.phase !== "READY"; guard++) {
      if (m.view.pending?.teamId === "team-01") m = runtime.command(m.record, m.view.pending.decision === "BATTER" ? { kind: "SET_BATTER", teamId: "team-01", playerId: m.view.options[0]!.id } : { kind: "SET_BOWLER", teamId: "team-01", playerId: m.view.options[0]!.id });
      else m = runtime.aiDecisions(m.record, "team-01");
    }
    expect(m.view.phase).toBe("READY");
    expect(m.view.innings).toHaveLength(1);
    expect(m.view.innings[0]!.batters).toHaveLength(2);
    m = runtime.command(m.record, { kind: "BOWL", scope: "BALL" });
    expect(m.view.lastBall).toMatch(/ to .+: /);
    expect(m.record.commands.at(-1)).toEqual({ kind: "BOWL", scope: "BALL" });
  }, 60_000);

  it("simulates to a result, and a fresh runtime reopens the stored record on the engine", () => {
    const runtime = createRainRuntime(worldBytes, manifest);
    const finished = runtime.simulateToEnd(runtime.start(start).record);
    expect(finished.view.phase).toBe("COMPLETE");
    expect(finished.view.resultText).toMatch(/won by|tied|No result/);
    // A planned stoppage shows only once it has happened.
    expect(finished.view.stoppages.length).toBeLessThanOrEqual(2);
    const reopened = createRainRuntime(worldBytes, manifest).open(JSON.parse(JSON.stringify(finished.record)));
    expect(reopened.view).toEqual(finished.view);
    expect(reopened.record).toEqual(finished.record);
    expect(() => createRainRuntime(worldBytes, manifest).open({ ...finished.record, stateSha256: "f".repeat(64) })).toThrow("LC_RAIN_RECORD_STATE_MISMATCH");
    expect(() => createRainRuntime(worldBytes, manifest).open({ ...finished.record, commands: finished.record.commands.slice(0, 5) })).toThrow("LC_RAIN_RECORD_STATE_MISMATCH");
  }, 60_000);

  it("shows the revised target and rain log once rain stops play", () => {
    const runtime = createRainRuntime(worldBytes, manifest);
    // Search a few seeds for one where rain falls during the match.
    for (let n = 0; n < 10; n++) {
      const m = runtime.simulateToEnd(runtime.start({ ...start, gameId: `rain-log-${n}`, seed: `rain-log-${n}` }).record);
      if (m.view.stoppages.length === 0) continue;
      expect(m.view.stoppages[0]).toMatch(/^Rain/);
      expect(m.view.innings[1]!.target).toBe(m.view.target);
      expect(m.view.resultText).toMatch(/\(rain rules\)\.$|^No result/);
      return;
    }
    throw new Error("no seed with rain found");
  }, 60_000);

  it("refuses two copies of the same team", () => {
    const runtime = createRainRuntime(worldBytes, manifest);
    expect(() => runtime.start({ ...start, teamIds: ["team-01", "team-01"] })).toThrow("Choose two different teams.");
  });
});
