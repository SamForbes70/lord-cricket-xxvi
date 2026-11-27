import { describe, expect, it } from "vitest";
import type { View } from "../../apps/web/src/match/protocol.js";
import {
  isHatTrick,
  momentBaseline,
  momentsBetween,
  pickMoment,
  settleMoment,
  tallyBetween,
  tallyText,
} from "../../apps/web/src/match/match-moments.js";
import { batterStatusText, dismissalText } from "../../apps/web/src/match/dismissal-text.js";
import { playerOfTheMatch, resultFacts, topPerformances } from "../../apps/web/src/match/result-card.js";
import { plainBallText } from "../../apps/web/src/match/broadcast-labels.js";

const names: Record<string, string> = {
  a1: "Oren Kelwell", a2: "Galen Zornwick", a3: "Ulen Elmcroft", k1: "Pavan Jorstone",
  b1: "Arven Valebridge", b2: "Isen Kelholt", bk: "Nave Orincombe",
};

type Kind = "BOWLED" | "LBW" | "CAUGHT" | "RUN_OUT" | "STUMPED" | "HIT_WICKET";
type Ball = { runs?: number; boundary?: "FOUR" | "SIX"; out?: Kind; striker?: string; bowler?: string; wide?: boolean };

/** A ledger-and-highlights view made from a list of balls: enough of the real View shape for the derivations. */
function makeView(balls: Ball[], opts: { revision?: number; result?: string | null; extra?: Partial<View> } = {}): View {
  const batting: Record<string, { runs: number; ballsFaced: number; fours: number; sixes: number; dismissed: boolean }> = {};
  const bowling: Record<string, { runsConceded: number; legalBalls: number; wickets: number; maidens: number }> = {};
  const dismissals: Record<string, { kind: Kind; playerId: string; creditedBowlerId: string | null; fielderId: string | null; wicketEnd: "NORTH" }> = {};
  const cues: unknown[] = [];
  let runs = 0, wickets = 0, legal = 0;
  balls.forEach((b, n) => {
    const striker = b.striker ?? "a1";
    const bowler = b.bowler ?? "b1";
    const r = b.boundary === "SIX" ? 6 : b.boundary === "FOUR" ? 4 : (b.runs ?? 0);
    batting[striker] ??= { runs: 0, ballsFaced: 0, fours: 0, sixes: 0, dismissed: false };
    bowling[bowler] ??= { runsConceded: 0, legalBalls: 0, wickets: 0, maidens: 0 };
    if (!b.wide) { batting[striker]!.ballsFaced += 1; legal += 1; bowling[bowler]!.legalBalls += 1; }
    batting[striker]!.runs += b.wide ? 0 : r;
    if (b.boundary === "FOUR") batting[striker]!.fours += 1;
    if (b.boundary === "SIX") batting[striker]!.sixes += 1;
    bowling[bowler]!.runsConceded += b.wide ? 1 : r;
    runs += b.wide ? 1 : r;
    if (b.out) {
      wickets += 1;
      batting[striker]!.dismissed = true;
      const credited = b.out === "RUN_OUT" ? null : bowler;
      if (credited) bowling[bowler]!.wickets += 1;
      dismissals[striker] = { kind: b.out, playerId: striker, creditedBowlerId: credited, fielderId: b.out === "CAUGHT" ? "b2" : b.out === "STUMPED" ? "bk" : b.out === "RUN_OUT" ? "b2" : null, wicketEnd: "NORTH" };
    }
    cues.push({
      sequence: n + 1, inningsIndex: 0, overBallLabel: `${Math.floor((legal - 1) / 6)}.${((legal - 1) % 6) + 1}`,
      strikerId: striker, strikerName: names[striker], bowlerId: bowler, bowlerName: names[bowler],
      runsScored: b.wide ? 1 : r, boundary: b.boundary ?? "NONE", legality: b.wide ? "WIDE" : "LEGAL",
      dismissalKind: b.out ?? null, dismissedPlayerName: b.out ? names[striker] : null,
    });
  });
  return {
    matchId: "m1", revision: opts.revision ?? balls.length, format: "T20", names, activeIndex: 0, resultText: opts.result ?? null,
    teams: [
      { id: "A", name: "Moonstone Bay", captainId: "a1", keeperId: "k1", playerIds: ["a1", "a2", "a3", "k1"] },
      { id: "B", name: "Aster Harbour", captainId: "b1", keeperId: "bk", playerIds: ["b1", "b2", "bk"] },
    ],
    innings: [{
      innings: { battingTeamId: "A", bowlingTeamId: "B", runs, wickets, legalBalls: legal, northBatterId: "a2", southBatterId: "a3", targetToWin: null, allocatedBalls: 120 },
      batting, bowling, dismissals, keeperId: "bk",
    }],
    fieldPresentation: { recentHighlights: cues.slice(-24), latestHighlight: cues[cues.length - 1] ?? null },
    scorecard: null,
    ...opts.extra,
  } as unknown as View;
}

