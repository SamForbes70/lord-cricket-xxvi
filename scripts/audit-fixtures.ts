import assert from "node:assert/strict";
import {
  auditCorpus,
  loadCorpus,
  assertScoringObservation,
} from "../tests/support/scoring-fixtures.js";
import { ledgerForContext } from "../tests/support/ledger-fixtures.js";
import {
  scoringFixtureAdapter,
  applyDeliveryResolution,
  scoreDelivery,
  ResolutionValidationError,
} from "@lcxxvi/domain";
try {
  const corpus = loadCorpus();
  auditCorpus(corpus);
  const runScorer = process.argv.includes("--require-scorer");
  if (runScorer) {
    for (const f of corpus.deliveries) {
      assertScoringObservation(
        f,
        scoringFixtureAdapter.evaluate(f.context, f.resolution),
      );
      assertScoringObservation(
        f,
        applyDeliveryResolution(ledgerForContext(f.context), f.resolution)
          .observation,
      );
    }
    for (const f of corpus.invalid)
      assert.throws(
        () => scoreDelivery(f.context, f.resolution),
        (error) =>
          error instanceof ResolutionValidationError &&
          error.code === f.expectedError,
      );
  }
  console.log(
    JSON.stringify(
      {
        fixtureVersion: corpus.fixtureVersion,
        fixtureAuthoredWithoutScorer: !corpus.scorerImplemented,
        fixtureAudit: "PASS",
        counts: {
          deliveries: corpus.deliveries.length,
          rejections: corpus.invalid.length,
          terminal: corpus.terminal.length,
          clock: corpus.clock.length,
          deferred: corpus.deferred.length,
        },
        scorerComparison: runScorer ? "PASS" : "NOT_REQUESTED",
        matchedDeliveryCases: runScorer ? corpus.deliveries.length : 0,
        matchedLedgerCases: runScorer ? corpus.deliveries.length : 0,
        rejectedByScorer: runScorer ? corpus.invalid.length : 0,
        terminalClockPersistenceNrrComparison: "NOT_IMPLEMENTED",
        scoringEngine: "LC_SCORING_V1",
        milestone: "M0_PARTIAL",
        nextPass: "Pass 07: bounded seeded T20 orchestration",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
