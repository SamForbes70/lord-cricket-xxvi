import {
  canonicalJson, FormatSkillsSchema, ROSTER_FORMATS, ROSTER_IMPORT_MAX_BYTES, RosterImportSourceSchema,
  StagedRosterPackSchema, RosterMatchSelectionSchema, RosterMatchPreparationSchema, validateWorldReferences, type StagedRosterPack, type WorldPack,
} from "@lcxxvi/contracts";
import { DELIVERY_STAGE_PACK_SHA256, MODEL_PACK_SHA256, RULE_MANIFESTS, SYNTHETIC_ALPHA_PACK } from "@lcxxvi/data";
import { createStateHasher } from "./determinism.js";

const prior = Object.fromEntries(Object.keys(FormatSkillsSchema.shape).map(key => [key, 50])) as WorldPack["players"][number]["skills"]["T20"];
export const ROSTER_NEW_PACK_MAX_BYTES = 8 * 1024 * 1024;

export type StagedRosterImport = {
  world: WorldPack;
  sourceHash: string;
  priorFields: { playerId: string; format: typeof ROSTER_FORMATS[number]; fields: string[]; exposureMissing: boolean }[];
};

export function stageRosterImport(text: string, allowedRules: readonly string[], allowedVariations: readonly string[]): StagedRosterImport {
  if (new TextEncoder().encode(text).byteLength > ROSTER_IMPORT_MAX_BYTES) throw new Error("Roster import exceeds 25 MB.");
  const source = RosterImportSourceSchema.parse(JSON.parse(text));
  const sourceHash = createStateHasher().hash(source);
  const priorFields: StagedRosterImport["priorFields"] = [];
  const players = source.world.players.map(player => {
    const skills = {} as WorldPack["players"][number]["skills"];
    const exposureBalls = {} as WorldPack["players"][number]["exposureBalls"];
    for (const format of ROSTER_FORMATS) {
      const supplied = player.skills?.[format] ?? {};
      const fields = Object.keys(prior).filter(field => !(field in supplied));
      const exposureMissing = player.exposureBalls?.[format] === undefined;
      if (fields.length || exposureMissing) priorFields.push({ playerId: player.playerId, format, fields, exposureMissing });
      skills[format] = FormatSkillsSchema.parse({ ...prior, ...supplied });
      exposureBalls[format] = player.exposureBalls?.[format] ?? 0;
    }
    return { ...player, skills, exposureBalls, provenance: { kind: "USER_SUPPLIED" as const, sourceId: source.sourceId, sourceHash, confidenceBp: 1000 } };
  });
  const world = validateWorldReferences({ ...source.world, packId: `world-import-${sourceHash}`, provenance: `User-supplied roster ${source.sourceId}; source ${sourceHash}`, players }, allowedVariations, allowedRules);
  const names = [...world.players, ...world.teams, ...world.grounds].map(entity => entity.name);
  if (names.some(name => name !== name.trim() || [...name].some(character => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159);
  }))) throw new Error("Names cannot contain control characters or surrounding spaces.");
  const byId = new Map(world.players.map(player => [player.playerId, player]));
  const assigned = new Set<string>();
  for (const team of world.teams) {
    const squad = team.squadIds.map(id => byId.get(id)!);
    if (!squad.some(player => player.role === "KEEPER") || squad.filter(player => player.bowlingStyle !== null && ["BOWLER", "ALLROUNDER"].includes(player.role)).length < 5) throw new Error(`Roster cannot form a valid XI: ${team.teamId}`);
    for (const player of squad) {
      if (assigned.has(player.playerId)) throw new Error(`Player belongs to multiple squads: ${player.playerId}`);
      assigned.add(player.playerId);
    }
  }
  if (assigned.size !== world.players.length) throw new Error("Every imported player must belong to one squad.");
  return { world, sourceHash, priorFields };
}

const verifiedRosterPacks = new WeakMap<object, Set<string>>();
const cachedPackDigests = new WeakMap<object, { worldHash: string; rosterPackHash: string }>();
const cachedRuleDigests = new Map<string, string>();
function rosterPackScopeKey(allowedRules: readonly string[], allowedVariations: readonly string[]): string {
  return `${allowedRules.join(",")}|${allowedVariations.join(",")}`;
}
function rememberVerifiedRosterPack(pack: StagedRosterPack, scopeKey: string): StagedRosterPack {
  freezeCopy(pack);
  let scopes = verifiedRosterPacks.get(pack);
  if (!scopes) {
    scopes = new Set<string>();
    verifiedRosterPacks.set(pack, scopes);
  }
  scopes.add(scopeKey);
  return pack;
}

