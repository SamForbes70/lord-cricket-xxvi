import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateT20MatchSetup, verifyFrozenWorldBytes } from "@lcxxvi/simulation";
import { DELIVERY_STAGE_PACK, SYNTHETIC_ALPHA_PACK, RULE_MANIFESTS } from "@lcxxvi/data";
const worldBytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const good = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const negativeCases = JSON.parse(readFileSync("tests/fixtures/world/negative-cases.json", "utf8")) as {
  cases: { id: string; target: string; reason: string; changes: { op: string; path: string; value?: unknown }[] }[];
};
function mutated(source: unknown, changes: {op:string;path:string;value?:unknown}[]) {
  const root = structuredClone(source) as Record<string, unknown>;
  for (const edit of changes) {
    const parts = edit.path.split("/").slice(1);
    let node: Record<string, unknown> = root;
    for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
    const key = parts.at(-1)!;
    if (edit.op === "remove") delete node[key];
    else node[key] = structuredClone(edit.value);
  }
  return root;
}

describe("07A immutable T20 match bootstrap", () => {
  it("accepts independently selected legal 11-player XIs and returns frozen match snapshots", () => {
    const snapshot = validateT20MatchSetup(good, worldBytes, manifest);
    expect(snapshot.fixtureOnly).toBe(true);
    expect(snapshot.setupVersion).toBe("LC_T20_SETUP_V1");
    expect(snapshot.modelStatus).toBe("SYNTHETIC_ALPHA");
    expect(snapshot.teams.map((t) => t.xi.length)).toEqual([11,11]);
    expect(snapshot.teams[0].keeperId).toBe("p001");
    expect(snapshot.teams[1].captainId).toBe("p032");
    expect(snapshot.versions.rules).toBe("LC_T20_01");
    expect(snapshot.versions.worldHash).toBe(manifest.worldCanonicalSha256);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.teams[0].xi)).toBe(true);
    expect(Object.isFrozen(snapshot.teams[0].xi[0]!.skills.T20)).toBe(true);
    expect(Object.isFrozen(snapshot.ground.pitchPrior)).toBe(true);
    const raw = JSON.parse(worldBytes.toString());
    raw.players[0].skills.T20.defence = 0;
    expect(snapshot.teams[0].xi[0]!.skills.T20.defence).not.toBe(0);
    const second = validateT20MatchSetup(good, worldBytes, manifest);
    expect(second).toEqual(snapshot);
    expect(second.teams[0].xi[0]).not.toBe(snapshot.teams[0].xi[0]);
    expect(() => { (snapshot.teams[0].xi[0]!.skills.T20 as { defence: number }).defence = 1; }).toThrow(TypeError);
    expect(() => { (snapshot.ground.pitchPrior as { seamBp: number }).seamBp = 1; }).toThrow(TypeError);
  });
  for (const invalid of negativeCases.cases.filter((c) => c.target === "setup")) {
    it(`rejects ${invalid.id}: ${invalid.reason}`, () => {
      expect(() => validateT20MatchSetup(mutated(good, invalid.changes), worldBytes, manifest)).toThrow();
    });
  }
  it("rejects substituted rule, model or stage pack, even with a plausible request hash", () => {
    expect(() => validateT20MatchSetup(good, worldBytes, manifest,{...RULE_MANIFESTS[0],bowlerMaxBalls:30})).toThrow(/non-pinned/);
    expect(() => validateT20MatchSetup(good, worldBytes, manifest,RULE_MANIFESTS[0],{...SYNTHETIC_ALPHA_PACK, probabilityVersion:"future"})).toThrow(/non-pinned/);
    expect(() => validateT20MatchSetup(good, worldBytes, manifest,RULE_MANIFESTS[0],SYNTHETIC_ALPHA_PACK,{...DELIVERY_STAGE_PACK,noLiveMatchOrCalibration:false})).toThrow(/non-pinned/);
  });
  it("does not accept world/manifest recomputations or extra bytes", () => {
    const tampered = Buffer.from(worldBytes.toString().replace("Aster Harbour","Aster Bypass"));
    expect(() => verifyFrozenWorldBytes(tampered,manifest)).toThrow();
    const altered = {...manifest, worldFileSha256:"1".repeat(64),worldCanonicalSha256:"2".repeat(64)};
    expect(() => validateT20MatchSetup(good, worldBytes, altered)).toThrow();
  });
});
