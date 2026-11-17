import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CustomCompetitionSchema, TournamentRunSchema, type CustomCompetition, type TournamentResult } from "@lcxxvi/contracts";
import { TOURNAMENT_PACK, competitionById } from "@lcxxvi/data";
import { computeStandings, roundRobinPairings, viewTournament } from "@lcxxvi/projections";
import { playTournamentFixture } from "../../apps/web/src/tournament/runner.js";

// Stage 15 first slice (owner decision 17 November 2026, answer 5a): fictional custom tournaments.
const root = resolve(import.meta.dirname, "../..");
const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
const names = Object.fromEntries((JSON.parse(new TextDecoder().decode(worldBytes)) as { teams: { teamId: string; name: string }[] }).teams.map((t) => [t.teamId, t.name]));

function playOut(c: CustomCompetition, seed: string): TournamentResult[] {
  const results: TournamentResult[] = [];
  for (let guard = 0; guard < 64; guard += 1) {
    const view = viewTournament(c, results);
    if (!view.next) break;
    results.push(playTournamentFixture({ competition: c, fixture: view.next, runId: "test-run", runSeed: seed, worldBytes, worldManifest: manifest, teamName: (id) => names[id] ?? id }));
  }
  return results;
}

function synthetic(fixtureId: string, home: string, away: string, homeRuns: number, awayRuns: number, extra: Partial<TournamentResult> = {}): TournamentResult {
  const tie = homeRuns === awayRuns;
  return {
    fixtureId, homeTeamId: home, awayTeamId: away, resultKind: tie ? "TIE" : "WIN",
    winnerTeamId: tie ? null : homeRuns > awayRuns ? home : away, superOverWinnerTeamId: null,
    homeRuns, homeWickets: 5, homeLegalBalls: 120, awayRuns, awayWickets: 5, awayLegalBalls: 120,
    resultText: "synthetic", lastEventHash: "a".repeat(64), ...extra,
  };
}

describe("Stage 15 tournament rules", () => {
  it("ships a valid curated pack covering groups and knockout, round robins with and without a final, and a series", () => {
    expect(TOURNAMENT_PACK.competitions.map((c) => c.structure.kind).sort()).toEqual(["GROUPS_KNOCKOUT", "ROUND_ROBIN", "ROUND_ROBIN", "SERIES"]);
    for (const c of TOURNAMENT_PACK.competitions) expect(competitionById(c.competitionId)).toBe(c);
    const base = TOURNAMENT_PACK.competitions[0]!;
    expect(() => CustomCompetitionSchema.parse({ ...base, teamIds: [...base.teamIds, "team-01"] })).toThrow("COMPETITION_DUPLICATE_TEAM");
    expect(() => CustomCompetitionSchema.parse({ ...base, structure: { kind: "SERIES", matches: 3 } })).toThrow("SERIES_NEEDS_TWO_TEAMS");
    expect(() => CustomCompetitionSchema.parse({ ...base, structure: { kind: "GROUPS_KNOCKOUT", groups: [["team-01", "team-02", "team-03"], ["team-04", "team-05", "team-06"]] } })).toThrow("GROUPS_MUST_PARTITION_TEAMS");
  });

  it("pairs every team with every other the right number of times", () => {
    for (const teams of [["a", "b", "c"], ["a", "b", "c", "d"], ["a", "b", "c", "d", "e"]]) {
      for (const legs of [1, 2] as const) {
        const pairs = roundRobinPairings(teams, legs);
        expect(pairs).toHaveLength((teams.length * (teams.length - 1) / 2) * legs);
        for (const x of teams) for (const y of teams) if (x < y) {
          expect(pairs.filter(([h, a]) => (h === x && a === y) || (h === y && a === x))).toHaveLength(legs);
        }
      }
    }
  });

  it("orders standings by points, wins, then net run rate, charging a bowled-out side its full quota", () => {
    const c = competitionById("northern-t20-league")!;
    const fx = viewTournament(c, []).fixtures.slice(0, 2);
    // Two wins of equal points; the bigger margin gives the better net run rate.
    const r1 = synthetic(fx[0]!.fixtureId, fx[0]!.homeTeamId, fx[0]!.awayTeamId, 180, 100, { awayWickets: 10, awayLegalBalls: 60 });
    const r2 = synthetic(fx[1]!.fixtureId, fx[1]!.homeTeamId, fx[1]!.awayTeamId, 150, 140);
    const rows = computeStandings(c, c.teamIds, fx, [r1, r2]);
    expect(rows[0]!.teamId).toBe(fx[0]!.homeTeamId);
    expect(rows[0]!.ballsBowled).toBe(120); // bowled out in 60 balls, charged 120
    expect(rows[0]!.netRunRate).toBe(4);
  });

  it("settles a tied knockout match by the super-over winner, else the higher-placed side", () => {
    const c = competitionById("harbour-tri-series")!;
    let results: TournamentResult[] = [];
    for (const f of viewTournament(c, results).fixtures) results.push(synthetic(f.fixtureId, f.homeTeamId, f.awayTeamId, 200, 150));
    const final = viewTournament(c, results).next!;
    expect(final.stage).toBe("FINAL");
    const top = viewTournament(c, results).tables[0]!.rows[0]!.teamId;
    const tiedNoWinner = [...results, synthetic(final.fixtureId, final.homeTeamId, final.awayTeamId, 180, 180)];
    expect(viewTournament(c, tiedNoWinner).outcome).toEqual({ status: "CHAMPION", teamId: top, how: "Won the final" });
    const tiedSuperOver = [...results, synthetic(final.fixtureId, final.homeTeamId, final.awayTeamId, 180, 180, { superOverWinnerTeamId: final.awayTeamId })];
    expect(viewTournament(c, tiedSuperOver).outcome).toEqual({ status: "CHAMPION", teamId: final.awayTeamId, how: "Won the final" });
    results = [];
  });

  it("ends a series once one side cannot be caught", () => {
    const c = competitionById("larchwood-westmere-series")!;
    const results: TournamentResult[] = [];
    for (let i = 0; i < 3; i += 1) {
      const f = viewTournament(c, results).next!;
      results.push(synthetic(f.fixtureId, f.homeTeamId, f.awayTeamId, f.homeTeamId === "team-07" ? 250 : 100, f.homeTeamId === "team-07" ? 100 : 250));
    }
    const view = viewTournament(c, results);
    expect(view.outcome).toEqual({ status: "CHAMPION", teamId: "team-07", how: "Series 3-0" });
    expect(view.next).toBeNull();
    expect(view.fixtures).toHaveLength(3);
  });
});

