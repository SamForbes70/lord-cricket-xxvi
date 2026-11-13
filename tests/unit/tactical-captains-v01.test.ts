import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendDelegationChange,
  delegationForTeam,
  redBallProfileForTeam,
  replayDelegationJournal,
  type DelegationJournal,
} from "@lcxxvi/contracts";
import {
  adviseODICaptain,
  adviseRed5Captain,
  type ODITacticalPublicView,
  type Red5TacticalPublicView,
} from "@lcxxvi/ai";
import {
  createODISession,
  createRed5Session,
  executeODICommand,
  executeRed5Command,
  projectODIScorecard,
  projectRed5Scorecard,
  replayODIEvents,
  replayRed5Events,
  resimulateODICommands,
  resimulateRed5Commands,
  odiEventChainManifest,
  red5EventChainManifest,
  validateODIField,
  validateODIMatchSetup,
  validateRed5Field,
  validateRed5MatchSetup,
} from "@lcxxvi/simulation";
import { proposeOpponentODICommand, proposeOpponentRed5Command } from "../../apps/web/src/match/ai-opponent.js";
import { createRed5MatchController } from "../../apps/web/src/match/controller-red5.js";
import { createODIMatchController } from "../../apps/web/src/match/controller-odi.js";
import { runTacticalODI, runTacticalRed5 } from "../../apps/batch/src/tactical-match.js";

const worldBytes = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const odiTemplate = JSON.parse(readFileSync("tests/fixtures/world/odi-valid-setup.json", "utf8"));
const red5Template = JSON.parse(readFileSync("tests/fixtures/world/red5-valid-setup.json", "utf8"));

const SAMPLE_OUTFIELD = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];

