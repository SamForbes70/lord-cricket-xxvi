import {
  canonicalJson,
  DELIVERY_GENERATOR_VERSION,
  DELIVERY_STAGE_PACK_ID,
  GenerateDeliveryRequestSchema,
  GeneratedDeliverySchema,
  PROBABILITY_VERSION,
  EXP_LUT_VERSION,
  RANDOM_VERSION,
  type GenerateDeliveryRequest,
  type GeneratedDelivery,
  type DeliveryResolution,
  type ProbabilityCategory,
  type ProbabilityMass,
  type RandomAddress,
} from "@lcxxvi/contracts";
import {
  DELIVERY_STAGE_PACK,
  DELIVERY_STAGE_PACK_SHA256,
  EXP_LUT_SHA256,
  RULE_MANIFESTS,
} from "@lcxxvi/data";
import { validateDeliveryResolution } from "@lcxxvi/domain";
import { canonicalStateBytes, createRandomService, sha256Hex } from "./determinism.js";
import {
  chooseCategoricalMass, contactCategories, createProbabilityService,
  legalityCategories, roundDivTiesAway,
} from "./probability.js";
import { registeredModel, type RegisteredModel } from "./model-registry.js";
import type { CalibratedContactId, CalibratedRunId, CalibratedSkill, CalibratedTerms } from "@lcxxvi/data";

/** Addresses are frozen protocol. Each distinct variable owns one unique (stage, drawIndex). */
export const DELIVERY_DRAW_REGISTRY = Object.freeze({
  EXECUTED_LENGTH: Object.freeze({ stageName: "length", drawIndex: 0 }),
  LEGALITY: Object.freeze({ stageName: "legality", drawIndex: 0 }),
  CONTACT: Object.freeze({ stageName: "contact", drawIndex: 0 }),
  SECTOR: Object.freeze({ stageName: "sector", drawIndex: 0 }),
  IMMEDIATE_DISMISSAL: Object.freeze({ stageName: "dismissal", drawIndex: 0 }),
  STUMPING: Object.freeze({ stageName: "dismissal", drawIndex: 1 }),
  FIELD_CHANCE: Object.freeze({ stageName: "fielding", drawIndex: 0 }),
  FIELD_CONVERSION: Object.freeze({ stageName: "fielding", drawIndex: 1 }),
  RUNS: Object.freeze({ stageName: "running", drawIndex: 0 }),
  RUN_OUT: Object.freeze({ stageName: "running", drawIndex: 1 }),
  RUN_OUT_END: Object.freeze({ stageName: "running", drawIndex: 2 }),
} as const);
export type DrawKey = keyof typeof DELIVERY_DRAW_REGISTRY;
const probability = createProbabilityService();
const random = createRandomService(RANDOM_VERSION);
const RUN_IDS = ["0", "1", "2", "3", "4", "6"] as const;
const LENGTHS = ["YORKER", "FULL", "GOOD", "SHORT"] as const;
const SCALE = 10000n;

function frozenDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) frozenDeep(entry);
    Object.freeze(value);
  }
  return value;
}
function clamp(n: number, low: number, high: number): number {
  return n < low ? low : n > high ? high : n;
}
function rounded(coefficientBp: number, featureBp: number): number {
  return Number(roundDivTiesAway(BigInt(coefficientBp) * BigInt(featureBp), SCALE));
}
function rating(r: number): number { return (r - 50) * 200; }
function cat(id: string, baseWeight: number, interceptBp = 0, terms: ProbabilityCategory["terms"] = [], allowed = true): ProbabilityCategory {
  return { id, baseWeight, interceptBp, terms: [...terms], allowed };
}
export function expectedGeneratorPhase(format: GenerateDeliveryRequest["format"], legalBalls: number): GenerateDeliveryRequest["phase"] {
  if (format === "RED_BALL") return "RED_BALL";
  if (format === "T20") return legalBalls < 36 ? "T20_EARLY" : legalBalls < 90 ? "T20_MIDDLE" : "T20_LATE";
  return legalBalls < 60 ? "ODI_EARLY" : legalBalls < 240 ? "ODI_MIDDLE" : "ODI_LATE";
}
export function generatorRuleHash(rulesId: string): string {
  const match = RULE_MANIFESTS.find((r) => r.rulesId === rulesId);
  if (!match) throw new Error("UNSUPPORTED_GENERATOR_RULES");
  return sha256Hex(canonicalStateBytes(match));
}
function validateRequest(raw: unknown): GenerateDeliveryRequest {
  canonicalJson(raw);
  const req = GenerateDeliveryRequestSchema.parse(raw);
  if (req.stagePackHash !== DELIVERY_STAGE_PACK_SHA256 ||
      sha256Hex(canonicalStateBytes(DELIVERY_STAGE_PACK)) !== DELIVERY_STAGE_PACK_SHA256 ||
      !registeredModel(req.modelId, req.modelHash) || req.lutHash !== EXP_LUT_SHA256 ||
      req.stagePackId !== DELIVERY_STAGE_PACK_ID || req.generatorVersion !== DELIVERY_GENERATOR_VERSION ||
      req.probabilityVersion !== PROBABILITY_VERSION ||
      req.lutVersion !== EXP_LUT_VERSION || req.randomVersion !== RANDOM_VERSION) {
    throw new Error("UNSUPPORTED_GENERATOR_PACK_OR_VERSION");
  }
  if (req.rulesHash !== generatorRuleHash(req.context.rulesId)) throw new Error("UNSUPPORTED_RULES_HASH");
  // The variation rating is read only by a model with a skill pack (calibrated-t20-01), and that model requires it.
  if ((skillPackOf(req) === null) !== (req.bowling.variationRating === undefined)) throw new Error("UNSUPPORTED_GENERATOR_PACK_OR_VERSION");
  const format = req.context.rulesId === "LC_T20_01" ? "T20" :
    req.context.rulesId === "LC_ODI_01" ? "ODI" : "RED_BALL";
  if (req.format !== format || req.phase !== expectedGeneratorPhase(format, req.context.legalBalls)) {
    throw new Error("INCONSISTENT_FORMAT_OR_PHASE");
  }
  if (req.attemptOrdinal !== req.context.deliveryIndex) throw new Error("ATTEMPT_ORDINAL_MISMATCH");
  if (`${req.matchId}:${req.context.inningsIndex}`.length > 128) throw new Error("RANDOM_ENTITY_ID_TOO_LONG");
  if (req.context.bowlerId === req.context.strikerId || req.context.bowlerId === req.context.nonStrikerId ||
      req.context.strikerId === req.context.nonStrikerId ||
      req.context.endsBefore[req.context.strikerEnd === "NORTH" ? "north" : "south"] !== req.context.strikerId ||
      req.context.endsBefore[req.context.strikerEnd === "NORTH" ? "south" : "north"] !== req.context.nonStrikerId) {
    throw new Error("INCONSISTENT_BATTER_ENDS");
  }
  if (req.context.runs >= (req.context.targetToWin ?? Number.MAX_SAFE_INTEGER) ||
      req.context.allocatedBalls !== (format === "T20" ? 120 : format === "ODI" ? 300 : null) ||
      (req.context.allocatedBalls !== null && req.context.legalBalls >= req.context.allocatedBalls) ||
      (format === "RED_BALL" && req.context.freeHitPending) ||
      req.context.wickets >= 10 || req.attemptOrdinal < req.context.legalBalls) {
    throw new Error("INNINGS_NOT_READY_FOR_GENERATOR");
  }
  const ids = req.field.slots.map((slot) => slot.playerId);
  if (new Set(ids).size !== 9 ||
      [...ids].sort().join("\u0000") !== [...req.context.outfieldIds].sort().join("\u0000") ||
      new Set([req.context.strikerId,req.context.nonStrikerId,req.context.bowlerId,req.context.keeperId,...ids]).size !== 13 ||
      req.batting.shotSectorWeights.every((w) => w === 0)) {
    throw new Error("INVALID_GENERATOR_FIELD_OR_SECTORS");
  }
  return req;
}
/** No runtime Math.exp. All stage logits pass through existing integer probability model. */
export function effectiveMovementBp(req: Pick<GenerateDeliveryRequest, "bowling" | "conditions">): number {
  const spin = !["FAST", "MEDIUM"].includes(req.bowling.bowlingStyle);
  const pitch = spin ? req.conditions.turnBp : req.conditions.seamBp;
  const assistanceBp = (pitch - 5000) * 2;
  return clamp(rating(req.bowling.movementRating) + rounded(2500, assistanceBp) - rounded(2500, req.bowling.fatigueBp), -10000, 10000);
}

