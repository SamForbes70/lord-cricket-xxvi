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

type CompetitionCheck = {
  teamIds: string[];
  groundIds: string[];
  structure: z.infer<typeof CustomCompetitionStructureSchema>;
};
function checkCompetition(c: CompetitionCheck, ctx: z.RefinementCtx): void {
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
}
/** One competition shape for both sources; only the source marker differs. */
function competitionSchema<S extends "FICTIONAL_CURATED" | "USER_AUTHORED">(sourceType: S) {
  return z.strictObject({
    competitionId: IDSchema,
    title: z.string().min(1).max(80),
    format: z.enum(["T20", "ODI"]),
    sourceType: z.literal(sourceType),
    worldPackId: z.literal("fictional-eight-01"),
    teamIds: z.array(IDSchema).min(2).max(8),
    groundIds: z.array(IDSchema).min(1).max(8),
    structure: CustomCompetitionStructureSchema,
    points: z.strictObject({ win: CounterSchema.max(10), tie: CounterSchema.max(10), loss: CounterSchema.max(10) }),
    summary: z.string().min(1).max(320),
  });
}
export const CustomCompetitionSchema = competitionSchema("FICTIONAL_CURATED").superRefine(checkCompetition);

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

/**
 * Stage 15, user-authored tournaments (owner decision 5a: the parts that need no historical data). A player builds a
 * competition from the fictional world's teams and grounds. It has the same shape as a curated one, marked
 * `USER_AUTHORED`, and its id always starts with `user-`, so it can never collide with a curated competition.
 */
export const USER_COMPETITION_SCHEMA_ID = "LC_USER_COMPETITION_V1" as const;
export const USER_COMPETITION_PACK_SCHEMA_ID = "LC_USER_COMPETITION_PACK_V1" as const;
export const UserCompetitionSchema = competitionSchema("USER_AUTHORED").superRefine((c, ctx) => {
  checkCompetition(c, ctx);
  if (!c.competitionId.startsWith("user-")) ctx.addIssue({ code: "custom", message: "USER_COMPETITION_ID_PREFIX" });
});
/** The stored row for one user-authored competition. */
export const UserCompetitionRecordSchema = z.strictObject({
  schemaId: z.literal(USER_COMPETITION_SCHEMA_ID),
  competition: UserCompetitionSchema,
});
/** A file of user-authored competitions, for sharing between players. */
export const UserCompetitionPackSchema = z.strictObject({
  schemaId: z.literal(USER_COMPETITION_PACK_SCHEMA_ID),
  competitions: z.array(UserCompetitionSchema).min(1).max(32),
});
/**
 * Stage 15 tours (owner decisions A1a and A2a, 18 November 2026): a fictional touring side plays a series against one
 * host team. Tournament only, never in a career. The touring XI is picked automatically from the other seven teams by a
 * fixed rating rule, so a tour stores only its choices. Its id starts with `user-tour-`, so the series it plays is an
 * ordinary user-authored competition.
 */
export const USER_TOUR_SCHEMA_ID = "LC_USER_TOUR_V1" as const;
export const UserTourSchema = z.strictObject({
  tourId: IDSchema.refine((id) => id.startsWith("user-tour-"), "USER_TOUR_ID_PREFIX"),
  title: z.string().min(1).max(80),
  format: z.enum(["T20", "ODI"]),
  hostTeamId: IDSchema,
  touringName: z.string().min(1).max(40),
  matches: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
  groundIds: z.array(IDSchema).min(1).max(8),
});
/** The stored row for one tour. */
export const UserTourRecordSchema = z.strictObject({ schemaId: z.literal(USER_TOUR_SCHEMA_ID), tour: UserTourSchema });

/**
 * Stage 15 tournament auctions (owner decisions B1a, B2b, B3a and B4a, 18 November 2026): before one of the player's
 * own tournaments starts, squads are rebuilt by an auction of the fictional players. The record keeps only what fixes
 * the result (the seed and the player's decisions); the squads are found by running the auction again, and must hash to
 * `squadsSha256`.
 */
export const TOURNAMENT_AUCTION_SCHEMA_ID = "LC_TOURNAMENT_AUCTION_V1" as const;
export const AuctionDecisionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("BID"), max: PositiveCounterSchema.max(1000) }),
  z.strictObject({ kind: z.literal("PASS") }),
  z.strictObject({ kind: z.literal("AUTO") }),
]);
export const TournamentAuctionRecordSchema = z.strictObject({
  schemaId: z.literal(TOURNAMENT_AUCTION_SCHEMA_ID),
  runId: IDSchema,
  competitionId: IDSchema,
  seed: z.string().min(1).max(160),
  /** The team the player bid for, or null when the AI bid for every team. */
  playerTeamId: IDSchema.nullable(),
  decisions: z.array(AuctionDecisionSchema).max(400),
  squadsSha256: HashSchema,
});

/** Either kind of competition, as the tournament code receives it. */
export const CompetitionSchema = z.union([CustomCompetitionSchema, UserCompetitionSchema]);

export type CustomCompetitionStructure = z.infer<typeof CustomCompetitionStructureSchema>;
export type UserCompetition = z.infer<typeof UserCompetitionSchema>;
export type UserCompetitionRecord = z.infer<typeof UserCompetitionRecordSchema>;
export type UserCompetitionPack = z.infer<typeof UserCompetitionPackSchema>;
export type UserTour = z.infer<typeof UserTourSchema>;
export type AuctionDecisionRecord = z.infer<typeof AuctionDecisionSchema>;
export type TournamentAuctionRecord = z.infer<typeof TournamentAuctionRecordSchema>;
export type UserTourRecord = z.infer<typeof UserTourRecordSchema>;
/** A curated or a user-authored competition. */
export type Competition = z.infer<typeof CompetitionSchema>;
export type CustomCompetition = z.infer<typeof CustomCompetitionSchema>;
export type CustomCompetitionPack = z.infer<typeof CustomCompetitionPackSchema>;
export type TournamentStage = z.infer<typeof TournamentStageSchema>;
export type TournamentFixture = z.infer<typeof TournamentFixtureSchema>;
export type TournamentResult = z.infer<typeof TournamentResultSchema>;
export type TournamentRun = z.infer<typeof TournamentRunSchema>;
