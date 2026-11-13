import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as contracts from "@lcxxvi/contracts";
import {
  validateDeliveryResolution,
  ResolutionValidationError,
} from "@lcxxvi/domain";
import {
  loadCorpus,
  auditCorpus,
  auditDeliveryFixture,
  assertScoringObservation,
} from "../support/scoring-fixtures.js";
const corpus = loadCorpus();
describe("hand-authored valid resolution cases", () => {
  for (const f of corpus.deliveries)
    it(`${f.id}: ${f.description}`, () => {
      auditDeliveryFixture(f);
    });
});
describe("invalid input rejects without mutation", () => {
  for (const f of corpus.invalid)
    it(`${f.id}: ${f.description}`, () => {
      const before = JSON.stringify(f);
      try {
        validateDeliveryResolution(f.context, f.resolution);
        throw new Error("Invalid input accepted");
      } catch (error) {
        expect(error).toBeInstanceOf(ResolutionValidationError);
        expect((error as ResolutionValidationError).code).toBe(f.expectedError);
      }
      expect(JSON.stringify(f)).toBe(before);
    });
});
it("locks all Appendix D cases and fixture IDs to a reviewed digest", () => {
  auditCorpus(corpus);
  expect(corpus.scorerImplemented).toBe(false);
});
it("validates the entire corpus against independent emitted JSON Schema", () => {
  const ajv = new Ajv2020.default({ strict: true, allErrors: true });
  addFormats.default(ajv);
  const validate = ajv.compile(
    JSON.parse(
      readFileSync(
        "packages/contracts/schemas/ScoringFixtureCorpusSchema.json",
        "utf8",
      ),
    ),
  );
  expect(validate(corpus), JSON.stringify(validate.errors)).toBe(true);
  const invalid = structuredClone(corpus);
  Object.assign(invalid.deliveries[0]!.resolution, { legalBall: true });
  expect(validate(invalid)).toBe(false);
});
it("never allows derived event fields at the resolution input boundary", () => {
  const f = corpus.deliveries[0]!;
  for (const property of [
    "legalBall",
    "countsAsBallFaced",
    "freeHitNext",
    "creditedBowlerId",
  ])
    expect(
      contracts.DeliveryResolutionSchema.safeParse({
        ...f.resolution,
        [property]: true,
      }).success,
    ).toBe(false);
});
it("runs a real scorer comparison gate against the retained corpus", () => {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/audit-fixtures.ts", "--require-scorer"],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('"scorerComparison": "PASS"');
  expect(r.stdout).toContain('"matchedDeliveryCases": 45');
});
it("future observation harness rejects corrupted score, strike and bowler credit", () => {
  const f = corpus.deliveries.find((f) => f.id === "RO1")!;
  assertScoringObservation(f, f.expected); // Harness control only, not scorer execution.
  for (const change of [
    (v: contracts.DeliveryExpectation) => {
      v.totals.runs += 1;
    },
    (v: contracts.DeliveryExpectation) => {
      v.nextStrikerId = "p2";
    },
    (v: contracts.DeliveryExpectation) => {
      v.delta.bowlerWickets = 1;
    },
  ]) {
    const bad = structuredClone(f.expected);
    change(bad);
    expect(() => assertScoringObservation(f, bad)).toThrow();
  }
});
it("covers both run-out batters and ends at ordinary and sixth-ball boundaries", () => {
  for (const suffix of ["", "-SIXTH"]) {
    const f = corpus.deliveries.filter(
      (f) =>
        f.id.startsWith("RO") &&
        (suffix ? f.id.endsWith(suffix) : !f.id.endsWith("-SIXTH")),
    );
    expect(f).toHaveLength(4);
    expect(
      new Set(
        f.map(
          (v) =>
            `${v.resolution.dismissal!.playerId}:${v.resolution.dismissal!.wicketEnd}`,
        ),
      ).size,
    ).toBe(4);
    for (const v of f) {
      expect(v.resolution.completedRuns).toBe(1);
      expect(v.resolution.attemptedRuns).toBe(2);
      expect(v.expected.delta.bowlerWickets).toBe(0);
      expect(v.expected.event.dismissal!.creditedBowlerId).toBeNull();
    }
  }
});
it("independently pins red-ball expected margins, targets and completion distinctions", () => {
  expect(
    corpus.terminal.find((f) => f.id === "F10")!.expected.result,
  ).toMatchObject({ kind: "WIN", marginType: "INNINGS", marginRuns: 50 });
  expect(
    corpus.terminal.find((f) => f.id === "F11")!.expected.targetToWin,
  ).toBe(251);
  expect(
    corpus.terminal.find((f) => f.id === "F12")!.expected.result!.kind,
  ).toBe("DRAW");
  expect(
    corpus.terminal.find((f) => f.id === "T01")!.expected.result!.kind,
  ).toBe("TIE");
});
it("pins the five independently authored clock expectations", () => {
  expect(
    corpus.clock.map((f) => [
      f.id,
      f.expected.clock.localSeconds,
      f.expected.phase,
      f.expected.nextAction,
    ]),
  ).toEqual([
    ["C01", 64890, "AWAITING_BATTER", "SELECT_BATTER"],
    ["C02", 47550, "AWAITING_INNINGS", "START_NEXT_INNINGS"],
    ["C03", 63000, "READY", "ADVANCE"],
    ["C04", 43320, "READY", "ADVANCE"],
    ["C05", 64800, "COMPLETE", "NONE"],
  ]);
  expect(
    corpus.clock.find((f) => f.id === "C03")!.expected.clock
      .finalHourBallsRequired,
  ).toBe(60);
  expect(
    corpus.clock.find((f) => f.id === "C04")!.expected.ballAgeLegalBalls,
  ).toBe(0);
  expect(
    corpus.clock.find((f) => f.id === "C04")!.expected.inningsLegalBalls,
  ).toBe(480);
});
it("distinguishes reserved persistence/NRR expectations from executed subsystems", () => {
  expect(corpus.deferred.map((f) => f.id)).toEqual([
    "F13",
    "F14",
    "F15",
    "F16",
  ]);
  const nrr = corpus.deferred.filter((f) => f.category === "NRR");
  expect(nrr.map((f) => f.expected.battingDenominatorBalls)).toEqual([120, 57]);
});
it("accounts for all exported schema definitions", () => {
  const names = Object.entries(contracts)
    .filter(
      ([name, value]) => name.endsWith("Schema") && value instanceof z.ZodType,
    )
    .map(([name]) => name);
  expect(names).toHaveLength(190);
  expect(names).toContain("DelegationJournalSchema");
  expect(names).toContain("RedBallTacticalProfileSchema");
  expect(names).toContain("CompletedCareerMatchEventArchiveCoreSchema");
  expect(names).toContain("CompletedCareerMatchEventArchiveSchema");
  expect(names).toContain("SeasonPortableManifestV3Schema");
  expect(names).toContain("SeasonCheckpointGenerationOptionSchema");
  expect(names).toContain("SeasonCheckpointInspectionSchema");
  expect(names).toContain("RosterSeasonStateSchema");
  expect(names).toContain("RosterSeasonMatchCompletionSchema");
  expect(names).toContain("RosterSeasonProjectionSchema");
  expect(names).toContain("RosterOffscreenFixtureOutcomeSchema");
  expect(names).toContain("RosterCareerDayStateSchema");
  expect(names).toContain("RosterSeasonStateSchema");
  expect(names).toContain("RosterSeasonMatchCompletionSchema");
  expect(names).toContain("RosterSeasonProjectionSchema");
  expect(names).toContain("RosterOffscreenFixtureOutcomeSchema");
  expect(names).toContain("RosterCareerDayStateSchema");
  expect(names).toContain("RosterSeasonScheduleRequestSchema");
  expect(names).toContain("RosterSeasonScheduleSchema");
  expect(names).toContain("RosterRed5ExecutionManifestSchema");
  expect(names).toContain("RosterODIExecutionManifestSchema");
  expect(names).toContain("RosterT20ExecutionManifestSchema");
  expect(names).toContain("RosterMatchPreparationSchema");
  expect(names).toContain("RosterImportSourceSchema");
  expect(names).toContain("StagedRosterPackSchema");
  expect(names).toContain("RosterMatchSelectionSchema");
  expect(names).toContain("NewGameWorldCopySchema");
  expect(names).toContain("SeasonPortableManifestV2Schema");
  expect(names.filter((n) => n.startsWith("M7J"))).toHaveLength(0);
});
