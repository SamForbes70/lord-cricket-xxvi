import { canonicalJson, NewGameWorldCopySchema, validateWorldReferences, type NewGameWorldCopy, type WorldPack } from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS } from "@lcxxvi/data";
import { createStateHasher } from "@lcxxvi/simulation";

const VERSION = "LC_NEW_GAME_WORLD_COPY_V1" as const;
const hasher = createStateHasher();
export type { NewGameWorldCopy } from "@lcxxvi/contracts";

function checkedDraft(raw: unknown, base: WorldPack): WorldPack {
  if (hasher.hash(base) !== FROZEN_WORLD_PINS.worldCanonicalSha256) throw new Error("The original world does not match its accepted hash.");
  const world = validateWorldReferences(raw, ["stock"], base.rulesIds);
  const names = [...world.players, ...world.teams, ...world.grounds].map(entity => entity.name);
  if (names.some(name => name.trim() !== name || name.length === 0 || [...name].some(character => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159);
  }))) {
    throw new Error("Names must have 1 to 80 characters, with no control characters or surrounding spaces.");
  }
  const restored = structuredClone(world);
  restored.packId = base.packId;
  if (restored.players.length !== base.players.length || restored.teams.length !== base.teams.length || restored.grounds.length !== base.grounds.length) {
    throw new Error("This editor cannot add or remove players, teams or grounds.");
  }
  restored.players.forEach((player, index) => { player.name = base.players[index]!.name; });
  restored.teams.forEach((team, index) => { team.name = base.teams[index]!.name; team.colours = [...base.teams[index]!.colours]; });
  restored.grounds.forEach((ground, index) => { ground.name = base.grounds[index]!.name; });
  if (canonicalJson(restored) !== canonicalJson(base)) throw new Error("Only names and team colours can change in this editor.");
  return world;
}

export function createNewGameWorldCopy(raw: unknown, base: WorldPack): NewGameWorldCopy {
  const world = checkedDraft(raw, base);
  world.packId = base.packId;
  const identity = hasher.hash({ copyVersion: VERSION, baseWorldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256, world });
  world.packId = `world-edit-${identity}`;
  return NewGameWorldCopySchema.parse({
    copyVersion: VERSION,
    baseWorldCanonicalSha256: FROZEN_WORLD_PINS.worldCanonicalSha256,
    worldCanonicalSha256: hasher.hash(world),
    world,
  });
}

export function validateNewGameWorldCopy(raw: unknown, base: WorldPack): NewGameWorldCopy {
  if (!raw || typeof raw !== "object" || !("copyVersion" in raw) || raw.copyVersion !== VERSION) throw new Error("Unsupported world copy version.");
  const copy = NewGameWorldCopySchema.parse(raw);
  if (copy.baseWorldCanonicalSha256 !== FROZEN_WORLD_PINS.worldCanonicalSha256) throw new Error("The world copy has an unsupported base world.");
  if (hasher.hash(copy.world) !== copy.worldCanonicalSha256) throw new Error("The world copy hash does not match its contents.");
  const rebuilt = createNewGameWorldCopy(copy.world, base);
  if (canonicalJson(copy) !== canonicalJson(rebuilt)) throw new Error("The world copy identity does not match its contents.");
  return copy;
}
