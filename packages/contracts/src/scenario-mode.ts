import { z } from "zod";
import { CounterSchema, FormatSchema, HashSchema, IDSchema, PositiveCounterSchema } from "./core.js";

/**
 * Stage 12: fictional scenario challenges (docs/ROADMAP_AND_AI_GUIDE.md).
 *
 * A challenge is a match on the frozen fictional world with a fixed seed. The worker plays the match forward with the
 * engines' own deterministic fixture autopilot until `checkpoint` is reached, checks that the reached state matches the
 * declared checkpoint exactly, and only then hands the match to the player. Nothing is staged by hand: every ball before
 * the checkpoint was produced by the authoritative engine. Scenario matches are ordinary exhibition saves; no career
 * state, fixture or statistic ever reads them.
 */
export const SCENARIO_CHALLENGE_SCHEMA_ID = "LC_SCENARIO_CHALLENGE_V1" as const;
export const SCENARIO_RECORD_LEDGER_SCHEMA_ID = "LC_SCENARIO_RECORD_LEDGER_V1" as const;

export const ScenarioDifficultySchema = z.enum(["STANDARD", "HARD", "ELITE"]);

/** WIN: the player's team must win. AVOID_DEFEAT: a win, tie or draw completes the challenge. */
export const ScenarioObjectiveSchema = z.enum(["WIN", "AVOID_DEFEAT"]);

/** The state the fast-forward must reach: the first moment the given innings has at least `legalBalls` legal balls. */
export const ScenarioCheckpointSchema = z.strictObject({
  inningsIndex: CounterSchema.max(3),
  legalBalls: CounterSchema.max(3000),
  /** Pinned engine output at the checkpoint. A mismatch means the engine or pack changed, so the start is refused. */
  revision: PositiveCounterSchema,
  battingTeamId: IDSchema,
  runs: CounterSchema.max(2000),
  wickets: CounterSchema.max(10),
  targetToWin: PositiveCounterSchema.max(2000).nullable(),
});

export const ScenarioChallengeSchema = z.strictObject({
  schemaId: z.literal(SCENARIO_CHALLENGE_SCHEMA_ID),
  scenarioId: IDSchema,
  title: z.string().min(1).max(80),
  format: FormatSchema,
  difficulty: ScenarioDifficultySchema,
  sourceType: z.literal("FICTIONAL_CURATED"),
  /** Fixed match seed. The player's own decisions after the checkpoint decide the rest. */
  seed: z.string().min(1).max(256),
  /** Fixed match id. The engines' random stream is keyed by seed and match id, so both are part of the recipe. */
  matchId: IDSchema,
  /** Home then away. Each side plays the world's suggested XI. */
  teamIds: z.tuple([IDSchema, IDSchema]),
  groundId: IDSchema,
  playerTeamId: IDSchema,
  objective: ScenarioObjectiveSchema,
  objectiveSummary: z.string().min(1).max(160),
  briefing: z.string().min(1).max(480),
  checkpoint: ScenarioCheckpointSchema,
});

export const ScenarioOutcomeSchema = z.enum(["COMPLETED", "FAILED"]);

/** Personal bests for one challenge, keyed by the exact challenge definition it was played against. */
export const ScenarioPersonalBestSchema = z.strictObject({
  scenarioId: IDSchema,
  challengeSha256: HashSchema,
  attempts: PositiveCounterSchema,
  completions: CounterSchema,
  failures: CounterSchema,
  /** Best completing margin: wickets in hand for a chase, runs for a defence. Null until a completion has a margin. */
  bestMarginType: z.enum(["RUNS", "WICKETS", "INNINGS"]).nullable(),
  bestMarginValue: PositiveCounterSchema.nullable(),
  lastOutcome: ScenarioOutcomeSchema.nullable(),
});

/**
 * One scenario match. Counted when it starts and scored once, when its managed lineage (the auto save or its recovered
 * copy) completes; manual copies and imports are never scored. The objective is copied here so a later pack change
 * cannot change how an earlier attempt is judged.
 */
export const ScenarioAttemptSchema = z.strictObject({
  gameId: IDSchema,
  scenarioId: IDSchema,
  challengeSha256: HashSchema,
  playerTeamId: IDSchema,
  objective: ScenarioObjectiveSchema,
  outcome: ScenarioOutcomeSchema.nullable(),
  resultText: z.string().min(1).max(160).nullable(),
});

export const ScenarioRecordLedgerSchema = z
  .strictObject({
    schemaId: z.literal(SCENARIO_RECORD_LEDGER_SCHEMA_ID),
    records: z.array(ScenarioPersonalBestSchema).max(256),
    /** The most recent attempts, oldest first. Older ones drop off; their counts stay in `records`. */
    attempts: z.array(ScenarioAttemptSchema).max(64),
  })
  .superRefine((ledger, ctx) => {
    const records = new Set(ledger.records.map((r) => `${r.scenarioId}:${r.challengeSha256}`));
    if (records.size !== ledger.records.length) ctx.addIssue({ code: "custom", message: "SCENARIO_RECORD_DUPLICATE" });
    if (new Set(ledger.attempts.map((a) => a.gameId)).size !== ledger.attempts.length)
      ctx.addIssue({ code: "custom", message: "SCENARIO_ATTEMPT_DUPLICATE" });
    for (const r of ledger.records)
      if (r.completions + r.failures > r.attempts) ctx.addIssue({ code: "custom", message: "SCENARIO_RECORD_COUNTS" });
    for (const a of ledger.attempts)
      if ((a.outcome === null) !== (a.resultText === null)) ctx.addIssue({ code: "custom", message: "SCENARIO_ATTEMPT_RESULT" });
  });

export type ScenarioDifficulty = z.infer<typeof ScenarioDifficultySchema>;
export type ScenarioObjective = z.infer<typeof ScenarioObjectiveSchema>;
export type ScenarioCheckpoint = z.infer<typeof ScenarioCheckpointSchema>;
export type ScenarioChallenge = z.infer<typeof ScenarioChallengeSchema>;
export type ScenarioOutcome = z.infer<typeof ScenarioOutcomeSchema>;
export type ScenarioPersonalBest = z.infer<typeof ScenarioPersonalBestSchema>;
export type ScenarioAttempt = z.infer<typeof ScenarioAttemptSchema>;
export type ScenarioRecordLedger = z.infer<typeof ScenarioRecordLedgerSchema>;
