import { describe, it, expect } from "vitest";
import { createPortableArchive, readPortableArchive, type SaveSummary } from "@lcxxvi/persistence";
import { readFileSync } from "node:fs";
import {
  validateODIMatchSetup,
  createODISession,
  executeODICommand,
  odiFixtureAutopilotStep,
  runFixtureODI,
  replayODIEvents,
  resimulateODICommands,
  odiEventChainManifest,
  projectODIScorecard,
  validateODIField,
  applyODIFixtureResolution,
  rehydrateODISession,
  type ODISession,
} from "@lcxxvi/simulation";
import { expectedGeneratorPhase } from "@lcxxvi/simulation";
import {
  ODI_POWERPLAY_SLOTS,
  ODI_MIDDLE_SLOTS,
  ODI_FIELD_REGISTRY,
  ODI_LATE_SLOTS,
  RULE_MANIFESTS,
} from "@lcxxvi/data";
import { ODI_ARCHIVE_PINS } from "../../apps/web/src/match/protocol.js";

const raw = JSON.parse(
  readFileSync("tests/fixtures/world/odi-valid-setup.json", "utf8"),
);
const world = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(
  readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"),
);
const setup = validateODIMatchSetup(raw, world, manifest);

const edgeCorpus = JSON.parse(
  readFileSync("tests/fixtures/odi/edge-corpus.json", "utf8"),
) as {
  version: string;
  rulesId: string;
  cases: Array<{ id: string; category: string; legalBallFrom?: number; legalBallTo?: number; expected: Record<string, unknown> }>;
};

function autopilot(s: ODISession) {
  return executeODICommand(s, odiFixtureAutopilotStep(s)).session;
}
function ready(s: ODISession) {
  let n = 0;
  while (s.core.phase !== "READY") {
    expect(n++).toBeLessThan(8);
    s = autopilot(s);
  }
  return s;
}
function resolution(
  s: ODISession,
  options: {
    runs?: number;
    legality?: "LEGAL" | "WIDE" | "NO_BALL";
    bowled?: boolean;
  } = {},
) {
  const i = s.core.innings[s.core.activeInningsIndex]!.innings;
  const striker =
    i.strikerEnd === "NORTH" ? i.northBatterId! : i.southBatterId!;
  const wide = options.legality === "WIDE",
    noBall = options.legality === "NO_BALL",
    runs = options.runs ?? 0,
    out = options.bowled ?? false;
  const boundary = runs === 4 ? "FOUR" : runs === 6 ? "SIX" : "NONE";
  const ends = out
    ? {
        north: i.strikerEnd === "NORTH" ? null : i.northBatterId,
        south: i.strikerEnd === "SOUTH" ? null : i.southBatterId,
      }
    : runs % 2 === 1
      ? { north: i.southBatterId, south: i.northBatterId }
      : { north: i.northBatterId, south: i.southBatterId };
  return {
    stage:
      (wide || noBall) && i.targetToWin !== null && i.runs + 1 >= i.targetToWin
        ? "IMMEDIATE_PENALTY"
        : "DELIVERY",
    legality: options.legality ?? "LEGAL",
    batRuns: wide ? 0 : runs,
    extras: {
      wides: Number(wide),
      noBalls: Number(noBall),
      byes: 0,
      legByes: 0,
      penalties: 0,
    },
    completedRuns: wide ? 0 : boundary === "NONE" ? runs : 0,
    attemptedRuns: wide ? 0 : boundary === "NONE" ? runs : 0,
    boundary,
    dismissal: out
      ? {
          kind: "BOWLED",
          playerId: striker,
          fielderId: null,
          wicketEnd: i.strikerEnd,
        }
      : null,
    endsAfter: ends,
    batContact: runs > 0,
    attemptedStroke: !wide,
    shotSector: runs > 0 ? 0 : null,
    trajectory: runs > 0 ? "GROUND" : null,
    executedLength: "GOOD",
    fieldOutcome: "NONE",
    elapsedSeconds: 40,
  };
}

