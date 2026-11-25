import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PlayerSchema, PositiveCounterSchema } from "./core.js";
import {
  CompletedSeasonRecordSchema,
  MAX_PERSISTENT_SEASONS,
  PersistentCareerProjectionSchema,
  PersistentWorldIdentitySchema,
  PersistentWorldRolloverReceiptSchema,
  PersistentWorldSaveSummarySchema,
} from "./persistent-world.js";
import {
  ActivePersistentSeasonStateSchema,
  ActivePersistentSeasonStateV2Schema,
  LifecycleAbilityBandSummarySchema,
  PlayerLifecycleStateSchema,
  PlayerLifecycleStateV2Schema,
} from "./player-lifecycle.js";

export const SQUAD_ECONOMY_MODEL_VERSION = "LC_SQUAD_ECONOMY_MODEL_FICTIONAL_V1" as const;
export const SQUAD_ECONOMY_STATE_VERSION = "LC_SQUAD_ECONOMY_STATE_V1" as const;
export const ECONOMY_TRANSACTION_LEDGER_ENTRY_VERSION = "LC_ECONOMY_LEDGER_ENTRY_V1" as const;
export const PERSISTENT_WORLD_STATE_V3_VERSION = "LC_PERSISTENT_WORLD_STATE_V3" as const;
export const PERSISTENT_WORLD_SAVE_V3_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V3" as const;
export const PERSISTENT_WORLD_PRESENTATION_SAVE_V3_SCHEMA_VERSION =
  "LC_PERSISTENT_WORLD_SAVE_V3_PRESENTATION" as const;
export const PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION =
  "LC_PERSISTENT_WORLD_PORTABLE_V3_ECONOMY" as const;
/** World state V4: V3 with lifecycle V2 (bounded embedded roster packs). docs/design/WORLD_STATE_HISTORY_V4.md */
export const PERSISTENT_WORLD_STATE_V4_VERSION = "LC_PERSISTENT_WORLD_STATE_V4" as const;
export const PERSISTENT_WORLD_SAVE_V4_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V4" as const;
export const PERSISTENT_WORLD_PRESENTATION_SAVE_V4_SCHEMA_VERSION =
  "LC_PERSISTENT_WORLD_SAVE_V4_PRESENTATION" as const;
/**
 * World state V5: V4 in memory, but finished seasons are hashed and stored by reference
 * (docs/design/WORLD_STATE_V5_SEASON_REFS.md).
 */
export const PERSISTENT_WORLD_STATE_V5_VERSION = "LC_PERSISTENT_WORLD_STATE_V5" as const;
export const PERSISTENT_WORLD_SAVE_V5_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V5" as const;
export const PERSISTENT_WORLD_PRESENTATION_SAVE_V5_SCHEMA_VERSION =
  "LC_PERSISTENT_WORLD_SAVE_V5_PRESENTATION" as const;
/**
 * World state V6 (docs/pavilion/CAREER_FIXTURE_POLICY_V2.md): V5's shape and storage, but its current season is a
 * season state V2, whose computer-run fixtures use career fixture policy V2. New careers start on V6; a V5 career
 * becomes V6 when it starts its next season. Its finished seasons are kept exactly as they were.
 */
export const PERSISTENT_WORLD_STATE_V6_VERSION = "LC_PERSISTENT_WORLD_STATE_V6" as const;
export const PERSISTENT_WORLD_SAVE_V6_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V6" as const;
export const PERSISTENT_WORLD_PRESENTATION_SAVE_V6_SCHEMA_VERSION =
  "LC_PERSISTENT_WORLD_SAVE_V6_PRESENTATION" as const;

