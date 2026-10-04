import {
  DefaultWorldManifestSchema,
  validateWorldReferences,
  type DefaultWorldManifest,
  type WorldPack,
} from "@lcxxvi/contracts";
import { RULE_MANIFESTS } from "./rules.js";
import { SYNTHETIC_ALPHA_PACK, MODEL_PACK_SHA256 } from "./probability-pack.js";
import { DELIVERY_STAGE_PACK, DELIVERY_STAGE_PACK_SHA256 } from "./delivery-pack.js";
import { FROZEN_WORLD_PINS } from "./world-pins.js";

const unique = (items: readonly string[]) => new Set(items).size === items.length;
function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(`INVALID_DEFAULT_WORLD: ${message}`);
}
export const isBowlingCapable = (player: Pick<WorldPack["players"][number], "role" | "bowlingStyle">) =>
  player.bowlingStyle !== null && (player.role === "BOWLER" || player.role === "ALLROUNDER");

/**
 * Structural and provenance acceptance for this *default* 8x20 world only.
 * Never narrow generic WorldPack imports. Cryptographic byte verification is
 * performed by simulation/world-setup using the independently pinned SHA256.
 */
export function validateDefaultWorld(
  input: unknown,
  manifestInput: unknown,
): { world: WorldPack; manifest: DefaultWorldManifest } {
  const manifest = DefaultWorldManifestSchema.parse(manifestInput);
  const pins = FROZEN_WORLD_PINS;
  for (const key of Object.keys(pins) as (keyof typeof pins)[]) {
    assert(manifest[key] === pins[key], `manifest violates frozen ${key}`);
  }
  assert(manifest.modelHash === MODEL_PACK_SHA256, "model hash mismatch");
  assert(manifest.stagePackHash === DELIVERY_STAGE_PACK_SHA256, "stage pack hash mismatch");
  assert(manifest.modelId === SYNTHETIC_ALPHA_PACK.manifest.modelId, "wrong model");
  assert(manifest.stagePackId === DELIVERY_STAGE_PACK.stagePackId, "wrong stage pack");
  const allowedRules = RULE_MANIFESTS.map((r) => r.rulesId);
  assert(JSON.stringify(manifest.rulesIds) === JSON.stringify(allowedRules), "inconsistent rule IDs");
  assert(JSON.stringify(manifest.variationIds) === JSON.stringify(SYNTHETIC_ALPHA_PACK.manifest.variationIds), "model variation set mismatch");
  const world = validateWorldReferences(input, manifest.variationIds, allowedRules);
  assert(world.packId === manifest.worldPackId, "pack ID mismatch");
  assert(world.schemaVersion === manifest.schemaVersion, "schema mismatch");
  assert(world.players.length === 160 && world.teams.length === 8 && world.grounds.length === 8, "expected exactly 160 players, eight teams and eight grounds");
  assert(JSON.stringify(world.rulesIds) === JSON.stringify(manifest.rulesIds), "world rules differ from manifest");
  const teamIds = world.teams.map((t) => t.teamId);
  const groundIds = world.grounds.map((g) => g.groundId);
  const expectedIds = (label: string) => Array.from({ length: 8 }, (_, i) => `${label}-${String(i + 1).padStart(2, "0")}`);
  assert(JSON.stringify(teamIds) === JSON.stringify(expectedIds("team")), "team ID/order convention changed");
  assert(JSON.stringify(groundIds) === JSON.stringify(expectedIds("ground")), "ground ID/order convention changed");
  assert(JSON.stringify(teamIds) === JSON.stringify(manifest.teamIds) && JSON.stringify(groundIds) === JSON.stringify(manifest.groundIds), "world/manifest ID mismatch");
  const groundSet = new Set(groundIds);
  assert(JSON.stringify(Object.keys(manifest.homeGroundIds)) === JSON.stringify(teamIds), "home-ground keys mismatch");
  assert(manifest.homeGroundIds && unique(Object.values(manifest.homeGroundIds)) && Object.values(manifest.homeGroundIds).every((g) => groundSet.has(g)), "home-ground reference invalid");
  const byId = new Map(world.players.map((p) => [p.playerId, p]));
  const assigned: string[] = [];
  for (const team of world.teams) {
    assert(team.squadIds.length === 20, `20 players required: ${team.teamId}`);
    const squad = team.squadIds.map((id) => byId.get(id)!);
    assigned.push(...team.squadIds);
    assert(squad.filter((p) => p.role === "KEEPER").length >= 2, `keepers missing: ${team.teamId}`);
    assert(squad.filter(isBowlingCapable).length >= 6, `bowling capacity missing: ${team.teamId}`);
    assert(new Set(squad.map((p) => p.role)).size >= 3, `insufficient role variety: ${team.teamId}`);
    assert(unique(squad.map((p) => p.playerId)), `repeated player in squad: ${team.teamId}`);
    assert(new Set(squad.map((p) => p.batHand)).size === 2, `bat handedness missing: ${team.teamId}`);
    assert(new Set(squad.filter(isBowlingCapable).map((p) => p.bowlHand)).size === 2, `bowling handedness missing: ${team.teamId}`);
  }
  assert(unique(assigned) && assigned.length === 160 && assigned.every((id) => byId.has(id)), "shared squad member or missing assignment");
  for (const p of world.players) {
    assert(p.provenance.kind === "FICTIONAL" && p.provenance.sourceId === world.packId && p.provenance.sourceHash === manifest.provenanceSourceSha256, `wrong provenance: ${p.playerId}`);
    assert(p.exposureBalls.T20 === 0 && p.exposureBalls.ODI === 0 && p.exposureBalls.RED_BALL === 0, `invented exposure: ${p.playerId}`);
    assert(Object.keys(p.skills).length === 3 && Object.keys(p.exposureBalls).length === 3, `missing format or exposure: ${p.playerId}`);
    assert(p.variations.length === 1 && p.variations[0] === "stock", `unsupported variation: ${p.playerId}`);
  }
  return { world, manifest };
}
