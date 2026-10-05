import type {
  RandomService,
  MatchVersions,
  MatchState,
  DeliveryRecorded,
} from "@lcxxvi/contracts";
/** Reserved boundary. No model, sampler, fake outcome or match runner is supplied. */
export interface SimulationEngine {
  readonly versions: MatchVersions;
  readonly random: RandomService;
  nextDelivery(state: Readonly<MatchState>): DeliveryRecorded;
}

export * from "./determinism.js";
export * from "./probability.js";

export * from "./generator.js";
export * from "./world-setup.js";
export * from "./t20-match.js";

export * from "./odi-match.js";

export * from "./red-ball-match.js";

export * from "./red-ball-clock.js";

export * from "./season-scheduler.js";
