import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canCompleteBowling } from "@lcxxvi/ai";
import type { Player, WorldPack } from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS, T20_LEAGUE_COMPETITION, isBowlingCapable, suggestedEleven } from "@lcxxvi/data";
import {
  advanceCareerDayV2,
  canCompleteFixtureBowling,
  createCareerDayStateV2,
  createStagedRosterPack,
  createRosterCareerDayState,
  createT20CorpusRequest,
  createT20Session,
  executeT20Command,
  fixtureAutopilotStep,
  fixtureAutopilotStepV2,
  generateRosterSeasonSchedule,
  generateSeasonSchedule,
  projectT20Scorecard,
  seasonXIV2BattingScore,
  selectOffscreenFixtureTeams,
  selectOffscreenFixtureTeamsV2,
  selectRosterFixtureTeams,
  selectRosterFixtureTeamsV2,
  selectSeasonXIV2,
  validateT20MatchSetup,
  type SeasonXIV2Candidate,
  type T20Session,
} from "@lcxxvi/simulation";

const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(worldBytes.toString("utf8")) as WorldPack;
const worldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const baseSetup = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const byId = new Map(world.players.map((p) => [p.playerId, p]));
const squadOf = (teamId: string) => world.teams.find((t) => t.teamId === teamId)!.squadIds.map((id) => byId.get(id)!);
const neutral = { fatigueBp: 0, availability: "AVAILABLE" as const, battingReadiness: 0, bowlingReadiness: 0 };
const bowlingQuality = (p: Readonly<Player>) => p.skills.T20.control + p.skills.T20.movement + p.skills.T20.variation;

function frozenSeason() {
  const schedule = generateSeasonSchedule({
    scheduleVersion: "LC_T20_SEASON_SCHEDULE_V1", seasonId: "season-policy-v2", gameId: "career-policy-v2",
    competitionId: "LC_T20_LEAGUE_01", worldPackId: "fictional-eight-01", worldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    seasonSeed: "season-policy-v2-seed", startDate: "2027-01-03", teamIds: [...T20_LEAGUE_COMPETITION.teamIds],
    groundIds: [...T20_LEAGUE_COMPETITION.groundIds], homeGroundIds: { ...T20_LEAGUE_COMPETITION.homeGroundIds },
  });
  let careerState = createCareerDayStateV2({ careerId: "career-policy-v2", schedule });
  const round = schedule.fixtures.filter((f) => f.roundNumber === 1);
  while (careerState.currentDate < round[0]!.matchDayDate) careerState = advanceCareerDayV2(careerState).state;
  return { schedule, careerState, round };
}

/** The V2 XI rules: keeper, at least five non-keeper bowlers, specialist batters on top, order by batting value. */
function expectV2Shape(selection: { playerIds: string[]; keeperId: string }, players: Map<string, Readonly<Player>>) {
  const xi = selection.playerIds.map((id) => players.get(id)!);
  expect(xi).toHaveLength(11);
  expect(new Set(selection.playerIds).size).toBe(11);
  expect(xi.find((p) => p.playerId === selection.keeperId)?.role).toBe("KEEPER");
  expect(xi.filter((p) => p.playerId !== selection.keeperId && isBowlingCapable(p)).length).toBeGreaterThanOrEqual(5);
  const batting = xi.map((player) => seasonXIV2BattingScore({ player, condition: neutral }));
  expect(batting).toEqual([...batting].sort((a, b) => b - a));
  const specialists = xi.filter((p) => p.role === "BATTER");
  expect(specialists.length).toBeGreaterThanOrEqual(3);
  expect(xi.slice(0, specialists.length).every((p) => p.role === "BATTER")).toBe(true);
}

function runToCompletion(request: unknown, step: (s: T20Session) => ReturnType<typeof fixtureAutopilotStep>) {
  let session = createT20Session(validateT20MatchSetup(request, worldBytes, worldManifest));
  for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
    if (n > 2000) throw new Error("NO_PROGRESS");
    session = executeT20Command(session, step(session)).session;
  }
  return session;
}

