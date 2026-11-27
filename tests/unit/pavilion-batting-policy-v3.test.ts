import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createT20Session, executeT20Command, fixtureAutopilotStep, rehydrateT20Session, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import {
  adviseT20BattingV2,
  adviseT20BattingV3,
  adviseT20Captain,
  adviseT20CaptainV5,
  battingSkill,
  TAIL_BELOW,
  T20_BATTING_POLICY_V3_ID,
  T20_TACTICAL_CAPTAIN_ID,
  T20_TACTICAL_CAPTAIN_V5_ID,
  type BatterSkills,
  type T20TacticalPublicView,
} from "@lcxxvi/ai";
import { runTacticalT20, tacticalT20Step } from "../../apps/batch/src/tactical-match.js";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";

const specialist = { timing: 70, power: 65, defence: 60, rotation: 65 };
const allRounder = { timing: 52, power: 50, defence: 48, rotation: 50 };
const tailender = { timing: 35, power: 40, defence: 30, rotation: 30 };
const base = { inningsLegalBalls: 96, inningsRuns: 120, wicketsLost: 6, targetToWin: null, striker: tailender, partner: specialist };

describe("LC_T20_BATTING_POLICY_V3: a tail-ender at the death gives the strike to the recognised batter", () => {
  test("the fixtures are a specialist, an all-rounder above the tail line, and a tail-ender", () => {
    expect(battingSkill(specialist)).toBeGreaterThanOrEqual(TAIL_BELOW);
    expect(battingSkill(allRounder)).toBeGreaterThanOrEqual(TAIL_BELOW);
    expect(battingSkill(tailender)).toBeLessThan(TAIL_BELOW);
  });

  test("is a new policy version, deterministic", () => {
    const advice = adviseT20BattingV3(base);
    expect(advice.policyId).toBe(T20_BATTING_POLICY_V3_ID);
    expect(T20_BATTING_POLICY_V3_ID).toBe("LC_T20_BATTING_POLICY_V3");
    expect(advice).toEqual(adviseT20BattingV3(structuredClone(base)));
  });

  test("tail-ender with a recognised batter at the other end: 2 and ROTATE until the last over", () => {
    for (const balls of [90, 96, 102, 108, 113]) {
      const v3 = adviseT20BattingV3({ ...base, inningsLegalBalls: balls });
      expect(v3).toMatchObject({ aggression: 2, intent: "ROTATE" });
      expect(v3.reason).toContain("gives the strike to the recognised batter");
    }
    // V2 attacked at 3 in overs 16 to 18 and at 4 in over 19.
    expect(adviseT20BattingV2({ ...base, inningsLegalBalls: 96 }).aggression).toBe(3);
    expect(adviseT20BattingV2({ ...base, inningsLegalBalls: 108 }).aggression).toBe(4);
    // An all-rounder above the tail line counts as recognised.
    expect(adviseT20BattingV3({ ...base, partner: allRounder })).toMatchObject({ aggression: 2, intent: "ROTATE" });
    // An unknown partner counts as recognised, as in V1.
    expect(adviseT20BattingV3({ ...base, partner: null })).toMatchObject({ aggression: 2, intent: "ROTATE" });
  });

  test("two tail-enders: 3 at most until the last over", () => {
    const tails = { ...base, partner: tailender, wicketsLost: 8 };
    expect(adviseT20BattingV2({ ...tails, inningsLegalBalls: 108 }).aggression).toBe(4);
    expect(adviseT20BattingV3({ ...tails, inningsLegalBalls: 108 }).aggression).toBe(3);
    expect(adviseT20BattingV3({ ...tails, inningsLegalBalls: 96 }).aggression).toBe(3);
    // With four or more wickets in hand V1 and V2 sent two tail-enders in at 4.
    expect(adviseT20BattingV2({ ...tails, wicketsLost: 4 }).aggression).toBe(4);
    expect(adviseT20BattingV3({ ...tails, wicketsLost: 4 }).aggression).toBe(3);
  });

  test("the last over: everyone swings, as in V2", () => {
    for (const balls of [114, 117, 119])
      for (const partner of [specialist, tailender, null])
        expect(adviseT20BattingV3({ ...base, inningsLegalBalls: balls, partner })).toEqual({ ...adviseT20BattingV2({ ...base, inningsLegalBalls: balls, partner }), policyId: T20_BATTING_POLICY_V3_ID });
  });

  test("V2 everywhere else: recognised strikers, chases, the powerplay and middle overs; never more aggressive than V2", () => {
    const batters: (BatterSkills | null)[] = [specialist, allRounder, tailender, null];
    let changed = 0;
    for (let balls = 0; balls < 120; balls += 1)
      for (const wickets of [0, 3, 5, 7, 9])
        for (const target of [null, 140, 190, 240])
          for (const striker of batters)
            for (const partner of batters) {
              const view = { inningsLegalBalls: balls, inningsRuns: Math.round(balls * 1.3), wicketsLost: wickets, targetToWin: target, striker, partner };
              const v2 = adviseT20BattingV2(view), v3 = adviseT20BattingV3(view);
              expect(v3.aggression).toBeGreaterThanOrEqual(1);
              expect(v3.aggression).toBeLessThanOrEqual(v2.aggression);
              const applies = target === null && balls >= 90 && balls < 114 && striker !== null && battingSkill(striker) < TAIL_BELOW;
              if (!applies) expect([v3.aggression, v3.intent, v3.reason]).toEqual([v2.aggression, v2.intent, v2.reason]);
              else if (v3.aggression !== v2.aggression || v3.intent !== v2.intent) changed += 1;
            }
    expect(changed).toBeGreaterThan(100);
  });

  test("rejects malformed input, as V1 and V2", () => {
    expect(() => adviseT20BattingV3({ ...base, inningsRuns: Number.NaN })).toThrow(/INVALID/);
    expect(() => adviseT20BattingV3({ ...base, inningsLegalBalls: 121 })).toThrow(/INVALID/);
  });
});

