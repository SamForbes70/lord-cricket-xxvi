import {
  canonicalJson,
  CompletedCareerMatchEventArchiveSchema,
  MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
  MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES,
  SeasonCheckpointGenerationOptionSchema,
  SeasonCheckpointInspectionSchema,
  SeasonDurableCommandSchema,
  SeasonSaveSummarySchema,
  T20EventChainManifestSchema,
  T20MatchEventSchema,
  T20MatchSetupRequestSchema,
  T20SeasonMatchCompletionSchema,
  T20SeasonStateCoreSchema,
  T20SeasonStateSchema,
  SeasonArchiveCoreSchema,
  SeasonArchiveSchema,
  NewGameWorldCopySchema,
  RosterSeasonStateSchema, StagedRosterPackSchema,
  type CompletedCareerMatchEventArchive,
  type RosterSeasonState, type StagedRosterPack,
  type SeasonCheckpointGenerationOption,
  type SeasonCheckpointInspection,
  type SeasonDurableCommand,
  type SeasonSaveSummary,
  type T20SeasonState,
  type T20SeasonStateCore,
  type SeasonArchive,
  type NewGameWorldCopy,
} from "@lcxxvi/contracts";

export const CAREER_MATCH_EVENTS_SCOPE = "CAREER_MATCH_EVENTS_V1" as const;

export const SEASON_SAVE_SCHEMA_VERSION = "LC_SEASON_SAVE_V1" as const;
export const SEASON_PRESENTATION_SAVE_SCHEMA_VERSION = "LC_SEASON_SAVE_V2_PRESENTATION" as const;
export const SEASON_RECORD_TYPE = "SEASON" as const;
export const ROSTER_SEASON_SAVE_VERSION = "LC_SEASON_SAVE_V3_ROSTER" as const;
export const ROSTER_SEASON_RECORD_TYPE = "ROSTER_SEASON" as const;
export const SEASON_WRITER_LEASE_MS = 12_000;
const DB_NAME = "lord-cricket-xxvi";
const DB_VERSION = 1;

type SeasonGameRecord = SeasonSaveSummary & {
  recordType: typeof SEASON_RECORD_TYPE;
  schemaVersion: typeof SEASON_SAVE_SCHEMA_VERSION | typeof SEASON_PRESENTATION_SAVE_SCHEMA_VERSION;
  worldCopySha256?: string;
  checkpointSerial: number;
  checkpointGeneration: number;
};
export type SeasonCheckpoint = {
  saveId: string;
  generation: number;
  checkpointSerial: number;
  revision: number;
  payload: string;
  sha256: string;
  createdAt: string;
};
type CommandRecord = SeasonDurableCommand & { saveId: string };
type LeaseRecord = { key: string; saveId: string; ownerId: string; expiresAt: number };
type SettingRecord = { key: string; value: unknown };
type ProjectionRecord = { saveId: string; scope: string; key: string; payload: string; sha256: string };

export type SeasonDurableCommit = {
  saveId: string;
  kind: "AUTO" | "MANUAL" | "IMPORTED";
  title: string;
  expectedRevision: number | null;
  state: T20SeasonState;
  command: SeasonDurableCommand | null;
  ownerId: string;
  now: number;
  updatedAt: string;
  setActive?: boolean;
  worldCopy?: NewGameWorldCopy | null;
  matchEventArchives?: readonly CompletedCareerMatchEventArchive[];
  testAbortAfterWrites?: boolean;
  copySource?: { saveId: string; revision: number; stateSha256: string; now: () => number };
};

export type SeasonLoadResult = {
  summary: SeasonSaveSummary;
  state: T20SeasonState;
  recovered: boolean;
  recoveredFromGeneration: number | null;
  corruptedGenerations: readonly number[];
  worldCopy?: NewGameWorldCopy | null;
};

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}
function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function seasonSha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesHex(new Uint8Array(digest));
}
export async function validateStoredWorldCopy(raw: unknown): Promise<NewGameWorldCopy> {
  const copy = NewGameWorldCopySchema.parse(raw);
  if (await seasonSha256Text(canonicalJson(copy.world)) !== copy.worldCanonicalSha256) throw new Error("WORLD_COPY_HASH_MISMATCH");
  return copy;
}
function leaseKey(saveId: string) { return `lease:${saveId}`; }
function activeKey() { return "activeSeasonSaveId"; }

