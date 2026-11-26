import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createT20Session, executeT20Command, fixtureAutopilotStep, rehydrateT20Session, validateT20MatchSetup, type T20Session } from "@lcxxvi/simulation";
import {
  adviseT20Batting,
  adviseT20BattingV2,
  adviseT20Captain,
  adviseT20CaptainV4,
  T20_BATTING_POLICY_V2_ID,
  t20BowlerStyleOf,
  t20BowlerSkill,
  t20DeathSuitabilityV5,
  canCompleteBowling,
  T20_DEATH_PACE_PREFERENCE_PERCENT,
  t20DeathBowlingPlanV5,
  T20_TACTICAL_CAPTAIN_ID,
  T20_TACTICAL_CAPTAIN_V4_ID,
  type T20TacticalPublicView,
} from "@lcxxvi/ai";
import { runTacticalT20, tacticalT20Step } from "../../apps/batch/src/tactical-match.js";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";

const specialist = { timing: 70, power: 70, defence: 70, rotation: 70 };
const tailender = { timing: 30, power: 35, defence: 30, rotation: 30 };
const bowler = (playerId: string, level: number, oversLeft = 4, fatigueBp = 0) => ({
  playerId, control: level, movement: level, variation: level, stamina: level, fatigueBp, legalBallsBowled: 24 - 6 * oversLeft, quotaRemaining: 6 * oversLeft,
});

/** A grid of public views across the innings: balls, wickets, chase or not, batters, bowlers' overs and fatigue. */
function views(): T20TacticalPublicView[] {
  const out: T20TacticalPublicView[] = [];
  for (const balls of [0, 17, 35, 36, 60, 89, 90, 95, 101, 108, 113, 119])
    for (const wickets of [0, 3, 6, 8])
      for (const target of [null, 150, 210])
        for (const [striker, partner] of [[specialist, specialist], [tailender, specialist], [tailender, tailender], [null, null]] as const)
          for (const style of ["PACE", "SPIN", null] as const) {
            const left = Math.ceil((120 - balls) / 6);
            const bowlers = [bowler("a", 80, Math.min(4, Math.ceil(left / 3)), 500), bowler("b", 70, Math.min(4, Math.ceil(left / 3))), bowler("c", 60, 4, 7500), bowler("d", 50, 4), bowler("e", 40, 4)];
            out.push({
              inningsLegalBalls: balls, inningsRuns: Math.round(balls * 1.3), wicketsLost: wickets, targetToWin: target,
              availableBatters: 10 - wickets, bowlingCandidates: bowlers.slice(1), striker, partner, bowlerStyle: style,
              previousOverBowler: { playerId: "a", quotaRemaining: bowlers[0]!.quotaRemaining, control: 80, movement: 80, variation: 80, stamina: 80 },
            });
          }
  return out;
}

