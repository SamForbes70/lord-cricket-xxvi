import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { HistoricalContributingMatch, WorldPack } from "@lcxxvi/contracts";
import {
  PLAYER_IDENTITY_V2_VERSION,
  SELECTION_ADVICE_NOTE,
  careerIntroRecord,
  careerIntroSummary,
  matchIntroduction,
  matchIntroductionV2,
  playerForm,
  playingStyle,
  selectionAdvice,
  type AdvicePlayer,
  type CareerIntroRecord,
  type CareerIntroSource,
  type PlayingStyle,
} from "@lcxxvi/projections";

// LC_PLAYER_IDENTITY_V2 (docs/pavilion/PLAYER_IDENTITY_V2.md).
const root = resolve(import.meta.dirname, "../..");
const world = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json"), "utf8")) as WorldPack;

const anchor: PlayingStyle = { id: "ANCHOR", label: "Anchor", discipline: "BATTING", basis: [{ skill: "defence", label: "defence", value: 70 }, { skill: "timing", label: "timing", value: 66 }] };
const seamer: PlayingStyle = { id: "LINE_AND_LENGTH", label: "Line-and-length seamer", discipline: "BOWLING", basis: [{ skill: "control", label: "control", value: 71 }] };

const match = (season: number, round: number, bat: [number, boolean] | null, bowl: [number, number, number] | null): HistoricalContributingMatch => ({
  fixtureId: `s${season}-r${round}`, matchId: `m-${season}-${round}`, seasonNumber: season, calendarYear: 2026 + season, roundNumber: round,
  matchDayDate: "2027-01-01", competitionId: "league", format: "T20", groundId: null, homeTeamId: "team01", awayTeamId: "team02",
  teamId: "team01", opponentTeamId: "team02",
  battedInnings: bat ? 1 : null, battingPosition: bat ? 3 : null, runsScored: bat ? bat[0] : null, ballsFaced: bat ? bat[0] : null,
  fours: bat ? 0 : null, sixes: bat ? 0 : null, notOut: bat ? bat[1] : null,
  bowledLegalBalls: bowl ? bowl[0] : null, bowlingRunsConceded: bowl ? bowl[2] : null, bowlingWickets: bowl ? bowl[1] : null, maidens: bowl ? 0 : null,
  catches: null, stumpings: null, runOuts: null, archiveEvaluated: false, archiveReplayAvailable: false, resultSummary: "Result", sourceCompletionSha256: "0".repeat(64),
});

const source = (over: Partial<CareerIntroSource> = {}): CareerIntroSource => ({
  playerId: "p1", matches: 0, battingInnings: 0, runs: 0, highScoreRuns: 0, highScoreNotOut: false, fifties: 0, hundreds: 0,
  bowlingLegalBalls: 0, bowlingInnings: 0, bowlingWickets: 0, bestBowlingWickets: 0, bestBowlingRuns: null, contributingMatches: [], ...over,
});

/** Every number in a text, as strings. */
const numbers = (text: string) => [...text.matchAll(/\d+/g)].map((m) => m[0]);
/** The numbers a fact list supports: each value, and each number inside string values such as "9, 41*". */
const supported = (facts: { value: number | string }[]) => new Set(facts.flatMap((f) => numbers(String(f.value))));

describe("career intro record", () => {
  test("latest three scores and figures, oldest first, across seasons", () => {
    const record = careerIntroRecord(source({
      matches: 5, battingInnings: 4, runs: 98, highScoreRuns: 41, highScoreNotOut: true, bowlingLegalBalls: 30, bowlingWickets: 3, bestBowlingWickets: 2, bestBowlingRuns: 18,
      contributingMatches: [
        match(2, 1, [12, false], [12, 1, 20]),
        match(1, 13, [9, false], null),
        match(1, 14, [41, true], [18, 2, 18]),
        match(2, 2, null, null),
        match(2, 3, [36, false], null),
      ],
    }));
    expect(record.recentBatting).toEqual(["41*", "12", "36"]);
    expect(record.recentBowling).toEqual(["2/18", "1/20"]);
    expect(record.highScore).toEqual({ runs: 41, notOut: true });
    expect(record.bestBowling).toEqual({ wickets: 2, runs: 18 });
  });

  test("a player the statistics do not list gets an empty record, and the summary keys every named player", () => {
    const summary = careerIntroSummary("game-1", ["p2", "p1"], [source({ playerId: "p1", matches: 1, battingInnings: 1, runs: 5, highScoreRuns: 5 })]);
    expect(summary.version).toBe(PLAYER_IDENTITY_V2_VERSION);
    expect(Object.keys(summary.players)).toEqual(["p1", "p2"]);
    expect(summary.players.p2).toMatchObject({ matches: 0, battingInnings: 0, runs: 0, highScore: null, bestBowling: null });
  });
});

