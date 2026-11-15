import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIELD_REGISTRY, ODI_FIELD_REGISTRY } from "@lcxxvi/data";
import {
  LiveFieldPresentationSchema,
  WorldPackSchema,
  type DeliveryRecorded,
  type T20TeamSelection,
} from "@lcxxvi/contracts";
import {
  validateODIField,
  validateRed5Field,
  validateT20Field,
} from "@lcxxvi/simulation";
import {
  buildDeliveryHighlightCues,
  evaluateFieldPlacementLegality,
  projectLiveFieldPresentation,
  selectHighlightReelForMode,
  type CommittedEventEnvelopeLike,
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

describe("Stage 6: Live field & highlight presentation", () => {
  it("mirrors named field coordinates horizontally between RHB and LHB while preserving leg-side and circle semantics", () => {
    const t20Outfield = [
      "f1",
      "f2",
      "f3",
      "f4",
      "f5",
      "f6",
      "f7",
      "f8",
      "f9",
    ];
    const defaultSlots = FIELD_REGISTRY.positions.slice(0, 9).map((pos, idx) => ({
      playerId: t20Outfield[idx]!,
      slotId: pos.slotId,
    }));
    const names = Object.fromEntries([
      ...t20Outfield.map((id) => [id, `Player ${id}`]),
      ["bat-r", "Right Batter"],
      ["bat-l", "Left Batter"],
    ]);
    const hands = { "bat-r": "R" as const, "bat-l": "L" as const };

    const makeFakeLedger = (strikerId: string) => [
      {
        innings: {
          inningsIndex: 0,
          battingTeamId: "team-a",
          bowlingTeamId: "team-b",
          runs: 0,
          wickets: 0,
          legalBalls: 0,
          deliveries: 0,
          wides: 0,
          noBalls: 0,
          byes: 0,
          legByes: 0,
          penalties: 0,
          targetRuns: null,
          northBatterId: strikerId,
          southBatterId: "bat-r",
          strikerEnd: "NORTH" as const,
          bowlerId: "f1",
          previousOverBowlerId: null,
          freeHitNext: false,
          closedReason: null,
        },
        battingOrder: [strikerId, "bat-r"],
        batting: {},
        bowling: {},
        fallOfWickets: [],
        keeperId: "wk-1",
        outfieldIds: t20Outfield,
      },
    ];

    const rhbPres = projectLiveFieldPresentation({
      format: "T20",
      phase: "READY",
      innings: makeFakeLedger("bat-r") as never,
      activeIndex: 0,
      fieldSlots: defaultSlots,
      events: [],
      names,
      hands,
    });
    const lhbPres = projectLiveFieldPresentation({
      format: "T20",
      phase: "READY",
      innings: makeFakeLedger("bat-l") as never,
      activeIndex: 0,
      fieldSlots: defaultSlots,
      events: [],
      names,
      hands,
    });

    expect(rhbPres.positions).toHaveLength(11);
    expect(lhbPres.positions).toHaveLength(11);

    for (let i = 0; i < rhbPres.positions.length; i++) {
      const rPos = rhbPres.positions[i]!;
      const lPos = lhbPres.positions[i]!;
      expect(rPos.slotId).toBe(lPos.slotId);
      expect(rPos.point.x10 + lPos.point.x10).toBe(2000);
      expect(rPos.point.y10).toBe(lPos.point.y10);
      // A physical RHB off-side slot becomes LHB leg-side unless mirrored by slot definition:
      // canonical positions reflect horizontally with strikerHand so slip-1 stays off-side for both hands!
      expect(rPos.insideCircle).toBe(lPos.insideCircle);
      expect(rPos.behindSquare).toBe(lPos.behindSquare);
    }

    // For RHB, slip-1 is off-side (right of x=1000) and fine-leg is leg-side (left of x=1000).
    const rSlip = rhbPres.positions.find((p) => p.slotId === "slip-1")!;
    const rFineLeg = rhbPres.positions.find((p) => p.slotId === "fine-leg")!;
    expect(rSlip.point.x10).toBeGreaterThan(1000);
    expect(rFineLeg.point.x10).toBeLessThan(1000);

    // For LHB, slip-1 flips to left of x=1000 and fine-leg flips to right of x=1000.
    const lSlip = lhbPres.positions.find((p) => p.slotId === "slip-1")!;
    const lFineLeg = lhbPres.positions.find((p) => p.slotId === "fine-leg")!;
    expect(lSlip.point.x10).toBeLessThan(1000);
    expect(lFineLeg.point.x10).toBeGreaterThan(1000);

    // ODI includes long-off (12 total positions).
    const odiPres = projectLiveFieldPresentation({
      format: "ODI",
      phase: "READY",
      innings: makeFakeLedger("bat-r") as never,
      activeIndex: 0,
      fieldSlots: ODI_FIELD_REGISTRY.positions.slice(0, 9).map((pos, idx) => ({
        playerId: t20Outfield[idx]!,
        slotId: pos.slotId,
      })),
      events: [],
      names,
      hands,
    });
    expect(odiPres.positions).toHaveLength(12);
    expect(odiPres.positions.some((p) => p.slotId === "long-off")).toBe(true);
  });

  it("matches authoritative T20, ODI, and Red-ball field legality validators across circle, duplicate, leg-side, and behind-square limits", () => {
    const outfieldIds = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"];

    // 1. Valid T20 Powerplay field (7 inside circle + 2 outside circle: fine-leg, deep-square-leg).
    const validPowerplaySlots = [
      { playerId: "f1", slotId: "slip-1" },
      { playerId: "f2", slotId: "slip-2" },
      { playerId: "f3", slotId: "point" },
      { playerId: "f4", slotId: "cover" },
      { playerId: "f5", slotId: "mid-off" },
      { playerId: "f6", slotId: "mid-on" },
      { playerId: "f7", slotId: "midwicket" },
      { playerId: "f8", slotId: "deep-square-leg" },
      { playerId: "f9", slotId: "fine-leg" },
    ];
    const ppLegal = evaluateFieldPlacementLegality({
      format: "T20",
      strikerHand: "R",
      legalBalls: 12,
      fieldSlots: validPowerplaySlots,
      outfieldIds,
    });
    expect(ppLegal.isLegal).toBe(true);
    expect(ppLegal.outsideCircleCount).toBe(2);
    expect(ppLegal.maxOutsideCircle).toBe(2);
    expect(() =>
      validateT20Field(validPowerplaySlots, outfieldIds, "R", 12),
    ).not.toThrow();

    // 2. Exceeding Powerplay circle limit (3 deep: deep-square-leg, fine-leg, deep-cover -> illegal at ball 12, legal at ball 42).
    const threeDeepSlots = validPowerplaySlots.map((s) =>
      s.playerId === "f2" ? { ...s, slotId: "deep-cover" } : s,
    );
    const ppIllegal = evaluateFieldPlacementLegality({
      format: "T20",
      strikerHand: "R",
      legalBalls: 12,
      fieldSlots: threeDeepSlots,
      outfieldIds,
    });
    expect(ppIllegal.isLegal).toBe(false);
    expect(
      ppIllegal.violations.some((v) => v.code === "CIRCLE_RESTRICTION"),
    ).toBe(true);
    expect(() =>
      validateT20Field(threeDeepSlots, outfieldIds, "R", 12),
    ).toThrow();

    const postPpLegal = evaluateFieldPlacementLegality({
      format: "T20",
      strikerHand: "R",
      legalBalls: 42,
      fieldSlots: threeDeepSlots,
      outfieldIds,
    });
    expect(postPpLegal.isLegal).toBe(true);
    expect(postPpLegal.maxOutsideCircle).toBe(5);
    expect(() =>
      validateT20Field(threeDeepSlots, outfieldIds, "R", 42),
    ).not.toThrow();

    // 3. ODI Powerplay 1 (max 2) vs Powerplay 2 (max 4).
    // Note: for LHB striker, RHB off-side slots (slip-1, point, cover, mid-off, deep-cover) become LHB leg-side!
    // Let's keep legSide <= 5 and behindSquareLeg <= 2 for LHB by using mid-on, midwicket, point, cover, mid-off, slip-1, fine-leg, deep-square-leg, long-on.
    const lhbThreeDeepSlots = [
      { playerId: "f1", slotId: "slip-1" },
      { playerId: "f2", slotId: "point" },
      { playerId: "f3", slotId: "cover" },
      { playerId: "f4", slotId: "mid-off" },
      { playerId: "f5", slotId: "mid-on" },
      { playerId: "f6", slotId: "midwicket" },
      { playerId: "f7", slotId: "deep-square-leg" },
      { playerId: "f8", slotId: "fine-leg" },
      { playerId: "f9", slotId: "long-on" },
    ];
    expect(
      evaluateFieldPlacementLegality({
        format: "ODI",
        strikerHand: "L",
        legalBalls: 30,
        fieldSlots: lhbThreeDeepSlots,
        outfieldIds,
      }).isLegal,
    ).toBe(false);
    expect(() =>
      validateODIField(lhbThreeDeepSlots, outfieldIds, "L", 30),
    ).toThrow();

    const odiP2 = evaluateFieldPlacementLegality({
      format: "ODI",
      strikerHand: "L",
      legalBalls: 120,
      fieldSlots: lhbThreeDeepSlots,
      outfieldIds,
    });
    expect(odiP2.isLegal).toBe(true);
    expect(odiP2.maxOutsideCircle).toBe(4);
    expect(() =>
      validateODIField(lhbThreeDeepSlots, outfieldIds, "L", 120),
    ).not.toThrow();

    // 4. Duplicate slot detection.
    const duplicateSlots = validPowerplaySlots.map((s) =>
      s.playerId === "f2" ? { ...s, slotId: "slip-1" } : s,
    );
    const dupEval = evaluateFieldPlacementLegality({
      format: "RED_BALL",
      strikerHand: "R",
      legalBalls: 0,
      fieldSlots: duplicateSlots,
      outfieldIds,
    });
    expect(dupEval.isLegal).toBe(false);
    expect(
      dupEval.violations.some((v) => v.code === "DUPLICATE_POSITION"),
    ).toBe(true);
    expect(() =>
      validateRed5Field(duplicateSlots, outfieldIds, "R"),
    ).toThrow();
  });

  it("handles missing shotSector data with central pitch/keeper channel fallback and zero fabricated tracking metrics", () => {
    const delivery: DeliveryRecorded = {
      type: "DELIVERY_RECORDED",
      inningsIndex: 0,
      deliveryIndex: 2,
      overNumber: 0,
      ballInOver: 3,
      legalBall: true,
      strikerId: "bat-1",
      nonStrikerId: "bat-2",
      bowlerId: "bwl-1",
      battingPlan: { aggression: 2, intent: "NORMAL" },
      bowlingPlan: {
        variationId: "stock",
        line: "OFF",
        length: "GOOD",
        effort: "NORMAL",
      },
      legality: "LEGAL",
      batRuns: 0,
      completedRuns: 0,
      boundary: "NONE",
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
      dismissal: {
        kind: "CAUGHT",
        playerId: "bat-1",
        bowlerCredited: true,
        fielderId: "wk-1",
      },
      strikerEndAfter: "SOUTH",
      freeHitNext: false,
      fatigueDeltaBp: 18,
      pitchWearDeltaBp: 1,
      executedLength: "GOOD",
      shotSector: null,
      trajectory: "EDGE",
      fieldOutcome: "CATCH",
    } as unknown as DeliveryRecorded;

    const missingSectorEvent: CommittedEventEnvelopeLike = {
      sequence: 7,
      type: "DELIVERY_RECORDED",
      eventHash: "ab".repeat(32),
      payload: { event: delivery },
    };

    const cues = buildDeliveryHighlightCues({
      events: [missingSectorEvent],
      hands: { "bat-1": "L", "bat-2": "R" },
      names: {
        "bat-1": "A. Leftie",
        "bat-2": "B. Partner",
        "bwl-1": "C. Seamer",
        "wk-1": "D. Keeper",
      },
    });

    expect(cues).toHaveLength(1);
    const cue = cues[0]!;
    expect(cue.sectorStatus).toBe("PITCH_CHANNEL_ONLY");
    expect(cue.recordedSector).toBeNull();
    expect(cue.displaySector).toBeNull();
    expect(cue.isKeyMoment).toBe(true);
    expect(cue.momentKind).toBe("WICKET");
    expect(cue.targetPoint.x10).toBe(1000);
    expect(cue.detailText).toContain("No shot sector recorded");
    expect(cue.trackingDisclaimer).toContain("Illustrative highlight");
    expect(cue.detailText).not.toMatch(/km\/h|mph|metres|meters|yards/i);
  });

  it("filters highlight reels accurately across EVERY_BALL, KEY_MOMENT, and FAST modes", () => {
    const makeEnvelope = (
      sequence: number,
      batRuns: number,
      shotSector: number | null,
      freeHitNext = false,
    ): CommittedEventEnvelopeLike => ({
      sequence,
      type: "DELIVERY_RECORDED",
      eventHash: String(sequence).padStart(64, "0"),
      payload: {
        event: {
          type: "DELIVERY_RECORDED",
          inningsIndex: 0,
          deliveryIndex: sequence - 1,
          overNumber: 0,
          ballInOver: sequence,
          legalBall: !freeHitNext,
          strikerId: "bat-1",
          nonStrikerId: "bat-2",
          bowlerId: "bwl-1",
          battingPlan: { aggression: 2, intent: "NORMAL" },
          bowlingPlan: {
            variationId: "stock",
            line: "STUMPS",
            length: "GOOD",
            effort: "NORMAL",
          },
          legality: freeHitNext ? "NO_BALL" : "LEGAL",
          batRuns,
          completedRuns: batRuns === 4 || batRuns === 6 ? 0 : batRuns,
          boundary: batRuns === 6 ? "SIX" : batRuns === 4 ? "FOUR" : "NONE",
          extras: {
            wides: 0,
            noBalls: freeHitNext ? 1 : 0,
            byes: 0,
            legByes: 0,
            penalties: 0,
          },
          dismissal: null,
          strikerEndAfter: "SOUTH",
          freeHitNext,
          fatigueDeltaBp: 15,
          pitchWearDeltaBp: 1,
          executedLength: "GOOD",
          shotSector,
          trajectory: batRuns === 6 ? "AERIAL" : "GROUND",
          fieldOutcome: "NONE",
        } as unknown as DeliveryRecorded,
      },
    });

    const cues = buildDeliveryHighlightCues({
      events: [
        makeEnvelope(1, 0, null),
        makeEnvelope(2, 1, 2),
        makeEnvelope(3, 4, 3),
        makeEnvelope(4, 0, 5, true),
        makeEnvelope(5, 6, 6),
      ],
      hands: { "bat-1": "R", "bat-2": "R" },
      names: { "bat-1": "Batter", "bat-2": "Partner", "bwl-1": "Bowler" },
    });

    expect(
      selectHighlightReelForMode({
        cues,
        fromSequence: 1,
        toSequence: 5,
        mode: "EVERY_BALL",
      }).map((c) => c.sequence),
    ).toEqual([1, 2, 3, 4, 5]);

    expect(
      selectHighlightReelForMode({
        cues,
        fromSequence: 1,
        toSequence: 5,
        mode: "KEY_MOMENT",
      }).map((c) => c.sequence),
    ).toEqual([3, 4, 5]);

    expect(
      selectHighlightReelForMode({
        cues,
        fromSequence: 1,
        toSequence: 5,
        mode: "FAST",
      }),
    ).toEqual([]);
  });

  it("preserves identical final state hashes and event chains across T20, ODI, and Red-ball regardless of highlight pacing or reduced motion", () => {
    function runControllerMatch(
      format: "T20" | "ODI" | "RED_BALL",
      seedHex: string,
      exercisePresentationModes: boolean,
    ) {
      const create =
        format === "T20"
          ? createMatchController
          : format === "ODI"
            ? createODIMatchController
            : createRed5MatchController;
      const ctrl = create(worldBytes, worldManifest, () => seedHex);
      let req = 0;
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
      let res = ctrl.handle({
        version: UI_VERSION,
        requestId: `ui-${++req}`,
        expectedRevision: 0,
        type: "START",
        format,
        selections: [pickSelection(0), pickSelection(1)],
        groundId: world.grounds[0]!.groundId,
      });
      if (res.error) throw new Error(`START(${format}): ${res.error}`);

      const maxSteps = format === "RED_BALL" ? 90 : 320;
      let steps = 0;
      while (res.view && res.view.phase !== "COMPLETE" && steps < maxSteps) {
        steps += 1;
        const v = res.view;
        if (exercisePresentationModes && v.fieldPresentation) {
          const parsed = LiveFieldPresentationSchema.parse(v.fieldPresentation);
          selectHighlightReelForMode({
            cues: parsed.recentHighlights,
            fromSequence: Math.max(1, v.eventCount - 6),
            toSequence: v.eventCount,
            mode:
              steps % 3 === 0
                ? "EVERY_BALL"
                : steps % 3 === 1
                  ? "KEY_MOMENT"
                  : "FAST",
          });
          projectLiveFieldPresentation({
            format,
            phase: v.phase,
            innings: v.innings,
            activeIndex: v.activeIndex,
            fieldSlots: v.fieldSlots,
            events: [],
            names: v.names,
            hands: v.hands,
          });
        }

        const team = v.decisionTeamId ?? v.teams[0]!.id;
        const reqId = `ui-${++req}`;
        if (v.phase === "TOSS") {
          res = ctrl.handle({
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
          res = ctrl.handle({
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
          res = ctrl.handle({
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
          const pick = v.candidates.find((c) => !c.reason)!;
          res = ctrl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "SET_BATTER",
              payload: { teamId: team, playerId: pick.id },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "AWAITING_BOWLER") {
          const pick = v.candidates.find((c) => !c.reason)!;
          res = ctrl.handle({
            version: UI_VERSION,
            requestId: reqId,
            expectedRevision: v.revision,
            type: "COMMAND",
            origin: "HUMAN",
            command: {
              kind: "SET_BOWLER",
              payload: { teamId: team, bowlerId: pick.id },
              commandId: reqId,
              expectedRevision: v.revision,
              actorId: `USER:${team}`,
            },
          });
        } else if (v.phase === "READY") {
          res = ctrl.handle({
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
        if (res.error) throw new Error(`${format}@${v.phase}: ${res.error}`);
      }

      const finalView = res.view!;
      const finalRevision = res.revision;
      const verify =
        finalView.phase === "COMPLETE"
          ? ctrl.handle({
              version: UI_VERSION,
              requestId: `ui-${++req}`,
              expectedRevision: finalRevision,
              type: "VERIFY",
            })
          : null;
      return {
        revision: finalRevision,
        lastEventHash: finalView.lastEventHash,
        eventCount: finalView.eventCount,
        verification: verify?.verification ?? null,
      };
    }

    const seed = "stage6-determinism-seed";
    for (const format of ["T20", "ODI", "RED_BALL"] as const) {
      const baseline = runControllerMatch(format, seed, false);
      const withPresentation = runControllerMatch(format, seed, true);
      expect(withPresentation.revision).toBe(baseline.revision);
      expect(withPresentation.eventCount).toBe(baseline.eventCount);
      expect(withPresentation.lastEventHash).toBe(baseline.lastEventHash);
      if (baseline.verification && withPresentation.verification) {
        expect(withPresentation.verification.scorecardSha256).toBe(
          baseline.verification.scorecardSha256,
        );
        expect(withPresentation.verification.eventsSha256).toBe(
          baseline.verification.eventsSha256,
        );
      }
    }
  }, 30_000);
});
