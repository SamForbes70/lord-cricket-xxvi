/** Replays declared historical expectations without inventing missing incident facts. */
import { z } from "zod";
import { canonicalJson } from "@lcxxvi/contracts";
import { SeedSchema, CommandSchema, createLedger, execute, replay, exportArchive, recover, nextAction, hash, type ResearchLedger } from "./m7k-ledger.js";

const text = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const end = z.enum(["NORTH", "SOUTH"]);
const extras = z.strictObject({ wides: counter, noBalls: counter, byes: counter, legByes: counter, penalties: counter });
const batter = z.strictObject({ runs: counter, balls: counter, fours: counter, sixes: counter,
  status: z.enum(["AVAILABLE", "ACTIVE", "OUT", "RETIRED_OUT", "RETIRED_NOT_OUT"]), returnPermitted: z.boolean() });
const bowler = z.strictObject({ runs: counter, wickets: counter, legalBalls: counter });
export const SnapshotSchema = z.strictObject({
  runs: counter, wickets: counter, legalBalls: counter, deliveryIndex: counter,
  ends: z.strictObject({ north: text.nullable(), south: text.nullable() }), strikerEnd: end,
  strikerId: text, nonStrikerId: text, bowlerId: text, freeHitPending: z.boolean(), targetToWin: counter.nullable(),
  closed: z.boolean(), awaitingBowler: z.boolean(), batting: z.record(text, batter), bowling: z.record(text, bowler), extras,
  dismissals: z.record(text, z.strictObject({ kind: text, bowlerId: text.nullable() })),
  awards: z.record(text, z.strictObject({ amount: z.literal(5), beneficiaryTeamId: text, destinationInningsId: text.nullable() })),
  nextAction: z.enum(["CLOSED", "SELECT_BATTER", "SELECT_BOWLER", "ADVANCE"]),
});
export const HistoricalFixtureSchema = z.strictObject({
  version: z.literal("LC_M7K_HISTORICAL_FIXTURE_V1"), caseId: text, matchId: text,
  sourceEventSha256: digest, matchFileSha256: digest,
  review: z.strictObject({ reviewer: text, reviewedAt: z.iso.datetime(), sourceReferences: z.array(text).min(1),
    playingConditionsReference: text, chronology: z.array(text).min(1),
    chronologyConfirmed: z.literal(true), conditionsConfirmed: z.literal(true), creditsConfirmed: z.literal(true),
    physicalEndsConfirmed: z.literal(true), nextActionConfirmed: z.literal(true) }),
  seed: SeedSchema, commands: z.array(CommandSchema).min(1).max(2000), expectedPrefixes: z.array(SnapshotSchema).min(1).max(2000),
});
const SourceSchema = z.object({ matchId: text, sourceEventSha256: digest, matchFileSha256: digest, sourceEventHashVerified: z.literal(true) });

/** Projects explicit credits and decisions for comparison with independently authored expectations. */
export function fixtureSnapshot(state: ResearchLedger): z.infer<typeof SnapshotSchema> {
  const p = state.projection, c = p.context;
  return SnapshotSchema.parse({ runs: c.runs, wickets: c.wickets, legalBalls: c.legalBalls, deliveryIndex: c.deliveryIndex,
    ends: c.endsBefore, strikerEnd: c.strikerEnd, strikerId: c.strikerId, nonStrikerId: c.nonStrikerId, bowlerId: c.bowlerId,
    freeHitPending: c.freeHitPending, targetToWin: c.targetToWin, closed: p.closed, awaitingBowler: p.awaitingBowler,
    batting: p.batting, bowling: p.bowling, extras: p.extras, dismissals: p.dismissals, awards: p.awards, nextAction: nextAction(state) });
}

/** Rejects incomplete reviews, unknown source identities and mismatched expectations before reporting a fixture pass. */
export function verifyHistoricalFixture(input: unknown, sourceIndex: unknown) {
  const fixture = HistoricalFixtureSchema.parse(input);
  const sources = z.array(SourceSchema).parse(sourceIndex);
  const matches = sources.filter(row => row.sourceEventSha256 === fixture.sourceEventSha256);
  if (matches.length !== 1 || matches[0]!.matchId !== fixture.matchId || matches[0]!.matchFileSha256 !== fixture.matchFileSha256) throw new Error("M7K_FIXTURE_SOURCE_IDENTITY");
  if (fixture.commands.length !== fixture.expectedPrefixes.length) throw new Error("M7K_FIXTURE_PREFIX_COVERAGE");
  let state = createLedger(fixture.seed);
  for (const [index, command] of fixture.commands.entries()) {
    const before = canonicalJson(state), archive = exportArchive(state);
    const accepted = execute(state, command);
    if (canonicalJson(state) !== before) throw new Error("M7K_FIXTURE_CALLER_MUTATION");
    if (canonicalJson(fixtureSnapshot(accepted)) !== canonicalJson(fixture.expectedPrefixes[index])) throw new Error(`M7K_FIXTURE_EXPECTATION_${index}`);
    for (const rebuilt of [replay(accepted.seed, accepted.events), recover(archive, accepted.events), recover(exportArchive(accepted), accepted.events)]) {
      if (canonicalJson(rebuilt) !== canonicalJson(accepted)) throw new Error(`M7K_FIXTURE_RECOVERY_${index}`);
    }
    state = accepted;
  }
  return { version: "LC_M7K_HISTORICAL_FIXTURE_RESULT_V1", caseId: fixture.caseId, matchId: fixture.matchId,
    sourceEventSha256: fixture.sourceEventSha256, matchFileSha256: fixture.matchFileSha256,
    fixtureSha256: hash(fixture), review: fixture.review, prefixesVerified: state.events.length,
    finalProjectionSha256: hash(state.projection), status: "EXECUTABLE_EXPECTATIONS_PASS",
    historicalEvidenceStatus: "REVIEW_DECLARATIONS_RECORDED_NOT_INDEPENDENTLY_AUTHENTICATED", gameplayIntegrationPermitted: false };
}
