import worldText from "../../../../packages/data/worlds/fictional-eight-01.json?raw";
import worldManifest from "../../../../packages/data/worlds/fictional-eight-01.manifest.json" with { type: "json" };
import type { ExhibitionRuleOptions, RainCommand } from "@lcxxvi/simulation";
import { createRainRuntime, type RainOpenMatch } from "./rain-runtime.js";

/**
 * Stage 14 rain-affected exhibitions: the engine runs here, off the page's main thread. The page keeps the stored record;
 * the worker replays any record it has not got open, so a reload or a second tab is always checked on the engine.
 */
export type RainWorkerRequest =
  | { id: number; type: "START"; format: "T20" | "ODI"; gameId: string; matchId: string; seed: string; groundId: string; teamIds: [string, string]; rules: ExhibitionRuleOptions }
  | { id: number; type: "OPEN"; record: unknown }
  | { id: number; type: "COMMAND"; record: unknown; command: RainCommand }
  | { id: number; type: "AI"; record: unknown; playerTeamId: string }
  | { id: number; type: "SIMULATE"; record: unknown };
export type RainWorkerResponse = { id: number; match: RainOpenMatch | null; error: string | null };

const runtime = createRainRuntime(new TextEncoder().encode(worldText), worldManifest);

self.onmessage = (event: MessageEvent<RainWorkerRequest>) => {
  const request = event.data;
  let response: RainWorkerResponse;
  try {
    const match =
      request.type === "START"
        ? runtime.start(request)
        : request.type === "OPEN"
          ? runtime.open(request.record)
          : request.type === "COMMAND"
            ? runtime.command(request.record, request.command)
            : request.type === "AI"
              ? runtime.aiDecisions(request.record, request.playerTeamId)
              : runtime.simulateToEnd(request.record);
    response = { id: request.id, match, error: null };
  } catch (error) {
    response = { id: request.id, match: null, error: error instanceof Error ? error.message : "The rain match could not continue." };
  }
  (self as unknown as Worker).postMessage(response);
};