describe("Pass 10 / M5A ODI format", () => {
  it("locks the machine-readable ODI edge corpus to the frozen rule profile", () => {
    expect(edgeCorpus.version).toBe("LC_ODI_EDGE_CORPUS_V1");
    expect(edgeCorpus.rulesId).toBe("LC_ODI_01");
    expect(edgeCorpus.cases.map((c) => c.id)).toEqual([
      "ODI-ALLOC-300",
      "ODI-BOWLER-60",
      "ODI-FIELD-01",
      "ODI-FIELD-02",
      "ODI-FIELD-03",
      "ODI-MODEL-01",
      "ODI-MODEL-02",
      "ODI-MODEL-03",
      "ODI-FREE-HIT",
      "ODI-NO-CONSECUTIVE",
      "ODI-RAIN-GATE",
      "ODI-TERMINAL-BALL",
      "ODI-REPLAY",
      "ODI-PERSISTENCE",
    ]);
    const rules = RULE_MANIFESTS.find((r) => r.rulesId === "LC_ODI_01")!;
    expect(rules.format).toBe("ODI");
    expect(rules.allocatedBalls).toBe(300);
    expect(rules.bowlerMaxBalls).toBe(60);
    expect(rules.fieldPhases).toEqual([
      { fromLegalBall: 0, maxOutside: 2 },
      { fromLegalBall: 60, maxOutside: 4 },
      { fromLegalBall: 240, maxOutside: 5 },
    ]);
    expect(rules.limitedOversRain).toBe(false);
  });
  it("pins a distinct 50-over setup without enabling rain or DLS", () => {
    expect(setup.format).toBe("ODI");
    expect(setup.setupVersion).toBe("LC_ODI_SETUP_V1");
    expect(setup.versions.rules).toBe("LC_ODI_01");
    const s = ready(createODISession(setup));
    expect(s.core.innings[0]!.innings.allocatedBalls).toBe(300);
  });

  it("uses ODI model phases at 0-59, 60-239 and 240-299 legal balls", () => {
    expect(expectedGeneratorPhase("ODI", 0)).toBe("ODI_EARLY");
    expect(expectedGeneratorPhase("ODI", 59)).toBe("ODI_EARLY");
    expect(expectedGeneratorPhase("ODI", 60)).toBe("ODI_MIDDLE");
    expect(expectedGeneratorPhase("ODI", 239)).toBe("ODI_MIDDLE");
    expect(expectedGeneratorPhase("ODI", 240)).toBe("ODI_LATE");
    expect(expectedGeneratorPhase("ODI", 299)).toBe("ODI_LATE");
  });

  it("enforces ODI field restrictions at both powerplay boundaries", () => {
    const s = ready(createODISession(setup)),
      l = s.core.innings[0]!;
    expect(ODI_POWERPLAY_SLOTS).toHaveLength(9);
    expect(ODI_MIDDLE_SLOTS).toHaveLength(9);
    expect(ODI_FIELD_REGISTRY.positions.length).toBeGreaterThanOrEqual(10);
    validateODIField(s.core.fieldSlots, l.outfieldIds, "R", 0);
    const threeOutside = [...s.core.fieldSlots];
    threeOutside[0] = { ...threeOutside[0]!, slotId: "deep-cover" };
    expect(() => validateODIField(threeOutside, l.outfieldIds, "R", 0)).toThrow(
      "INVALID_FIELD_POWERPLAY",
    );
    validateODIField(threeOutside, l.outfieldIds, "R", 60);
    const fourOutside = [...threeOutside];
    fourOutside[1] = { ...fourOutside[1]!, slotId: "long-on" };
    validateODIField(fourOutside, l.outfieldIds, "R", 60);
    const fiveOutside = [...fourOutside];
    fiveOutside[2] = { ...fiveOutside[2]!, slotId: "long-off" };
    expect(() => validateODIField(fiveOutside, l.outfieldIds, "R", 60)).toThrow(
      "INVALID_FIELD_POWERPLAY",
    );
    validateODIField(fiveOutside, l.outfieldIds, "R", 240);
    expect(ODI_LATE_SLOTS.filter((slotId) =>
      !ODI_FIELD_REGISTRY.positions.find((p) => p.slotId === slotId)!.insideCircle,
    )).toHaveLength(5);
  });

  it("ends the first innings on exactly 300 legal balls with no phantom 301st ball", () => {
    let s = ready(createODISession(setup));
    for (let n = 0; n < 300; n++) {
      if (s.core.phase !== "READY") s = ready(s);
      s = applyODIFixtureResolution(s, resolution(s));
    }
    expect(s.core.innings[0]!.innings).toMatchObject({
      legalBalls: 300,
      wickets: 0,
      runs: 0,
      complete: true,
    });
    expect(s.core.innings[1]!.innings.targetToWin).toBe(1);
  });

  it("retains free-hit semantics across illegal balls", () => {
    let s = ready(createODISession(setup));
    s = applyODIFixtureResolution(s, resolution(s, { legality: "NO_BALL" }));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(true);
    s = applyODIFixtureResolution(s, resolution(s, { legality: "WIDE" }));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(true);
    s = applyODIFixtureResolution(s, resolution(s));
    expect(s.core.innings[0]!.innings.freeHitPending).toBe(false);
  });

  it("rejects the same bowler in consecutive overs", () => {
    let s = ready(createODISession(setup));
    const l = s.core.innings[0]!,
      teamId = l.innings.bowlingTeamId,
      bowlerId = l.innings.bowlerId!;
    for (let ball = 0; ball < 6; ball++)
      s = applyODIFixtureResolution(s, resolution(s));
    expect(s.core.phase).toBe("AWAITING_BOWLER");
    expect(() =>
      executeODICommand(s, {
        commandId: "same-bowler-next-over",
        expectedRevision: s.revision,
        actorId: `USER:${teamId}`,
        kind: "SET_BOWLER",
        payload: { teamId, bowlerId },
      }),
    ).toThrow();
  });

  it("enforces the 60-ball bowler quota through the public command path", () => {
    let s = ready(createODISession(setup));
    const first = s.core.innings[0]!,
      teamId = first.innings.bowlingTeamId,
      a = first.innings.bowlerId!;
    const t = setup.teams.find((x) => x.teamId === teamId)!;
    const alternates = t.xi
      .filter(
        (p) =>
          p.bowlingStyle !== null &&
          p.playerId !== t.keeperId &&
          p.playerId !== a,
      )
      .map((p) => p.playerId);
    expect(alternates.length).toBeGreaterThanOrEqual(1);
    const b = alternates[0]!;
    for (let over = 0; over < 20; over++) {
      if (over !== 0) {
        const id = over % 2 === 0 ? a : b;
        s = executeODICommand(s, {
          commandId: `pick-${over}`,
          expectedRevision: s.revision,
          actorId: `USER:${teamId}`,
          kind: "SET_BOWLER",
          payload: { teamId, bowlerId: id },
        }).session;
      }
      for (let ball = 0; ball < 6; ball++)
        s = applyODIFixtureResolution(s, resolution(s));
    }
    expect(s.core.innings[0]!.bowling[a]!.legalBalls).toBe(60);
    expect(s.core.innings[0]!.bowling[b]!.legalBalls).toBe(60);
    expect(() =>
      executeODICommand(s, {
        commandId: "quota",
        expectedRevision: s.revision,
        actorId: `USER:${teamId}`,
        kind: "SET_BOWLER",
        payload: { teamId, bowlerId: a },
      }),
    ).toThrow("BOWLER_QUOTA");
  });

  it("runs, replays, resimulates and rehydrates a complete seeded ODI", () => {
    const s = runFixtureODI(setup, 800);
    expect(s.core.phase).toBe("COMPLETE");
    const card = projectODIScorecard(s);
    expect(card.innings).toHaveLength(2);
    expect(card.innings.every((i) => i.legalBalls <= 300)).toBe(true);
    expect(
      replayODIEvents(setup, s.events, odiEventChainManifest(s)).lastEventHash,
    ).toBe(s.lastEventHash);
    resimulateODICommands(s);
    const restored = rehydrateODISession(structuredClone(s), world, manifest);
    expect(restored.lastEventHash).toBe(s.lastEventHash);
    expect(projectODIScorecard(restored)).toEqual(card);
  }, 15_000);

  it("round-trips a complete ODI through the portable save archive", async () => {
    const s = runFixtureODI(setup, 800);
    const summary: SaveSummary = {
      saveId: "odi-pass10",
      kind: "AUTO",
      title: "ODI exhibition",
      matchGameId: s.setup.gameId,
      matchId: s.setup.matchId,
      teams: [s.setup.teams[0]!.teamId, s.setup.teams[1]!.teamId],
      ground: s.setup.ground.groundId,
      phase: s.core.phase,
      revision: s.revision,
      eventCount: s.events.length,
      lastEventHash: s.lastEventHash,
      updatedAt: "2026-10-04T04:00:00.000Z",
      completed: true,
    };
    const bytes = await createPortableArchive(
      s,
      summary,
      ODI_ARCHIVE_PINS,
      summary.updatedAt,
    );
    const restored = await readPortableArchive(bytes, ODI_ARCHIVE_PINS);
    expect(restored.summary).toEqual(summary);
    const rehydrated = rehydrateODISession(restored.session, world, manifest);
    expect(rehydrated.lastEventHash).toBe(s.lastEventHash);
    expect(projectODIScorecard(rehydrated)).toEqual(projectODIScorecard(s));
  }, 15_000);
});