describe("match introductions with a career record", () => {
  const batter: CareerIntroRecord = careerIntroRecord(source({
    matches: 18, battingInnings: 17, runs: 412, highScoreRuns: 77, highScoreNotOut: true, fifties: 3,
    contributingMatches: [match(1, 10, [9, false], null), match(1, 11, [41, true], null), match(1, 12, [30, false], null)],
  }));

  test("a batter walks out with runs, best, latest scores and no invented number", () => {
    const intro = matchIntroductionV2("Vero Jorcroft", anchor, "BATTER", batter, true);
    expect(intro.source).toBe("CAREER");
    expect(intro.visible).toBe("Walks out: 412 runs, best 77*");
    expect(intro.sentence).toBe(
      "New at the crease: Vero Jorcroft, Anchor (defence 70, timing 66). League record before this match: 412 runs in 17 innings, best 77*, 3 fifties. Latest league scores, oldest first: 9, 41*, 30.",
    );
    const v1 = matchIntroduction("Vero Jorcroft", anchor, "BATTER");
    const recordPart = intro.sentence.slice(v1.length);
    const ok = supported(intro.facts);
    for (const n of numbers(recordPart)) expect(ok.has(n), `${n} in "${recordPart}"`).toBe(true);
    for (const n of numbers(intro.visible)) expect(ok.has(n)).toBe(true);
  });

  test("a short record names the innings or matches instead of a best", () => {
    const one = careerIntroRecord(source({ matches: 1, battingInnings: 1, runs: 0, highScoreRuns: 0, contributingMatches: [match(1, 1, [0, false], null)] }));
    expect(matchIntroductionV2("Ada Fenwick", anchor, "BATTER", one, true).visible).toBe("Walks out: 0 runs in 1 innings");
    const wicketless = careerIntroRecord(source({ matches: 2, bowlingLegalBalls: 48, bowlingInnings: 2, bestBowlingRuns: 29, contributingMatches: [match(1, 1, null, [24, 0, 29]), match(1, 2, null, [24, 0, 31])] }));
    const intro = matchIntroductionV2("Ada Fenwick", seamer, "BOWLER", wicketless, true);
    expect(intro.visible).toBe("On to bowl: 0 wickets in 2 matches");
    expect(intro.facts).toContainEqual({ key: "bowlingInnings", value: 2 });
  });

  test("a career milestone in reach leads the chip", () => {
    const near = { ...batter, runs: 488 };
    const intro = matchIntroductionV2("Vero Jorcroft", anchor, "BATTER", near, true);
    expect(intro.visible).toBe("Walks out: 12 from 500 runs");
    expect(intro.sentence).toContain("Needs 12 runs for 500 league runs.");
    expect(intro.facts).toContainEqual({ key: "milestoneNeeded", value: 12 });
  });

  test("a first league innings and a first league over say so, and nothing more", () => {
    const fresh = careerIntroSummary("g", ["p9"], []).players.p9!;
    const bat = matchIntroductionV2("Ada Fenwick", anchor, "BATTER", fresh, true);
    expect(bat.visible).toBe("Walks out: first league innings");
    expect(bat.sentence).toMatch(/No league match recorded before this one\.$/);
    const bowl = matchIntroductionV2("Ada Fenwick", seamer, "BOWLER", { ...fresh, matches: 4 }, true);
    expect(bowl.visible).toBe("On to bowl: first league over");
    expect(bowl.sentence).toMatch(/Has not bowled in 4 recorded league matches\.$/);
  });

  test("a bowler comes on with wickets, best figures and latest figures", () => {
    const record = careerIntroRecord(source({
      matches: 9, bowlingLegalBalls: 180, bowlingInnings: 9, bowlingWickets: 11, bestBowlingWickets: 4, bestBowlingRuns: 19,
      contributingMatches: [match(1, 7, null, [24, 1, 28]), match(1, 8, null, [24, 4, 19]), match(1, 9, null, [24, 0, 40])],
    }));
    const intro = matchIntroductionV2("Tam Oduya", seamer, "BOWLER", record, true);
    expect(intro.visible).toBe("On to bowl: 11 wickets, best 4/19");
    expect(intro.sentence).toContain("League record before this match: 11 wickets, best 4/19. Latest league figures, oldest first: 1/28, 4/19, 0/40.");
    const near = matchIntroductionV2("Tam Oduya", seamer, "BOWLER", { ...record, wickets: 23 }, true);
    expect(near.visible).toBe("On to bowl: 2 from 25 wickets");
  });

  test("after the first ball the chip shows the style alone; without a record it is exactly V1", () => {
    expect(matchIntroductionV2("Vero Jorcroft", anchor, "BATTER", batter, false).visible).toBe("Anchor");
    const v1 = matchIntroductionV2("Vero Jorcroft", anchor, "BATTER", null, true);
    expect(v1).toEqual({ source: "STYLE_ONLY", visible: "Walks out: Anchor", sentence: matchIntroduction("Vero Jorcroft", anchor, "BATTER"), facts: [] });
    expect(matchIntroductionV2("Vero Jorcroft", seamer, "BOWLER", null, false).visible).toBe("Line-and-length seamer");
  });

  test("the visible chip stays short enough for the match row", () => {
    const longest = matchIntroductionV2("X", anchor, "BATTER", { ...batter, runs: 9999, highScore: { runs: 199, notOut: true } }, true);
    expect(longest.visible.length).toBeLessThanOrEqual(32);
    const bowl = matchIntroductionV2("X", seamer, "BOWLER", { ...batter, bowlingLegalBalls: 600, wickets: 199, bestBowling: { wickets: 10, runs: 100 } }, true);
    expect(bowl.visible.length).toBeLessThanOrEqual(36);
  });
});

