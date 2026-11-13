import {
  canonicalJson,
  CompletedSeasonRecordCoreSchema,
  CompletedSeasonRecordSchema,
  MAX_PERSISTENT_WORLD_EVENT_ARCHIVES_TOTAL_BYTES,
  PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION,
  PERSISTENT_WORLD_SAVE_SCHEMA_VERSION,
  PersistentCareerProjectionCoreSchema,
  PersistentCareerProjectionSchema,
  PersistentWorldSaveSummarySchema,
  PersistentWorldStateCoreSchema,
  PersistentWorldStateSchema,
  SeasonCheckpointInspectionSchema,
  SeasonDurableCommandSchema,
  type CompletedCareerMatchEventArchive,
  type CompletedSeasonRecord,
  type NewGameWorldCopy,
  type PersistentCareerProjection,
  type PersistentCareerProjectionCore,
  type PersistentWorldSaveSummary,
  type PersistentWorldState,
  type PersistentWorldStateCore,
  type SeasonCheckpointGenerationOption,
  type SeasonCheckpointInspection,
  type SeasonDurableCommand,
  type T20SeasonMatchCompletion,
} from "@lcxxvi/contracts";
import { DB_NAME, DB_VERSION } from "./index.js";
import {
  CAREER_MATCH_EVENTS_SCOPE,
  createT20SeasonArchive,
  SEASON_PRESENTATION_SAVE_SCHEMA_VERSION,
  SEASON_RECORD_TYPE,
  SEASON_SAVE_SCHEMA_VERSION,
  SEASON_WRITER_LEASE_MS,
  seasonSha256Text,
  validateCompletedCareerMatchEventArchive,
  validateStoredWorldCopy,
  validateT20SeasonArchive,
  validateT20SeasonState,
  type SeasonCheckpoint,
} from "./season.js";

export const PERSISTENT_WORLD_RECORD_TYPE = "PERSISTENT_WORLD" as const;
export const PERSISTENT_CAREER_PROJECTION_SCOPE = "PERSISTENT_CAREER_V1" as const;
export const COMPLETED_SEASON_RECORD_SCOPE = "COMPLETED_SEASON_RECORD_V1" as const;

type PersistentWorldGameRecord = PersistentWorldSaveSummary & {
  recordType: typeof PERSISTENT_WORLD_RECORD_TYPE;
  schemaVersion:
    | typeof PERSISTENT_WORLD_SAVE_SCHEMA_VERSION
    | typeof PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION;
  worldCopySha256?: string;
  checkpointSerial: number;
  checkpointGeneration: number;
};

type SourceSeasonGameRecord = {
  saveId: string;
  recordType: string;
  schemaVersion: string;
  revision: number;
  stateSha256: string;
  worldCopySha256?: string;
};

type CommandRecord = SeasonDurableCommand & { saveId: string };
type LeaseRecord = { key: string; saveId: string; ownerId: string; expiresAt: number };
type SettingRecord = { key: string; value: unknown };
type ProjectionRecord = {
  saveId: string;
  scope: string;
  key: string;
  payload: string;
  sha256: string;
};

export type PersistentWorldDurableCommit = {
  saveId: string;
  kind: "AUTO" | "MANUAL" | "IMPORTED";
  title: string;
  expectedRevision: number | null;
  state: PersistentWorldState;
  command: SeasonDurableCommand | null;
  idempotentCommandReplay?: boolean;
  ownerId: string;
  now: number;
  updatedAt: string;
  setActive?: boolean;
  worldCopy?: NewGameWorldCopy | null;
  matchEventArchives?: readonly CompletedCareerMatchEventArchive[];
  testAbortAfterWrites?: boolean;
  copySource?: {
    saveId: string;
    sourceRecordType: typeof SEASON_RECORD_TYPE | typeof PERSISTENT_WORLD_RECORD_TYPE;
    revision: number;
    stateSha256: string;
    now: () => number;
  };
};

export type PersistentWorldLoadResult = {
  summary: PersistentWorldSaveSummary;
  state: PersistentWorldState;
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

function leaseKey(saveId: string) {
  return `lease:${saveId}`;
}

function activeKey() {
  return "activeSeasonSaveId";
}

function assertPersistent(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`LC_PERSISTENT_WORLD_${code}`);
}

export async function sealCompletedSeasonRecord(input: {
  seasonNumber: number;
  calendarYear: number;
  completedSeasonState: unknown;
  completedAt: string;
}): Promise<CompletedSeasonRecord> {
  const state = await validateT20SeasonState(input.completedSeasonState);
  assertPersistent(state.phase === "COMPLETE", "COMPLETED_RECORD_REQUIRES_COMPLETE_SEASON");
  const seasonArchive = await createT20SeasonArchive(state, input.completedAt);
  const champion = state.projection.table.find((row) => row.rank === 1);
  const runnerUp = state.projection.table.find((row) => row.rank === 2);
  assertPersistent(Boolean(champion) && Boolean(runnerUp), "COMPLETED_RECORD_PODIUM_MISSING");
  const core = CompletedSeasonRecordCoreSchema.parse({
    completedSeasonVersion: "LC_COMPLETED_SEASON_RECORD_V1",
    seasonNumber: input.seasonNumber,
    calendarYear: input.calendarYear,
    seasonId: state.seasonId,
    gameId: state.gameId,
    competitionId: "LC_T20_LEAGUE_01",
    startDate: state.schedule.startDate,
    endDate: state.careerState.finalScheduledDate,
    scheduleSha256: state.schedule.scheduleSha256,
    finalSeasonStateSha256: state.stateSha256,
    championTeamId: champion!.teamId,
    runnerUpTeamId: runnerUp!.teamId,
    seasonArchive,
    table: state.projection.table,
    players: state.projection.players,
    leaders: state.projection.leaders,
    completedMatches: state.completedMatches,
  });
  const recordSha256 = await seasonSha256Text(canonicalJson(core));
  return CompletedSeasonRecordSchema.parse({ ...core, recordSha256 });
}