export const DEFAULT_ANNUAL_CLUB_WAGE_BUDGET_K = 2_500 as const;
export const MIN_PLAYER_ANNUAL_WAGE_K = 35 as const;
export const MAX_PLAYER_ANNUAL_WAGE_K = 450 as const;
export const YOUTH_ROOKIE_ANNUAL_WAGE_K = 40 as const;
export const MIN_CONTRACT_TERM_SEASONS = 1 as const;
export const MAX_CONTRACT_TERM_SEASONS = 3 as const;
export const MAX_NEGOTIATION_ROUNDS_PER_WINDOW = 3 as const;
export const DEFAULT_RELEASE_BUYOUT_PERCENT = 50 as const;
export const MIN_FREE_AGENT_POOL_SIZE = 16 as const;
export const MAX_FREE_AGENT_POOL_SIZE = 40 as const;

export const FictionalSquadEconomyModelSchema = z.strictObject({
  modelVersion: z.literal(SQUAD_ECONOMY_MODEL_VERSION),
  calibrationStatus: z.literal("FICTIONAL_PLACEHOLDER"),
  disclaimer: z.string().min(1).max(400),
  annualClubWageBudgetK: z.number().int().min(1000).max(10000),
  minAnnualWageK: z.number().int().min(20).max(100),
  maxAnnualWageK: z.number().int().min(200).max(1000),
  youthRookieAnnualWageK: z.number().int().min(25).max(100),
  minContractTermSeasons: z.literal(MIN_CONTRACT_TERM_SEASONS),
  maxContractTermSeasons: z.literal(MAX_CONTRACT_TERM_SEASONS),
  maxNegotiationRounds: z.literal(MAX_NEGOTIATION_ROUNDS_PER_WINDOW),
  releaseBuyoutPercent: z.number().int().min(0).max(100),
  minFreeAgentPoolSize: z.number().int().min(8).max(64),
  maxFreeAgentPoolSize: z.number().int().min(16).max(128),
});

export const ContractOriginSchema = z.enum([
  "INITIAL_SQUAD",
  "RENEWAL",
  "FREE_AGENT_SIGNING",
  "YOUTH_GRADUATE",
  "EMERGENCY_MINIMUM",
]);

export const PlayerContractSchema = z.strictObject({
  contractId: IDSchema,
  playerId: IDSchema,
  teamId: IDSchema,
  signedSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  startsSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS + 1),
  expiresAfterSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS + 5),
  annualWageK: z.number().int().min(20).max(1000),
  origin: ContractOriginSchema,
  careerTeamIds: z.array(IDSchema).min(1).max(8),
});

export const FreeAgentEntryReasonSchema = z.enum([
  "UNATTACHED_POOL",
  "CONTRACT_EXPIRED",
  "CLUB_RELEASED",
]);

export const FreeAgentRecordSchema = z.strictObject({
  playerId: IDSchema,
  player: PlayerSchema,
  enteredMarketSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  enteredReason: FreeAgentEntryReasonSchema,
  previousTeamId: IDSchema.nullable(),
  careerTeamIds: z.array(IDSchema).max(8),
  restrictedFromSigningTeamId: IDSchema.nullable(),
  restrictedSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS).nullable(),
  askingAnnualWageK: z.number().int().min(20).max(1000),
  preferredTermSeasons: z.number().int().min(1).max(MAX_CONTRACT_TERM_SEASONS),
});

export const ClubBudgetStateSchema = z.strictObject({
  teamId: IDSchema,
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  annualWageBudgetK: z.number().int().min(500).max(20000),
  committedWagesK: CounterSchema.max(20000),
  deadCapWagesK: CounterSchema.max(20000),
  pendingOfferReservedWagesK: CounterSchema.max(20000),
  availableWageSpaceK: CounterSchema.max(20000),
});

export const ContractOfferKindSchema = z.enum(["FREE_AGENT", "RENEWAL"]);

export const ContractOfferStatusSchema = z.enum([
  "PENDING_ROUND",
  "COUNTERED",
  "SIGNED",
  "REJECTED",
  "WITHDRAWN",
]);

