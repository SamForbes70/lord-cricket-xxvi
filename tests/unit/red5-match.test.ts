import { describe, it, expect } from "vitest";
import {
  createPortableArchive,
  readPortableArchive,
  type SaveSummary,
} from "@lcxxvi/persistence";
import { RED5_ARCHIVE_PINS } from "../../apps/web/src/match/protocol.js";
import { readFileSync } from "node:fs";
import {
  validateRed5MatchSetup,
  createRed5Session,
  executeRed5Command,
  red5FixtureAutopilotStep,
  applyRed5FixtureResolution,
  replayRed5Events,
  red5EventChainManifest,
  resimulateRed5Commands,
  rehydrateRed5Session,
  projectRed5Scorecard,
  runFixtureRed5,
  type Red5Session,
} from "@lcxxvi/simulation";
import { RULE_MANIFESTS } from "@lcxxvi/data";
const raw = JSON.parse(
  readFileSync("tests/fixtures/world/red5-valid-setup.json", "utf8"),
);
const world = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(
  readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"),
);
const setup = validateRed5MatchSetup(raw, world, manifest);
const corpus = JSON.parse(
  readFileSync("tests/fixtures/red5/edge-corpus.json", "utf8"),
);
function auto(s: Red5Session) {
  return executeRed5Command(s, red5FixtureAutopilotStep(s)).session;
}
function ready(s: Red5Session) {
  let n = 0;
  while (s.core.phase !== "READY") {
    expect(n++).toBeLessThan(12);
    s = auto(s);
  }
  return s;
}
function resolution(
  s: Red5Session,
  opts: {
    runs?: number;
    legality?: "LEGAL" | "WIDE" | "NO_BALL";
    bowled?: boolean;
    elapsed?: number;
  } = {},
) {
  const i = s.core.innings[s.core.activeInningsIndex]!.innings;
  const striker =
    i.strikerEnd === "NORTH" ? i.northBatterId! : i.southBatterId!;
  const wide = opts.legality === "WIDE",
    nb = opts.legality === "NO_BALL",
    runs = opts.runs ?? 0,
    out = opts.bowled ?? false;
  return {
    stage: "DELIVERY",
    legality: opts.legality ?? "LEGAL",
    batRuns: wide ? 0 : runs,
    extras: {
      wides: Number(wide),
      noBalls: Number(nb),
      byes: 0,
      legByes: 0,
      penalties: 0,
    },
    completedRuns: wide ? 0 : runs === 4 || runs === 6 ? 0 : runs,
    attemptedRuns: wide ? 0 : runs === 4 || runs === 6 ? 0 : runs,
    boundary: runs === 4 ? "FOUR" : runs === 6 ? "SIX" : "NONE",
    dismissal: out
      ? {
          kind: "BOWLED",
          playerId: striker,
          fielderId: null,
          wicketEnd: i.strikerEnd,
        }
      : null,
    endsAfter: out
      ? {
          north: i.strikerEnd === "NORTH" ? null : i.northBatterId,
          south: i.strikerEnd === "SOUTH" ? null : i.southBatterId,
        }
      : runs % 2
        ? { north: i.southBatterId, south: i.northBatterId }
        : { north: i.northBatterId, south: i.southBatterId },
    batContact: runs > 0,
    attemptedStroke: !wide,
    shotSector: runs > 0 ? 0 : null,
    trajectory: runs > 0 ? "GROUND" : null,
    executedLength: "GOOD",
    fieldOutcome: "NONE",
    elapsedSeconds: opts.elapsed ?? 40,
  };
}
describe("Pass 11 / M5B red-ball profile", () => {
  it("pins the custom five-day rule profile and corpus", () => {
    const r = RULE_MANIFESTS.find((r) => r.rulesId === "LC_RED5_01")!;
    expect(r).toMatchObject({
      format: "RED_BALL",
      inningsPerTeam: 2,
      allocatedBalls: null,
      bowlerMaxBalls: null,
      freeHitAfterNoBall: false,
      declarations: true,
      followOnLead: 200,
      newBallAfterLegalBalls: 480,
    });
    expect(corpus.version).toBe("LC_RED5_EDGE_CORPUS_V1");
    expect(corpus.cases).toHaveLength(14);
  });
  it("starts at day one 11:00 with unlimited allocation and no red-ball free hit", () => {
    let s = ready(createRed5Session(setup));
    expect(s.core.clock).toMatchObject({
      day: 1,
      localSeconds: 39600,
      dayLegalBalls: 0,
    });
    expect(s.core.innings[0]!.innings.allocatedBalls).toBeNull();
    s = applyRed5FixtureResolution(s, resolution(s, { legality: "NO_BALL" }));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(false);
  });
  it("defers lunch to an over boundary and resumes at 13:40", () => {
    let s = ready(createRed5Session(setup));
    s.core.clock.localSeconds = 12 * 3600 + 59 * 60;
    for (let n = 0; n < 6; n++) {
      if (s.core.phase !== "READY") s = ready(s);
      s = applyRed5FixtureResolution(s, resolution(s, { elapsed: 20 }));
    }
    expect(s.core.clock.localSeconds).toBeGreaterThanOrEqual(
      13 * 3600 + 40 * 60,
    );
    expect(s.core.clock.phase).toBe("PLAY");
  });
  it("reduces the day-five final-hour obligation by six balls per complete four lost minutes", () => {
    let s = ready(createRed5Session(setup));
    s.core.clock.day = 5;
    s.core.clock.localSeconds = 17 * 3600;
    s.core.clock.finalHourActive = true;
    s.core.clock.finalHourBallsRemaining = 90;
    s = executeRed5Command(s, {
      commandId: "rain-final-hour",
      expectedRevision: s.revision,
      actorId: "SYSTEM",
      kind: "ADD_RAIN_DELAY",
      payload: { seconds: 20 * 60 },
    }).session;
    expect(s.core.clock.finalHourBallsRemaining).toBe(60);
  });
  it("allows declaration between deliveries and starts the opponent innings", () => {
    let s = ready(createRed5Session(setup));
    const batting = s.core.innings[0]!.innings.battingTeamId;
    s = executeRed5Command(s, {
      commandId: "declare",
      expectedRevision: s.revision,
      actorId: `USER:${batting}`,
      kind: "DECLARE",
      payload: { teamId: batting },
    }).session;
    expect(s.core.declared[0]).toBe(true);
    expect(s.core.innings).toHaveLength(2);
    expect(s.core.innings[1]!.innings.battingTeamId).not.toBe(batting);
  });
  it("offers and enforces a follow-on at a 200-run first-innings lead", () => {
    let s = ready(createRed5Session(setup));
    for (let n = 0; n < 50; n++) {
      if (s.core.phase !== "READY") s = ready(s);
      s = applyRed5FixtureResolution(s, resolution(s, { runs: 4 }));
    }
    const first = s.core.innings[0]!.innings.battingTeamId;
    s = executeRed5Command(s, {
      commandId: "declare-200",
      expectedRevision: s.revision,
      actorId: `USER:${first}`,
      kind: "DECLARE",
      payload: { teamId: first },
    }).session;
    s = ready(s);
    for (let w = 0; w < 10; w++) {
      s = applyRed5FixtureResolution(s, resolution(s, { bowled: true }));
      if (w < 9) s = ready(s);
    }
    expect(s.core.phase).toBe("AWAITING_FOLLOW_ON");
    s = executeRed5Command(s, {
      commandId: "follow-on",
      expectedRevision: s.revision,
      actorId: `USER:${first}`,
      kind: "CHOOSE_FOLLOW_ON",
      payload: { teamId: first, enforce: true },
    }).session;
    expect(s.core.followOnEnforced).toBe(true);
    expect(s.core.innings[2]!.innings.battingTeamId).toBe(
      s.core.innings[1]!.innings.battingTeamId,
    );
  });
  it("makes the new ball available after 480 legal balls and resets only ball age", () => {
    let s = ready(createRed5Session(setup));
    for (let n = 0; n < 480; n++) {
      if (s.core.phase !== "READY") s = ready(s);
      s = applyRed5FixtureResolution(s, resolution(s));
    }
    s = ready(s);
    const l = s.core.innings[s.core.activeInningsIndex]!,
      before = l.innings.legalBalls,
      bowling = l.innings.bowlingTeamId;
    s = executeRed5Command(s, {
      commandId: "new-ball",
      expectedRevision: s.revision,
      actorId: `USER:${bowling}`,
      kind: "TAKE_NEW_BALL",
      payload: { teamId: bowling },
    }).session;
    expect(
      s.core.innings[s.core.activeInningsIndex]!.innings.ballAgeLegalBalls,
    ).toBe(0);
    expect(s.core.innings[s.core.activeInningsIndex]!.innings.legalBalls).toBe(
      before,
    );
    expect(s.core.newBallsTaken).toBe(1);
  });
  it("replays, resimulates and rehydrates the same accepted red-ball event chain", () => {
    let s = ready(createRed5Session(setup));
    for (let n = 0; n < 12; n++) {
      if (s.core.phase !== "READY") s = ready(s);
      s = executeRed5Command(s, {
        commandId: `advance-${n}`,
        expectedRevision: s.revision,
        actorId: "SYSTEM",
        kind: "ADVANCE",
        payload: { scope: "DELIVERY" },
      }).session;
    }
    const replay = replayRed5Events(setup, s.events, red5EventChainManifest(s));
    expect(replay.lastEventHash).toBe(s.lastEventHash);
    resimulateRed5Commands(s);
    expect(
      rehydrateRed5Session(structuredClone(s), world, manifest).lastEventHash,
    ).toBe(s.lastEventHash);
  });
  it("round-trips a red-ball session through the portable save archive", async () => {
    let s = ready(createRed5Session(setup));
    for (let n = 0; n < 12; n++) {
      if (s.core.phase !== "READY") s = ready(s);
      s = executeRed5Command(s, {
        commandId: `portable-${n}`,
        expectedRevision: s.revision,
        actorId: "SYSTEM",
        kind: "ADVANCE",
        payload: { scope: "DELIVERY" },
      }).session;
    }
    const summary: SaveSummary = {
      saveId: "red5-pass11",
      kind: "AUTO",
      title: "Red-ball exhibition",
      matchGameId: s.setup.gameId,
      matchId: s.setup.matchId,
      teams: [s.setup.teams[0]!.teamId, s.setup.teams[1]!.teamId],
      ground: s.setup.ground.groundId,
      phase: s.core.phase,
      revision: s.revision,
      eventCount: s.events.length,
      lastEventHash: s.lastEventHash,
      updatedAt: "2026-10-05T00:00:00.000Z",
      completed: false,
    };
    const bytes = await createPortableArchive(
      s,
      summary,
      RED5_ARCHIVE_PINS,
      summary.updatedAt,
    );
    const restored = await readPortableArchive(bytes, RED5_ARCHIVE_PINS);
    expect(restored.summary).toEqual(summary);
    const rehydrated = rehydrateRed5Session(restored.session, world, manifest);
    expect(rehydrated.lastEventHash).toBe(s.lastEventHash);
    expect(rehydrated.core.clock).toEqual(s.core.clock);
  });
  it("completes a deterministic five-day exhibition and reproduces its final chain", () => {
    const s = runFixtureRed5(setup, 3000);
    expect(s.core.phase).toBe("COMPLETE");
    expect(s.core.result).not.toBeNull();
    expect(s.core.clock.day).toBeLessThanOrEqual(5);
    expect(s.core.innings.length).toBeGreaterThanOrEqual(3);
    expect(s.core.innings.length).toBeLessThanOrEqual(4);
    const card = projectRed5Scorecard(s);
    expect(card.result).toEqual(s.core.result);
    const replay = replayRed5Events(setup, s.events, red5EventChainManifest(s));
    expect(replay.lastEventHash).toBe(s.lastEventHash);
    resimulateRed5Commands(s);
  });
});
