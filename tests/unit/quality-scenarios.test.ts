import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalJson } from "@lcxxvi/contracts";
import { validateT20MatchSetup, verifyFrozenWorldBytes, runFixtureT20, projectT20Scorecard } from "@lcxxvi/simulation";
import { createHash } from "node:crypto";
import { runTacticalT20 } from "../../apps/batch/src/tactical-match.js";
import { qualityScenarioRequests, runQualityScenario, summariseQualityScenarios } from "../../apps/batch/src/quality-scenarios.js";

const bytes = readFileSync("packages/data/worlds/fictional-eight-01.json");
const manifest = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.manifest.json", "utf8"));
const template = JSON.parse(readFileSync("tests/fixtures/world/t20-valid-setup.json", "utf8"));
const world = verifyFrozenWorldBytes(bytes, manifest).world;
const requests = qualityScenarioRequests(template, world, 1);
const setup = () => validateT20MatchSetup(requests[0], bytes, manifest);

describe("M7 scenario quality harness", () => {
  test("covers all teams and grounds with immutable deterministic paired cells", () => {
    const before = canonicalJson({ template, world });
    expect(requests).toHaveLength(32);
    expect(new Set(requests.flatMap(request => request.setup.teamIds)).size).toBe(8);
    expect(new Set(requests.map(request => request.setup.groundId)).size).toBe(8);
    expect(new Set(requests.map(request => request.setup.seed)).size).toBe(32);
    expect(qualityScenarioRequests(template, world, 1)).toEqual(requests);
    expect(canonicalJson({ template, world })).toBe(before);
    for (const request of requests) expect(() => validateT20MatchSetup(request, bytes, manifest)).not.toThrow();
  });

  test("rejects empty, fractional and unbounded seed counts", () => {
    for (const count of [0, -1, 1.5, 9, Number.NaN, Infinity]) {
      expect(() => qualityScenarioRequests(template, world, count)).toThrow("QUALITY_SEED_COUNT");
    }
  });

  test("observing either policy preserves its authoritative engine and scorecard hashes", () => {
    const input = setup();
    const before = canonicalJson(input);
    const baseline = runQualityScenario(input, "BASELINE");
    const tactical = runQualityScenario(input, "TACTICAL");
    for (const [observed, session] of [[baseline, runFixtureT20(input)], [tactical, runTacticalT20(input)]] as const) {
      expect(observed.finalEventHash).toBe(session.lastEventHash);
      expect(observed.scorecardSha256).toBe(createHash("sha256").update(canonicalJson(projectT20Scorecard(session))).digest("hex"));
      expect(Object.values(observed.deliveryPlans).reduce((a, b) => a + b, 0)).toBe(observed.innings.reduce((sum, innings) => sum + innings.attempts, 0));
      for (const innings of observed.innings) {
        expect(innings.attempts).toBe(innings.legalBalls + innings.illegals);
        expect(Object.values(innings.phases).reduce((sum, phase) => sum + phase.runs, 0)).toBe(innings.runs);
      }
    }
    expect(canonicalJson(input)).toBe(before);
    const summary = summariseQualityScenarios([baseline, tactical]);
    expect(summary.policies.map(policy => policy.matches)).toEqual([1, 1]);
    expect(summary.pairedFirstRunsDifferenceMean).toBe(tactical.innings[0]!.runs - baseline.innings[0]!.runs);
  }, 60_000);

  test("keeps winning chases separate and rejects duplicated or mismatched pairs", () => {
    const baseline = runQualityScenario(setup(), "BASELINE");
    const tactical = { ...structuredClone(baseline), policy: "TACTICAL" as const };
    tactical.innings[1]!.termination = "CHASE_WON";
    const summary = summariseQualityScenarios([baseline, tactical]);
    expect(summary.policies[1]!.chaseEndings.CHASE_WON).toBe(1);
    expect(summary.policies[1]!.firstMeanRuns).toBe(tactical.innings[0]!.runs);
    expect(() => summariseQualityScenarios([baseline, baseline, tactical])).toThrow("QUALITY_DUPLICATE_RUN");
    expect(() => summariseQualityScenarios([baseline, { ...tactical, seed: "wrong" }])).toThrow("QUALITY_UNPAIRED_SCENARIO");
    expect(() => summariseQualityScenarios([baseline])).toThrow("QUALITY_MISSING_POLICY");
    expect(() => summariseQualityScenarios([])).toThrow("QUALITY_EMPTY_COHORT");
  }, 60_000);
});
