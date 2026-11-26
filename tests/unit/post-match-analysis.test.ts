import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  POST_MATCH_ANALYSIS_RULES,
  POST_MATCH_ANALYSIS_VERSION,
  POST_MATCH_DECISION_EFFECT,
  projectPostMatchAnalysis,
  type PostMatchAnalysisInput,
} from "@lcxxvi/projections";
import {
  createT20Session,
  executeT20Command,
  fixtureAutopilotStep,
  projectT20Scorecard,
  runFixtureT20,
  validateT20MatchSetup,
  type T20Session,
} from "@lcxxvi/simulation";
import type { T20Command } from "@lcxxvi/contracts";

function setupWithSeed(seed?: string) {
  const raw = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
  if (seed) raw.setup.seed = seed;
  return validateT20MatchSetup(raw, readFileSync("packages/data/worlds/fictional-eight-01.json"),
    JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8")));
}
const setup = setupWithSeed();
const USER_TEAM = setup.teams[0].teamId;

/** Plays the fixture autopilot, with team-01's picks sent as the player's own commands and two plan changes made. */
function managedMatch(): T20Session {
  let s = createT20Session(setup);
  let planned = 0;
  while (s.core.phase !== "COMPLETE") {
    let command = fixtureAutopilotStep(s) as T20Command;
    if (command.actorId === `AI:${USER_TEAM}`) command = { ...command, actorId: `USER:${USER_TEAM}` } as T20Command;
    const inn = s.core.innings[s.core.activeInningsIndex];
    if (s.core.phase === "READY" && inn && inn.innings.battingTeamId === USER_TEAM && planned === 0 && inn.innings.legalBalls === 30) {
      const ids = [inn.innings.northBatterId!, inn.innings.southBatterId!];
      for (const playerId of ids) {
        s = executeT20Command(s, { commandId: `plan-${s.revision + 1}`, expectedRevision: s.revision, actorId: `USER:${USER_TEAM}`, kind: "SET_BATTING_PLAN", payload: { playerId, aggression: 4, intent: "NORMAL" } }).session;
      }
      planned += 1;
      continue;
    }
    if (s.core.phase === "READY" && inn && inn.innings.bowlingTeamId === USER_TEAM && planned === 1 && inn.innings.legalBalls === 90 && inn.innings.bowlerId) {
      s = executeT20Command(s, { commandId: `bplan-${s.revision + 1}`, expectedRevision: s.revision, actorId: `USER:${USER_TEAM}`, kind: "SET_BOWLING_PLAN",
        payload: { bowlerId: inn.innings.bowlerId, line: "STUMPS", length: "YORKER", variationId: "stock", effort: "MAXIMUM" } }).session;
      planned += 1;
      continue;
    }
    s = executeT20Command(s, command).session;
  }
  return s;
}

function inputFor(s: T20Session): PostMatchAnalysisInput {
  const names = Object.fromEntries(s.setup.teams.flatMap((t) => t.xi.map((p) => [p.playerId, p.name])));
  return {
    events: s.events,
    commands: s.commands,
    scorecard: projectT20Scorecard(s),
    teams: s.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds] })),
    suggestedXi: { [USER_TEAM]: [...s.setup.teams[0].playerIds] },
    names,
    teamNames: Object.fromEntries(s.setup.teams.map((t) => [t.teamId, `Team ${t.teamId}`])),
  };
}