describe("CP04 dismissal text (CD-017)", () => {
  const n = { ...names };
  it("prints each mode in scorecard form", () => {
    expect(dismissalText({ kind: "BOWLED", creditedBowlerId: "b1", fielderId: null }, n)).toBe("b Arven Valebridge");
    expect(dismissalText({ kind: "LBW", creditedBowlerId: "b1", fielderId: null }, n)).toBe("lbw b Arven Valebridge");
    expect(dismissalText({ kind: "CAUGHT", creditedBowlerId: "b1", fielderId: "b2" }, n)).toBe("c Isen Kelholt b Arven Valebridge");
    expect(dismissalText({ kind: "CAUGHT", creditedBowlerId: "b1", fielderId: "b1" }, n)).toBe("c & b Arven Valebridge");
    expect(dismissalText({ kind: "CAUGHT", creditedBowlerId: "b1", fielderId: "bk" }, n, "bk")).toBe("c †Nave Orincombe b Arven Valebridge");
    expect(dismissalText({ kind: "STUMPED", creditedBowlerId: "b1", fielderId: "bk" }, n, "bk")).toBe("st †Nave Orincombe b Arven Valebridge");
    expect(dismissalText({ kind: "RUN_OUT", creditedBowlerId: null, fielderId: "b2" }, n)).toBe("run out (Isen Kelholt)");
    expect(dismissalText({ kind: "RUN_OUT", creditedBowlerId: null, fielderId: null }, n)).toBe("run out");
    expect(dismissalText({ kind: "HIT_WICKET", creditedBowlerId: "b1", fielderId: null }, n)).toBe("hit wicket b Arven Valebridge");
  });
  it("marks the batters at the crease not out and the rest did not bat", () => {
    const view = makeView([{ out: "BOWLED" }, { striker: "a2", runs: 1 }]);
    const ledger = view.innings[0]!;
    expect(batterStatusText("a1", ledger, names)).toBe("b Arven Valebridge");
    expect(batterStatusText("a2", ledger, names)).toBe("not out");
    expect(batterStatusText("k1", ledger, names)).toBe("did not bat");
  });
  it("uses no en or em dashes", () => {
    for (const kind of ["BOWLED", "LBW", "CAUGHT", "RUN_OUT", "STUMPED", "HIT_WICKET"] as const)
      expect(dismissalText({ kind, creditedBowlerId: "b1", fielderId: "b2" }, n)).not.toMatch(/[–—]/);
  });
});

