import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, UserCompetitionSchema, UserTourSchema, type WorldPack } from "@lcxxvi/contracts";
import { viewTournament } from "@lcxxvi/projections";
import {
  createRosterODISession,
  createRosterT20Session,
  executeRosterODICommand,
  executeRosterT20Command,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  rehydrateRosterODISession,
  rehydrateRosterT20Session,
  type ODISession,
  type T20Session,
} from "@lcxxvi/simulation";
import { generatedRunRoster, generatedSelections, playGeneratedFixture, tourCompetition } from "../../apps/web/src/tournament/generated-roster.js";
import { auctionSquads, createAuction, decideLot, awaitingPlayer } from "../../apps/web/src/tournament/auction.js";
import { fixtureSeed, tournamentMatchIdentity, tournamentResultFromSession } from "../../apps/web/src/tournament/runner.js";

// Owner direction, 18 November 2026: tour and auction matches are playable by the user. A played match runs on the
// run's generated roster with the same XIs the simulator fields, is saved with that roster, and is recorded by
// rehydrating it from the save.
const root = resolve(import.meta.dirname, "../..");
const world = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json"), "utf8")) as WorldPack;
const tour = UserTourSchema.parse({ tourId: "user-tour-play", title: "Vale Tour", format: "T20", hostTeamId: "team-02", touringName: "Wanderers XI", matches: 3, groundIds: ["ground-02"] });

/** Plays a fixture the way the match screen does: a roster session from the launch, then a save round trip. */
function playAsUser(format: "T20" | "ODI", roster: ReturnType<typeof generatedRunRoster>, fixture: Parameters<typeof generatedSelections>[2] & { fixtureId: string; matchNumber: number; groundId: string }, runId: string, runSeed: string) {
  const identity = tournamentMatchIdentity(runId, fixture.matchNumber);
  const request = { ...identity, seed: fixtureSeed(runSeed, fixture.fixtureId), format, selection: { groundId: fixture.groundId, teams: generatedSelections(world, roster.squads, fixture) } };
  // Through JSON, as the launch crosses sessionStorage and the worker message.
  const pack = JSON.parse(JSON.stringify(roster.pack));
  let saved: unknown;
  if (format === "T20") {
    let s = createRosterT20Session(pack, request);
    while (s.core.phase !== "COMPLETE") s = executeRosterT20Command(s, fixtureAutopilotStep(s as unknown as T20Session)).session;
    saved = JSON.parse(JSON.stringify(s));
    return rehydrateRosterT20Session(saved, pack) as unknown as T20Session;
  }
  let s = createRosterODISession(pack, request);
  while (s.core.phase !== "COMPLETE") s = executeRosterODICommand(s, odiFixtureAutopilotStep(s as unknown as ODISession)).session;
  saved = JSON.parse(JSON.stringify(s));
  return rehydrateRosterODISession(saved, pack) as unknown as ODISession;
}

describe("Stage 15 playable tour and auction matches", () => {
  it("rebuilds the same roster from the same tour or auction, and a different one for another run", () => {
    expect(canonicalJson(generatedRunRoster(world, { tour }).pack)).toBe(canonicalJson(generatedRunRoster(world, { tour }).pack));
    const squads = generatedRunRoster(world, { tour }).squads;
    const a = generatedRunRoster(world, { runId: "run-a", squads }).pack;
    expect(canonicalJson(generatedRunRoster(world, { runId: "run-a", squads }).pack)).toBe(canonicalJson(a));
    expect(canonicalJson(generatedRunRoster(world, { runId: "run-b", squads }).pack)).not.toBe(canonicalJson(a));
  });

  it("a tour match played on the match screen records the same result as the simulator", () => {
    const competition = tourCompetition(tour);
    const roster = generatedRunRoster(world, { tour });
    const fixture = viewTournament(competition, []).next!;
    const teamName = (id: string) => roster.squads.find((s) => s.teamId === id)!.name;
    const session = playAsUser("T20", roster, fixture, "run-play", "seed-play");
    const played = tournamentResultFromSession({ competition, fixture, runId: "run-play", runSeed: "seed-play", session, superOverWinnerTeamId: null, teamName });
    const simulated = playGeneratedFixture({ world, pack: roster.pack, squads: roster.squads, competition, fixture, runId: "run-play", runSeed: "seed-play", teamName });
    expect(played).toEqual(simulated);
    expect(played.resultText).toContain("Wanderers XI");
  });

  it("an auctioned one-day match played by the user is recorded, and a match from another run is refused", () => {
    const competition = UserCompetitionSchema.parse({
      competitionId: "user-play-odi",
      title: "Auction Cup",
      format: "ODI",
      sourceType: "USER_AUTHORED",
      worldPackId: "fictional-eight-01",
      teamIds: ["team-01", "team-02", "team-03"],
      groundIds: ["ground-01"],
      structure: { kind: "ROUND_ROBIN", legs: 1, finalTopTwo: false },
      points: { win: 2, tie: 1, loss: 0 },
      summary: "A one-day round robin for 3 teams.",
    });
    let state = createAuction(world, competition, "auction-play", "team-01");
    while (awaitingPlayer(world, state)) state = decideLot(world, state, { kind: "AUTO" });
    const roster = generatedRunRoster(world, { runId: "run-odi", squads: auctionSquads(world, state) });
    const fixture = viewTournament(competition, []).next!;
    const session = playAsUser("ODI", roster, fixture, "run-odi", "seed-odi");
    const result = tournamentResultFromSession({ competition, fixture, runId: "run-odi", runSeed: "seed-odi", session, superOverWinnerTeamId: null, teamName: (id) => id });
    expect(result.fixtureId).toBe(fixture.fixtureId);
    expect(() => tournamentResultFromSession({ competition, fixture, runId: "run-other", runSeed: "seed-odi", session, superOverWinnerTeamId: null, teamName: (id) => id })).toThrow("TOURNAMENT_MATCH_MISMATCH");
  }, 120_000);
});
