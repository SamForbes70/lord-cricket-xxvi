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
