import type { EventEnvelope, ID } from "@lcxxvi/contracts";
export interface ProjectionCursor {
  readonly gameId: ID;
  readonly matchId: ID;
  readonly lastAppliedSequence: number;
}
export interface Projection<T> {
  readonly cursor: ProjectionCursor;
  readonly value: T;
}
export interface Projector<T> {
  apply(previous: Projection<T>, event: Readonly<EventEnvelope>): Projection<T>;
}

export * from "./season.js";
export * from "./match-analytics.js";
export * from "./persistent-world.js";
export * from "./tactical-briefing.js";
export * from "./field-presentation.js";
export * from "./commentary.js";
export * from "./audio-cues.js";
export * from "./historical-stats.js";
export * from "./awards.js";
export * from "./career-stories.js";
export * from "./scenario-mode.js";
export * from "./tournament.js";
export * from "./match-report.js";
export * from "./season-objective.js";
export * from "./player-identity.js";
export * from "./player-identity-v1.js";
export * from "./player-identity-v2.js";
export * from "./fixture-preview.js";
export * from "./match-situation.js";
export * from "./opposition-watch.js";
export * from "./t20-expectation-table.js";
export * from "./pitch-verdict.js";
