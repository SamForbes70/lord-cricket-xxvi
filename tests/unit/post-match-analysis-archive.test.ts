import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  canonicalJson,
  type CompletedCareerMatchEventArchive,
  type NewGameWorldCopy,
  type SeasonSaveSummary,
  type T20SeasonState,
} from "@lcxxvi/contracts";
import { validateCompletedCareerMatchEventArchive, type SeasonDurableCommit, type SeasonLoadResult } from "@lcxxvi/persistence";
import {
  ARCHIVED_POST_MATCH_ANALYSIS_VERSION,
  POST_MATCH_ANALYSIS_RULES,
  POST_MATCH_ANALYSIS_VERSION,
  projectArchivedPostMatchAnalysis,
  projectPostMatchAnalysis,
  type ArchivedPostMatchAnalysisInput,
} from "@lcxxvi/projections";
import { runFixtureT20, projectT20Scorecard, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import { T20_LATER_SLOTS } from "@lcxxvi/data";
import { CareerApplicationService, type CareerReplayOutcome, type CareerSeasonRepository } from "../../apps/web/src/career/service.js";
import { archivedPostMatchAnalysis, T20_DEFAULT_FIELD } from "../../apps/web/src/career/archived-post-match-analysis.js";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { regenerateManagedResult } from "../../apps/web/src/match/managed-result.js";
import { UI_VERSION, type Action } from "../../apps/web/src/match/protocol.js";

const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
/** The V1 wording checks: nothing claims a cause, no en or em dashes, no win probability. */
const CAUSAL = /because|thanks to|led to|caused|cost (you|them) the match|won (you|them) the match|won the match|lost the match/i;
const DASHES = /[–—]/;

/** The smallest season repository the career service needs: one save in memory, archives validated on the way in. */
class MemorySeasonRepository implements CareerSeasonRepository {
  private state: T20SeasonState | null = null;
  private summary: SeasonSaveSummary | null = null;
  private worldCopy: NewGameWorldCopy | null = null;
  readonly archives = new Map<string, string>();
  async list() { return this.summary ? [this.summary] : []; }
  async acquireLease() { return true; }
  async releaseLease() {}
  async activeSaveId() { return this.summary?.saveId ?? null; }
  async clearActiveSaveId() {}
  async commit(input: SeasonDurableCommit): Promise<SeasonSaveSummary> {
    for (const archive of input.matchEventArchives ?? []) {
      const validated = await validateCompletedCareerMatchEventArchive(archive);
      this.archives.set(validated.fixtureId, canonicalJson(validated));
    }
    this.state = structuredClone(input.state);
    this.worldCopy = structuredClone(input.worldCopy ?? this.worldCopy);
    this.summary = {
      saveId: input.saveId, kind: input.kind, title: input.title, seasonId: input.state.seasonId, careerId: input.state.careerId,
      controlledTeamId: input.state.controlledTeamId, currentDate: input.state.careerState.currentDate, revision: input.state.revision,
      completedFixtures: input.state.completedMatches.length, phase: input.state.phase, stateSha256: input.state.stateSha256, updatedAt: input.updatedAt,
    };
    return this.summary;
  }
  async load(): Promise<SeasonLoadResult | null> {
    if (!this.state || !this.summary) return null;
    return { summary: this.summary, state: structuredClone(this.state), recovered: false, recoveredFromGeneration: null, corruptedGenerations: [], worldCopy: structuredClone(this.worldCopy) };
  }
  async loadMatchEventArchives(_saveId: string, state?: T20SeasonState) {
    const archives: CompletedCareerMatchEventArchive[] = [];
    for (const [fixtureId, payload] of this.archives) {
      archives.push(await validateCompletedCareerMatchEventArchive(JSON.parse(payload), state?.completedMatches.find((c) => c.fixtureId === fixtureId)));
    }
    return { archives, damagedFixtureIds: [] as string[], totalBytes: 0 };
  }
}

type Expected = { kind: "FIELD" | "BOWLING_PLAN" | "BATTING_PLAN"; teamId: string; inningsIndex: number; atLegalBall: number; summary: RegExp | string };

/**
 * Plays the managed fixture on the match controller, with field and plan changes made at fixed balls, then stores it
 * in the career as a USER_MATCH. Returns what each change should read, worked out from the engine's own state.
 */
async function careerWithChanges() {
  const repo = new MemorySeasonRepository();
  const service = new CareerApplicationService("owner-pma-archive", repo);
  await service.createCareer("team-01");
  await service.simulateToNextUserFixture();
  const launch = await service.prepareUserMatch();
  const controller = createMatchController(worldBytes, worldManifest, () => "unused-live-seed");
  let serial = 0;
  let response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "BOOT", careerFixture: launch });
  const send = (body: object) => {
    response = controller.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: response.revision, ...body } as never);
    expect(response.error).toBeNull();
  };
  send({ type: "START", format: "T20", selections: launch.selections, groundId: launch.groundId, careerFixture: launch });
  const act = (action: Action, teamId?: string) => {
    const view = response.view!;
    const innings = view.innings[view.activeIndex]?.innings;
    const team = teamId ?? ("teamId" in action.payload ? action.payload.teamId : innings?.bowlingTeamId);
    send({ type: "COMMAND", origin: "HUMAN", command: { ...action, commandId: `ui-${serial + 1}`, expectedRevision: response.revision, actorId: action.kind === "ADVANCE" ? "SYSTEM" : `USER:${team}` } });
  };
  const name = (id: string) => service.playerName(id);
  const expected: Expected[] = [];
  const done = new Set<string>();
  for (let steps = 0; response.view!.phase !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(3000);
    const view = response.view!;
    const s = controller.snapshot() as T20Session;
    const ledger = s.core.innings[s.core.activeInningsIndex];
    const i = s.core.activeInningsIndex, balls = ledger?.innings.legalBalls ?? 0;
    const once = (key: string) => !done.has(key) && (done.add(key), true);
    if (view.phase === "TOSS") act({ kind: "CALL_TOSS", payload: { teamId: view.decisionTeamId!, call: "HEADS" } });
    else if (view.phase === "AWAITING_INNINGS") act({ kind: "CHOOSE_INNINGS", payload: { teamId: view.decisionTeamId!, choice: "BAT" } });
    else if (view.phase === "AWAITING_BATTER") act({ kind: "SET_BATTER", payload: { teamId: view.decisionTeamId!, playerId: view.candidates.find((p) => !p.reason)!.id } });
    else if (view.phase === "AWAITING_BOWLER") act({ kind: "SET_BOWLER", payload: { teamId: view.decisionTeamId!, bowlerId: view.candidates.find((p) => !p.reason)!.id } });
    else if (i === 0 && balls === 42 && once("field-out")) {
      // Over 8: the default later field; bring deep cover up to slip.
      const before = s.core.fieldSlots;
      expect(before.map((slot) => slot.slotId)).toEqual([...T20_LATER_SLOTS]);
      act({ kind: "SET_FIELD", payload: { teamId: ledger!.innings.bowlingTeamId, fieldSlots: before.map((slot) => slot.slotId === "deep-cover" ? { ...slot, slotId: "slip-1" } : slot) } });
      expected.push({ kind: "FIELD", teamId: ledger!.innings.bowlingTeamId, inningsIndex: 0, atLegalBall: 42, summary: "Field changed: fielders moved to slip 1, away from deep cover." });
    } else if (i === 0 && balls === 42 && once("bowling-plan")) {
      const bowlerId = ledger!.innings.bowlerId!;
      act({ kind: "SET_BOWLING_PLAN", payload: { bowlerId, line: "STUMPS", length: "YORKER", variationId: "stock", effort: "MAXIMUM" } }, ledger!.innings.bowlingTeamId);
      expected.push({ kind: "BOWLING_PLAN", teamId: ledger!.innings.bowlingTeamId, inningsIndex: 0, atLegalBall: 42, summary: `Bowling plan changed: ${name(bowlerId)}: length good to yorker, effort normal to maximum.` });
    } else if (i === 0 && balls === 48 && once("field-same")) {
      // A new bowler: the engine puts the default field back. Sending it again unchanged is not a change.
      act({ kind: "SET_FIELD", payload: { teamId: ledger!.innings.bowlingTeamId, fieldSlots: structuredClone(s.core.fieldSlots) } });
    } else if (i === 0 && balls === 49 && once("field-swap")) {
      // The same positions with two fielders swapped, against the engine's default order.
      const slots = structuredClone(s.core.fieldSlots);
      [slots[0]!.playerId, slots[1]!.playerId] = [slots[1]!.playerId, slots[0]!.playerId];
      act({ kind: "SET_FIELD", payload: { teamId: ledger!.innings.bowlingTeamId, fieldSlots: slots } });
      expected.push({ kind: "FIELD", teamId: ledger!.innings.bowlingTeamId, inningsIndex: 0, atLegalBall: 49, summary: "Field changed: the same positions, with fielders swapped between them." });
    } else if (i === 1 && balls === 12 && once("bat-north")) {
      const id = ledger!.innings.northBatterId!;
      act({ kind: "SET_BATTING_PLAN", payload: { playerId: id, aggression: 4, intent: "NORMAL" } }, ledger!.innings.battingTeamId);
    } else if (i === 1 && balls === 12 && once("bat-south")) {
      const south = ledger!.innings.southBatterId!;
      act({ kind: "SET_BATTING_PLAN", payload: { playerId: south, aggression: 4, intent: "ROTATE" } }, ledger!.innings.battingTeamId);
    } else if (i === 1 && balls === 12 && once("bat-north-again")) {
      // Changed again at the same ball: the line shows the net change for each batter.
      const north = ledger!.innings.northBatterId!, south = ledger!.innings.southBatterId!;
      act({ kind: "SET_BATTING_PLAN", payload: { playerId: north, aggression: 3, intent: "NORMAL" } }, ledger!.innings.battingTeamId);
      expected.push({ kind: "BATTING_PLAN", teamId: ledger!.innings.battingTeamId, inningsIndex: 1, atLegalBall: 12,
        summary: `Batting plan changed: ${name(north)}: aggression Balanced to Positive; ${name(south)}: aggression Balanced to Attack, intent normal to rotate.` });
    } else act({ kind: "ADVANCE", payload: { scope: balls >= 40 && balls < 50 && i === 0 ? "DELIVERY" : i === 1 && balls < 12 ? "DELIVERY" : "OVER" } });
  }
  expect(done.size).toBe(7);
  const session = JSON.parse(JSON.stringify(controller.snapshot())) as unknown;
  const rebuilt = regenerateManagedResult({ session }, launch, worldBytes, worldManifest);
  if (!rebuilt.complete || !rebuilt.careerResult) throw new Error("Expected a complete career result");
  await service.completeUserMatch(rebuilt.careerResult, rebuilt.t20Session);
  return { service, repo, fixtureId: launch.fixtureId, expected, live: rebuilt.t20Session as T20Session };
}

