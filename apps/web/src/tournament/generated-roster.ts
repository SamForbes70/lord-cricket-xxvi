import type { Competition, StagedRosterPack, TournamentFixture, TournamentResult, UserTour, WorldPack } from "@lcxxvi/contracts";
import { RULE_MANIFESTS, SYNTHETIC_ALPHA_PACK, isBowlingCapable } from "@lcxxvi/data";
import {
  createRosterODISession,
  createRosterT20Session,
  executeRosterODICommand,
  executeRosterT20Command,
  createStagedRosterPack,
  fixtureAutopilotStep,
  odiFixtureAutopilotStep,
  type ODISession,
  type RosterODISession,
  type RosterT20Session,
  type T20Session,
} from "@lcxxvi/simulation";
import { fixtureSeed, tournamentMatchIdentity, tournamentResultFromSession } from "./runner.js";

/**
 * Stage 15 sides that are not one of the world's eight clubs (owner decisions A1a and A2a, 18 November 2026).
 *
 * The frozen match setup only accepts a club's own squad. A touring XI mixes players from seven clubs, so its matches
 * run through the game's roster-pack path instead: a small roster is generated from the fictional world, holding just
 * the sides in the match, and played on the same frozen T20 and one-day rules, generator and scoring kernel. Nothing
 * here is stored: the roster is rebuilt from the world and the tour's choices whenever it is needed.
 */

type Player = WorldPack["players"][number];
export type GeneratedSquad = { teamId: string; name: string; colours: [string, string]; squadIds: string[] };

const TOURING_COLOURS: [string, string] = ["#1F2937", "#E5E7EB"];

/** The touring side's team id for a tour: unique to the tour, so names never clash between tours. */
export function touringTeamId(tour: Pick<UserTour, "tourId">): string {
  return `xi-${tour.tourId.slice("user-tour-".length)}`;
}

const bySkill = (score: (p: Player) => number) => (a: Player, b: Player) => score(b) - score(a) || (a.playerId < b.playerId ? -1 : 1);

/**
 * The touring XI (owner decision A2a): from every club except the host, by a fixed rating rule.
 * - The keeper with the best keeping plus batting (timing, defence).
 * - The six bowling-capable players with the best control plus movement (six, like the clubs' suggested XIs, so a
 *   person choosing bowlers can always finish an innings).
 * - The four other players with the best batting (timing, power, defence, rotation).
 * Ties go to the lower player id. The captain is the best batter.
 */
export function touringXI(world: WorldPack, hostTeamId: string, format: "T20" | "ODI"): { squadIds: string[]; captainId: string; keeperId: string } {
  const host = world.teams.find((t) => t.teamId === hostTeamId);
  if (!host) throw new Error("Unknown host team.");
  const hostIds = new Set(host.squadIds);
  const pool = world.players.filter((p) => !hostIds.has(p.playerId));
  const s = (p: Player) => p.skills[format];
  const batting = (p: Player) => s(p).timing + s(p).power + s(p).defence + s(p).rotation;
  const keeper = pool.filter((p) => p.role === "KEEPER").sort(bySkill((p) => s(p).keeping + s(p).timing + s(p).defence))[0];
  if (!keeper) throw new Error("No keeper is available for the touring side.");
  const bowlers = pool.filter((p) => isBowlingCapable(p) && p.playerId !== keeper.playerId).sort(bySkill((p) => s(p).control + s(p).movement)).slice(0, 6);
  const chosen = new Set([keeper.playerId, ...bowlers.map((p) => p.playerId)]);
  const batters = pool.filter((p) => !chosen.has(p.playerId) && p.role !== "KEEPER").sort(bySkill(batting)).slice(0, 4);
  if (bowlers.length < 6 || batters.length < 4) throw new Error("Not enough players for a touring side.");
  return { squadIds: [...batters, keeper, ...bowlers].map((p) => p.playerId), captainId: batters[0]!.playerId, keeperId: keeper.playerId };
}

/** The XI a squad fields: the keeper, six bowling-capable players, then the rest in squad order (the clubs' suggested XI rule). */
export function squadXI(world: WorldPack, squadIds: readonly string[], captainId?: string): { playerIds: string[]; captainId: string; keeperId: string } {
  const players = squadIds.map((id) => world.players.find((p) => p.playerId === id)!);
  const keeper = players.find((p) => p.role === "KEEPER");
  if (!keeper) throw new Error("A squad needs a keeper.");
  const bowlers = players.filter((p) => p.playerId !== keeper.playerId && isBowlingCapable(p)).slice(0, 6);
  const xi = [keeper, ...bowlers, ...players.filter((p) => p !== keeper && !bowlers.includes(p))].slice(0, 11);
  const ids = xi.map((p) => p.playerId);
  return { playerIds: ids, captainId: captainId && ids.includes(captainId) ? captainId : ids[0]!, keeperId: keeper.playerId };
}

