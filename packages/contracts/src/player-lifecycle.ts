import { z } from "zod";
import { SquadPlayerTrainingConditionViewSchema, TrainingDirectiveSchema } from "./career.js";
import { WorldPackSchema } from "./configuration.js";
import {
  CounterSchema,
  FormatSkillsSchema,
  HashSchema,
  IDSchema,
  PlayerSchema,
  PositiveCounterSchema,
} from "./core.js";
import {
  CompletedSeasonRecordSchema,
  MAX_PERSISTENT_SEASONS,
  PersistentCareerProjectionSchema,
  PersistentWorldIdentitySchema,
  PersistentWorldRolloverReceiptSchema,
  PersistentWorldSaveSummarySchema,
} from "./persistent-world.js";
import {
  RosterCareerDayStateSchema,
  RosterMatchPreparationSchema,
  RosterSeasonProjectionSchema,
  RosterSeasonScheduleSchema,
  StagedRosterPackSchema,
} from "./roster-import.js";
import { T20SeasonStateSchema } from "./season-persistence.js";
import { T20SeasonMatchCompletionSchema } from "./season-projections.js";
import { T20EventChainManifestSchema, T20MatchEventSchema } from "./t20-match.js";

export const PLAYER_LIFECYCLE_MODEL_VERSION = "LC_PLAYER_LIFECYCLE_MODEL_FICTIONAL_V1" as const;
export const PLAYER_LIFECYCLE_STATE_VERSION = "LC_PLAYER_LIFECYCLE_STATE_V1" as const;
export const LIFECYCLE_SEASON_STATE_VERSION = "LC_T20_LIFECYCLE_SEASON_STATE_V1" as const;
export const LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION =
  "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V2_LIFECYCLE" as const;
export const PERSISTENT_WORLD_STATE_V2_VERSION = "LC_PERSISTENT_WORLD_STATE_V2" as const;
export const PERSISTENT_WORLD_SAVE_V2_SCHEMA_VERSION = "LC_PERSISTENT_WORLD_SAVE_V2" as const;
export const PERSISTENT_WORLD_PRESENTATION_SAVE_V2_SCHEMA_VERSION =
  "LC_PERSISTENT_WORLD_SAVE_V2_PRESENTATION" as const;
export const PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION =
  "LC_PERSISTENT_WORLD_PORTABLE_V2_LIFECYCLE" as const;

export const MIN_ACTIVE_TEAM_SQUAD_SIZE = 18 as const;
export const TARGET_ACTIVE_TEAM_SQUAD_SIZE = 20 as const;
export const MAX_ACTIVE_TEAM_SQUAD_SIZE = 22 as const;
export const YOUTH_PROSPECTS_PER_TEAM_PER_SEASON = 3 as const;

export const FictionalPlayerLifecycleModelSchema = z.strictObject({
  modelVersion: z.literal(PLAYER_LIFECYCLE_MODEL_VERSION),
  calibrationStatus: z.literal("FICTIONAL_PLACEHOLDER"),
  disclaimer: z.string().min(1).max(400),
  minPermanentSkill: z.number().int().min(10).max(40),
  maxPermanentSkill: z.number().int().min(80).max(100),
  youthMinAgeYears: z.number().int().min(16).max(20),
  youthMaxAgeYears: z.number().int().min(17).max(22),
  growthWindowMaxAgeYears: z.number().int().min(22).max(28),
  primeWindowMaxAgeYears: z.number().int().min(27).max(33),
  earliestVoluntaryRetirementAgeYears: z.number().int().min(32).max(38),
  mandatoryRetirementAgeYears: z.number().int().min(37).max(45),
  minSquadKeepers: z.number().int().min(1).max(4),
  minSquadBowlingCapable: z.number().int().min(5).max(12),
});

export const PlayerTrainingExposureRecordSchema = z.strictObject({
  playerId: IDSchema,
  battingPracticeDays: CounterSchema.max(366),
  bowlingPracticeDays: CounterSchema.max(366),
  fieldingPracticeDays: CounterSchema.max(366),
  restDays: CounterSchema.max(366),
});

export const SignedSkillDeltaSchema = z.number().int().min(-25).max(25);

export const PlayerSkillDeltaSummarySchema = z.strictObject({
  battingDelta: SignedSkillDeltaSchema,
  bowlingDelta: SignedSkillDeltaSchema,
  fieldingDelta: SignedSkillDeltaSchema,
  keepingDelta: SignedSkillDeltaSchema,
  staminaDelta: SignedSkillDeltaSchema,
});