describe("career fixture policy V2: match-day XI (LC_SEASON_XI_BASELINE_V2)", () => {
  it("applies the approved stage A rule: with neutral condition it is exactly suggestedEleven", () => {
    for (const team of world.teams) {
      const squad = squadOf(team.teamId);
      const v2 = selectSeasonXIV2(team.teamId, squad.map((player) => ({ player, condition: neutral })));
      expect(v2).toEqual({ teamId: team.teamId, ...suggestedEleven(squad, "T20") });
      expectV2Shape(v2, byId);
    }
  });

  it("picks keeper, five or more bowlers and specialist batters on top for every side of a frozen-world career round", () => {
    const { schedule, careerState, round } = frozenSeason();
    for (const fixture of round) {
      const input = { schedule, careerState, fixtureId: fixture.fixtureId, worldBytes, worldManifest };
      const v1 = selectOffscreenFixtureTeams(input);
      const v2 = selectOffscreenFixtureTeamsV2(input);
      for (const [index, team] of v2.entries()) {
        expect(team.teamId).toBe(v1[index]!.teamId);
        expectV2Shape(team, byId);
        // The defect V2 fixes: V1 fields fewer specialist batters than V2 and never opens with one.
        const batters = (ids: readonly string[]) => ids.filter((id) => byId.get(id)!.role === "BATTER").length;
        expect(batters(v1[index]!.playerIds)).toBeLessThan(batters(team.playerIds));
        expect(byId.get(v1[index]!.playerIds[0]!)!.role).not.toBe("BATTER");
      }
    }
  });

  it("selects the same way for a roster career and leaves the V1 roster selector as it was", () => {
    const players = world.players.map((player) => Object.fromEntries(Object.entries(structuredClone(player)).filter(([key]) => key !== "provenance")));
    const pack = createStagedRosterPack(JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "policy-v2", world: { ...world, players } }), world.rulesIds, ["stock"]);
    const schedule = generateRosterSeasonSchedule(pack, { seasonId: "season", gameId: "game", seasonSeed: "seed", startDate: "2027-01-03" });
    const state = createRosterCareerDayState("career", schedule, pack);
    const fixture = schedule.fixtures[0]!;
    const packPlayers = new Map(pack.world.players.map((p) => [p.playerId, p as Readonly<Player>]));
    const v2 = selectRosterFixtureTeamsV2(pack, schedule, state, fixture.fixtureId);
    for (const team of v2) expectV2Shape(team, packPlayers);
    const v1 = selectRosterFixtureTeams(pack, schedule, state, fixture.fixtureId);
    const batters = (ids: readonly string[]) => ids.filter((id) => packPlayers.get(id)!.role === "BATTER").length;
    for (const [index, team] of v1.entries()) expect(batters(team.playerIds)).toBeLessThan(batters(v2[index]!.playerIds));
  }, 30_000);

  it("leaves out unavailable players, weighs readiness, breaks ties on fatigue then playerId, and ignores squad order", () => {
    const team = world.teams[0]!;
    const squad = squadOf(team.teamId);
    const candidates: SeasonXIV2Candidate[] = squad.map((player) => ({ player, condition: neutral }));
    const base = selectSeasonXIV2(team.teamId, candidates);
    expect(selectSeasonXIV2(team.teamId, [...candidates].reverse())).toEqual(base);

    const opener = base.playerIds[0]!;
    const without = selectSeasonXIV2(team.teamId, candidates.map((c) =>
      c.player.playerId === opener ? { ...c, condition: { ...c.condition, availability: "UNAVAILABLE" as const } } : c));
    expect(without.playerIds).not.toContain(opener);
    expectV2Shape(without, byId);

    const benchBatter = squad.filter((p) => p.role === "BATTER" && !base.playerIds.includes(p.playerId))
      .sort((a, b) => seasonXIV2BattingScore({ player: b, condition: neutral }) - seasonXIV2BattingScore({ player: a, condition: neutral }))[0]!;
    const lastBatter = base.playerIds.map((id) => byId.get(id)!).filter((p) => p.role === "BATTER").at(-1)!;
    const gap = seasonXIV2BattingScore({ player: lastBatter, condition: neutral }) - seasonXIV2BattingScore({ player: benchBatter, condition: neutral });
    if (gap < 24) {
      const ready = selectSeasonXIV2(team.teamId, candidates.map((c) =>
        c.player.playerId === benchBatter.playerId ? { ...c, condition: { ...c.condition, battingReadiness: 3 } }
          : c.player.playerId === lastBatter.playerId ? { ...c, condition: { ...c.condition, battingReadiness: -3 } } : c));
      expect(ready.playerIds).toContain(benchBatter.playerId);
    }

    const keeper = byId.get(base.keeperId)!;
    const twin = { ...keeper, playerId: "p000-twin" } as Player;
    const fresh = selectSeasonXIV2(team.teamId, [...candidates.map((c) => c.player.playerId === keeper.playerId ? { ...c, condition: { ...c.condition, fatigueBp: 500 } } : c), { player: twin, condition: neutral }]);
    expect(fresh.keeperId).toBe(twin.playerId);
    const tied = selectSeasonXIV2(team.teamId, [...candidates, { player: twin, condition: neutral }]);
    expect(tied.keeperId).toBe(twin.playerId < keeper.playerId ? twin.playerId : keeper.playerId);
  });

  it("refuses a side it cannot field instead of fielding an illegal one", () => {
    const team = world.teams[0]!;
    const squad = squadOf(team.teamId);
    expect(() => selectSeasonXIV2(team.teamId, squad.map((player) => ({ player, condition: { ...neutral, availability: player.role === "KEEPER" ? "UNAVAILABLE" : "AVAILABLE" } }))))
      .toThrow("LC_SEASON_XI_V2_NO_AVAILABLE_KEEPER");
    let kept = 0;
    expect(() => selectSeasonXIV2(team.teamId, squad.map((player) => {
      const out = isBowlingCapable(player) && ++kept > 4;
      return { player, condition: { ...neutral, availability: out ? "UNAVAILABLE" as const : "AVAILABLE" as const } };
    }))).toThrow("LC_SEASON_XI_V2_INSUFFICIENT_AVAILABLE_BOWLERS");
  });
});