describe("CP04 moments from the authoritative view (CD-016)", () => {
  it("gives routine balls nothing and a boundary its moment", () => {
    const before = makeView([{ runs: 0 }]);
    const dot = makeView([{ runs: 0 }, { runs: 1 }]);
    expect(momentsBetween(momentBaseline(before), dot)).toEqual([]);
    expect(settleMoment(momentBaseline(before), dot).moment).toBeNull();
    const four = makeView([{ runs: 0 }, { boundary: "FOUR" }]);
    const m = settleMoment(momentBaseline(before), four);
    expect(m.moment?.kind).toBe("FOUR");
    expect(m.moment?.line).toContain("Oren Kelwell");
    expect(m.summary).toBeNull(); // one ball: no tally
  });
  it("names how a wicket fell", () => {
    const before = makeView([{ runs: 2 }]);
    const after = makeView([{ runs: 2 }, { out: "CAUGHT" }]);
    const m = settleMoment(momentBaseline(before), after).moment!;
    expect(m.kind).toBe("WICKET");
    expect(m.line).toBe("Oren Kelwell c Isen Kelholt b Arven Valebridge, 2 (2)");
    expect(m.detail).toBe("Arven Valebridge 1/2 from 0.2 overs");
  });
  it("finds fifties, hundreds and five-wicket hauls from the ledgers, even across many overs", () => {
    const start: Ball[] = Array.from({ length: 12 }, () => ({ boundary: "FOUR" as const })); // 48
    const before = makeView(start);
    const after = makeView([...start, { runs: 2 }, { runs: 1, striker: "a2" }]);
    expect(momentsBetween(momentBaseline(before), after).map((x) => x.kind)).toContain("FIFTY");
    const hundred = makeView([...start, ...Array.from({ length: 13 }, () => ({ boundary: "FOUR" as const }))]);
    const kinds = momentsBetween(momentBaseline(before), hundred).map((x) => x.kind);
    expect(kinds).toContain("HUNDRED");
    expect(kinds).not.toContain("FIFTY");
    const five = makeView(["a1", "a2", "a3", "k1", "a1"].map((s, i) => ({ out: "BOWLED" as const, striker: i === 4 ? "a3" : s, bowler: i % 2 ? "b1" : "b1" })));
    expect(momentsBetween(momentBaseline(makeView([])), five).map((x) => x.kind)).toContain("FIVE_WICKETS");
  });
  it("calls a hat-trick only for three consecutive deliveries by one bowler, each credited to him", () => {
    const hat = makeView([{ runs: 1, bowler: "b2" }, { out: "BOWLED", striker: "a1" }, { out: "LBW", striker: "a2" }, { out: "CAUGHT", striker: "a3" }]);
    const cues = hat.fieldPresentation!.recentHighlights;
    expect(isHatTrick(cues, cues[cues.length - 1]!)).toBe(true);
    expect(pickMoment(momentsBetween(momentBaseline(makeView([{ runs: 1, bowler: "b2" }])), hat))?.kind).toBe("HAT_TRICK");
    const runOut = makeView([{ out: "BOWLED", striker: "a1" }, { out: "LBW", striker: "a2" }, { out: "RUN_OUT", striker: "a3" }]);
    const rc = runOut.fieldPresentation!.recentHighlights;
    expect(isHatTrick(rc, rc[rc.length - 1]!)).toBe(false);
    const wide = makeView([{ out: "BOWLED", striker: "a1" }, { wide: true }, { out: "LBW", striker: "a2" }, { out: "CAUGHT", striker: "a3" }]);
    const wc = wide.fieldPresentation!.recentHighlights;
    expect(isHatTrick(wc, wc[wc.length - 1]!)).toBe(false);
  });
  it("credits a maiden from the ledger counter", () => {
    const before = makeView([]);
    const after = makeView([]);
    after.innings[0]!.bowling["b1"] = { runsConceded: 0, legalBalls: 6, wickets: 0, maidens: 1 };
    expect(momentsBetween(momentBaseline(before), after).map((x) => x.kind)).toEqual(["MAIDEN"]);
  });
  it("announces the result once", () => {
    const before = makeView([{ runs: 1 }]);
    const done = makeView([{ runs: 1 }, { boundary: "SIX" }], { result: "Moonstone Bay won by 3 runs" });
    const m = settleMoment(momentBaseline(before), done);
    expect(m.moment?.kind).toBe("RESULT");
    expect(m.moment?.line).toBe("Moonstone Bay won by 3 runs");
    expect(settleMoment(momentBaseline(done), done).moment).toBeNull();
  });
});

