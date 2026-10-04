import {
  canonicalJson,
  T20MatchSetupRequestSchema,
  type Player,
  type Ground,
  type RuleManifest,
  type DefaultWorldManifest,
  type MatchVersions,
  type T20TeamSelection,
} from "@lcxxvi/contracts";
import {
  DELIVERY_STAGE_PACK,
  DELIVERY_STAGE_PACK_SHA256,
  FROZEN_WORLD_PINS,
  MODEL_PACK_SHA256,
  RULE_MANIFESTS,
  SYNTHETIC_ALPHA_PACK,
  isBowlingCapable,
  validateDefaultWorld,
} from "@lcxxvi/data";
import { canonicalStateBytes, sha256Hex } from "./determinism.js";

const VERIFIED_SETUP_INSTANCES = new WeakSet<object>();
/** In-process authenticity marker: a JSON object with fabricated hashes is not a validated 07A setup. */
export function isVerifiedFrozenT20Setup(value: unknown): value is FrozenT20Setup {
  return !!value && typeof value === "object" && VERIFIED_SETUP_INSTANCES.has(value);
}
const REQUIRED_MODEL = canonicalJson(SYNTHETIC_ALPHA_PACK);
const REQUIRED_STAGE = canonicalJson(DELIVERY_STAGE_PACK);
const T20_RULE = RULE_MANIFESTS.find((rule) => rule.rulesId === "LC_T20_01");
if (!T20_RULE) throw new Error("INVALID_SETUP: frozen T20 rule manifest missing");
const REQUIRED_RULE = canonicalJson(T20_RULE);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`INVALID_T20_SETUP: ${message}`);
}
/** Freeze validated copies rather than caller-owned input objects. Arrays are frozen too. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export type FrozenTeamSelection = Readonly<{
  teamId: string;
  name: string;
  playerIds: readonly string[];
  xi: readonly Readonly<Player>[];
  captainId: string;
  keeperId: string;
}>;
export type FrozenT20Setup = Readonly<{
  setupVersion: "LC_T20_SETUP_V1";
  gameId: string;
  matchId: string;
  seed: string;
  format: "T20";
  teams: readonly [FrozenTeamSelection, FrozenTeamSelection];
  ground: Readonly<Ground>;
  versions: Readonly<MatchVersions>;
  stagePackHash: string;
  modelStatus: "SYNTHETIC_ALPHA";
  worldSeed: string;
  fixtureOnly: true;
}>;
/**
 * Accepts the exact original UTF-8 world file bytes. It cannot be tricked by
 * JSON reformatting, altered manifests or a forged caller-supplied hash.
 */
export function verifyFrozenWorldBytes(
  worldBytes: Readonly<Uint8Array>,
  manifestInput: unknown,
): { world: ReturnType<typeof validateDefaultWorld>["world"]; manifest: DefaultWorldManifest } {
  assert(worldBytes instanceof Uint8Array && worldBytes.byteLength > 0, "world bytes missing");
  const rawHash = sha256Hex(worldBytes);
  assert(rawHash === FROZEN_WORLD_PINS.worldFileSha256, "world file bytes are not the frozen published world");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(worldBytes));
  } catch {
    throw new Error("INVALID_T20_SETUP: world bytes are not strict UTF-8 JSON");
  }
  const validated = validateDefaultWorld(parsed, manifestInput);
  assert(worldBytes.byteLength === validated.manifest.worldByteLength, "world file length mismatch");
  assert(rawHash === validated.manifest.worldFileSha256, "world file manifest hash mismatch");
  const canonicalHash = sha256Hex(canonicalStateBytes(validated.world));
  assert(canonicalHash === validated.manifest.worldCanonicalSha256, "canonical world manifest hash mismatch");
  assert(canonicalHash === FROZEN_WORLD_PINS.worldCanonicalSha256, "published canonical world pin mismatch");
  return validated;
}

/**
 * Pass 07A immutable, pre-toss T20 bootstrap. This function NEVER samples a
 * toss, starts an innings, grants gameplay or mutates the world/selected XIs.
 * The caller passes frozen trusted rule/model/stage objects and file bytes.
 */