describe("LC_POST_MATCH_ANALYSIS_ARCHIVE_V1 from the stored career archive", () => {
  const ready = careerWithChanges();

  test("rebuilds phases and turning points exactly as V1 does, and lists the recorded changes without attribution", async () => {
    const { service, fixtureId, expected, live } = await ready;
    const completion = service.findCompletionByFixtureId(fixtureId)!;
    const outcome = await service.replayFixtureArchive(fixtureId);
    expect(outcome.status).toBe("READY");
    const result = archivedPostMatchAnalysis(outcome, completion, (id) => service.playerName(id), (id) => service.teamName(id));
    if (result.status !== "READY") throw new Error(result.reason);
    const { analysis } = result;
    expect(analysis.version).toBe(ARCHIVED_POST_MATCH_ANALYSIS_VERSION);
    expect(analysis.rulesVersion).toBe(POST_MATCH_ANALYSIS_VERSION);
    // Same rules: the phases and turning points match V1 on the live session with its commands.
    const v1 = projectPostMatchAnalysis({
      events: live.events, commands: live.commands, scorecard: projectT20Scorecard(live),
      teams: live.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds] })),
      names: {}, teamNames: Object.fromEntries(live.setup.teams.map((t) => [t.teamId, service.teamName(t.teamId)])),
    });
    expect(analysis.phases).toEqual(v1.phases);
    expect(analysis.turningPoints).toEqual(v1.turningPoints);
    // The changes are exactly the ones made, in match order, with the engine's own before and after.
    expect(analysis.changes.map((c) => ({ kind: c.kind, teamId: c.teamId, inningsIndex: c.inningsIndex, atLegalBall: c.atLegalBall, summary: c.summary })))
      .toEqual(expected.map((e) => ({ ...e })));
    for (const change of analysis.changes) {
      expect(change.followed).toMatch(/^(The next 2 overs|The next \d+ balls? \(the innings then ended\)): \d+ runs?, \d+ wickets?\.( Before it: \d+\.\d an over\.)?( Another plan or field change for this side came within those balls\.)?$/);
      expect(change.measured).toBe(change.kind === "BATTING_PLAN" ? "SMALL" : "NONE_DETECTED");
    }
    expect(analysis.changes[0]!.when).toMatch(/^Over 7\.0, \d+ for \d+$/);
    expect(analysis.changes[0]!.followUp.overlapped).toBe(true);
    expect(Object.values(analysis.changeCounts).reduce((a, b) => a + b, 0)).toBe(analysis.changes.length);
    expect(analysis.toss).toMatch(/^The coin landed (heads|tails): .+ won the toss\. .+ batted first\.$/);
    // Factual wording only, with no attribution to the player or the computer.
    const text = [analysis.toss, ...analysis.turningPoints.map((p) => p.text), ...analysis.changes.flatMap((c) => [c.when, c.summary, c.followed])].join(" ");
    expect(text).not.toMatch(CAUSAL);
    expect(text).not.toMatch(DASHES);
    expect(text).not.toMatch(/\byou\b|\byour\b|computer|captain/i);
  }, 120_000);

  test("is deterministic, leaves its inputs untouched and saves nothing", async () => {
    const { service, repo, fixtureId } = await ready;
    const completion = service.findCompletionByFixtureId(fixtureId)!;
    const outcome = await service.replayFixtureArchive(fixtureId);
    if (outcome.status !== "READY") throw new Error("Expected a replay");
    const archivesBefore = JSON.stringify([...repo.archives]);
    const stateBefore = JSON.stringify(service.getState());
    const outcomeBefore = JSON.stringify(outcome);
    const a = archivedPostMatchAnalysis(outcome, completion, (id) => service.playerName(id), (id) => service.teamName(id));
    const b = archivedPostMatchAnalysis(structuredClone(outcome), structuredClone(completion), (id) => service.playerName(id), (id) => service.teamName(id));
    expect(a).toEqual(b);
    expect(JSON.stringify(outcome)).toBe(outcomeBefore);
    expect(JSON.stringify([...repo.archives])).toBe(archivesBefore);
    expect(JSON.stringify(service.getState())).toBe(stateBefore);
  }, 120_000);

  test("an offscreen fixture has its phases and no changes", async () => {
    const { service } = await ready;
    const completion = service.getState()!.completedMatches.find((c) => c.source === "OFFSCREEN")!;
    const outcome = await service.replayFixtureArchive(completion.fixtureId);
    const result = archivedPostMatchAnalysis(outcome, completion, (id) => service.playerName(id), (id) => service.teamName(id));
    if (result.status !== "READY") throw new Error(result.reason);
    expect(result.analysis.changes).toEqual([]);
    expect(result.analysis.phases).toHaveLength(2);
  }, 120_000);

  test("shows nothing when the record is missing, damaged or does not match the stored scorecard", async () => {
    const { service, fixtureId } = await ready;
    const completion = service.findCompletionByFixtureId(fixtureId)!;
    const names = (id: string) => service.playerName(id), teams = (id: string) => service.teamName(id);
    const unavailable = archivedPostMatchAnalysis({ status: "UNAVAILABLE" }, completion, names, teams);
    expect(unavailable).toEqual({ status: "UNAVAILABLE", reason: expect.stringMatching(/no stored ball-by-ball record/) });
    const damaged = archivedPostMatchAnalysis({ status: "DAMAGED", message: "ARCHIVE_HASH_MISMATCH" }, completion, names, teams);
    expect(damaged.status).toBe("UNAVAILABLE");
    const outcome = await service.replayFixtureArchive(fixtureId) as Extract<CareerReplayOutcome, { status: "READY" }>;
    // A stored scorecard the events do not add up to.
    const tampered = structuredClone(completion);
    tampered.scorecard.innings[0]!.runs += 1;
    expect(archivedPostMatchAnalysis(outcome, tampered, names, teams)).toEqual({ status: "UNAVAILABLE", reason: expect.stringMatching(/does not match/) });
    // A different fixture's completion.
    const other = service.getState()!.completedMatches.find((c) => c.fixtureId !== fixtureId)!;
    expect(archivedPostMatchAnalysis(outcome, other, names, teams).status).toBe("UNAVAILABLE");
    // A gap in the event sequence.
    const gap = structuredClone(outcome);
    gap.replay.session = { ...gap.replay.session, events: gap.replay.session.events.filter((_, n) => n !== 5) };
    expect(archivedPostMatchAnalysis(gap, completion, names, teams).status).toBe("UNAVAILABLE");
    // A lazily loaded archive that is not there: the service reports UNAVAILABLE, and the analysis follows.
    const { repo } = await ready;
    const saved = repo.archives.get(fixtureId)!;
    repo.archives.delete(fixtureId);
    try {
      const missing = await service.replayFixtureArchive(fixtureId);
      expect(missing.status).toBe("UNAVAILABLE");
      expect(archivedPostMatchAnalysis(missing, completion, names, teams).status).toBe("UNAVAILABLE");
    } finally {
      repo.archives.set(fixtureId, saved);
    }
  }, 120_000);
});

