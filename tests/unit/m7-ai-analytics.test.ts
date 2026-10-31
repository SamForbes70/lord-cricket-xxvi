import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { adviseT20Captain } from "@lcxxvi/ai";
import { runTacticalT20, publicT20CaptainView } from "../../apps/batch/src/tactical-match.js";
import { createMatchAnalyticsAccumulator, createMatchAnalyticsCache, projectT20MatchAnalytics } from "@lcxxvi/projections";
import { runFixtureT20, validateT20MatchSetup, projectT20Scorecard } from "@lcxxvi/simulation";

const bowler = (playerId: string, overrides = {}) => ({ playerId, control: 70, movement: 65, variation: 60, stamina: 75, fatigueBp: 500, legalBallsBowled: 6, quotaRemaining: 18, ...overrides });
const basis = { inningsLegalBalls: 60, inningsRuns: 72, wicketsLost: 2, targetToWin: 170, availableBatters: 8, bowlingCandidates: [bowler("p100"), bowler("p101", { control: 45, movement: 45 })] };

describe("M7 public-only tactical captain V1", () => {
  test("is deterministic and chooses only from legal candidate list", () => {
    const result = adviseT20Captain(basis);
    expect(result).toEqual(adviseT20Captain(structuredClone(basis)));
    expect(result.preferredBowlerId).toBe("p100");
    expect(result.policyId).toBe("LC_T20_TACTICAL_CAPTAIN_V1");
  });
  test("reacts to chase pressure and wicket preservation without changing engine outcomes", () => {
    const chase = adviseT20Captain({ ...basis, inningsRuns: 45, targetToWin: 200 });
    const consolidate = adviseT20Captain({ ...basis, inningsRuns: 110, wicketsLost: 8, targetToWin: 155 });
    expect(chase.aggression).toBe(4);
    expect(consolidate.aggression).toBe(1);
  });
  test("respects candidate quota and fatigue costs", () => {
    const advice = adviseT20Captain({ ...basis, bowlingCandidates: [bowler("p100", { quotaRemaining: 0 }), bowler("p101", { fatigueBp: 9000 })] });
    expect(advice.preferredBowlerId).toBe("p101");
    expect(advice.bowlingEffort).toBe("CONSERVE");
    expect(adviseT20Captain({ ...basis, bowlingCandidates: [] }).preferredBowlerId).toBeNull();
  });
  test("rejects malformed public input instead of accepting hidden or invalid model values", () => {
    expect(() => adviseT20Captain({ ...basis, inningsRuns: Number.NaN })).toThrow(/INVALID/);
    expect(() => adviseT20Captain({ ...basis, inningsLegalBalls: 121 })).toThrow(/INVALID/);
  });
});