describe("LC_POST_MATCH_ANALYSIS_V1", () => {
  const session = managedMatch();
  const input = inputFor(session);
  const analysis = projectPostMatchAnalysis(input);

  test("is versioned, deterministic and does not touch its inputs", () => {
    const before = JSON.stringify(input);
    expect(analysis.version).toBe(POST_MATCH_ANALYSIS_VERSION);
    expect(projectPostMatchAnalysis(structuredClone(input))).toEqual(analysis);
    projectPostMatchAnalysis(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("phase lines add up to each innings in the scorecard", () => {
    expect(analysis.phases).toHaveLength(2);
    analysis.phases.forEach((phase, i) => {
      const innings = input.scorecard.innings[i]!;
      expect(phase.battingTeamId).toBe(innings.battingTeamId);
      expect(phase.lines.map((line) => line.phase)).toEqual(["POWERPLAY", "MIDDLE", "DEATH"]);
      expect(phase.lines.reduce((sum, line) => sum + line.runs, 0)).toBe(innings.runs);
      expect(phase.lines.reduce((sum, line) => sum + line.wickets, 0)).toBe(innings.wickets);
      expect(phase.lines.reduce((sum, line) => sum + line.legalBalls, 0)).toBe(innings.legalBalls);
      for (const line of phase.lines) if (line.reached) expect(line.legalBalls).toBeLessThanOrEqual((line.toOver - line.fromOver + 1) * 6);
    });
  });

  test("lists the player's own decisions with what followed, and keeps the computer's apart", () => {
    const mine = analysis.decisions.filter((d) => d.teamId === USER_TEAM && d.actor === "USER");
    const kinds = new Set(mine.map((d) => d.kind));
    for (const kind of ["BATTING_PLAN", "BOWLING_PLAN", "BOWLER", "BATTER"] as const) expect(kinds.has(kind)).toBe(true);
    const plan = mine.find((d) => d.kind === "BATTING_PLAN")!;
    // Two plan commands at the same ball are one decision.
    expect(mine.filter((d) => d.kind === "BATTING_PLAN")).toHaveLength(1);
    expect(plan.when).toMatch(/^Over 5\.0, \d+ for \d+$/);
    expect(plan.summary).toMatch(/aggression Balanced to Attack/);
    expect(plan.followUp!.legalBalls).toBe(POST_MATCH_ANALYSIS_RULES.followLegalBalls);
    expect(plan.followed).toMatch(/^The next 2 overs: \d+ runs?, \d+ wickets?\. Before it: \d+\.\d an over\.$/);
    expect(plan.measured).toBe(POST_MATCH_DECISION_EFFECT.BATTING_PLAN);
    const bowlingPlan = mine.find((d) => d.kind === "BOWLING_PLAN")!;
    expect(bowlingPlan.summary).toMatch(/length good to yorker, effort normal to maximum/);
    expect(bowlingPlan.measured).toBe("NONE_DETECTED");
    // Bowler choices are one line per bowler, and their overs add up to the innings.
    const spells = mine.filter((d) => d.kind === "BOWLER");
    const fielding = input.scorecard.innings.find((i) => i.bowlingTeamId === USER_TEAM)!;
    const overs = spells.flatMap((d) => d.summary.replace(/^Gave .+? overs? /, "").replace(/\.$/, "").split(/, | and /));
    expect(overs.length).toBe(Math.ceil(fielding.legalBalls / 6));
    expect(analysis.decisions.some((d) => d.teamId !== USER_TEAM && d.actor === "USER")).toBe(false);
    expect(analysis.commandCounts[USER_TEAM]!.user).toBeGreaterThan(0);
    expect(analysis.commandCounts[setup.teams[1].teamId]!.user).toBe(0);
    // Every line is plain fact: no causal words.
    for (const d of analysis.decisions) expect(`${d.summary} ${d.followed ?? ""}`).not.toMatch(/because|thanks to|led to|caused|won the match|lost the match/i);
  });

  test("selection compares the eleven with the suggested eleven", () => {
    const selection = analysis.decisions.find((d) => d.kind === "SELECTION" && d.teamId === USER_TEAM)!;
    expect(selection.summary).toBe("The eleven matched the suggested eleven.");
    const other = analysis.decisions.find((d) => d.kind === "SELECTION" && d.teamId !== USER_TEAM)!;
    expect(other.summary).toBe("No suggested eleven to compare with.");
    const changed = projectPostMatchAnalysis({ ...input, suggestedXi: { [USER_TEAM]: [...input.teams[0]!.playerIds.slice(1), "not-picked"] } });
    expect(changed.decisions.find((d) => d.kind === "SELECTION" && d.teamId === USER_TEAM)!.summary).toMatch(/^1 change from the suggested eleven: picked .+; left out not-picked\.$/);
  });

  test("turning points follow the documented rule and stay within the limit", () => {
    expect(analysis.turningPoints.length).toBeLessThanOrEqual(POST_MATCH_ANALYSIS_RULES.maxTurningPoints);
    for (const point of analysis.turningPoints) {
      expect(point.text.length).toBeGreaterThan(0);
      expect(point.text).not.toMatch(/[\u2013\u2014]/);
      if (point.kind === "COLLAPSE") expect(point.wickets).toBeGreaterThanOrEqual(POST_MATCH_ANALYSIS_RULES.collapseMinWickets);
      if (point.kind === "STAND") expect(point.runs).toBeGreaterThanOrEqual(POST_MATCH_ANALYSIS_RULES.standMinRuns);
    }
    const order = analysis.turningPoints.map((p) => p.inningsIndex * 100 + p.fromOver);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("finds a collapse when one is in the record, across many fixtures", () => {
    const kinds = new Set<string>();
    for (let n = 0; n < 6; n += 1) {
      const s = runFixtureT20(setupWithSeed(`pma-${n}`));
      const a = projectPostMatchAnalysis(inputFor(s));
      for (const p of a.turningPoints) kinds.add(p.kind);
      // A three-over window with three or more wickets must always be reported, as a collapse.
      for (const [i, innings] of projectT20Scorecard(s).innings.entries()) {
        void innings;
        const byOver = new Map<number, number>();
        let legal = 0;
        for (const e of s.events) {
          if (e.type !== "DELIVERY_RECORDED") continue;
          const d = (e.payload as { event: { inningsIndex: number; legalBall: boolean; dismissal: unknown } }).event;
          if (d.inningsIndex !== i) continue;
          const over = Math.floor(legal / 6) + 1;
          byOver.set(over, (byOver.get(over) ?? 0) + Number(d.dismissal !== null));
          legal += Number(d.legalBall);
        }
        const maxWindow = Math.max(0, ...[...byOver.keys()].map((o) => (byOver.get(o) ?? 0) + (byOver.get(o + 1) ?? 0) + (byOver.get(o + 2) ?? 0)));
        const listed = a.turningPoints.some((p) => p.kind === "COLLAPSE" && p.inningsIndex === i);
        if (maxWindow >= POST_MATCH_ANALYSIS_RULES.collapseMinWickets) expect(listed).toBe(true);
      }
    }
    expect(kinds.size).toBeGreaterThan(1);
  }, 60_000);

  test("refuses events that do not belong to the scorecard", () => {
    const other = runFixtureT20(setupWithSeed("pma-other"));
    expect(() => projectPostMatchAnalysis({ ...input, events: other.events })).toThrow(/SCORECARD_MISMATCH/);
    expect(() => projectPostMatchAnalysis({ ...input, events: input.events.slice(1) })).toThrow(/SEQUENCE_ORDER/);
  });
});

describe("LC_POST_MATCH_ANALYSIS_V1 in the match view", () => {
  test("appears only at full time, leaves the record and its verification unchanged, and lists the player's commands", async () => {
    const { createMatchController } = await import("../../apps/web/src/match/controller.js");
    const { UI_VERSION } = await import("../../apps/web/src/match/protocol.js");
    const world = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
    const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
    const c = createMatchController(world, manifest, () => "pma-controller-seed");
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
    expect(analysis.version).toBe(POST_MATCH_ANALYSIS_VERSION);
    expect(analysis.decisions.find((d) => d.kind === "SELECTION" && d.teamId === teams[0]!.id)!.summary).toBe("The eleven matched the suggested eleven.");
    expect(analysis.commandCounts[teams[0]!.id]!.user).toBeGreaterThan(0);
    // The same analysis as projecting the stored session directly.
    const s = c.snapshot()!;
    const names = view.names;
    expect(analysis).toEqual(projectPostMatchAnalysis({
      events: s.events, commands: s.commands, scorecard: projectT20Scorecard(s),
      teams: s.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds] })),
      suggestedXi: Object.fromEntries(teams.map((t) => [t.id, t.suggested.playerIds])),
      names, teamNames: Object.fromEntries(view.teams.map((t) => [t.id, t.name])),
    }));
    const before = JSON.stringify(c.snapshot());
    const verified = c.handle({ version: UI_VERSION, requestId: "ui-999999", expectedRevision: s.revision, type: "VERIFY" });
    expect(verified.error).toBeNull();
    expect(JSON.stringify(c.snapshot())).toBe(before);
  }, 60_000);
});