describe("LC_POST_MATCH_ANALYSIS_ARCHIVE_V1 projection", () => {
  const raw = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
  const s = runFixtureT20(validateT20MatchSetup(raw, worldBytes, worldManifest));
  const input: ArchivedPostMatchAnalysisInput = {
    events: s.events, scorecard: projectT20Scorecard(s),
    teams: s.setup.teams.map((t) => ({ teamId: t.teamId, playerIds: [...t.playerIds], keeperId: t.keeperId })),
    names: {}, teamNames: {}, defaultField: T20_DEFAULT_FIELD,
  };
  test("the default field matches the engine's own powerplay threshold", () => {
    expect(T20_DEFAULT_FIELD.powerplayLegalBalls).toBe(POST_MATCH_ANALYSIS_RULES.phases[0]!.toOver * 6);
  });
  test("refuses a gap, another match's scorecard and teams that are not in the match", () => {
    expect(projectArchivedPostMatchAnalysis(input).changes).toEqual([]);
    expect(() => projectArchivedPostMatchAnalysis({ ...input, events: input.events.slice(1) })).toThrow(/SEQUENCE_ORDER/);
    const other = runFixtureT20(validateT20MatchSetup({ ...raw, setup: { ...raw.setup, seed: "pma-archive-other" } }, worldBytes, worldManifest));
    expect(() => projectArchivedPostMatchAnalysis({ ...input, scorecard: projectT20Scorecard(other) })).toThrow(/SCORECARD_MISMATCH|ARCHIVE_FIELD|ARCHIVE_TEAMS/);
    const short = structuredClone(input.scorecard);
    short.innings[1]!.wickets += 1;
    expect(() => projectArchivedPostMatchAnalysis({ ...input, scorecard: short })).toThrow(/SCORECARD_MISMATCH/);
    expect(() => projectArchivedPostMatchAnalysis({ ...input, teams: [input.teams[0]!, { ...input.teams[0]!, teamId: "team-99" }] })).toThrow(/ARCHIVE_TEAMS/);
  });
});