export const ContractOfferResolutionReasonSchema = z.enum([
  "AWAITING_ROUND_RESOLUTION",
  "PLAYER_ACCEPTED_BEST_OFFER",
  "PLAYER_COUNTERED_TERMS",
  "WAGE_BELOW_RESERVATION",
  "SIGNED_WITH_COMPETING_CLUB",
  "CLUB_WITHDREW_OFFER",
  "PLAYER_NO_LONGER_ELIGIBLE",
  "CAP_OR_ROSTER_LIMIT",
]);

export const ContractOfferSchema = z.strictObject({
  offerId: IDSchema,
  commandId: IDSchema,
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  roundSubmitted: z.number().int().min(1).max(MAX_NEGOTIATION_ROUNDS_PER_WINDOW),
  roundResolved: z.number().int().min(1).max(MAX_NEGOTIATION_ROUNDS_PER_WINDOW).nullable(),
  offeringTeamId: IDSchema,
  submittedBy: z.enum(["HUMAN_MANAGER", "AI_CLUB"]),
  playerId: IDSchema,
  offerKind: ContractOfferKindSchema,
  annualWageK: z.number().int().min(20).max(1000),
  termSeasons: z.number().int().min(1).max(MAX_CONTRACT_TERM_SEASONS),
  status: ContractOfferStatusSchema,
  reason: ContractOfferResolutionReasonSchema,
  counterAnnualWageK: z.number().int().min(20).max(1000).nullable(),
  counterTermSeasons: z.number().int().min(1).max(MAX_CONTRACT_TERM_SEASONS).nullable(),
  rationale: z.string().min(1).max(280),
});

export const NegotiationWindowStateSchema = z.strictObject({
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  windowPhase: z.enum(["OPEN", "CLOSED"]),
  currentRound: z.number().int().min(1).max(MAX_NEGOTIATION_ROUNDS_PER_WINDOW),
  maxRounds: z.literal(MAX_NEGOTIATION_ROUNDS_PER_WINDOW),
  offers: z.array(ContractOfferSchema).max(2000),
});

export const EconomyTransactionTypeSchema = z.enum([
  "INITIAL_CONTRACT_REGISTERED",
  "CONTRACT_RENEWED",
  "FREE_AGENT_SIGNED",
  "YOUTH_ROOKIE_CONTRACT_SIGNED",
  "CONTRACT_EXPIRED_TO_FREE_AGENCY",
  "CONTRACT_RELEASE_BUYOUT",
  "CONTRACT_ENDED_ON_RETIREMENT",
  "MINIMUM_SQUAD_TOPUP_SIGNED",
]);

export const EconomyTransactionLedgerEntryCoreSchema = z.strictObject({
  ledgerEntryVersion: z.literal(ECONOMY_TRANSACTION_LEDGER_ENTRY_VERSION),
  sequence: PositiveCounterSchema,
  transactionId: IDSchema,
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  date: z.iso.date(),
  type: EconomyTransactionTypeSchema,
  teamId: IDSchema,
  playerId: IDSchema,
  contractId: IDSchema.nullable(),
  offerId: IDSchema.nullable(),
  annualWageK: CounterSchema.max(2000),
  deadCapDeltaK: CounterSchema.max(2000),
  termSeasons: CounterSchema.max(MAX_CONTRACT_TERM_SEASONS),
  teamCommittedWagesAfterK: CounterSchema.max(20000),
  teamDeadCapAfterK: CounterSchema.max(20000),
  teamBudgetLimitK: z.number().int().min(500).max(20000),
  summary: z.string().min(1).max(320),
  prevEntrySha256: HashSchema.nullable(),
});

export const EconomyTransactionLedgerEntrySchema = z.strictObject({
  ...EconomyTransactionLedgerEntryCoreSchema.shape,
  entrySha256: HashSchema,
});

