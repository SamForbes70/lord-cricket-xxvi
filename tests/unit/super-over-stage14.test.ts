import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { T20SuperOverRecordSchema, type SuperOverCommand } from "@lcxxvi/contracts";
import {
  createT20SuperOver,
  executeSuperOverCommand,
  executeT20Command,
  executeODICommand,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  isTiedT20Match,
  isTiedLimitedOversMatch,
  replaySuperOver,
  summariseSuperOver,
  superOverAutopilotCommand,
  superOverPendingTeam,
  superOverRecord,
  verifySuperOverRecord,
  eligibleSuperOverBatters,
  type T20Session,
  type ODISession,
  type T20SuperOverState,
} from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

// Stage 14 (owner decision 17 November 2026, answer 1a): ICC-standard super overs for tied T20 exhibitions.
const root = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));

/** Seeds whose autopilot T20 (default match id) ends in a tie, found by search. */
// The tied seeds below were found with the suggested eleven of Stage 14 (keeper, the first six bowling-capable players,
// then squad order). Pavilion P04 stage A changed the suggested eleven, so these tests field that original eleven
// explicitly: they test super-over rules, not team selection.
const stage14Eleven = (team: { id: string; players: readonly { id: string; role: string; canBowl: boolean }[] }) => {
  const keeper = team.players.find((p) => p.role === "KEEPER")!;
  const bowlers = team.players.filter((p) => p.id !== keeper.id && p.canBowl).slice(0, 6);
  const xi = [keeper, ...bowlers, ...team.players.filter((p) => p !== keeper && !bowlers.includes(p))].slice(0, 11);
  return { teamId: team.id, playerIds: xi.map((p) => p.id), captainId: keeper.id, keeperId: keeper.id };
};

const TIED: [string, string, string, string][] = [
  ["lc-tie-177", "team-01", "team-02", "ground-01"],
  ["lc-tie-181", "team-03", "team-06", "ground-03"],
  ["lc-tie-272", "team-04", "team-07", "ground-04"],
  ["lc-tie-469", "team-03", "team-06", "ground-03"],
  ["lc-tie-555", "team-01", "team-02", "ground-01"],
];

function playMatch(seed: string, a: string, b: string, ground: string): T20Session {
  const ctl = createMatchController(worldBytes, manifest, () => seed);
  const catalog = ctl.currentResponse("ui-0").catalog!;
  const pick = (id: string) => stage14Eleven(catalog.teams.find((t) => t.id === id)!);
  const started = ctl.handle({ version: UI_VERSION, requestId: "ui-1", expectedRevision: 0, type: "START", format: "T20", selections: [pick(a), pick(b)], groundId: ground });
  expect(started.error).toBeNull();
  let s = ctl.snapshot()!;
  while (s.core.phase !== "COMPLETE") s = executeT20Command(s, fixtureAutopilotStep(s)).session;
  return s;
}

function autopilot(session: T20Session): { state: T20SuperOverState; commands: SuperOverCommand[] } {
  let state = createT20SuperOver(session);
  const commands: SuperOverCommand[] = [];
  for (let guard = 0; state.phase !== "COMPLETE"; guard += 1) {
    expect(guard).toBeLessThan(500);
    const command = superOverAutopilotCommand(session, state)!;
    commands.push(command);
    state = executeSuperOverCommand(session, state, command);
  }
  return { state, commands };
}

