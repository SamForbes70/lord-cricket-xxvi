import type {
  ID,
  Format,
  InningsState,
  ClockState,
  Command,
  Player,
} from "@lcxxvi/contracts";
/** Explicit allow-list. Seed, draw addresses and future weather are intentionally absent. */
export interface CaptainPublicView {
  readonly matchId: ID;
  readonly revision: number;
  readonly format: Format;
  readonly ownTeamId: ID;
  readonly innings: Readonly<InningsState>;
  readonly clock: Readonly<ClockState>;
  readonly knownPlayers: readonly Player[];
  readonly observedWeather: "DRY" | "OVERCAST" | "RAIN" | "UNSAFE_LIGHT";
  readonly ownFatigueBp: Readonly<Record<ID, number>>;
}
export interface CaptainPolicy {
  readonly policyId: ID;
  choose(view: CaptainPublicView, legalCommands: readonly Command[]): Command;
}
export * from "./t20-captain.js";
