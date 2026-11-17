import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ScenarioChallengeSchema,
  ScenarioRecordLedgerSchema,
  WorldPackSchema,
  canonicalJson,
  type ScenarioChallenge,
} from "@lcxxvi/contracts";
import { SCENARIO_PACK, scenarioById } from "@lcxxvi/data";
import {
  MAX_SCENARIO_ATTEMPTS,
  emptyScenarioLedger,
  evaluateScenarioResult,
  recordScenarioFinish,
  recordScenarioStart,
  scenarioAttemptFor,
} from "@lcxxvi/projections";
import {
  executeODICommand,
  executeRed5Command,
  executeT20Command,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  red5FixtureAutopilotStep,
} from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import { scenarioResultOf, startScenarioOnController, type ScenarioController } from "../../apps/web/src/match/scenario-runtime.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const worldText = readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.json"), "utf8");
const worldBytes = new TextEncoder().encode(worldText);
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
const world = WorldPackSchema.parse(JSON.parse(worldText));

function controllerFor(challenge: ScenarioChallenge, gameId = "game-scenario-test") {
  const seed = () => challenge.seed;
  const ids = () => ({ gameId, matchId: challenge.matchId });
  const ctl =
    challenge.format === "T20"
      ? createMatchController(worldBytes, manifest, seed, ids)
      : challenge.format === "ODI"
        ? createODIMatchController(worldBytes, manifest, seed, ids)
        : createRed5MatchController(worldBytes, manifest, seed, ids);
  return ctl as unknown as ScenarioController;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the three engine sessions share these fields
function finishWithAutopilot(session: any): any {
  let s = session;
  while (s.core.phase !== "COMPLETE") {
    s =
      s.setup.format === "T20"
        ? executeT20Command(s, fixtureAutopilotStep(s)).session
        : s.setup.format === "ODI"
          ? executeODICommand(s, odiFixtureAutopilotStep(s)).session
          : executeRed5Command(s, red5FixtureAutopilotStep(s)).session;
  }
  return s;
}

describe("Stage 12 curated scenario pack", () => {
  it("ships 6 to 8 fictional challenges across T20, ODI and red-ball on the frozen world", () => {
    expect(SCENARIO_PACK.length).toBeGreaterThanOrEqual(6);
    expect(SCENARIO_PACK.length).toBeLessThanOrEqual(8);
    expect(new Set(SCENARIO_PACK.map((s) => s.format))).toEqual(new Set(["T20", "ODI", "RED_BALL"]));
    expect(new Set(SCENARIO_PACK.map((s) => s.scenarioId)).size).toBe(SCENARIO_PACK.length);
    const teams = new Set(world.teams.map((t) => t.teamId));
    const grounds = new Set(world.grounds.map((g) => g.groundId));
    for (const challenge of SCENARIO_PACK) {
      expect(ScenarioChallengeSchema.parse(challenge)).toEqual(challenge);
      expect(challenge.sourceType).toBe("FICTIONAL_CURATED");
      expect(challenge.teamIds[0]).not.toBe(challenge.teamIds[1]);
      for (const teamId of challenge.teamIds) expect(teams.has(teamId)).toBe(true);
      expect(grounds.has(challenge.groundId)).toBe(true);
      expect(challenge.teamIds).toContain(challenge.playerTeamId);
      expect(scenarioById(challenge.scenarioId)).toBe(challenge);
    }
    expect(scenarioById("no-such-scenario")).toBeNull();
  });

  it("every challenge reaches exactly its pinned checkpoint on the real engines", () => {
    for (const challenge of SCENARIO_PACK) {
      const ctl = controllerFor(challenge);
      const response = startScenarioOnController(ctl, challenge, "ui-1");
      expect(response.error, challenge.scenarioId).toBeNull();
      expect(response.revision).toBe(challenge.checkpoint.revision);
      expect(response.view?.phase).not.toBe("COMPLETE");
      const session = ctl.snapshot()!;
      // Nothing was staged by hand: the checkpoint session is a plain engine session the controller accepted on restore.
      expect(session.setup.seed).toBe(challenge.seed);
      expect(session.commands.every((c) => c.actorId === "SYSTEM" || c.actorId.startsWith("AI:"))).toBe(true);
    }
  }, 120_000);

  it("each attempt's fresh game id does not change the situation", () => {
    // One challenge per format: the game id is the save identity only; the seed and match id fix the match.
    for (const format of ["T20", "ODI", "RED_BALL"] as const) {
      const challenge = SCENARIO_PACK.find((s) => s.format === format)!;
      const a = controllerFor(challenge, "game-first-attempt");
      const b = controllerFor(challenge, "game-another-attempt");
      startScenarioOnController(a, challenge, "ui-1");
      startScenarioOnController(b, challenge, "ui-1");
      // Hashes cover the game id, so compare what happened ball by ball.
      expect(canonicalJson(b.snapshot()!.events.map((e) => e.payload))).toBe(canonicalJson(a.snapshot()!.events.map((e) => e.payload)));
    }
  }, 120_000);

  it("refuses a challenge whose declared checkpoint the engine does not produce", () => {
    const challenge = SCENARIO_PACK[0]!;
    const tampered = { ...challenge, checkpoint: { ...challenge.checkpoint, runs: challenge.checkpoint.runs + 1 } };
    expect(() => startScenarioOnController(controllerFor(tampered), tampered, "ui-1")).toThrow("SCENARIO_CHECKPOINT_MISMATCH");
    // The match id is part of the recipe: the same seed under another match id is a different match.
    const otherMatch = { ...challenge, matchId: "another-match" };
    expect(() => startScenarioOnController(controllerFor(otherMatch), otherMatch, "ui-1")).toThrow("SCENARIO_CHECKPOINT_MISMATCH");
    const unreachable = { ...challenge, checkpoint: { ...challenge.checkpoint, legalBalls: 119 * 6 } };
    expect(() => startScenarioOnController(controllerFor(unreachable), unreachable, "ui-1")).toThrow("SCENARIO_CHECKPOINT_UNREACHED");
    const busy = controllerFor(challenge);
    startScenarioOnController(busy, challenge, "ui-1");
    expect(() => startScenarioOnController(busy, challenge, "ui-2")).toThrow("SCENARIO_CONTROLLER_BUSY");
  });

  it("a challenge plays on to a result that the objective judges", () => {
    for (const challenge of SCENARIO_PACK.filter((s) => s.format === "T20")) {
      const ctl = controllerFor(challenge);
      startScenarioOnController(ctl, challenge, "ui-1");
      const finished = finishWithAutopilot(ctl.snapshot());
      const result = scenarioResultOf(finished)!;
      expect(result).not.toBeNull();
      const evaluation = evaluateScenarioResult(challenge, result);
      const won = result.kind === "WIN" && result.winnerTeamId === challenge.playerTeamId;
      expect(evaluation.outcome).toBe(won ? "COMPLETED" : "FAILED");
    }
  });
});

describe("Stage 12 scenario scoring and personal bests", () => {
  const challenge = SCENARIO_PACK[0]!;
  const sha = "a".repeat(64);
  const start = (gameId: string) => ({ gameId, scenarioId: challenge.scenarioId, challengeSha256: sha, playerTeamId: challenge.playerTeamId, objective: challenge.objective });
  const win = (wickets: number) => ({ kind: "WIN" as const, winnerTeamId: challenge.playerTeamId, marginType: "WICKETS" as const, marginRuns: null, marginWickets: wickets });
  const loss = { kind: "WIN" as const, winnerTeamId: challenge.teamIds.find((t) => t !== challenge.playerTeamId)!, marginType: "RUNS" as const, marginRuns: 4, marginWickets: null };

  it("judges WIN and AVOID_DEFEAT objectives", () => {
    expect(evaluateScenarioResult(challenge, win(3))).toEqual({ outcome: "COMPLETED", marginType: "WICKETS", marginValue: 3, text: "Won by 3 wickets. Challenge completed." });
    expect(evaluateScenarioResult(challenge, loss).outcome).toBe("FAILED");
    const draw = { kind: "DRAW" as const, winnerTeamId: null, marginType: null, marginRuns: null, marginWickets: null };
    expect(evaluateScenarioResult(challenge, draw).outcome).toBe("FAILED");
    const survive = { playerTeamId: challenge.playerTeamId, objective: "AVOID_DEFEAT" as const };
    expect(evaluateScenarioResult(survive, draw)).toEqual({ outcome: "COMPLETED", marginType: null, marginValue: null, text: "Drawn. Challenge completed." });
    expect(evaluateScenarioResult(survive, { ...draw, kind: "TIE" }).outcome).toBe("COMPLETED");
    expect(evaluateScenarioResult(survive, loss).outcome).toBe("FAILED");
    expect(evaluateScenarioResult(survive, { ...draw, kind: "NO_RESULT" }).outcome).toBe("FAILED");
  });

  it("counts attempts at start, scores each game once and keeps the best margin", () => {
    let ledger = recordScenarioStart(emptyScenarioLedger(), start("game-a"));
    expect(recordScenarioStart(ledger, start("game-a"))).toEqual(ledger);
    ledger = recordScenarioStart(ledger, start("game-b"));
    ledger = recordScenarioStart(ledger, start("game-c"));
    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0]!.attempts).toBe(3);
    ledger = recordScenarioFinish(ledger, "game-a", evaluateScenarioResult(challenge, win(2)));
    const again = recordScenarioFinish(ledger, "game-a", evaluateScenarioResult(challenge, win(9)));
    expect(again).toEqual(ledger);
    ledger = recordScenarioFinish(ledger, "game-b", evaluateScenarioResult(challenge, win(5)));
    ledger = recordScenarioFinish(ledger, "game-c", evaluateScenarioResult(challenge, loss));
    expect(ledger.records[0]).toMatchObject({ attempts: 3, completions: 2, failures: 1, bestMarginType: "WICKETS", bestMarginValue: 5, lastOutcome: "FAILED" });
    expect(scenarioAttemptFor(ledger, "game-b")).toMatchObject({ outcome: "COMPLETED", resultText: "Won by 5 wickets. Challenge completed." });
    expect(recordScenarioFinish(ledger, "unknown-game", evaluateScenarioResult(challenge, win(1)))).toEqual(ledger);
    expect(ScenarioRecordLedgerSchema.parse(ledger)).toEqual(ledger);
  });

  it("stays bounded: old attempts drop off but remain counted", () => {
    let ledger = emptyScenarioLedger();
    for (let i = 0; i < MAX_SCENARIO_ATTEMPTS + 10; i += 1) ledger = recordScenarioStart(ledger, start(`game-${i}`));
    expect(ledger.attempts).toHaveLength(MAX_SCENARIO_ATTEMPTS);
    expect(ledger.attempts[0]!.gameId).toBe("game-10");
    expect(ledger.records[0]!.attempts).toBe(MAX_SCENARIO_ATTEMPTS + 10);
    // A dropped attempt can no longer be scored.
    expect(recordScenarioFinish(ledger, "game-0", evaluateScenarioResult(challenge, win(1)))).toEqual(ledger);
  });

  it("rejects inconsistent ledgers", () => {
    const ledger = recordScenarioStart(emptyScenarioLedger(), start("game-a"));
    expect(() => ScenarioRecordLedgerSchema.parse({ ...ledger, attempts: [...ledger.attempts, ...ledger.attempts] })).toThrow("SCENARIO_ATTEMPT_DUPLICATE");
    expect(() => ScenarioRecordLedgerSchema.parse({ ...ledger, records: [{ ...ledger.records[0]!, completions: 2 }] })).toThrow("SCENARIO_RECORD_COUNTS");
    expect(() => ScenarioRecordLedgerSchema.parse({ ...ledger, attempts: [{ ...ledger.attempts[0]!, outcome: "COMPLETED" }] })).toThrow("SCENARIO_ATTEMPT_RESULT");
  });
});