describe("selection advice", () => {
  const asAdvice = (p: WorldPack["players"][number]): AdvicePlayer => ({ playerId: p.playerId, name: p.name, role: p.role, bowlingStyle: p.bowlingStyle, skills: p.skills.T20! });
  const style = (p: AdvicePlayer) => playingStyle({ playerId: p.playerId, role: p.role, bowlingStyle: p.bowlingStyle, skills: p.skills }).primary;
  const team = world.teams[0]!;
  const squad = world.players.filter((p) => team.squadIds.includes(p.playerId)).map(asAdvice);

  const byRole = (role: string) => squad.filter((p) => p.role === role);
  const xi = [...byRole("KEEPER").slice(0, 1), ...byRole("BATTER").slice(0, 5), ...byRole("ALLROUNDER").slice(0, 2), ...byRole("BOWLER").slice(0, 3)];

  test("adds a style the rest of the XI lacks, labelled as a suggestion", () => {
    expect(xi).toHaveLength(11);
    let added = 0;
    for (const option of squad.filter((p) => !xi.includes(p))) {
      for (const other of xi) {
        if (style(option).id === style(other).id || style(option).basis.length === 0) continue;
        const rest = xi.filter((p) => p.playerId !== other.playerId);
        const reasons = selectionAdvice({ option, other, restOfXi: rest, form: null });
        const lacks = !rest.some((p) => style(p).id === style(option).id);
        const adds = reasons.find((r) => r.id === "ADDS_STYLE");
        expect(Boolean(adds)).toBe(lacks);
        if (adds) {
          added += 1;
          expect(adds.kind).toBe("SUGGESTION");
          expect(adds.text.toLowerCase()).toContain(style(option).label.toLowerCase());
        }
      }
    }
    expect(added).toBeGreaterThan(0);
  });

  test("rating reasons are true and name only a clearly higher rating; form is the recorded figures", () => {
    let gaps = 0;
    for (const option of squad) {
      for (const other of squad) {
        if (option === other) continue;
        for (const reason of selectionAdvice({ option, other, restOfXi: [], form: null })) {
          if (reason.id === "RATING_GAP") gaps += 1;
          if (reason.id !== "RATING_GAP") continue;
          expect(reason.kind).toBe("RATING");
          const [mine, theirs] = numbers(reason.text).map(Number);
          const basis = style(option).basis[0]!;
          expect(mine).toBe(Math.round(option.skills[basis.skill]));
          expect(theirs).toBe(Math.round(other.skills[basis.skill]));
          expect(mine! - theirs!).toBeGreaterThanOrEqual(5);
        }
      }
    }
    expect(gaps).toBeGreaterThan(0);
    const form = playerForm([], "nobody");
    expect(selectionAdvice({ option: squad[0]!, other: squad[1]!, restOfXi: [], form: { ...form, entries: [], discipline: "BATTING", text: "12, 40*, 7" } }).find((r) => r.id === "SEASON_FORM")).toEqual({
      kind: "RECORD", id: "SEASON_FORM", text: "This season, latest scores, oldest first: 12, 40*, 7.",
    });
  });

  test("an only spinner is named; at most three reasons; no reason claims an outcome", () => {
    const spinner = squad.find((p) => (p.role === "BOWLER" || p.role === "ALLROUNDER") && p.bowlingStyle && /SPIN|LEFT/.test(p.bowlingStyle))!;
    const pacer = squad.find((p) => p.role === "BOWLER" && (p.bowlingStyle === "FAST" || p.bowlingStyle === "MEDIUM"))!;
    const reasons = selectionAdvice({ option: spinner, other: pacer, restOfXi: [pacer], form: null });
    expect(reasons).toContainEqual({ kind: "SUGGESTION", id: "ONLY_SPINNER", text: "Would be the XI's only spin bowler." });
    for (const option of squad) {
      for (const other of squad) {
        const all = selectionAdvice({ option, other, restOfXi: xi, form: { ...playerForm([], "x"), discipline: "BATTING", text: "1, 2" } });
        expect(all.length).toBeLessThanOrEqual(3);
        for (const r of all) expect(r.text).not.toMatch(/\b(will|wins?|win|more likely|improves?|better chance|guarantee)\b/i);
      }
    }
    expect(SELECTION_ADVICE_NOTE).toMatch(/not a prediction/);
    // A bowler's form leads with figures even when he also batted as often.
    const entries = [{ fixtureId: "f1", roundNumber: 1, batted: true, runs: 3, ballsFaced: 4, notOut: false, bowled: true, wickets: 5, runsConceded: 7 }];
    const form = selectionAdvice({ option: pacer, other: spinner, restOfXi: [], form: { entries, trend: null, discipline: "BATTING", text: "3" } }).find((r) => r.id === "SEASON_FORM");
    expect(form?.text).toBe("This season, latest figures, oldest first: 5/7.");
  });
});