export const SeasonEconomyTransitionSummarySchema = z.strictObject({
  fromSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS - 1),
  toSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  humanRenewedCount: CounterSchema.max(1000),
  aiRenewedCount: CounterSchema.max(1000),
  expiredToFreeAgencyIds: z.array(IDSchema).max(1000),
  retiredContractClosedIds: z.array(IDSchema).max(1000),
  youthContractsSignedIds: z.array(IDSchema).max(1000),
  aiOffseasonFreeAgentSigningsIds: z.array(IDSchema).max(1000),
  minimumTopupSignedIds: z.array(IDSchema).max(1000),
});

export const SquadEconomyStateCoreSchema = z.strictObject({
  economyVersion: z.literal(SQUAD_ECONOMY_STATE_VERSION),
  model: FictionalSquadEconomyModelSchema,
  contracts: z.array(PlayerContractSchema).min(22).max(10000),
  freeAgents: z.array(FreeAgentRecordSchema).max(2000),
  clubBudgets: z.array(ClubBudgetStateSchema).length(8),
  negotiationWindow: NegotiationWindowStateSchema,
  ledger: z.array(EconomyTransactionLedgerEntrySchema).min(1).max(50000),
  appliedCommandIds: z.array(IDSchema).max(10000),
  transitions: z.array(SeasonEconomyTransitionSummarySchema).max(MAX_PERSISTENT_SEASONS),
});

export const SquadEconomyStateSchema = z.strictObject({
  ...SquadEconomyStateCoreSchema.shape,
  economySha256: HashSchema,
});

export const PersistentWorldStateV3CoreSchema = z.strictObject({
  worldStateVersion: z.literal(PERSISTENT_WORLD_STATE_V3_VERSION),
  worldIdentity: PersistentWorldIdentitySchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  currentSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  currentCalendarYear: z.number().int().min(1900).max(9999),
  currentSeason: ActivePersistentSeasonStateSchema,
  completedSeasons: z.array(CompletedSeasonRecordSchema).max(MAX_PERSISTENT_SEASONS - 1),
  careerProjection: PersistentCareerProjectionSchema,
  lifecycle: PlayerLifecycleStateSchema,
  economy: SquadEconomyStateSchema,
  lastRolloverReceipt: PersistentWorldRolloverReceiptSchema.nullable(),
  revision: CounterSchema,
});

export const PersistentWorldStateV3Schema = z.strictObject({
  ...PersistentWorldStateV3CoreSchema.shape,
  stateSha256: HashSchema,
});

export const PersistentWorldStateV4CoreSchema = PersistentWorldStateV3CoreSchema.extend({
  worldStateVersion: z.literal(PERSISTENT_WORLD_STATE_V4_VERSION),
  lifecycle: PlayerLifecycleStateV2Schema,
});

export const PersistentWorldStateV4Schema = z.strictObject({
  ...PersistentWorldStateV4CoreSchema.shape,
  stateSha256: HashSchema,
});

/** In memory a V5 state is V4's shape; `stateSha256` covers finished seasons by their `recordSha256` only. */
export const PersistentWorldStateV5CoreSchema = PersistentWorldStateV4CoreSchema.extend({
  worldStateVersion: z.literal(PERSISTENT_WORLD_STATE_V5_VERSION),
});

export const PersistentWorldStateV5Schema = z.strictObject({
  ...PersistentWorldStateV5CoreSchema.shape,
  stateSha256: HashSchema,
});

/** A finished season as a V5 checkpoint stores it; the record itself is in its COMPLETED_SEASON_RECORD_V1 row. */
export const CompletedSeasonReferenceSchema = z.strictObject({
  seasonId: IDSchema,
  recordSha256: HashSchema,
});

/** A V5 checkpoint payload: the state with finished seasons as references. */
export const PersistentWorldStateV5StoredSchema = z.strictObject({
  ...PersistentWorldStateV5Schema.shape,
  completedSeasons: z.array(CompletedSeasonReferenceSchema).max(MAX_PERSISTENT_SEASONS - 1),
});

