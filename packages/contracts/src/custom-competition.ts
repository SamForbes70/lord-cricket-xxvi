import { z } from "zod";
import { CounterSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";

/**
 * Stage 15, first slice: custom tournaments for the fictional world (owner decision, 17 November 2026, answer 5a).
 *
 * A competition is a manifest: which teams, which grounds, a format and a structure. Fixtures, standings and knockout
 * progression are derived from it and from recorded results, never stored separately. Matches are played by the
 * authoritative engines; a knockout match that ends tied is settled by super overs (Stage 14). Tournament results are
 * kept apart from every career.
 */
export const CUSTOM_COMPETITION_PACK_SCHEMA_ID = "LC_CUSTOM_COMPETITION_PACK_V1" as const;
export const TOURNAMENT_RUN_SCHEMA_ID = "LC_TOURNAMENT_RUN_V1" as const;

export const CustomCompetitionStructureSchema = z.discriminatedUnion("kind", [
  /** Everyone plays everyone `legs` times; with `finalTopTwo`, the top two then meet in a final. */
  z.strictObject({ kind: z.literal("ROUND_ROBIN"), legs: z.union([z.literal(1), z.literal(2)]), finalTopTwo: z.boolean() }),
  /**
   * Two groups play a single round robin; the top two of each go to semi-finals (A1 v B2, B1 v A2), then a final.
   */
  z.strictObject({ kind: z.literal("GROUPS_KNOCKOUT"), groups: z.tuple([z.array(IDSchema).min(3).max(4), z.array(IDSchema).min(3).max(4)]) }),
  /** A bilateral series of an odd number of matches; it ends early once one side cannot be caught. */
  z.strictObject({ kind: z.literal("SERIES"), matches: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]) }),
]);

export const CustomCompetitionSchema = z
  .strictObject({
    competitionId: IDSchema,
    title: z.string().min(1).max(80),
    format: z.enum(["T20", "ODI"]),
    sourceType: z.literal("FICTIONAL_CURATED"),
    worldPackId: z.literal("fictional-eight-01"),
    teamIds: z.array(IDSchema).min(2).max(8),
    groundIds: z.array(IDSchema).min(1).max(8),
    structure: CustomCompetitionStructureSchema,
    points: z.strictObject({ win: CounterSchema.max(10), tie: CounterSchema.max(10), loss: CounterSchema.max(10) }),
    summary: z.string().min(1).max(320),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.teamIds).size !== c.teamIds.length) ctx.addIssue({ code: "custom", message: "COMPETITION_DUPLICATE_TEAM" });
    if (new Set(c.groundIds).size !== c.groundIds.length) ctx.addIssue({ code: "custom", message: "COMPETITION_DUPLICATE_GROUND" });
    const s = c.structure;
    if (s.kind === "SERIES" && c.teamIds.length !== 2) ctx.addIssue({ code: "custom", message: "SERIES_NEEDS_TWO_TEAMS" });
    if (s.kind === "ROUND_ROBIN" && c.teamIds.length < (s.finalTopTwo ? 3 : 2))
      ctx.addIssue({ code: "custom", message: "ROUND_ROBIN_TOO_FEW_TEAMS" });
    if (s.kind === "GROUPS_KNOCKOUT") {
      const grouped = [...s.groups[0], ...s.groups[1]];
      if (new Set(grouped).size !== grouped.length || grouped.length !== c.teamIds.length || !grouped.every((t) => c.teamIds.includes(t)))
        ctx.addIssue({ code: "custom", message: "GROUPS_MUST_PARTITION_TEAMS" });
    }
  });

export const CustomCompetitionPackSchema = z.strictObject({
  schemaId: z.literal(CUSTOM_COMPETITION_PACK_SCHEMA_ID),
  packId: IDSchema,
  competitions: z.array(CustomCompetitionSchema).min(1).max(32),
});

export const TournamentStageSchema = z.enum(["LEAGUE", "GROUP_A", "GROUP_B", "SEMI_FINAL", "FINAL", "SERIES"]);

/** One derived fixture. Knockout fixtures appear only once the stage before them is complete. */
export const TournamentFixtureSchema = z.strictObject({
  fixtureId: IDSchema,
  matchNumber: PositiveCounterSchema,
  stage: TournamentStageSchema,
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  groundId: IDSchema,
});

/** The engine's result of one tournament match, as recorded. */
export const TournamentResultSchema = z.strictObject({
  fixtureId: IDSchema,
  homeTeamId: IDSchema,
  awayTeamId: IDSchema,
  resultKind: z.enum(["WIN", "TIE"]),
  /** The match winner; for a tie, null. */
  winnerTeamId: IDSchema.nullable(),
  /** For a tied knockout match, the side that won the super overs (or null if they stayed tied). */
  superOverWinnerTeamId: IDSchema.nullable(),
  homeRuns: CounterSchema,
  homeWickets: CounterSchema.max(10),
  homeLegalBalls: CounterSchema,
  awayRuns: CounterSchema,
  awayWickets: CounterSchema.max(10),
  awayLegalBalls: CounterSchema,
  resultText: z.string().min(1).max(160),
  /** Hash of the match's final event chain: the result can be traced to the exact engine session. */
  lastEventHash: HashSchema,
});

/** A tournament in progress or finished: the competition it plays and the results so far, in fixture order. */
export const TournamentRunSchema = z.strictObject({
  schemaId: z.literal(TOURNAMENT_RUN_SCHEMA_ID),
  runId: IDSchema,
  competitionId: IDSchema,
  competitionSha256: HashSchema,
  seed: z.string().min(1).max(128),
  results: z.array(TournamentResultSchema).max(64),
});

export type CustomCompetitionStructure = z.infer<typeof CustomCompetitionStructureSchema>;
export type CustomCompetition = z.infer<typeof CustomCompetitionSchema>;
export type CustomCompetitionPack = z.infer<typeof CustomCompetitionPackSchema>;
export type TournamentStage = z.infer<typeof TournamentStageSchema>;
export type TournamentFixture = z.infer<typeof TournamentFixtureSchema>;
export type TournamentResult = z.infer<typeof TournamentResultSchema>;
export type TournamentRun = z.infer<typeof TournamentRunSchema>;
