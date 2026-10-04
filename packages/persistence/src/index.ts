import type {
  ID,
  MatchState,
  EventEnvelope,
  CommandReceipt,
} from "@lcxxvi/contracts";
/** Implementations must commit all fields atomically and compare the durable revision. */
export interface CommitBatch {
  readonly gameId: ID;
  readonly expectedRevision: number;
  readonly snapshot: MatchState;
  readonly events: readonly EventEnvelope[];
  readonly receipt: CommandReceipt;
}
export interface MatchRepository {
  load(gameId: ID): Promise<MatchState | null>;
  receipt(gameId: ID, commandId: ID): Promise<CommandReceipt | null>;
  commit(batch: CommitBatch): Promise<void>;
}
export interface SchemaMigration {
  readonly from: string;
  readonly to: string;
  migrate(source: unknown): unknown;
}