/** World state V6: V5 with a policy V2 current season. Hashed and stored as V5 is. */
export const PersistentWorldStateV6CoreSchema = PersistentWorldStateV5CoreSchema.extend({
  worldStateVersion: z.literal(PERSISTENT_WORLD_STATE_V6_VERSION),
  currentSeason: ActivePersistentSeasonStateV2Schema,
});

export const PersistentWorldStateV6Schema = z.strictObject({
  ...PersistentWorldStateV6CoreSchema.shape,
  stateSha256: HashSchema,
});

/** A V6 checkpoint payload: finished seasons as references, as in V5. */
export const PersistentWorldStateV6StoredSchema = z.strictObject({
  ...PersistentWorldStateV6Schema.shape,
  completedSeasons: z.array(CompletedSeasonReferenceSchema).max(MAX_PERSISTENT_SEASONS - 1),
});

export const PersistentWorldPortableV3ManifestSchema = z.strictObject({
  archiveVersion: z.literal(PERSISTENT_WORLD_PORTABLE_V3_ARCHIVE_VERSION),
  saveSchema: z.enum([
    PERSISTENT_WORLD_SAVE_V3_SCHEMA_VERSION,
    PERSISTENT_WORLD_PRESENTATION_SAVE_V3_SCHEMA_VERSION,
  ]),
  exportedAt: z.iso.datetime(),
  summary: PersistentWorldSaveSummarySchema,
  careerProjectionSha256: HashSchema,
  lifecycleSha256: HashSchema,
  economySha256: HashSchema,
  worldCopySha256: HashSchema.optional(),
  rosterPackHashes: z.array(HashSchema).max(MAX_PERSISTENT_SEASONS * 4),
  matchEventArchiveCount: CounterSchema.max(MAX_PERSISTENT_SEASONS * 56),
  files: z.record(z.string().min(1), z.strictObject({ bytes: CounterSchema, sha256: HashSchema })),
});

export const SubmitContractOfferRequestSchema = z.strictObject({
  command: z.literal("SUBMIT_CONTRACT_OFFER"),
  commandId: IDSchema,
  offeringTeamId: IDSchema,
  playerId: IDSchema,
  offerKind: ContractOfferKindSchema,
  annualWageK: z.number().int().min(20).max(1000),
  termSeasons: z.number().int().min(1).max(MAX_CONTRACT_TERM_SEASONS),
});

export const WithdrawContractOfferRequestSchema = z.strictObject({
  command: z.literal("WITHDRAW_CONTRACT_OFFER"),
  commandId: IDSchema,
  offeringTeamId: IDSchema,
  offerId: IDSchema,
});

export const AcceptCounterOfferRequestSchema = z.strictObject({
  command: z.literal("ACCEPT_COUNTER_OFFER"),
  commandId: IDSchema,
  offeringTeamId: IDSchema,
  offerId: IDSchema,
});

export const ResolveNegotiationRoundRequestSchema = z.strictObject({
  command: z.literal("RESOLVE_NEGOTIATION_ROUND"),
  commandId: IDSchema,
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  expectedRound: z.number().int().min(1).max(MAX_NEGOTIATION_ROUNDS_PER_WINDOW),
});

export const ReleaseContractedPlayerRequestSchema = z.strictObject({
  command: z.literal("RELEASE_CONTRACTED_PLAYER"),
  commandId: IDSchema,
  teamId: IDSchema,
  playerId: IDSchema,
});

export const EconomyDiagnosticSeasonSnapshotSchema = z.strictObject({
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  activeContractCount: CounterSchema,
  freeAgentPoolCount: CounterSchema,
  minClubPayrollUsedK: CounterSchema,
  medianClubPayrollUsedK: CounterSchema,
  maxClubPayrollUsedK: CounterSchema,
  clubWageBudgetK: z.number().int().min(500).max(20000),
  clubsOverspentCount: CounterSchema,
  clubsWithRoleShortageCount: CounterSchema,
  seasonFreeAgentSigningsCount: CounterSchema,
  seasonRenewalsCount: CounterSchema,
  seasonExpiredToFreeAgencyCount: CounterSchema,
  seasonReleaseBuyoutsCount: CounterSchema,
  wageDistributionK: LifecycleAbilityBandSummarySchema,
  aiHiddenFutureAbilityReads: z.literal(0),
});

