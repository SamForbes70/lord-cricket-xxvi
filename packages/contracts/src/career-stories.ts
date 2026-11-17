import { z } from "zod";
import { IDSchema, PositiveCounterSchema } from "./core.js";

/**
 * Stage 11: player and manager stories (docs/ROADMAP_AND_AI_GUIDE.md). Story cards are derived, never stored:
 * each is computed from committed career data (match facts, the awards ledger, contracts and the lifecycle),
 * and every number in its text is listed in `factProvenance`. Nothing is invented.
 */
export const CAREER_STORIES_SCHEMA_ID = "LC_CAREER_STORIES_PROJECTION_V1" as const;

export const CareerStoryCategorySchema = z.enum([
  "MILESTONE_BATTING",
  "MILESTONE_BOWLING",
  "MILESTONE_FIELDING",
  "FORM_STREAK",
  "YOUTH_BREAKTHROUGH",
  "CONTRACT_TENSION",
  "RETIREMENT_WATCH",
  "AWARD_RECOGNITION",
  "CLUB_BOARD_REVIEW",
]);

/** One fact a story rests on, such as `careerRuns: 1012`. */
export const CareerStoryFactSchema = z.strictObject({
  key: z.string().min(1).max(80),
  value: z.union([z.string().min(1).max(200), z.number().int()]),
});

export const CareerStoryCardSchema = z.strictObject({
  /** Deterministic: `${seasonNumber}:${roundNumber}:${category}:${subjectId}`. */
  storyId: z.string().min(1).max(256),
  seasonNumber: PositiveCounterSchema,
  /** League round the story belongs to (1 to 14); season-end stories use the final round. */
  roundNumber: z.number().int().min(1).max(99),
  category: CareerStoryCategorySchema,
  headline: z.string().min(1).max(160),
  summaryText: z.string().min(1).max(480),
  subjectPlayerId: IDSchema.nullable(),
  subjectTeamId: IDSchema.nullable(),
  /** `${seasonNumber}:${fixtureId}` when a match replay backs the story. */
  linkedMatchKey: z.string().min(1).max(160).nullable(),
  factProvenance: z.array(CareerStoryFactSchema).min(1).max(20),
});

export const CareerStoriesProjectionSchema = z.strictObject({
  schemaId: z.literal(CAREER_STORIES_SCHEMA_ID),
  worldOrCareerId: IDSchema,
  stories: z.array(CareerStoryCardSchema).max(20000),
});

export type CareerStoryCategory = z.infer<typeof CareerStoryCategorySchema>;
export type CareerStoryFact = z.infer<typeof CareerStoryFactSchema>;
export type CareerStoryCard = z.infer<typeof CareerStoryCardSchema>;
export type CareerStoriesProjection = z.infer<typeof CareerStoriesProjectionSchema>;