export function validateT20MatchSetup(
  input: unknown,
  worldBytes: Readonly<Uint8Array>,
  manifestInput: unknown,
  ruleInput: unknown = T20_RULE,
  modelInput: unknown = SYNTHETIC_ALPHA_PACK,
  stageInput: unknown = DELIVERY_STAGE_PACK,
): FrozenT20Setup {
  const request = T20MatchSetupRequestSchema.parse(input);
  const { world, manifest } = verifyFrozenWorldBytes(worldBytes, manifestInput);
  assert(request.setup.format === "T20", "only T20 setup is supported");
  assert(request.setup.worldPackId === world.packId, "wrong world ID");
  assert(request.setup.randomId === manifest.randomId, "unsupported random ID");
  assert(request.setup.modelId === manifest.modelId, "unsupported model ID");
  assert(request.setup.rulesId === "LC_T20_01" && world.rulesIds.includes(request.setup.rulesId), "unsupported T20 rules");
  assert(!request.setup.capabilities.limitedOversRain && !request.setup.capabilities.superOver && !request.setup.capabilities.injuries && !request.setup.capabilities.prediction, "unsupported gameplay capability enabled");
  assert(request.worldFileSha256 === manifest.worldFileSha256 && request.worldCanonicalSha256 === manifest.worldCanonicalSha256, "setup world hash mismatch");
  assert(canonicalJson(ruleInput) === REQUIRED_RULE, "non-pinned T20 rule manifest");
  assert(canonicalJson(modelInput) === REQUIRED_MODEL, "non-pinned probability pack");
  assert(canonicalJson(stageInput) === REQUIRED_STAGE, "non-pinned conditional-delivery stage pack");
  const ruleHash = sha256Hex(canonicalStateBytes(ruleInput));
  assert(request.rulesHash === ruleHash, "T20 rules hash mismatch");
  assert(request.modelHash === MODEL_PACK_SHA256 && request.modelHash === manifest.modelHash, "probability model hash mismatch");
  assert(request.stagePackHash === DELIVERY_STAGE_PACK_SHA256 && request.stagePackHash === manifest.stagePackHash, "stage pack hash mismatch");
  assert(
    (ruleInput as RuleManifest).format === "T20" &&
    (ruleInput as RuleManifest).allocatedBalls === 120 &&
    (ruleInput as RuleManifest).bowlerMaxBalls === 24 &&
    (stageInput as typeof DELIVERY_STAGE_PACK).noLiveMatchOrCalibration,
    "T20 setup cannot enable unsupported game rules or live play",
  );
  assert(new Set(request.setup.teamIds).size === 2, "teams must differ");
  assert(request.selectedTeams.every((selection, index) => selection.teamId === request.setup.teamIds[index]), "selection order must equal match team order");
  const byId = new Map(world.players.map((player) => [player.playerId, player]));
  const selectedTeams = request.selectedTeams.map((selection: T20TeamSelection): FrozenTeamSelection => {
    const team = world.teams.find((candidate) => candidate.teamId === selection.teamId);
    assert(!!team, `unknown team ${selection.teamId}`);
    assert(new Set(selection.playerIds).size === 11, `duplicate player in XI ${selection.teamId}`);
    const teamSquad = new Set(team.squadIds);
    assert(selection.playerIds.every((id) => teamSquad.has(id) && byId.has(id)), `XI player not in own squad ${selection.teamId}`);
    assert(selection.playerIds.includes(selection.captainId), `captain not selected ${selection.teamId}`);
    assert(selection.playerIds.includes(selection.keeperId), `keeper not selected ${selection.teamId}`);
    const players = selection.playerIds.map((id) => byId.get(id)!);
    assert(players.find((p) => p.playerId === selection.keeperId)?.role === "KEEPER", `designated keeper ineligible ${selection.teamId}`);
    assert(players.filter(isBowlingCapable).length >= 5, `XI lacks five bowling-capable players ${selection.teamId}`);
    return deepFreeze({ teamId: team.teamId, name: team.name, playerIds: [...selection.playerIds],
      xi: players.map((player) => structuredClone(player)), captainId: selection.captainId, keeperId: selection.keeperId });
  }) as [FrozenTeamSelection, FrozenTeamSelection];
  const allPlayers = selectedTeams.flatMap((team) => team.playerIds);
  assert(new Set(allPlayers).size === 22, "teams cannot share XI players");
  const ground = world.grounds.find((g) => g.groundId === request.setup.groundId);
  assert(!!ground, "unknown match ground");
  const versions: MatchVersions = {
    schema: "1.0.0", engine: "LC_T20_SETUP_V1", random: manifest.randomId,
    rules: request.setup.rulesId, rulesHash: ruleHash,
    model: manifest.modelId, modelHash: MODEL_PACK_SHA256,
    worldHash: manifest.worldCanonicalSha256,
  };
  const frozen:FrozenT20Setup=deepFreeze({
    setupVersion: "LC_T20_SETUP_V1", gameId: request.setup.gameId, matchId: request.setup.matchId,
    seed: request.setup.seed, format: "T20" as const, teams: selectedTeams,
    ground: structuredClone(ground), versions,
    stagePackHash: DELIVERY_STAGE_PACK_SHA256,
    modelStatus: "SYNTHETIC_ALPHA" as const,
    worldSeed: manifest.worldSeed, fixtureOnly: true as const,
  });
  VERIFIED_SETUP_INSTANCES.add(frozen);
  return frozen;
}