describe("Captain V5: a varied death-overs bowling plan", () => {
  test("is a new captain version; V4 is kept under its own id", () => {
    expect(T20_TACTICAL_CAPTAIN_ID).toBe("LC_T20_TACTICAL_CAPTAIN_V5");
    expect(T20_TACTICAL_CAPTAIN_V4_ID).toBe("LC_T20_TACTICAL_CAPTAIN_V4");
    const v = views()[0]!;
    expect(adviseT20Captain(v).policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V5");
    expect(adviseT20CaptainV4(v).policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V4");
  });

  // These views carry no bowler styles, so V5's pace preference does not apply and the choice is V4's.
  test("without bowler styles keeps V4's bowler choice; keeps V4's field everywhere and V4's plan before the death", () => {
    let death = 0;
    for (const v of views()) {
      const [v4, v5] = [adviseT20CaptainV4(v), adviseT20Captain(v)];
      expect(v5.preferredBowlerId).toBe(v4.preferredBowlerId);
      expect(v5.fieldIntent).toBe(v4.fieldIntent);
      if (v.inningsLegalBalls < 90) expect([v5.bowlingLength, v5.bowlingEffort]).toEqual([v4.bowlingLength, v4.bowlingEffort]);
      else death += 1;
    }
    expect(death).toBeGreaterThan(500);
  });

  test("is deterministic and reads only the public view", () => {
    for (const v of views().filter((_, n) => n % 7 === 0)) {
      const frozen = structuredClone(v);
      expect(adviseT20Captain(v)).toEqual(adviseT20Captain(structuredClone(v)));
      expect(v).toEqual(frozen);
    }
    expect(() => adviseT20Captain({ ...views()[0]!, inningsRuns: Number.NaN })).toThrow(/INVALID/);
    expect(() => t20DeathBowlingPlanV5({ ballOfOver: 6, style: "PACE", strikerIsTail: false, fatigueBp: 0 })).toThrow(/INVALID/);
  });

  test("plan mix bounds: every pace over mixes lengths and pace; no ball is the same as V4's yorker at full effort every time", () => {
    const over = (style: "PACE" | "SPIN", strikerIsTail: boolean, fatigueBp = 0) =>
      [0, 1, 2, 3, 4, 5].map((ballOfOver) => t20DeathBowlingPlanV5({ ballOfOver, style, strikerIsTail, fatigueBp }));
    const count = (plans: ReturnType<typeof over>, f: (p: ReturnType<typeof over>[number]) => boolean) => plans.filter(f).length;
    for (const tail of [false, true]) {
      const pace = over("PACE", tail);
      // Yorkers: two in six to a batter, three to a tail-ender; never more than half the over.
      expect(count(pace, (p) => p.length === "YORKER")).toBe(tail ? 3 : 2);
      // At most one bouncer an over (the T20 playing condition), and at least one.
      expect(count(pace, (p) => p.length === "SHORT")).toBe(1);
      // Slower balls (conserved effort): two in six. At least three different lengths.
      expect(count(pace, (p) => p.effort === "CONSERVE")).toBe(2);
      expect(new Set(pace.map((p) => p.length)).size).toBeGreaterThanOrEqual(3);
      expect(count(pace, (p) => p.length === "YORKER" && p.effort === "MAXIMUM")).toBeLessThanOrEqual(2);
    }
    // A spinner bowls no bouncer and no yorker, and varies the pace.
    const spin = over("SPIN", false);
    expect(count(spin, (p) => p.length === "SHORT" || p.length === "YORKER")).toBe(0);
    expect(new Set(spin.map((p) => p.effort)).size).toBe(3);
    // A tired bowler conserves on every ball, keeping the length plan.
    expect(over("PACE", false, 7000).every((p) => p.effort === "CONSERVE")).toBe(true);
    expect(over("PACE", false, 7000).map((p) => p.length)).toEqual(over("PACE", false).map((p) => p.length));
  });

  test("the captain uses the death plan for the ball of the over, the bowler's style and the striker", () => {
    const base = views().find((v) => v.inningsLegalBalls === 90 && v.wicketsLost === 0 && v.targetToWin === null && v.striker === specialist && v.bowlerStyle === "PACE")!;
    const plans = [0, 1, 2, 3, 4, 5].map((k) => adviseT20Captain({ ...base, inningsLegalBalls: 96 + k }));
    expect(plans.map((p) => p.bowlingLength)).toEqual(["YORKER", "GOOD", "YORKER", "SHORT", "FULL", "GOOD"]);
    expect(adviseT20Captain({ ...base, inningsLegalBalls: 101, striker: tailender }).bowlingLength).toBe("YORKER");
    expect(adviseT20Captain({ ...base, inningsLegalBalls: 99, bowlerStyle: "SPIN" }).bowlingLength).toBe("FULL");
    // Unknown style is treated as pace.
    expect(adviseT20Captain({ ...base, inningsLegalBalls: 99, bowlerStyle: null }).bowlingLength).toBe("SHORT");
    expect(t20BowlerStyleOf("FAST")).toBe("PACE");
    expect(t20BowlerStyleOf("MEDIUM")).toBe("PACE");
    expect(t20BowlerStyleOf("LEG_SPIN")).toBe("SPIN");
    expect(t20BowlerStyleOf(null)).toBeNull();
  });
});

describe("Captain V5: pace preferred for the death overs", () => {
  type B = { id: string; level: number; oversLeft: number; style: "PACE" | "SPIN" };
  const sk = (level: number) => ({ control: level, movement: level, variation: level, stamina: level });
  const styledView = (bowlers: readonly B[], oversRemaining: number, previous: string | null): T20TacticalPublicView => ({
    inningsLegalBalls: 120 - 6 * oversRemaining, inningsRuns: 0, wicketsLost: 0, targetToWin: null, availableBatters: 10,
    bowlingCandidates: bowlers.filter((b) => b.id !== previous && b.oversLeft > 0)
      .map((b) => ({ playerId: b.id, ...sk(b.level), fatigueBp: 0, legalBallsBowled: 24 - 6 * b.oversLeft, quotaRemaining: 6 * b.oversLeft, style: b.style })),
    previousOverBowler: (() => { const b = bowlers.find((x) => x.id === previous); return b ? { playerId: b.id, quotaRemaining: 6 * b.oversLeft, ...sk(b.level), style: b.style } : null; })(),
  });
  const playOut = (start: readonly B[], overs: number, advise = adviseT20Captain): string[] => {
    const bowlers = start.map((b) => ({ ...b }));
    const order: string[] = [];
    let prev: string | null = null;
    for (let left = overs; left > 0; left -= 1) {
      const choice: string | null = advise(styledView(bowlers, left, prev)).preferredBowlerId;
      const chosen: B | undefined = bowlers.find((b) => b.id === choice);
      if (!chosen || chosen.id === prev || chosen.oversLeft < 1) throw new Error(`ILLEGAL ${choice}`);
      chosen.oversLeft -= 1; order.push(chosen.id); prev = chosen.id;
    }
    return order;
  };

  test("a pace bowler's death standing is 10% above their skill; spin and unknown are unchanged", () => {
    expect(T20_DEATH_PACE_PREFERENCE_PERCENT).toBe(10);
    expect(t20DeathSuitabilityV5({ ...sk(60), style: "PACE" })).toBeCloseTo(t20BowlerSkill(sk(60)) * 1.1);
    expect(t20DeathSuitabilityV5({ ...sk(60), style: "SPIN" })).toBe(t20BowlerSkill(sk(60)));
    expect(t20DeathSuitabilityV5(sk(60))).toBe(t20BowlerSkill(sk(60)));
  });

  test("in the death a capable pace bowler bowls ahead of a slightly better spinner, not ahead of a clearly better one", () => {
    const close = [{ id: "s", level: 72, oversLeft: 2, style: "SPIN" }, { id: "p", level: 68, oversLeft: 2, style: "PACE" }] as const;
    expect(adviseT20Captain(styledView(close, 4, null)).preferredBowlerId).toBe("p");
    expect(adviseT20CaptainV4(styledView(close, 4, null)).preferredBowlerId).toBe("s");
    const clear = [{ id: "s", level: 80, oversLeft: 2, style: "SPIN" }, { id: "p", level: 68, oversLeft: 2, style: "PACE" }] as const;
    expect(adviseT20Captain(styledView(clear, 4, null)).preferredBowlerId).toBe("s");
  });

  test("full innings: pace keeps the death overs when skills are close, and every bowlable state is still bowled out", () => {
    const six: B[] = [
      { id: "s1", level: 75, oversLeft: 4, style: "SPIN" }, { id: "s2", level: 73, oversLeft: 4, style: "SPIN" }, { id: "s3", level: 71, oversLeft: 4, style: "SPIN" },
      { id: "p1", level: 70, oversLeft: 4, style: "PACE" }, { id: "p2", level: 68, oversLeft: 4, style: "PACE" }, { id: "s4", level: 50, oversLeft: 4, style: "SPIN" },
    ];
    const v5 = playOut(six, 20).slice(15), v4 = playOut(six, 20, adviseT20CaptainV4).slice(15);
    // Death standing: p1 70 x 1.1 = 77 ranks first, then s1 (75), then p2 (68 x 1.1 = 74.8): two, two and one reserved
    // overs, so pace bowls three of the last five. V4 (skill alone) reserves them for s1, s2 and s3: no pace.
    expect(v5.filter((id) => id.startsWith("p")).length).toBe(3);
    expect(v4.filter((id) => id.startsWith("p")).length).toBe(0);
    // Never strands: five bowlers, mixed styles, every quota combination, 1 to 10 overs left.
    const levels = [80, 72, 64, 56, 48];
    let checked = 0;
    for (let code = 0; code < 5 ** 5; code += 1) {
      const bowlers: B[] = levels.map((level, n) => ({ id: `b${n}`, level, oversLeft: Math.floor(code / 5 ** n) % 5, style: n % 2 ? "PACE" : "SPIN" }));
      for (let overs = 1; overs <= 10; overs += 1) {
        const left = bowlers.map((b) => ({ playerId: b.id, oversLeft: b.oversLeft }));
        if (!canCompleteBowling(overs, left, null)) continue;
        const choice = adviseT20Captain(styledView(bowlers, overs, null)).preferredBowlerId;
        const after = left.map((b) => (b.playerId === choice ? { ...b, oversLeft: b.oversLeft - 1 } : b));
        expect(canCompleteBowling(overs - 1, after, choice)).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5000);
  }, 60_000);
});

describe("Batting policy V2: the first innings's death overs", () => {
  const base = { inningsRuns: 120, targetToWin: null, striker: specialist, partner: specialist };
  test("differs from V1 only where V1 held a death-overs striker to 2 while setting a total, and then attacks at 3", () => {
    let changed = 0, same = 0;
    for (const balls of [0, 20, 36, 60, 85, 89, 90, 96, 101, 107, 108, 114, 119])
      for (const wickets of [0, 2, 4, 6, 7, 8, 9])
        for (const target of [null, 140, 180, 230])
          for (const [striker, partner] of [[specialist, specialist], [tailender, specialist], [tailender, tailender], [null, null]] as const) {
            const view = { inningsLegalBalls: balls, inningsRuns: balls + 10, wicketsLost: wickets, targetToWin: target, striker, partner };
            const [v1, v2] = [adviseT20Batting(view), adviseT20BattingV2(view)];
            expect(v2.policyId).toBe(T20_BATTING_POLICY_V2_ID);
            expect(v2.intent).toBe(v1.intent);
            if (v2.aggression !== v1.aggression) {
              changed += 1;
              expect([target, balls >= 90, v1.aggression, v2.aggression]).toEqual([null, true, 2, 3]);
            } else same += 1;
          }
    expect(changed).toBeGreaterThan(10);
    expect(same).toBeGreaterThan(changed);
  });
  test("three wickets left in over 16, or a tail-ender on strike, attack at 3; the last two overs are still 4", () => {
    expect(adviseT20BattingV2({ ...base, inningsLegalBalls: 92, wicketsLost: 7 }).aggression).toBe(3);
    expect(adviseT20Batting({ ...base, inningsLegalBalls: 92, wicketsLost: 7 }).aggression).toBe(2);
    expect(adviseT20BattingV2({ ...base, inningsLegalBalls: 96, wicketsLost: 6, striker: tailender })).toMatchObject({ aggression: 3, intent: "ROTATE" });
    expect(adviseT20BattingV2({ ...base, inningsLegalBalls: 110, wicketsLost: 8 }).aggression).toBe(4);
    // Before the death V1 stands: few wickets with many balls left still protects the innings.
    expect(adviseT20BattingV2({ ...base, inningsLegalBalls: 70, wicketsLost: 7 }).aggression).toBe(2);
  });
});

describe("Captain V5: replay compatibility", () => {
  const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
  const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
  const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
  const setup = (seed: string) => { const r = structuredClone(template); r.setup.seed = seed; return validateT20MatchSetup(r, worldBytes, manifest); };
  const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  /** Both sides on the computer opponent, ball advanced by the autopilot, as the person would. */
  const opponent = (session: T20Session, stop: (s: T20Session) => boolean = () => false) => {
    while (session.core.phase !== "COMPLETE" && !stop(session)) {
      const proposed = session.setup.teams.map((t) => proposeOpponentT20Command(session, t.teamId, undefined, true, true)).find((c) => c !== null);
      session = executeT20Command(session, proposed ?? fixtureAutopilotStep(session)).session;
    }
    return session;
  };

  test("a match played under V4 replays from its saved commands, identically, with the V5 code", () => {
    for (const seed of ["v5-compat-1", "v5-compat-2"]) {
      // V4 played in the batch harness as it was (adviseT20CaptainV4, a whole over per ADVANCE), saved as the game stores it.
      const v4 = runTacticalT20(setup(seed), 900, { advise: adviseT20CaptainV4, advance: "OVER" });
      const saved = JSON.parse(JSON.stringify(v4));
      const rebuilt = rehydrateT20Session(saved, worldBytes, manifest);
      expect(rebuilt.lastEventHash).toBe(v4.lastEventHash);
      expect(sha(rebuilt.events)).toBe(sha(v4.events));
      // The same set-up played live under V5 makes different choices; the saved match is unaffected by them.
      const v5 = runTacticalT20(setup(seed));
      expect(v5.lastEventHash).not.toBe(v4.lastEventHash);
      expect(v5.commands.some((c) => c.kind === "SET_BOWLING_PLAN" && (c.payload as { length: string }).length === "SHORT")).toBe(true);
    }
  }, 120_000);

  test("a saved match in progress resumes from its commands and finishes under V5 without changing what was recorded", () => {
    // Saved in the second innings's death overs, where V5's choices differ from V4's.
    const part = opponent(createT20Session(setup("v5-compat-3")), (s) => s.core.activeInningsIndex === 1 && s.core.innings[1]!.innings.legalBalls >= 96);
    expect(part.core.phase).not.toBe("COMPLETE");
    const saved = JSON.parse(JSON.stringify(part));
    const resumed = rehydrateT20Session(saved, worldBytes, manifest);
    expect(resumed.lastEventHash).toBe(part.lastEventHash);
    const finished = opponent(resumed);
    expect(finished.core.phase).toBe("COMPLETE");
    expect(sha(finished.commands.slice(0, saved.commands.length))).toBe(sha(saved.commands));
  }, 120_000);

  test("the batch step under V4 settings reproduces V4's step exactly (the harness V4 was measured with)", () => {
    let session = createT20Session(setup("v5-compat-4"));
    while (session.core.phase !== "COMPLETE") {
      const command = tacticalT20Step(session, { advise: adviseT20CaptainV4, advance: "OVER" });
      if (command.kind === "ADVANCE") expect(command.payload).toEqual({ scope: "OVER" });
      session = executeT20Command(session, command).session;
    }
    expect(session.commands.filter((c) => c.kind === "SET_BOWLING_PLAN").every((c) => ["GOOD", "FULL", "YORKER"].includes((c.payload as { length: string }).length))).toBe(true);
  }, 120_000);
});
