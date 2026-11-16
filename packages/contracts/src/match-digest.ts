import { z } from "zod";
import { IDSchema } from "./core.js";

/**
 * Per-match digest: what statistics and awards need from a ball-by-ball archive (ground, crease order
 * per innings, fielding credits). Derived from a stored, verified archive; see
 * docs/design/MATCH_ARCHIVE_STORAGE_V2.md.
 */
export const CAREER_MATCH_DIGEST_VERSION = "LC_CAREER_MATCH_DIGEST_V1" as const;

const CounterSchema = z.number().int().min(0).max(1000);

export const CareerMatchDigestSchema = z.strictObject({
  digestVersion: z.literal(CAREER_MATCH_DIGEST_VERSION),
  fixtureId: IDSchema,
  groundId: IDSchema.nullable(),
  creaseOrder: z.tuple([z.array(IDSchema).max(64), z.array(IDSchema).max(64)]),
  fielding: z
    .array(
      z.strictObject({
        playerId: IDSchema,
        teamId: IDSchema,
        catches: CounterSchema,
        stumpings: CounterSchema,
        runOuts: CounterSchema,
      }),
    )
    .max(64),
});
export type CareerMatchDigest = z.infer<typeof CareerMatchDigestSchema>;
