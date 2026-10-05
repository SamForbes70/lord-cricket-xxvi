import { z } from "zod";
import { BasisPointsSchema, CounterSchema, HashSchema, IDSchema } from "./core.js";

export const CareerConditionPolicySchema = z.strictObject({
  conditionPolicyVersion: z.literal("LC_T20_CAREER_CONDITION_V1"),
  maxFatigueBp: z.literal(10000),
  restRecoveryPerDayBp: z.literal(2000),
  practiceRecoveryPerDayBp: z.literal(1400),
  noRandomInjuries: z.literal(true),
});

export const ManualUnavailabilitySchema = z.strictObject({
  playerId: IDSchema,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: z.string().min(1).max(240),
  source: z.literal("MANUAL_FIXTURE_PACK"),
});

export const CareerAvailabilityPackSchema = z.strictObject({
  availabilityVersion: z.literal("LC_T20_AVAILABILITY_PACK_V1"),
  packId: IDSchema,
  worldPackId: z.literal("fictional-eight-01"),
  worldCanonicalSha256: HashSchema,
  entries: z.array(ManualUnavailabilitySchema).max(320),
});

export const PlayerCareerConditionSchema = z.strictObject({
  playerId: IDSchema,
  fatigueBp: BasisPointsSchema,
  lastUpdatedDate: z.iso.date(),
});

export const AppliedMatchConditionSchema = z.strictObject({
  matchCompletionKey: IDSchema,
  matchId: IDSchema,
  matchDayDate: z.iso.date(),
  payloadSha256: HashSchema,
});

export const MatchConditionDeltaSchema = z.strictObject({
  deltaVersion: z.literal("LC_T20_MATCH_CONDITION_DELTA_V1"),
  matchCompletionKey: IDSchema,
  matchId: IDSchema,
  matchDayDate: z.iso.date(),
  playerFatigueDeltaBp: z.record(IDSchema, BasisPointsSchema),
});

const CareerDayStateCoreShape = {
  careerStateVersion: z.literal("LC_T20_CAREER_DAY_STATE_V1"),
  conditionPolicyVersion: z.literal("LC_T20_CAREER_CONDITION_V1"),
  careerId: IDSchema,
  gameId: IDSchema,
  seasonId: IDSchema,
  competitionId: z.literal("LC_T20_LEAGUE_01"),
  scheduleVersion: z.literal("LC_T20_SEASON_SCHEDULE_V1"),
  scheduleSha256: HashSchema,
  worldPackId: z.literal("fictional-eight-01"),
  worldCanonicalSha256: HashSchema,
  availabilityPackId: IDSchema,
  availabilityPackSha256: HashSchema,
  startDate: z.iso.date(),
  finalScheduledDate: z.iso.date(),
  currentDate: z.iso.date(),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  playerConditions: z.array(PlayerCareerConditionSchema).length(160),
  appliedMatchConditions: z.array(AppliedMatchConditionSchema).max(56),
} as const;

export const CareerDayStateCoreSchema = z.strictObject(CareerDayStateCoreShape);
export const CareerDayStateSchema = z.strictObject({
  ...CareerDayStateCoreShape,
  stateSha256: HashSchema,
});

export const SquadPlayerConditionViewSchema = z.strictObject({
  playerId: IDSchema,
  fatigueBp: BasisPointsSchema,
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  availabilityReason: z.string().min(1).max(240).nullable(),
  unavailableThrough: z.iso.date().nullable(),
});

export const SquadConditionViewSchema = z.strictObject({
  teamId: IDSchema,
  date: z.iso.date(),
  players: z.array(SquadPlayerConditionViewSchema).length(20),
});

export const CareerAdvanceDayReceiptSchema = z.strictObject({
  command: z.literal("ADVANCE_DAY"),
  previousDate: z.iso.date(),
  currentDate: z.iso.date(),
  recoveredPlayers: CounterSchema,
  recoveryPerPlayerBp: z.literal(2000),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  stateSha256: HashSchema,
});

export type CareerConditionPolicy = z.infer<typeof CareerConditionPolicySchema>;
export type ManualUnavailability = z.infer<typeof ManualUnavailabilitySchema>;
export type CareerAvailabilityPack = z.infer<typeof CareerAvailabilityPackSchema>;
export type PlayerCareerCondition = z.infer<typeof PlayerCareerConditionSchema>;
export type AppliedMatchCondition = z.infer<typeof AppliedMatchConditionSchema>;
export type MatchConditionDelta = z.infer<typeof MatchConditionDeltaSchema>;
export type CareerDayStateCore = z.infer<typeof CareerDayStateCoreSchema>;
export type CareerDayState = z.infer<typeof CareerDayStateSchema>;
export type SquadPlayerConditionView = z.infer<typeof SquadPlayerConditionViewSchema>;
export type SquadConditionView = z.infer<typeof SquadConditionViewSchema>;
export type CareerAdvanceDayReceipt = z.infer<typeof CareerAdvanceDayReceiptSchema>;