export const PlayerSeasonDevelopmentReportSchema = z.strictObject({
  playerId: IDSchema,
  teamId: IDSchema,
  ageBefore: z.number().int().min(15).max(60),
  ageAfter: z.number().int().min(16).max(61),
  matchesPlayed: CounterSchema.max(56),
  ballsFaced: CounterSchema,
  ballsBowled: CounterSchema,
  battingPracticeDays: CounterSchema.max(366),
  bowlingPracticeDays: CounterSchema.max(366),
  fieldingPracticeDays: CounterSchema.max(366),
  restDays: CounterSchema.max(366),
  deltas: PlayerSkillDeltaSummarySchema,
  phaseLabel: z.enum(["YOUTH_GROWTH", "EARLY_DEVELOPMENT", "PRIME_MAINTENANCE", "VETERAN_DECLINE"]),
});

export const RetiredPlayerRecordSchema = z.strictObject({
  playerId: IDSchema,
  player: PlayerSchema,
  debutSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  retiredAfterSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  retiredCalendarYear: z.number().int().min(1900).max(9999),
  ageAtRetirement: z.number().int().min(18).max(65),
  lastTeamId: IDSchema,
  careerTeamIds: z.array(IDSchema).min(1).max(8),
  retirementReason: z.enum(["AGE_AND_WORKLOAD", "VETERAN_TRANSITION", "MANDATORY_AGE_LIMIT"]),
});

export const YouthCeilingTierSchema = z.enum([
  "ACADEMY_GRADUATE",
  "FIRST_TEAM_PROSPECT",
  "HIGH_CEILING_PROSPECT",
]);

export const AcademyTrainingFocusSchema = z.enum([
  "BALANCED",
  "BATTING_PRACTICE",
  "BOWLING_PRACTICE",
  "FIELDING_PRACTICE",
]);

export const YouthProspectSchema = z.strictObject({
  prospectId: IDSchema,
  teamId: IDSchema,
  generatedInSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  generatedCalendarYear: z.number().int().min(1900).max(9999),
  intakeRank: z.number().int().min(1).max(YOUTH_PROSPECTS_PER_TEAM_PER_SEASON),
  fictionalCeilingTier: YouthCeilingTierSchema,
  academyFocus: AcademyTrainingFocusSchema,
  queuedForPromotion: z.boolean(),
  promotedInSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS).nullable(),
  player: PlayerSchema,
});

export const SeasonLifecycleTransitionRecordCoreSchema = z.strictObject({
  fromSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS - 1),
  toSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  agedPlayerCount: CounterSchema.max(10000),
  developedPlayers: z.array(PlayerSeasonDevelopmentReportSchema).max(10000),
  retiredPlayerIds: z.array(IDSchema).max(10000),
  promotedYouthIds: z.array(IDSchema).max(10000),
  generatedYouthIds: z.array(IDSchema).max(10000),
});

export const SeasonLifecycleTransitionRecordSchema = z.strictObject({
  ...SeasonLifecycleTransitionRecordCoreSchema.shape,
  transitionSha256: HashSchema,
});

export const PlayerLifecycleSkillLedgerEntrySchema = z.strictObject({
  playerId: IDSchema,
  debutSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  careerEntryT20Skills: FormatSkillsSchema,
  priorSeasonT20Skills: FormatSkillsSchema,
  lastSeasonDelta: PlayerSkillDeltaSummarySchema,
});

export const PlayerLifecycleStateCoreSchema = z.strictObject({
  lifecycleVersion: z.literal(PLAYER_LIFECYCLE_STATE_VERSION),
  model: FictionalPlayerLifecycleModelSchema,
  activeWorld: WorldPackSchema,
  activeRosterPack: StagedRosterPackSchema.nullable(),
  historicalRosterPacks: z.array(StagedRosterPackSchema).max(MAX_PERSISTENT_SEASONS * 4),
  skillLedger: z.array(PlayerLifecycleSkillLedgerEntrySchema).min(22).max(10000),
  seasonTrainingExposure: z.array(PlayerTrainingExposureRecordSchema).min(22).max(10000),
  retiredPlayers: z.array(RetiredPlayerRecordSchema).max(10000),
  youthAcademy: z.array(YouthProspectSchema).max(10000),
  transitions: z.array(SeasonLifecycleTransitionRecordSchema).max(MAX_PERSISTENT_SEASONS),
  squadRegistrationRevision: CounterSchema,
});

export const PlayerLifecycleStateSchema = z.strictObject({
  ...PlayerLifecycleStateCoreSchema.shape,
  lifecycleSha256: HashSchema,
});