describe("Stage 14 T20 super overs", () => {
  const tied = TIED.map(([seed, a, b, g]) => playMatch(seed, a, b, g));

  it("applies only to a completed tie", () => {
    for (const s of tied) expect(isTiedT20Match(s)).toBe(true);
    const won = playMatch("lc-tie-1", "team-01", "team-02", "ground-01");
    expect(won.core.result?.kind).toBe("WIN");
    expect(() => createT20SuperOver(won)).toThrow("LC_SUPER_OVER_MATCH_NOT_TIED");
  });

  it("the side that batted second bats first, and each innings ends at 6 balls, 2 wickets or the target", () => {
    for (const session of tied) {
      const state = createT20SuperOver(session);
      expect(superOverPendingTeam(state)).toEqual({ teamId: session.core.innings[1]!.innings.battingTeamId, decision: "BATTERS" });
      const { state: done } = autopilot(session);
      expect(done.phase).toBe("COMPLETE");
      expect(done.completionReason).toBe("WON");
      expect(done.winnerTeamId).not.toBeNull();
      const rounds = summariseSuperOver(done);
      for (const round of rounds) {
        expect(round.innings).toHaveLength(2);
        const [first, second] = round.innings as [typeof round.innings[0], typeof round.innings[0]];
        expect(second.battingTeamId).not.toBe(first.battingTeamId);
        for (const innings of round.innings) {
          expect(innings.legalBalls).toBeLessThanOrEqual(6);
          expect(innings.wickets).toBeLessThanOrEqual(2);
          // An innings that stopped before 6 balls stopped for 2 wickets or a reached target.
          if (innings.legalBalls < 6) expect(innings.wickets === 2 || (innings === second && second.runs > first.runs)).toBe(true);
        }
      }
      const last = rounds[rounds.length - 1]!;
      const [first, second] = last.innings as [typeof last.innings[0], typeof last.innings[0]];
      expect(done.winnerTeamId).toBe(second.runs > first.runs ? second.battingTeamId : first.battingTeamId);
      // Earlier rounds were tied, and the batting order swapped each time.
      for (let r = 0; r < rounds.length - 1; r += 1) {
        expect(rounds[r]!.innings[0]!.runs).toBe(rounds[r]!.innings[1]!.runs);
        expect(rounds[r + 1]!.innings[0]!.battingTeamId).toBe(rounds[r]!.innings[1]!.battingTeamId);
      }
    }
  });

  it("is deterministic and never reuses a match random draw", () => {
    const session = tied[0]!;
    const a = autopilot(session);
    const b = replaySuperOver(session, a.commands);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a.state));
    expect(a.state.deliveries[0]!.deliveryIndex).toBe(session.core.globalAttemptOrdinal);
    // The tied match itself is untouched.
    expect(session.core.result?.kind).toBe("TIE");
  });

  it("enforces ICC eligibility: named batters only, no dismissed batter or previous bowler in a later super over", () => {
    const session = tied[0]!;
    const state = createT20SuperOver(session);
    const pending = superOverPendingTeam(state)!;
    const other = session.setup.teams.find((t) => t.teamId !== pending.teamId)!;
    expect(() => executeSuperOverCommand(session, state, { kind: "SET_SUPER_OVER_BATTERS", teamId: other.teamId, playerIds: other.playerIds.slice(0, 3) })).toThrow("NOT_BATTING_TEAM");
    const own = session.setup.teams.find((t) => t.teamId === pending.teamId)!;
    expect(() => executeSuperOverCommand(session, state, { kind: "SET_SUPER_OVER_BATTERS", teamId: own.teamId, playerIds: own.playerIds.slice(0, 2) })).toThrow("BATTER_COUNT");
    expect(() => executeSuperOverCommand(session, state, { kind: "SET_SUPER_OVER_BOWLER", teamId: own.teamId, playerId: own.keeperId })).toThrow("NOT_BOWLING_TEAM");
    expect(() => executeSuperOverCommand(session, state, { kind: "SET_SUPER_OVER_BOWLER", teamId: other.teamId, playerId: other.keeperId })).toThrow("INELIGIBLE_BOWLER");
    expect(() => executeSuperOverCommand(session, state, { kind: "BOWL_SUPER_OVER_BALL" })).toThrow("WRONG_PHASE");

    // Find a sequence that needs a second super over, or check exclusions after the first innings.
    const { state: done } = autopilot(session);
    for (const team of session.setup.teams) {
      const excluded = done.excludedBatters[team.teamId]!;
      for (const id of excluded) expect(eligibleSuperOverBatters(session, done, team.teamId)).not.toContain(id);
    }
    expect(Object.values(done.excludedBowlers).every((ids) => ids.length >= 1)).toBe(true);
  });

  it("a tied super over is followed by another, with the batting order swapped and ICC exclusions applied", () => {
    const session = tied[3]!; // lc-tie-469: the autopilot ties the first super over
    const { state } = autopilot(session);
    const rounds = summariseSuperOver(state);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]!.innings[0]!.runs).toBe(rounds[0]!.innings[1]!.runs);
    expect(rounds[1]!.innings[0]!.battingTeamId).toBe(rounds[0]!.innings[1]!.battingTeamId);
    const [r1a, r1b] = state.rounds[0]!.innings;
    const [r2a, r2b] = state.rounds[1]!.innings;
    // Nobody dismissed in super over 1 bats in super over 2, and neither super over 1 bowler bowls in it.
    for (const [earlier, later] of [[r1a!, r2b!], [r1b!, r2a!]] as const) {
      for (const out of earlier.ledger!.innings.dismissed) expect(later.batterIds).not.toContain(out);
    }
    expect(r2a!.bowlerId).not.toBe(r1b!.bowlerId);
    expect(r2b!.bowlerId).not.toBe(r1a!.bowlerId);
    expect(state.winnerTeamId).toBe(rounds[1]!.innings[1]!.runs > rounds[1]!.innings[0]!.runs ? rounds[1]!.innings[1]!.battingTeamId : rounds[1]!.innings[0]!.battingTeamId);
  });

  it("stores a verifiable record that rejects tampering and other matches", () => {
    const session = tied[0]!;
    const { state, commands } = autopilot(session);
    const record = superOverRecord(state, commands);
    expect(T20SuperOverRecordSchema.parse(record)).toEqual(record);
    expect(JSON.stringify(verifySuperOverRecord(session, record))).toBe(JSON.stringify(state));
    expect(() => verifySuperOverRecord(session, { ...record, stateSha256: "0".repeat(64) })).toThrow("RECORD_STATE_MISMATCH");
    expect(() => verifySuperOverRecord(tied[1]!, record)).toThrow("RECORD_MATCH_MISMATCH");
  });
});

