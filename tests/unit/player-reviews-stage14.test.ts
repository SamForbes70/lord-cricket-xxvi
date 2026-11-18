import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRA_RULES_RECORD_SCHEMA_ID, ExtraRulesRecordSchema, REVIEWS_PER_INNINGS } from "@lcxxvi/contracts";
import {
  buildRainSetup,
  createRainMatch,
  executeRainCommand,
  rainAutopilotCommand,
  rainMatchRecord,
  rainPendingDecision,
  rainStateSha256,
  runAutopilotRainMatch,
  verifyRainMatchRecord,
  UMPIRE_POLICY,
  type RainMatchState,
  type RainSetup,
  type ReviewLogEntry,
} from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createRainRuntime } from "../../apps/web/src/rain/rain-runtime.js";

// Stage 14 player reviews (owner decisions B1a to B5a, 18 November 2026; docs/DRS_PROPOSAL.md): opt-in rule sets
// LC_T20_DRS_01 and LC_ODI_DRS_01 hosted by the rain engine, exhibitions only.
const root = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
const catalog = createMatchController(worldBytes, manifest, () => "catalog").currentResponse("ui-0").catalog!;
const pick = (id: string) => catalog.teams.find((t) => t.id === id)!.suggested;
const REVIEWS_ONLY = { rain: false, reviews: true };

function setupFor(format: "T20" | "ODI", seed: string): RainSetup {
  return buildRainSetup({ format, gameId: `drs-g-${seed}`, matchId: `drs-m-${seed}`, seed, groundId: "ground-01", selectedTeams: [pick("team-01"), pick("team-02")] }, worldBytes, manifest);
}

/** Plays with the automatic captains and checks the review count after every command. */
function playChecked(setup: RainSetup, options = REVIEWS_ONLY): { state: RainMatchState; prompts: number } {
  let state = createRainMatch(setup, options);
  let prompts = 0;
  for (let guard = 0; state.phase !== "COMPLETE"; guard++) {
    expect(guard).toBeLessThan(6000);
    if (state.phase === "AWAITING_REVIEW") prompts++;
    state = executeRainCommand(setup, state, rainAutopilotCommand(setup, state)!);
    for (const left of Object.values(state.reviews!.reviewsLeft)) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(REVIEWS_PER_INNINGS);
    }
  }
  return { state, prompts };
}

function checkLog(log: ReviewLogEntry[]): void {
  for (const e of log) {
    if (e.outcome === "NOT_REVIEWED" || e.outcome === "NO_REVIEWS_LEFT" || e.outcome === "UMPIRES_CALL") expect(e.finalOut).toBe(e.onFieldOut);
    if (e.outcome === "OVERTURNED") expect(e.finalOut).toBe(!e.onFieldOut);
    if (e.outcome === "STRUCK_DOWN") expect(e.finalOut).toBe(e.onFieldOut);
    // The side that reviews is the one the on-field decision went against.
    if (e.kind === "LBW" && (e.outcome === "OVERTURNED" || e.outcome === "STRUCK_DOWN" || e.outcome === "UMPIRES_CALL")) expect(e.tracking).not.toBeNull();
    if (e.outcome === "NOT_REVIEWED" || e.outcome === "NO_REVIEWS_LEFT") expect(e.tracking).toBeNull();
    if (e.outcome === "UMPIRES_CALL") expect(Object.values(e.tracking!)).toContain("UMPIRES_CALL");
  }
}