export const LifecycleSeasonStateCoreSchema = z.strictObject({
  seasonStateVersion: z.literal(LIFECYCLE_SEASON_STATE_VERSION),
  seasonId: IDSchema,
  gameId: IDSchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  rosterPackSha256: HashSchema,
  schedule: RosterSeasonScheduleSchema,
  careerState: RosterCareerDayStateSchema,
  projection: RosterSeasonProjectionSchema,
  completedMatches: z.array(T20SeasonMatchCompletionSchema).max(56),
  revision: CounterSchema,
  phase: z.enum(["ACTIVE", "COMPLETE"]),
});

export const LifecycleSeasonStateSchema = z.strictObject({
  ...LifecycleSeasonStateCoreSchema.shape,
  stateSha256: HashSchema,
});

export const ActivePersistentSeasonStateSchema = z.discriminatedUnion("seasonStateVersion", [
  T20SeasonStateSchema,
  LifecycleSeasonStateSchema,
]);

export const CompletedLifecycleMatchEventArchiveCoreSchema = z.strictObject({
  archiveVersion: z.literal(LIFECYCLE_MATCH_EVENT_ARCHIVE_VERSION),
  seasonId: IDSchema,
  scheduleSha256: HashSchema,
  fixtureId: IDSchema,
  matchId: IDSchema,
  fixtureOrdinal: z.number().int().min(0).max(55),
  roundNumber: PositiveCounterSchema.max(14),
  matchDayDate: z.iso.date(),
  source: z.enum(["OFFSCREEN", "USER_MATCH"]),
  sourceCompletionSha256: HashSchema,
  rosterPackSha256: HashSchema,
  preparation: RosterMatchPreparationSchema,
  eventChain: T20EventChainManifestSchema,
  events: z.array(T20MatchEventSchema).min(1).max(2000),
  scorecardSha256: HashSchema,
});

export const CompletedLifecycleMatchEventArchiveSchema = z.strictObject({
  ...CompletedLifecycleMatchEventArchiveCoreSchema.shape,
  archiveSha256: HashSchema,
});

export const PersistentWorldStateV2CoreSchema = z.strictObject({
  worldStateVersion: z.literal(PERSISTENT_WORLD_STATE_V2_VERSION),
  worldIdentity: PersistentWorldIdentitySchema,
  careerId: IDSchema,
  controlledTeamId: IDSchema.nullable(),
  currentSeasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  currentCalendarYear: z.number().int().min(1900).max(9999),
  currentSeason: ActivePersistentSeasonStateSchema,
  completedSeasons: z.array(CompletedSeasonRecordSchema).max(MAX_PERSISTENT_SEASONS - 1),
  careerProjection: PersistentCareerProjectionSchema,
  lifecycle: PlayerLifecycleStateSchema,
  lastRolloverReceipt: PersistentWorldRolloverReceiptSchema.nullable(),
  revision: CounterSchema,
});

export const PersistentWorldStateV2Schema = z.strictObject({
  ...PersistentWorldStateV2CoreSchema.shape,
  stateSha256: HashSchema,
});

export const PersistentWorldPortableV2ManifestSchema = z.strictObject({
  archiveVersion: z.literal(PERSISTENT_WORLD_PORTABLE_V2_ARCHIVE_VERSION),
  saveSchema: z.enum([
    PERSISTENT_WORLD_SAVE_V2_SCHEMA_VERSION,
    PERSISTENT_WORLD_PRESENTATION_SAVE_V2_SCHEMA_VERSION,
  ]),
  exportedAt: z.iso.datetime(),
  summary: PersistentWorldSaveSummarySchema,
  careerProjectionSha256: HashSchema,
  lifecycleSha256: HashSchema,
  worldCopySha256: HashSchema.optional(),
  rosterPackHashes: z.array(HashSchema).max(MAX_PERSISTENT_SEASONS),
  matchEventArchiveCount: CounterSchema.max(MAX_PERSISTENT_SEASONS * 56),
  files: z.record(z.string().min(1), z.strictObject({ bytes: CounterSchema, sha256: HashSchema })),
});

export const SetAcademyProspectFocusRequestSchema = z.strictObject({
  command: z.literal("SET_ACADEMY_PROSPECT_FOCUS"),
  prospectId: IDSchema,
  academyFocus: AcademyTrainingFocusSchema,
});

export const SetAcademyProspectQueueRequestSchema = z.strictObject({
  command: z.literal("SET_ACADEMY_PROSPECT_QUEUE"),
  prospectId: IDSchema,
  queuedForPromotion: z.boolean(),
});

export const PromoteYouthProspectRequestSchema = z.strictObject({
  command: z.literal("PROMOTE_YOUTH_PROSPECT"),
  prospectId: IDSchema,
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
});

