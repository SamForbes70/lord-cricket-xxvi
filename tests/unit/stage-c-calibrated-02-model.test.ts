/**
 * Stage C C6 (Studio Production Directive 03, 27 November 2026): calibrated-t20-02, a separately versioned research
 * refit. calibrated-t20-01 must be unchanged, calibrated-t20-02 must stay research only, and its packs may differ from
 * calibrated-t20-01's only in the parameters named in the pre-registered fit statement
 * (docs/pavilion/stage-c/C6_REFIT.md section 1b).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import baseRequest from "../fixtures/generator/base-request.json" with { type: "json" };
import {
  CALIBRATED_T20_02_MODEL_ID, CALIBRATED_T20_MODEL_ID, GenerateDeliveryRequestSchema, PROBABILITY_MODEL_ID,
  type GenerateDeliveryRequest, type WorldPack,
} from "@lcxxvi/contracts";
import {
  CALIBRATED_T20_02_DELIVERY_PACK, CALIBRATED_T20_02_DELIVERY_PACK_SHA256, CALIBRATED_T20_02_MODEL_HASH,
  CALIBRATED_T20_02_PACK, CALIBRATED_T20_02_PACK_SHA256, CALIBRATED_T20_DELIVERY_PACK, CALIBRATED_T20_DELIVERY_PACK_SHA256,
  CALIBRATED_T20_MODEL_HASH, CALIBRATED_T20_PACK, CALIBRATED_T20_PACK_SHA256, CALIBRATED_T20_TACTICS_PACK,
  CALIBRATED_T20_TACTICS_PACK_SHA256, DELIVERY_STAGE_PACK_SHA256, MODEL_PACK_SHA256, suggestedEleven,
} from "@lcxxvi/data";
import {
  MODEL_REGISTRY, canonicalStateBytes, createT20CorpusRequest, createT20Session, executeT20Command, fixtureAutopilotStep,
  generateDelivery, registeredModel, sha256Hex, validateT20MatchSetup, validateT20ResearchMatchSetup, type T20Session,
} from "@lcxxvi/simulation";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const world = JSON.parse(bytes.toString("utf8")) as WorldPack;
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const base = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const corpus = JSON.parse(readFileSync("tests/fixtures/t20/seed_corpus.json", "utf8")) as { cases: unknown[] };
const synthetic = GenerateDeliveryRequestSchema.parse(baseRequest);
const as02: GenerateDeliveryRequest = {
  ...synthetic, modelId: CALIBRATED_T20_02_MODEL_ID, modelHash: CALIBRATED_T20_02_MODEL_HASH,
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
const strip = (pack: object, drop: readonly string[]) => Object.fromEntries(Object.entries(pack).filter(([k]) => !drop.includes(k)));

describe("calibrated-t20-01 is unchanged by C6", () => {
  it("keeps its pinned component and model hashes and has no V3 phase terms", () => {
    expect([CALIBRATED_T20_PACK_SHA256, CALIBRATED_T20_DELIVERY_PACK_SHA256, CALIBRATED_T20_TACTICS_PACK_SHA256, CALIBRATED_T20_MODEL_HASH]).toEqual([
      "07949faa30bab7713ae2aa6d3e00e6b443c4812fc3bbfb5e3e4e26d4fb680bfa", "2ea31526811177f0a973e4b4612b457d1ba374f8c64b1af34b94585659b388ad",
      "006d7af87aa76d8c64bec76217c510df68447951ab60f9bf8e217e707d63f0e1", "64e09b4b00d2b3b9565a7e18b86e219933487713cbbd2a2b62e24885e6592802",
    ]);
    expect(MODEL_REGISTRY[CALIBRATED_T20_MODEL_ID].deliveryPack).toBe(CALIBRATED_T20_DELIVERY_PACK);
    expect(Object.hasOwn(CALIBRATED_T20_DELIVERY_PACK, "catchOpportunityPhaseBp")).toBe(false);
    expect(Object.hasOwn(CALIBRATED_T20_DELIVERY_PACK, "dismissalPhaseBp")).toBe(false);
  });
});

describe("calibrated-t20-02 (C6), research only", () => {
  it("is registered with its own pinned chain and is not a gameplay model", () => {
    const entry = MODEL_REGISTRY[CALIBRATED_T20_02_MODEL_ID];
    expect(entry).toMatchObject({ modelId: CALIBRATED_T20_02_MODEL_ID, modelHash: CALIBRATED_T20_02_MODEL_HASH, gameplay: false });
    expect(entry.skillPack).toBe(CALIBRATED_T20_02_PACK);
    expect(entry.deliveryPack).toBe(CALIBRATED_T20_02_DELIVERY_PACK);
    expect(entry.tacticsPack).toBe(CALIBRATED_T20_TACTICS_PACK);
    expect(Object.values(MODEL_REGISTRY).filter((m) => m.gameplay).map((m) => m.modelId)).toEqual([PROBABILITY_MODEL_ID]);
    expect(sha256Hex(canonicalStateBytes(CALIBRATED_T20_02_PACK))).toBe(CALIBRATED_T20_02_PACK_SHA256);
    expect(sha256Hex(canonicalStateBytes(CALIBRATED_T20_02_DELIVERY_PACK))).toBe(CALIBRATED_T20_02_DELIVERY_PACK_SHA256);
    expect(sha256Hex(canonicalStateBytes({ deliveryPackSha256: CALIBRATED_T20_02_DELIVERY_PACK_SHA256, skillPackSha256: CALIBRATED_T20_02_PACK_SHA256,
      tacticsPackSha256: CALIBRATED_T20_TACTICS_PACK_SHA256 }))).toBe(CALIBRATED_T20_02_MODEL_HASH);
    expect(CALIBRATED_T20_02_MODEL_HASH).not.toBe(CALIBRATED_T20_MODEL_HASH);
    for (const m of [CALIBRATED_T20_02_PACK.manifest, CALIBRATED_T20_02_DELIVERY_PACK.manifest])
      expect(m).toMatchObject({ modelId: CALIBRATED_T20_02_MODEL_ID, status: "RESEARCH_ONLY", gameplayIntegrationPermitted: false });
    expect(CALIBRATED_T20_02_PACK.manifest.packVersion).toBe("LC_CALIBRATED_T20_SKILL_V6");
    expect(CALIBRATED_T20_02_DELIVERY_PACK.manifest.packVersion).toBe("LC_CALIBRATED_T20_DELIVERY_V3");
    expect(CALIBRATED_T20_02_DELIVERY_PACK.manifest.base).toEqual({
      probabilityPackSha256: MODEL_PACK_SHA256, stagePackSha256: DELIVERY_STAGE_PACK_SHA256, skillPackSha256: CALIBRATED_T20_02_PACK_SHA256,
    });
  });
  it("accepts only its own id and hash pair", () => {
    expect(registeredModel(CALIBRATED_T20_02_MODEL_ID, CALIBRATED_T20_02_MODEL_HASH)?.modelId).toBe(CALIBRATED_T20_02_MODEL_ID);
    expect(registeredModel(CALIBRATED_T20_02_MODEL_ID, CALIBRATED_T20_MODEL_HASH)).toBeNull();
    expect(registeredModel(CALIBRATED_T20_MODEL_ID, CALIBRATED_T20_02_MODEL_HASH)).toBeNull();
    expect(() => generateDelivery({ ...as02, modelHash: CALIBRATED_T20_MODEL_HASH })).toThrow(/UNSUPPORTED_GENERATOR_PACK_OR_VERSION/);
    expect(generateDelivery(as02).modelHash).toBe(CALIBRATED_T20_02_MODEL_HASH);
  });
  it("differs from calibrated-t20-01 only in the pre-registered parameters (C6_REFIT.md section 1b)", () => {
    // Skill: only TIMING and POWER on a four and a six, and ROTATION on a dot, may differ.
    const skill = (pack: typeof CALIBRATED_T20_PACK) => {
      const runs = JSON.parse(JSON.stringify(pack.runs)) as Record<string, Record<string, number>>;
      for (const k of ["4", "6"]) { delete runs[k]!.TIMING; delete runs[k]!.POWER; }
      delete runs["0"]!.ROTATION;
      return { ...strip(pack, ["manifest", "runs"]), runs };
    };
    expect(skill(CALIBRATED_T20_02_PACK)).toEqual(skill(CALIBRATED_T20_PACK));
    const r = CALIBRATED_T20_02_PACK.runs;
    expect(r["4"]!.TIMING).toBe(r["4"]!.POWER);
    expect([r["6"]!.TIMING, r["6"]!.POWER]).toEqual([r["4"]!.TIMING, r["4"]!.TIMING]);
    // Delivery: every V2 field equal; V3 adds only the two phase-term fields, aerial and edge tied in each phase.
    expect(strip(CALIBRATED_T20_02_DELIVERY_PACK, ["manifest", "catchOpportunityPhaseBp", "dismissalPhaseBp"]))
      .toEqual(strip(CALIBRATED_T20_DELIVERY_PACK, ["manifest"]));
    for (const row of Object.values(CALIBRATED_T20_02_DELIVERY_PACK.catchOpportunityPhaseBp)) expect(row.AERIAL).toBe(row.EDGE);
    const values: unknown[] = [];
    const walk = (v: unknown) => { if (v && typeof v === "object") Object.values(v).forEach(walk); else values.push(v); };
    walk([CALIBRATED_T20_02_DELIVERY_PACK.catchOpportunityPhaseBp, CALIBRATED_T20_02_DELIVERY_PACK.dismissalPhaseBp, r]);
    for (const v of values) expect(Number.isInteger(v)).toBe(true);
  });
  it("is reachable only through the research set-up, and deterministic", () => {
    const request = corpusRequest(0);
    expect(validateT20MatchSetup(request, bytes, manifest).versions.model).toBe(PROBABILITY_MODEL_ID);
    const setup = validateT20ResearchMatchSetup(request, bytes, manifest, CALIBRATED_T20_02_MODEL_ID);
    expect([setup.versions.model, setup.versions.modelHash]).toEqual([CALIBRATED_T20_02_MODEL_ID, CALIBRATED_T20_02_MODEL_HASH]);
    expect(setup.modelStatus).toBe("SYNTHETIC_ALPHA");
    expect(() => validateT20ResearchMatchSetup(request, bytes, manifest, "synthetic-alpha-01" as never)).toThrow(/unsupported research model ID/);
    const a = play(createT20Session(setup));
    const b = play(createT20Session(validateT20ResearchMatchSetup(request, bytes, manifest, CALIBRATED_T20_02_MODEL_ID)));
    expect(b.events.length).toBe(a.events.length);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
  });
});
