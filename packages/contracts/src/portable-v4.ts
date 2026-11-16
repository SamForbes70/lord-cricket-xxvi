import { z } from "zod";
import { PersistentWorldPortableV3ManifestSchema } from "./squad-economy.js";

/**
 * Persistent-world export with gzip-compressed entries (docs/design/MATCH_ARCHIVE_STORAGE_V2.md, step 5).
 * The contents are those of V3; every payload file is stored as `<name>.gz`, and `files` records the
 * uncompressed size and sha256 of each, so verification is unchanged after decompression.
 */
export const PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION = "LC_PERSISTENT_WORLD_PORTABLE_V4_GZIP" as const;

export const PersistentWorldPortableV4ManifestSchema = PersistentWorldPortableV3ManifestSchema.extend({
  archiveVersion: z.literal(PERSISTENT_WORLD_PORTABLE_V4_ARCHIVE_VERSION),
  compression: z.literal("gzip"),
});
export type PersistentWorldPortableV4Manifest = z.infer<typeof PersistentWorldPortableV4ManifestSchema>;