describe("Stage 14 one-day super overs", () => {
  /** Seeds whose autopilot ODI (default match id) ends in a tie, found by search. */
  const ODI_TIED: [string, string, string, string][] = [
    ["lc-odi-tie-8", "team-01", "team-02", "ground-01"],
    ["lc-odi-tie-95", "team-05", "team-08", "ground-05"],
    ["lc-odi-tie-258", "team-04", "team-07", "ground-04"],
    ["lc-odi-tie-430", "team-04", "team-07", "ground-04"],
  ];
  function playODI(seed: string, a: string, b: string, ground: string): ODISession {
    const ctl = createODIMatchController(worldBytes, manifest, () => seed);
    const catalog = ctl.currentResponse("ui-0").catalog!;
    const pick = (id: string) => stage14Eleven(catalog.teams.find((t) => t.id === id)!);
    const started = ctl.handle({ version: UI_VERSION, requestId: "ui-1", expectedRevision: 0, type: "START", format: "ODI", selections: [pick(a), pick(b)], groundId: ground });
    expect(started.error).toBeNull();
    let s = ctl.snapshot() as ODISession;
    while (s.core.phase !== "COMPLETE") s = executeODICommand(s, odiFixtureAutopilotStep(s)).session;
    return s;
  }
  const tied = ODI_TIED.map(([seed, a, b, g]) => playODI(seed, a, b, g));

  it("plays to a winner under the one-day ruleset with the same ICC rules", () => {
    for (const session of tied) {
      expect(isTiedLimitedOversMatch(session)).toBe(true);
      let state = createT20SuperOver(session);
      expect(state.rulesId).toBe("LC_ODI_SUPER_OVER_01");
      const commands: SuperOverCommand[] = [];
      while (state.phase !== "COMPLETE") {
        const command = superOverAutopilotCommand(session, state)!;
        commands.push(command);
        state = executeSuperOverCommand(session, state, command);
      }
      expect(state.completionReason).toBe("WON");
      for (const round of summariseSuperOver(state))
        for (const innings of round.innings) {
          expect(innings.legalBalls).toBeLessThanOrEqual(6);
          expect(innings.wickets).toBeLessThanOrEqual(2);
        }
      const record = superOverRecord(state, commands);
      expect(record.schemaId).toBe("LC_ODI_SUPER_OVER_RECORD_V1");
      expect(JSON.stringify(verifySuperOverRecord(session, record))).toBe(JSON.stringify(state));
    }
  });

  it("refuses a record from the other format", () => {
    const t20 = playMatch("lc-tie-177", "team-01", "team-02", "ground-01");
    let state = createT20SuperOver(t20);
    state = executeSuperOverCommand(t20, state, superOverAutopilotCommand(t20, state)!);
    const record = superOverRecord(state, [superOverAutopilotCommand(t20, createT20SuperOver(t20))!]);
    expect(() => verifySuperOverRecord(tied[0]!, record)).toThrow("RECORD_FORMAT_MISMATCH");
  });
});