export type FictionalSquadEconomyModel = z.infer<typeof FictionalSquadEconomyModelSchema>;
export type ContractOrigin = z.infer<typeof ContractOriginSchema>;
export type PlayerContract = z.infer<typeof PlayerContractSchema>;
export type FreeAgentEntryReason = z.infer<typeof FreeAgentEntryReasonSchema>;
export type FreeAgentRecord = z.infer<typeof FreeAgentRecordSchema>;
export type ClubBudgetState = z.infer<typeof ClubBudgetStateSchema>;
export type ContractOfferKind = z.infer<typeof ContractOfferKindSchema>;
export type ContractOfferStatus = z.infer<typeof ContractOfferStatusSchema>;
export type ContractOfferResolutionReason = z.infer<typeof ContractOfferResolutionReasonSchema>;
export type ContractOffer = z.infer<typeof ContractOfferSchema>;
export type NegotiationWindowState = z.infer<typeof NegotiationWindowStateSchema>;
export type EconomyTransactionType = z.infer<typeof EconomyTransactionTypeSchema>;
export type EconomyTransactionLedgerEntryCore = z.infer<
  typeof EconomyTransactionLedgerEntryCoreSchema
>;
export type EconomyTransactionLedgerEntry = z.infer<typeof EconomyTransactionLedgerEntrySchema>;
export type SeasonEconomyTransitionSummary = z.infer<typeof SeasonEconomyTransitionSummarySchema>;
export type SquadEconomyStateCore = z.infer<typeof SquadEconomyStateCoreSchema>;
export type SquadEconomyState = z.infer<typeof SquadEconomyStateSchema>;
export type PersistentWorldStateV3Core = z.infer<typeof PersistentWorldStateV3CoreSchema>;
export type PersistentWorldStateV3 = z.infer<typeof PersistentWorldStateV3Schema>;
export type PersistentWorldStateV4Core = z.infer<typeof PersistentWorldStateV4CoreSchema>;
export type PersistentWorldStateV4 = z.infer<typeof PersistentWorldStateV4Schema>;
export type PersistentWorldStateV5Core = z.infer<typeof PersistentWorldStateV5CoreSchema>;
export type PersistentWorldStateV5 = z.infer<typeof PersistentWorldStateV5Schema>;
export type CompletedSeasonReference = z.infer<typeof CompletedSeasonReferenceSchema>;
export type PersistentWorldStateV5Stored = z.infer<typeof PersistentWorldStateV5StoredSchema>;
export type PersistentWorldStateV6Core = z.infer<typeof PersistentWorldStateV6CoreSchema>;
export type PersistentWorldStateV6 = z.infer<typeof PersistentWorldStateV6Schema>;
export type PersistentWorldStateV6Stored = z.infer<typeof PersistentWorldStateV6StoredSchema>;
export type PersistentWorldPortableV3Manifest = z.infer<
  typeof PersistentWorldPortableV3ManifestSchema
>;
export type SubmitContractOfferRequest = z.infer<typeof SubmitContractOfferRequestSchema>;
export type WithdrawContractOfferRequest = z.infer<typeof WithdrawContractOfferRequestSchema>;
export type AcceptCounterOfferRequest = z.infer<typeof AcceptCounterOfferRequestSchema>;
export type ResolveNegotiationRoundRequest = z.infer<typeof ResolveNegotiationRoundRequestSchema>;
export type ReleaseContractedPlayerRequest = z.infer<typeof ReleaseContractedPlayerRequestSchema>;
export type EconomyDiagnosticSeasonSnapshot = z.infer<typeof EconomyDiagnosticSeasonSnapshotSchema>;
