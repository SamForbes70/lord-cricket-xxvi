import type { Command, EventEnvelope, MatchState } from "@lcxxvi/contracts";
/** Full-match command/aggregate ports remain reserved. Scoring and innings implementations are exported below. */
export interface CommandValidator {
  validate(state: Readonly<MatchState>, command: Readonly<Command>): void;
}
export interface EventReducer {
  reduce(
    state: Readonly<MatchState>,
    event: Readonly<EventEnvelope>,
  ): MatchState;
}
export interface TransactionCandidate {
  readonly state: MatchState;
  readonly events: readonly EventEnvelope[];
}
export {
  validateDeliveryResolution,
  ResolutionValidationError,
} from "./validate-resolution.js";
export * from "./scoring-kernel.js";
export * from "./innings-ledger.js";