export async function validateCompletedSeasonRecord(raw: unknown): Promise<CompletedSeasonRecord> {
  const record = CompletedSeasonRecordSchema.parse(raw);
  const { recordSha256, ...coreRaw } = record;
  const core = CompletedSeasonRecordCoreSchema.parse(coreRaw);
  const expectedHash = await seasonSha256Text(canonicalJson(core));
  assertPersistent(recordSha256 === expectedHash, "COMPLETED_SEASON_RECORD_HASH_MISMATCH");
  const archive = await validateT20SeasonArchive(record.seasonArchive);
  assertPersistent(
    archive.seasonId === record.seasonId &&
      archive.scheduleSha256 === record.scheduleSha256 &&
      archive.stateSha256 === record.finalSeasonStateSha256 &&
      archive.championTeamId === record.championTeamId,
    "COMPLETED_SEASON_ARCHIVE_BINDING_MISMATCH",
  );
  assertPersistent(record.endDate >= record.startDate, "COMPLETED_SEASON_DATE_ORDER_INVALID");
  assertPersistent(
    record.startDate.startsWith(`${String(record.calendarYear).padStart(4, "0")}-`),
    "COMPLETED_SEASON_CALENDAR_YEAR_MISMATCH",
  );
  assertPersistent(
    record.table.some((row) => row.rank === 1 && row.teamId === record.championTeamId) &&
      record.table.some((row) => row.rank === 2 && row.teamId === record.runnerUpTeamId) &&
      record.championTeamId !== record.runnerUpTeamId,
    "COMPLETED_SEASON_PODIUM_MISMATCH",
  );
  const fixtureIds = new Set<string>();
  const matchIds = new Set<string>();
  const sourceHashes = new Set<string>();
  for (const [index, completion] of record.completedMatches.entries()) {
    assertPersistent(
      completion.seasonId === record.seasonId &&
        completion.scheduleSha256 === record.scheduleSha256 &&
        completion.fixtureOrdinal === index,
      `COMPLETED_SEASON_MATCH_BINDING:${completion.fixtureId}`,
    );
    assertPersistent(
      !fixtureIds.has(completion.fixtureId) &&
        !matchIds.has(completion.matchId) &&
        !sourceHashes.has(completion.sourceCompletionSha256),
      `COMPLETED_SEASON_DUPLICATE_MATCH:${completion.fixtureId}`,
    );
    fixtureIds.add(completion.fixtureId);
    matchIds.add(completion.matchId);
    sourceHashes.add(completion.sourceCompletionSha256);
  }
  return record;
}

export async function sealPersistentCareerProjection(
  coreRaw: PersistentCareerProjectionCore,
): Promise<PersistentCareerProjection> {
  const core = PersistentCareerProjectionCoreSchema.parse(coreRaw);
  const projectionSha256 = await seasonSha256Text(canonicalJson(core));
  return PersistentCareerProjectionSchema.parse({ ...core, projectionSha256 });
}

export async function validatePersistentCareerProjection(
  raw: unknown,
): Promise<PersistentCareerProjection> {
  const projection = PersistentCareerProjectionSchema.parse(raw);
  const { projectionSha256, ...coreRaw } = projection;
  const core = PersistentCareerProjectionCoreSchema.parse(coreRaw);
  const expectedHash = await seasonSha256Text(canonicalJson(core));
  assertPersistent(projectionSha256 === expectedHash, "CAREER_PROJECTION_HASH_MISMATCH");
  return projection;
}

function persistentStateCore(state: PersistentWorldState): PersistentWorldStateCore {
  const { stateSha256, ...core } = state;
  void stateSha256;
  return PersistentWorldStateCoreSchema.parse(core);
}

export async function sealPersistentWorldState(
  raw: PersistentWorldStateCore,
): Promise<PersistentWorldState> {
  const core = PersistentWorldStateCoreSchema.parse(raw);
  const stateSha256 = await seasonSha256Text(canonicalJson(core));
  const state = PersistentWorldStateSchema.parse({ ...core, stateSha256 });
  return validatePersistentWorldState(state);
}