describe("determinism and isolation", () => {
  test("never calls Math.random or reads the clock, and gives the same answer twice", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const squad = world.players.slice(0, 20).map((p) => ({ playerId: p.playerId, name: p.name, role: p.role, bowlingStyle: p.bowlingStyle, skills: p.skills.T20! }));
    const a = squad.map((o, i) => selectionAdvice({ option: o, other: squad[(i + 1) % 20]!, restOfXi: squad.slice(0, 9), form: null }));
    const b = squad.map((o, i) => selectionAdvice({ option: structuredClone(o), other: structuredClone(squad[(i + 1) % 20]!), restOfXi: structuredClone(squad.slice(0, 9)), form: null }));
    expect(a).toEqual(b);
    matchIntroductionV2("A", anchor, "BATTER", careerIntroSummary("g", ["p"], []).players.p!, true);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  test("the module imports nothing from the simulation, its random stream or the probability tables", () => {
    const text = readFileSync(resolve(root, "packages/projections/src/player-identity-v2.ts"), "utf8");
    const imports = [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["@lcxxvi/contracts", "./player-identity.js", "./player-identity-v1.js"]);
    expect(text).toMatch(/^import type \{ HistoricalPlayerRecord \} from "@lcxxvi\/contracts";/m);
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/Math\.random|Date\.now|new Date|crypto\./);
  });
});