describe("career fixture policy V2: bowling (LC_FIXTURE_CAPTAIN_V2)", () => {
  it("matches the ai package's canCompleteBowling on every small case", () => {
    for (let overs = 0; overs <= 12; overs += 1)
      for (let a = 0; a <= 4; a += 1) for (let b = 0; b <= 4; b += 1) for (let c = 0; c <= 4; c += 1)
        for (const previous of [null, "b0", "b1", "bx"]) {
          const bowlers = [{ playerId: "b0", oversLeft: a }, { playerId: "b1", oversLeft: b }, { playerId: "b2", oversLeft: c }];
          expect(canCompleteFixtureBowling(overs, bowlers, previous)).toBe(canCompleteBowling(overs, bowlers, previous));
        }
  });

  it("acts exactly as the V1 autopilot except when choosing a bowler", () => {
    const request = createT20CorpusRequest(corpus.cases[0], baseSetup, world);
    let session = createT20Session(validateT20MatchSetup(request, worldBytes, worldManifest));
    let bowlerChoices = 0;
    while (session.core.phase !== "COMPLETE") {
      const v1 = fixtureAutopilotStep(session);
      const v2 = fixtureAutopilotStepV2(session);
      if (v1.kind === "SET_BOWLER") {
        bowlerChoices += 1;
        expect({ ...v2, payload: { ...v2.payload, bowlerId: null } }).toEqual({ ...v1, payload: { ...v1.payload, bowlerId: null } });
      } else expect(v2).toEqual(v1);
      session = executeT20Command(session, v2).session;
    }
    expect(bowlerChoices).toBeGreaterThan(20);
  });

  // A sample of the frozen 100-seed corpus with V2 elevens: six bowlers as selected, and the hardest legal case, five
  // bowling-capable players and no spare. The corpus is run read-only; its own V1 checksums are not touched.
  for (const bowlersAvailable of [6, 5] as const) {
    it(`gives the best four bowlers full quotas and never strands an innings (${bowlersAvailable} bowlers)`, () => {
      let fullInnings = 0;
      for (const raw of corpus.cases.slice(0, 16)) {
        const request = createT20CorpusRequest(raw, baseSetup, world) as { selectedTeams: { teamId: string }[] };
        request.selectedTeams = request.selectedTeams.map((s) => {
          let bowlers = 0;
          return selectSeasonXIV2(s.teamId, squadOf(s.teamId).map((player) => {
            const out = isBowlingCapable(player) && ++bowlers > bowlersAvailable;
            return { player, condition: { ...neutral, availability: out ? "UNAVAILABLE" as const : "AVAILABLE" as const } };
          }));
        });
        const session = runToCompletion(request, fixtureAutopilotStepV2);
        const card = projectT20Scorecard(session);
        for (const innings of card.innings) {
          const xi = session.setup.teams.find((t) => t.teamId === innings.bowlingTeamId)!.xi;
          if (bowlersAvailable === 5) expect(xi.filter((p) => p.playerId !== session.setup.teams.find((t) => t.teamId === innings.bowlingTeamId)!.keeperId && isBowlingCapable(p))).toHaveLength(5);
          for (const line of Object.values(innings.bowling)) expect(line.legalBalls).toBeLessThanOrEqual(24);
          if (innings.legalBalls !== 120) continue;
          fullInnings += 1;
          const best = xi.filter(isBowlingCapable).sort((a, b) => bowlingQuality(b) - bowlingQuality(a) || (a.playerId < b.playerId ? -1 : 1)).slice(0, 4);
          for (const p of best) expect(innings.bowling[p.playerId]!.legalBalls).toBe(24);
        }
      }
      expect(fullInnings).toBeGreaterThan(8);
    }, 60_000);
  }
});