describe("Stage 15 tournaments on the real engines", () => {
  it("plays the Eight Nations Cup through groups, semi-finals and a final, deterministically", () => {
    const c = competitionById("eight-nations-cup")!;
    const results = playOut(c, "lc-tournament-test");
    const view = viewTournament(c, results);
    expect(results).toHaveLength(15);
    expect(view.fixtures.filter((f) => f.stage === "SEMI_FINAL")).toHaveLength(2);
    expect(view.fixtures.filter((f) => f.stage === "FINAL")).toHaveLength(1);
    expect(view.outcome.status).toBe("CHAMPION");
    const [a, b] = view.tables;
    const semis = view.fixtures.filter((f) => f.stage === "SEMI_FINAL");
    expect([semis[0]!.homeTeamId, semis[0]!.awayTeamId]).toEqual([a!.rows[0]!.teamId, b!.rows[1]!.teamId]);
    expect([semis[1]!.homeTeamId, semis[1]!.awayTeamId]).toEqual([b!.rows[0]!.teamId, a!.rows[1]!.teamId]);
    // Same seed, same tournament.
    const again = playOut(c, "lc-tournament-test");
    expect(again.map((r) => r.lastEventHash)).toEqual(results.map((r) => r.lastEventHash));
    expect(TournamentRunSchema.parse({ schemaId: "LC_TOURNAMENT_RUN_V1", runId: "test-run", competitionId: c.competitionId, competitionSha256: "b".repeat(64), seed: "lc-tournament-test", results }).results).toHaveLength(15);
  }, 120_000);

  it("plays a one-day tri-series and a one-day series to a result", () => {
    for (const id of ["harbour-tri-series", "larchwood-westmere-series"]) {
      const c = competitionById(id)!;
      const results = playOut(c, `lc-${id}`);
      const view = viewTournament(c, results);
      expect(view.outcome.status).not.toBe("IN_PROGRESS");
      for (const r of results) expect(r.homeLegalBalls).toBeLessThanOrEqual(300);
    }
  }, 120_000);
});
