import {
  canonicalJson,
  SeasonDurableCommandSchema,
  SeasonSaveSummarySchema,
  T20SeasonStateCoreSchema,
  T20SeasonStateSchema,
  SeasonArchiveCoreSchema,
  SeasonArchiveSchema,
  NewGameWorldCopySchema,
  RosterSeasonStateSchema, StagedRosterPackSchema,
  type RosterSeasonState, type StagedRosterPack,
  type SeasonDurableCommand,
  type SeasonSaveSummary,
  type T20SeasonState,
  type T20SeasonStateCore,
  type SeasonArchive,
  type NewGameWorldCopy,
} from "@lcxxvi/contracts";

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
  testAbortAfterWrites?: boolean;
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
    const lease = await req(settings.get(leaseKey(input.saveId))) as LeaseRecord | undefined;
    if (!lease || lease.ownerId !== input.ownerId || lease.expiresAt <= input.now) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SEASON_SAVE_READ_ONLY"); }
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
    ownerId: string; now: number; updatedAt: string; setActive?: boolean; testAbortAfterWrites?: boolean }): Promise<SeasonSaveSummary> {
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
    const lease = await req(settings.get(leaseKey(input.saveId))) as LeaseRecord | undefined;
    if (!lease || lease.ownerId !== input.ownerId || lease.expiresAt <= input.now) { const done = txDone(tx); tx.abort(); try { await done; } catch { /* expected abort */ } throw new Error("ROSTER_SEASON_READ_ONLY"); }
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
}
