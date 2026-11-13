import { z } from "zod";

export const DelegationCategorySchema = z.enum([
  "TOSS",
  "INNINGS",
  "BATTER",
  "BOWLER",
  "BATTING_PLAN",
  "BOWLING_PLAN",
  "FIELD",
  "DECLARATION",
  "FOLLOW_ON",
  "NEW_BALL",
]);
export const RedBallTacticalProfileSchema = z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]);
const CategoriesSchema = z
  .array(DelegationCategorySchema)
  .max(10)
  .refine(values => new Set(values).size === values.length)
  .meta({ uniqueItems: true });
export const DelegationChangeSchema = z.strictObject({
  commandId: z.string().min(1).max(128),
  expectedRevision: z.number().int().nonnegative(),
  matchRevision: z.number().int().nonnegative(),
  teamId: z.string().min(1).max(128),
  categories: CategoriesSchema,
  redBallProfile: RedBallTacticalProfileSchema.optional(),
});
export const DelegationJournalSchema = z.strictObject({
  version: z.literal("LC_DELEGATION_JOURNAL_V1"),
  changes: z.array(DelegationChangeSchema),
});
export type DelegationCategoryValue = z.infer<typeof DelegationCategorySchema>;
export type RedBallTacticalProfile = z.infer<typeof RedBallTacticalProfileSchema>;
export type DelegationChange = z.infer<typeof DelegationChangeSchema>;
export type DelegationJournal = z.infer<typeof DelegationJournalSchema>;

export function replayDelegationJournal(raw: unknown): DelegationJournal {
  const journal = DelegationJournalSchema.parse(raw);
  const ids = new Set<string>();
  let matchRevision = 0;
  journal.changes.forEach((change, index) => {
    if (change.expectedRevision !== index || change.matchRevision < matchRevision || ids.has(change.commandId)) {
      throw new Error("DELEGATION_JOURNAL_INVALID");
    }
    ids.add(change.commandId);
    matchRevision = change.matchRevision;
  });
  return journal;
}

export function appendDelegationChange(raw: unknown, input: unknown): DelegationJournal {
  const journal = replayDelegationJournal(raw);
  const change = DelegationChangeSchema.parse(input);
  const prior = journal.changes.find(item => item.commandId === change.commandId);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(change)) throw new Error("DELEGATION_DUPLICATE_CONFLICT");
    return journal;
  }
  if (change.expectedRevision !== journal.changes.length) throw new Error("DELEGATION_STALE_REVISION");
  if (change.matchRevision < (journal.changes.at(-1)?.matchRevision ?? 0)) throw new Error("DELEGATION_STALE_MATCH");
  return { ...journal, changes: [...journal.changes, change] };
}

export function delegationForTeam(raw: unknown, teamId: string): DelegationChange["categories"] {
  return replayDelegationJournal(raw).changes.filter(change => change.teamId === teamId).at(-1)?.categories ?? [];
}

export function redBallProfileForTeam(raw: unknown, teamId: string): RedBallTacticalProfile {
  return (
    replayDelegationJournal(raw)
      .changes.filter(change => change.teamId === teamId && change.redBallProfile !== undefined)
      .at(-1)?.redBallProfile ?? "BALANCED"
  );
}
