/** M7F offline RESEARCH-ONLY joint delivery envelope.
 * Never import this in match workers or production generators. It does not
 * encode batter runs/extras attribution, legal scorer inputs, tactics or player skill.
 * Source attribution: Cricsheet, ODC-By 1.0, https://cricsheet.org/.
 */
import { canonicalJson } from "@lcxxvi/contracts";
import { sha256Hex } from "./determinism.js";

export const RESEARCH_JOINT_VERSION = "LC_T20_JOINT_ENVELOPE_RESEARCH_V1" as const;
const TOTAL = 4_294_967_296;
const phases = ["POWERPLAY", "MIDDLE", "DEATH"] as const;
const wickets = ["0-2", "3-5", "6-9"] as const;
const kinds = ["NONE", "BOWLER", "RUN_OUT", "STUMPED", "OTHER"] as const;
const legalities = ["LEGAL", "WIDE", "NO_BALL"] as const;

type MassRow = Record<string, number>;
export interface JointResearchPack {
  version: string;
  modelStatus: string;
  gameplayIntegrationPermitted: boolean;
  candidateSha256: string;
  categories: string[];
  contextMass: Record<string, MassRow>;
  pooledMass: MassRow;
  probabilityMass: number;
}

export function decodeJointEnvelope(category: string) {
  const fields = category.split("|");
  if (fields.length !== 4) throw new Error("BAD_RESEARCH_CATEGORY");
  const [legality, runsText, boundaryText, wicketKind] = fields;
  const runs = Number(runsText);
  if (!legalities.includes(legality as typeof legalities[number]) ||
      !/^(0|[1-9]|10)$/.test(runsText!) || !Number.isSafeInteger(runs) ||
      !["0", "1"].includes(boundaryText!) ||
      !kinds.includes(wicketKind as typeof kinds[number])) {
    throw new Error("INVALID_RESEARCH_ENVELOPE");
  }
  const boundary = boundaryText === "1";
  if ((legality !== "LEGAL" && runs === 0) ||
      (boundary && (legality === "WIDE" || runs < (legality === "NO_BALL" ? 5 : 4))) ||
      (legality === "WIDE" && !["NONE", "RUN_OUT", "STUMPED"].includes(wicketKind!)) ||
      (legality === "NO_BALL" && !["NONE", "RUN_OUT"].includes(wicketKind!))) {
    throw new Error("ILLEGAL_RESEARCH_ENVELOPE");
  }
  return Object.freeze({ legality, teamRuns:runs, batBoundary:boundary, wicketClass:wicketKind });
}

function validateMassRow(row: unknown, categories: readonly string[]) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("INVALID_RESEARCH_MASS_ROW");
  const entries = Object.entries(row as Record<string,unknown>);
  if (entries.length !== categories.length ||
      entries.some(([key,value]) => !categories.includes(key) ||
        !Number.isSafeInteger(value) || (value as number) < 1)) {
    throw new Error("INVALID_RESEARCH_MASS_ROW");
  }
  if (entries.reduce((s,[,v]) => s + (v as number),0) !== TOTAL) {
    throw new Error("NON_NORMALIZED_RESEARCH_ROW");
  }
}

export function validateJointResearchPack(value: unknown): JointResearchPack {
  canonicalJson(value);
  const pack=value as JointResearchPack;
  if (!pack || pack.version !== RESEARCH_JOINT_VERSION ||
      pack.modelStatus !== "RESEARCH_ONLY_NOT_GAMEPLAY" ||
      pack.gameplayIntegrationPermitted !== false || pack.probabilityMass !== TOTAL ||
      typeof pack.candidateSha256 !== "string" || !/^[0-9a-f]{64}$/.test(pack.candidateSha256) ||
      !Array.isArray(pack.categories) || pack.categories.length < 3 ||
      !pack.contextMass || typeof pack.contextMass !== "object") {
    throw new Error("UNSUPPORTED_RESEARCH_MODEL");
  }
  const categories = pack.categories;
  if (new Set(categories).size !== categories.length ||
      categories.some(x => typeof x !== "string") ||
      categories.some(x => {try { decodeJointEnvelope(x);return false;} catch {return true;} })) {
    throw new Error("INVALID_RESEARCH_CATEGORIES");
  }
  const keys=Object.keys(pack.contextMass).sort();
  const expected=phases.flatMap(p=>wickets.map(w=>p+"/"+w)).sort();
  if (canonicalJson(keys)!==canonicalJson(expected)) throw new Error("INVALID_RESEARCH_CONTEXTS");
  validateMassRow(pack.pooledMass,categories);
  for (const key of keys) validateMassRow(pack.contextMass[key],categories);
  const {candidateSha256, ...payload} = pack;
  const digest=sha256Hex(new TextEncoder().encode(canonicalJson(payload)));
  if (digest!==candidateSha256) throw new Error("RESEARCH_PACK_HASH_MISMATCH");
  return pack;
}

export function drawResearchEnvelope(pack:JointResearchPack, phase:string, wicketCount:number,
                                     seed:string, ordinal:number) {
  if (!phases.includes(phase as typeof phases[number]) ||
      !Number.isSafeInteger(wicketCount) || wicketCount<0 || wicketCount>9 ||
      typeof seed!=="string" || !seed.length || !Number.isSafeInteger(ordinal) || ordinal<0) {
    throw new Error("INVALID_RESEARCH_DRAW_ADDRESS");
  }
  const band=wicketCount<3?"0-2":wicketCount<6?"3-5":"6-9";
  const context=phase+"/"+band;
  const address=canonicalJson({context,ordinal,researchVersion:RESEARCH_JOINT_VERSION,seed});
  const hash=sha256Hex(new TextEncoder().encode(address));
  const draw=Number.parseInt(hash.slice(0,8),16);
  let cumulative=0;
  const mass=pack.contextMass[context]!;
  for (const category of Object.keys(mass).sort()) {
    cumulative+=mass[category]!;
    if (draw<cumulative) return decodeJointEnvelope(category);
  }
  throw new Error("RESEARCH_DRAW_OUTSIDE_MASS");
}