export function executedLengthCategories(req: GenerateDeliveryRequest): ProbabilityCategory[] {
  const intent = req.bowling.intendedLength;
  const position = LENGTHS.indexOf(intent);
  const weighted = new Map<string, number>([[intent, DELIVERY_STAGE_PACK.length.intended]]);
  const neighbours = [LENGTHS[position-1], LENGTHS[position+1]].filter((v): v is typeof LENGTHS[number] => v !== undefined);
  const piece = DELIVERY_STAGE_PACK.length.neighboursTotal / neighbours.length;
  for (const n of neighbours) weighted.set(n, (weighted.get(n) ?? 0) + piece);
  const error = position < 2 ? "FULL_TOSS" : "FULL";
  weighted.set(error, (weighted.get(error) ?? 0) + DELIVERY_STAGE_PACK.length.gross);
  const scaleTerm = [
    { coefficientBp: DELIVERY_STAGE_PACK.length.intendedControlBp, featureBp: rating(req.bowling.controlRating) },
    { coefficientBp: DELIVERY_STAGE_PACK.length.intendedFatigueBp, featureBp: req.bowling.fatigueBp },
  ];
  // Freeze category order independently of the selected intent or insertion order.
  return [...LENGTHS, "FULL_TOSS"].filter((id) => (weighted.get(id) ?? 0) > 0)
    .map((id) => cat(id, weighted.get(id)!, 0, id === intent ? scaleTerm : []));
}
/** The calibrated-t20-01 skill pack of a request's model, or null for synthetic-alpha-01. */
function skillPackOf(req: Pick<GenerateDeliveryRequest, "modelId" | "modelHash">): RegisteredModel["skillPack"] {
  return registeredModel(req.modelId, req.modelHash)?.skillPack ?? null;
}
/** The calibrated-t20-01 delivery-outcome pack (C4) of a request's model, or null for synthetic-alpha-01. */
function deliveryPackOf(req: Pick<GenerateDeliveryRequest, "modelId" | "modelHash">): RegisteredModel["deliveryPack"] {
  return registeredModel(req.modelId, req.modelHash)?.deliveryPack ?? null;
}
/** C4 additive contact terms (phase intercept, aggression) for one contact class; none for synthetic-alpha-01. */
function deliveryContactTerms(req: GenerateDeliveryRequest, id: string): Array<{coefficientBp:number;featureBp:number}> {
  const pack = deliveryPackOf(req);
  if (!pack || req.phase === "RED_BALL" || !req.phase.startsWith("T20_")) return [];
  const phase = pack.contact.intercept[req.phase as "T20_EARLY" | "T20_MIDDLE" | "T20_LATE"];
  return [
    {coefficientBp: phase[id as CalibratedContactId], featureBp: 10000},
    {coefficientBp: pack.contact.aggression[id as CalibratedContactId], featureBp: (req.batting.aggression - 2) * 10000},
    // V2: the ground's pitch (both bowling types), on seam + turn about the pack's centre.
    {coefficientBp: pack.pitch.contact[id as CalibratedContactId], featureBp: calibratedPitchBp(req)},
  ];
}
/**
 * C5 (delivery V2), calibrated-t20-01 only: attacking into a spread field. The field's spread is 2,000 bp for each
 * boundary rider (DEEP slot), 10,000 with five out; the feature is that spread times the attacking levels above
 * aggression 2 (a defensive or normal stroke gets nothing from it).
 */