describe("CP04 batching rule", () => {
  it("settles a batch to its single most significant moment with a ledger tally, never a backlog", () => {
    const start = makeView([{ runs: 1 }], { revision: 1 });
    // A batch of three overs: fours, a six and two wickets, then a dot.
    const balls: Ball[] = [{ runs: 1 }, { boundary: "FOUR" }, { boundary: "SIX" }, { out: "BOWLED" }, { boundary: "FOUR", striker: "a2" },
      ...Array.from({ length: 12 }, () => ({ runs: 1, striker: "a2" })), { out: "LBW", striker: "a2" }, { runs: 0, striker: "a3" }];
    const end = makeView(balls, { revision: 40 });
    const all = momentsBetween(momentBaseline(start), end);
    expect(all.length).toBeGreaterThan(3);
    const settled = settleMoment(momentBaseline(start), end);
    expect(settled.moment?.kind).toBe("WICKET");
    // The latest of the two wickets.
    expect(settled.moment?.line).toContain("Galen Zornwick");
    expect(settled.summary).toBe("In those 3 overs: 26 runs, 2 wickets, 2 fours, 1 six.");
  });
  it("counts the tally from the ledgers, so a skipped render loses nothing", () => {
    const start = makeView([]);
    const many: Ball[] = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? { boundary: "FOUR" as const } : { runs: 0 }));
    const end = makeView(many);
    expect(end.fieldPresentation!.recentHighlights).toHaveLength(24); // the highlights window drops old balls
    expect(tallyBetween(momentBaseline(start), end).fours).toBe(8);
    expect(tallyText({ wickets: 0, fours: 1, sixes: 0, runs: 5, legalBalls: 1 })).toBeNull();
  });
  it("shows nothing after a load, a new match or a rewind", () => {
    const a = makeView([{ boundary: "SIX" }], { revision: 9 });
    const other = { ...makeView([{ boundary: "SIX" }, { boundary: "SIX" }], { revision: 10 }), matchId: "m2" } as View;
    expect(settleMoment(momentBaseline(a), other).moment).toBeNull();
    const rewound = makeView([{ boundary: "SIX" }, { boundary: "SIX" }], { revision: 3 });
    expect(settleMoment(momentBaseline(a), rewound).moment).toBeNull();
  });
});

describe("CP11 result card facts", () => {
  const base = makeView([{ boundary: "FOUR" }, { out: "BOWLED" }, { runs: 2, striker: "a2" }], { result: "Aster Harbour won by 3 runs" });
  it("explains a defeat by its margin, from the result", () => {
    const v = { ...base, scorecard: { result: { kind: "WIN", winnerTeamId: "B", marginType: "RUNS", marginRuns: 3, marginWickets: null } } } as unknown as View;
    const facts = resultFacts(v, "A");
    expect(facts.outcome).toBe("LOST");
    expect(facts.marginNote).toBe("Moonstone Bay finished 3 runs short of the target.");
    expect(facts.marginNote).not.toMatch(/[–—]/);
    const w = { ...base, scorecard: { result: { kind: "WIN", winnerTeamId: "A", marginType: "WICKETS", marginRuns: null, marginWickets: 1 } } } as unknown as View;
    expect(resultFacts(w, "A")).toMatchObject({ outcome: "WON", marginNote: "Moonstone Bay reached the target with 1 wicket in hand and 117 balls to spare." });
  });
  it("lists the best batting and bowling of each innings", () => {
    const top = topPerformances(base);
    expect(top.batting.map((p) => p.text)).toEqual(["Oren Kelwell 4 (2)"]);
    expect(top.bowling.map((p) => p.text)).toEqual(["Arven Valebridge 1/6 (0.3)"]);
  });
  it("takes the player of the match from the game's existing award and invents none", () => {
    expect(playerOfTheMatch(base)).toBeNull();
    const awarded = { ...base, matchAward: { status: "AWARDED", winnerPlayerId: "b1", winnerTeamId: "B", candidates: [{ playerId: "b1", summaryLine: "1/6 (0.3)" }] } } as unknown as View;
    expect(playerOfTheMatch(awarded)).toEqual({ playerId: "b1", teamId: "B", line: "1/6 (0.3)" });
  });
});

describe("CP04 plain ball words", () => {
  it("describes the ball without tracking jargon", () => {
    expect(plainBallText({ overBallLabel: "3.6", executedLength: "SHORT", trajectory: "GROUND" })).toBe("Ball 3.6: Short, played along the ground.");
    expect(plainBallText({ overBallLabel: "0.1", executedLength: null, trajectory: null })).toBe("Ball 0.1: Length not recorded.");
  });
});
