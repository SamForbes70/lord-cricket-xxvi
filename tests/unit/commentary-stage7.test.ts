import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DeliveryRecordedSchema,
  MatchCommentaryFeedSchema,
  WorldPackSchema,
  type CommentaryEntry,
  type DeliveryRecorded,
  type T20TeamSelection,
} from "@lcxxvi/contracts";
import {
  projectMatchCommentary,
  selectCommentaryTextForMode,
  type CommittedCommentarySourceEvent,
} from "@lcxxvi/projections";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import { UI_VERSION } from "../../apps/web/src/match/protocol.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(
  readFileSync(resolve(repoRoot, "packages/data/worlds/fictional-eight-01.json")),
);
const worldManifest = JSON.parse(
  readFileSync(
    resolve(repoRoot, "packages/data/worlds/fictional-eight-01.manifest.json"),
    "utf8",
  ),
);

function makeEnvelope(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
): CommittedCommentarySourceEvent {
  const hex = sequence.toString(16).padStart(64, "0");
  return {
    sequence,
    type,
    payload,
    eventHash: hex,
  };
}

function makeDelivery(
  overrides: Partial<DeliveryRecorded> & { deliveryIndex: number },
): DeliveryRecorded {
  const legality = overrides.legality ?? "LEGAL";
  const legalBall =
    overrides.legalBall ?? (legality === "LEGAL");
  const countsAsBallFaced =
    overrides.countsAsBallFaced ?? (legality !== "WIDE" && legality !== "DEAD");
  const batRuns = overrides.batRuns ?? 0;
  const boundary =
    overrides.boundary ??
    (batRuns === 6 ? "SIX" : batRuns === 4 ? "FOUR" : "NONE");
  return DeliveryRecordedSchema.parse({
    type: "DELIVERY_RECORDED",
    inningsIndex: overrides.inningsIndex ?? 0,
    deliveryIndex: overrides.deliveryIndex,
    strikerId: overrides.strikerId ?? "p_striker",
    nonStrikerId: overrides.nonStrikerId ?? "p_non_striker",
    bowlerId: overrides.bowlerId ?? "p_bowler",
    legality,
    legalBall,
    countsAsBallFaced,
    batRuns,
    extras: overrides.extras ?? {
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penalties: 0,
    },
    completedRuns: overrides.completedRuns ?? (boundary === "NONE" ? batRuns : 0),
    boundary,
    dismissal: overrides.dismissal ?? null,
    endsAfter: overrides.endsAfter ?? {
      north: "p_striker",
      south: "p_non_striker",
    },
    shotSector: overrides.shotSector === undefined ? 2 : overrides.shotSector,
    trajectory: overrides.trajectory === undefined ? "GROUND" : overrides.trajectory,
    executedLength:
      overrides.executedLength === undefined ? "GOOD" : overrides.executedLength,
    fieldOutcome: overrides.fieldOutcome ?? "STOP",
    elapsedSeconds: overrides.elapsedSeconds ?? 30,
    freeHitNext:
      overrides.freeHitNext ?? (legality === "NO_BALL"),
  });
}

function slotValue(entry: CommentaryEntry, slot: string): string | undefined {
  return entry.factSlots.find((s) => s.slot === slot)?.value;
}

const TEST_PLAYER_NAMES: Record<string, string> = {
  p_striker: "A. Striker",
  p_non_striker: "B. NonStriker",
  p_batter3: "C. Three",
  p_bowler: "D. Bowler",
  p_keeper: "E. Keeper",
  p_fielder: "F. Fielder",
};

const TEST_TEAM_NAMES: Record<string, string> = {
  team_home: "Harbour XI",
  team_away: "Summit CC",
};

