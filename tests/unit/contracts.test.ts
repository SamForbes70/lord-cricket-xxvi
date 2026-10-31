import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as c from "@lcxxvi/contracts";
import { RULE_MANIFESTS } from "@lcxxvi/data";
import {
  player,
  command,
  tactics,
  delivery,
  versions,
  hash,
} from "../fixtures/contracts.js";
// AJV runs the emitted, independent JSON Schema boundary.
const ajv = new Ajv2020.default({ strict: true, allErrors: true });
addFormats.default(ajv);
const schema = (name: string) =>
  ajv.getSchema(`urn:lcxxvi:${name}:1`) ??
  ajv.compile(
    JSON.parse(
      readFileSync(`packages/contracts/schemas/${name}Schema.json`, "utf8"),
    ),
  );
describe("normative Appendix A/B/G boundary", () => {
  it("accepts Appendix B command unchanged in both validators", () => {
    expect(c.CommandSchema.parse(command)).toEqual(command);
    expect(schema("Command")(command)).toBe(true);
  });
  it.each([0, 1, 2, 3, 4])("accepts aggression %i", (aggression) => {
    expect(
      c.BattingPlanSchema.safeParse({ ...command.payload, aggression }).success,
    ).toBe(true);
  });
  it.each([-1, 5, 1.5, "3", null, Infinity, NaN])(
    "rejects malformed aggression %s",
    (aggression) => {
      const input = { ...command.payload, aggression };
      expect(c.BattingPlanSchema.safeParse(input).success).toBe(false);
      expect(schema("BattingPlan")(input)).toBe(false);
    },
  );
  it("rejects unknown root and nested fields", () => {
    expect(
      c.CommandSchema.safeParse({ ...command, execute: "evil" }).success,
    ).toBe(false);
    const bad = { ...command, payload: { ...command.payload, script: "evil" } };
    expect(c.CommandSchema.safeParse(bad).success).toBe(false);
    expect(schema("Command")(bad)).toBe(false);
  });
  it("rejects missing and unsafe counters", () => {
    const { expectedRevision: _, ...missing } = command;
    expect(_).toBe(82);
    expect(c.CommandSchema.safeParse(missing).success).toBe(false);
    expect(c.CounterSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(
      false,
    );
  });
  it("preserves Unicode names through 80 code points", () => {
    expect(
      c.PlayerSchema.safeParse({ ...player, name: "🏏".repeat(80) }).success,
    ).toBe(true);
    expect(
      c.PlayerSchema.safeParse({ ...player, name: "🏏".repeat(81) }).success,
    ).toBe(false);
  });
  it("requires all three format profiles and all skill fields", () => {
    expect(
      c.PlayerSchema.safeParse({
        ...player,
        skills: { T20: player.skills.T20 },
      }).success,
    ).toBe(false);
    expect(
      c.PlayerSchema.safeParse({
        ...player,
        skills: { ...player.skills, T20: { ...player.skills.T20, power: 101 } },
      }).success,
    ).toBe(false);
  });
  it("checks true calendar dates and positive sector total", () => {
    expect(
      c.PlayerSchema.safeParse({ ...player, birthDate: "2001-02-29" }).success,
    ).toBe(false);
    expect(c.validatePlayer(player, ["stock"])).toEqual(player);
    expect(() =>
      c.validatePlayer(
        { ...player, shotSectorWeights: [0, 0, 0, 0, 0, 0, 0, 0] },
        ["stock"],
      ),
    ).toThrow("positive");
    expect(() => c.validatePlayer(player, [])).toThrow("variation");
  });
  it("checks nine unique field players and slots", () => {
    expect(c.validateTeamTactics(tactics)).toEqual(tactics);
    const bad = structuredClone(tactics);
    bad.fieldSlots[1] = bad.fieldSlots[0]!;
    expect(() => c.validateTeamTactics(bad)).toThrow("unique");
    expect(
      c.TeamTacticsSchema.safeParse({ ...tactics, fieldSlots: [] }).success,
    ).toBe(false);
  });
  it("checks keyed batting plans", () => {
    expect(() =>
      c.validateTeamTactics({
        ...tactics,
        battingPlans: {
          p1: { playerId: "other", aggression: 2, intent: "NORMAL" },
          p2: tactics.battingPlans.p2,
        },
      }),
    ).toThrow("key");
  });
  it("accepts nullable delivery fields and rejects invalid sectors", () => {
    expect(c.DeliveryRecordedSchema.parse(delivery)).toEqual(delivery);
    expect(schema("DeliveryRecorded")(delivery)).toBe(true);
    expect(
      c.DeliveryRecordedSchema.safeParse({ ...delivery, shotSector: 8 })
        .success,
    ).toBe(false);
  });
  it("requires one-based event sequences and full SHA256 hashes", () => {
    const e = {
      gameId: "g1",
      matchId: "m1",
      sequence: 1,
      commandId: "cmd-0091",
      previousHash: hash,
      stateHash: hash,
      payload: delivery,
    };
    expect(c.EventEnvelopeSchema.parse(e)).toEqual(e);
    expect(c.EventEnvelopeSchema.safeParse({ ...e, sequence: 0 }).success).toBe(
      false,
    );
    expect(
      c.EventEnvelopeSchema.safeParse({ ...e, previousHash: "abc" }).success,
    ).toBe(false);
  });
  it("rejects arbitrary administrative payloads and unknown discriminators", () => {
    expect(
      c.AdministrativeEventSchema.safeParse({
        type: "BALL_REPLACED",
        inningsIndex: 0,
        ballId: "ball-2",
        ballAgeLegalBalls: 0,
      }).success,
    ).toBe(true);
    expect(
      c.AdministrativeEventSchema.safeParse({
        type: "BALL_REPLACED",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      c.CommandSchema.safeParse({ ...command, kind: "EXECUTE_CODE" }).success,
    ).toBe(false);
  });
  it("requires unused result margins to be null", () => {
    expect(
      c.MatchResultSchema.safeParse({
        kind: "TIE",
        winnerTeamId: null,
        marginType: null,
        marginRuns: null,
        marginWickets: null,
        completionReason: "Fixture",
      }).success,
    ).toBe(true);
    expect(
      c.MatchResultSchema.safeParse({
        kind: "WIN",
        winnerTeamId: "t1",
        marginType: "RUNS",
        marginRuns: 4,
        marginWickets: 2,
        completionReason: "Fixture",
      }).success,
    ).toBe(false);
  });
  it("pins all three custom rule manifests with rain disabled", () => {
    expect(RULE_MANIFESTS.map((r) => r.rulesId)).toEqual([
      "LC_T20_01",
      "LC_ODI_01",
      "LC_RED5_01",
    ]);
    for (const rule of RULE_MANIFESTS) {
      expect(schema("RuleManifest")(rule)).toBe(true);
      expect(rule.limitedOversRain).toBe(false);
      expect(rule.validationStatus).toBe("CONTRACT_ONLY");
    }
  });
  it("rejects portable archive traversal and excess size", () => {
    for (const path of ["../evil", "/evil", "packs/../evil", "packs\\evil"])
      expect(
        c.ArchiveEntrySchema.safeParse({ path, bytes: 1, sha256: hash })
          .success,
      ).toBe(false);
    expect(
      c.ArchiveEntrySchema.safeParse({
        path: "game.json",
        bytes: 100_000_001,
        sha256: hash,
      }).success,
    ).toBe(false);
  });
  it("rejects unsupported versions or mismatched content hashes", () => {
    const support = {
      schema: ["1.0.0"],
      engine: ["contract-foundation-01"],
      random: ["SHA256_COUNTER_V1"],
      rules: { LC_T20_01: hash },
      model: { "test-model": hash },
      worldHashes: [hash],
    };
    expect(c.assertSupportedVersions(versions, support)).toEqual(versions);
    expect(() =>
      c.assertSupportedVersions(
        { ...versions, rulesHash: "b".repeat(64) },
        support,
      ),
    ).toThrow("UNSUPPORTED_VERSION");
    expect(() =>
      c.assertSupportedVersions({ ...versions, engine: "future" }, support),
    ).toThrow("UNSUPPORTED_VERSION");
  });
});

it("every generated schema compiles with strict AJV 2020-12", () => {
  const files = readdirSync("packages/contracts/schemas").filter((f) =>
    f.endsWith("Schema.json"),
  );
  expect(files.length).toBe(188);
  for (const name of ["DelegationCategorySchema.json", "DelegationChangeSchema.json", "DelegationJournalSchema.json"]) expect(files).toContain(name);
  for (const added of ["M7JAdjudicationRequest", "M7JAdjudicationResult", "M7JAdminEvent", "M7JExceptionalCommand", "NewGameWorldCopy", "SeasonPortableManifestV2"]) {
    expect(files).toContain(`${added}Schema.json`);
  }
  for (const f of files)
    expect(schema(f.replace("Schema.json", ""))).toBeTypeOf("function");
});

it("the delegation change schema rejects duplicate categories", () => {
  const validate = schema("DelegationChange");
  expect(validate({ commandId: "one", expectedRevision: 0, matchRevision: 0, teamId: "team", categories: ["BOWLER", "BOWLER"] })).toBe(false);
  expect(validate({ commandId: "one", expectedRevision: 0, matchRevision: 0, teamId: "team", categories: ["BOWLER"] })).toBe(true);
});

it("generated tuples reject missing and excess entries just like runtime", () => {
  const valid = {
    schemaVersion: "1.0.0",
    gameId: "g1",
    matchId: "m1",
    format: "T20",
    worldPackId: "w1",
    rulesId: "r1",
    modelId: "model1",
    randomId: "SHA256_COUNTER_V1",
    seed: "s1",
    teamIds: ["t1", "t2"],
    groundId: "ground1",
    capabilities: {
      limitedOversRain: false,
      superOver: false,
      injuries: false,
      prediction: false,
    },
  };
  expect(schema("MatchSetupManifest")(valid)).toBe(true);
  for (const teamIds of [[], ["t1"], ["t1", "t2", "t3"]]) {
    const bad = { ...valid, teamIds };
    expect(schema("MatchSetupManifest")(bad)).toBe(false);
    expect(c.MatchSetupManifestSchema.safeParse(bad).success).toBe(false);
  }
});