export async function validatePersistentWorldState(raw: unknown): Promise<PersistentWorldState> {
  const state = PersistentWorldStateSchema.parse(raw);
  const expectedHash = await seasonSha256Text(canonicalJson(persistentStateCore(state)));
  assertPersistent(state.stateSha256 === expectedHash, "STATE_HASH_MISMATCH");

  if (state.worldIdentity.originKind === "COPIED_FROM_SINGLE_SEASON_V1") {
    assertPersistent(
      Boolean(state.worldIdentity.sourceSingleSeasonSaveId) &&
        Boolean(state.worldIdentity.sourceSingleSeasonFinalStateSha256),
      "COPY_ORIGIN_MISSING_SOURCE_METADATA",
    );
  } else {
    assertPersistent(
      state.worldIdentity.sourceSingleSeasonSaveId === null &&
        state.worldIdentity.sourceSingleSeasonFinalStateSha256 === null,
      "NEW_ORIGIN_UNEXPECTED_SOURCE_METADATA",
    );
  }

  const currentSeason = await validateT20SeasonState(state.currentSeason);
  assertPersistent(
    currentSeason.careerId === state.careerId &&
      currentSeason.controlledTeamId === state.controlledTeamId,
    "CURRENT_SEASON_CAREER_BINDING_MISMATCH",
  );
  assertPersistent(
    currentSeason.schedule.worldPackId === state.worldIdentity.worldPackId &&
      currentSeason.schedule.worldCanonicalSha256 === state.worldIdentity.worldCanonicalSha256,
    "CURRENT_SEASON_WORLD_IDENTITY_MISMATCH",
  );
  assertPersistent(
    state.currentSeasonNumber === state.completedSeasons.length + 1,
    "CURRENT_SEASON_NUMBER_MISMATCH",
  );
  assertPersistent(
    currentSeason.schedule.startDate.startsWith(
      `${String(state.currentCalendarYear).padStart(4, "0")}-`,
    ),
    "CURRENT_CALENDAR_YEAR_MISMATCH",
  );

  const validatedHistory = await Promise.all(
    state.completedSeasons.map((record) => validateCompletedSeasonRecord(record)),
  );

  const seenSeasonIds = new Set<string>();
  const seenGameIds = new Set<string>();
  const seenScheduleHashes = new Set<string>();
  const seenFixtureIds = new Set<string>();
  const seenMatchIds = new Set<string>();
  const seenCompletionSources = new Set<string>();
  const seenCompletionKeys = new Set<string>();

  for (let i = 0; i < validatedHistory.length; i += 1) {
    const record = validatedHistory[i]!;
    assertPersistent(record.seasonNumber === i + 1, `HISTORY_SEASON_NUMBER_GAP:${i}`);
    if (i > 0) {
      const prev = validatedHistory[i - 1]!;
      assertPersistent(
        record.calendarYear > prev.calendarYear && record.startDate > prev.endDate,
        `HISTORY_CALENDAR_REGRESSION:${record.seasonId}`,
      );
    }
    assertPersistent(
      !seenSeasonIds.has(record.seasonId) &&
        !seenGameIds.has(record.gameId) &&
        !seenScheduleHashes.has(record.scheduleSha256),
      `HISTORY_DUPLICATE_SEASON_IDENTITY:${record.seasonId}`,
    );
    seenSeasonIds.add(record.seasonId);
    seenGameIds.add(record.gameId);
    seenScheduleHashes.add(record.scheduleSha256);
    for (const key of record.seasonArchive.completionKeys) {
      assertPersistent(!seenCompletionKeys.has(key), `HISTORY_DUPLICATE_COMPLETION_KEY:${key}`);
      seenCompletionKeys.add(key);
    }
    for (const match of record.completedMatches) {
      assertPersistent(
        !seenFixtureIds.has(match.fixtureId) &&
          !seenMatchIds.has(match.matchId) &&
          !seenCompletionSources.has(match.sourceCompletionSha256),
        `HISTORY_DUPLICATE_MATCH:${match.fixtureId}`,
      );
      seenFixtureIds.add(match.fixtureId);
      seenMatchIds.add(match.matchId);
      seenCompletionSources.add(match.sourceCompletionSha256);
    }
  }

  if (validatedHistory.length > 0) {
    const lastCompleted = validatedHistory.at(-1)!;
    assertPersistent(
      state.currentCalendarYear > lastCompleted.calendarYear &&
        currentSeason.schedule.startDate > lastCompleted.endDate,
      "ACTIVE_SEASON_CALENDAR_REGRESSION",
    );
    assertPersistent(Boolean(state.lastRolloverReceipt), "MISSING_ROLLOVER_RECEIPT");
    const receipt = state.lastRolloverReceipt!;
    assertPersistent(
      receipt.fromSeasonNumber === lastCompleted.seasonNumber &&
        receipt.toSeasonNumber === state.currentSeasonNumber &&
        receipt.closedSeasonId === lastCompleted.seasonId &&
        receipt.closedSeasonStateSha256 === lastCompleted.finalSeasonStateSha256 &&
        receipt.closedSeasonRecordSha256 === lastCompleted.recordSha256 &&
        receipt.nextSeasonId === currentSeason.seasonId &&
        receipt.nextStartDate === currentSeason.schedule.startDate &&
        receipt.nextScheduleSha256 === currentSeason.schedule.scheduleSha256,
      "ROLLOVER_RECEIPT_MISMATCH",
    );
  } else {
    assertPersistent(state.lastRolloverReceipt === null, "UNEXPECTED_ROLLOVER_RECEIPT");
  }

  assertPersistent(
    !seenSeasonIds.has(currentSeason.seasonId) &&
      !seenGameIds.has(currentSeason.gameId) &&
      !seenScheduleHashes.has(currentSeason.schedule.scheduleSha256),
    "ACTIVE_SEASON_IDENTITY_COLLISION",
  );
  for (const cond of currentSeason.careerState.appliedMatchConditions) {
    assertPersistent(
      !seenCompletionKeys.has(cond.matchCompletionKey),
      `ACTIVE_DUPLICATE_COMPLETION_KEY:${cond.matchCompletionKey}`,
    );
  }
  for (const match of currentSeason.completedMatches) {
    assertPersistent(
      !seenFixtureIds.has(match.fixtureId) &&
        !seenMatchIds.has(match.matchId) &&
        !seenCompletionSources.has(match.sourceCompletionSha256),
      `ACTIVE_MATCH_COLLIDES_WITH_HISTORY:${match.fixtureId}`,
    );
  }

  const projection = await validatePersistentCareerProjection(state.careerProjection);
  assertPersistent(
    projection.worldId === state.worldIdentity.worldId &&
      projection.completedSeasonCount === validatedHistory.length &&
      projection.activeSeasonNumber === state.currentSeasonNumber &&
      projection.activeSeasonMatchesApplied === currentSeason.completedMatches.length &&
      projection.totalMatchesApplied ===
        validatedHistory.length * 56 + currentSeason.completedMatches.length &&
      projection.rollOfHonour.length === validatedHistory.length,
    "CAREER_PROJECTION_COUNTS_MISMATCH",
  );
  for (let i = 0; i < validatedHistory.length; i += 1) {
    const honour = projection.rollOfHonour[i]!;
    const record = validatedHistory[i]!;
    assertPersistent(
      honour.seasonNumber === record.seasonNumber &&
        honour.calendarYear === record.calendarYear &&
        honour.seasonId === record.seasonId &&
        honour.championTeamId === record.championTeamId &&
        honour.runnerUpTeamId === record.runnerUpTeamId &&
        honour.finalSeasonStateSha256 === record.finalSeasonStateSha256,
      `ROLL_OF_HONOUR_MISMATCH:${record.seasonId}`,
    );
  }

  return state;
}