describe("Stage 7 contextual text commentary adapter", () => {
  it("enforces format-specific free-hit eligibility on no-balls (T20/ODI yes, RED_BALL never)", () => {
    const events: CommittedCommentarySourceEvent[] = [
      makeEnvelope(1, "TOSS_RESOLVED", {
        call: "HEADS",
        coin: "HEADS",
        winnerId: "team_home",
      }),
      makeEnvelope(2, "INNINGS_STARTED", {
        inningsIndex: 0,
        battingTeamId: "team_home",
      }),
      makeEnvelope(3, "DELIVERY_RECORDED", {
        event: makeDelivery({
          deliveryIndex: 0,
          legality: "NO_BALL",
          batRuns: 1,
          extras: { wides: 0, noBalls: 1, byes: 0, legByes: 0, penalties: 0 },
          freeHitNext: true,
        }),
      }),
      makeEnvelope(4, "DELIVERY_RECORDED", {
        event: makeDelivery({
          deliveryIndex: 1,
          legality: "LEGAL",
          batRuns: 4,
          shotSector: 5,
          freeHitNext: false,
        }),
      }),
    ];

    const t20 = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "T20",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:no-ball:t20",
      }),
    );
    const odi = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "ODI",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:no-ball:odi",
      }),
    );
    const red = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "RED_BALL",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:no-ball:red",
      }),
    );

    expect(slotValue(t20.entries[2]!, "freeHitNext")).toBe("FREE_HIT");
    expect(t20.entries[2]!.text.toLowerCase()).toContain("free hit");
    expect(slotValue(t20.entries[3]!, "isFreeHit")).toBe("true");
    expect(t20.entries[3]!.detailed.toLowerCase()).toContain("free-hit delivery");

    expect(slotValue(odi.entries[2]!, "freeHitNext")).toBe("FREE_HIT");
    expect(odi.entries[2]!.text.toLowerCase()).toContain("free hit");

    expect(slotValue(red.entries[2]!, "freeHitNext")).toBeUndefined();
    expect(red.entries[2]!.text.toLowerCase()).not.toContain("free hit");
    expect(red.entries[2]!.detailed.toLowerCase()).not.toContain("free hit");
    expect(slotValue(red.entries[3]!, "isFreeHit")).toBeUndefined();
    expect(red.entries[3]!.detailed.toLowerCase()).not.toContain("free-hit");
  });

  it("accurately describes wides, non-striker run-outs, all-out innings, milestones, and winning shots", () => {
    const events: CommittedCommentarySourceEvent[] = [
      makeEnvelope(1, "TOSS_RESOLVED", {
        call: "HEADS",
        coin: "HEADS",
        winnerId: "team_home",
      }),
      makeEnvelope(2, "INNINGS_STARTED", {
        inningsIndex: 0,
        battingTeamId: "team_home",
      }),
      // Wide ball
      makeEnvelope(3, "DELIVERY_RECORDED", {
        event: makeDelivery({
          deliveryIndex: 0,
          legality: "WIDE",
          batRuns: 0,
          extras: { wides: 2, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
        }),
      }),
      // Non-striker run out
      makeEnvelope(4, "DELIVERY_RECORDED", {
        event: makeDelivery({
          deliveryIndex: 1,
          legality: "LEGAL",
          batRuns: 0,
          fieldOutcome: "RUN_OUT",
          dismissal: {
            kind: "RUN_OUT",
            playerId: "p_non_striker",
            creditedBowlerId: null,
            fielderId: "p_fielder",
            wicketEnd: "SOUTH",
          },
        }),
      }),
    ];

    // Add 8 sixes + 8 wickets so 10th wicket triggers ALL_OUT and bowler 5-for
    let seq = 5;
    for (let w = 2; w <= 9; w += 1) {
      events.push(
        makeEnvelope(seq++, "DELIVERY_RECORDED", {
          event: makeDelivery({
            deliveryIndex: w,
            batRuns: 6,
            trajectory: "AERIAL",
            shotSector: 4,
            fieldOutcome: "NONE",
          }),
        }),
      );
      events.push(
        makeEnvelope(seq++, "DELIVERY_RECORDED", {
          event: makeDelivery({
            deliveryIndex: 100 + w,
            batRuns: 0,
            fieldOutcome: "NONE",
            dismissal: {
              kind: "BOWLED",
              playerId: "p_batter3",
              creditedBowlerId: "p_bowler",
              fielderId: null,
              wicketEnd: "NORTH",
            },
          }),
        }),
      );
    }
    // 10th wicket -> ALL_OUT (first innings ends at 50/10)
    events.push(
      makeEnvelope(seq++, "DELIVERY_RECORDED", {
        event: makeDelivery({
          deliveryIndex: 200,
          batRuns: 0,
          fieldOutcome: "NONE",
          dismissal: {
            kind: "LBW",
            playerId: "p_striker",
            creditedBowlerId: "p_bowler",
            fielderId: null,
            wicketEnd: "NORTH",
          },
        }),
      }),
    );
    events.push(
      makeEnvelope(seq++, "INNINGS_COMPLETED", { inningsIndex: 0 }),
    );
    events.push(
      makeEnvelope(seq++, "INNINGS_STARTED", {
        inningsIndex: 1,
        battingTeamId: "team_away",
      }),
    );

    // Second innings: p_striker hits 9 sixes (54 runs >= 50 batter + 50 partnership + beats target of 51 = winning shot!)
    for (let ball = 1; ball <= 9; ball += 1) {
      events.push(
        makeEnvelope(seq++, "DELIVERY_RECORDED", {
          event: makeDelivery({
            inningsIndex: 1,
            deliveryIndex: ball - 1,
            batRuns: 6,
            trajectory: "AERIAL",
            shotSector: 5,
            fieldOutcome: "NONE",
          }),
        }),
      );
    }

    const projected = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "T20",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:edge-cases",
      }),
    );

    // Wide check
    const wideEntry = projected.entries.find((e) => e.sequence === 3)!;
    expect(slotValue(wideEntry, "wides")).toBe("2");
    expect(wideEntry.short).toContain("2wd");
    expect(wideEntry.text.toLowerCase()).toContain("wide");

    // Non-striker run out check
    const nonStrikerRunOut = projected.entries.find((e) => e.sequence === 4)!;
    expect(slotValue(nonStrikerRunOut, "dismissedBatter")).toBe("B. NonStriker");
    expect(nonStrikerRunOut.short).toContain("run out NS");
    expect(nonStrikerRunOut.text).toContain("B. NonStriker");
    expect(nonStrikerRunOut.text.toLowerCase()).toContain("non-striker");

    // All-out innings check + bowler 5-for
    const allOutEntry = projected.entries.find((e) =>
      e.milestoneTags.includes("ALL_OUT"),
    );
    expect(allOutEntry).toBeDefined();
    expect(allOutEntry!.text.toLowerCase()).toContain("all out");

    const fiveForEntry = projected.entries.find((e) =>
      e.milestoneTags.includes("BOWLER_FIVE_FOR"),
    );
    expect(fiveForEntry).toBeDefined();
    expect(fiveForEntry!.text.toLowerCase()).toContain("five-wicket haul");

    // Batter fifty + Partnership fifty + Winning shot in chase
    const winningEntry = projected.entries[projected.entries.length - 1]!;
    expect(winningEntry.milestoneTags).toContain("WINNING_DELIVERY");
    expect(winningEntry.milestoneTags).toContain("BATTER_FIFTY");
    expect(winningEntry.milestoneTags).toContain("PARTNERSHIP_FIFTY");
    expect(slotValue(winningEntry, "targetToWin")).toBe("51");
    expect(winningEntry.text).toContain("Summit CC");
    expect(winningEntry.text.toLowerCase()).toContain("fifty");
  });

  it("enforces repetition cooldowns across consecutive identical dot balls, detects maidens with and without OVER_COMPLETED, and respects verbosity modes", () => {
    const events: CommittedCommentarySourceEvent[] = [
      makeEnvelope(1, "TOSS_RESOLVED", {
        call: "TAILS",
        coin: "TAILS",
        winnerId: "team_home",
      }),
      makeEnvelope(2, "INNINGS_STARTED", {
        inningsIndex: 0,
        battingTeamId: "team_home",
      }),
    ];
    for (let b = 1; b <= 6; b += 1) {
      events.push(
        makeEnvelope(2 + b, "DELIVERY_RECORDED", {
          event: makeDelivery({
            deliveryIndex: b - 1,
            batRuns: 0,
          }),
        }),
      );
    }

    const projectedA = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "RED_BALL",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:cooldown:key-a",
      }),
    );
    const projectedA2 = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "RED_BALL",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:cooldown:key-a",
      }),
    );
    const projectedB = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "RED_BALL",
        events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:cooldown:key-b",
      }),
    );

    // Exact deterministic reproducibility for identical presentationKey
    expect(projectedA).toEqual(projectedA2);

    // Factual slots remain identical even when presentationKey varies wording
    expect(projectedA.entries.map((e) => e.factSlots)).toEqual(
      projectedB.entries.map((e) => e.factSlots),
    );

    const dotEntries = projectedA.entries.slice(2);
    expect(dotEntries).toHaveLength(6);
    for (let i = 1; i < dotEntries.length; i += 1) {
      expect(dotEntries[i]!.templateId).not.toBe(dotEntries[i - 1]!.templateId);
    }
    // 6th dot ball completes a maiden over even without a separate OVER_COMPLETED event
    expect(dotEntries[5]!.milestoneTags).toContain("MAIDEN_OVER");
    expect(dotEntries[5]!.text.toLowerCase()).toContain("maiden");

    // Also verify OVER_COMPLETED maiden path in T20
    const t20Events = [
      ...events,
      makeEnvelope(9, "OVER_COMPLETED", { bowlerId: "p_bowler" }),
    ];
    const t20Feed = MatchCommentaryFeedSchema.parse(
      projectMatchCommentary({
        format: "T20",
        events: t20Events,
        playerNames: TEST_PLAYER_NAMES,
        teamNames: TEST_TEAM_NAMES,
        teamIds: ["team_home", "team_away"],
        groundName: "Harbour Oval",
        presentationKey: "stage7:cooldown:t20",
      }),
    );
    expect(t20Feed.entries[8]!.milestoneTags).toContain("MAIDEN_OVER");
    expect(t20Feed.entries[7]!.milestoneTags).not.toContain("MAIDEN_OVER");

    // Verbosity mode helper
    const sample = dotEntries[5]!;
    expect(selectCommentaryTextForMode(sample, "brief")).toBe(sample.short);
    expect(selectCommentaryTextForMode(sample, "full")).toBe(sample.text);
    expect(selectCommentaryTextForMode(sample, "STANDARD")).toBe(sample.text);
    expect(selectCommentaryTextForMode(sample, "detailed")).toBe(sample.detailed);
    expect(selectCommentaryTextForMode(sample, "off")).toBe("");
  });

  it("integrates across T20, ODI, and RED_BALL controllers with schema-valid entries and zero simulation hash drift", () => {

    const world = WorldPackSchema.parse(
      JSON.parse(new TextDecoder().decode(worldBytes)),
    );
    const pickSelection = (teamIndex: number): T20TeamSelection => {
      const team = world.teams[teamIndex]!;
      const players = team.squadIds.map(
        (id) => world.players.find((p) => p.playerId === id)!,
      );
      const keeper = players.find((p) => p.role === "KEEPER")!;
      const bowlers = players
        .filter(
          (p) =>
            p.playerId !== keeper.playerId &&
            (p.role === "BOWLER" ||
              p.role === "ALLROUNDER" ||
              p.bowlingStyle !== null),
        )
        .slice(0, 5);
      const rest = players.filter(
        (p) => p.playerId !== keeper.playerId && !bowlers.includes(p),
      );
      const xi = [keeper, ...bowlers, ...rest].slice(0, 11);
      return {
        teamId: team.teamId,
        playerIds: xi.map((p) => p.playerId),
        captainId: xi[0]!.playerId,
        keeperId: keeper.playerId,
      };
    };

    function runSampleMatch(
      format: "T20" | "ODI" | "RED_BALL",
      seedHex: string,
      maxTurns: number,
    ) {
      let reqSeq = 0;
      const nextId = () => `ui-${++reqSeq}`;
      const ctl =
        format === "T20"
          ? createMatchController(worldBytes, worldManifest, () => seedHex)
          : format === "ODI"
            ? createODIMatchController(worldBytes, worldManifest, () => seedHex)
            : createRed5MatchController(worldBytes, worldManifest, () => seedHex);

      let res = ctl.handle({
        version: UI_VERSION,
        requestId: nextId(),
        expectedRevision: 0,
        type: "START",
        format,
        selections: [pickSelection(0), pickSelection(1)],
        groundId: world.grounds[0]!.groundId,
      });
      if (res.error || !res.view) throw new Error(`START(${format}): ${res.error}`);

      let turns = 0;
      while (res.view && res.view.phase !== "COMPLETE" && turns < maxTurns) {
        turns += 1;
        const v = res.view;
        const team = v.decisionTeamId ?? v.teams[0]!.id;
        const reqId = nextId();
        if (v.phase === "TOSS") {
          res = ctl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "CALL_TOSS",
              payload: { teamId: team, call: "HEADS" },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "AWAITING_INNINGS") {
          res = ctl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "CHOOSE_INNINGS",
              payload: { teamId: team, choice: "BAT" },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "AWAITING_FOLLOW_ON") {
          res = ctl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "DECIDE_FOLLOW_ON",
              payload: { teamId: team, enforce: true },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "AWAITING_BATTER") {
          const cand = v.candidates.find((c) => !c.reason)!;
          res = ctl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "SET_BATTER",
              payload: { teamId: team, playerId: cand.id },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "AWAITING_BOWLER") {
          const cand = v.candidates.find((c) => !c.reason)!;
          res = ctl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "SET_BOWLER",
              payload: { teamId: team, bowlerId: cand.id },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "READY") {
          res = ctl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "ADVANCE",
              payload: { scope: "OVER" },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: "SYSTEM",
            },
          });
        } else {
          break;
        }
        if (res.error || !res.view) throw new Error(`STEP(${format}): ${res.error}`);
      }
      return res.view;
    }

    let fetchCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      throw new Error("Network calls forbidden in commentary adapter");
    }) as typeof fetch;
    try {
      const seedHex = "stage7-determinism-seed";
      const t20A = runSampleMatch("T20", seedHex, 160);
      const t20B = runSampleMatch("T20", seedHex, 160);
      expect(t20A.lastEventHash).toBe(t20B.lastEventHash);
      expect(t20A.commentary).toEqual(t20B.commentary);
      expect(t20A.commentary.length).toBe(t20A.eventCount);

      const odiView = runSampleMatch("ODI", seedHex, 160);
      expect(odiView.commentary.length).toBe(odiView.eventCount);

      const redView = runSampleMatch("RED_BALL", seedHex, 120);
      expect(redView.commentary.length).toBe(redView.eventCount);
      for (const entry of redView.commentary) {
        expect(entry.text.toLowerCase()).not.toContain("free hit");
        expect(entry.detailed.toLowerCase()).not.toContain("free hit");
      }
      expect(fetchCount).toBe(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  }, 30_000);
});
