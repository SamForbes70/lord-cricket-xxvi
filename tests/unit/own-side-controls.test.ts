import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  fixtureAutopilotStep, projectT20Scorecard, rehydrateT20Session, resimulateT20Commands, type T20Session,
} from "@lcxxvi/simulation";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";
import { UI_VERSION, type Action } from "../../apps/web/src/match/protocol.js";
import {
  mayIssuePlanCommand, ownSideControls, personControlsSide, planCommandSide,
} from "../../apps/web/src/match/side-control.js";

const world = new Uint8Array(readFileSync("packages/data/worlds/fictional-eight-01.json"));
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));

const innings = { battingTeamId: "team-01", bowlingTeamId: "team-02" };
const battingPlan: Action = { kind: "SET_BATTING_PLAN", payload: { playerId: "p-1", aggression: 4, intent: "NORMAL" } } as Action;
const bowlingPlan: Action = { kind: "SET_BOWLING_PLAN", payload: { bowlerId: "p-2", line: "OFF", length: "GOOD", effort: "NORMAL", variationId: "stock" } } as Action;
const field: Action = { kind: "SET_FIELD", payload: { teamId: "team-02", fieldSlots: [] } } as Action;
const advance: Action = { kind: "ADVANCE", payload: { scope: "DELIVERY" } } as Action;

describe("own-side controls: the person sets plans only for the side they manage", () => {
  test("with a computer captain, plan and field commands for its side are refused at the input layer", () => {
    // The computer captain runs the batting side: the person may not set its batters' aggression.
    expect(personControlsSide("team-01", "team-01")).toBe(false);
    expect(ownSideControls(innings, "team-01")).toEqual({ batting: false, bowling: true });
    expect(mayIssuePlanCommand(battingPlan, innings, "team-01")).toBe(false);
    expect(mayIssuePlanCommand(bowlingPlan, innings, "team-01")).toBe(true);
    expect(mayIssuePlanCommand(field, innings, "team-01")).toBe(true);
    // The computer captain runs the fielding side: the person may not set its bowling plan or field.
    expect(ownSideControls(innings, "team-02")).toEqual({ batting: true, bowling: false });
    expect(mayIssuePlanCommand(battingPlan, innings, "team-02")).toBe(true);
    expect(mayIssuePlanCommand(bowlingPlan, innings, "team-02")).toBe(false);
    expect(mayIssuePlanCommand(field, innings, "team-02")).toBe(false);
    // Every other command is unaffected.
    expect(mayIssuePlanCommand(advance, innings, "team-01")).toBe(true);
    expect(mayIssuePlanCommand(advance, innings, "team-02")).toBe(true);
  });

  test("a field command names its own side; plan commands take the innings' batting or bowling side", () => {
    expect(planCommandSide(battingPlan, innings)).toBe("team-01");
    expect(planCommandSide(bowlingPlan, innings)).toBe("team-02");
    expect(planCommandSide({ ...field, payload: { teamId: "team-01", fieldSlots: [] } } as Action, innings)).toBe("team-01");
  });

  test("with no computer side (manual control of both teams) every control stays enabled", () => {
    expect(ownSideControls(innings, null)).toEqual({ batting: true, bowling: true });
    for (const action of [battingPlan, bowlingPlan, field, advance]) expect(mayIssuePlanCommand(action, innings, null)).toBe(true);
    // A stale computer-side id that names neither side leaves both sides with the person.
    expect(ownSideControls(innings, "team-99")).toEqual({ batting: true, bowling: true });
  });
});

describe("own-side controls: saved matches with an opposition plan command from the person still reproduce", () => {
  test("the controller accepts the command and a restore rehydrates the match identically", () => {
    const c = createMatchController(world, manifest, () => "own-side-controls-seed");
    let serial = 0;
    const boot = c.handle({ version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "BOOT" });
    const teams = boot.catalog!.teams;
    let response = c.handle({
      version: UI_VERSION, requestId: `ui-${++serial}`, expectedRevision: 0, type: "START", format: "T20",
      selections: [teams[0]!.suggested, teams[1]!.suggested], groundId: boot.catalog!.grounds[0]!.id,
    });
    expect(response.error).toBeNull();
    const human = teams[0]!.id;
    const computer = teams[1]!.id;
    let oppositionPlans = 0;
    for (let step = 0; step < 2_000; step += 1) {
      const session = c.snapshot() as T20Session;
      if (session.core.phase === "COMPLETE") break;
      const active = session.core.innings[session.core.activeInningsIndex]?.innings;
      const requestId = `ui-${++serial}`;
      const base = { commandId: requestId, expectedRevision: response.revision };
      // Before this change the match screen let the person set the computer side's batting plan. Send exactly that
      // command, as a person (USER actor), a few times while the computer side bats, as an older save would hold it.
      if (session.core.phase === "READY" && active?.battingTeamId === computer && oppositionPlans < 3 && step % 7 === 0) {
        const striker = active.strikerEnd === "NORTH" ? active.northBatterId : active.southBatterId;
        const action = { kind: "SET_BATTING_PLAN", payload: { playerId: striker!, aggression: 4 - oppositionPlans, intent: "NORMAL" } } as Action;
        expect(mayIssuePlanCommand(action, active, computer)).toBe(false); // the screen would no longer send it
        response = c.handle({ version: UI_VERSION, requestId, expectedRevision: response.revision, type: "COMMAND", origin: "HUMAN",
          command: { ...action, ...base, actorId: `USER:${computer}` } });
        expect(response.error).toBeNull(); // but the controller and engine still accept it
        oppositionPlans += 1;
        continue;
      }
      const ai = proposeOpponentT20Command(session, computer);
      const next = ai ?? fixtureAutopilotStep(session);
      const actor = next.kind === "ADVANCE" ? "SYSTEM" : next.actorId.replace(/^AI:/, `USER:`);
      const origin = ai ? "AI" : "HUMAN";
      response = c.handle({ version: UI_VERSION, requestId, expectedRevision: response.revision, type: "COMMAND", origin,
        command: { ...next, ...base, actorId: origin === "AI" ? next.actorId : actor } });
      expect(response.error).toBeNull();
    }
    const finished = c.snapshot() as T20Session;
    expect(finished.core.phase).toBe("COMPLETE");
    expect(oppositionPlans).toBe(3);
    const stored = finished.commands.filter((cmd) => cmd.kind === "SET_BATTING_PLAN" && cmd.actorId === `USER:${computer}`);
    expect(stored).toHaveLength(3);
    expect(finished.commands.some((cmd) => cmd.actorId === `USER:${human}`)).toBe(true);

    // Rehydrate the saved match as the worker does on recovery and as a replay does: identical events and result.
    const saved = JSON.parse(JSON.stringify(finished));
    const rehydrated = rehydrateT20Session(saved, world, manifest);
    expect(rehydrated.lastEventHash).toBe(finished.lastEventHash);
    expect(JSON.stringify(rehydrated.events)).toBe(JSON.stringify(finished.events));
    expect(projectT20Scorecard(rehydrated)).toEqual(projectT20Scorecard(finished));
    resimulateT20Commands(rehydrated);

    const restored = createMatchController(world, manifest, () => "not-used");
    restored.restore(saved);
    expect(restored.currentResponse("ui-restore").view?.lastEventHash).toBe(finished.lastEventHash);
    expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(finished));
  }, 120_000);
});
