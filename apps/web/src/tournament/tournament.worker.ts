import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import { competitionById } from "@lcxxvi/data";
import { viewTournament } from "@lcxxvi/projections";
import { TournamentResultSchema, type TournamentResult } from "@lcxxvi/contracts";
import { playTournamentFixture } from "./runner.js";

/**
 * Stage 15 (owner decision 11a): simulates tournament fixtures off the page's main thread, so the screen stays
 * responsive. The page sends the competition id, the run's id and seed, and the results so far; the worker plays the
 * next fixture and replies with its result. It keeps no state between messages.
 */
export type TournamentWorkerRequest = { id: number; competitionId: string; runId: string; runSeed: string; results: TournamentResult[] };
export type TournamentWorkerResponse = { id: number; result: TournamentResult | null; error: string | null };

const worldBytes = new TextEncoder().encode(worldText);
const teamNames = Object.fromEntries((JSON.parse(worldText) as { teams: { teamId: string; name: string }[] }).teams.map((t) => [t.teamId, t.name]));

self.onmessage = (event: MessageEvent<TournamentWorkerRequest>) => {
  const request = event.data;
  let response: TournamentWorkerResponse;
  try {
    const competition = competitionById(request.competitionId);
    if (!competition) throw new Error("Unknown tournament.");
    const results = request.results.map((r) => TournamentResultSchema.parse(r));
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
