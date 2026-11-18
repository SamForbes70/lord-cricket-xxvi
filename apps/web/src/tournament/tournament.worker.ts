import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { viewTournament } from "@lcxxvi/projections";
import { CompetitionSchema, TournamentResultSchema, UserTourSchema, type StagedRosterPack, type TournamentResult, type WorldPack } from "@lcxxvi/contracts";
import { playTournamentFixture } from "./runner.js";
import { generatedRosterPack, playGeneratedFixture, tourCompetition, tourSquads, type GeneratedSquad } from "./generated-roster.js";

/**
 * Stage 15 (owner decision 11a): simulates tournament fixtures off the page's main thread, so the screen stays
 * responsive. The page sends the competition (curated or user-authored; checked here against its schema), the run's id
 * and seed, and the results so far; the worker plays the next fixture and replies with its result. It keeps no state
 * between messages.
 */
/** For a tour (owner decision A1a), `tour` holds its choices and `competition` is ignored: the series is derived from it. */
export type TournamentWorkerRequest = { id: number; competition: unknown; tour?: unknown; runId: string; runSeed: string; results: TournamentResult[] };
export type TournamentWorkerResponse = { id: number; result: TournamentResult | null; error: string | null };

const worldBytes = new TextEncoder().encode(worldText);
const world = JSON.parse(worldText) as WorldPack;
const teamNames = Object.fromEntries(world.teams.map((t) => [t.teamId, t.name]));
/** Generated rosters are rebuilt from the world and a tour's choices; the last one is kept for the next fixture. */
let cachedTour: { key: string; pack: StagedRosterPack; squads: GeneratedSquad[] } | null = null;

self.onmessage = (event: MessageEvent<TournamentWorkerRequest>) => {
  const request = event.data;
  let response: TournamentWorkerResponse;
  try {
    const results = request.results.map((r) => TournamentResultSchema.parse(r));
    if (request.tour !== undefined) {
      const tour = UserTourSchema.parse(request.tour);
      const competition = tourCompetition(tour);
      const next = viewTournament(competition, results).next;
      if (!next) throw new Error("The tour is already finished.");
      const key = JSON.stringify(tour);
      if (cachedTour?.key !== key) {
        const squads = tourSquads(world, tour);
        cachedTour = { key, squads, pack: generatedRosterPack(world, tour.tourId, squads) };
      }
      const squads = cachedTour.squads;
      const result = playGeneratedFixture({
        world,
        pack: cachedTour.pack,
        squads,
        competition,
        fixture: next,
        runId: request.runId,
        runSeed: request.runSeed,
        teamName: (id) => squads.find((s) => s.teamId === id)?.name ?? teamNames[id] ?? id,
      });
      (self as unknown as Worker).postMessage({ id: request.id, result, error: null } satisfies TournamentWorkerResponse);
      return;
    }
    const parsed = CompetitionSchema.safeParse(request.competition);
    if (!parsed.success) throw new Error("Unknown tournament.");
    const competition = parsed.data;
    const next = viewTournament(competition, results).next;
    if (!next) throw new Error("The tournament is already finished.");
    const result = playTournamentFixture({
      competition,
      fixture: next,
      runId: request.runId,
      runSeed: request.runSeed,
      worldBytes,
      worldManifest,
      teamName: (id) => teamNames[id] ?? id,
    });
    response = { id: request.id, result, error: null };
  } catch (error) {
    response = { id: request.id, result: null, error: error instanceof Error ? error.message : "The match could not be played." };
  }
  (self as unknown as Worker).postMessage(response);
};