export const LifecycleAbilityBandSummarySchema = z.strictObject({
  min: z.number().int().min(0).max(100),
  p10: z.number().int().min(0).max(100),
  median: z.number().int().min(0).max(100),
  meanX10: z.number().int().min(0).max(1000),
  p90: z.number().int().min(0).max(100),
  max: z.number().int().min(0).max(100),
});

export const LifecycleDiagnosticSeasonSnapshotSchema = z.strictObject({
  seasonNumber: PositiveCounterSchema.max(MAX_PERSISTENT_SEASONS),
  calendarYear: z.number().int().min(1900).max(9999),
  activePlayerCount: CounterSchema,
  cumulativeRetiredCount: CounterSchema,
  cumulativeYouthPromotedCount: CounterSchema,
  minClubSquadSize: CounterSchema,
  maxClubSquadSize: CounterSchema,
  minClubKeepers: CounterSchema,
  minClubBowlingCapable: CounterSchema,
  clubsWithRoleShortage: CounterSchema,
  meanAgeX10: CounterSchema,
  battingAbility: LifecycleAbilityBandSummarySchema,
  bowlingAbility: LifecycleAbilityBandSummarySchema,
  fieldingAbility: LifecycleAbilityBandSummarySchema,
  keepingAbility: LifecycleAbilityBandSummarySchema,
  roleCounts: z.strictObject({
    BATTER: CounterSchema,
    BOWLER: CounterSchema,
    ALLROUNDER: CounterSchema,
    KEEPER: CounterSchema,
  }),
  directiveSampleCheck: TrainingDirectiveSchema.optional(),
});

export type FictionalPlayerLifecycleModel = z.infer<typeof FictionalPlayerLifecycleModelSchema>;
export type PlayerTrainingExposureRecord = z.infer<typeof PlayerTrainingExposureRecordSchema>;
export type PlayerSkillDeltaSummary = z.infer<typeof PlayerSkillDeltaSummarySchema>;
export type PlayerSeasonDevelopmentReport = z.infer<typeof PlayerSeasonDevelopmentReportSchema>;
export type RetiredPlayerRecord = z.infer<typeof RetiredPlayerRecordSchema>;
export type YouthCeilingTier = z.infer<typeof YouthCeilingTierSchema>;
export type AcademyTrainingFocus = z.infer<typeof AcademyTrainingFocusSchema>;
export type YouthProspect = z.infer<typeof YouthProspectSchema>;
export type SeasonLifecycleTransitionRecordCore = z.infer<
  typeof SeasonLifecycleTransitionRecordCoreSchema
>;
export type SeasonLifecycleTransitionRecord = z.infer<typeof SeasonLifecycleTransitionRecordSchema>;
export type PlayerLifecycleSkillLedgerEntry = z.infer<
  typeof PlayerLifecycleSkillLedgerEntrySchema
>;
export type PlayerLifecycleStateCore = z.infer<typeof PlayerLifecycleStateCoreSchema>;
export type PlayerLifecycleState = z.infer<typeof PlayerLifecycleStateSchema>;
export type LifecycleSeasonStateCore = z.infer<typeof LifecycleSeasonStateCoreSchema>;
export type LifecycleSeasonState = z.infer<typeof LifecycleSeasonStateSchema>;
export type ActivePersistentSeasonState = z.infer<typeof ActivePersistentSeasonStateSchema>;
export type CompletedLifecycleMatchEventArchiveCore = z.infer<
  typeof CompletedLifecycleMatchEventArchiveCoreSchema
>;
export type CompletedLifecycleMatchEventArchive = z.infer<
  typeof CompletedLifecycleMatchEventArchiveSchema
>;
export type PersistentWorldStateV2Core = z.infer<typeof PersistentWorldStateV2CoreSchema>;
export type PersistentWorldStateV2 = z.infer<typeof PersistentWorldStateV2Schema>;
export type PersistentWorldPortableV2Manifest = z.infer<
  typeof PersistentWorldPortableV2ManifestSchema
>;
export const LifecycleSquadTrainingConditionViewSchema = z.strictObject({
  teamId: IDSchema,
  date: z.iso.date(),
  players: z
    .array(SquadPlayerTrainingConditionViewSchema)
    .min(MIN_ACTIVE_TEAM_SQUAD_SIZE)
    .max(MAX_ACTIVE_TEAM_SQUAD_SIZE),
});

export type LifecycleAbilityBandSummary = z.infer<typeof LifecycleAbilityBandSummarySchema>;
export type LifecycleDiagnosticSeasonSnapshot = z.infer<
  typeof LifecycleDiagnosticSeasonSnapshotSchema
>;
export type LifecycleSquadTrainingConditionView = z.infer<
  typeof LifecycleSquadTrainingConditionViewSchema
>;
