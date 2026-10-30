import { z } from "zod";
import { HashSchema } from "./core.js";
import { WorldPackSchema } from "./configuration.js";

export const NewGameWorldCopySchema = z.strictObject({
  copyVersion: z.literal("LC_NEW_GAME_WORLD_COPY_V1"),
  baseWorldCanonicalSha256: HashSchema,
  worldCanonicalSha256: HashSchema,
  world: WorldPackSchema,
});
export type NewGameWorldCopy = z.infer<typeof NewGameWorldCopySchema>;