export function collectPersistentWorldCompletions(
  state: PersistentWorldState,
): Map<string, T20SeasonMatchCompletion> {
  const byFixture = new Map<string, T20SeasonMatchCompletion>();
  for (const season of state.completedSeasons) {
    for (const completion of season.completedMatches) {
      byFixture.set(completion.fixtureId, completion);
    }
  }
  for (const completion of state.currentSeason.completedMatches) {
    byFixture.set(completion.fixtureId, completion);
  }
  return byFixture;
}

export async function validatePersistentWorldMatchEventArchiveSet(
  archivesRaw: readonly unknown[],
  worldStateRaw: unknown,
): Promise<{ archives: CompletedCareerMatchEventArchive[]; totalBytes: number }> {
  const worldState = await validatePersistentWorldState(worldStateRaw);
  const completionByFixture = collectPersistentWorldCompletions(worldState);
  const parsedList = await Promise.all(
    archivesRaw.map((item) => {
      const candidateFixtureId =
        typeof item === "object" &&
        item !== null &&
        typeof (item as { fixtureId?: unknown }).fixtureId === "string"
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
    assertPersistent(Boolean(completion), `MATCH_EVENT_ARCHIVE_UNKNOWN_FIXTURE:${parsed.fixtureId}`);
    assertPersistent(
      !seenFixtures.has(parsed.fixtureId),
      `MATCH_EVENT_ARCHIVE_DUPLICATE_FIXTURE:${parsed.fixtureId}`,
    );
    seenFixtures.add(parsed.fixtureId);
    totalBytes += parsed.byteLength;
    assertPersistent(
      totalBytes <= MAX_PERSISTENT_WORLD_EVENT_ARCHIVES_TOTAL_BYTES,
      "MATCH_EVENT_ARCHIVE_TOTAL_SIZE_EXCEEDED",
    );
    archives.push(parsed);
  }
  archives.sort(
    (a, b) =>
      a.seasonId.localeCompare(b.seasonId) ||
      a.fixtureOrdinal - b.fixtureOrdinal ||
      a.fixtureId.localeCompare(b.fixtureId),
  );
  return { archives, totalBytes };
}

function persistentSummaryFor(input: PersistentWorldDurableCommit): PersistentWorldSaveSummary {
  return PersistentWorldSaveSummarySchema.parse({
    saveId: input.saveId,
    kind: input.kind,
    title: input.title,
    worldId: input.state.worldIdentity.worldId,
    careerId: input.state.careerId,
    controlledTeamId: input.state.controlledTeamId,
    currentSeasonNumber: input.state.currentSeasonNumber,
    currentCalendarYear: input.state.currentCalendarYear,
    completedSeasonCount: input.state.completedSeasons.length,
    seasonId: input.state.currentSeason.seasonId,
    currentDate: input.state.currentSeason.careerState.currentDate,
    revision: input.state.revision,
    completedFixtures: input.state.currentSeason.completedMatches.length,
    phase: input.state.currentSeason.phase,
    stateSha256: input.state.stateSha256,
    updatedAt: input.updatedAt,
  });
}

export async function recoverPersistentWorldCheckpoint(
  rows: readonly SeasonCheckpoint[],
  currentSerial: number,
): Promise<{
  state: PersistentWorldState;
  checkpoint: SeasonCheckpoint;
  recovered: boolean;
  corruptedGenerations: number[];
}> {
  const corruptedGenerations: number[] = [];
  for (const row of [...rows].sort((a, b) => b.checkpointSerial - a.checkpointSerial)) {
    if ((await seasonSha256Text(row.payload)) !== row.sha256) {
      corruptedGenerations.push(row.generation);
      continue;
    }
    try {
      const state = await validatePersistentWorldState(JSON.parse(row.payload));
      return {
        state,
        checkpoint: row,
        recovered: row.checkpointSerial !== currentSerial,
        corruptedGenerations,
      };
    } catch {
      corruptedGenerations.push(row.generation);
    }
  }
  throw new Error("SEASON_SAVE_CORRUPT_NO_VALID_CHECKPOINT");
}

export async function inspectPersistentWorldCheckpoints(input: {
  saveId: string;
  title: string;
  currentSerial: number;
  currentGeneration: number;
  rows: readonly SeasonCheckpoint[];
}): Promise<SeasonCheckpointInspection> {
  const corruptedGenerations: number[] = [];
  const validGenerations: SeasonCheckpointGenerationOption[] = [];
  for (const row of [...input.rows].sort((a, b) => b.checkpointSerial - a.checkpointSerial)) {
    if ((await seasonSha256Text(row.payload)) !== row.sha256) {
      corruptedGenerations.push(row.generation);
      continue;
    }
    try {
      const state = await validatePersistentWorldState(JSON.parse(row.payload));
      validGenerations.push({
        generation: row.generation,
        checkpointSerial: row.checkpointSerial,
        revision: state.revision,
        completedFixtures: state.currentSeason.completedMatches.length,
        currentDate: state.currentSeason.careerState.currentDate,
        phase: state.currentSeason.phase,
        stateSha256: state.stateSha256,
        createdAt: row.createdAt,
      });
    } catch {
      corruptedGenerations.push(row.generation);
    }
  }
  return SeasonCheckpointInspectionSchema.parse({
    saveId: input.saveId,
    title: input.title,
    currentSerial: input.currentSerial,
    currentGeneration: input.currentGeneration,
    corruptedGenerations: corruptedGenerations.sort((a, b) => a - b),
    validGenerations,
  });
}

export class IndexedDbPersistentWorldRepository {
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

  async recordTypeOf(saveId: string): Promise<string | null> {
    const db = await this.open();
    const tx = db.transaction("games", "readonly");
    const row = (await req(tx.objectStore("games").get(saveId))) as
      | { recordType?: unknown }
      | undefined;
    await txDone(tx);
    return typeof row?.recordType === "string" ? row.recordType : null;
  }

  async acquireLease(saveId: string, ownerId: string, now: number): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const key = leaseKey(saveId);
    const current = (await req(store.get(key))) as LeaseRecord | undefined;
    if (current && current.ownerId !== ownerId && current.expiresAt > now) {
      const done = txDone(tx);
      tx.abort();
      try {
        await done;
      } catch {
        /* expected */
      }
      return false;
    }
    store.put({
      key,
      saveId,
      ownerId,
      expiresAt: now + SEASON_WRITER_LEASE_MS,
    } satisfies LeaseRecord);
    await txDone(tx);
    return true;
  }

  async releaseLease(saveId: string, ownerId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const key = leaseKey(saveId);
    const current = (await req(store.get(key))) as LeaseRecord | undefined;
    if (current?.ownerId === ownerId) store.delete(key);
    await txDone(tx);
  }

  async activeSaveId(): Promise<string | null> {
    const db = await this.open();
    const tx = db.transaction("settings", "readonly");
    const row = (await req(tx.objectStore("settings").get(activeKey()))) as
      | SettingRecord
      | undefined;
    await txDone(tx);
    return typeof row?.value === "string" ? row.value : null;
  }

  async clearActiveSaveId(saveId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const row = (await req(store.get(activeKey()))) as SettingRecord | undefined;
    if (row?.value === saveId) store.delete(activeKey());
    await txDone(tx);
  }

  async list(): Promise<PersistentWorldSaveSummary[]> {
    const db = await this.open();
    const tx = db.transaction("games", "readonly");
    const rows = (await req(tx.objectStore("games").getAll())) as Array<Record<string, unknown>>;
    await txDone(tx);
    return rows
      .filter((row) => row.recordType === PERSISTENT_WORLD_RECORD_TYPE)
      .map((row) =>
        PersistentWorldSaveSummarySchema.parse({
          saveId: row.saveId,
          kind: row.kind,
          title: row.title,
          worldId: row.worldId,
          careerId: row.careerId,
          controlledTeamId: row.controlledTeamId,
          currentSeasonNumber: row.currentSeasonNumber,
          currentCalendarYear: row.currentCalendarYear,
          completedSeasonCount: row.completedSeasonCount,
          seasonId: row.seasonId,
          currentDate: row.currentDate,
          revision: row.revision,
          completedFixtures: row.completedFixtures,
          phase: row.phase,
          stateSha256: row.stateSha256,
          updatedAt: row.updatedAt,
        }),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async commit(
    input: PersistentWorldDurableCommit,
  ): Promise<{ summary: PersistentWorldSaveSummary; idempotentReplay: boolean }> {
    const state = await validatePersistentWorldState(input.state);
    const command = input.command ? SeasonDurableCommandSchema.parse(input.command) : null;
    assertPersistent(
      input.updatedAt.length > 0 && !Number.isNaN(Date.parse(input.updatedAt)),
      "UPDATED_AT_INVALID",
    );
    const payload = canonicalJson(state);
    const snapshotHash = await seasonSha256Text(payload);
    const activeProjectionPayload = canonicalJson(state.currentSeason.projection);
    const activeProjectionHash = await seasonSha256Text(activeProjectionPayload);
    const careerProjectionPayload = canonicalJson(state.careerProjection);
    const careerProjectionHash = await seasonSha256Text(careerProjectionPayload);
    const worldCopy = input.worldCopy ? await validateStoredWorldCopy(input.worldCopy) : null;
    const worldCopyPayload = worldCopy ? canonicalJson(worldCopy) : null;
    const suppliedCopyHash = worldCopyPayload ? await seasonSha256Text(worldCopyPayload) : null;

    const preparedCompletedRecords = await Promise.all(
      state.completedSeasons.map(async (record) => {
        const recordPayload = canonicalJson(record);
        return {
          seasonId: record.seasonId,
          payload: recordPayload,
          sha256: await seasonSha256Text(recordPayload),
        };
      }),
    );

    const preparedArchives: Array<{
      fixtureId: string;
      payload: string;
      sha256: string;
      bytes: number;
    }> = [];
    if (input.matchEventArchives?.length) {
      const validatedSet = await validatePersistentWorldMatchEventArchiveSet(
        input.matchEventArchives,
        state,
      );
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
    const tx = db.transaction(
      ["games", "snapshots", "commands", "settings", "projections", "worldPacks"],
      "readwrite",
    );
    const games = tx.objectStore("games");
    const snapshots = tx.objectStore("snapshots");
    const commands = tx.objectStore("commands");
    const settings = tx.objectStore("settings");
    const projections = tx.objectStore("projections");

    const abortWith = async (code: string): Promise<never> => {
      const done = txDone(tx);
      tx.abort();
      try {
        await done;
      } catch {
        /* expected abort */
      }
      throw new Error(code);
    };

    const existing = (await req(games.get(input.saveId))) as
      | PersistentWorldGameRecord
      | undefined;
    if (existing && existing.recordType !== PERSISTENT_WORLD_RECORD_TYPE) {
      return abortWith("SEASON_SAVE_ID_CONFLICT");
    }
    if (
      existing &&
      ![
        PERSISTENT_WORLD_SAVE_SCHEMA_VERSION,
        PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION,
      ].includes(existing.schemaVersion)
    ) {
      return abortWith("SEASON_SAVE_SCHEMA_UNSUPPORTED");
    }
    if (existing && suppliedCopyHash && suppliedCopyHash !== existing.worldCopySha256) {
      return abortWith("SEASON_WORLD_COPY_IMMUTABLE");
    }
    if (
      existing?.schemaVersion === PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION &&
      !existing.worldCopySha256
    ) {
      return abortWith("SEASON_WORLD_COPY_MISSING");
    }
    if (
      existing?.schemaVersion === PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION &&
      !suppliedCopyHash
    ) {
      return abortWith("SEASON_WORLD_COPY_REQUIRED");
    }
    if (
      existing?.schemaVersion === PERSISTENT_WORLD_SAVE_SCHEMA_VERSION &&
      existing.worldCopySha256
    ) {
      return abortWith("SEASON_WORLD_COPY_VERSION_MISMATCH");
    }

    const copyNow = input.copySource?.now() ?? input.now;
    const lease = (await req(settings.get(leaseKey(input.saveId)))) as LeaseRecord | undefined;
    if (!lease || lease.ownerId !== input.ownerId || lease.expiresAt <= copyNow) {
      return abortWith("SEASON_SAVE_READ_ONLY");
    }

    if (command) {
      const prior = (await req(commands.get([input.saveId, command.commandId]))) as
        | CommandRecord
        | undefined;
      if (prior) {
        if (prior.requestCanonical !== command.requestCanonical) {
          return abortWith("SEASON_SAVE_DUPLICATE_COMMAND_CONFLICT");
        }
        if (input.idempotentCommandReplay && existing) {
          await txDone(tx);
          return {
            summary: PersistentWorldSaveSummarySchema.parse({
              saveId: existing.saveId,
              kind: existing.kind,
              title: existing.title,
              worldId: existing.worldId,
              careerId: existing.careerId,
              controlledTeamId: existing.controlledTeamId,
              currentSeasonNumber: existing.currentSeasonNumber,
              currentCalendarYear: existing.currentCalendarYear,
              completedSeasonCount: existing.completedSeasonCount,
              seasonId: existing.seasonId,
              currentDate: existing.currentDate,
              revision: existing.revision,
              completedFixtures: existing.completedFixtures,
              phase: existing.phase,
              stateSha256: existing.stateSha256,
              updatedAt: existing.updatedAt,
            }),
            idempotentReplay: true,
          };
        }
        return abortWith("SEASON_SAVE_DUPLICATE_COMMAND_ALREADY_COMMITTED");
      }
      assertPersistent(command.committedRevision === state.revision, "COMMAND_REVISION_MISMATCH");
    }

    if (input.copySource) {
      const source = (await req(games.get(input.copySource.saveId))) as
        | SourceSeasonGameRecord
        | undefined;
      const sourceLease = (await req(settings.get(leaseKey(input.copySource.saveId)))) as
        | LeaseRecord
        | undefined;
      const allowedSchemas: readonly string[] =
        input.copySource.sourceRecordType === SEASON_RECORD_TYPE
          ? [SEASON_SAVE_SCHEMA_VERSION, SEASON_PRESENTATION_SAVE_SCHEMA_VERSION]
          : [PERSISTENT_WORLD_SAVE_SCHEMA_VERSION, PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION];
      if (
        existing ||
        input.copySource.saveId === input.saveId ||
        !source ||
        source.recordType !== input.copySource.sourceRecordType ||
        !allowedSchemas.includes(source.schemaVersion) ||
        source.revision !== input.copySource.revision ||
        source.stateSha256 !== input.copySource.stateSha256 ||
        (source.worldCopySha256 ?? null) !== suppliedCopyHash ||
        !sourceLease ||
        sourceLease.ownerId !== input.ownerId ||
        sourceLease.expiresAt <= copyNow
      ) {
        return abortWith("SEASON_COPY_SOURCE_CHANGED_OR_LOCKED");
      }
      if (
        input.copySource.sourceRecordType === PERSISTENT_WORLD_RECORD_TYPE &&
        state.stateSha256 !== input.copySource.stateSha256
      ) {
        return abortWith("SEASON_COPY_SOURCE_CHANGED_OR_LOCKED");
      }
      if (
        input.copySource.sourceRecordType === SEASON_RECORD_TYPE &&
        (state.worldIdentity.originKind !== "COPIED_FROM_SINGLE_SEASON_V1" ||
          state.worldIdentity.sourceSingleSeasonSaveId !== input.copySource.saveId ||
          state.worldIdentity.sourceSingleSeasonFinalStateSha256 !== input.copySource.stateSha256 ||
          state.completedSeasons[0]?.finalSeasonStateSha256 !== input.copySource.stateSha256)
      ) {
        return abortWith("SEASON_COPY_SOURCE_CHANGED_OR_LOCKED");
      }
    }

    const durableRevision = existing?.revision ?? 0;
    if (input.expectedRevision !== null && durableRevision !== input.expectedRevision) {
      return abortWith(`SEASON_SAVE_STALE_REVISION:${input.expectedRevision}:${durableRevision}`);
    }

    const serial = (existing?.checkpointSerial ?? -1) + 1;
    const generation = serial % 3;
    snapshots.put({
      saveId: input.saveId,
      generation,
      checkpointSerial: serial,
      revision: state.revision,
      payload,
      sha256: snapshotHash,
      createdAt: input.updatedAt,
    } satisfies SeasonCheckpoint);
    if (command) commands.put({ saveId: input.saveId, ...command } satisfies CommandRecord);

    projections.put({
      saveId: input.saveId,
      scope: "T20_SEASON",
      key: state.currentSeason.seasonId,
      payload: activeProjectionPayload,
      sha256: activeProjectionHash,
    } satisfies ProjectionRecord);
    projections.put({
      saveId: input.saveId,
      scope: PERSISTENT_CAREER_PROJECTION_SCOPE,
      key: state.worldIdentity.worldId,
      payload: careerProjectionPayload,
      sha256: careerProjectionHash,
    } satisfies ProjectionRecord);
    for (const rec of preparedCompletedRecords) {
      projections.put({
        saveId: input.saveId,
        scope: COMPLETED_SEASON_RECORD_SCOPE,
        key: rec.seasonId,
        payload: rec.payload,
        sha256: rec.sha256,
      } satisfies ProjectionRecord);
    }

    if (input.copySource || preparedArchives.length > 0) {
      const allProjections = (await req(projections.getAll())) as ProjectionRecord[];
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
      const enc = new TextEncoder();
      let totalArchiveBytes = 0;
      for (const row of mergedByFixture.values()) {
        totalArchiveBytes += enc.encode(row.payload).byteLength;
      }
      if (totalArchiveBytes > MAX_PERSISTENT_WORLD_EVENT_ARCHIVES_TOTAL_BYTES) {
        return abortWith("LC_PERSISTENT_WORLD_MATCH_EVENT_ARCHIVE_TOTAL_SIZE_EXCEEDED");
      }
      for (const row of mergedByFixture.values()) projections.put(row);
    }

    const summary = persistentSummaryFor({ ...input, state });
    const copyHash = existing?.worldCopySha256 ?? suppliedCopyHash;
    if (worldCopyPayload && suppliedCopyHash) {
      const packs = tx.objectStore("worldPacks");
      const previous = (await req(packs.get(suppliedCopyHash))) as
        | { hash: string; payload: string }
        | undefined;
      if (!previous && existing) return abortWith("SEASON_WORLD_COPY_MISSING");
      if (previous && previous.payload !== worldCopyPayload) {
        return abortWith("SEASON_WORLD_COPY_CONFLICT");
      }
      if (!previous) packs.add({ hash: suppliedCopyHash, payload: worldCopyPayload });
    }

    games.put({
      ...summary,
      recordType: PERSISTENT_WORLD_RECORD_TYPE,
      schemaVersion: copyHash
        ? PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION
        : PERSISTENT_WORLD_SAVE_SCHEMA_VERSION,
      ...(copyHash ? { worldCopySha256: copyHash } : {}),
      checkpointSerial: serial,
      checkpointGeneration: generation,
    } satisfies PersistentWorldGameRecord);

    if (input.setActive !== false) {
      settings.put({ key: activeKey(), value: input.saveId } satisfies SettingRecord);
    }
    settings.put({ ...lease, expiresAt: input.now + SEASON_WRITER_LEASE_MS } satisfies LeaseRecord);
    if (input.testAbortAfterWrites) {
      return abortWith("SEASON_SAVE_INJECTED_ABORT");
    }
    await txDone(tx);
    return { summary, idempotentReplay: false };
  }

  async load(saveId: string): Promise<PersistentWorldLoadResult | null> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "worldPacks"], "readonly");
    const game = (await req(tx.objectStore("games").get(saveId))) as
      | PersistentWorldGameRecord
      | undefined;
    if (!game) {
      await txDone(tx);
      return null;
    }
    if (
      game.recordType !== PERSISTENT_WORLD_RECORD_TYPE ||
      ![
        PERSISTENT_WORLD_SAVE_SCHEMA_VERSION,
        PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION,
      ].includes(game.schemaVersion)
    ) {
      await txDone(tx);
      throw new Error("SEASON_SAVE_SCHEMA_UNSUPPORTED");
    }
    if (game.schemaVersion === PERSISTENT_WORLD_SAVE_SCHEMA_VERSION && game.worldCopySha256) {
      await txDone(tx);
      throw new Error("SEASON_WORLD_COPY_VERSION_MISMATCH");
    }
    const rows = (await req(
      tx.objectStore("snapshots").index("saveId").getAll(saveId),
    )) as SeasonCheckpoint[];
    const worldRow =
      game.schemaVersion === PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION &&
      game.worldCopySha256
        ? ((await req(tx.objectStore("worldPacks").get(game.worldCopySha256))) as
            | { hash: string; payload: string }
            | undefined)
        : undefined;
    await txDone(tx);

    let worldCopy: NewGameWorldCopy | null = null;
    if (game.schemaVersion === PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION) {
      if (
        !worldRow ||
        !game.worldCopySha256 ||
        (await seasonSha256Text(worldRow.payload)) !== game.worldCopySha256
      ) {
        throw new Error("SEASON_WORLD_COPY_MISSING_OR_DAMAGED");
      }
      worldCopy = await validateStoredWorldCopy(JSON.parse(worldRow.payload));
    }

    const recoveredCheckpoint = await recoverPersistentWorldCheckpoint(rows, game.checkpointSerial);
    const { state, checkpoint, recovered, corruptedGenerations } = recoveredCheckpoint;
    const summary = PersistentWorldSaveSummarySchema.parse({
      saveId: game.saveId,
      kind: game.kind,
      title: game.title,
      worldId: state.worldIdentity.worldId,
      careerId: state.careerId,
      controlledTeamId: state.controlledTeamId,
      currentSeasonNumber: state.currentSeasonNumber,
      currentCalendarYear: state.currentCalendarYear,
      completedSeasonCount: state.completedSeasons.length,
      seasonId: state.currentSeason.seasonId,
      currentDate: state.currentSeason.careerState.currentDate,
      revision: state.revision,
      completedFixtures: state.currentSeason.completedMatches.length,
      phase: state.currentSeason.phase,
      stateSha256: state.stateSha256,
      updatedAt: recovered ? checkpoint.createdAt : game.updatedAt,
    });
    return {
      summary,
      state,
      recovered,
      recoveredFromGeneration: recovered ? checkpoint.generation : null,
      corruptedGenerations,
      worldCopy,
    };
  }

  async inspectCheckpoints(saveId: string): Promise<SeasonCheckpointInspection> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots"], "readonly");
    const game = (await req(tx.objectStore("games").get(saveId))) as
      | PersistentWorldGameRecord
      | undefined;
    if (!game || game.recordType !== PERSISTENT_WORLD_RECORD_TYPE) {
      await txDone(tx);
      throw new Error("SEASON_SAVE_NOT_FOUND");
    }
    const rows = (await req(
      tx.objectStore("snapshots").index("saveId").getAll(saveId),
    )) as SeasonCheckpoint[];
    await txDone(tx);
    return inspectPersistentWorldCheckpoints({
      saveId,
      title: game.title,
      currentSerial: game.checkpointSerial,
      currentGeneration: game.checkpointGeneration,
      rows,
    });
  }

  async loadGeneration(saveId: string, generation: number): Promise<PersistentWorldLoadResult> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "worldPacks"], "readonly");
    const game = (await req(tx.objectStore("games").get(saveId))) as
      | PersistentWorldGameRecord
      | undefined;
    if (!game || game.recordType !== PERSISTENT_WORLD_RECORD_TYPE) {
      await txDone(tx);
      throw new Error("SEASON_SAVE_NOT_FOUND");
    }
    const row = (await req(
      tx.objectStore("snapshots").get([saveId, generation]),
    )) as SeasonCheckpoint | undefined;
    const worldRow =
      game.schemaVersion === PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION &&
      game.worldCopySha256
        ? ((await req(tx.objectStore("worldPacks").get(game.worldCopySha256))) as
            | { hash: string; payload: string }
            | undefined)
        : undefined;
    await txDone(tx);
    if (!row) throw new Error("SEASON_CHECKPOINT_NOT_FOUND");
    let worldCopy: NewGameWorldCopy | null = null;
    if (game.schemaVersion === PERSISTENT_WORLD_PRESENTATION_SAVE_SCHEMA_VERSION) {
      if (
        !worldRow ||
        !game.worldCopySha256 ||
        (await seasonSha256Text(worldRow.payload)) !== game.worldCopySha256
      ) {
        throw new Error("SEASON_WORLD_COPY_MISSING_OR_DAMAGED");
      }
      worldCopy = await validateStoredWorldCopy(JSON.parse(worldRow.payload));
    }
    const recoveredCheckpoint = await recoverPersistentWorldCheckpoint([row], row.checkpointSerial);
    const { state, checkpoint } = recoveredCheckpoint;
    const summary = PersistentWorldSaveSummarySchema.parse({
      saveId: game.saveId,
      kind: game.kind,
      title: game.title,
      worldId: state.worldIdentity.worldId,
      careerId: state.careerId,
      controlledTeamId: state.controlledTeamId,
      currentSeasonNumber: state.currentSeasonNumber,
      currentCalendarYear: state.currentCalendarYear,
      completedSeasonCount: state.completedSeasons.length,
      seasonId: state.currentSeason.seasonId,
      currentDate: state.currentSeason.careerState.currentDate,
      revision: state.revision,
      completedFixtures: state.currentSeason.completedMatches.length,
      phase: state.currentSeason.phase,
      stateSha256: state.stateSha256,
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

  async loadMatchEventArchives(
    saveId: string,
    worldState?: PersistentWorldState,
  ): Promise<{
    archives: CompletedCareerMatchEventArchive[];
    damagedFixtureIds: string[];
    totalBytes: number;
  }> {
    const db = await this.open();
    const tx = db.transaction("projections", "readonly");
    const allRows = (await req(tx.objectStore("projections").getAll())) as ProjectionRecord[];
    await txDone(tx);
    const rows = allRows.filter(
      (row) => row.saveId === saveId && row.scope === CAREER_MATCH_EVENTS_SCOPE,
    );
    const completionByFixture = worldState
      ? collectPersistentWorldCompletions(worldState)
      : new Map<string, T20SeasonMatchCompletion>();
    const archives: CompletedCareerMatchEventArchive[] = [];
    const damagedFixtureIds: string[] = [];
    const enc = new TextEncoder();
    let totalBytes = 0;
    let validatedBytes = 0;
    const seenFixtures = new Set<string>();
    for (const row of rows) {
      totalBytes += enc.encode(row.payload).byteLength;
      if ((await seasonSha256Text(row.payload)) !== row.sha256) {
        damagedFixtureIds.push(row.key);
        continue;
      }
      try {
        const completion = worldState ? completionByFixture.get(row.key) : undefined;
        if (worldState && !completion) throw new Error(`UNKNOWN_FIXTURE:${row.key}`);
        const parsed = await validateCompletedCareerMatchEventArchive(
          JSON.parse(row.payload),
          completion,
        );
        if (seenFixtures.has(parsed.fixtureId)) {
          throw new Error(`DUPLICATE_FIXTURE:${parsed.fixtureId}`);
        }
        seenFixtures.add(parsed.fixtureId);
        validatedBytes += parsed.byteLength;
        assertPersistent(
          validatedBytes <= MAX_PERSISTENT_WORLD_EVENT_ARCHIVES_TOTAL_BYTES,
          "MATCH_EVENT_ARCHIVE_TOTAL_SIZE_EXCEEDED",
        );
        archives.push(parsed);
      } catch (err) {
        if (err instanceof Error && err.message.includes("TOTAL_SIZE_EXCEEDED")) throw err;
        damagedFixtureIds.push(row.key);
      }
    }
    archives.sort(
      (a, b) =>
        a.seasonId.localeCompare(b.seasonId) ||
        a.fixtureOrdinal - b.fixtureOrdinal ||
        a.fixtureId.localeCompare(b.fixtureId),
    );
    return { archives, damagedFixtureIds: damagedFixtureIds.sort(), totalBytes };
  }
}
