import { z } from "zod";
import {
  PERSISTENT_WORLD_PRESENTATION_SAVE_V4_SCHEMA_VERSION,
  PERSISTENT_WORLD_SAVE_V4_SCHEMA_VERSION,
  PersistentWorldPortableV3ManifestSchema,
} from "./squad-economy.js";

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

/**
 * Export of a world state V4 save (docs/design/WORLD_STATE_HISTORY_V4.md): the V4 gzip layout, a V4 save
 * schema, and every stored lifecycle roster pack, because the state embeds only the last two seasons'.
 * A new version, so V4 readers never meet a V4 world state.
 */
export const PERSISTENT_WORLD_PORTABLE_V5_ARCHIVE_VERSION = "LC_PERSISTENT_WORLD_PORTABLE_V5_WORLD_V4" as const;

export const PersistentWorldPortableV5ManifestSchema = PersistentWorldPortableV4ManifestSchema.extend({
  archiveVersion: z.literal(PERSISTENT_WORLD_PORTABLE_V5_ARCHIVE_VERSION),
  saveSchema: z.enum([
    PERSISTENT_WORLD_SAVE_V4_SCHEMA_VERSION,
    PERSISTENT_WORLD_PRESENTATION_SAVE_V4_SCHEMA_VERSION,
  ]),
});
export type PersistentWorldPortableV5Manifest = z.infer<typeof PersistentWorldPortableV5ManifestSchema>;
