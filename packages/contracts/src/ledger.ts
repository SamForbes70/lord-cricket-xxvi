import { z } from "zod";
import {
  CounterSchema,
  IDSchema,
  InningsStateSchema,
  DismissalSchema,
} from "./core.js";
export const SCORING_ENGINE_VERSION = "LC_SCORING_V1" as const;
export const BattingLineSchema = z.strictObject({
  runs: CounterSchema,
  ballsFaced: CounterSchema,
  fours: CounterSchema,
  sixes: CounterSchema,
  dismissed: z.boolean(),
});
export const BowlingLineSchema = z.strictObject({
  runsConceded: CounterSchema,
  legalBalls: CounterSchema,
  wickets: CounterSchema,
  maidens: CounterSchema,
});
/** One innings ledger; match orchestration, clock and persistence are separate owners. */
export const InningsLedgerSchema = z.strictObject({
  engineVersion: z.literal(SCORING_ENGINE_VERSION),
  rulesId: z.enum(["LC_T20_01", "LC_ODI_01", "LC_RED5_01"]),
  innings: InningsStateSchema,
  nextDeliveryIndex: CounterSchema,
  batting: z.record(IDSchema, BattingLineSchema),
  dismissals: z.record(IDSchema, DismissalSchema),
  bowling: z.record(IDSchema, BowlingLineSchema),
  keeperId: IDSchema,
  outfieldIds: z.array(IDSchema).length(9),
  currentOverRuns: CounterSchema,
});
export type BattingLine = z.infer<typeof BattingLineSchema>;
export type BowlingLine = z.infer<typeof BowlingLineSchema>;
export type InningsLedger = z.infer<typeof InningsLedgerSchema>;
