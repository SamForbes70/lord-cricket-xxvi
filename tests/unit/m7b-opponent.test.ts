import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateT20MatchSetup, createT20Session, executeT20Command, fixtureAutopilotStep,
  rehydrateT20Session, resimulateT20Commands, projectT20Scorecard,
} from "@lcxxvi/simulation";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";

const world = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));

function fixture() {
  const request = structuredClone(template);
  request.setup.seed = "m7b-opponent-fixture-seed";
  const setup = validateT20MatchSetup(request,world,manifest);
  return createT20Session(setup);
}

describe("M7B optional opponent through authoritative T20 engine", () => {
  test("delegation permits only selected decision categories", () => {
    let session = fixture();
    const categories = { CALL_TOSS: "TOSS", CHOOSE_INNINGS: "INNINGS", SET_BATTER: "BATTER", SET_BOWLER: "BOWLER", SET_BATTING_PLAN: "BATTING_PLAN", SET_BOWLING_PLAN: "BOWLING_PLAN" } as const;
    const observed = new Set<string>();
    while (session.core.phase !== "COMPLETE") {
      if (session.revision >= 900) throw new Error("M7B_MATCH_STALLED");
      for (const team of session.setup.teams) {
        const proposed = proposeOpponentT20Command(session, team.teamId);
        expect(proposeOpponentT20Command(session, team.teamId, [])).toBeNull();
        if (proposed) {
          const category = categories[proposed.kind as keyof typeof categories];
          expect(category).toBeDefined();
          expect(proposeOpponentT20Command(session, team.teamId, [category!])).toEqual(proposed);
          observed.add(category!);
        }
      }
      session = executeT20Command(session, fixtureAutopilotStep(session)).session;
    }
    expect(observed.has("BOWLER")).toBe(true);
    expect(observed.has("BATTER")).toBe(true);
  }, 120000);
  test("opponent never commands the human team or advances a ball automatically", () => {
    let session=fixture();
    const aiId = session.setup.teams[1]!.teamId;
    expect(() => proposeOpponentT20Command(session, "INVALID")).toThrow(/UNKNOWN_TEAM/);
    session=executeT20Command(session,fixtureAutopilotStep(session)).session;
    expect(proposeOpponentT20Command(session,aiId)).toBeNull(); // human team controls toss
    session=executeT20Command(session,fixtureAutopilotStep(session)).session;
    let aiCommands=0;
    while(session.core.phase!=="COMPLETE") {
      if(session.revision>=900) throw new Error("M7B_MATCH_STALLED");
      const ai = proposeOpponentT20Command(session,aiId);
      const command=ai ?? fixtureAutopilotStep(session);
      if(ai) {
        expect(command.actorId).toBe(`AI:${aiId}`);
        expect(command.kind).not.toBe("ADVANCE");
        aiCommands++;
      }
      session=executeT20Command(session,command).session;
    }
    expect(aiCommands).toBeGreaterThan(0);
    expect(session.core.phase).toBe("COMPLETE");
    expect(session.commands.some(c=>c.actorId===`AI:${aiId}` && c.kind==="SET_BOWLING_PLAN")).toBe(true);
    expect(session.commands.some(c=>c.actorId===`AI:${aiId}` && c.kind==="SET_BOWLER")).toBe(true);
    const originalHash=session.lastEventHash;
    const rehydrated=rehydrateT20Session(session,world,manifest);
    expect(rehydrated.lastEventHash).toBe(originalHash);
    expect(projectT20Scorecard(rehydrated)).toEqual(projectT20Scorecard(session));
    resimulateT20Commands(rehydrated);
  }, 120000);

  test("same seed and choices produce bit-identical event chains", () => {
    const run = () => {
      let s = fixture();
      const aiTeam=s.setup.teams[1]!.teamId;
      while(s.core.phase!=="COMPLETE") {
        if(s.revision>900) throw new Error("M7B_MATCH_STALLED");
        s = executeT20Command(s, proposeOpponentT20Command(s,aiTeam) ?? fixtureAutopilotStep(s)).session;
      }
      return s.lastEventHash;
    };
    expect(run()).toBe(run());
  }, 120000);
});
