/**
 * Stage C C2 (owner decision, 25 November 2026, option A): the model registry and the research-only
 * calibrated-t20-01 skill pack. synthetic-alpha-01 must be unaffected; the research model is reachable only through
 * validateT20ResearchMatchSetup.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import baseRequest from "../fixtures/generator/base-request.json" with { type: "json" };
import {
  CALIBRATED_T20_MODEL_ID, GenerateDeliveryRequestSchema, PROBABILITY_MODEL_ID, PROBABILITY_MODEL_IDS,
  type GenerateDeliveryRequest,
} from "@lcxxvi/contracts";
import {
  CALIBRATED_T20_PACK, CALIBRATED_T20_PACK_SHA256, DELIVERY_STAGE_PACK_SHA256, MODEL_PACK_SHA256, suggestedEleven,
} from "@lcxxvi/data";
import {
  MODEL_REGISTRY, canonicalStateBytes, conditionedContactCategories, createProbabilityService, createT20CorpusRequest,
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
  ...synthetic, modelId: CALIBRATED_T20_MODEL_ID, modelHash: CALIBRATED_T20_PACK_SHA256,
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
    expect(PROBABILITY_MODEL_IDS).toEqual([PROBABILITY_MODEL_ID, CALIBRATED_T20_MODEL_ID]);
    expect(MODEL_REGISTRY[PROBABILITY_MODEL_ID]).toMatchObject({ modelHash: MODEL_PACK_SHA256, gameplay: true, skillPack: null });
    expect(MODEL_REGISTRY[CALIBRATED_T20_MODEL_ID]).toMatchObject({ modelHash: CALIBRATED_T20_PACK_SHA256, gameplay: false });
  });
  it("accepts only registered id and hash pairs", () => {
    expect(registeredModel(PROBABILITY_MODEL_ID, MODEL_PACK_SHA256)?.modelId).toBe(PROBABILITY_MODEL_ID);
    expect(registeredModel(CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_PACK_SHA256)?.modelId).toBe(CALIBRATED_T20_MODEL_ID);
    expect(registeredModel(PROBABILITY_MODEL_ID, CALIBRATED_T20_PACK_SHA256)).toBeNull();
    expect(registeredModel(CALIBRATED_T20_MODEL_ID, MODEL_PACK_SHA256)).toBeNull();
    expect(registeredModel("calibrated-t20-02", CALIBRATED_T20_PACK_SHA256)).toBeNull();
    expect(registeredModel("toString", MODEL_PACK_SHA256)).toBeNull();
  });
  it("normalises a calibrated context with the shared LUT and echoes its id and hash", () => {
    const service = createProbabilityService();
    const categories = [{ id: "A", baseWeight: 1, allowed: true, interceptBp: 0, terms: [] }, { id: "B", baseWeight: 1, allowed: true, interceptBp: 0, terms: [] }];
    const context = { probabilityVersion: "LC_INTEGER_PROBABILITY_V1", lutVersion: "LC_EXP_LUT_V1", lutHash: service.lutHash, categories };
    const s = service.normalise({ ...context, modelId: PROBABILITY_MODEL_ID, modelHash: MODEL_PACK_SHA256 });
    const c = service.normalise({ ...context, modelId: CALIBRATED_T20_MODEL_ID, modelHash: CALIBRATED_T20_PACK_SHA256 });
    expect(c.categories).toEqual(s.categories);
    expect([c.modelId, c.modelHash]).toEqual([CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_PACK_SHA256]);
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
    expect(c.map((row) => row.terms.length - s.find((x) => x.id === row.id)!.terms.length)).toEqual(
      c.map((row) => Object.keys((CALIBRATED_T20_PACK.contact as Record<string, object>)[row.id] ?? {}).length));
  });
  it("requires the variation rating for the calibrated model and refuses it for synthetic-alpha-01", () => {
    expect(generateDelivery(calibrated).kind).toBe("GENERATED_DELIVERY");
    expect(generateDelivery(calibrated).modelHash).toBe(CALIBRATED_T20_PACK_SHA256);
    expect(() => generateDelivery({ ...synthetic, bowling: { ...synthetic.bowling, variationRating: 70 } })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
    expect(() => generateDelivery({ ...calibrated, bowling: synthetic.bowling })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
    expect(() => generateDelivery({ ...calibrated, modelHash: MODEL_PACK_SHA256 })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
  });
});

describe("research set-up path", () => {
  it("keeps validateT20MatchSetup on synthetic-alpha-01 and records the research model only when asked", () => {
    const request = corpusRequest(0);
    const plain = validateT20MatchSetup(request, bytes, manifest);
    const research = validateT20ResearchMatchSetup(request, bytes, manifest, CALIBRATED_T20_MODEL_ID);
    expect([plain.versions.model, plain.versions.modelHash]).toEqual([PROBABILITY_MODEL_ID, MODEL_PACK_SHA256]);
    expect([research.versions.model, research.versions.modelHash]).toEqual([CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_PACK_SHA256]);
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
    expect(a.executionManifest.modelHash).toBe(CALIBRATED_T20_PACK_SHA256);
    expect(s.executionManifest.modelHash).toBe(MODEL_PACK_SHA256);
  });
});