const bowler = (playerId: string, level: number, oversLeft = 4, fatigueBp = 0) => ({
  playerId, control: level, movement: level, variation: level, stamina: level, fatigueBp, legalBallsBowled: 24 - 6 * oversLeft, quotaRemaining: 6 * oversLeft,
});
function views(): T20TacticalPublicView[] {
  const out: T20TacticalPublicView[] = [];
  for (const balls of [0, 35, 60, 89, 90, 96, 101, 108, 113, 114, 119])
    for (const wickets of [0, 4, 7, 9])
      for (const target of [null, 170])
        for (const [striker, partner] of [[specialist, specialist], [tailender, specialist], [tailender, tailender], [null, null]] as const)
          for (const style of ["PACE", "SPIN", null] as const) {
            const left = Math.ceil((120 - balls) / 6);
            const bowlers = [bowler("a", 80, Math.min(4, Math.ceil(left / 3)), 500), bowler("b", 70, Math.min(4, Math.ceil(left / 3))), bowler("c", 60, 4, 7500), bowler("d", 50, 4)];
            out.push({
              inningsLegalBalls: balls, inningsRuns: Math.round(balls * 1.3), wicketsLost: wickets, targetToWin: target,
              availableBatters: 10 - wickets, bowlingCandidates: bowlers.slice(1), striker, partner, bowlerStyle: style,
              previousOverBowler: { playerId: "a", quotaRemaining: bowlers[0]!.quotaRemaining, control: 80, movement: 80, variation: 80, stamina: 80 },
            });
          }
  return out;
}

