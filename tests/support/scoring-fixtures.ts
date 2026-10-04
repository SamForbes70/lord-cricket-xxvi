import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ScoringFixtureCorpusSchema,
  DeliveryExpectationSchema,
  canonicalJson,
  type DeliveryFixture,
  type ScoringFixtureCorpus,
} from "@lcxxvi/contracts";
import {
  validateDeliveryResolution,
  ResolutionValidationError,
} from "@lcxxvi/domain";
export const corpusPath = "tests/fixtures/scoring/corpus.json";
export function loadCorpus(path = corpusPath): ScoringFixtureCorpus {
  return ScoringFixtureCorpusSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
}
/** Audit arithmetic and declared expectations; never computes production scorer output. */
export function auditDeliveryFixture(f: DeliveryFixture): void {
  const snapshot = canonicalJson({
    context: f.context,
    resolution: f.resolution,
  });
  validateDeliveryResolution(f.context, f.resolution);
  assert.equal(
    canonicalJson({ context: f.context, resolution: f.resolution }),
    snapshot,
    `${f.id}: validation mutated input`,
  );
  const c = f.context,
    r = f.resolution,
    e = f.expected,
    event = e.event,
    d = e.delta;
  for (const field of [
    "inningsIndex",
    "deliveryIndex",
    "strikerId",
    "nonStrikerId",
    "bowlerId",
  ] as const)
    assert.deepEqual(event[field], c[field], `${f.id}: event ${field}`);
  for (const field of [
    "legality",
    "batRuns",
    "extras",
    "completedRuns",
    "boundary",
    "endsAfter",
    "shotSector",
    "trajectory",
    "executedLength",
    "fieldOutcome",
    "elapsedSeconds",
  ] as const)
    assert.deepEqual(event[field], r[field], `${f.id}: event ${field}`);
  assert.equal(
    event.legalBall,
    r.legality === "LEGAL",
    `${f.id}: legal ball flag`,
  );
  assert.equal(
    event.countsAsBallFaced,
    r.legality === "LEGAL" || r.legality === "NO_BALL",
    `${f.id}: faced flag`,
  );
  assert.equal(
    d.teamRuns,
    event.batRuns + Object.values(event.extras).reduce((a, b) => a + b, 0),
    `${f.id}: team reconciliation`,
  );
  assert.equal(d.batterRuns, event.batRuns, `${f.id}: bat attribution`);
  assert.equal(
    d.bowlerRuns,
    event.batRuns + event.extras.wides + event.extras.noBalls,
    `${f.id}: bowler attribution`,
  );
  assert.equal(
    d.legalBalls,
    Number(event.legalBall),
    `${f.id}: legal ball delta`,
  );
  assert.equal(
    d.ballsFaced,
    Number(event.countsAsBallFaced),
    `${f.id}: faced delta`,
  );
  assert.equal(
    d.wickets,
    Number(r.dismissal !== null),
    `${f.id}: wicket delta`,
  );
  assert.equal(
    d.bowlerWickets,
    Number(r.dismissal !== null && r.dismissal.kind !== "RUN_OUT"),
    `${f.id}: bowler wickets`,
  );
  assert.equal(e.totals.runs, c.runs + d.teamRuns, `${f.id}: total runs`);
  assert.equal(
    e.totals.wickets,
    c.wickets + d.wickets,
    `${f.id}: total wickets`,
  );
  assert.equal(
    e.totals.legalBalls,
    c.legalBalls + d.legalBalls,
    `${f.id}: total legal balls`,
  );
  assert.equal(
    e.totals.ballAgeLegalBalls,
    c.ballAgeLegalBalls + d.legalBalls,
    `${f.id}: ball age`,
  );
  if (r.dismissal) {
    assert.deepEqual(
      event.dismissal,
      {
        ...r.dismissal,
        creditedBowlerId: r.dismissal.kind === "RUN_OUT" ? null : c.bowlerId,
      },
      `${f.id}: dismissal credit`,
    );
  } else assert.equal(event.dismissal, null);
  assert.equal(
    e.overCompleted,
    event.legalBall && e.totals.legalBalls % 6 === 0,
    `${f.id}: over boundary`,
  );
  assert.equal(
    e.strikerEndAfter,
    e.overCompleted
      ? c.strikerEnd === "NORTH"
        ? "SOUTH"
        : "NORTH"
      : c.strikerEnd,
    `${f.id}: facing end`,
  );
  const nextFreeHit =
    c.rulesId !== "LC_RED5_01" &&
    (r.legality === "NO_BALL" || (c.freeHitPending && r.legality !== "LEGAL"));
  assert.equal(e.freeHitPending, nextFreeHit, `${f.id}: free-hit state`);
  assert.equal(event.freeHitNext, nextFreeHit);
  if (e.inningsComplete) {
    assert.equal(e.nextStrikerId, null);
    assert.equal(e.requiredBatterEnd, null);
    assert.ok(
      !["SELECT_BATTER", "SELECT_BOWLER", "ADVANCE"].includes(e.nextAction),
    );
  } else {
    assert.equal(
      e.nextStrikerId,
      event.endsAfter[e.strikerEndAfter === "NORTH" ? "north" : "south"],
    );
    assert.equal(
      e.requiredBatterEnd,
      r.dismissal ? (event.endsAfter.north === null ? "NORTH" : "SOUTH") : null,
    );
  }
  const events = ["DELIVERY_RECORDED"];
  if (e.overCompleted) events.push("OVER_COMPLETED");
  if (e.inningsComplete) events.push("INNINGS_COMPLETED");
  if (e.result) events.push("MATCH_COMPLETED");
  assert.deepEqual(e.events, events, `${f.id}: transition order`);
  if (e.result) assert.equal(e.inningsComplete, true);
  if (c.targetToWin !== null && e.totals.runs >= c.targetToWin)
    assert.equal(e.result?.kind, "WIN", `${f.id}: target precedence`);
}
export function auditCorpus(corpus: ScoringFixtureCorpus): void {
  const ids = [
    ...corpus.deliveries,
    ...corpus.invalid,
    ...corpus.terminal,
    ...corpus.clock,
    ...corpus.deferred,
  ].map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "Duplicate fixture ID");
  for (let i = 1; i <= 16; i++)
    assert.ok(
      ids.includes(`F${String(i).padStart(2, "0")}`),
      `Missing Appendix D F${i}`,
    );
  for (const f of corpus.deliveries) auditDeliveryFixture(f);
  for (const f of corpus.invalid) {
    const before = canonicalJson(f);
    assert.throws(
      () => validateDeliveryResolution(f.context, f.resolution),
      (err) =>
        err instanceof ResolutionValidationError &&
        err.code === f.expectedError,
      `${f.id}: expected ${f.expectedError}`,
    );
    assert.equal(canonicalJson(f), before, `${f.id}: rejection mutated input`);
  }
  for (const f of corpus.clock)
    assert.ok(
      f.expected.nextAction.length > 0 && f.expected.clock.localSeconds >= 0,
    );
  const index = JSON.parse(
    readFileSync("tests/fixtures/scoring/index.json", "utf8"),
  ) as { sha256: string; ids: string[] };
  assert.equal(
    index.sha256,
    createHash("sha256").update(readFileSync(corpusPath)).digest("hex"),
    "Corpus digest changed without reviewed index update",
  );
  assert.deepEqual(
    ids,
    index.ids,
    "Fixture inventory differs from reviewed index",
  );
}
/** Observed scorer output must match the full golden expectation. The corpus remains the untouched Pass 02 baseline. */
export function assertScoringObservation(
  fixture: DeliveryFixture,
  observed: unknown,
): void {
  const actual = DeliveryExpectationSchema.parse(observed);
  assert.equal(
    canonicalJson(actual),
    canonicalJson(fixture.expected),
    `${fixture.id}: scorer differs from independently authored expectation`,
  );
}
