import {
  CompletedCareerMatchEventArchiveSchema,
  MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
  T20MatchSetupRequestSchema,
  T20SeasonMatchCompletionSchema,
  type CompletedCareerMatchEventArchive,
  type DeliveryRecorded,
  type T20MatchSetupRequest,
  type T20Scorecard,
} from "@lcxxvi/contracts";
import { FROZEN_WORLD_PINS } from "@lcxxvi/data";
import { canonicalStateBytes, createStateHasher, sha256Hex } from "./determinism.js";
import {
  eventChainManifest,
  projectT20Scorecard,
  replayT20Events,
  type T20Session,
} from "./t20-match.js";
import { validateT20MatchSetup } from "./world-setup.js";

const hasher = createStateHasher();

function assertReplay(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_CAREER_REPLAY_${code}`);
}

export function buildSetupRequestFromT20Session(session: T20Session): T20MatchSetupRequest {
  return T20MatchSetupRequestSchema.parse({
    setupVersion: "LC_T20_SETUP_V1",
    setup: {
      schemaVersion: "1.0.0",
      gameId: session.setup.gameId,
      matchId: session.setup.matchId,
      format: "T20",
      worldPackId: FROZEN_WORLD_PINS.worldPackId,
      rulesId: session.setup.versions.rules,
      modelId: session.setup.versions.model,
      randomId: session.setup.versions.random,
      seed: session.setup.seed,
      teamIds: [session.setup.teams[0].teamId, session.setup.teams[1].teamId],
      groundId: session.setup.ground.groundId,
      capabilities: {
        limitedOversRain: false,
        superOver: false,
        injuries: false,
        prediction: false,
      },
    },
    worldFileSha256: FROZEN_WORLD_PINS.worldFileSha256,
    worldCanonicalSha256: session.setup.versions.worldHash,
    rulesHash: session.setup.versions.rulesHash,
    modelHash: session.setup.versions.modelHash,
    stagePackHash: session.setup.stagePackHash,
    selectedTeams: [
      {
        teamId: session.setup.teams[0].teamId,
        playerIds: [...session.setup.teams[0].playerIds],
        captainId: session.setup.teams[0].captainId,
        keeperId: session.setup.teams[0].keeperId,
      },
      {
        teamId: session.setup.teams[1].teamId,
        playerIds: [...session.setup.teams[1].playerIds],
        captainId: session.setup.teams[1].captainId,
        keeperId: session.setup.teams[1].keeperId,
      },
    ],
  });
}

export type CareerArchivedReplaySummary = {
  session: T20Session;
  scorecard: T20Scorecard;
  scorecardSha256: string;
  eventCount: number;
  finalEventHash: string;
  finalStateHash: string;
  deliveries: readonly {
    sequence: number;
    inningsIndex: number;
    over: number;
    ballInOver: number;
    bowlerId: string;
    strikerId: string;
    totalRuns: number;
    wicketKind: string | null;
  }[];
};

/**
 * Replays a completed career match exclusively from its sealed T20MatchEvent chain
 * without sampling random numbers or re-executing delivery generation.
 */
export function replayCareerMatchEventArchive(
  archiveRaw: unknown,
  worldBytes: Readonly<Uint8Array>,
  worldManifest: unknown,
  completionRaw?: unknown,
): CareerArchivedReplaySummary {
  const archive = CompletedCareerMatchEventArchiveSchema.parse(archiveRaw);
  const { archiveSha256, ...core } = archive;
  const coreBytes = canonicalStateBytes(core);
  assertReplay(sha256Hex(coreBytes) === archiveSha256, "ARCHIVE_HASH_MISMATCH");
  assertReplay(
    coreBytes.byteLength === archive.byteLength && coreBytes.byteLength <= MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
    "ARCHIVE_BYTE_LENGTH_MISMATCH",
  );
  assertReplay(archive.events.length === archive.eventCount, "EVENT_COUNT_MISMATCH");
  assertReplay(hasher.hash(archive.events) === archive.eventsSha256, "EVENTS_HASH_MISMATCH");
  assertReplay(archive.events.at(-1)?.eventHash === archive.finalEventHash, "FINAL_EVENT_HASH_MISMATCH");
  assertReplay(archive.eventChain.finalEventHash === archive.finalEventHash, "MANIFEST_FINAL_HASH_MISMATCH");
  assertReplay(archive.eventChain.eventCount === archive.eventCount, "MANIFEST_EVENT_COUNT_MISMATCH");

  const setup = validateT20MatchSetup(archive.setupRequest, worldBytes, worldManifest);
  const replayed = replayT20Events(setup, archive.events, archive.eventChain);
  assertReplay(replayed.core.phase === "COMPLETE", "REPLAY_NOT_COMPLETE");
  const manifest = eventChainManifest(replayed);
  const scorecard = projectT20Scorecard(replayed);
  const scorecardSha256 = hasher.hash(scorecard);
  assertReplay(scorecardSha256 === archive.scorecardSha256, "SCORECARD_HASH_MISMATCH");

  if (completionRaw !== undefined) {
    const completion = T20SeasonMatchCompletionSchema.parse(completionRaw);
    assertReplay(
      completion.seasonId === archive.seasonId &&
        completion.scheduleSha256 === archive.scheduleSha256 &&
        completion.fixtureId === archive.fixtureId &&
        completion.matchId === archive.matchId &&
        completion.fixtureOrdinal === archive.fixtureOrdinal &&
        completion.roundNumber === archive.roundNumber &&
        completion.matchDayDate === archive.matchDayDate &&
        completion.source === archive.source &&
        completion.sourceCompletionSha256 === archive.sourceCompletionSha256 &&
        completion.scorecardSha256 === archive.scorecardSha256,
      "COMPLETION_BINDING_MISMATCH",
    );
  }

  const deliveries: Array<{
    sequence: number;
    inningsIndex: number;
    over: number;
    ballInOver: number;
    bowlerId: string;
    strikerId: string;
    totalRuns: number;
    wicketKind: string | null;
  }> = [];
  let legalBallsInInnings = 0;
  let activeInnings = 0;
  for (const ev of archive.events) {
    const payload = ev.payload as { type?: string; inningsIndex?: number; event?: DeliveryRecorded };
    if (ev.type === "INNINGS_STARTED" && typeof payload.inningsIndex === "number") {
      activeInnings = payload.inningsIndex;
      legalBallsInInnings = 0;
    } else if (ev.type === "DELIVERY_RECORDED" && payload.event) {
      const d = payload.event;
      const over = Math.floor(legalBallsInInnings / 6);
      const ballInOver = (legalBallsInInnings % 6) + 1;
      if (d.legalBall) legalBallsInInnings += 1;
      const extrasTotal =
        d.extras.wides + d.extras.noBalls + d.extras.byes + d.extras.legByes + d.extras.penalties;
      deliveries.push({
        sequence: ev.sequence,
        inningsIndex: activeInnings,
        over,
        ballInOver,
        bowlerId: d.bowlerId,
        strikerId: d.strikerId,
        totalRuns: d.batRuns + extrasTotal,
        wicketKind: d.dismissal ? d.dismissal.kind : null,
      });
    }
  }

  return {
    session: replayed,
    scorecard,
    scorecardSha256,
    eventCount: archive.eventCount,
    finalEventHash: manifest.finalEventHash,
    finalStateHash: manifest.finalStateHash,
    deliveries,
  };
}

export function createCompletedCareerMatchEventArchive(input: {
  completion: unknown;
  session: T20Session;
}): CompletedCareerMatchEventArchive {
  const completion = T20SeasonMatchCompletionSchema.parse(input.completion);
  const { session } = input;
  assertReplay(session.core.phase === "COMPLETE", "SESSION_NOT_COMPLETE");
  const scorecard = projectT20Scorecard(session);
  const scorecardSha256 = hasher.hash(scorecard);
  assertReplay(scorecardSha256 === completion.scorecardSha256, "SESSION_SCORECARD_MISMATCH");
  assertReplay(session.setup.matchId === completion.matchId, "SESSION_MATCH_ID_MISMATCH");
  const setupRequest = buildSetupRequestFromT20Session(session);
  const eventChain = eventChainManifest(session);
  const eventsSha256 = hasher.hash(session.events);
  const rawZero = {
    archiveVersion: "LC_COMPLETED_CAREER_MATCH_EVENT_ARCHIVE_V1" as const,
    seasonId: completion.seasonId,
    scheduleSha256: completion.scheduleSha256,
    fixtureId: completion.fixtureId,
    matchId: completion.matchId,
    fixtureOrdinal: completion.fixtureOrdinal,
    roundNumber: completion.roundNumber,
    matchDayDate: completion.matchDayDate,
    source: completion.source,
    sourceCompletionSha256: completion.sourceCompletionSha256,
    scorecardSha256: completion.scorecardSha256,
    setupRequest,
    eventChain,
    eventCount: session.events.length,
    finalEventHash: eventChain.finalEventHash,
    eventsSha256,
    events: session.events,
    byteLength: 0,
  };
  const baseLen = canonicalStateBytes(rawZero).byteLength;
  let byteLength = baseLen - 1 + String(baseLen).length;
  byteLength = baseLen - 1 + String(byteLength).length;
  const core = { ...rawZero, byteLength };
  const coreBytes = canonicalStateBytes(core);
  assertReplay(
    coreBytes.byteLength === byteLength && byteLength <= MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
    "ARCHIVE_SIZE_EXCEEDED",
  );
  return CompletedCareerMatchEventArchiveSchema.parse({
    ...core,
    archiveSha256: sha256Hex(coreBytes),
  });
}
