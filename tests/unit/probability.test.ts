import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import {
  ProbabilityContextSchema,
  ProbabilityRequestSchema,
  ProbabilityPackSchema,
  PROBABILITY_MASS,
  canonicalJson,
} from "@lcxxvi/contracts";
import {
  SYNTHETIC_ALPHA_PACK,
  MODEL_PACK_SHA256,
  EXP_LUT_SHA256,
} from "@lcxxvi/data";
import {
  createProbabilityService,
  executeProbabilityRequest,
  chooseCategoricalMass,
  accumulateLogit,
  roundDivTiesAway,
  baselineCategories,
  legalityCategories,
  contactCategories,
  sha256Hex,
  canonicalStateBytes,
} from "@lcxxvi/simulation";
import vectors from "../fixtures/probability/vectors.json" with { type: "json" };

const service = createProbabilityService();
const base = {
  probabilityVersion: "LC_INTEGER_PROBABILITY_V1",
  modelId: "synthetic-alpha-01",
  modelHash: MODEL_PACK_SHA256,
  lutVersion: "LC_EXP_LUT_V1",
  lutHash: EXP_LUT_SHA256,
} as const;
const sample = vectors.cases[10]!;

function ctx(categories: unknown) {
  return { ...base, categories };
}
const ajv = new Ajv2020.default({ strict: true, allErrors: true });
function compiled(name: string) {
  return ajv.getSchema(`urn:lcxxvi:${name}:1`) ??
    ajv.compile(JSON.parse(readFileSync(`packages/contracts/schemas/${name}Schema.json`, "utf8")));
}

