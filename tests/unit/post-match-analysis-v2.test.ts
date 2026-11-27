import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  POST_MATCH_ANALYSIS_V2_VERSION,
  POST_MATCH_ANALYSIS_VERSION,
  POST_MATCH_DECISION_EFFECT,
  POST_MATCH_DECISION_EXPERIMENTS_V2,
  POST_MATCH_EVIDENCE_V2,
  POST_MATCH_EXPERIMENTS_V2,
  POST_MATCH_MEASURED_NOTES,
  POST_MATCH_MEASURED_NOTES_V2,
  postMatchEffectV2,
  projectPostMatchAnalysis,
  projectPostMatchAnalysisV2,
  type PostMatchAnalysisInput,
  type PostMatchAnalysisV2Input,
  type PostMatchDecisionKind,
} from "@lcxxvi/projections";
import { T20_BATTING_POLICY_V3_ID, T20_TACTICAL_CAPTAIN_ID } from "@lcxxvi/ai";
import {
  createT20Session,
  executeT20Command,
  fixtureAutopilotStep,
  projectT20Scorecard,
  validateT20MatchSetup,
  type T20Session,
} from "@lcxxvi/simulation";
import type { T20Command } from "@lcxxvi/contracts";

const setup = validateT20MatchSetup(JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8")),
  readFileSync("packages/data/worlds/fictional-eight-01.json"),
  JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8")));
const USER_TEAM = setup.teams[0].teamId;
const KINDS: PostMatchDecisionKind[] = ["SELECTION", "TOSS", "INNINGS_CHOICE", "BATTING_PLAN", "BOWLING_PLAN", "FIELD", "BOWLER", "BATTER"];

/** A decision's recorded facts, without its measured note (V1 and V2 differ only there). */
function facts(d: { kind: string; teamId: string; actor: string; inningsIndex: number | null; atLegalBall: number | null; when: string; summary: string; followUp: unknown; followed: string | null }) {
  return { kind: d.kind, teamId: d.teamId, actor: d.actor, inningsIndex: d.inningsIndex, atLegalBall: d.atLegalBall, when: d.when, summary: d.summary, followUp: d.followUp, followed: d.followed };
}

/** The fixture autopilot plays both sides; team-01's picks are sent as the player's, team-02's stay the computer's. */
function managedMatch(): T20Session {
  let s = createT20Session(setup);
  let planned = false;
  while (s.core.phase !== "COMPLETE") {
    let command = fixtureAutopilotStep(s) as T20Command;
    if (command.actorId === `AI:${USER_TEAM}`) command = { ...command, actorId: `USER:${USER_TEAM}` } as T20Command;
    const inn = s.core.innings[s.core.activeInningsIndex];
    if (!planned && s.core.phase === "READY" && inn && inn.innings.battingTeamId === USER_TEAM && inn.innings.legalBalls === 30) {
      s = executeT20Command(s, { commandId: `plan-${s.revision + 1}`, expectedRevision: s.revision, actorId: `USER:${USER_TEAM}`, kind: "SET_BATTING_PLAN",
        payload: { playerId: inn.innings.northBatterId!, aggression: 4, intent: "NORMAL" } }).session;
      planned = true;
      continue;
    }
    s = executeT20Command(s, command).session;
  }
  return s;
}

function v1InputFor(s: T20Session): PostMatchAnalysisInput {
  return {
    events: s.events,
    commands: s.commands,
    scorecard: projectT20Scorecard(s),
    teams: s.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds] })),
    suggestedXi: { [USER_TEAM]: [...s.setup.teams[0].playerIds] },
    names: Object.fromEntries(s.setup.teams.flatMap((t) => t.xi.map((p) => [p.playerId, p.name]))),
    teamNames: Object.fromEntries(s.setup.teams.map((t) => [t.teamId, `Team ${t.teamId}`])),
  };
}
function v2InputFor(s: T20Session): PostMatchAnalysisV2Input {
  return {
    ...v1InputFor(s),
    recordedVersions: { model: s.setup.versions.model, modelHash: s.setup.versions.modelHash, rules: s.setup.versions.rules },
    buildCaptain: { captain: T20_TACTICAL_CAPTAIN_ID, battingPolicy: T20_BATTING_POLICY_V3_ID },
  };
}