function assertSeason(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_T20_SEASON_STATE_${code}`);
}

function stateCore(state: T20SeasonState): T20SeasonStateCore {
  const { stateSha256, ...core } = state;
  void stateSha256;
  return T20SeasonStateCoreSchema.parse(core);
}

export async function sealT20SeasonState(raw: T20SeasonStateCore): Promise<T20SeasonState> {
  const core = T20SeasonStateCoreSchema.parse(raw);
  const state = T20SeasonStateSchema.parse({ ...core, stateSha256: await seasonSha256Text(canonicalJson(core)) });
  return validateT20SeasonState(state);
}

export async function validateT20SeasonState(raw: unknown): Promise<T20SeasonState> {
  const state = T20SeasonStateSchema.parse(raw);
  const expectedHash = await seasonSha256Text(canonicalJson(stateCore(state)));
  assertSeason(state.stateSha256 === expectedHash, "HASH_MISMATCH");
  const { scheduleSha256, ...scheduleCore } = state.schedule;
  assertSeason(scheduleSha256 === await seasonSha256Text(canonicalJson(scheduleCore)), "SCHEDULE_HASH_MISMATCH");
  const { stateSha256: careerSha256, ...careerCore } = state.careerState;
  assertSeason(careerSha256 === await seasonSha256Text(canonicalJson(careerCore)), "CAREER_HASH_MISMATCH");
  assertSeason(state.seasonId === state.schedule.seasonId, "SCHEDULE_SEASON_MISMATCH");
  assertSeason(state.gameId === state.schedule.gameId, "SCHEDULE_GAME_MISMATCH");
  assertSeason(state.careerId === state.careerState.careerId, "CAREER_ID_MISMATCH");
  assertSeason(state.seasonId === state.careerState.seasonId, "CAREER_SEASON_MISMATCH");
  assertSeason(state.gameId === state.careerState.gameId, "CAREER_GAME_MISMATCH");
  assertSeason(state.schedule.scheduleSha256 === state.careerState.scheduleSha256, "CAREER_SCHEDULE_MISMATCH");
  assertSeason(state.projection.seasonId === state.seasonId, "PROJECTION_SEASON_MISMATCH");
  assertSeason(state.projection.scheduleSha256 === state.schedule.scheduleSha256, "PROJECTION_SCHEDULE_MISMATCH");
  assertSeason(state.completedMatches.length === state.projection.appliedMatches.length, "COMPLETION_PROJECTION_COUNT_MISMATCH");
  assertSeason(state.completedMatches.length === state.careerState.appliedMatchConditions.length, "COMPLETION_CONDITION_COUNT_MISMATCH");
  const completed = [...state.completedMatches].sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
  assertSeason(completed.every((value, index) => value === state.completedMatches[index]), "COMPLETIONS_NOT_SORTED");
  const fixtureIds = new Set<string>(), matchIds = new Set<string>(), sourceHashes = new Set<string>();
  for (const completion of state.completedMatches) {
    assertSeason(completion.seasonId === state.seasonId && completion.scheduleSha256 === state.schedule.scheduleSha256, `COMPLETION_BINDING:${completion.fixtureId}`);
    assertSeason(!fixtureIds.has(completion.fixtureId), `DUPLICATE_FIXTURE:${completion.fixtureId}`);
    assertSeason(!matchIds.has(completion.matchId), `DUPLICATE_MATCH:${completion.matchId}`);
    assertSeason(!sourceHashes.has(completion.sourceCompletionSha256), `DUPLICATE_SOURCE:${completion.fixtureId}`);
    fixtureIds.add(completion.fixtureId); matchIds.add(completion.matchId); sourceHashes.add(completion.sourceCompletionSha256);
    const applied = state.projection.appliedMatches.find((entry) => entry.fixtureId === completion.fixtureId);
    assertSeason(Boolean(applied) && applied!.matchId === completion.matchId && applied!.sourceCompletionSha256 === completion.sourceCompletionSha256, `PROJECTION_COMPLETION_MISMATCH:${completion.fixtureId}`);
    assertSeason(state.careerState.appliedMatchConditions.some((entry) => entry.matchId === completion.matchId), `CONDITION_COMPLETION_MISMATCH:${completion.fixtureId}`);
  }
  const complete = state.completedMatches.length === 56 && state.projection.revision === 56 && state.projection.cursor.missingFixtureOrdinals.length === 0;
  assertSeason(state.phase === (complete ? "COMPLETE" : "ACTIVE"), "PHASE_MISMATCH");
  return state;
}

export async function validateT20SeasonArchive(raw: unknown): Promise<SeasonArchive> {
  const archive = SeasonArchiveSchema.parse(raw);
  const { archiveSha256, ...coreRaw } = archive;
  const core = SeasonArchiveCoreSchema.parse(coreRaw);
  const expected = await seasonSha256Text(canonicalJson(core));
  assertSeason(archiveSha256 === expected, "ARCHIVE_HASH_MISMATCH");
  assertSeason(core.finalTable.some((row) => row.rank === 1 && row.teamId === core.championTeamId), "ARCHIVE_CHAMPION_MISMATCH");
  assertSeason(new Set(core.completionKeys).size === 56, "ARCHIVE_COMPLETION_KEYS_NOT_UNIQUE");
  return archive;
}

export async function createT20SeasonArchive(stateRaw: unknown, completedAt: string): Promise<SeasonArchive> {
  const state = await validateT20SeasonState(stateRaw);
  assertSeason(state.phase === "COMPLETE", "ARCHIVE_REQUIRES_COMPLETE_SEASON");
  assertSeason(!Number.isNaN(Date.parse(completedAt)), "ARCHIVE_COMPLETED_AT_INVALID");
  const champion = state.projection.table.find((row) => row.rank === 1);
  assertSeason(Boolean(champion), "ARCHIVE_CHAMPION_MISSING");
  const completionKeys = [...state.careerState.appliedMatchConditions]
    .sort((a, b) => a.matchId.localeCompare(b.matchId))
    .map((entry) => entry.matchCompletionKey);
  const core = SeasonArchiveCoreSchema.parse({
    archiveVersion: "LC_T20_SEASON_ARCHIVE_V1",
    seasonId: state.seasonId,
    careerId: state.careerId,
    scheduleSha256: state.schedule.scheduleSha256,
    stateSha256: state.stateSha256,
    projectionRevision: 56,
    fixtureCount: 56,
    completedAt,
    championTeamId: champion!.teamId,
    finalTable: state.projection.table,
    leaders: state.projection.leaders,
    completionKeys,
  });
  return SeasonArchiveSchema.parse({ ...core, archiveSha256: await seasonSha256Text(canonicalJson(core)) });
}

function summaryFor(input: SeasonDurableCommit): SeasonSaveSummary {
  return SeasonSaveSummarySchema.parse({
    saveId: input.saveId,
    kind: input.kind,
    title: input.title,
    seasonId: input.state.seasonId,
    careerId: input.state.careerId,
    controlledTeamId: input.state.controlledTeamId,
    currentDate: input.state.careerState.currentDate,
    revision: input.state.revision,
    completedFixtures: input.state.completedMatches.length,
    phase: input.state.phase,
    stateSha256: input.state.stateSha256,
    updatedAt: input.updatedAt,
  });
}

export async function createSeasonCheckpoint(input: {
  saveId: string; generation: number; checkpointSerial: number; state: T20SeasonState; createdAt: string;
}): Promise<SeasonCheckpoint> {
  const state = await validateT20SeasonState(input.state);
  const payload = canonicalJson(state);
  return {
    saveId: input.saveId, generation: input.generation, checkpointSerial: input.checkpointSerial,
    revision: state.revision, payload, sha256: await seasonSha256Text(payload), createdAt: input.createdAt,
  };
}

export async function recoverSeasonCheckpoint(rows: readonly SeasonCheckpoint[], currentSerial: number): Promise<{
  state: T20SeasonState; checkpoint: SeasonCheckpoint; recovered: boolean; corruptedGenerations: number[];
}> {
  const corruptedGenerations: number[] = [];
  for (const row of [...rows].sort((a, b) => b.checkpointSerial - a.checkpointSerial)) {
    if (await seasonSha256Text(row.payload) !== row.sha256) { corruptedGenerations.push(row.generation); continue; }
    try {
      const state = await validateT20SeasonState(JSON.parse(row.payload));
      return { state, checkpoint: row, recovered: row.checkpointSerial !== currentSerial, corruptedGenerations };
    } catch { corruptedGenerations.push(row.generation); }
  }
  throw new Error("SEASON_SAVE_CORRUPT_NO_VALID_CHECKPOINT");
}

export async function sealCompletedCareerMatchEventArchive(input: {
  completion: unknown;
  setupRequest?: unknown;
  eventChain?: unknown;
  events: unknown;
}): Promise<CompletedCareerMatchEventArchive> {
  const completion = T20SeasonMatchCompletionSchema.parse(input.completion);
  const events = (Array.isArray(input.events) ? input.events : []).map((ev) => T20MatchEventSchema.parse(ev));
  assertSeason(events.length > 0 && events.length <= 600, "MATCH_EVENT_ARCHIVE_COUNT");
  for (let index = 0; index < events.length; index += 1) {
    const ev = events[index]!;
    assertSeason(ev.sequence === index + 1, `MATCH_EVENT_ARCHIVE_SEQUENCE:${index}`);
    if (index > 0) assertSeason(ev.previousHash === events[index - 1]!.eventHash, `MATCH_EVENT_ARCHIVE_CHAIN:${index}`);
  }
  const expectedEventHashes = await Promise.all(
    events.map((ev) =>
      seasonSha256Text(
        canonicalJson([ev.version, ev.sequence, ev.commandId, ev.type, ev.payload, ev.previousHash, ev.stateHash]),
      ),
    ),
  );
  for (let index = 0; index < events.length; index += 1) {
    assertSeason(events[index]!.eventHash === expectedEventHashes[index], `MATCH_EVENT_ARCHIVE_EVENT_HASH:${index}`);
  }
  const setupRequest = T20MatchSetupRequestSchema.parse(input.setupRequest);
  const eventChain = T20EventChainManifestSchema.parse(input.eventChain);
  const finalEventHash = events.at(-1)!.eventHash;
  assertSeason(
    eventChain.eventCount === events.length && eventChain.finalEventHash === finalEventHash,
    "MATCH_EVENT_ARCHIVE_CHAIN_MANIFEST",
  );
  const eventsSha256 = await seasonSha256Text(canonicalJson(events));
  const encoder = new TextEncoder();
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
    eventCount: events.length,
    finalEventHash,
    eventsSha256,
    events,
    byteLength: 0,
  };
  const baseLen = encoder.encode(canonicalJson(rawZero)).byteLength;
  let byteLength = baseLen - 1 + String(baseLen).length;
  byteLength = baseLen - 1 + String(byteLength).length;
  const core = { ...rawZero, byteLength };
  const canonicalCore = canonicalJson(core);
  assertSeason(
    encoder.encode(canonicalCore).byteLength === byteLength && byteLength <= MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
    "MATCH_EVENT_ARCHIVE_SIZE_EXCEEDED",
  );
  return CompletedCareerMatchEventArchiveSchema.parse({
    ...core,
    archiveSha256: await seasonSha256Text(canonicalCore),
  });
}

const verifiedArchiveDigests = new WeakMap<object, string>();

function assertArchiveCompletionBinding(archive: CompletedCareerMatchEventArchive, completionRaw: unknown): void {
  const completion = T20SeasonMatchCompletionSchema.parse(completionRaw);
  assertSeason(
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
    `MATCH_EVENT_ARCHIVE_COMPLETION_BINDING:${archive.fixtureId}`,
  );
}

export async function validateCompletedCareerMatchEventArchive(
  raw: unknown,
  completionRaw?: unknown,
): Promise<CompletedCareerMatchEventArchive> {
  if (typeof raw === "object" && raw !== null) {
    const priorDigest = verifiedArchiveDigests.get(raw);
    if (priorDigest && (await seasonSha256Text(canonicalJson(raw))) === priorDigest) {
      const verified = raw as CompletedCareerMatchEventArchive;
      if (completionRaw !== undefined) assertArchiveCompletionBinding(verified, completionRaw);
      return verified;
    }
  }
  const archive = CompletedCareerMatchEventArchiveSchema.parse(raw);
  const { archiveSha256, ...core } = archive;
  const canonicalCore = canonicalJson(core);
  const byteLength = new TextEncoder().encode(canonicalCore).byteLength;
  assertSeason(
    byteLength === archive.byteLength && byteLength <= MAX_CAREER_MATCH_EVENT_ARCHIVE_BYTES,
    "MATCH_EVENT_ARCHIVE_BYTE_LENGTH",
  );
  assertSeason(archive.events.length === archive.eventCount, "MATCH_EVENT_ARCHIVE_COUNT_MISMATCH");
  const [coreHash, eventsHash, expectedEventHashes] = await Promise.all([
    seasonSha256Text(canonicalCore),
    seasonSha256Text(canonicalJson(archive.events)),
    Promise.all(
      archive.events.map((ev) =>
        seasonSha256Text(
          canonicalJson([ev.version, ev.sequence, ev.commandId, ev.type, ev.payload, ev.previousHash, ev.stateHash]),
        ),
      ),
    ),
  ]);
  assertSeason(coreHash === archiveSha256, "MATCH_EVENT_ARCHIVE_HASH_MISMATCH");
  assertSeason(eventsHash === archive.eventsSha256, "MATCH_EVENT_ARCHIVE_EVENTS_HASH");
  for (let index = 0; index < archive.events.length; index += 1) {
    const ev = archive.events[index]!;
    assertSeason(ev.sequence === index + 1, `MATCH_EVENT_ARCHIVE_SEQUENCE:${index}`);
    if (index > 0) assertSeason(ev.previousHash === archive.events[index - 1]!.eventHash, `MATCH_EVENT_ARCHIVE_CHAIN:${index}`);
    assertSeason(ev.eventHash === expectedEventHashes[index], `MATCH_EVENT_ARCHIVE_EVENT_HASH:${index}`);
  }
  assertSeason(
    archive.events.at(-1)!.eventHash === archive.finalEventHash &&
      archive.eventChain.finalEventHash === archive.finalEventHash &&
      archive.eventChain.eventCount === archive.eventCount,
    "MATCH_EVENT_ARCHIVE_FINAL_HASH",
  );
  if (completionRaw !== undefined) assertArchiveCompletionBinding(archive, completionRaw);
  verifiedArchiveDigests.set(archive, await seasonSha256Text(canonicalJson(archive)));
  return archive;
}

export async function validateSeasonMatchEventArchiveSet(
  archivesRaw: readonly unknown[],
  stateRaw: unknown,
): Promise<{ archives: CompletedCareerMatchEventArchive[]; totalBytes: number }> {
  const state = await validateT20SeasonState(stateRaw);
  const completionByFixture = new Map(state.completedMatches.map((c) => [c.fixtureId, c]));
  const parsedList = await Promise.all(
    archivesRaw.map((item) => {
      const candidateFixtureId =
        typeof item === "object" && item !== null && typeof (item as { fixtureId?: unknown }).fixtureId === "string"
          ? (item as { fixtureId: string }).fixtureId
          : undefined;
      const completion = candidateFixtureId ? completionByFixture.get(candidateFixtureId) : undefined;
      return validateCompletedCareerMatchEventArchive(item, completion);
    }),
  );
  const seenFixtures = new Set<string>();
  const archives: CompletedCareerMatchEventArchive[] = [];
  let totalBytes = 0;
  for (const parsed of parsedList) {
    const completion = completionByFixture.get(parsed.fixtureId);
    assertSeason(Boolean(completion), `MATCH_EVENT_ARCHIVE_UNKNOWN_FIXTURE:${parsed.fixtureId}`);
    assertSeason(!seenFixtures.has(parsed.fixtureId), `MATCH_EVENT_ARCHIVE_DUPLICATE_FIXTURE:${parsed.fixtureId}`);
    seenFixtures.add(parsed.fixtureId);
    totalBytes += parsed.byteLength;
    assertSeason(totalBytes <= MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES, "MATCH_EVENT_ARCHIVE_TOTAL_SIZE_EXCEEDED");
    archives.push(parsed);
  }
  archives.sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
  return { archives, totalBytes };
}

export async function inspectSeasonCheckpoints(input: {
  saveId: string;
  title: string;
  currentSerial: number;
  currentGeneration: number;
  rows: readonly SeasonCheckpoint[];
}): Promise<SeasonCheckpointInspection> {
  const corruptedGenerations: number[] = [];
  const validGenerations: SeasonCheckpointGenerationOption[] = [];
  for (const row of [...input.rows].sort((a, b) => b.checkpointSerial - a.checkpointSerial)) {
    if (await seasonSha256Text(row.payload) !== row.sha256) {
      corruptedGenerations.push(row.generation);
      continue;
    }
    try {
      const state = await validateT20SeasonState(JSON.parse(row.payload));
      validGenerations.push(
        SeasonCheckpointGenerationOptionSchema.parse({
          generation: row.generation,
          checkpointSerial: row.checkpointSerial,
          revision: state.revision,
          completedFixtures: state.completedMatches.length,
          currentDate: state.careerState.currentDate,
          phase: state.phase,
          stateSha256: state.stateSha256,
          createdAt: row.createdAt,
        }),
      );
    } catch {
      corruptedGenerations.push(row.generation);
    }
  }
  return SeasonCheckpointInspectionSchema.parse({
    saveId: input.saveId,
    title: input.title,
    currentSerial: input.currentSerial,
    currentGeneration: input.currentGeneration,
    corruptedGenerations,
    validGenerations,
  });
}

export type SeasonPersistenceErrorDescription = {
  code: string;
  summary: string;
  guidance: string;
};

export function describeSeasonPersistenceError(error: unknown): SeasonPersistenceErrorDescription {
  const raw = error instanceof Error ? error.message : String(error ?? "UNKNOWN_ERROR");
  const code = raw.split(":")[0]?.trim() || "UNKNOWN_ERROR";
  if (code === "SEASON_SAVE_READ_ONLY" || /read-only|another tab/i.test(raw)) {
    return {
      code: code === "SEASON_SAVE_READ_ONLY" ? code : "SEASON_SAVE_READ_ONLY",
      summary: "This career is open in another tab. It is currently read-only here.",
      guidance: "Close or leave the other tab, or save a manual copy once the writer lease expires.",
    };
  }
  if (code === "SEASON_SAVE_CORRUPT_NO_VALID_CHECKPOINT" || code === "ROSTER_SEASON_SAVE_CORRUPT") {
    return {
      code,
      summary: "No valid checkpoint could be verified for this career save.",
      guidance: "The damaged save was left untouched. Load an earlier manual copy or import a validated .lcxxvi archive.",
    };
  }
  if (code === "SEASON_COPY_SOURCE_CHANGED_OR_LOCKED" || code === "ROSTER_COPY_SOURCE_CHANGED_OR_LOCKED") {
    return {
      code,
      summary: "The source career changed or lost its writer lock before the copy finished.",
      guidance: "Reload the career so you have the latest revision and try creating the manual copy again.",
    };
  }
  if (code.startsWith("SEASON_ARCHIVE_") || code.startsWith("ROSTER_SEASON_ARCHIVE_") || code === "ARCHIVE_SIZE_INVALID") {
    return {
      code,
      summary: "The portable .lcxxvi archive failed cryptographic or schema verification.",
      guidance: "Only unmodified .lcxxvi archives exported from a compatible Lord Cricket XXVI build can be imported.",
    };
  }
  if (code.includes("MATCH_EVENT_ARCHIVE")) {
    return {
      code,
      summary: "A completed match replay archive exceeded bounds or failed integrity checks.",
      guidance: "Career standings and scorecards remain intact; replay is disabled only for affected fixtures.",
    };
  }
  return {
    code,
    summary: raw,
    guidance: "Check whether another tab owns the career or export a backup .lcxxvi archive before retrying.",
  };
}

export class IndexedDbSeasonRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;
  constructor(private readonly databaseName = DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const games = db.createObjectStore("games", { keyPath: "saveId" });
        games.createIndex("updatedAt", "updatedAt");
        games.createIndex("matchGameId", "matchGameId");
        const snapshots = db.createObjectStore("snapshots", { keyPath: ["saveId", "generation"] });
        snapshots.createIndex("saveId", "saveId");
        const events = db.createObjectStore("events", { keyPath: ["saveId", "sequence"] });
        events.createIndex("saveId", "saveId");
        const commands = db.createObjectStore("commands", { keyPath: ["saveId", "commandId"] });
        commands.createIndex("saveId", "saveId");
        db.createObjectStore("worldPacks", { keyPath: "hash" });
        db.createObjectStore("modelPacks", { keyPath: "hash" });
        db.createObjectStore("rulePacks", { keyPath: "hash" });
        db.createObjectStore("projections", { keyPath: ["saveId", "scope", "key"] });
        db.createObjectStore("settings", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
    });
    return this.dbPromise;
  }

  async list(): Promise<SeasonSaveSummary[]> {
    const db = await this.open();
    const tx = db.transaction("games", "readonly");
    const rows = await req(tx.objectStore("games").getAll()) as Array<Record<string, unknown>>;
    await txDone(tx);
    return rows.filter((row) => row.recordType === SEASON_RECORD_TYPE)
      .map((row) => SeasonSaveSummarySchema.parse({
        saveId: row.saveId, kind: row.kind, title: row.title, seasonId: row.seasonId, careerId: row.careerId,
        controlledTeamId: row.controlledTeamId, currentDate: row.currentDate, revision: row.revision,
        completedFixtures: row.completedFixtures, phase: row.phase, stateSha256: row.stateSha256, updatedAt: row.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async acquireLease(saveId: string, ownerId: string, now: number): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings"), key = leaseKey(saveId);
    const current = await req(store.get(key)) as LeaseRecord | undefined;
    if (current && current.ownerId !== ownerId && current.expiresAt > now) {
      tx.abort(); try { await txDone(tx); } catch { /* expected */ } return false;
    }
    store.put({ key, saveId, ownerId, expiresAt: now + SEASON_WRITER_LEASE_MS } satisfies LeaseRecord);
    await txDone(tx); return true;
  }

  async releaseLease(saveId: string, ownerId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite"), store = tx.objectStore("settings");
    const key = leaseKey(saveId), current = await req(store.get(key)) as LeaseRecord | undefined;
    if (current?.ownerId === ownerId) store.delete(key);
    await txDone(tx);
  }

  async commit(input: SeasonDurableCommit): Promise<SeasonSaveSummary> {
    const state = await validateT20SeasonState(input.state);
    const command = input.command ? SeasonDurableCommandSchema.parse(input.command) : null;
    assertSeason(input.updatedAt.length > 0 && !Number.isNaN(Date.parse(input.updatedAt)), "UPDATED_AT_INVALID");
    const payload = canonicalJson(state), snapshotHash = await seasonSha256Text(payload);
    const projectionPayload = canonicalJson(state.projection), projectionHash = await seasonSha256Text(projectionPayload);
    const worldCopy = input.worldCopy ? await validateStoredWorldCopy(input.worldCopy) : null;
    const worldCopyPayload = worldCopy ? canonicalJson(worldCopy) : null;
    const suppliedCopyHash = worldCopyPayload ? await seasonSha256Text(worldCopyPayload) : null;
    const preparedArchives: Array<{ fixtureId: string; payload: string; sha256: string; bytes: number }> = [];
    if (input.matchEventArchives?.length) {
      const validatedSet = await validateSeasonMatchEventArchiveSet(input.matchEventArchives, state);
      for (const archive of validatedSet.archives) {
        const archivePayload = canonicalJson(archive);
        preparedArchives.push({
          fixtureId: archive.fixtureId,
          payload: archivePayload,
          sha256: await seasonSha256Text(archivePayload),
          bytes: archive.byteLength,
        });
      }
    }
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "commands", "settings", "projections", "worldPacks"], "readwrite");
    const games = tx.objectStore("games"), snapshots = tx.objectStore("snapshots"), commands = tx.objectStore("commands"), settings = tx.objectStore("settings"), projections = tx.objectStore("projections");
    const existing = await req(games.get(input.saveId)) as SeasonGameRecord | undefined;
    if (existing && existing.recordType !== SEASON_RECORD_TYPE) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_SAVE_ID_CONFLICT"); }
    if (existing && ![SEASON_SAVE_SCHEMA_VERSION, SEASON_PRESENTATION_SAVE_SCHEMA_VERSION].includes(existing.schemaVersion)) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_SAVE_SCHEMA_UNSUPPORTED"); }
    if (existing && suppliedCopyHash && suppliedCopyHash !== existing.worldCopySha256) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_WORLD_COPY_IMMUTABLE"); }
    if (existing?.schemaVersion === SEASON_PRESENTATION_SAVE_SCHEMA_VERSION && !existing.worldCopySha256) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_WORLD_COPY_MISSING"); }
    if (existing?.schemaVersion === SEASON_PRESENTATION_SAVE_SCHEMA_VERSION && !suppliedCopyHash) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_WORLD_COPY_REQUIRED"); }
    if (existing?.schemaVersion === SEASON_SAVE_SCHEMA_VERSION && existing.worldCopySha256) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_WORLD_COPY_VERSION_MISMATCH"); }
    const copyNow = input.copySource?.now() ?? input.now;
    if (input.copySource) {
      const source = await req(games.get(input.copySource.saveId)) as SeasonGameRecord | undefined;
      const sourceLease = await req(settings.get(leaseKey(input.copySource.saveId))) as LeaseRecord | undefined;
      if (existing || input.copySource.saveId === input.saveId || !source || source.recordType !== SEASON_RECORD_TYPE || ![SEASON_SAVE_SCHEMA_VERSION, SEASON_PRESENTATION_SAVE_SCHEMA_VERSION].includes(source.schemaVersion) || source.revision !== input.copySource.revision || source.stateSha256 !== input.copySource.stateSha256 || (source.worldCopySha256 ?? null) !== suppliedCopyHash || state.stateSha256 !== input.copySource.stateSha256 || !sourceLease || sourceLease.ownerId !== input.ownerId || sourceLease.expiresAt <= copyNow) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("SEASON_COPY_SOURCE_CHANGED_OR_LOCKED"); }
    }
    const lease = await req(settings.get(leaseKey(input.saveId))) as LeaseRecord | undefined;
    if (!lease || lease.ownerId !== input.ownerId || lease.expiresAt <= copyNow) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("SEASON_SAVE_READ_ONLY"); }
    const durableRevision = existing?.revision ?? 0;
    if (input.expectedRevision !== null && durableRevision !== input.expectedRevision) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error(`SEASON_SAVE_STALE_REVISION:${input.expectedRevision}:${durableRevision}`); }
    if (command) {
      const prior = await req(commands.get([input.saveId, command.commandId])) as CommandRecord | undefined;
      if (prior) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error(prior.requestCanonical === command.requestCanonical ? "SEASON_SAVE_DUPLICATE_COMMAND_ALREADY_COMMITTED" : "SEASON_SAVE_DUPLICATE_COMMAND_CONFLICT"); }
      assertSeason(command.committedRevision === state.revision, "COMMAND_REVISION_MISMATCH");
    }
    const serial = (existing?.checkpointSerial ?? -1) + 1, generation = serial % 3;
    snapshots.put({ saveId: input.saveId, generation, checkpointSerial: serial, revision: state.revision, payload, sha256: snapshotHash, createdAt: input.updatedAt } satisfies SeasonCheckpoint);
    if (command) commands.put({ saveId: input.saveId, ...command } satisfies CommandRecord);
    projections.put({ saveId: input.saveId, scope: "T20_SEASON", key: state.seasonId, payload: projectionPayload, sha256: projectionHash } satisfies ProjectionRecord);
    if (input.copySource || preparedArchives.length > 0) {
      const allProjections = await req(projections.getAll()) as ProjectionRecord[];
      const mergedByFixture = new Map<string, ProjectionRecord>();
      if (input.copySource) {
        for (const row of allProjections) {
          if (row.saveId === input.copySource.saveId && row.scope === CAREER_MATCH_EVENTS_SCOPE) {
            mergedByFixture.set(row.key, { ...row, saveId: input.saveId });
          }
        }
      }
      for (const row of allProjections) {
        if (row.saveId === input.saveId && row.scope === CAREER_MATCH_EVENTS_SCOPE) {
          mergedByFixture.set(row.key, row);
        }
      }
      for (const item of preparedArchives) {
        mergedByFixture.set(item.fixtureId, {
          saveId: input.saveId,
          scope: CAREER_MATCH_EVENTS_SCOPE,
          key: item.fixtureId,
          payload: item.payload,
          sha256: item.sha256,
        });
      }
      const encoder = new TextEncoder();
      let totalArchiveBytes = 0;
      for (const row of mergedByFixture.values()) totalArchiveBytes += encoder.encode(row.payload).byteLength;
      if (totalArchiveBytes > MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES) {
        const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ }
        throw new Error("LC_T20_SEASON_STATE_MATCH_EVENT_ARCHIVE_TOTAL_SIZE_EXCEEDED");
      }
      for (const row of mergedByFixture.values()) projections.put(row);
    }
    const summary = summaryFor({ ...input, state });
    const copyHash = existing?.worldCopySha256 ?? suppliedCopyHash;
    if (worldCopyPayload && suppliedCopyHash) {
      const packs = tx.objectStore("worldPacks");
      const previous = await req(packs.get(suppliedCopyHash)) as { hash: string; payload: string } | undefined;
      if (!previous && existing) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_WORLD_COPY_MISSING"); }
      if (previous && previous.payload !== worldCopyPayload) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_WORLD_COPY_CONFLICT"); }
      if (!previous) packs.add({ hash: suppliedCopyHash, payload: worldCopyPayload });
    }
    games.put({ ...summary, recordType: SEASON_RECORD_TYPE, schemaVersion: copyHash ? SEASON_PRESENTATION_SAVE_SCHEMA_VERSION : SEASON_SAVE_SCHEMA_VERSION, ...(copyHash ? { worldCopySha256: copyHash } : {}), checkpointSerial: serial, checkpointGeneration: generation } satisfies SeasonGameRecord);
    if (input.setActive !== false) settings.put({ key: activeKey(), value: input.saveId } satisfies SettingRecord);
    settings.put({ ...lease, expiresAt: input.now + SEASON_WRITER_LEASE_MS } satisfies LeaseRecord);
    if (input.testAbortAfterWrites) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("SEASON_SAVE_INJECTED_ABORT"); }
    await txDone(tx); return summary;
  }

  async load(saveId: string): Promise<SeasonLoadResult | null> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "worldPacks"], "readonly");
    const game = await req(tx.objectStore("games").get(saveId)) as SeasonGameRecord | undefined;
    if (!game) { await txDone(tx); return null; }
    if (game.recordType !== SEASON_RECORD_TYPE || ![SEASON_SAVE_SCHEMA_VERSION, SEASON_PRESENTATION_SAVE_SCHEMA_VERSION].includes(game.schemaVersion)) { await txDone(tx); throw new Error("SEASON_SAVE_SCHEMA_UNSUPPORTED"); }
    if (game.schemaVersion === SEASON_SAVE_SCHEMA_VERSION && game.worldCopySha256) { await txDone(tx); throw new Error("SEASON_WORLD_COPY_VERSION_MISMATCH"); }
    const rows = await req(tx.objectStore("snapshots").index("saveId").getAll(saveId)) as SeasonCheckpoint[];
    const worldRow = game.schemaVersion === SEASON_PRESENTATION_SAVE_SCHEMA_VERSION && game.worldCopySha256
      ? await req(tx.objectStore("worldPacks").get(game.worldCopySha256)) as { hash: string; payload: string } | undefined : undefined;
    await txDone(tx);
    let worldCopy: NewGameWorldCopy | null = null;
    if (game.schemaVersion === SEASON_PRESENTATION_SAVE_SCHEMA_VERSION) {
      if (!worldRow || !game.worldCopySha256 || await seasonSha256Text(worldRow.payload) !== game.worldCopySha256) throw new Error("SEASON_WORLD_COPY_MISSING_OR_DAMAGED");
      worldCopy = await validateStoredWorldCopy(JSON.parse(worldRow.payload));
    }
    const recoveredCheckpoint = await recoverSeasonCheckpoint(rows, game.checkpointSerial);
    const { state, checkpoint, recovered, corruptedGenerations } = recoveredCheckpoint;
    const summary = SeasonSaveSummarySchema.parse({
      saveId: game.saveId, kind: game.kind, title: game.title, seasonId: state.seasonId, careerId: state.careerId,
      controlledTeamId: state.controlledTeamId, currentDate: state.careerState.currentDate, revision: state.revision,
      completedFixtures: state.completedMatches.length, phase: state.phase, stateSha256: state.stateSha256,
      updatedAt: recovered ? checkpoint.createdAt : game.updatedAt,
    });
    return { summary, state, recovered, recoveredFromGeneration: recovered ? checkpoint.generation : null, corruptedGenerations, worldCopy };
  }

  async listRoster(): Promise<SeasonSaveSummary[]> {
    const db = await this.open(); const tx = db.transaction("games", "readonly");
    const rows = await req(tx.objectStore("games").getAll()) as Array<Record<string, unknown>>; await txDone(tx);
    return rows.filter(row => row.recordType === ROSTER_SEASON_RECORD_TYPE).map(row => SeasonSaveSummarySchema.parse({
      saveId: row.saveId, kind: row.kind, title: row.title, seasonId: row.seasonId, careerId: row.careerId,
      controlledTeamId: row.controlledTeamId, currentDate: row.currentDate, revision: row.revision,
      completedFixtures: row.completedFixtures, phase: row.phase, stateSha256: row.stateSha256, updatedAt: row.updatedAt,
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async commitRoster(input: { saveId: string; kind: "AUTO" | "MANUAL" | "IMPORTED"; title: string; expectedRevision: number | null;
    state: RosterSeasonState; rosterPack: StagedRosterPack; command: SeasonDurableCommand | null;
    ownerId: string; now: number; updatedAt: string; setActive?: boolean; testAbortAfterWrites?: boolean; copySource?: { saveId: string; revision: number; stateSha256: string; now: () => number } }): Promise<SeasonSaveSummary> {
    const state = RosterSeasonStateSchema.parse(input.state);
    const pack = StagedRosterPackSchema.parse(input.rosterPack);
    const { stateSha256, ...core } = state;
    const payload = canonicalJson(state), snapshotHash = await seasonSha256Text(payload);
    const packPayload = canonicalJson(pack), packHash = await seasonSha256Text(packPayload);
    if (await seasonSha256Text(canonicalJson(core)) !== stateSha256 || state.schedule.rosterPackHash !== packHash ||
        state.schedule.worldHash !== await seasonSha256Text(canonicalJson(pack.world)) || state.careerState.rosterPackHash !== packHash ||
        state.careerState.scheduleSha256 !== state.schedule.scheduleSha256) throw new Error("ROSTER_SEASON_SAVE_BINDING_MISMATCH");
    const command = input.command ? SeasonDurableCommandSchema.parse(input.command) : null;
    if (command && command.committedRevision !== state.revision) throw new Error("ROSTER_SEASON_COMMAND_REVISION_MISMATCH");
    const summary = SeasonSaveSummarySchema.parse({ saveId: input.saveId, kind: input.kind, title: input.title,
      seasonId: state.schedule.request.seasonId, careerId: state.careerId, controlledTeamId: state.controlledTeamId,
      currentDate: state.careerState.currentDate, revision: state.revision, completedFixtures: state.outcomes.length,
      phase: state.phase, stateSha256, updatedAt: input.updatedAt });
    const db = await this.open(); const tx = db.transaction(["games", "snapshots", "commands", "settings", "worldPacks"], "readwrite");
    const games = tx.objectStore("games"), snapshots = tx.objectStore("snapshots"), settings = tx.objectStore("settings"), packs = tx.objectStore("worldPacks");
    const existing = await req(games.get(input.saveId)) as (SeasonSaveSummary & { recordType: string; schemaVersion: string; rosterPackSha256: string; checkpointSerial: number; checkpointGeneration: number }) | undefined;
    if (existing && (existing.recordType !== ROSTER_SEASON_RECORD_TYPE || existing.schemaVersion !== ROSTER_SEASON_SAVE_VERSION)) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_SAVE_ID_CONFLICT"); }
    if (existing && existing.rosterPackSha256 !== packHash) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_PACK_IMMUTABLE"); }
    const copyNow = input.copySource?.now() ?? input.now;
    if (input.copySource) {
      const source = await req(games.get(input.copySource.saveId)) as (SeasonSaveSummary & { recordType: string; schemaVersion: string; rosterPackSha256: string }) | undefined;
      const sourceLease = await req(settings.get(leaseKey(input.copySource.saveId))) as LeaseRecord | undefined;
      if (existing || input.copySource.saveId === input.saveId || !source || source.recordType !== ROSTER_SEASON_RECORD_TYPE || source.schemaVersion !== ROSTER_SEASON_SAVE_VERSION || source.revision !== input.copySource.revision || source.stateSha256 !== input.copySource.stateSha256 || source.rosterPackSha256 !== packHash || state.stateSha256 !== input.copySource.stateSha256 || !sourceLease || sourceLease.ownerId !== input.ownerId || sourceLease.expiresAt <= copyNow) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_COPY_SOURCE_CHANGED_OR_LOCKED"); }
    }
    const lease = await req(settings.get(leaseKey(input.saveId))) as LeaseRecord | undefined;
    if (!lease || lease.ownerId !== input.ownerId || lease.expiresAt <= copyNow) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_READ_ONLY"); }
    if ((existing && input.expectedRevision !== existing.revision) || (!existing && input.expectedRevision !== null)) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_STALE_REVISION"); }
    if (existing && (state.revision !== existing.revision + 1 || !command)) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_INVALID_REVISION"); }
    if (command && await req(tx.objectStore("commands").get([input.saveId, command.commandId]))) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_DUPLICATE_COMMAND"); }
    const priorPack = await req(packs.get(packHash)) as { hash: string; payload: string } | undefined;
    if (existing && !priorPack) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_PACK_MISSING"); }
    if (priorPack && priorPack.payload !== packPayload) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_PACK_CONFLICT"); }
    if (!priorPack) packs.add({ hash: packHash, payload: packPayload });
    const serial = (existing?.checkpointSerial ?? -1) + 1, generation = serial % 3;
    snapshots.put({ saveId: input.saveId, generation, checkpointSerial: serial, revision: state.revision, payload, sha256: snapshotHash, createdAt: input.updatedAt } satisfies SeasonCheckpoint);
    if (command) tx.objectStore("commands").put({ saveId: input.saveId, ...command });
    games.put({ ...summary, recordType: ROSTER_SEASON_RECORD_TYPE, schemaVersion: ROSTER_SEASON_SAVE_VERSION,
      rosterPackSha256: packHash, checkpointSerial: serial, checkpointGeneration: generation });
    settings.put({ ...lease, expiresAt: input.now + SEASON_WRITER_LEASE_MS } satisfies LeaseRecord);
    if (input.setActive !== false) settings.put({ key: "activeRosterSeasonSaveId", value: input.saveId } satisfies SettingRecord);
    if (input.testAbortAfterWrites) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_INJECTED_ABORT"); }
    await txDone(tx); return summary;
  }

  async loadRoster(saveId: string): Promise<{ summary: SeasonSaveSummary; state: RosterSeasonState; rosterPack: StagedRosterPack; recovered: boolean; recoveredFromGeneration: number | null } | null> {
    const db = await this.open(); const tx = db.transaction(["games", "snapshots", "worldPacks"], "readonly");
    const game = await req(tx.objectStore("games").get(saveId)) as (SeasonSaveSummary & { recordType: string; schemaVersion: string; rosterPackSha256: string; checkpointSerial: number }) | undefined;
    if (!game) { await txDone(tx); return null; }
    if (game.recordType !== ROSTER_SEASON_RECORD_TYPE || game.schemaVersion !== ROSTER_SEASON_SAVE_VERSION) { await txDone(tx); throw new Error("ROSTER_SEASON_SAVE_VERSION_UNSUPPORTED"); }
    const rows = await req(tx.objectStore("snapshots").index("saveId").getAll(saveId)) as SeasonCheckpoint[];
    const row = await req(tx.objectStore("worldPacks").get(game.rosterPackSha256)) as { hash: string; payload: string } | undefined; await txDone(tx);
    if (!row || await seasonSha256Text(row.payload) !== game.rosterPackSha256) throw new Error("ROSTER_SEASON_PACK_MISSING_OR_DAMAGED");
    const rosterPack = StagedRosterPackSchema.parse(JSON.parse(row.payload));
    for (const checkpoint of rows.sort((a, b) => b.checkpointSerial - a.checkpointSerial)) {
      if (await seasonSha256Text(checkpoint.payload) !== checkpoint.sha256) continue;
      try {
        const state = RosterSeasonStateSchema.parse(JSON.parse(checkpoint.payload));
        const { stateSha256, ...core } = state;
        if (checkpoint.revision !== state.revision || await seasonSha256Text(canonicalJson(core)) !== stateSha256 || state.schedule.rosterPackHash !== game.rosterPackSha256 ||
            state.schedule.worldHash !== await seasonSha256Text(canonicalJson(rosterPack.world)) || state.careerState.rosterPackHash !== game.rosterPackSha256 ||
            state.careerState.scheduleSha256 !== state.schedule.scheduleSha256) continue;
        const recovered = checkpoint.checkpointSerial !== game.checkpointSerial;
        const summary = SeasonSaveSummarySchema.parse({ saveId, kind: game.kind, title: game.title, seasonId: state.schedule.request.seasonId,
          careerId: state.careerId, controlledTeamId: state.controlledTeamId, currentDate: state.careerState.currentDate,
          revision: state.revision, completedFixtures: state.outcomes.length, phase: state.phase, stateSha256, updatedAt: recovered ? checkpoint.createdAt : game.updatedAt });
        return { summary, state, rosterPack, recovered, recoveredFromGeneration: recovered ? checkpoint.generation : null };
      } catch { /* try an older checkpoint */ }
    }
    throw new Error("ROSTER_SEASON_SAVE_CORRUPT");
  }

  async activeRosterSaveId(): Promise<string | null> {
    const db = await this.open(); const tx = db.transaction("settings", "readonly");
    const row = await req(tx.objectStore("settings").get("activeRosterSeasonSaveId")) as SettingRecord | undefined; await txDone(tx);
    return typeof row?.value === "string" ? row.value : null;
  }

  async activeSaveId(): Promise<string | null> {
    const db = await this.open(); const tx = db.transaction("settings", "readonly");
    const row = await req(tx.objectStore("settings").get(activeKey())) as SettingRecord | undefined; await txDone(tx);
    return typeof row?.value === "string" ? row.value : null;
  }

  async clearActiveSaveId(saveId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const row = await req(store.get(activeKey())) as SettingRecord | undefined;
    if (row?.value === saveId) store.delete(activeKey());
    await txDone(tx);
  }

  async loadMatchEventArchives(
    saveId: string,
    state?: T20SeasonState,
  ): Promise<{ archives: CompletedCareerMatchEventArchive[]; damagedFixtureIds: string[]; totalBytes: number }> {
    const db = await this.open();
    const tx = db.transaction("projections", "readonly");
    const allRows = await req(tx.objectStore("projections").getAll()) as ProjectionRecord[];
    await txDone(tx);
    const rows = allRows.filter((row) => row.saveId === saveId && row.scope === CAREER_MATCH_EVENTS_SCOPE);
    const completionByFixture = new Map(state?.completedMatches.map((c) => [c.fixtureId, c]) ?? []);
    const archives: CompletedCareerMatchEventArchive[] = [];
    const damagedFixtureIds: string[] = [];
    const encoder = new TextEncoder();
    let totalBytes = 0;
    const seenFixtures = new Set<string>();
    let validatedBytes = 0;
    for (const row of rows) {
      totalBytes += encoder.encode(row.payload).byteLength;
      if (await seasonSha256Text(row.payload) !== row.sha256) {
        damagedFixtureIds.push(row.key);
        continue;
      }
      try {
        const completion = state ? completionByFixture.get(row.key) : undefined;
        if (state && !completion) throw new Error(`UNKNOWN_FIXTURE:${row.key}`);
        const parsed = await validateCompletedCareerMatchEventArchive(JSON.parse(row.payload), completion);
        if (seenFixtures.has(parsed.fixtureId)) throw new Error(`DUPLICATE_FIXTURE:${parsed.fixtureId}`);
        seenFixtures.add(parsed.fixtureId);
        validatedBytes += parsed.byteLength;
        assertSeason(validatedBytes <= MAX_SEASON_EVENT_ARCHIVES_TOTAL_BYTES, "MATCH_EVENT_ARCHIVE_TOTAL_SIZE_EXCEEDED");
        archives.push(parsed);
      } catch (err) {
        if (err instanceof Error && err.message.includes("TOTAL_SIZE_EXCEEDED")) throw err;
        damagedFixtureIds.push(row.key);
      }
    }
    archives.sort((a, b) => a.fixtureOrdinal - b.fixtureOrdinal || a.fixtureId.localeCompare(b.fixtureId));
    return { archives, damagedFixtureIds: damagedFixtureIds.sort(), totalBytes };
  }

  async inspectCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots"], "readonly");
    const game = await req(tx.objectStore("games").get(saveId)) as SeasonGameRecord | undefined;
    if (!game || game.recordType !== SEASON_RECORD_TYPE) { await txDone(tx); throw new Error("SEASON_SAVE_NOT_FOUND"); }
    const rows = await req(tx.objectStore("snapshots").index("saveId").getAll(saveId)) as SeasonCheckpoint[];
    await txDone(tx);
    return inspectSeasonCheckpoints({
      saveId,
      title: game.title,
      currentSerial: game.checkpointSerial,
      currentGeneration: game.checkpointGeneration,
      rows,
    });
  }

  async loadGeneration(saveId: string, generation: number): Promise<SeasonLoadResult> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "worldPacks"], "readonly");
    const game = await req(tx.objectStore("games").get(saveId)) as SeasonGameRecord | undefined;
    if (!game || game.recordType !== SEASON_RECORD_TYPE) { await txDone(tx); throw new Error("SEASON_SAVE_NOT_FOUND"); }
    const row = await req(tx.objectStore("snapshots").get([saveId, generation])) as SeasonCheckpoint | undefined;
    const worldRow = game.schemaVersion === SEASON_PRESENTATION_SAVE_SCHEMA_VERSION && game.worldCopySha256
      ? await req(tx.objectStore("worldPacks").get(game.worldCopySha256)) as { hash: string; payload: string } | undefined : undefined;
    await txDone(tx);
    if (!row) throw new Error("SEASON_CHECKPOINT_NOT_FOUND");
    let worldCopy: NewGameWorldCopy | null = null;
    if (game.schemaVersion === SEASON_PRESENTATION_SAVE_SCHEMA_VERSION) {
      if (!worldRow || !game.worldCopySha256 || await seasonSha256Text(worldRow.payload) !== game.worldCopySha256) throw new Error("SEASON_WORLD_COPY_MISSING_OR_DAMAGED");
      worldCopy = await validateStoredWorldCopy(JSON.parse(worldRow.payload));
    }
    const recoveredCheckpoint = await recoverSeasonCheckpoint([row], row.checkpointSerial);
    const { state, checkpoint } = recoveredCheckpoint;
    const summary = SeasonSaveSummarySchema.parse({
      saveId: game.saveId, kind: game.kind, title: game.title, seasonId: state.seasonId, careerId: state.careerId,
      controlledTeamId: state.controlledTeamId, currentDate: state.careerState.currentDate, revision: state.revision,
      completedFixtures: state.completedMatches.length, phase: state.phase, stateSha256: state.stateSha256,
      updatedAt: checkpoint.createdAt,
    });
    return {
      summary,
      state,
      recovered: checkpoint.checkpointSerial !== game.checkpointSerial,
      recoveredFromGeneration: generation,
      corruptedGenerations: [],
      worldCopy,
    };
  }

  /** Verification-only fault injection: damages the newest checkpoint without replacing it. */
  async corruptCurrentCheckpoint(saveId: string): Promise<void> {
    const db = await this.open(); const tx = db.transaction(["games", "snapshots"], "readwrite");
    const game = await req(tx.objectStore("games").get(saveId)) as SeasonGameRecord | undefined;
    if (!game) throw new Error("SEASON_SAVE_NOT_FOUND");
    const key: [string, number] = [saveId, game.checkpointGeneration];
    const row = await req(tx.objectStore("snapshots").get(key)) as SeasonCheckpoint | undefined;
    if (!row) throw new Error("SEASON_CHECKPOINT_NOT_FOUND");
    tx.objectStore("snapshots").put({ ...row, payload: `${row.payload} ` });
    await txDone(tx);
  }

  /** Verification-only fault injection: damages one archived match event projection row. */
  async corruptMatchEventArchiveForTest(saveId: string, fixtureId: string): Promise<void> {
    const db = await this.open(); const tx = db.transaction("projections", "readwrite");
    const store = tx.objectStore("projections");
    const row = await req(store.get([saveId, CAREER_MATCH_EVENTS_SCOPE, fixtureId])) as ProjectionRecord | undefined;
    if (!row) { tx.abort(); try { await txDone(tx); } catch { /* expected */ } throw new Error("MATCH_EVENT_ARCHIVE_NOT_FOUND"); }
    store.put({ ...row, payload: `${row.payload} ` });
    await txDone(tx);
  }
}