describe("integer probability model", () => {
  it("pins the exact synthetic pack and independently generated LUT", () => {
    expect(ProbabilityPackSchema.parse(SYNTHETIC_ALPHA_PACK)).toEqual(SYNTHETIC_ALPHA_PACK);
    expect(sha256Hex(canonicalStateBytes(SYNTHETIC_ALPHA_PACK))).toBe(MODEL_PACK_SHA256);
    expect(SYNTHETIC_ALPHA_PACK.manifest.status).toBe("SYNTHETIC_ALPHA");
    expect(SYNTHETIC_ALPHA_PACK.expLutValues).toHaveLength(1601);
    expect(service.version).toBe(base.probabilityVersion);
  });
  it.each(vectors.cases)("matches independent integer mass and SHA draw: $id", (fixture) => {
    const input = ctx(fixture.categories);
    const before = canonicalJson(input);
    const normal = service.normalise(input);
    expect(normal.categories).toEqual(fixture.masses);
    expect(normal.totalMass).toBe(PROBABILITY_MASS);
    expect(normal.categories.at(-1)?.cumulative).toBe(PROBABILITY_MASS);
    expect(canonicalJson(input)).toBe(before);
    const request = {
      kind: "SAMPLE_CATEGORY", ...input,
      stageName: fixture.address.stageName,
      randomVersion: "SHA256_COUNTER_V1",
      address: fixture.address,
    };
    const result = executeProbabilityRequest(request);
    expect(result).toMatchObject({
      kind: "SAMPLE_CATEGORY",
      draw: fixture.draw,
      selectedIndex: fixture.selectedIndex,
      selectedCategoryId: fixture.selectedCategoryId,
      categories: fixture.masses,
    });
    expect(service.normalise(input)).toEqual(normal);
  });
  it("supports exact hand-worked cumulative interval boundaries", () => {
    const categories = service.normalise(ctx(vectors.cases[0]!.categories)).categories;
    for (const point of vectors.boundaries) {
      expect(chooseCategoricalMass(categories, point.draw)).toEqual({ index: point.index, id: point.id_ });
    }
    expect(() => chooseCategoricalMass(categories, -1)).toThrow("INVALID_UINT32");
    expect(() => chooseCategoricalMass(categories, 4294967296)).toThrow("INVALID_UINT32");
  });
  it("rounds each signed term with ties away from zero before summation and clips only after", () => {
    expect(roundDivTiesAway(5000n,10000n)).toBe(1n);
    expect(roundDivTiesAway(-5000n,10000n)).toBe(-1n);
    expect(roundDivTiesAway(4999n,10000n)).toBe(0n);
    expect(roundDivTiesAway(-4999n,10000n)).toBe(0n);
    expect(accumulateLogit({ id:"A",baseWeight:1,allowed:true,interceptBp:200000,terms:[
      {coefficientBp:100000,featureBp:10000},
      {coefficientBp:-100000,featureBp:10000},
    ]})).toBe(80000);
    expect(() => roundDivTiesAway(1n,0n)).toThrow("INVALID_DIVISOR");
  });
  it("uses positive weights only to establish legal mask and reference maximum", () => {
    const first = vectors.cases[3]!;
    const masses = service.normalise(ctx(first.categories)).categories;
    expect(masses[1]).toMatchObject({ allowed:false, logitBp:null, lutIndex:null, mass:0 });
    const second = vectors.cases[9]!;
    const tiny = service.normalise(ctx(second.categories)).categories;
    expect(tiny[1]).toMatchObject({ allowed:true, mass:0 });
    expect(tiny[0]!.mass).toBe(PROBABILITY_MASS);
    expect(chooseCategoricalMass(tiny, 0xffffffff).id).toBe("A");
    expect(() => service.normalise(ctx([{id:"A",allowed:false,baseWeight:1,interceptBp:0,terms:[]}]))).toThrow("EMPTY_POSITIVE_MASK");
    expect(() => service.normalise(ctx([{id:"A",allowed:true,baseWeight:0,interceptBp:0,terms:[]}]))).toThrow("EMPTY_POSITIVE_MASK");
  });
  it("rejects duplicate IDs, model or LUT mismatches, illegal stage reuse and invalid mass", () => {
    const input = ctx(sample.categories);
    expect(() => service.normalise({...input,categories:[sample.categories[0],sample.categories[0]]})).toThrow("DUPLICATE_CATEGORY_ID");
    expect(() => service.normalise({...input,modelHash:"0".repeat(64)})).toThrow("UNSUPPORTED_MODEL_OR_LUT_HASH");
    expect(() => service.normalise({...input,lutHash:"0".repeat(64)})).toThrow("UNSUPPORTED_MODEL_OR_LUT_HASH");
    expect(() => createProbabilityService({...SYNTHETIC_ALPHA_PACK,lutVersion:"LC_EXP_LUT_V2"})).toThrow();
    const request = {kind:"SAMPLE_CATEGORY",...input,randomVersion:"SHA256_COUNTER_V1",stageName:"contact",address:sample.address};
    expect(() => service.execute(request)).toThrow("STAGE_ADDRESS_MISMATCH");
    const good = service.normalise(input).categories;
    expect(() => chooseCategoricalMass(good.map((v,i)=>i===1?{...v,cumulative:v.cumulative-1}:v),42)).toThrow("INVALID_CUMULATIVE_MASS");
  });
  it("rejects unsafe arithmetic, fractional features and unknown properties in both validators", () => {
    const categories = sample.categories;
    const valid = {kind:"NORMALISE_CATEGORIES", ...ctx(categories)};
    expect(ProbabilityContextSchema.parse(ctx(categories))).toBeTruthy();
    expect(ProbabilityRequestSchema.parse(valid)).toBeTruthy();
    expect(compiled("NormaliseCategoriesRequest")(valid)).toBe(true);
    for(const bad of [
      {...valid,unknown:1},
      {...valid,categories:[]},
      {...valid,categories:[{...categories[0],terms:[{featureBp:1.1,coefficientBp:500}]}]},
      {...valid,categories:[{...categories[0],baseWeight:Number.MAX_SAFE_INTEGER}]},
      {...valid,categories:[{...categories[0],interceptBp:Infinity}]},
      {...valid,categories:[{...categories[0],terms:[{featureBp:20001,coefficientBp:500}]}]},
    ]) {
      expect(ProbabilityRequestSchema.safeParse(bad).success).toBe(false);
      expect(compiled("NormaliseCategoriesRequest")(bad)).toBe(false);
    }
    const sampled = {kind:"SAMPLE_CATEGORY",...ctx(categories),randomVersion:"SHA256_COUNTER_V1",stageName:"legality",address:sample.address};
    expect(compiled("SampleCategoryRequest")(sampled)).toBe(true);
    expect(compiled("ProbabilityPack")(SYNTHETIC_ALPHA_PACK)).toBe(true);
    expect(compiled("ProbabilityRequest")(sampled)).toBe(true);
  });
  it("builds versioned F2 legality and F3 contact coefficient inputs independently", () => {
    const leg = legalityCategories({controlRating:80,fatigueBp:2000,line:"LEG",effort:"MAXIMUM"});
    const contact = contactCategories({phase:"T20_LATE",defenceRating:70,timingRating:40,
      powerRating:80,effectiveMovementBp:5000,aggression:4});
    expect(leg).toEqual(vectors.cases[13]!.categories);
    expect(contact).toEqual(vectors.cases[14]!.categories);
    expect(service.normalise(ctx(leg)).categories).toEqual(vectors.cases[13]!.masses);
    expect(service.normalise(ctx(contact)).categories).toEqual(vectors.cases[14]!.masses);
    expect(() => legalityCategories({controlRating:101,fatigueBp:2000,line:"LEG",effort:"MAXIMUM"})).toThrow();
    expect(() => contactCategories({phase:"T20_LATE",defenceRating:70,timingRating:40,
      powerRating:80,effectiveMovementBp:20000,aggression:4})).toThrow();
  });
  it("leaves original draws unchanged after unrelated calls and prediction-domain requests", () => {
    const req={kind:"SAMPLE_CATEGORY",...ctx(sample.categories),randomVersion:"SHA256_COUNTER_V1",stageName:"legality",address:sample.address};
    const first=service.execute(req);
    for(const fixture of [...vectors.cases].reverse()) service.execute({ ...req, address:fixture.address });
    service.execute({...req,address:{...sample.address,domain:"PREDICTION"}});
    expect(service.execute(req)).toEqual(first);
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(service.normalise(ctx(sample.categories)).categories)).toBe(true);
    expect(baselineCategories("LEGALITY").map(c=>c.baseWeight)).toEqual([9820,130,50]);
    expect(baselineCategories("T20_EARLY")).toHaveLength(6);
  });
});
