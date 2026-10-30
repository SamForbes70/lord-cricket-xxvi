import { z } from "zod";
import { CounterSchema, FormatSkillsSchema, HashSchema, IDSchema, PlayerSchema } from "./core.js";
import { WorldPackSchema } from "./configuration.js";
import { T20MatchExecutionManifestSchema } from "./t20-match.js";

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
