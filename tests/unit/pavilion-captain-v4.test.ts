import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createT20Session, executeT20Command, fixtureAutopilotStep, validateT20MatchSetup } from "@lcxxvi/simulation";
import { proposeOpponentT20Command } from "../../apps/web/src/match/ai-opponent.js";
import {
  adviseT20Captain,
  t20BowlerSkill,
  canCompleteBowling,
  deathOverReserve,
  T20_TACTICAL_CAPTAIN_ID,
  type T20TacticalPublicView,
  type TacticalBowlerCandidate,
} from "@lcxxvi/ai";

/** A bowler for the death-over plan: one number sets all four bowling skills. */
type Bowler = { id: string; level: number; oversLeft: number };
const skills = (level: number) => ({ control: level, movement: level, variation: level, stamina: level });

/** The view a caller builds: candidates exclude the previous over's bowler and anyone bowled out. */
function view(bowlers: readonly Bowler[], oversRemaining: number, previous: string | null, fatigue: Record<string, number> = {}): T20TacticalPublicView {
  const candidates: TacticalBowlerCandidate[] = bowlers
    .filter((b) => b.id !== previous && b.oversLeft > 0)
    .map((b) => ({ playerId: b.id, ...skills(b.level), fatigueBp: fatigue[b.id] ?? 0, legalBallsBowled: 24 - 6 * b.oversLeft, quotaRemaining: 6 * b.oversLeft }));
  const prev = bowlers.find((b) => b.id === previous);
  return {
    inningsLegalBalls: 120 - 6 * oversRemaining,
    inningsRuns: 0,
    wicketsLost: 0,
    targetToWin: null,
    availableBatters: 10,
    bowlingCandidates: candidates,
    previousOverBowler: prev ? { playerId: prev.id, quotaRemaining: 6 * prev.oversLeft, ...skills(prev.level) } : null,
  };
}

/** Plays out the rest of an innings with the captain choosing every bowler; returns who bowled each over. */
function playOut(start: readonly Bowler[], oversRemaining: number, previous: string | null): string[] {
  const bowlers = start.map((b) => ({ ...b }));
  const order: string[] = [];
  let prev = previous;
  for (let left = oversRemaining; left > 0; left -= 1) {
    const choice = adviseT20Captain(view(bowlers, left, prev)).preferredBowlerId;
    const chosen = bowlers.find((b) => b.id === choice);
    if (!chosen || chosen.id === prev || chosen.oversLeft < 1) throw new Error(`ILLEGAL ${choice} with ${left} overs left`);
    chosen.oversLeft -= 1;
    order.push(chosen.id);
    prev = chosen.id;
  }
  return order;
}