describe("Captain V6: V5 with LC_T20_BATTING_POLICY_V3", () => {
  test("is a new captain version; V5 is kept under its own id", () => {
    expect(T20_TACTICAL_CAPTAIN_ID).toBe("LC_T20_TACTICAL_CAPTAIN_V6");
    expect(T20_TACTICAL_CAPTAIN_V5_ID).toBe("LC_T20_TACTICAL_CAPTAIN_V5");
    const v = views()[0]!;
    expect(adviseT20Captain(v).policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V6");
    expect(adviseT20CaptainV5(v).policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V5");
  });

  test("bowler, bowling plan and field are V5's; batting is V3's", () => {
    let differ = 0;
    for (const v of views()) {
      const v5 = adviseT20CaptainV5(v), v6 = adviseT20Captain(v);
      const v3 = adviseT20BattingV3({ inningsLegalBalls: v.inningsLegalBalls, inningsRuns: v.inningsRuns, wicketsLost: v.wicketsLost, targetToWin: v.targetToWin, striker: v.striker ?? null, partner: v.partner ?? null });
      expect({ ...v6, policyId: v5.policyId, aggression: v5.aggression, battingIntent: v5.battingIntent }).toEqual(v5);
      expect([v6.aggression, v6.battingIntent]).toEqual([v3.aggression, v3.intent]);
      if (v6.aggression !== v5.aggression || v6.battingIntent !== v5.battingIntent) differ += 1;
    }
    expect(differ).toBeGreaterThan(20);
  });
});

describe("Captain V6: the live game and replay compatibility", () => {
  const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
  const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
  const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
  const setup = (seed: string) => { const r = structuredClone(template); r.setup.seed = seed; return validateT20MatchSetup(r, worldBytes, manifest); };
  const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

  test("a match played under V5 replays from its saved commands, identically, with the V6 code", () => {
    let differs = 0;
    for (const seed of ["v6-compat-1", "v6-compat-2", "v6-compat-3"]) {
      const v5 = runTacticalT20(setup(seed), 1500, { advise: adviseT20CaptainV5 });
      const saved = JSON.parse(JSON.stringify(v5));
      const rebuilt = rehydrateT20Session(saved, worldBytes, manifest);
      expect(rebuilt.lastEventHash).toBe(v5.lastEventHash);
      expect(sha(rebuilt.events)).toBe(sha(v5.events));
      if (runTacticalT20(setup(seed)).lastEventHash !== v5.lastEventHash) differs += 1;
    }
    // The same set-ups played live under V6 make different choices; the saved matches are unaffected by them.
    expect(differs).toBeGreaterThan(0);
  }, 180_000);

  test("a V5 match saved in the first innings's death overs resumes and finishes under V6 without changing what was recorded", () => {
    let part = createT20Session(setup("v6-compat-4"));
    while (part.core.activeInningsIndex === 0 && (part.core.innings[0]?.innings.legalBalls ?? 0) < 92) {
      part = executeT20Command(part, runStep(part)).session;
    }
    const saved = JSON.parse(JSON.stringify(part));
    const resumed = rehydrateT20Session(saved, worldBytes, manifest);
    expect(resumed.lastEventHash).toBe(part.lastEventHash);
    let finished: T20Session = resumed;
    for (let n = 0; finished.core.phase !== "COMPLETE"; n += 1) {
      if (n > 3000) throw new Error("NO_PROGRESS");
      finished = executeT20Command(finished, nextV6(finished)).session;
    }
    expect(sha(finished.commands.slice(0, saved.commands.length))).toBe(sha(saved.commands));
  }, 180_000);

  test("the live game's computer opponent uses V6: a tail-ender in the first innings's death overs is sent in at 2 to rotate", () => {
    const plans: { aggression: number; intent: string }[] = [];
    for (const seed of ["v6-live-1", "v6-live-2", "v6-live-3", "v6-live-4"]) {
      let session = createT20Session(setup(seed));
      while (session.core.phase !== "COMPLETE") {
        if (session.revision >= 1500) throw new Error("OPPONENT_STALLED");
        const proposed = session.setup.teams.map((t) => proposeOpponentT20Command(session, t.teamId)).find((c) => c !== null);
        // The person advances one ball at a time, as the live game's passages do.
        const auto = fixtureAutopilotStep(session);
        const command = proposed ?? (auto.kind === "ADVANCE" ? { ...auto, payload: { scope: "DELIVERY" as const } } : auto);
        const balls = session.core.innings[session.core.activeInningsIndex]?.innings.legalBalls ?? 0;
        if (command.kind === "SET_BATTING_PLAN" && session.core.activeInningsIndex === 0 && balls >= 90 && balls < 114)
          plans.push(command.payload as { aggression: number; intent: string });
        session = executeT20Command(session, command).session;
      }
    }
    // V5 never set a first-innings death plan below 3; V6 does for a tail-ender with a recognised batter at the other end.
    expect(plans.some((p) => p.aggression === 2 && p.intent === "ROTATE")).toBe(true);
  }, 180_000);
});

// The batch step's choices, by captain, one command at a time (tacticalT20Step with the given captain).
const runStep = (s: T20Session) => tacticalT20Step(s, { advise: adviseT20CaptainV5 });
const nextV6 = (s: T20Session) => tacticalT20Step(s);