/** A roster pack holding just these squads, built from the fictional world through the normal roster checks. */
export function generatedRosterPack(world: WorldPack, sourceId: string, squads: readonly GeneratedSquad[]): StagedRosterPack {
  const ids = new Set(squads.flatMap((s) => s.squadIds));
  const players = world.players
    .filter((p) => ids.has(p.playerId))
    .map((p) => {
      const copy: Partial<Player> = { ...p };
      delete copy.provenance;
      return copy;
    });
  const source = {
    version: "LC_ROSTER_IMPORT_V1",
    sourceId,
    world: {
      packId: world.packId,
      schemaVersion: world.schemaVersion,
      provenance: world.provenance,
      rulesIds: world.rulesIds,
      grounds: world.grounds,
      teams: squads.map((s) => ({ teamId: s.teamId, name: s.name, squadIds: s.squadIds, colours: s.colours })),
      players,
    },
  };
  return createStagedRosterPack(
    JSON.stringify(source),
    RULE_MANIFESTS.map((r) => r.rulesId),
    SYNTHETIC_ALPHA_PACK.manifest.variationIds,
  );
}

/** The two squads of a tour: the host club's own squad, and the touring XI. */
export function tourSquads(world: WorldPack, tour: UserTour): [GeneratedSquad, GeneratedSquad] {
  const host = world.teams.find((t) => t.teamId === tour.hostTeamId);
  if (!host) throw new Error("Unknown host team.");
  const touring = touringXI(world, tour.hostTeamId, tour.format);
  return [
    { teamId: host.teamId, name: host.name, colours: [host.colours[0]!, host.colours[1]!], squadIds: [...host.squadIds] },
    { teamId: touringTeamId(tour), name: tour.touringName, colours: TOURING_COLOURS, squadIds: touring.squadIds },
  ];
}

/** The series a tour plays, as an ordinary user-authored competition. */
export function tourCompetition(tour: UserTour): Competition {
  return {
    competitionId: tour.tourId,
    title: tour.title,
    format: tour.format,
    sourceType: "USER_AUTHORED",
    worldPackId: "fictional-eight-01",
    teamIds: [tour.hostTeamId, touringTeamId(tour)],
    groundIds: [...tour.groundIds],
    structure: { kind: "SERIES", matches: tour.matches },
    points: { win: 2, tie: 1, loss: 0 },
    summary: `${tour.touringName}, picked from the other seven clubs, tour for a ${tour.matches}-match ${tour.format === "T20" ? "T20" : "one-day"} series.`,
  };
}

/** The two XIs a fixture between generated squads fields, home first (the same rule whether simulated or played). */
export function generatedSelections(world: WorldPack, squads: readonly GeneratedSquad[], fixture: Pick<TournamentFixture, "homeTeamId" | "awayTeamId">) {
  const select = (teamId: string) => {
    const squad = squads.find((s) => s.teamId === teamId);
    if (!squad) throw new Error("TOURNAMENT_TEAM_UNKNOWN");
    return { teamId, ...squadXI(world, squad.squadIds) };
  };
  return [select(fixture.homeTeamId), select(fixture.awayTeamId)] as [ReturnType<typeof select>, ReturnType<typeof select>];
}

/**
 * The generated roster a tour or auctioned run plays with. The source id is fixed by the tour or run, so the same
 * choices always give the same pack: a played match is checked against it before its result is recorded.
 */
export function generatedRunRoster(world: WorldPack, input: { tour: UserTour } | { runId: string; squads: readonly GeneratedSquad[] }): { pack: StagedRosterPack; squads: GeneratedSquad[] } {
  if ("tour" in input) {
    const squads = tourSquads(world, input.tour);
    return { squads, pack: generatedRosterPack(world, input.tour.tourId, squads) };
  }
  const squads = input.squads.map((s) => ({ ...s, colours: [s.colours[0], s.colours[1]] as [string, string], squadIds: [...s.squadIds] }));
  return { squads, pack: generatedRosterPack(world, `auction-${input.runId}`, squads) };
}

/** Simulates one fixture between generated squads, both captains on the fixture autopilot. */
export function playGeneratedFixture(input: {
  world: WorldPack;
  pack: StagedRosterPack;
  squads: readonly GeneratedSquad[];
  competition: Competition;
  fixture: TournamentFixture;
  runId: string;
  runSeed: string;
  teamName: (teamId: string) => string;
}): TournamentResult {
  const { fixture, competition } = input;
  const identity = tournamentMatchIdentity(input.runId, fixture.matchNumber);
  const request = {
    gameId: identity.gameId,
    matchId: identity.matchId,
    seed: fixtureSeed(input.runSeed, fixture.fixtureId),
    format: competition.format,
    selection: { groundId: fixture.groundId, teams: generatedSelections(input.world, input.squads, fixture) },
  };
  let session: T20Session | ODISession;
  if (competition.format === "T20") {
    let s: RosterT20Session = createRosterT20Session(input.pack, request);
    while (s.core.phase !== "COMPLETE") s = executeRosterT20Command(s, fixtureAutopilotStep(s as unknown as T20Session)).session;
    session = s as unknown as T20Session;
  } else {
    let s: RosterODISession = createRosterODISession(input.pack, request);
    while (s.core.phase !== "COMPLETE") s = executeRosterODICommand(s, odiFixtureAutopilotStep(s as unknown as ODISession)).session;
    session = s as unknown as ODISession;
  }
  // No super over between generated squads: a tied league match is a tie, and a tied knockout match goes to the
  // higher-placed side (knockoutWinner).
  return tournamentResultFromSession({ competition, fixture, runId: input.runId, runSeed: input.runSeed, session, superOverWinnerTeamId: null, teamName: input.teamName });
}