describe("Stage 14 player reviews", () => {
  it("keeps an existing rain-only record byte-for-byte replayable", () => {
    const record = JSON.parse(readFileSync(resolve(root, "tests/fixtures/rain/rain-match-record-v1.json"), "utf8"));
    expect(record.schemaId).toBe("LC_RAIN_MATCH_RECORD_V1");
    const setup = buildRainSetup({ format: "T20", ...record }, worldBytes, manifest);
    const state = verifyRainMatchRecord(setup, record);
    expect(rainStateSha256(state)).toBe(record.stateSha256);
    expect(state.reviews).toBeUndefined();
    expect(rainMatchRecord(setup, state, record.commands)).toEqual(record);
  });

  it("plays T20 and one-day matches with reviews to a result, counting reviews correctly", () => {
    let appeals = 0;
    let reviewed = 0;
    const outcomes = new Set<string>();
    for (const [format, seeds] of [
      ["T20", ["drs-a", "drs-b", "drs-c", "drs-d", "drs-e", "drs-f", "drs-g", "drs-h"]],
      ["ODI", ["drs-a", "drs-b"]],
    ] as const) {
      for (const seed of seeds) {
        const { state, prompts } = playChecked(setupFor(format, seed));
        expect(state.result).not.toBeNull();
        expect(state.stoppages).toHaveLength(0);
        expect(state.plan.stoppages).toHaveLength(0);
        // A review prompt is occasional, not every few balls.
        expect(prompts).toBeLessThan(format === "T20" ? 25 : 50);
        checkLog(state.reviews!.log);
        appeals += state.reviews!.log.length;
        reviewed += state.reviews!.log.filter((e) => e.outcome === "OVERTURNED" || e.outcome === "STRUCK_DOWN" || e.outcome === "UMPIRES_CALL").length;
        state.reviews!.log.forEach((e) => outcomes.add(e.outcome));
      }
    }
    expect(appeals).toBeGreaterThan(10);
    expect(reviewed).toBeGreaterThan(0);
    expect(outcomes).toContain("NOT_REVIEWED");
  }, 120_000);

  it("stores reviews matches in the new record version, replays them, and refuses tampering", () => {
    const setup = setupFor("T20", "drs-record");
    const { state, commands } = runAutopilotRainMatch(setup, REVIEWS_ONLY);
    const record = rainMatchRecord(setup, state, commands);
    expect(record.schemaId).toBe(EXTRA_RULES_RECORD_SCHEMA_ID);
    expect(ExtraRulesRecordSchema.parse(record)).toMatchObject({ rain: false, reviewRulesId: "LC_T20_DRS_01" });
    expect(rainStateSha256(verifyRainMatchRecord(setup, JSON.parse(JSON.stringify(record))))).toBe(rainStateSha256(state));
    expect(() => verifyRainMatchRecord(setup, { ...record, reviewRulesId: "LC_ODI_DRS_01" })).toThrow("LC_RAIN_RECORD_FORMAT_MISMATCH");
    expect(() => verifyRainMatchRecord(setup, { ...record, rain: false, reviewRulesId: null })).toThrow("LC_RAIN_RECORD_NO_RULES");
    // Replayed without reviews, the same commands no longer fit.
    expect(() => verifyRainMatchRecord(setup, { ...record, rain: true, reviewRulesId: null })).toThrow();
    // Rain and reviews together.
    const both = runAutopilotRainMatch(setupFor("T20", "drs-both"), { rain: true, reviews: true });
    expect(both.state.result).not.toBeNull();
    expect(rainMatchRecord(setupFor("T20", "drs-both"), both.state, both.commands)).toMatchObject({ rain: true, reviewRulesId: "LC_T20_DRS_01" });
    expect(() => createRainMatch(setup, { rain: false, reviews: false })).toThrow("LC_RAIN_NO_RULES_CHOSEN");
  }, 120_000);

  it("only lets the side the decision went against review, and only while a decision is pending", () => {
    const setup = setupFor("T20", "drs-turns");
    let state = createRainMatch(setup, REVIEWS_ONLY);
    expect(() => executeRainCommand(setup, state, { kind: "REVIEW_DECISION", teamId: "team-01", review: true })).toThrow("LC_RAIN_WRONG_PHASE");
    while (state.phase !== "AWAITING_REVIEW") {
      expect(state.phase).not.toBe("COMPLETE");
      state = executeRainCommand(setup, state, rainAutopilotCommand(setup, state)!);
    }
    const pending = state.reviews!.pending!;
    const innings = state.innings[state.activeInningsIndex]!.innings;
    expect(pending.reviewTeamId).toBe(pending.onFieldOut ? innings.battingTeamId : innings.bowlingTeamId);
    expect(rainPendingDecision(setup, state)).toEqual({ teamId: pending.reviewTeamId, decision: "REVIEW" });
    const other = setup.teams.find((t) => t.teamId !== pending.reviewTeamId)!.teamId;
    expect(() => executeRainCommand(setup, state, { kind: "REVIEW_DECISION", teamId: other, review: true })).toThrow("LC_RAIN_NOT_REVIEWING_TEAM");
    expect(() => executeRainCommand(setup, state, { kind: "BOWL", scope: "BALL" })).toThrow("LC_RAIN_WRONG_PHASE");
    // Accepting keeps the on-field decision and the review.
    const before = state.reviews!.reviewsLeft[pending.reviewTeamId]!;
    const accepted = executeRainCommand(setup, state, { kind: "REVIEW_DECISION", teamId: pending.reviewTeamId, review: false });
    expect(accepted.reviews!.log.at(-1)).toMatchObject({ outcome: "NOT_REVIEWED", finalOut: pending.onFieldOut });
    expect(accepted.reviews!.reviewsLeft[pending.reviewTeamId]).toBe(before);
    expect(accepted.innings[accepted.activeInningsIndex]!.innings.wickets - innings.wickets).toBe(pending.onFieldOut ? 1 : 0);
    // Reviewing decides on the reading: right decisions stand and cost a review, wrong ones are overturned for free.
    const reviewedState = executeRainCommand(setup, state, { kind: "REVIEW_DECISION", teamId: pending.reviewTeamId, review: true });
    const entry = reviewedState.reviews!.log.at(-1)!;
    if (pending.decisive === "UMPIRES_CALL") expect(entry).toMatchObject({ outcome: "UMPIRES_CALL", finalOut: pending.onFieldOut });
    else expect(entry.finalOut).toBe(pending.decisive === "OUT");
    expect(reviewedState.reviews!.reviewsLeft[pending.reviewTeamId]).toBe(entry.outcome === "STRUCK_DOWN" ? before - 1 : before);
  }, 60_000);

  it("never shows the hidden reading on screen before a review, and shows it after", () => {
    const runtime = createRainRuntime(worldBytes, manifest);
    let m = runtime.start({ format: "T20", gameId: "drs-view", matchId: "drs-view-m", seed: "drs-view", groundId: "ground-01", teamIds: ["team-01", "team-02"], rules: REVIEWS_ONLY });
    expect(m.view.rules).toEqual(REVIEWS_ONLY);
    expect(m.view.reviews?.left).toEqual([
      { teamName: catalog.teams.find((t) => t.id === "team-01")!.name, left: 0 },
      { teamName: catalog.teams.find((t) => t.id === "team-02")!.name, left: 0 },
    ]);
    // Both sides on the AI captain until a review is pending for the player's team.
    for (let guard = 0; guard < 400 && !(m.view.pending?.decision === "REVIEW" && m.view.pending.teamId === "team-01"); guard++) {
      if (m.view.phase === "COMPLETE") break;
      if (m.view.pending?.teamId === "team-01") {
        const d = m.view.pending.decision;
        m = runtime.command(
          m.record,
          d === "TOSS" ? { kind: "CALL_TOSS", teamId: "team-01", call: "HEADS" }
            : d === "INNINGS" ? { kind: "CHOOSE_INNINGS", teamId: "team-01", choice: "BAT" }
            : d === "BATTER" ? { kind: "SET_BATTER", teamId: "team-01", playerId: m.view.options[0]!.id }
            : d === "BOWLER" ? { kind: "SET_BOWLER", teamId: "team-01", playerId: m.view.options[0]!.id }
            : { kind: "REVIEW_DECISION", teamId: "team-01", review: false },
        );
      } else if (m.view.pending) m = runtime.aiDecisions(m.record, "team-01");
      else m = runtime.command(m.record, { kind: "BOWL", scope: "OVER" });
    }
    expect(m.view.pending).toMatchObject({ decision: "REVIEW", teamId: "team-01" });
    const shown = JSON.stringify(m.view);
    expect(m.view.reviews!.appeal!.text).toMatch(/^Appeal for (leg before|caught behind) against .+: given (OUT|NOT OUT)\.$/);
    expect(shown).not.toMatch(/Ball tracking|decisive|UMPIRES_CALL|missing|hitting/);
    const after = runtime.command(m.record, { kind: "REVIEW_DECISION", teamId: "team-01", review: true });
    expect(after.view.reviews!.log.at(-1)).toMatch(/reviewed/);
    expect(after.view.reviews!.appeal).toBeNull();
  }, 120_000);

  it("uses the approved starting numbers", () => {
    expect(UMPIRE_POLICY).toMatchObject({ lbwClearOutGivenOutBp: 8500, lbwUmpiresCallGivenOutBp: 5000, lbwNotOutGivenOutBp: 600, edgeGivenOutBp: 8000, noEdgeGivenOutBp: 400 });
    expect(REVIEWS_PER_INNINGS).toBe(2);
  });
});