describe("LC_POST_MATCH_ANALYSIS_V2", () => {
  const session = managedMatch();
  const input = v2InputFor(session);
  const analysis = projectPostMatchAnalysisV2(input);
  const v1 = projectPostMatchAnalysis(v1InputFor(session));

  test("is versioned, deterministic and does not touch its inputs", () => {
    const before = JSON.stringify(input);
    expect(analysis.version).toBe(POST_MATCH_ANALYSIS_V2_VERSION);
    expect(analysis.rulesVersion).toBe(POST_MATCH_ANALYSIS_VERSION);
    expect(projectPostMatchAnalysisV2(structuredClone(input))).toEqual(analysis);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("keeps V1's phases, turning points and decisions, and leaves V1's output as it was", () => {
    expect(v1.version).toBe("LC_POST_MATCH_ANALYSIS_V1");
    expect(analysis.matchId).toBe(v1.matchId);
    expect(analysis.phases).toEqual(v1.phases);
    expect(analysis.turningPoints).toEqual(v1.turningPoints);
    expect(analysis.commandCounts).toEqual(v1.commandCounts);
    expect(analysis.decisions.map(facts)).toEqual(v1.decisions.map(facts));
    // V1 still carries V1's own notes (the captain V2 measurement), unchanged.
    for (const d of v1.decisions) expect(d.measured).toBe(POST_MATCH_DECISION_EFFECT[d.kind]);
    expect(POST_MATCH_MEASURED_NOTES.SMALL).toMatch(/^Measured: a small effect at most/);
  });

  test("names the model recorded in the match's own setup, and says the captain version is not recorded", () => {
    expect(session.setup.versions.model).toBe("synthetic-alpha-01");
    expect(analysis.versions.model).toBe(session.setup.versions.model);
    expect(analysis.versions.modelHash).toBe(session.setup.versions.modelHash);
    expect(analysis.versions.rules).toBe("LC_T20_01");
    expect(analysis.versions.evidenceModelMatches).toBe(true);
    expect(analysis.versions.computerCaptainRecorded).toBe(false);
    // The record credits the computer with team-02's picks and nothing names a captain or batting policy version.
    expect(analysis.versions.computerDecisions).toBe(Object.values(v1.commandCounts).reduce((sum, c) => sum + c.ai, 0));
    expect(analysis.versions.computerDecisions).toBeGreaterThan(0);
    const record = JSON.stringify({ setup: session.setup, commands: session.commands, events: session.events });
    expect(record).not.toMatch(/TACTICAL_CAPTAIN|BATTING_POLICY/);
    for (const command of session.commands) expect(command.actorId).toMatch(/^(SYSTEM|USER:team-\d+|AI:team-\d+)$/);
    expect(analysis.versions.buildCaptain).toEqual({ captain: "LC_T20_TACTICAL_CAPTAIN_V6", battingPolicy: "LC_T20_BATTING_POLICY_V3" });
  });

  test("does not claim the notes describe a match whose model is another or unknown", () => {
    const unknown = projectPostMatchAnalysisV2({ ...input, recordedVersions: null });
    expect(unknown.versions).toMatchObject({ model: null, modelHash: null, rules: null, evidenceModelMatches: false });
    const other = projectPostMatchAnalysisV2({ ...input, recordedVersions: { ...input.recordedVersions!, model: "calibrated-t20-01" } });
    expect(other.versions.model).toBe("calibrated-t20-01");
    expect(other.versions.evidenceModelMatches).toBe(false);
  });

  test("the evidence is the committed V6 tactical validation of synthetic-alpha-01, value for value", () => {
    const file = JSON.parse(readFileSync(POST_MATCH_EVIDENCE_V2.file, "utf8"));
    expect(file.version).toBe(POST_MATCH_EVIDENCE_V2.validationVersion);
    expect(file.model).toBe(POST_MATCH_EVIDENCE_V2.model);
    expect(file.captain).toBe(POST_MATCH_EVIDENCE_V2.captain);
    expect(file.advance).toBe(POST_MATCH_EVIDENCE_V2.advance);
    expect(POST_MATCH_EVIDENCE_V2.captain).toBe(T20_TACTICAL_CAPTAIN_ID);
    expect(POST_MATCH_EVIDENCE_V2.battingPolicy).toBe(T20_BATTING_POLICY_V3_ID);
    const results = file.results as { experiment: string; matches: number; goodWinPercentOfDecided: number; goodWinPercent95: number[]; meanRunDifference: number; meanRunDifference95: number[] }[];
    expect(Object.keys(POST_MATCH_EXPERIMENTS_V2).sort()).toEqual(results.map((r) => r.experiment).sort());
    for (const r of results) {
      expect(r.matches).toBe(POST_MATCH_EVIDENCE_V2.matchesPerExperiment);
      const quoted = POST_MATCH_EXPERIMENTS_V2[r.experiment]!;
      expect([quoted.goodWinPercentOfDecided, ...quoted.goodWinPercent95, quoted.meanRunDifference, ...quoted.meanRunDifference95])
        .toEqual([r.goodWinPercentOfDecided, ...r.goodWinPercent95, r.meanRunDifference, ...r.meanRunDifference95]);
    }
    // The page that reports it names the date and the file, and V6 with batting policy V3.
    const page = readFileSync(POST_MATCH_EVIDENCE_V2.page, "utf8");
    expect(page).toContain(POST_MATCH_EVIDENCE_V2.dateText);
    expect(page).toContain("tactical-validation-v6-*.json");
    expect(page).toContain(POST_MATCH_EVIDENCE_V2.captain);
    expect(page).toContain(POST_MATCH_EVIDENCE_V2.battingPolicy);
  });

  test("each note's effect follows from its experiments' intervals, and quotes their figures", () => {
    expect(Object.fromEntries(KINDS.map((k) => [k, postMatchEffectV2(k)]))).toEqual({
      SELECTION: "MIXED", BATTER: "CLEAR", BATTING_PLAN: "MIXED",
      BOWLER: "NONE_DETECTED", BOWLING_PLAN: "NONE_DETECTED", FIELD: "NONE_DETECTED",
      TOSS: "NOT_MEASURED", INNINGS_CHOICE: "NOT_MEASURED",
    });
    for (const kind of KINDS) {
      const note = POST_MATCH_MEASURED_NOTES_V2[kind];
      const ids = POST_MATCH_DECISION_EXPERIMENTS_V2[kind];
      if (ids.length === 0) expect(note).toBe("Not measured.");
      else expect(note).toMatch(/^Measured under these versions/);
      // Every single-experiment share is quoted with its interval; the bowling plan range quotes its ends.
      if (kind !== "BOWLING_PLAN") for (const id of ids) {
        const e = POST_MATCH_EXPERIMENTS_V2[id]!;
        expect(note).toContain(`${e.goodWinPercentOfDecided.toFixed(1)}% of decided matches, 95% interval ${e.goodWinPercent95[0].toFixed(1)} to ${e.goodWinPercent95[1].toFixed(1)}`);
      }
      if (postMatchEffectV2(kind) === "NONE_DETECTED") expect(note).toContain("shown as a record only");
      expect(note).not.toMatch(/[–—]/);
      expect(note).not.toMatch(/because|thanks to|led to|caused|won the match|lost the match|win (chance|probability)/i);
    }
    expect(POST_MATCH_MEASURED_NOTES_V2.BOWLING_PLAN).toContain("between 49.5% and 52.3% of decided matches");
    expect(POST_MATCH_MEASURED_NOTES_V2.BATTING_PLAN).toContain("Batting intent was not measured.");
    for (const d of analysis.decisions) {
      expect(d.measured).toBe(postMatchEffectV2(d.kind));
      expect(d.measuredNote).toBe(POST_MATCH_MEASURED_NOTES_V2[d.kind]);
    }
  });
});

describe("LC_POST_MATCH_ANALYSIS_V2 in the match view", () => {
  test("the completed match's view carries V2 with the setup's model, equal to projecting the stored session", async () => {
    const { createMatchController } = await import("../../apps/web/src/match/controller.js");
    const { UI_VERSION } = await import("../../apps/web/src/match/protocol.js");
    const world = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
    const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
    const c = createMatchController(world, manifest, () => "pma-v2-controller-seed");
    const boot = c.handle({ version: UI_VERSION, requestId: "ui-1", expectedRevision: 0, type: "BOOT" });
    const teams = boot.catalog!.teams;
    let response = c.handle({ version: UI_VERSION, requestId: "ui-2", expectedRevision: 0, type: "START", format: "T20",
      selections: [teams[0]!.suggested, teams[1]!.suggested], groundId: boot.catalog!.grounds[0]!.id });
    expect(response.error).toBeNull();
    let n = 0;
    while (response.view!.phase !== "COMPLETE") {
      expect(response.view!.postMatchAnalysis ?? null).toBeNull();
      const s = c.snapshot()!;
      const proposed = fixtureAutopilotStep(s) as T20Command;
      const id = `ui-${(n += 1) + 2}`;
      const actorId = proposed.actorId === "SYSTEM" ? "SYSTEM" : proposed.actorId.replace(/^AI:/, "USER:");
      response = c.handle({ version: UI_VERSION, requestId: id, expectedRevision: s.revision, type: "COMMAND", origin: "HUMAN",
        command: { ...proposed, actorId, commandId: id, expectedRevision: s.revision } });
      expect(response.error).toBeNull();
    }
    const view = response.view!;
    const analysis = view.postMatchAnalysis!;
    const s = c.snapshot()!;
    expect(analysis.version).toBe(POST_MATCH_ANALYSIS_V2_VERSION);
    expect(analysis.versions.model).toBe(s.setup.versions.model);
    expect(analysis.versions.computerDecisions).toBe(0);
    expect(analysis.evidence).toEqual(POST_MATCH_EVIDENCE_V2);
    expect(analysis).toEqual(projectPostMatchAnalysisV2({
      events: s.events, commands: s.commands, scorecard: projectT20Scorecard(s),
      teams: s.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds] })),
      suggestedXi: Object.fromEntries(teams.map((t) => [t.id, t.suggested.playerIds])),
      names: view.names, teamNames: Object.fromEntries(view.teams.map((t) => [t.id, t.name])),
      recordedVersions: { model: s.setup.versions.model, modelHash: s.setup.versions.modelHash, rules: s.setup.versions.rules },
      buildCaptain: { captain: T20_TACTICAL_CAPTAIN_ID, battingPolicy: T20_BATTING_POLICY_V3_ID },
    }));
  }, 60_000);
});