describe("Stage 14 super overs in .lcxxvi exports (archive V5)", () => {
  it("round-trips the record, rejects one from another match, and still reads older archives", async () => {
    const { createPortableArchive, readPortableArchive, SUPER_OVER_ARCHIVE_VERSION } = await import("@lcxxvi/persistence");
    const { ARCHIVE_PINS } = await import("../../apps/web/src/match/protocol.js");
    const session = playMatch("lc-tie-469", "team-03", "team-06", "ground-03");
    const other = playMatch("lc-tie-177", "team-01", "team-02", "ground-01");
    const { state, commands } = autopilot(session);
    const record = superOverRecord(state, commands);
    const summary = (s: T20Session) => ({
      saveId: `auto:${s.setup.gameId}`, kind: "AUTO" as const, title: "Tied", matchGameId: s.setup.gameId, matchId: s.setup.matchId,
      teams: [s.setup.teams[0].teamId, s.setup.teams[1].teamId] as [string, string], ground: s.setup.ground.groundId, phase: s.core.phase,
      revision: s.revision, eventCount: s.events.length, lastEventHash: s.lastEventHash, updatedAt: "2026-11-17T00:00:00.000Z", completed: true,
    });
    const bytes = await createPortableArchive(session, summary(session), ARCHIVE_PINS, "2026-11-17T00:00:00.000Z", null, null, null, record);
    const read = await readPortableArchive(bytes, [ARCHIVE_PINS]);
    expect(read.manifest.archiveVersion).toBe(SUPER_OVER_ARCHIVE_VERSION);
    expect(read.superOverRecord).toEqual(record);
    expect(JSON.stringify(verifySuperOverRecord(session, read.superOverRecord!))).toBe(JSON.stringify(state));
    // A record from a different match is refused at export.
    await expect(createPortableArchive(other, summary(other), ARCHIVE_PINS, "2026-11-17T00:00:00.000Z", null, null, null, record)).rejects.toThrow("ARCHIVE_SUPER_OVER_MATCH_MISMATCH");
    // Without a record the archive keeps its old version, and reads with no record.
    const plain = await readPortableArchive(await createPortableArchive(session, summary(session), ARCHIVE_PINS, "2026-11-17T00:00:00.000Z"), [ARCHIVE_PINS]);
    expect(plain.manifest.archiveVersion).toBe("LC_ARCHIVE_V1");
    expect(plain.superOverRecord).toBeNull();
  }, 60_000);
});