describe("Captain V4: the best bowlers keep overs for the death", () => {
  test("is a new captain version with V3's batting policy", () => {
    expect(T20_TACTICAL_CAPTAIN_ID).toBe("LC_T20_TACTICAL_CAPTAIN_V4");
    const bowlers = ["a", "b"].map((id) => ({ id, level: 60, oversLeft: 4 }));
    expect(adviseT20Captain(view(bowlers, 20, null)).policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V4");
  });

  test("keeps two overs each for the best two bowlers and one for the third", () => {
    const six = [70, 65, 60, 55, 50, 45].map((skill, n) => ({ playerId: `p${n}`, oversLeft: 4, skill }));
    expect([...deathOverReserve(six, 5)]).toEqual([["p0", 2], ["p1", 2], ["p2", 1], ["p3", 0], ["p4", 0], ["p5", 0]]);
    // A best bowler with one over left keeps that one; the rest of the five is covered further down.
    const short = six.map((b) => (b.playerId === "p0" ? { ...b, oversLeft: 1 } : b));
    expect([...deathOverReserve(short, 5)].filter(([, n]) => n > 0)).toEqual([["p0", 1], ["p1", 2], ["p2", 2]]);
    // Ties break on playerId, and nothing is kept once the death's overs are covered.
    const tied = ["z", "y", "x"].map((playerId) => ({ playerId, oversLeft: 4, skill: 50 }));
    expect([...deathOverReserve(tied, 3)].sort()).toEqual([["x", 2], ["y", 1], ["z", 0]]);
    expect([...deathOverReserve(tied, 0)].every(([, n]) => n === 0)).toBe(true);
  });

  test("before the death, does not spend a reserved over while another bowler has one to spare", () => {
    // Over 11: the best bowler a has bowled two overs and has two left, both kept for the death; e has overs to spare.
    const bowlers = [
      { id: "a", level: 80, oversLeft: 2 },
      { id: "b", level: 70, oversLeft: 4 },
      { id: "e", level: 40, oversLeft: 4 },
    ];
    const advice = adviseT20Captain(view(bowlers, 10, null));
    expect(advice.preferredBowlerId).not.toBe("a");
    // In the death the best bowler is chosen.
    expect(adviseT20Captain(view(bowlers, 5, null)).preferredBowlerId).toBe("a");
  });

  test("full innings: the best two bowl four of the last five overs, the weakest none", () => {
    const six = [{ id: "a", level: 80 }, { id: "b", level: 75 }, { id: "c", level: 70 }, { id: "d", level: 60 }, { id: "e", level: 50 }, { id: "f", level: 40 }].map((b) => ({ ...b, oversLeft: 4 }));
    const order = playOut(six, 20, null);
    const death = order.slice(15);
    expect(death.filter((id) => id === "a" || id === "b")).toHaveLength(4);
    expect(death).toContain("c");
    expect(death).not.toContain("e");
    expect(death).not.toContain("f");
    // Five bowlers with exactly 20 overs between them: still all bowled, the death still to the best.
    const five = six.slice(0, 5);
    const fiveOrder = playOut(five, 20, null);
    expect(fiveOrder).toHaveLength(20);
    expect(fiveOrder.slice(15).filter((id) => id === "a" || id === "b")).toHaveLength(4);
  });

  test("never strands an innings that could still be bowled (every small case)", () => {
    // Five bowlers of different skill, each with 0 to 4 overs left, any previous bowler, 1 to 10 overs to go: both
    // sides of the death boundary (5 overs). Whenever the remaining overs can be bowled, the captain's choice is legal
    // and leaves them bowlable; the next test plays such states out to the end.
    const levels = [80, 72, 64, 56, 48];
    const failures: string[] = [];
    let checked = 0;
    for (let code = 0; code < 5 ** 5; code += 1) {
      const bowlers = levels.map((level, n) => ({ id: `b${n}`, level, oversLeft: Math.floor(code / 5 ** n) % 5 }));
      for (const previous of [null, ...bowlers.map((b) => b.id)]) {
        if (previous && bowlers.find((b) => b.id === previous)!.oversLeft === 4) continue; // they bowled the previous over
        for (let overs = 1; overs <= 10; overs += 1) {
          const left = bowlers.map((b) => ({ playerId: b.id, oversLeft: b.oversLeft }));
          if (!canCompleteBowling(overs, left, previous)) continue;
          const choice = adviseT20Captain(view(bowlers, overs, previous)).preferredBowlerId;
          const chosen = bowlers.find((b) => b.id === choice);
          const after = left.map((b) => (b.playerId === choice ? { ...b, oversLeft: b.oversLeft - 1 } : b));
          if (!chosen || chosen.id === previous || chosen.oversLeft < 1 || !canCompleteBowling(overs - 1, after, chosen.id))
            failures.push(`${JSON.stringify(left)} previous ${previous} overs ${overs}: chose ${choice}`);
          checked += 1;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(20000);
  }, 60_000);

  test("plays every bowlable state of five or six bowlers out to the last over", () => {
    let innings = 0;
    for (let code = 0; code < 3 ** 6; code += 1) {
      // Six bowlers, each with 2, 3 or 4 overs left, from over 9 (12 to go) to the end; then the same without the sixth.
      const six = [90, 75, 75, 60, 45, 30].map((level, n) => ({ id: `b${n}`, level, oversLeft: 2 + (Math.floor(code / 3 ** n) % 3) }));
      for (const bowlers of [six, six.slice(0, 5)]) {
        for (const overs of [12, 7, 5]) {
          if (!canCompleteBowling(overs, bowlers.map((b) => ({ playerId: b.id, oversLeft: b.oversLeft })), null)) continue;
          expect(playOut(bowlers, overs, null)).toHaveLength(overs);
          innings += 1;
        }
      }
    }
    expect(innings).toBeGreaterThan(1000);
  }, 60_000);

  test("is deterministic and reads only the public view", () => {
    const bowlers = [{ id: "a", level: 70, oversLeft: 3 }, { id: "b", level: 60, oversLeft: 4 }, { id: "c", level: 50, oversLeft: 4 }];
    const v = view(bowlers, 14, "a", { b: 3000 });
    expect(adviseT20Captain(v)).toEqual(adviseT20Captain(structuredClone(v)));
    // Without the previous bowler's skills the plan still works: they keep nothing back for the death.
    const { previousOverBowler, ...rest } = v;
    const bare = adviseT20Captain({ ...rest, previousOverBowler: { playerId: previousOverBowler!.playerId, quotaRemaining: previousOverBowler!.quotaRemaining } });
    expect(["b", "c"]).toContain(bare.preferredBowlerId);
    expect(() => adviseT20Captain({ ...v, previousOverBowler: { ...previousOverBowler!, control: Number.NaN } })).toThrow(/INVALID/);
  });
});

describe("Captain V4 in the computer opponent", () => {
  const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
  const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
  const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));

  test("every opponent mode finishes the match and gives the best two bowlers most of the death", () => {
    // team-01 banks late overs and team-02 does not (the opponent's stable temperament); each mode is played on
    // three seeds with both sides on the opponent. The ball is advanced by the autopilot, as the person would.
    const deathByTopTwo: number[] = [];
    for (const [matchAware, clubStyle] of [[false, false], [false, true], [true, true]] as const) {
      for (const seed of ["v4-opponent-1", "v4-opponent-2", "v4-opponent-3"]) {
        const request = structuredClone(template);
        request.setup.seed = seed;
        let session = createT20Session(validateT20MatchSetup(request, worldBytes, manifest));
        while (session.core.phase !== "COMPLETE") {
          if (session.revision >= 900) throw new Error("V4_OPPONENT_STALLED");
          const proposed = session.setup.teams.map((t) => proposeOpponentT20Command(session, t.teamId, undefined, matchAware, clubStyle)).find((c) => c !== null);
          session = executeT20Command(session, proposed ?? fixtureAutopilotStep(session)).session;
        }
        for (const ledger of session.core.innings) {
          const team = session.setup.teams.find((t) => t.teamId === ledger.innings.bowlingTeamId)!;
          const topTwo = team.xi.filter((p) => p.bowlingStyle !== null && p.playerId !== team.keeperId)
            .sort((a, b) => t20BowlerSkill(b.skills.T20) - t20BowlerSkill(a.skills.T20) || a.playerId.localeCompare(b.playerId)).slice(0, 2).map((p) => p.playerId);
          const overs = session.commands.filter((c) => c.kind === "SET_BOWLER" && (c.payload as { teamId: string }).teamId === team.teamId);
          if (ledger.innings.legalBalls < 120 || overs.length < 20) continue;
          deathByTopTwo.push(overs.slice(15, 20).filter((c) => topTwo.includes((c.payload as { bowlerId: string }).bowlerId)).length);
        }
      }
    }
    // Captain V3 left these overs to the weakest bowlers; with V4 the best two bowl at least three of the five.
    expect(deathByTopTwo.length).toBeGreaterThan(5);
    expect(deathByTopTwo.filter((n) => n < 3)).toEqual([]);
  }, 120_000);
});
