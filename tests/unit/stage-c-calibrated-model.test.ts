/**
 * Stage C C2 (owner decision, 25 November 2026, option A): the model registry and the research-only
 * calibrated-t20-01 skill pack. synthetic-alpha-01 must be unaffected; the research model is reachable only through
 * validateT20ResearchMatchSetup.
 * C4: the calibrated model also carries the delivery-outcome pack, and its model hash covers both components.
 * C5: delivery pack V2 (attacking into a spread field, skied slogs, hard running, stumpings, the pitch), and a third
 * component, the tactics pack (bowling length, effort and slip cordon); the model hash covers all three.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import baseRequest from "../fixtures/generator/base-request.json" with { type: "json" };
import {
  CALIBRATED_T20_MODEL_ID, GenerateDeliveryRequestSchema, PROBABILITY_MODEL_ID, PROBABILITY_MODEL_IDS,
  type GenerateDeliveryRequest,
} from "@lcxxvi/contracts";
import {
  CALIBRATED_T20_DELIVERY_PACK, CALIBRATED_T20_DELIVERY_PACK_SHA256, CALIBRATED_T20_MODEL_HASH,
  CALIBRATED_T20_PACK, CALIBRATED_T20_PACK_SHA256, CALIBRATED_T20_TACTICS_PACK, CALIBRATED_T20_TACTICS_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256, MODEL_PACK_SHA256, suggestedEleven,
} from "@lcxxvi/data";
import {
  MODEL_REGISTRY, calibratedEdgeCoverBp, calibratedFieldCover, calibratedPitchBp, calibratedSpreadAttackBp, canonicalStateBytes, conditionedContactCategories, coveringFielder, createProbabilityService, createT20CorpusRequest,
  createT20Session, executeT20Command, fixtureAutopilotStep, generateDelivery, registeredModel, sha256Hex,
  validateT20MatchSetup, validateT20ResearchMatchSetup, type T20Session,
} from "@lcxxvi/simulation";
import type { WorldPack } from "@lcxxvi/contracts";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const synthetic = GenerateDeliveryRequestSchema.parse(baseRequest);
const calibrated: GenerateDeliveryRequest = {
  ...synthetic, modelId: CALIBRATED_T20_MODEL_ID, modelHash: CALIBRATED_T20_MODEL_HASH,
  bowling: { ...synthetic.bowling, variationRating: 70 },
};

function corpusRequest(index: number) {
  const byId = new Map(world.players.map((p) => [p.playerId, p]));
  const request = createT20CorpusRequest(corpus.cases[index], base, world as never) as { selectedTeams: { teamId: string }[] };
  request.selectedTeams = request.selectedTeams.map((s) => ({
    teamId: s.teamId,
    ...suggestedEleven(world.teams.find((t) => t.teamId === s.teamId)!.squadIds.map((id) => byId.get(id)!), "T20"),
  }));
  return request;
}
function play(session: T20Session): T20Session {
  for (let n = 0; session.core.phase !== "COMPLETE"; n += 1) {
    if (n > 3000) throw new Error("NO_PROGRESS");
    session = executeT20Command(session, fixtureAutopilotStep(session)).session;
  }
  return session;
}

describe("Stage C model registry", () => {
  it("registers synthetic-alpha-01 as the only gameplay model, at its pinned hash", () => {
    // C6 added a second research id, calibrated-t20-02 (stage-c-calibrated-02-model.test.ts); this id is unchanged.
    expect(PROBABILITY_MODEL_IDS).toEqual([PROBABILITY_MODEL_ID, CALIBRATED_T20_MODEL_ID, "calibrated-t20-02"]);
    expect(MODEL_REGISTRY[PROBABILITY_MODEL_ID]).toMatchObject({ modelHash: MODEL_PACK_SHA256, gameplay: true, skillPack: null, deliveryPack: null, tacticsPack: null });
    expect(MODEL_REGISTRY[CALIBRATED_T20_MODEL_ID]).toMatchObject({ modelHash: CALIBRATED_T20_MODEL_HASH, gameplay: false });
  });
  it("accepts only registered id and hash pairs", () => {
    expect(registeredModel(PROBABILITY_MODEL_ID, MODEL_PACK_SHA256)?.modelId).toBe(PROBABILITY_MODEL_ID);
    expect(registeredModel(CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_MODEL_HASH)?.modelId).toBe(CALIBRATED_T20_MODEL_ID);
    expect(registeredModel(PROBABILITY_MODEL_ID, CALIBRATED_T20_MODEL_HASH)).toBeNull();
    // The skill pack's own hash alone no longer names the model: the model hash covers both components.
    expect(registeredModel(CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_PACK_SHA256)).toBeNull();
    expect(registeredModel(CALIBRATED_T20_MODEL_ID, MODEL_PACK_SHA256)).toBeNull();
    expect(registeredModel("calibrated-t20-02", CALIBRATED_T20_PACK_SHA256)).toBeNull();
    expect(registeredModel("toString", MODEL_PACK_SHA256)).toBeNull();
  });
  it("normalises a calibrated context with the shared LUT and echoes its id and hash", () => {
    const service = createProbabilityService();
    const categories = [{ id: "A", baseWeight: 1, allowed: true, interceptBp: 0, terms: [] }, { id: "B", baseWeight: 1, allowed: true, interceptBp: 0, terms: [] }];
    const context = { probabilityVersion: "LC_INTEGER_PROBABILITY_V1", lutVersion: "LC_EXP_LUT_V1", lutHash: service.lutHash, categories };
    const s = service.normalise({ ...context, modelId: PROBABILITY_MODEL_ID, modelHash: MODEL_PACK_SHA256 });
    const c = service.normalise({ ...context, modelId: CALIBRATED_T20_MODEL_ID, modelHash: CALIBRATED_T20_MODEL_HASH });
    expect(c.categories).toEqual(s.categories);
    expect([c.modelId, c.modelHash]).toEqual([CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_MODEL_HASH]);
    expect(() => service.normalise({ ...context, modelId: CALIBRATED_T20_MODEL_ID, modelHash: MODEL_PACK_SHA256 })).toThrow(/UNSUPPORTED_MODEL_OR_LUT_HASH/);
  });
});

describe("calibrated-t20-01 skill pack", () => {
  it("is pinned, research only, and built on the unchanged synthetic-alpha-01 packs", () => {
    expect(sha256Hex(canonicalStateBytes(CALIBRATED_T20_PACK))).toBe(CALIBRATED_T20_PACK_SHA256);
    expect(CALIBRATED_T20_PACK.manifest).toMatchObject({ modelId: CALIBRATED_T20_MODEL_ID, status: "RESEARCH_ONLY", gameplayIntegrationPermitted: false });
    expect(CALIBRATED_T20_PACK.manifest.base).toEqual({ probabilityPackSha256: MODEL_PACK_SHA256, stagePackSha256: DELIVERY_STAGE_PACK_SHA256 });
    for (const stage of [CALIBRATED_T20_PACK.contact, CALIBRATED_T20_PACK.runs])
      for (const row of Object.values(stage)) for (const v of Object.values(row)) expect(Number.isInteger(v)).toBe(true);
  });
  it("has no separate dismissal term and gives variation a wicket and boundary trade-off", () => {
    expect(Object.keys(CALIBRATED_T20_PACK.contact).sort()).toEqual(["AERIAL", "EDGE", "MISS"]);
    expect(CALIBRATED_T20_PACK.cancelMissDismissalSkill).toBe(true);
    expect(CALIBRATED_T20_PACK.contact.EDGE!.VARIATION).toBeGreaterThan(0);
    expect(CALIBRATED_T20_PACK.runs["4"]!.VARIATION).toBeGreaterThan(0);
    expect(CALIBRATED_T20_PACK.runs["4"]!.CONTROL).toBeLessThan(0);
  });
  it("leaves the synthetic generator's categories untouched and adds terms only for the calibrated model", () => {
    const s = conditionedContactCategories(synthetic, "GOOD", false);
    const c = conditionedContactCategories(calibrated, "GOOD", false);
    // Skill terms from the skill pack, plus the delivery pack's three contact terms (phase intercept, aggression, pitch)
    // and the tactics pack's three (executed length, length by aggression, effort).
    expect(c.map((row) => row.terms.length - s.find((x) => x.id === row.id)!.terms.length)).toEqual(
      c.map((row) => Object.keys((CALIBRATED_T20_PACK.contact as Record<string, object>)[row.id] ?? {}).length + 6));
  });
  it("requires the variation rating for the calibrated model and refuses it for synthetic-alpha-01", () => {
    expect(generateDelivery(calibrated).kind).toBe("GENERATED_DELIVERY");
    expect(generateDelivery(calibrated).modelHash).toBe(CALIBRATED_T20_MODEL_HASH);
    expect(() => generateDelivery({ ...synthetic, bowling: { ...synthetic.bowling, variationRating: 70 } })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
    expect(() => generateDelivery({ ...calibrated, bowling: synthetic.bowling })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
    expect(() => generateDelivery({ ...calibrated, modelHash: MODEL_PACK_SHA256 })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
  });
});

describe("calibrated-t20-01 delivery-outcome pack (C4, V2 in C5)", () => {
  it("is pinned, research only, built on the pinned packs, and covered by the model hash", () => {
    expect(sha256Hex(canonicalStateBytes(CALIBRATED_T20_DELIVERY_PACK))).toBe(CALIBRATED_T20_DELIVERY_PACK_SHA256);
    expect(sha256Hex(canonicalStateBytes({ deliveryPackSha256: CALIBRATED_T20_DELIVERY_PACK_SHA256, skillPackSha256: CALIBRATED_T20_PACK_SHA256,
      tacticsPackSha256: CALIBRATED_T20_TACTICS_PACK_SHA256 }))).toBe(CALIBRATED_T20_MODEL_HASH);
    expect(CALIBRATED_T20_DELIVERY_PACK.manifest).toMatchObject({
      modelId: CALIBRATED_T20_MODEL_ID, packVersion: "LC_CALIBRATED_T20_DELIVERY_V2", status: "RESEARCH_ONLY", gameplayIntegrationPermitted: false,
    });
    expect(CALIBRATED_T20_DELIVERY_PACK.manifest.base).toEqual({
      probabilityPackSha256: MODEL_PACK_SHA256, stagePackSha256: DELIVERY_STAGE_PACK_SHA256, skillPackSha256: CALIBRATED_T20_PACK_SHA256,
    });
    expect(MODEL_REGISTRY[CALIBRATED_T20_MODEL_ID].deliveryPack).toBe(CALIBRATED_T20_DELIVERY_PACK);
  });
  it("uses only integer basis-point parameters and keeps every base weight positive somewhere", () => {
    const values: unknown[] = [];
    const walk = (v: unknown) => { if (v && typeof v === "object") Object.values(v).forEach(walk); else values.push(v); };
    walk(Object.fromEntries(Object.entries(CALIBRATED_T20_DELIVERY_PACK).filter(([key]) => key !== "manifest")));
    expect(values.length).toBeGreaterThan(60);
    for (const v of values) expect(Number.isInteger(v)).toBe(true);
    for (const row of Object.values(CALIBRATED_T20_DELIVERY_PACK.runs)) expect(row.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
  it("prices aggression through more aerial shots and fewer false shots than synthetic-alpha-01", () => {
    const at = (req: GenerateDeliveryRequest, aggression: number) =>
      createProbabilityService().normalise({ probabilityVersion: req.probabilityVersion, modelId: req.modelId, modelHash: req.modelHash,
        lutVersion: req.lutVersion, lutHash: req.lutHash,
        categories: conditionedContactCategories({ ...req, batting: { ...req.batting, aggression } }, "GOOD", false) }).categories;
    const share = (rows: readonly { id: string; mass: number }[], id: string) => rows.find((r) => r.id === id)!.mass / rows.reduce((a, r) => a + r.mass, 0);
    for (const req of [synthetic, calibrated]) expect(share(at(req, 4), "AERIAL")).toBeGreaterThan(share(at(req, 0), "AERIAL"));
    const missRise = (req: GenerateDeliveryRequest) => share(at(req, 4), "MISS") / share(at(req, 0), "MISS");
    expect(missRise(calibrated)).toBeLessThan(missRise(synthetic));
  });
  it("splits field cover into ring and deep without changing the chosen fielder", () => {
    const sector = synthetic.field.slots[0]!.sector;
    const chosen = coveringFielder(calibrated, sector, "GROUND");
    expect(coveringFielder(synthetic, sector, "GROUND")).toEqual(chosen);
    const cover = calibratedFieldCover(calibrated, sector, "GROUND", chosen);
    expect(Math.max(cover.ringBp, cover.deepBp)).toBeGreaterThanOrEqual(chosen.coverageBp);
    expect(calibratedFieldCover(calibrated, sector, "EDGE", chosen)).toEqual({ ringBp: calibratedEdgeCoverBp(calibrated, chosen), deepBp: 0 });
  });
});

describe("calibrated-t20-01 delivery V2 mechanisms (C5)", () => {
  const withField = (req: GenerateDeliveryRequest, deep: number, aggression: number): GenerateDeliveryRequest => ({
    ...req, batting: { ...req.batting, aggression },
    field: { ...req.field, slots: req.field.slots.map((slot, n) => ({ ...slot, depth: n < deep ? "DEEP" as const : "MIDDLE" as const })) },
  });
  it("gives the spread-field attack feature only to attacking strokes, scaled by the boundary riders", () => {
    expect(calibratedSpreadAttackBp(withField(calibrated, 4, 2))).toBe(0);
    expect(calibratedSpreadAttackBp(withField(calibrated, 4, 0))).toBe(0);
    expect(calibratedSpreadAttackBp(withField(calibrated, 4, 3))).toBe(8000);
    expect(calibratedSpreadAttackBp(withField(calibrated, 5, 4))).toBe(20000);
    expect(calibratedSpreadAttackBp(withField(calibrated, 2, 4))).toBe(8000);
    const { runsAggressionDeepBp } = CALIBRATED_T20_DELIVERY_PACK;
    expect(runsAggressionDeepBp["0"]).toBeLessThan(0);
    expect(runsAggressionDeepBp["1"]).toBeGreaterThan(0);
  });
  it("reads the pitch only for the calibrated model, about the pack's centre", () => {
    const centre = CALIBRATED_T20_DELIVERY_PACK.pitch.centreBp;
    expect(calibratedPitchBp({ ...synthetic, conditions: { seamBp: 9000, turnBp: 9000 } })).toBe(0);
    expect(calibratedPitchBp({ ...calibrated, conditions: { seamBp: centre, turnBp: centre } })).toBe(0);
    expect(calibratedPitchBp({ ...calibrated, conditions: { seamBp: centre + 500, turnBp: centre + 700 } })).toBe(1200);
    expect(CALIBRATED_T20_DELIVERY_PACK.pitch.contact.MISS).toBeGreaterThan(0);
    expect(CALIBRATED_T20_DELIVERY_PACK.pitch.runs["4"]).toBeLessThan(0);
  });
  it("raises the stumping fraction and prices hard running, for the calibrated model only", () => {
    const { stumping, runOutAggressionBp } = CALIBRATED_T20_DELIVERY_PACK;
    expect(stumping.numerator / stumping.denominator).toBeGreaterThan(3 / 1000);
    expect(runOutAggressionBp).toBeGreaterThan(0);
  });
});

describe("calibrated-t20-01 tactics pack (C5)", () => {
  it("is pinned, research only, labelled as design choices, and built on the pinned packs", () => {
    expect(sha256Hex(canonicalStateBytes(CALIBRATED_T20_TACTICS_PACK))).toBe(CALIBRATED_T20_TACTICS_PACK_SHA256);
    expect(CALIBRATED_T20_TACTICS_PACK.manifest).toMatchObject({
      modelId: CALIBRATED_T20_MODEL_ID, packVersion: "LC_CALIBRATED_T20_TACTICS_V1", status: "RESEARCH_ONLY", gameplayIntegrationPermitted: false,
    });
    expect(CALIBRATED_T20_TACTICS_PACK.manifest.basis).toMatch(/design choices/);
    expect(CALIBRATED_T20_TACTICS_PACK.manifest.base).toEqual({ probabilityPackSha256: MODEL_PACK_SHA256, stagePackSha256: DELIVERY_STAGE_PACK_SHA256 });
    expect(MODEL_REGISTRY[CALIBRATED_T20_MODEL_ID].tacticsPack).toBe(CALIBRATED_T20_TACTICS_PACK);
    const values: unknown[] = [];
    const walk = (v: unknown) => { if (v && typeof v === "object") Object.values(v).forEach(walk); else values.push(v); };
    walk(Object.fromEntries(Object.entries(CALIBRATED_T20_TACTICS_PACK).filter(([key]) => key !== "manifest")));
    for (const v of values) expect(Number.isInteger(v)).toBe(true);
    // Bounded: no single tactics term exceeds half a unit of logit.
    for (const v of values as number[]) expect(Math.abs(v)).toBeLessThanOrEqual(7000);
  });
  it("trades economy against wickets: yorkers save boundaries and hit the stumps, effort adds false shots and boundaries", () => {
    const { length, effort } = CALIBRATED_T20_TACTICS_PACK;
    expect(length.runs.YORKER["4"]).toBeLessThan(0);
    expect(length.dismissal.YORKER.BOWLED).toBeGreaterThan(length.dismissal.GOOD.BOWLED);
    expect(length.dismissal.SHORT.BOWLED).toBeLessThan(0);
    expect(effort.contact.EDGE).toBeGreaterThan(0);
    expect(effort.runs["4"]).toBeGreaterThan(0);
    expect(effort.intendedLengthBp).toBeLessThan(0);
  });
  it("covers an edge by the keeper and slip cordon only for the calibrated model", () => {
    const keeper = { playerId: synthetic.context.keeperId, coverageBp: 10000, catchingRating: 60, throwingRating: 60, role: "KEEPER" };
    const slips = (req: GenerateDeliveryRequest, n: number): GenerateDeliveryRequest => ({
      ...req, field: { ...req.field, slots: req.field.slots.map((slot, i) => ({ ...slot, role: i < n ? "SLIP" as const : "NORMAL" as const })) },
    });
    const { keeperEdgeBp, slipEdgeBp } = CALIBRATED_T20_TACTICS_PACK.field;
    expect(calibratedEdgeCoverBp(slips(synthetic, 0), keeper)).toBe(10000);
    expect(calibratedEdgeCoverBp(slips(calibrated, 0), keeper)).toBe(keeperEdgeBp);
    expect(calibratedEdgeCoverBp(slips(calibrated, 1), keeper)).toBe(keeperEdgeBp + slipEdgeBp);
    expect(calibratedEdgeCoverBp(slips(calibrated, 2), keeper)).toBe(Math.min(10000, keeperEdgeBp + 2 * slipEdgeBp));
  });
});

describe("research set-up path", () => {
  it("keeps validateT20MatchSetup on synthetic-alpha-01 and records the research model only when asked", () => {
    const request = corpusRequest(0);
    const plain = validateT20MatchSetup(request, bytes, manifest);
    const research = validateT20ResearchMatchSetup(request, bytes, manifest, CALIBRATED_T20_MODEL_ID);
    expect([plain.versions.model, plain.versions.modelHash]).toEqual([PROBABILITY_MODEL_ID, MODEL_PACK_SHA256]);
    expect([research.versions.model, research.versions.modelHash]).toEqual([CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_MODEL_HASH]);
    expect({ ...research, versions: plain.versions }).toEqual(plain);
    expect(() => validateT20ResearchMatchSetup(request, bytes, manifest, "synthetic-alpha-01" as never)).toThrow(/unsupported research model ID/);
  });
  it("plays a deterministic calibrated match that differs from the synthetic one on the same seed", () => {
    const request = corpusRequest(1);
    const a = play(createT20Session(validateT20ResearchMatchSetup(request, bytes, manifest, CALIBRATED_T20_MODEL_ID)));
    const b = play(createT20Session(validateT20ResearchMatchSetup(request, bytes, manifest, CALIBRATED_T20_MODEL_ID)));
    const s = play(createT20Session(validateT20MatchSetup(request, bytes, manifest)));
    expect(a.lastEventHash).toBe(b.lastEventHash);
    expect(a.lastEventHash).not.toBe(s.lastEventHash);
    expect(a.executionManifest.modelHash).toBe(CALIBRATED_T20_MODEL_HASH);
    expect(s.executionManifest.modelHash).toBe(MODEL_PACK_SHA256);
  });
});