describe("M7 canonical T20 match analytics", () => {
  test("incremental application matches rebuilding and rejects gaps and duplicates", () => {
    const setup = validateT20MatchSetup(JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8")), readFileSync("packages/data/worlds/fictional-eight-01.json"), JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8")));
    const session = runFixtureT20(setup), accumulator = createMatchAnalyticsAccumulator(2);
    accumulator.append(session.events[0]!);
    const before = accumulator.snapshot();
    expect(() => accumulator.append(session.events[0]!)).toThrow("SEQUENCE_ORDER");
    expect(() => accumulator.append(session.events[2]!)).toThrow("SEQUENCE_ORDER");
    expect(accumulator.appliedSequence).toBe(1);
    expect(accumulator.snapshot()).toEqual(before);
    for (const event of session.events.slice(1)) {
      if (event.type === "DELIVERY_RECORDED" && accumulator.snapshot().worm.length === 0) {
        const invalid = structuredClone(event);
        (invalid.payload as { event: { shotSector: number } }).event.shotSector = 99;
        const prior = accumulator.snapshot();
        expect(() => accumulator.append(invalid)).toThrow("SHOT_SECTOR");
        expect(accumulator.snapshot()).toEqual(prior);
      }
      accumulator.append(event);
      if (event.sequence % 100 === 0) expect(accumulator.snapshot()).toEqual(projectT20MatchAnalytics(session.events.slice(0, event.sequence)));
    }
    expect(accumulator.snapshot(projectT20Scorecard(session))).toEqual(projectT20MatchAnalytics(session.events, projectT20Scorecard(session)));
    const cache = createMatchAnalyticsCache(2);
    cache.update(session.events.slice(0, 100));
    cache.update(session.events);
    expect(cache.snapshot(projectT20Scorecard(session))).toEqual(projectT20MatchAnalytics(session.events, projectT20Scorecard(session)));
    cache.update(session.events.slice(0, 50));
    expect(cache.appliedSequence).toBe(50);
    expect(cache.snapshot()).toEqual(projectT20MatchAnalytics(session.events.slice(0, 50)));
    cache.update(session.events);
    expect(cache.snapshot()).toEqual(projectT20MatchAnalytics(session.events));
    const detached = accumulator.snapshot();
    (detached.finalRuns as number[])[0] = -1;
    expect(accumulator.snapshot().finalRuns[0]).not.toBe(-1);
  }, 120000);
  test("does not invent scores or tracking data on an empty event stream", () => {
    const analytics = projectT20MatchAnalytics([]);
    expect(analytics.overSummaries).toEqual([]);
    expect(analytics.partnerships).toEqual([]);
    expect(analytics.finalRuns).toEqual([0, 0]);
  });
  test("reconciles every summary against one complete accepted T20 event chain", () => {
    const setup = validateT20MatchSetup(
      JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8")),
      readFileSync("packages/data/worlds/fictional-eight-01.json"),
      JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8")),
    );
    const session = runFixtureT20(setup);
    const card = projectT20Scorecard(session);
    const analytics = projectT20MatchAnalytics(session.events, card);
    expect(analytics.finalRuns).toEqual(card.innings.map(i => i.runs));
    expect(analytics.finalWickets).toEqual(card.innings.map(i => i.wickets));
    expect(analytics.finalLegalBalls).toEqual(card.innings.map(i => i.legalBalls));
    expect(analytics.overSummaries.reduce((a, over) => a + over.runs, 0)).toBe(card.innings[0]!.runs + card.innings[1]!.runs);
    expect(analytics.partnerships.reduce((a, pair) => a + pair.runs, 0)).toBe(card.innings[0]!.runs + card.innings[1]!.runs);
    expect(analytics.worm.length).toBe(session.events.filter(e => e.type === "DELIVERY_RECORDED").length);
    const recordedLengths = session.events.filter(e => e.type === "DELIVERY_RECORDED").map(e => (e.payload as { event: { executedLength: string | null } }).event.executedLength);
    expect(analytics.unrecordedLengths).toBe(recordedLengths.filter(length => length === null).length);
    for (const entry of analytics.pitchLengths) expect(entry.attempts).toBe(recordedLengths.filter(length => length === entry.length).length);
    expect(() => projectT20MatchAnalytics(session.events, { ...card, innings: [{ ...card.innings[0]!, runs: card.innings[0]!.runs + 1 }, card.innings[1]!] })).toThrow(/RUN_RECONCILIATION/);
  }, 120000);
});


describe("M7 tactical captain engine integration", () => {
  test("both captains use legal accepted engine commands and remain deterministic under replay", () => {
    const setup = validateT20MatchSetup(
      JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8")),
      readFileSync("packages/data/worlds/fictional-eight-01.json"),
      JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8")),
    );
    const one = runTacticalT20(setup), two = runTacticalT20(setup);
    expect(one.core.phase).toBe("COMPLETE");
    expect(one.lastEventHash).toBe(two.lastEventHash);
    expect(one.commands.some(c => c.kind === "SET_BATTING_PLAN")).toBe(true);
    expect(one.commands.some(c => c.kind === "SET_BOWLING_PLAN")).toBe(true);
    expect(one.commands.filter(c => c.kind === "SET_BOWLER").every(c => c.actorId.startsWith("AI:"))).toBe(true);
    expect(projectT20MatchAnalytics(one.events, projectT20Scorecard(one)).finalRuns).toEqual(projectT20Scorecard(one).innings.map(i=>i.runs));
    const view = publicT20CaptainView(one);
    expect(view).not.toBeNull();
    expect(Object.keys(view!)).toEqual(["inningsLegalBalls","inningsRuns","wicketsLost","targetToWin","availableBatters","bowlingCandidates"]);
    expect(JSON.stringify(view)).not.toContain(setup.seed);
  }, 120000);
});
