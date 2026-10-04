import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  DefaultWorldManifestSchema,
  T20MatchSetupRequestSchema,
  T20TeamSelectionSchema,
  WorldPackSchema,
  validateWorldReferences,
} from "@lcxxvi/contracts";
import {
  MODEL_PACK_SHA256,
  DELIVERY_STAGE_PACK_SHA256,
  validateDefaultWorld,
} from "@lcxxvi/data";
import { verifyFrozenWorldBytes, createRandomService } from "@lcxxvi/simulation";
import type { DefaultWorldManifest } from "@lcxxvi/contracts";

const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const baseWorld = JSON.parse(worldBytes.toString("utf8"));
const manifest: DefaultWorldManifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const fixtures = JSON.parse(readFileSync("tests/fixtures/world/negative-cases.json", "utf8")) as {
  cases: { id: string; target: string; reason: string; changes: { op: string; path: string; value?: unknown }[] }[];
};
const refs = JSON.parse(readFileSync("packages/data/worlds/world-generation-vectors.json", "utf8")) as {
  vectors: { address: Parameters<ReturnType<typeof createRandomService>["uint32"]>[0]; expectedUint32: number }[];
};
function mutate<T>(source: T, changes: { op: string; path: string; value?: unknown }[]): T {
  const root = structuredClone(source) as Record<string, unknown>;
  for (const edit of changes) {
    const segments = edit.path.split("/").slice(1).map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
    let current: Record<string, unknown> = root;
    for (const segment of segments.slice(0, -1)) current = current[segment] as Record<string, unknown>;
    const key = segments.at(-1)!;
    if (edit.op === "remove") delete current[key];
    else current[key] = structuredClone(edit.value);
  }
  return root as T;
}
const ajv = new Ajv2020.default({ strict: true, allErrors: true });
addFormats.default(ajv);
const schema = (name: string) => ajv.getSchema(`urn:lcxxvi:${name}:1`) ?? ajv.compile(JSON.parse(readFileSync(`packages/contracts/schemas/${name}Schema.json`, "utf8")));

describe("07A independently authored fictional world", () => {
  it("parses the exact frozen 160/8/8 world through Zod and AJV", () => {
    expect(WorldPackSchema.parse(baseWorld)).toEqual(baseWorld);
    expect(schema("WorldPack")(baseWorld)).toBe(true);
    const result = validateDefaultWorld(baseWorld, manifest);
    expect(result.world.players).toHaveLength(160);
    expect(result.world.teams).toHaveLength(8);
    expect(result.world.grounds).toHaveLength(8);
    expect(result.manifest.modelHash).toBe(MODEL_PACK_SHA256);
    expect(result.manifest.stagePackHash).toBe(DELIVERY_STAGE_PACK_SHA256);
  });
  it("accepts the manifest through independent strict AJV and strict Zod", () => {
    expect(DefaultWorldManifestSchema.parse(manifest)).toEqual(manifest);
    expect(schema("DefaultWorldManifest")(manifest)).toBe(true);
    expect(T20TeamSelectionSchema.shape.playerIds.safeParse(new Array(11).fill("p001")).success).toBe(true);
    expect(schema("T20TeamSelection")({teamId:"team-01",playerIds:new Array(11).fill("p001"),captainId:"p001",keeperId:"p001"})).toBe(true);
  });
  it("verifies raw UTF-8 and canonical content against independently pinned SHA-256", () => {
    expect(verifyFrozenWorldBytes(worldBytes, manifest).world.players).toHaveLength(160);
    expect(() => verifyFrozenWorldBytes(Buffer.from(worldBytes.toString().replace("Aster Harbour", "Aster Hacked")), manifest)).toThrow(/frozen published world/);
    expect(() => verifyFrozenWorldBytes(Buffer.concat([worldBytes, Buffer.from(" ")]), manifest)).toThrow(/frozen published world/);
    const fakeManifest = {...manifest, worldFileSha256: "0".repeat(64)};
    expect(() => verifyFrozenWorldBytes(worldBytes, fakeManifest)).toThrow(/frozen worldFileSha256/);
  });
  it("matches all published WORLD_GENERATION digest vectors with the production implementation", () => {
    const random = createRandomService();
    for (const ref of refs.vectors) expect(random.uint32(ref.address)).toBe(ref.expectedUint32);
    expect(refs.vectors).toHaveLength(12);
  });
  for (const negative of fixtures.cases.filter((c) => c.target === "world" || c.target === "manifest")) {
    it(`rejects independent negative fixture ${negative.id}: ${negative.reason}`, () => {
      const world = negative.target === "world" ? mutate(baseWorld, negative.changes) : baseWorld;
      const m = negative.target === "manifest" ? mutate(manifest, negative.changes) : manifest;
      expect(() => validateDefaultWorld(world, m)).toThrow();
      if (negative.id === "W05-SHARED-PLAYER") {
        // Recorded 06.0 gap: the generic importer intentionally does not impose default-world exclusivity.
        expect(() => validateWorldReferences(world, ["stock"], ["LC_T20_01", "LC_ODI_01", "LC_RED5_01"])).not.toThrow();
      }
    });
  }
  it("rejects malformed manifest/request with both Zod and independently compiled AJV", () => {
    const badManifest = {...manifest, untrusted: true};
    expect(DefaultWorldManifestSchema.safeParse(badManifest).success).toBe(false);
    expect(schema("DefaultWorldManifest")(badManifest)).toBe(false);
    const request = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
    expect(T20MatchSetupRequestSchema.safeParse(request).success).toBe(true);
    expect(schema("T20MatchSetupRequest")(request)).toBe(true);
    const bad = {...request, ...{ setup: {...request.setup, script: "evil"} }};
    expect(T20MatchSetupRequestSchema.safeParse(bad).success).toBe(false);
    expect(schema("T20MatchSetupRequest")(bad)).toBe(false);
  });
});
