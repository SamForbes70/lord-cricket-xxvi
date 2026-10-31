import { z } from "zod";
import { CounterSchema, FormatSkillsSchema, HashSchema, IDSchema, PlayerSchema } from "./core.js";
import { WorldPackSchema } from "./configuration.js";
import { SeasonFixtureSchema, SeasonRoundSchema } from "./competition.js";
import { AppliedMatchConditionSchema, MatchConditionDeltaSchema, PlayerCareerConditionSchema, PlayerReadinessSchema, PlayerTrainingAssignmentSchema } from "./career.js";
import { T20MatchExecutionManifestSchema } from "./t20-match.js";
import { ODIMatchExecutionManifestSchema } from "./odi-match.js";
import { Red5MatchExecutionManifestSchema } from "./red-ball-match.js";
import { OffscreenFixtureOutcomeSchema } from "./season-execution.js";
import { SeasonPlayerStatsSchema, T20SeasonMatchCompletionSchema, T20SeasonProjectionStateSchema } from "./season-projections.js";
import { SeasonPortableManifestSchema } from "./season-persistence.js";

export const ROSTER_IMPORT_MAX_BYTES = 25_000_000;
export const ROSTER_FORMATS = ["T20", "ODI", "RED_BALL"] as const;
const partialSkills = FormatSkillsSchema.partial();
const partialProfiles = z.strictObject({ T20: partialSkills.optional(), ODI: partialSkills.optional(), RED_BALL: partialSkills.optional() });
const partialExposure = z.strictObject({ T20: CounterSchema.optional(), ODI: CounterSchema.optional(), RED_BALL: CounterSchema.optional() });
const sourcePlayer = PlayerSchema.omit({ skills: true, exposureBalls: true, provenance: true }).extend({
  skills: partialProfiles.optional(), exposureBalls: partialExposure.optional(),
});
export const RosterImportSourceSchema = z.strictObject({
  version: z.literal("LC_ROSTER_IMPORT_V1"), sourceId: IDSchema,
  world: WorldPackSchema.omit({ players: true }).extend({ players: z.array(sourcePlayer).min(1).max(10000) }),
});
export const StagedRosterPackSchema = z.strictObject({
  version: z.literal("LC_STAGED_ROSTER_PACK_V1"), sourceText: z.string().max(ROSTER_IMPORT_MAX_BYTES), sourceHash: HashSchema,
  world: WorldPackSchema,
  priorFields: z.array(z.strictObject({ playerId: IDSchema, format: z.enum(ROSTER_FORMATS), fields: z.array(z.string()), exposureMissing: z.boolean() })),
});
const rosterSelectionSchema = z.strictObject({ teamId: IDSchema, playerIds: z.array(IDSchema).length(11), captainId: IDSchema, keeperId: IDSchema });
export const RosterMatchSelectionSchema = z.strictObject({ groundId: IDSchema, teams: z.tuple([rosterSelectionSchema, rosterSelectionSchema]) });
export type StagedRosterPack = z.infer<typeof StagedRosterPackSchema>;
export const RosterMatchPreparationSchema = z.strictObject({
  gameId: IDSchema, matchId: IDSchema, seed: z.string().min(1).max(256), format: z.enum(ROSTER_FORMATS),
  selection: RosterMatchSelectionSchema,
});

export const RosterT20ExecutionManifestSchema = T20MatchExecutionManifestSchema.extend({
  engine: z.literal("LC_T20_MATCH_ROSTER_V2"),
});

export const RosterODIExecutionManifestSchema = ODIMatchExecutionManifestSchema.extend({
  engine: z.literal("LC_ODI_MATCH_ROSTER_V2"),
});

export const RosterRed5ExecutionManifestSchema = Red5MatchExecutionManifestSchema.extend({
  engine: z.literal("LC_RED5_MATCH_ROSTER_V2"),
});