export function calibratedSpreadAttackBp(req: GenerateDeliveryRequest): number {
  const spreadBp = Math.min(10000, 2000 * req.field.slots.filter((slot) => slot.depth === "DEEP").length);
  return Math.max(0, req.batting.aggression - 2) * spreadBp;
}
/** C5 (delivery V2), calibrated-t20-01 only: the pitch feature, seam + turn of the current pitch about twice the centre. */
export function calibratedPitchBp(req: GenerateDeliveryRequest): number {
  const pack = deliveryPackOf(req);
  if (!pack) return 0;
  return clamp(req.conditions.seamBp + req.conditions.turnBp - 2 * pack.pitch.centreBp, -10000, 10000);
}
function skillRating(req: GenerateDeliveryRequest, skill: CalibratedSkill): number {
  switch (skill) {
    case "TIMING": return req.batting.timingRating;
    case "POWER": return req.batting.powerRating;
    case "DEFENCE": return req.batting.defenceRating;
    case "ROTATION": return req.batting.rotationRating;
    case "CONTROL": return req.bowling.controlRating;
    case "MOVEMENT": return req.bowling.movementRating;
    case "VARIATION": return req.bowling.variationRating ?? 0;
  }
}
/** Additive skill terms for one category from a calibrated pack stage; none for synthetic-alpha-01. */
function skillTerms(req: GenerateDeliveryRequest, stage: "contact" | "runs", categoryId: string): Array<{coefficientBp:number;featureBp:number}> {
  const pack = skillPackOf(req);
  if (!pack) return [];
  const row = (pack[stage] as CalibratedTerms)[categoryId];
  if (!row) return [];
  return (Object.keys(row) as CalibratedSkill[]).sort().map((skill) => ({
    coefficientBp: row[skill]!, featureBp: (skillRating(req, skill) - pack.centres[skill]) * 200,
  }));
}
export function conditionedContactCategories(req: GenerateDeliveryRequest, executed: string, noBallOrFreeHit: boolean): ProbabilityCategory[] {
  const base = contactCategories({
    phase: req.phase, defenceRating: req.batting.defenceRating,
    timingRating: req.batting.timingRating, powerRating: req.batting.powerRating,
    effectiveMovementBp: effectiveMovementBp(req), aggression: req.batting.aggression,
  });
  const matchup = rating(["FAST", "MEDIUM"].includes(req.bowling.bowlingStyle) ? req.batting.vsPaceRating : req.batting.vsSpinRating);
  return base.map((row) => {
    const extra: Array<{coefficientBp:number;featureBp:number}> = [];
    function add(bp: number) { extra.push({coefficientBp:bp, featureBp:10000}); }
    if (executed === "YORKER" && row.id === "MISS") add(2000);
    if (executed === "YORKER" && row.id === "AERIAL") add(-1000);
    if (executed === "FULL_TOSS" && row.id === "AERIAL") add(5000);
    if (executed === "FULL_TOSS" && row.id === "GROUND") add(2000);
    if (executed === "SHORT" && (row.id === "AERIAL" || row.id === "EDGE")) add(1500);
    if (row.id === "MISS" || row.id === "EDGE") extra.push({coefficientBp:-2000,featureBp:matchup});
    if (row.id === "GROUND") extra.push({coefficientBp:2000,featureBp:matchup});
    return {...row, allowed: !(noBallOrFreeHit && row.id === "HIT_WICKET"),
      terms:[...row.terms,...extra,...skillTerms(req,"contact",row.id),...deliveryContactTerms(req,row.id)]};
  });
}
/** Eight sectors are a V0.1 derived geometry: 0..2 off, 3..4 straight, 5..7 leg. */
export function sectorCategories(req: GenerateDeliveryRequest): ProbabilityCategory[] {
  const sectors = req.batting.shotSectorWeights;
  return sectors.map((baseWeight, sector) => {
    const matches = req.bowling.line === "OFF" ? sector <= 2 :
      req.bowling.line === "STUMPS" ? sector === 3 || sector === 4 : sector >= 5;
    const weight = matches ? Number(roundDivTiesAway(BigInt(baseWeight) * BigInt(DELIVERY_STAGE_PACK.sectorLineMultiplierBp), SCALE)) : baseWeight;
    return cat(`SECTOR_${sector}`, weight);
  });
}
type ChosenFielder = { playerId: string; coverageBp: number; catchingRating:number; throwingRating:number; role:string };
/** Deterministic coverage priority. Stable player ID breaks ties; no object/Map iteration order. */
export function coveringFielder(req: GenerateDeliveryRequest, sector: number, contact: "GROUND"|"AERIAL"|"EDGE"): ChosenFielder {
  const candidates: ChosenFielder[] = req.field.slots.map((slot) => {
    const step = (slot.sector - sector + 8) % 8;
    const positional = step === 0 ? 10000 : step === 1 || step === 7 ? DELIVERY_STAGE_PACK.coverage.neighbourBp : 0;
    const depth = contact === "GROUND" ? DELIVERY_STAGE_PACK.coverage.ground[slot.depth] : DELIVERY_STAGE_PACK.coverage.aerial[slot.depth];
    const coverageBp = contact === "EDGE" ? slot.role === "SLIP" ? 10000 : slot.role === "GULLY" ? 6000 : 1000 : rounded(depth, positional);
    return { playerId:slot.playerId, coverageBp, catchingRating:slot.catchingRating, throwingRating:slot.throwingRating, role:slot.role };
  });
  if (contact === "EDGE") candidates.push({playerId:req.context.keeperId,coverageBp:10000,
    catchingRating:req.field.keeper.catchingRating,throwingRating:req.field.keeper.throwingRating,role:"KEEPER"});
  candidates.sort((a,b) => b.coverageBp-a.coverageBp || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  return candidates[0]!;
}
/**
 * C4, calibrated-t20-01 only: the best coverage of a shot's sector by the ring (INNER and MIDDLE fielders) and,
 * separately, by the boundary riders (DEEP), with the same positional and depth weights as coveringFielder. An edge has
 * no deep cover: its ring coverage is the chosen fielder's.
 */
type FieldCover = { ringBp: number; deepBp: number };
export function calibratedFieldCover(req: GenerateDeliveryRequest, sector: number, contact: "GROUND"|"AERIAL"|"EDGE", chosen: ChosenFielder): FieldCover {
  if (contact === "EDGE") return { ringBp: chosen.coverageBp, deepBp: 0 };
  let ringBp = 0, deepBp = 0;
  for (const slot of req.field.slots) {
    const step = (slot.sector - sector + 8) % 8;
    const positional = step === 0 ? 10000 : step === 1 || step === 7 ? DELIVERY_STAGE_PACK.coverage.neighbourBp : 0;
    const depth = contact === "GROUND" ? DELIVERY_STAGE_PACK.coverage.ground[slot.depth] : DELIVERY_STAGE_PACK.coverage.aerial[slot.depth];
    const bp = rounded(depth, positional);
    if (slot.depth === "DEEP") deepBp = Math.max(deepBp, bp); else ringBp = Math.max(ringBp, bp);
  }
  return { ringBp, deepBp };
}
function missDismissalCategories(req: GenerateDeliveryRequest, contact: "MISS"|"PAD", forbidden: boolean): ProbabilityCategory[] {
  const isMiss = contact === "MISS";
  const base = isMiss ? DELIVERY_STAGE_PACK.bowled : DELIVERY_STAGE_PACK.lbw;
  const interceptBp = deliveryPackOf(req)?.dismissalInterceptBp[isMiss ? "BOWLED" : "LBW"] ?? base.interceptBp;
  const allowed = !forbidden && (isMiss || req.bowling.line !== "LEG");
  // calibrated-t20-01 has no separate dismissal skill (owner decision 2): it cancels these two skill terms exactly
  // (ties round away from zero symmetrically, so each pair sums to zero).
  const cancel = skillPackOf(req)?.cancelMissDismissalSkill === true ? [
    {coefficientBp:-base.controlBp, featureBp:rating(req.bowling.controlRating)},
    {coefficientBp:-base.defenceBp, featureBp:rating(req.batting.defenceRating)},
  ] : [];
  return [cat(isMiss ? "BOWLED" : "LBW",1,interceptBp,[
    {coefficientBp:base.controlBp, featureBp:rating(req.bowling.controlRating)},
    {coefficientBp:base.defenceBp, featureBp:rating(req.batting.defenceRating)},
    ...(isMiss && req.bowling.line === "STUMPS" ? [{coefficientBp:DELIVERY_STAGE_PACK.bowled.stumpsBp,featureBp:10000}] : []),
    ...cancel,
  ],allowed),cat("NONE",1)];
}
function runningCategories(req: GenerateDeliveryRequest, contact: "GROUND"|"AERIAL"|"EDGE", coverageBp:number, cover:FieldCover|null): ProbabilityCategory[] {
  const pack = deliveryPackOf(req);
  const weights = pack ? pack.runs[contact] : DELIVERY_STAGE_PACK.runs[contact];
  const timing = rating(req.batting.timingRating), power = rating(req.batting.powerRating), rotation = rating(req.batting.rotationRating);
  return RUN_IDS.map((id,idx) => {
    const terms: {coefficientBp:number;featureBp:number}[] = [];
    if (pack && cover) {
      // C4: the calibrated delivery pack replaces the single depth-blind coverage term (dot +5,000, boundary -7,000)
      // with one term on ring coverage and one on deep coverage, for every run category.
      if (id === "0") terms.push({coefficientBp:-3000,featureBp:rotation});
      if (id === "1" && req.batting.intent !== "NORMAL") terms.push({coefficientBp:req.batting.intent === "ROTATE" ? 3500:-5000,featureBp:10000});
      if (id === "4" || id === "6") terms.push({coefficientBp:4000,featureBp:timing},{coefficientBp:5000,featureBp:power});
      terms.push({coefficientBp:pack.runsCoverageBp.RING[id as CalibratedRunId],featureBp:cover.ringBp},
        {coefficientBp:pack.runsCoverageBp.DEEP[id as CalibratedRunId],featureBp:cover.deepBp});
    } else {
      if (id === "0") terms.push({coefficientBp:5000,featureBp:coverageBp},{coefficientBp:-3000,featureBp:rotation});
      if (id === "1" && req.batting.intent !== "NORMAL") terms.push({coefficientBp:req.batting.intent === "ROTATE" ? 3500:-5000,featureBp:10000});
      if (id === "4" || id === "6") terms.push({coefficientBp:4000,featureBp:timing},{coefficientBp:5000,featureBp:power},{coefficientBp:-7000,featureBp:coverageBp});
    }
    const aggression = pack && contact !== "EDGE" ? pack.runsAggressionBp[id as CalibratedRunId] : 0;
    if (aggression !== 0) terms.push({coefficientBp:aggression,featureBp:(req.batting.aggression-2)*10000});
    if (pack && cover) {
      // V2: attacking into a spread field (aggression x deep coverage) and the pitch.
      if (contact !== "EDGE") terms.push({coefficientBp:pack.runsAggressionDeepBp[id as CalibratedRunId],featureBp:calibratedSpreadAttackBp(req)});
      terms.push({coefficientBp:pack.pitch.runs[id as CalibratedRunId],featureBp:calibratedPitchBp(req)});
    }
    terms.push(...skillTerms(req,"runs",id));
    const runs = Number(id);
    // An attempted physical run cannot overrun a winning target; boundaries may fully score.
    const remaining = req.context.targetToWin === null ? null : req.context.targetToWin - req.context.runs;
    return cat(id,weights[idx]!,0,terms,remaining === null || runs <= remaining || runs >= 4);
  });
}
function runOutCategories(req: GenerateDeliveryRequest, fielder: ChosenFielder, attempted: number, automatic: number): ProbabilityCategory[] {
  const remaining = req.context.targetToWin === null ? null : req.context.targetToWin-req.context.runs-automatic;
  const allowed = remaining === null || attempted-1 < remaining;
  return [cat("RUN_OUT",1,deliveryPackOf(req)?.dismissalInterceptBp.RUN_OUT ?? DELIVERY_STAGE_PACK.running.interceptBp,[
    {coefficientBp:DELIVERY_STAGE_PACK.running.throwingBp,featureBp:rating(fielder.throwingRating)},
    {coefficientBp:DELIVERY_STAGE_PACK.running.coverageBp,featureBp:fielder.coverageBp},
    {coefficientBp:DELIVERY_STAGE_PACK.running.rotateBp,featureBp:req.batting.intent === "ROTATE"?10000:0},
    // V2 (calibrated-t20-01 only): hard running at higher aggression.
    ...(deliveryPackOf(req) ? [{coefficientBp:deliveryPackOf(req)!.runOutAggressionBp,featureBp:(req.batting.aggression-2)*10000}] : []),
  ],allowed),cat("SAFE",1)];
}
/** Internal SHA-address trace is never included in public prediction/projection DTOs. */
export function generateDelivery(raw: unknown): GeneratedDelivery {
  const req = validateRequest(raw), trace: GeneratedDelivery["trace"][number][] = [];
  const seen = new Set<string>();
  function sample(key: DrawKey, categories: readonly ProbabilityCategory[]): string {
    const slot = DELIVERY_DRAW_REGISTRY[key];
    const address: RandomAddress = {
      seed:req.seed,domain:"MATCH_DELIVERY",entityId:`${req.matchId}:${req.context.inningsIndex}`,
      eventOrdinal:req.attemptOrdinal,stageName:slot.stageName,drawIndex:slot.drawIndex,
    };
    const serial = JSON.stringify(address);
    if (seen.has(serial)) throw new Error("DUPLICATE_DELIVERY_DRAW_ADDRESS");
    seen.add(serial);
    const distribution = probability.normalise({probabilityVersion:PROBABILITY_VERSION,
      modelId:req.modelId,modelHash:req.modelHash,lutVersion:EXP_LUT_VERSION,
      lutHash:EXP_LUT_SHA256,categories});
    const draw = random.uint32(address);
    const selected = chooseCategoricalMass(distribution.categories,draw);
    trace.push({stageName:slot.stageName,address,draw,selectedCategoryId:selected.id,
      categories:distribution.categories as ProbabilityMass[]});
    return selected.id;
  }
  const length = sample("EXECUTED_LENGTH",executedLengthCategories(req)) as DeliveryResolution["executedLength"];
  const legality = sample("LEGALITY",legalityCategories({controlRating:req.bowling.controlRating,
    fatigueBp:req.bowling.fatigueBp,line:req.bowling.line,effort:req.bowling.effort})) as DeliveryResolution["legality"];
  const c=req.context;
  const extras={wides:0,noBalls:0,byes:0,legByes:0,penalties:0};
  const base: DeliveryResolution={stage:"DELIVERY",legality,batRuns:0,extras,completedRuns:0,attemptedRuns:0,
    boundary:"NONE",dismissal:null,endsAfter:{...c.endsBefore},batContact:false,attemptedStroke:req.batting.attemptedStroke,
    shotSector:null,trajectory:null,executedLength:length,fieldOutcome:"NONE",elapsedSeconds:DELIVERY_STAGE_PACK.elapsedSeconds};
  function finish(r: DeliveryResolution):GeneratedDelivery {
    const validated = validateDeliveryResolution(c,r).resolution;
    return frozenDeep(GeneratedDeliverySchema.parse({kind:"GENERATED_DELIVERY",generatorVersion:DELIVERY_GENERATOR_VERSION,
      modelHash:req.modelHash,stagePackHash:DELIVERY_STAGE_PACK_SHA256,internalOnly:true,trace,resolution:validated}));
  }
  if (legality === "WIDE") extras.wides=1;
  if (legality === "NO_BALL") extras.noBalls=1;
  if ((legality === "WIDE" || legality === "NO_BALL") && c.targetToWin !== null && c.runs+1>=c.targetToWin)
    return finish({...base,stage:"IMMEDIATE_PENALTY",batContact:false,attemptedStroke:false});
  const forbidden = legality === "NO_BALL" || c.freeHitPending;
  type ContactClass = "MISS"|"PAD"|"GROUND"|"AERIAL"|"EDGE"|"HIT_WICKET"|"WIDE";
  const contact: ContactClass = legality === "WIDE" ? "WIDE" :
    sample("CONTACT",conditionedContactCategories(req,length!,forbidden)) as ContactClass;
  if (contact === "HIT_WICKET") {
    base.dismissal={kind:"HIT_WICKET",playerId:c.strikerId,fielderId:null,wicketEnd:c.strikerEnd};
    base.endsAfter[c.strikerEnd === "NORTH"?"north":"south"]=null;
    return finish(base);
  }
  if (contact === "MISS" || contact === "PAD") {
    const chance = sample("IMMEDIATE_DISMISSAL",missDismissalCategories(req,contact,forbidden));
    if (chance !== "NONE") {
      base.dismissal={kind:chance as "BOWLED"|"LBW",playerId:c.strikerId,fielderId:null,wicketEnd:c.strikerEnd};
      base.endsAfter[c.strikerEnd === "NORTH"?"north":"south"]=null;
      return finish(base);
    }
  }
  let fielder:ChosenFielder={playerId:c.keeperId,coverageBp:0,catchingRating:req.field.keeper.catchingRating,
    throwingRating:req.field.keeper.throwingRating,role:"KEEPER"};
  if (contact === "GROUND" || contact === "AERIAL" || contact === "EDGE") {
    base.batContact=true;
    base.trajectory=contact;
    base.shotSector=Number(sample("SECTOR",sectorCategories(req)).split("_")[1]);
    fielder=coveringFielder(req,base.shotSector,contact);
    if (contact === "AERIAL" || contact === "EDGE") {
      if (!forbidden && fielder.coverageBp>0) {
        const dpack=deliveryPackOf(req);
        // V2 (calibrated-t20-01 only): a slog is more often skied, a defensive stroke less often.
        const opportunityBp=dpack ? clamp(dpack.catchOpportunityBp[contact]+dpack.catchOpportunityAggressionBp[contact]*(req.batting.aggression-2),0,10000)
          : DELIVERY_STAGE_PACK.catchOpportunityBp[contact];
        const chanceWeight=rounded(opportunityBp,fielder.coverageBp);
        const chance=sample("FIELD_CHANCE",[cat("CHANCE",chanceWeight),cat("NO_CHANCE",10000-chanceWeight)]);
        if (chance === "CHANCE") {
          const conv=sample("FIELD_CONVERSION",[cat("CATCH",1,DELIVERY_STAGE_PACK.catchConversion.interceptBp,[
            {coefficientBp:DELIVERY_STAGE_PACK.catchConversion.catchingBp,featureBp:rating(fielder.catchingRating)},
          ]),cat("DROP",1)]);
          if (conv === "CATCH") {
            base.fieldOutcome="CATCH";
            base.dismissal={kind:"CAUGHT",playerId:c.strikerId,fielderId:fielder.playerId,wicketEnd:c.strikerEnd};
            base.endsAfter[c.strikerEnd === "NORTH"?"north":"south"]=null;
            return finish(base);
          }
          base.fieldOutcome="DROP";
        } else base.fieldOutcome=fielder.coverageBp>0?"STOP":"NONE";
      } else base.fieldOutcome=fielder.coverageBp>0?"STOP":"NONE";
    } else base.fieldOutcome=fielder.coverageBp>0?"STOP":"NONE";
  }
  // Running/extra categories have exactly one address regardless of the contact branch.
  const wide = contact === "WIDE";
  const missed = contact === "MISS" || contact === "PAD";
  const categories = wide
    ? [cat("1",DELIVERY_STAGE_PACK.runs.WIDE[0]),cat("2",DELIVERY_STAGE_PACK.runs.WIDE[1]),cat("5",DELIVERY_STAGE_PACK.runs.WIDE[2])]
    : missed ? [cat("0",DELIVERY_STAGE_PACK.runs.NONE[0]),cat("1",DELIVERY_STAGE_PACK.runs.NONE[1],0,[],contact === "MISS" || req.batting.attemptedStroke),
      cat("4",DELIVERY_STAGE_PACK.runs.NONE[4],0,[],contact === "MISS" || req.batting.attemptedStroke)]
    : runningCategories(req,contact as "GROUND"|"AERIAL"|"EDGE",fielder.coverageBp,
      deliveryPackOf(req) ? calibratedFieldCover(req,base.shotSector!,contact as "GROUND"|"AERIAL"|"EDGE",fielder) : null);
  // A chase stops on the winning completed run. Mask categories whose ordinary
  // physical running would exceed the remaining target BEFORE sampling.
  // Boundaries may legitimately award the full four/six above the target.
  const chaseRemaining = c.targetToWin === null ? null : c.targetToWin-c.runs-
    (legality === "WIDE" || legality === "NO_BALL" ? 1 : 0);
  const chaseCategories = categories.map((category) => {
    const value = Number(category.id);
    const boundaryOutcome = wide ? value===5 : missed ? value===4 : value>=4;
    const physicalRuns = wide ? value-1 : value;
    return chaseRemaining !== null && !boundaryOutcome && physicalRuns > chaseRemaining
      ? {...category,allowed:false} : category;
  });
  const outcome=Number(sample("RUNS",chaseCategories));
  const automatic=legality === "WIDE" || legality === "NO_BALL" ? 1 : 0;
  if (wide) {
    extras.wides=outcome;
    if (outcome===5) base.boundary="FOUR";
    else base.completedRuns=outcome-1;
    base.attemptedStroke=false;
  } else if (missed) {
    if (contact==="MISS") extras.byes=outcome;
    else extras.legByes=outcome;
    if (outcome===4) base.boundary="FOUR";
    else base.completedRuns=outcome;
  } else {
    base.batRuns=outcome;
    if (outcome>=4) base.boundary=outcome===4?"FOUR":"SIX";
    else base.completedRuns=outcome;
  }
  if (base.boundary!=="NONE" && base.fieldOutcome==="STOP") base.fieldOutcome="NONE";
  // Stumping only with zero attempted running; computed after miss/wide branch so impossible if extras were run.
  const spin=!["FAST","MEDIUM"].includes(req.bowling.bowlingStyle);
  if ((contact==="MISS" && legality==="LEGAL" || wide) && spin && !forbidden &&
      req.batting.aggression>2 && base.completedRuns===0 && base.boundary==="NONE") {
    // Multiply sigmoid(keeping) by 0.003 in exact integer space, then feed its fixed mass to the categorical model.
    const sigmoid=probability.normalise({probabilityVersion:PROBABILITY_VERSION,modelId:req.modelId,
      modelHash:req.modelHash,lutVersion:EXP_LUT_VERSION,lutHash:EXP_LUT_SHA256,
      categories:[cat("SUCCESS",1,0,[{coefficientBp:10000,featureBp:rating(req.field.keeper.keepingRating)}]),cat("FAILURE",1)]});
    const successMass=BigInt(sigmoid.categories[0]!.mass);
    // V2 (calibrated-t20-01 only): the pack's stumping fraction replaces 3 / 1000.
    const stumping=deliveryPackOf(req)?.stumping ?? DELIVERY_STAGE_PACK.stumping;
    const fraction=successMass*BigInt(stumping.numerator)/BigInt(stumping.denominator);
    const successWeight=Number(roundDivTiesAway(fraction*1000000000n,4294967296n));
    const stump=sample("STUMPING",[cat("STUMPED",successWeight),cat("NONE",1000000000-successWeight)]);
    if (stump==="STUMPED") {
      base.dismissal={kind:"STUMPED",playerId:c.strikerId,fielderId:c.keeperId,wicketEnd:c.strikerEnd};
      base.endsAfter[c.strikerEnd==="NORTH"?"north":"south"]=null;
      return finish(base);
    }
  }
  if (base.completedRuns>0 && base.completedRuns<=3 && base.boundary==="NONE") {
    const threatened=sample("RUN_OUT",runOutCategories(req,fielder,base.completedRuns,automatic));
    if (threatened==="RUN_OUT") {
      const end=sample("RUN_OUT_END",[cat("NORTH",1),cat("SOUTH",1)]) as "NORTH"|"SOUTH";
      const attempted=base.completedRuns, completed=attempted-1;
      const firstNorth=c.endsBefore.north,firstSouth=c.endsBefore.south;
      const dismissed=end==="NORTH" ? (attempted%2===0?firstNorth:firstSouth) :
        (attempted%2===0?firstSouth:firstNorth);
      const survivor=dismissed===firstNorth?firstSouth:firstNorth;
      base.completedRuns=completed;
      base.attemptedRuns=attempted;
      base.fieldOutcome="RUN_OUT";
      base.dismissal={kind:"RUN_OUT",playerId:dismissed,fielderId:fielder.playerId,wicketEnd:end};
      base.endsAfter={north:end==="NORTH"?null:survivor,south:end==="SOUTH"?null:survivor};
      if (wide) extras.wides=completed+1;
      else if (contact==="MISS") extras.byes=completed;
      else if (contact==="PAD") extras.legByes=completed;
      else base.batRuns=completed;
      return finish(base);
    }
  }
  // Successful physical running swaps occupied ends on odd runs, not on automatic penalty runs.
  base.attemptedRuns=base.completedRuns;
  if (base.completedRuns%2===1) base.endsAfter={north:c.endsBefore.south,south:c.endsBefore.north};
  return finish(base);
}