describe("Batch 6: ODI & Red-ball tactical captains, profiles, delegation, and red-ball weather truth", () => {
  it("persists red-ball tactical profile and extended delegation categories while preserving V1 journals", () => {
    const empty: DelegationJournal = { version: "LC_DELEGATION_JOURNAL_V1", changes: [] };
    expect(redBallProfileForTeam(empty, "team-01")).toBe("BALANCED");

    // Existing V1 change without redBallProfile remains valid
    const v1 = appendDelegationChange(empty, {
      commandId: "legacy-1",
      expectedRevision: 0,
      matchRevision: 1,
      teamId: "team-01",
      categories: ["TOSS", "BOWLER"],
    });
    expect(redBallProfileForTeam(v1, "team-01")).toBe("BALANCED");
    expect(delegationForTeam(v1, "team-01")).toEqual(["TOSS", "BOWLER"]);

    // Extended red-ball categories + profile
    const v2 = appendDelegationChange(v1, {
      commandId: "red5-profile-1",
      expectedRevision: 1,
      matchRevision: 4,
      teamId: "team-01",
      categories: ["BOWLER", "FIELD", "DECLARATION", "FOLLOW_ON", "NEW_BALL"],
      redBallProfile: "AGGRESSIVE",
    });
    const roundTripped = replayDelegationJournal(JSON.parse(JSON.stringify(v2)));
    expect(redBallProfileForTeam(roundTripped, "team-01")).toBe("AGGRESSIVE");
    expect(redBallProfileForTeam(roundTripped, "team-02")).toBe("BALANCED");
    expect(delegationForTeam(roundTripped, "team-01")).toEqual([
      "BOWLER",
      "FIELD",
      "DECLARATION",
      "FOLLOW_ON",
      "NEW_BALL",
    ]);
  });

  it("advises legal ODI fields, quotas, and resource-aware plans across all three field phases and both hands", () => {
    const baseCandidates = [
      {
        playerId: "strike-ace",
        control: 82,
        movement: 84,
        variation: 70,
        stamina: 76,
        fatigueBp: 1200,
        legalBallsBowled: 48,
        quotaRemaining: 12,
      },
      {
        playerId: "fifth-bowler",
        control: 68,
        movement: 62,
        variation: 65,
        stamina: 74,
        fatigueBp: 600,
        legalBallsBowled: 12,
        quotaRemaining: 48,
      },
    ];

    for (const legalBalls of [12, 120, 264]) {
      for (const strikerHand of ["R", "L"] as const) {
        const view: ODITacticalPublicView = {
          inningsLegalBalls: legalBalls,
          inningsRuns: legalBalls === 120 ? 92 : 210,
          wicketsLost: legalBalls === 120 ? 5 : 3,
          targetToWin: legalBalls === 264 ? 265 : null,
          availableBatters: legalBalls === 120 ? 5 : 7,
          strikerHand,
          outfieldIds: SAMPLE_OUTFIELD,
          bowlingCandidates: baseCandidates,
        };
        const advice = adviseODICaptain(view);
        expect(() => validateODIField(advice.fieldSlots, SAMPLE_OUTFIELD, strikerHand, legalBalls)).not.toThrow();
        if (legalBalls === 120) {
          // Middle overs preserve the 2-over-left strike bowler when a fresh high-quota bowler is available
          expect(advice.preferredBowlerId).toBe("fifth-bowler");
          expect(advice.aggression).toBeLessThanOrEqual(2);
        }
        if (legalBalls === 264) {
          // Late overs deploy the strike bowler and accelerate for steep chase
          expect(advice.preferredBowlerId).toBe("strike-ace");
          expect(advice.aggression).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("runs a complete repeatable ODI match under tactical captaincy and honours partial delegation", () => {
    const req = structuredClone(odiTemplate);
    req.setup.seed = "v01-020-odi-tactical-seed";
    const setup = validateODIMatchSetup(req, worldBytes, worldManifest);
    const first = runTacticalODI(setup);
    const second = runTacticalODI(setup);
    expect(first.core.phase).toBe("COMPLETE");
    expect(first.lastEventHash).toBe(second.lastEventHash);
    const replayed = replayODIEvents(first.setup, first.events, odiEventChainManifest(first));
    expect(projectODIScorecard(replayed)).toEqual(projectODIScorecard(first));
    expect(() => resimulateODICommands(first)).not.toThrow();

    // Partial delegation: delegating only BOWLER never proposes TOSS or BATTING_PLAN
    let partial = createODISession(setup);
    partial = executeODICommand(partial, {
      commandId: "init-confirm",
      expectedRevision: 0,
      actorId: "SYSTEM",
      kind: "CONFIRM_TEAMS",
      payload: {},
    }).session;
    expect(proposeOpponentODICommand(partial, partial.setup.teams[0]!.teamId, ["BOWLER"])).toBeNull();
    expect(proposeOpponentODICommand(partial, partial.setup.teams[0]!.teamId, ["TOSS"])?.kind).toBe("CALL_TOSS");
  }, 30_000);

  it("bounds red-ball tactical advice by profile across declarations, follow-on, new ball, workload and fields", () => {
    const bowlers = [
      {
        playerId: "seamer-tired",
        isSpin: false,
        control: 84,
        movement: 85,
        variation: 62,
        stamina: 72,
        fatigueBp: 6800,
        legalBallsBowled: 132,
      },
      {
        playerId: "seamer-fresh",
        isSpin: false,
        control: 76,
        movement: 79,
        variation: 60,
        stamina: 80,
        fatigueBp: 1400,
        legalBallsBowled: 54,
      },
      {
        playerId: "spinner-1",
        isSpin: true,
        control: 78,
        movement: 70,
        variation: 82,
        stamina: 85,
        fatigueBp: 1800,
        legalBallsBowled: 90,
      },
    ];

    const thirdInningsLead290: Omit<Red5TacticalPublicView, "profile"> = {
      inningsIndex: 2,
      inningsLegalBalls: 420,
      inningsRuns: 240,
      wicketsLost: 5,
      leadRuns: 290,
      targetToWin: null,
      availableBatters: 5,
      day: 4,
      localSeconds: 15 * 3600,
      dayLegalBalls: 300,
      finalHourActive: false,
      finalHourBallsRemaining: 0,
      ballAgeLegalBalls: 480,
      newBallAvailable: true,
      followOnAvailable: false,
      pitchSeamBp: 5200,
      pitchTurnBp: 5400,
      pitchWearPoints: 260,
      strikerHand: "L",
      outfieldIds: SAMPLE_OUTFIELD,
      bowlingCandidates: bowlers,
    };

    const aggressive = adviseRed5Captain({ ...thirdInningsLead290, profile: "AGGRESSIVE" });
    const balanced = adviseRed5Captain({ ...thirdInningsLead290, profile: "BALANCED" });
    const conservative = adviseRed5Captain({ ...thirdInningsLead290, profile: "CONSERVATIVE" });

    expect(aggressive.shouldDeclare).toBe(true);
    expect(conservative.shouldDeclare).toBe(false);
    expect(balanced.takeNewBall).toBe(true);
    // Rests the fatigued seamer (6800 bp) in favour of the fresh seamer with the new ball
    expect(balanced.preferredBowlerId).toBe("seamer-fresh");

    for (const advice of [aggressive, balanced, conservative]) {
      expect(() => validateRed5Field(advice.fieldSlots, SAMPLE_OUTFIELD, "L")).not.toThrow();
    }

    // Follow-on posture differs cleanly when bowlers carry moderate fatigue on Day 3 with a 215-run lead
    const followOnView: Omit<Red5TacticalPublicView, "profile"> = {
      ...thirdInningsLead290,
      inningsIndex: 1,
      leadRuns: 215,
      day: 3,
      localSeconds: 12 * 3600,
      followOnAvailable: true,
      newBallAvailable: false,
      bowlingCandidates: bowlers.map((b) => ({ ...b, fatigueBp: 3600 })),
    };
    expect(adviseRed5Captain({ ...followOnView, profile: "AGGRESSIVE" }).enforceFollowOn).toBe(true);
    expect(adviseRed5Captain({ ...followOnView, profile: "CONSERVATIVE" }).enforceFollowOn).toBe(false);
  });

  it("runs a complete repeatable 5-day red-ball match under tactical captaincy and honours undelegated categories", () => {
    const req = structuredClone(red5Template);
    req.setup.seed = "v01-021-red5-tactical-seed";
    const setup = validateRed5MatchSetup(req, worldBytes, worldManifest);
    const first = runTacticalRed5(setup, "BALANCED");
    const second = runTacticalRed5(setup, "BALANCED");
    expect(first.core.phase).toBe("COMPLETE");
    expect(first.lastEventHash).toBe(second.lastEventHash);
    const replayed = replayRed5Events(first.setup, first.events, red5EventChainManifest(first));
    expect(projectRed5Scorecard(replayed)).toEqual(projectRed5Scorecard(first));
    expect(() => resimulateRed5Commands(first)).not.toThrow();

    let session = createRed5Session(setup);
    session = executeRed5Command(session, {
      commandId: "init-confirm",
      expectedRevision: 0,
      actorId: "SYSTEM",
      kind: "CONFIRM_TEAMS",
      payload: {},
    }).session;
    const caller = session.setup.teams[0]!.teamId;
    expect(proposeOpponentRed5Command(session, caller, "AGGRESSIVE", ["BOWLER", "DECLARATION"])).toBeNull();
    expect(proposeOpponentRed5Command(session, caller, "AGGRESSIVE", ["TOSS"])?.kind).toBe("CALL_TOSS");
  }, 30_000);

  it("surfaces deterministic red-ball clock, delaySecondsToday, pitch wear and AI command execution in controllers", () => {
    const redCtrl = createRed5MatchController(worldBytes, worldManifest, () => "red5-ctrl-weather-seed");
    const catalog = redCtrl.currentResponse("ui-0").catalog!;
    const started = redCtrl.handle({
      version: "LC_T20_UI_V2",
      type: "START",
      requestId: "ui-1",
      expectedRevision: 0,
      format: "RED_BALL",
      selections: [catalog.teams[0]!.suggested, catalog.teams[1]!.suggested],
      groundId: catalog.grounds[0]!.id,
    });
    expect(started.error).toBeNull();
    expect(started.view?.redBall?.clockPhase).toBe("PLAY");
    expect(started.view?.redBall?.delaySecondsToday).toBe(0);

    // AI origin command is accepted on Red-ball controller
    const tossAi = redCtrl.handle({
      version: "LC_T20_UI_V2",
      type: "COMMAND",
      origin: "AI",
      requestId: "ui-2",
      expectedRevision: started.revision,
      command: {
        commandId: "ui-2",
        expectedRevision: started.revision,
        actorId: `AI:${catalog.teams[0]!.id}`,
        kind: "CALL_TOSS",
        payload: { teamId: catalog.teams[0]!.id, call: "HEADS" },
      },
    });
    expect(tossAi.error).toBeNull();
    const tossWinnerId = tossAi.view!.decisionTeamId!;
    const inningsStarted = redCtrl.handle({
      version: "LC_T20_UI_V2",
      type: "COMMAND",
      origin: "AI",
      requestId: "ui-3",
      expectedRevision: tossAi.revision,
      command: {
        commandId: "ui-3",
        expectedRevision: tossAi.revision,
        actorId: `AI:${tossWinnerId}`,
        kind: "CHOOSE_INNINGS",
        payload: { teamId: tossWinnerId, choice: "BAT" },
      },
    });
    expect(inningsStarted.error).toBeNull();

    // Deterministic weather interruption updates clock and commentary cleanly
    const delayed = redCtrl.handle({
      version: "LC_T20_UI_V2",
      type: "COMMAND",
      origin: "HUMAN",
      requestId: "ui-4",
      expectedRevision: inningsStarted.revision,
      command: {
        commandId: "ui-4",
        expectedRevision: inningsStarted.revision,
        actorId: "SYSTEM",
        kind: "ADD_RAIN_DELAY",
        payload: { seconds: 3600 },
      },
    });
    expect(delayed.error).toBeNull();
    expect(delayed.view?.redBall?.delaySecondsToday).toBe(3600);
    expect(delayed.view?.commentary.at(-1)?.text).toContain("60 minutes");

    // AI origin command is also accepted on ODI controller
    const odiCtrl = createODIMatchController(worldBytes, worldManifest, () => "odi-ctrl-ai-seed");
    const odiStart = odiCtrl.handle({
      version: "LC_T20_UI_V2",
      type: "START",
      requestId: "ui-10",
      expectedRevision: 0,
      format: "ODI",
      selections: [catalog.teams[0]!.suggested, catalog.teams[1]!.suggested],
      groundId: catalog.grounds[0]!.id,
    });
    const odiTossAi = odiCtrl.handle({
      version: "LC_T20_UI_V2",
      type: "COMMAND",
      origin: "AI",
      requestId: "ui-11",
      expectedRevision: odiStart.revision,
      command: {
        commandId: "ui-11",
        expectedRevision: odiStart.revision,
        actorId: `AI:${catalog.teams[0]!.id}`,
        kind: "CALL_TOSS",
        payload: { teamId: catalog.teams[0]!.id, call: "HEADS" },
      },
    });
    expect(odiTossAi.error).toBeNull();
  });
});