export const RosterSeasonScheduleRequestSchema = z.strictObject({
  seasonId: IDSchema, gameId: IDSchema, seasonSeed: z.string().min(1).max(256), startDate: z.iso.date(),
});
export const RosterSeasonScheduleSchema = z.strictObject({
  version: z.literal("LC_T20_ROSTER_SCHEDULE_V2"),
  request: RosterSeasonScheduleRequestSchema,
  rosterPackHash: HashSchema, worldHash: HashSchema,
  teamIds: z.array(IDSchema).length(8), groundIds: z.array(IDSchema).length(8),
  homeGroundIds: z.record(IDSchema, IDSchema),
  rounds: z.array(SeasonRoundSchema).length(14), fixtures: z.array(SeasonFixtureSchema).length(56),
  scheduleSha256: HashSchema,
});
export type RosterSeasonSchedule = z.infer<typeof RosterSeasonScheduleSchema>;

export const RosterCareerDayStateSchema = z.strictObject({
  version: z.literal("LC_T20_ROSTER_CAREER_DAY_V3"),
  careerId: IDSchema, scheduleSha256: HashSchema, rosterPackHash: HashSchema, worldHash: HashSchema,
  startDate: z.iso.date(), finalScheduledDate: z.iso.date(), currentDate: z.iso.date(), revision: CounterSchema,
  playerConditions: z.array(PlayerCareerConditionSchema).min(22).max(10000),
  playerReadiness: z.array(PlayerReadinessSchema).min(22).max(10000),
  trainingAssignments: z.array(PlayerTrainingAssignmentSchema).min(22).max(10000),
  appliedMatchConditions: z.array(AppliedMatchConditionSchema).max(56), stateSha256: HashSchema,
});
export type RosterCareerDayState = z.infer<typeof RosterCareerDayStateSchema>;

export const RosterOffscreenFixtureOutcomeSchema = OffscreenFixtureOutcomeSchema.extend({
  executionVersion: z.literal("LC_T20_ROSTER_OFFSCREEN_FIXTURE_V2"),
  policyVersion: z.literal("LC_T20_ROSTER_OFFSCREEN_POLICY_V2"),
  engineManifest: RosterT20ExecutionManifestSchema,
});
export type RosterOffscreenFixtureOutcome = z.infer<typeof RosterOffscreenFixtureOutcomeSchema>;

export const RosterSeasonMatchCompletionSchema = T20SeasonMatchCompletionSchema.extend({
  completionVersion: z.literal("LC_T20_ROSTER_SEASON_COMPLETION_V2"),
});
export const RosterSeasonProjectionSchema = T20SeasonProjectionStateSchema.extend({
  projectionVersion: z.literal("LC_T20_ROSTER_SEASON_PROJECTION_V2"),
  players: z.array(SeasonPlayerStatsSchema).max(10000),
});
export type RosterSeasonMatchCompletion = z.infer<typeof RosterSeasonMatchCompletionSchema>;
export type RosterSeasonProjection = z.infer<typeof RosterSeasonProjectionSchema>;
export const RosterManagedFixtureOutcomeSchema = z.strictObject({
  version: z.literal("LC_T20_ROSTER_MANAGED_FIXTURE_V1"),
  completion: RosterSeasonMatchCompletionSchema,
  conditionDelta: MatchConditionDeltaSchema,
  outcomeSha256: HashSchema,
});

export const RosterSeasonStateSchema = z.strictObject({
  version: z.literal("LC_T20_ROSTER_SEASON_STATE_V2"),
  careerId: IDSchema, controlledTeamId: IDSchema, schedule: RosterSeasonScheduleSchema,
  careerState: RosterCareerDayStateSchema, projection: RosterSeasonProjectionSchema,
  outcomes: z.array(z.union([RosterOffscreenFixtureOutcomeSchema, RosterManagedFixtureOutcomeSchema])).max(56), revision: CounterSchema,
  phase: z.enum(["ACTIVE", "COMPLETE"]), stateSha256: HashSchema,
});
export type RosterSeasonState = z.infer<typeof RosterSeasonStateSchema>;
export const RosterSeasonPortableManifestSchema = SeasonPortableManifestSchema.extend({
  archiveVersion: z.literal("LC_T20_ROSTER_SEASON_PORTABLE_V1"),
  saveSchema: z.literal("LC_SEASON_SAVE_V3_ROSTER"),
  rosterPackSha256: HashSchema,
});