function buildStagedRosterPack(sourceText: string, allowedRules: readonly string[], allowedVariations: readonly string[]): StagedRosterPack {
  return StagedRosterPackSchema.parse({ version: "LC_STAGED_ROSTER_PACK_V1", sourceText, ...stageRosterImport(sourceText, allowedRules, allowedVariations) });
}
export function createStagedRosterPack(sourceText: string, allowedRules: readonly string[], allowedVariations: readonly string[]): StagedRosterPack {
  const pack = buildStagedRosterPack(sourceText, allowedRules, allowedVariations);
  if (new TextEncoder().encode(canonicalJson(pack)).byteLength > ROSTER_NEW_PACK_MAX_BYTES) throw new Error("Roster pack exceeds the 8 MiB limit for new games.");
  return rememberVerifiedRosterPack(pack, rosterPackScopeKey(allowedRules, allowedVariations));
}

export function validateStagedRosterPack(raw: unknown, allowedRules: readonly string[], allowedVariations: readonly string[]): StagedRosterPack {
  const scopeKey = rosterPackScopeKey(allowedRules, allowedVariations);
  if (raw !== null && typeof raw === "object" && Object.isFrozen(raw) && verifiedRosterPacks.get(raw)?.has(scopeKey)) {
    return raw as StagedRosterPack;
  }
  const pack = StagedRosterPackSchema.parse(raw);
  const rebuilt = buildStagedRosterPack(pack.sourceText, allowedRules, allowedVariations);
  if (canonicalJson(pack) !== canonicalJson(rebuilt)) throw new Error("Roster pack contents do not match the staged source and priors.");
  return rememberVerifiedRosterPack(pack, scopeKey);
}

export function validateRosterMatchSelection(rawPack: unknown, rawSelection: unknown, allowedRules: readonly string[], allowedVariations: readonly string[]) {
  const pack = validateStagedRosterPack(rawPack, allowedRules, allowedVariations);
  const selection = RosterMatchSelectionSchema.parse(rawSelection);
  if (!pack.world.grounds.some(ground => ground.groundId === selection.groundId)) throw new Error("Unknown match ground.");
  if (selection.teams[0].teamId === selection.teams[1].teamId) throw new Error("Match teams must differ.");
  const players = new Map(pack.world.players.map(player => [player.playerId, player]));
  const used = new Set<string>();
  for (const selected of selection.teams) {
    const team = pack.world.teams.find(item => item.teamId === selected.teamId);
    if (!team || new Set(selected.playerIds).size !== 11 || selected.playerIds.some(id => !team.squadIds.includes(id))) throw new Error("Invalid team or XI membership.");
    if (!selected.playerIds.includes(selected.captainId) || !selected.playerIds.includes(selected.keeperId) || players.get(selected.keeperId)?.role !== "KEEPER") throw new Error("Select an eligible captain and keeper.");
    if (selected.playerIds.filter(id => { const player = players.get(id)!; return player.bowlingStyle !== null && ["BOWLER", "ALLROUNDER"].includes(player.role); }).length < 5) throw new Error("The XI needs five bowling-capable players.");
    for (const id of selected.playerIds) {
      if (used.has(id)) throw new Error("An XI player cannot play for both sides.");
      used.add(id);
    }
  }
  return { pack, selection };
}

function freezeCopy<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeCopy);
    Object.freeze(value);
  }
  return value;
}

export function prepareRosterMatch(rawPack: unknown, rawRequest: unknown) {
  const request = RosterMatchPreparationSchema.parse(rawRequest);
  const { pack, selection } = validateRosterMatchSelection(rawPack, request.selection, RULE_MANIFESTS.map(rule => rule.rulesId), SYNTHETIC_ALPHA_PACK.manifest.variationIds);
  const rule = RULE_MANIFESTS.find(item => item.format === request.format && pack.world.rulesIds.includes(item.rulesId));
  if (!rule) throw new Error("The roster does not support this match format.");
  const byId = new Map(pack.world.players.map(player => [player.playerId, player]));
  const teams = selection.teams.map(selected => {
    const team = pack.world.teams.find(item => item.teamId === selected.teamId)!;
    return { teamId: team.teamId, name: team.name, colours: team.colours, playerIds: selected.playerIds, xi: selected.playerIds.map(id => byId.get(id)!), captainId: selected.captainId, keeperId: selected.keeperId };
  });
  let digests = cachedPackDigests.get(pack);
  if (!digests) {
    const h = createStateHasher().hash;
    digests = { worldHash: h(pack.world), rosterPackHash: h(pack) };
    if (Object.isFrozen(pack)) cachedPackDigests.set(pack, digests);
  }
  let rulesHash = cachedRuleDigests.get(rule.rulesId);
  if (!rulesHash) {
    rulesHash = createStateHasher().hash(rule);
    cachedRuleDigests.set(rule.rulesId, rulesHash);
  }
  const setup = structuredClone({
    version: "LC_ROSTER_MATCH_PREPARATION_V1" as const,
    gameId: request.gameId, matchId: request.matchId, seed: request.seed, format: request.format,
    worldHash: digests.worldHash, rosterPackHash: digests.rosterPackHash,
    rulesId: rule.rulesId, rulesHash, modelHash: MODEL_PACK_SHA256, stagePackHash: DELIVERY_STAGE_PACK_SHA256,
    ground: pack.world.grounds.find(item => item.groundId === selection.groundId)!, teams,
  });
  return freezeCopy(setup);
}
