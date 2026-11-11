import {
  canonicalJson,
  appendDelegationChange,
  replayDelegationJournal,
  type DelegationJournal,
  StagedRosterPackSchema,
  type StagedRosterPack,
  type ID,
  type MatchState,
  type EventEnvelope,
  type CommandReceipt,
  type NewGameWorldCopy,
} from "@lcxxvi/contracts";
import { validateStoredWorldCopy } from "./season.js";

/** Legacy generic persistence contract retained for compatibility with earlier passes. */
export interface CommitBatch {
  readonly gameId: ID;
  readonly expectedRevision: number;
  readonly snapshot: MatchState;
  readonly events: readonly EventEnvelope[];
  readonly receipt: CommandReceipt;
}
export interface MatchRepository {
  load(gameId: ID): Promise<MatchState | null>;
  receipt(gameId: ID, commandId: ID): Promise<CommandReceipt | null>;
  commit(batch: CommitBatch): Promise<void>;
}
export interface SchemaMigration {
  readonly from: string;
  readonly to: string;
  migrate(source: unknown): unknown;
}

export const SAVE_SCHEMA_VERSION = "LC_SAVE_V1" as const;
export const PRESENTATION_SAVE_SCHEMA_VERSION = "LC_SAVE_V2_PRESENTATION" as const;
export const ROSTER_SAVE_SCHEMA_VERSION = "LC_SAVE_V3_ROSTER" as const;
export const DELEGATION_SAVE_SCHEMA_VERSION = "LC_SAVE_V4_DELEGATION" as const;
export const DB_NAME = "lord-cricket-xxvi";
export const DB_VERSION = 1;
export const WRITER_LEASE_MS = 12_000;

export type SaveKind = "AUTO" | "MANUAL" | "IMPORTED";
export type SaveSummary = {
  saveId: string;
  kind: SaveKind;
  title: string;
  matchGameId: string;
  matchId: string;
  teams: [string, string];
  ground: string;
  phase: string;
  revision: number;
  eventCount: number;
  lastEventHash: string;
  updatedAt: string;
  completed: boolean;
};

export type DurableCommand = {
  commandId: string;
  requestCanonical: string;
  responseJson: string;
  committedRevision: number;
};

export type DurableCommit = {
  saveId: string;
  kind: SaveKind;
  title: string;
  expectedRevision: number | null;
  session: unknown;
  revision: number;
  events: readonly { sequence: number; [key: string]: unknown }[];
  command: DurableCommand | null;
  historyCommands?: readonly DurableCommand[];
  delegationJournal?: DelegationJournal;
  setActive?: boolean;
  worldCopy?: NewGameWorldCopy | null;
  rosterPack?: StagedRosterPack | null;
  metadata: Omit<
    SaveSummary,
    | "saveId"
    | "kind"
    | "title"
    | "revision"
    | "eventCount"
    | "lastEventHash"
    | "updatedAt"
  >;
  ownerId: string;
  now: number;
  updatedAt: string;
  /** Verification-only fault injection. Production callers must omit. */
  testAbortAfterWrites?: boolean;
};

export type LoadResult = {
  summary: SaveSummary;
  session: unknown;
  recovered: boolean;
  recoveredFromGeneration: number | null;
  worldCopy?: NewGameWorldCopy | null;
  rosterPack?: StagedRosterPack | null;
  delegationJournal?: DelegationJournal;
};

type BaseSaveSchema = typeof SAVE_SCHEMA_VERSION | typeof PRESENTATION_SAVE_SCHEMA_VERSION | typeof ROSTER_SAVE_SCHEMA_VERSION;
type GameRecord = SaveSummary & {
  schemaVersion: BaseSaveSchema | typeof DELEGATION_SAVE_SCHEMA_VERSION;
  baseSchemaVersion?: BaseSaveSchema;
  worldCopySha256?: string;
  rosterPackSha256?: string;
  checkpointSerial: number;
  checkpointGeneration: number;
};
function baseSaveSchema(game: GameRecord): BaseSaveSchema {
  const base = game.schemaVersion === DELEGATION_SAVE_SCHEMA_VERSION ? game.baseSchemaVersion : game.schemaVersion;
  if (![SAVE_SCHEMA_VERSION, PRESENTATION_SAVE_SCHEMA_VERSION, ROSTER_SAVE_SCHEMA_VERSION].includes(base as BaseSaveSchema)) throw new Error("SAVE_SCHEMA_UNSUPPORTED");
  if (game.schemaVersion !== DELEGATION_SAVE_SCHEMA_VERSION && game.baseSchemaVersion !== undefined) throw new Error("SAVE_SCHEMA_UNSUPPORTED");
  return base as BaseSaveSchema;
}
type SnapshotRecord = {
  saveId: string;
  generation: number;
  checkpointSerial: number;
  revision: number;
  payload: string;
  sha256: string;
  createdAt: string;
  delegationTracked?: boolean;
};
type EventRecord = {
  saveId: string;
  sequence: number;
  payload: string;
  sha256: string;
};
type CommandRecord = DurableCommand & { saveId: string };
type SettingRecord = { key: string; value: unknown };
type LeaseRecord = {
  key: string;
  saveId: string;
  ownerId: string;
  expiresAt: number;
};

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}
function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256Bytes(
  bytes: Readonly<Uint8Array>,
): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return bytesHex(new Uint8Array(digest));
}
export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}
function settingKey(key: string) {
  return key;
}
function leaseKey(saveId: string) {
  return `lease:${saveId}`;
}
function delegationKey(saveId: string) {
  return `delegation:${saveId}`;
}
function delegationCheckpointKey(saveId: string, generation: number) {
  return `delegation-checkpoint:${saveId}:${generation}`;
}
async function delegationRecord(saveId: string, journal: DelegationJournal) {
  const content = { saveId, journal };
  return { ...content, sha256: await sha256Text(canonicalJson(content)) };
}
async function readDelegationRecord(value: unknown, saveId: string): Promise<DelegationJournal> {
  const row = objectRecord(value);
  const journal = replayDelegationJournal(row.journal);
  const expected = await delegationRecord(saveId, journal);
  if (row.saveId !== saveId || row.sha256 !== expected.sha256) throw new Error("DELEGATION_CHECKPOINT_DAMAGED");
  return journal;
}
function summaryFromGame(row: GameRecord): SaveSummary {
  return {
    saveId: row.saveId,
    kind: row.kind,
    title: row.title,
    matchGameId: row.matchGameId,
    matchId: row.matchId,
    teams: row.teams,
    ground: row.ground,
    phase: row.phase,
    revision: row.revision,
    eventCount: row.eventCount,
    lastEventHash: row.lastEventHash,
    updatedAt: row.updatedAt,
    completed: row.completed,
  };
}
function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recoveredSummary(
  game: GameRecord,
  session: unknown,
  snapshot: SnapshotRecord,
): SaveSummary {
  const record = objectRecord(session);
  const setup = objectRecord(record.setup);
  const core = objectRecord(record.core);
  const ground = objectRecord(setup.ground);
  const teams = Array.isArray(setup.teams) ? setup.teams.map(objectRecord) : [];
  const events = Array.isArray(record.events) ? record.events : [];
  return {
    ...summaryFromGame(game),
    matchGameId: String(setup.gameId ?? game.matchGameId),
    matchId: String(setup.matchId ?? game.matchId),
    teams: [
      String(teams[0]?.name ?? game.teams[0]),
      String(teams[1]?.name ?? game.teams[1]),
    ],
    ground: String(ground.name ?? game.ground),
    phase: String(core.phase ?? game.phase),
    revision: Number(record.revision ?? snapshot.revision),
    eventCount: events.length,
    lastEventHash: String(record.lastEventHash ?? ""),
    updatedAt: snapshot.createdAt,
    completed: core.phase === "COMPLETE",
  };
}

export class IndexedDbSaveRepository {
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
        const snapshots = db.createObjectStore("snapshots", {
          keyPath: ["saveId", "generation"],
        });
        snapshots.createIndex("saveId", "saveId");
        const events = db.createObjectStore("events", {
          keyPath: ["saveId", "sequence"],
        });
        events.createIndex("saveId", "saveId");
        const commands = db.createObjectStore("commands", {
          keyPath: ["saveId", "commandId"],
        });
        commands.createIndex("saveId", "saveId");
        db.createObjectStore("worldPacks", { keyPath: "hash" });
        db.createObjectStore("modelPacks", { keyPath: "hash" });
        db.createObjectStore("rulePacks", { keyPath: "hash" });
        db.createObjectStore("projections", {
          keyPath: ["saveId", "scope", "key"],
        });
        db.createObjectStore("settings", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open IndexedDB"));
      request.onblocked = () =>
        reject(new Error("IndexedDB upgrade blocked by another tab"));
    });
    return this.dbPromise;
  }

  async list(): Promise<SaveSummary[]> {
    const db = await this.open();
    const tx = db.transaction("games", "readonly");
    const rows = (await req(tx.objectStore("games").getAll())) as GameRecord[];
    await txDone(tx);
    return rows
      .filter((row) => {
        const recordType = (row as GameRecord & { recordType?: string }).recordType;
        // Career rows (standard and imported-roster) share the games store but are not match saves.
        return recordType !== "SEASON" && recordType !== "ROSTER_SEASON";
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summaryFromGame);
  }

  async activeSaveId(): Promise<string | null> {
    const db = await this.open();
    const tx = db.transaction("settings", "readonly");
    const row = (await req(
      tx.objectStore("settings").get(settingKey("activeSaveId")),
    )) as SettingRecord | undefined;
    await txDone(tx);
    return typeof row?.value === "string" ? row.value : null;
  }

  async setActiveSaveId(saveId: string | null): Promise<void> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    if (saveId === null) store.delete(settingKey("activeSaveId"));
    else
      store.put({
        key: settingKey("activeSaveId"),
        value: saveId,
      } satisfies SettingRecord);
    await txDone(tx);
  }

  async acquireLease(
    saveId: string,
    ownerId: string,
    now: number,
  ): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const key = leaseKey(saveId);
    const current = (await req(store.get(key))) as LeaseRecord | undefined;
    if (current && current.ownerId !== ownerId && current.expiresAt > now) {
      tx.abort();
      try {
        await txDone(tx);
      } catch {
        /* expected abort */
      }
      return false;
    }
    store.put({
      key,
      saveId,
      ownerId,
      expiresAt: now + WRITER_LEASE_MS,
    } satisfies LeaseRecord);
    await txDone(tx);
    return true;
  }

  async renewLease(
    saveId: string,
    ownerId: string,
    now: number,
  ): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const key = leaseKey(saveId);
    const current = (await req(store.get(key))) as LeaseRecord | undefined;
    if (!current || current.ownerId !== ownerId || current.expiresAt <= now) {
      tx.abort();
      try {
        await txDone(tx);
      } catch {
        /* expected abort */
      }
      return false;
    }
    store.put({ ...current, expiresAt: now + WRITER_LEASE_MS });
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

  async loadDelegationJournal(saveId: string): Promise<DelegationJournal> {
    const db = await this.open();
    const tx = db.transaction(["games", "settings"], "readonly");
    const game = await req(tx.objectStore("games").get(saveId)) as GameRecord | undefined;
    const row = await req(tx.objectStore("settings").get(delegationKey(saveId))) as SettingRecord | undefined;
    await txDone(tx);
    if (!game) throw new Error("SAVE_NOT_FOUND");
    if (game.schemaVersion === DELEGATION_SAVE_SCHEMA_VERSION && !row) throw new Error("DELEGATION_ACTIVE_MISSING");
    const journal = row ? await readDelegationRecord(row.value, saveId) : { version: "LC_DELEGATION_JOURNAL_V1" as const, changes: [] };
    if (journal.changes.some(change => change.matchRevision > game.revision)) throw new Error("DELEGATION_AHEAD_OF_SAVE");
    return journal;
  }

  async appendDelegation(saveId: string, ownerId: string, now: number, input: unknown): Promise<DelegationJournal> {
    const previous = await this.loadDelegationJournal(saveId);
    const expectedRecord = previous.changes.length ? await delegationRecord(saveId, previous) : null;
    const journal = appendDelegationChange(previous, input);
    const nextRecord = await delegationRecord(saveId, journal);
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "settings"], "readwrite");
    try {
      const settings = tx.objectStore("settings");
      const game = await req(tx.objectStore("games").get(saveId)) as GameRecord | undefined;
      const lease = await req(settings.get(leaseKey(saveId))) as LeaseRecord | undefined;
      const row = await req(settings.get(delegationKey(saveId))) as SettingRecord | undefined;
      if (!game) throw new Error("SAVE_NOT_FOUND");
      if (!lease || lease.ownerId !== ownerId || lease.expiresAt <= now) throw new Error("SAVE_READ_ONLY");
      const baseSchemaVersion = baseSaveSchema(game);
      if (canonicalJson(row?.value ?? null) !== canonicalJson(expectedRecord)) throw new Error("DELEGATION_STALE_REVISION");
      if (journal.changes.at(-1)?.matchRevision !== game.revision) throw new Error("DELEGATION_STALE_MATCH");
      const snapshots = tx.objectStore("snapshots");
      const snapshot = await req(snapshots.get([saveId, game.checkpointGeneration])) as SnapshotRecord | undefined;
      if (!snapshot || snapshot.checkpointSerial !== game.checkpointSerial) throw new Error("DELEGATION_CHECKPOINT_MISSING");
      settings.put({ key: delegationKey(saveId), value: nextRecord } satisfies SettingRecord);
      settings.put({ key: delegationCheckpointKey(saveId, snapshot.generation), value: { checkpointSerial: snapshot.checkpointSerial, record: nextRecord } } satisfies SettingRecord);
      snapshots.put({ ...snapshot, delegationTracked: true } satisfies SnapshotRecord);
      tx.objectStore("games").put({ ...game, schemaVersion: DELEGATION_SAVE_SCHEMA_VERSION, baseSchemaVersion } satisfies GameRecord);
      await txDone(tx);
      return journal;
    } catch (error) {
      try { tx.abort(); } catch { /* transaction already closed */ }
      throw error;
    }
  }

  async historyCommands(
    saveId: string,
    maxRevision = Number.MAX_SAFE_INTEGER,
  ): Promise<DurableCommand[]> {
    const db = await this.open();
    const tx = db.transaction("commands", "readonly");
    const rows = (await req(
      tx.objectStore("commands").index("saveId").getAll(saveId),
    )) as CommandRecord[];
    await txDone(tx);
    return rows
      .filter((row) => row.committedRevision <= maxRevision)
      .sort(
        (a, b) =>
          a.committedRevision - b.committedRevision ||
          a.commandId.localeCompare(b.commandId),
      )
      .map(
        ({ commandId, requestCanonical, responseJson, committedRevision }) => ({
          commandId,
          requestCanonical,
          responseJson,
          committedRevision,
        }),
      );
  }

  async command(
    saveId: string,
    commandId: string,
  ): Promise<DurableCommand | null> {
    const db = await this.open();
    const tx = db.transaction("commands", "readonly");
    const row = (await req(
      tx.objectStore("commands").get([saveId, commandId]),
    )) as CommandRecord | undefined;
    await txDone(tx);
    if (!row) return null;
    return {
      commandId: row.commandId,
      requestCanonical: row.requestCanonical,
      responseJson: row.responseJson,
      committedRevision: row.committedRevision,
    };
  }

  async commit(input: DurableCommit): Promise<SaveSummary> {
    const db = await this.open();
    const now = input.now;
    const delegation = input.delegationJournal ? replayDelegationJournal(input.delegationJournal) : null;
    if (delegation?.changes.some(change => change.matchRevision > input.revision)) throw new Error("DELEGATION_AHEAD_OF_SAVE");
    const existingJournal = input.expectedRevision !== null ? await this.loadDelegationJournal(input.saveId) : null;
    const expectedDelegation = existingJournal?.changes.length ? await delegationRecord(input.saveId, existingJournal) : null;
    const suppliedDelegation = delegation?.changes.length ? await delegationRecord(input.saveId, delegation) : null;
    const payload = canonicalJson(input.session);
    const snapshotHash = await sha256Text(payload);
    const worldCopy = input.worldCopy ? await validateStoredWorldCopy(input.worldCopy) : null;
    const worldCopyPayload = worldCopy ? canonicalJson(worldCopy) : null;
    const suppliedCopyHash = worldCopyPayload ? await sha256Text(worldCopyPayload) : null;
    const rosterPack = input.rosterPack ? StagedRosterPackSchema.parse(input.rosterPack) : null;
    if (rosterPack && worldCopy) throw new Error("SAVE_WORLD_TYPE_CONFLICT");
    if (["LC_T20_ROSTER_SETUP_V2", "LC_ODI_ROSTER_SETUP_V2", "LC_RED5_ROSTER_SETUP_V2"].includes(String(objectRecord(objectRecord(input.session).setup).setupVersion)) && !rosterPack) throw new Error("SAVE_ROSTER_REQUIRED");
    const rosterPayload = rosterPack ? canonicalJson(rosterPack) : null;
    const suppliedRosterHash = rosterPayload ? await sha256Text(rosterPayload) : null;
    if (rosterPack) {
      const setup = objectRecord(objectRecord(input.session).setup);
      if (!["LC_T20_ROSTER_SETUP_V2", "LC_ODI_ROSTER_SETUP_V2", "LC_RED5_ROSTER_SETUP_V2"].includes(String(setup.setupVersion)) || setup.rosterPackHash !== suppliedRosterHash ||
          objectRecord(setup.versions).worldHash !== await sha256Text(canonicalJson(rosterPack.world))) throw new Error("SAVE_ROSTER_SESSION_MISMATCH");
    }
    const eventRows = await Promise.all(
      input.events.map(async (event) => {
        const eventPayload = canonicalJson(event);
        return {
          saveId: input.saveId,
          sequence: event.sequence,
          payload: eventPayload,
          sha256: await sha256Text(eventPayload),
        } satisfies EventRecord;
      }),
    );
    const tx = db.transaction(
      ["games", "snapshots", "events", "commands", "settings", "projections", "worldPacks"],
      "readwrite",
    );
    const games = tx.objectStore("games"),
      snapshots = tx.objectStore("snapshots"),
      events = tx.objectStore("events"),
      commands = tx.objectStore("commands"),
      settings = tx.objectStore("settings");
    const existing = (await req(games.get(input.saveId))) as
      | GameRecord
      | undefined;
    let existingBase: BaseSaveSchema | null = null;
    try { if (existing) existingBase = baseSaveSchema(existing); }
    catch (error) { tx.abort(); throw error; }
    if (existing && suppliedCopyHash && suppliedCopyHash !== existing.worldCopySha256) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_WORLD_COPY_IMMUTABLE");
    }
    if (existingBase === PRESENTATION_SAVE_SCHEMA_VERSION && !existing?.worldCopySha256) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_WORLD_COPY_MISSING");
    }
    if (existingBase === PRESENTATION_SAVE_SCHEMA_VERSION && !suppliedCopyHash) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_WORLD_COPY_REQUIRED");
    }
    if (existing && existingBase !== PRESENTATION_SAVE_SCHEMA_VERSION && existing.worldCopySha256) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_WORLD_COPY_VERSION_MISMATCH");
    }
    if (existing && suppliedRosterHash && (existingBase !== ROSTER_SAVE_SCHEMA_VERSION || existing.rosterPackSha256 !== suppliedRosterHash)) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_ROSTER_IMMUTABLE");
    }
    if (existingBase === ROSTER_SAVE_SCHEMA_VERSION && (!existing?.rosterPackSha256 || !suppliedRosterHash)) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_ROSTER_REQUIRED");
    }
    if (existing && existingBase !== ROSTER_SAVE_SCHEMA_VERSION && existing.rosterPackSha256) {
      tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_ROSTER_VERSION_MISMATCH");
    }
    const lease = (await req(settings.get(leaseKey(input.saveId)))) as
      | LeaseRecord
      | undefined;
    if (!lease || lease.ownerId !== input.ownerId || lease.expiresAt <= now) {
      tx.abort();
      try {
        await txDone(tx);
      } catch {
        /* expected */
      }
      throw new Error("SAVE_READ_ONLY: writer lease is not held");
    }
    const durableRevision = existing?.revision ?? 0;
    if (input.expectedRevision === null && existing) {
      tx.abort();
      try {
        await txDone(tx);
      } catch {
        /* expected */
      }
      throw new Error(
        `SAVE_ALREADY_EXISTS: ${input.saveId} already holds revision ${durableRevision}; refusing to replace it`,
      );
    }
    if (
      input.expectedRevision !== null &&
      durableRevision !== input.expectedRevision
    ) {
      tx.abort();
      try {
        await txDone(tx);
      } catch {
        /* expected */
      }
      throw new Error(
        `SAVE_STALE_REVISION: expected ${input.expectedRevision}, durable ${durableRevision}`,
      );
    }
    const initialHistory = input.historyCommands ?? [];
    if ((initialHistory.length || delegation) && existing) {
      tx.abort();
      try {
        await txDone(tx);
      } catch {
        /* expected */
      }
      throw new Error("SAVE_HISTORY_ONLY_ALLOWED_ON_NEW_SAVE");
    }
    const historyIds = new Set<string>();
    for (const historical of initialHistory) {
      if (
        historyIds.has(historical.commandId) ||
        (input.command && historical.commandId === input.command.commandId)
      ) {
        tx.abort();
        try {
          await txDone(tx);
        } catch {
          /* expected */
        }
        throw new Error("SAVE_DUPLICATE_HISTORY_COMMAND");
      }
      historyIds.add(historical.commandId);
    }
    if (input.command) {
      const prior = (await req(
        commands.get([input.saveId, input.command.commandId]),
      )) as CommandRecord | undefined;
      if (prior) {
        if (prior.requestCanonical !== input.command.requestCanonical) {
          tx.abort();
          try {
            await txDone(tx);
          } catch {
            /* expected */
          }
          throw new Error("SAVE_DUPLICATE_COMMAND_CONFLICT");
        }
        tx.abort();
        try {
          await txDone(tx);
        } catch {
          /* expected */
        }
        throw new Error("SAVE_DUPLICATE_COMMAND_ALREADY_COMMITTED");
      }
    }
    const activeDelegation = existing ? await req(settings.get(delegationKey(input.saveId))) as SettingRecord | undefined : undefined;
    if (canonicalJson(activeDelegation?.value ?? null) !== canonicalJson(expectedDelegation)) {
      tx.abort();
      throw new Error("DELEGATION_STALE_REVISION");
    }
    if (existing?.schemaVersion === DELEGATION_SAVE_SCHEMA_VERSION && !expectedDelegation) { tx.abort(); throw new Error("DELEGATION_ACTIVE_MISSING"); }
    const checkpointJournal = delegation ?? existingJournal;
    const checkpointRecord = suppliedDelegation ?? expectedDelegation;
    if (checkpointJournal?.changes.some(change => change.matchRevision > input.revision)) {
      tx.abort();
      throw new Error("DELEGATION_AHEAD_OF_SAVE");
    }
    const serial = (existing?.checkpointSerial ?? -1) + 1;
    const generation = serial % 3;
    const createdAt = input.updatedAt;
    snapshots.put({
      saveId: input.saveId,
      generation,
      checkpointSerial: serial,
      revision: input.revision,
      payload,
      sha256: snapshotHash,
      createdAt,
      ...(checkpointJournal?.changes.length ? { delegationTracked: true } : {}),
    } satisfies SnapshotRecord);
    if (checkpointJournal?.changes.length) {
      settings.put({ key: delegationCheckpointKey(input.saveId, generation), value: { checkpointSerial: serial, record: checkpointRecord } } satisfies SettingRecord);
    } else settings.delete(delegationCheckpointKey(input.saveId, generation));
    const priorEventCount = existing?.eventCount ?? 0;
    for (const row of eventRows)
      if (row.sequence > priorEventCount) events.put(row);
    for (const historical of initialHistory)
      commands.put({
        saveId: input.saveId,
        ...historical,
      } satisfies CommandRecord);
    if (input.command)
      commands.put({
        saveId: input.saveId,
        ...input.command,
      } satisfies CommandRecord);
    if (suppliedDelegation) settings.put({ key: delegationKey(input.saveId), value: suppliedDelegation } satisfies SettingRecord);
    const summary: SaveSummary = {
      saveId: input.saveId,
      kind: input.kind,
      title: input.title,
      matchGameId: input.metadata.matchGameId,
      matchId: input.metadata.matchId,
      teams: input.metadata.teams,
      ground: input.metadata.ground,
      phase: input.metadata.phase,
      revision: input.revision,
      eventCount: input.events.length,
      lastEventHash: input.events.length
        ? String(input.events[input.events.length - 1]!.eventHash ?? "")
        : "",
      updatedAt: createdAt,
      completed: input.metadata.completed,
    };
    const copyHash = existing?.worldCopySha256 ?? suppliedCopyHash;
    if (worldCopyPayload && suppliedCopyHash) {
      const packs = tx.objectStore("worldPacks");
      const previous = await req(packs.get(suppliedCopyHash)) as { hash: string; payload: string } | undefined;
      if (!previous && existing) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_WORLD_COPY_MISSING"); }
      if (previous && previous.payload !== worldCopyPayload) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_WORLD_COPY_CONFLICT"); }
      if (!previous) packs.add({ hash: suppliedCopyHash, payload: worldCopyPayload });
    }
    if (rosterPayload && suppliedRosterHash) {
      const packs = tx.objectStore("worldPacks");
      const previous = await req(packs.get(suppliedRosterHash)) as { hash: string; payload: string } | undefined;
      if (!previous && existing) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_ROSTER_MISSING"); }
      if (previous && previous.payload !== rosterPayload) { tx.abort(); try { await txDone(tx); } catch { /* expected abort */ } throw new Error("SAVE_ROSTER_CONFLICT"); }
      if (!previous) packs.add({ hash: suppliedRosterHash, payload: rosterPayload });
    }
    games.put({
      ...summary,
      schemaVersion: checkpointJournal?.changes.length ? DELEGATION_SAVE_SCHEMA_VERSION : suppliedRosterHash ? ROSTER_SAVE_SCHEMA_VERSION : copyHash ? PRESENTATION_SAVE_SCHEMA_VERSION : SAVE_SCHEMA_VERSION,
      ...(checkpointJournal?.changes.length ? { baseSchemaVersion: suppliedRosterHash ? ROSTER_SAVE_SCHEMA_VERSION : copyHash ? PRESENTATION_SAVE_SCHEMA_VERSION : SAVE_SCHEMA_VERSION } : {}),
      ...(suppliedRosterHash ? { rosterPackSha256: suppliedRosterHash } : {}),
      ...(copyHash ? { worldCopySha256: copyHash } : {}),
      checkpointSerial: serial,
      checkpointGeneration: generation,
    } satisfies GameRecord);
    if (input.setActive !== false)
      settings.put({
        key: settingKey("activeSaveId"),
        value: input.saveId,
      } satisfies SettingRecord);
    settings.put({
      ...lease,
      expiresAt: now + WRITER_LEASE_MS,
    } satisfies LeaseRecord);
    if (input.testAbortAfterWrites) {
      const done = txDone(tx);
      tx.abort();
      try {
        await done;
      } catch {
        /* injected abort is expected */
      }
      throw new Error("SAVE_INJECTED_ABORT");
    }
    await txDone(tx);
    return summary;
  }

  async cloneSave(
    sourceSaveId: string,
    targetSaveId: string,
    kind: SaveKind,
    title: string,
    ownerId: string,
    now: number,
    updatedAt: string,
  ): Promise<SaveSummary> {
    const loaded = await this.load(sourceSaveId);
    if (!loaded) throw new Error("SAVE_NOT_FOUND");
    const acquired = await this.acquireLease(targetSaveId, ownerId, now);
    if (!acquired) throw new Error("SAVE_READ_ONLY: target slot is locked");
    const session = objectRecord(loaded.session);
    const setup = objectRecord(session.setup);
    const core = objectRecord(session.core);
    const teams = Array.isArray(setup.teams)
      ? setup.teams.map(objectRecord)
      : [];
    const ground = objectRecord(setup.ground);
    const eventValue = session.events;
    const eventRows = Array.isArray(eventValue)
      ? eventValue.filter(
          (event): event is { sequence: number; [key: string]: unknown } =>
            objectRecord(event).sequence !== undefined &&
            typeof objectRecord(event).sequence === "number",
        )
      : [];
    const historyCommands = await this.historyCommands(
      sourceSaveId,
      Number(session.revision ?? 0),
    );
    const delegationJournal = loaded.delegationJournal;
    return this.commit({
      saveId: targetSaveId,
      kind,
      title,
      expectedRevision: null,
      session,
      revision: Number(session.revision ?? 0),
      events: eventRows,
      command: null,
      historyCommands,
      ...(delegationJournal?.changes.length ? { delegationJournal } : {}),
      worldCopy: loaded.worldCopy ?? null,
      rosterPack: loaded.rosterPack ?? null,
      setActive: false,
      ownerId,
      now,
      updatedAt,
      metadata: {
        matchGameId: String(setup?.gameId ?? loaded.summary.matchGameId),
        matchId: String(setup?.matchId ?? loaded.summary.matchId),
        teams: [
          loaded.worldCopy ? loaded.summary.teams[0] : String(teams[0]?.name ?? loaded.summary.teams[0]),
          loaded.worldCopy ? loaded.summary.teams[1] : String(teams[1]?.name ?? loaded.summary.teams[1]),
        ],
        ground: loaded.worldCopy ? loaded.summary.ground : String(ground.name ?? loaded.summary.ground),
        phase: String(core.phase ?? loaded.summary.phase),
        completed: core.phase === "COMPLETE",
      },
    });
  }

  async load(saveId: string): Promise<LoadResult | null> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots", "worldPacks", "settings"], "readonly");
    const game = (await req(tx.objectStore("games").get(saveId))) as
      | GameRecord
      | undefined;
    if (!game) {
      await txDone(tx);
      return null;
    }
    let base: BaseSaveSchema;
    try { base = baseSaveSchema(game); }
    catch { await txDone(tx); throw new Error(`SAVE_SCHEMA_UNSUPPORTED: ${String(game.schemaVersion)}`); }
    if (base !== PRESENTATION_SAVE_SCHEMA_VERSION && game.worldCopySha256) { await txDone(tx); throw new Error("SAVE_WORLD_COPY_VERSION_MISMATCH"); }
    const rows = (await req(
      tx.objectStore("snapshots").index("saveId").getAll(saveId),
    )) as SnapshotRecord[];
    const delegationRows = await Promise.all([0, 1, 2].map(generation => req(tx.objectStore("settings").get(delegationCheckpointKey(saveId, generation))))) as (SettingRecord | undefined)[];
    const activeDelegation = await req(tx.objectStore("settings").get(delegationKey(saveId))) as SettingRecord | undefined;
    const rosterRow = base === ROSTER_SAVE_SCHEMA_VERSION && game.rosterPackSha256
      ? await req(tx.objectStore("worldPacks").get(game.rosterPackSha256)) as { hash: string; payload: string } | undefined : undefined;
    const worldRow = base === PRESENTATION_SAVE_SCHEMA_VERSION && game.worldCopySha256
      ? await req(tx.objectStore("worldPacks").get(game.worldCopySha256)) as { hash: string; payload: string } | undefined : undefined;
    await txDone(tx);
    let activeJournal: DelegationJournal | null = null;
    let activeJournalDamaged = false;
    if (game.schemaVersion === DELEGATION_SAVE_SCHEMA_VERSION) {
      try {
        if (!activeDelegation) throw new Error("DELEGATION_ACTIVE_MISSING");
        activeJournal = await readDelegationRecord(activeDelegation.value, saveId);
      } catch { activeJournalDamaged = true; }
    }
    let rosterPack: StagedRosterPack | null = null;
    if (base === ROSTER_SAVE_SCHEMA_VERSION) {
      if (!rosterRow || !game.rosterPackSha256 || await sha256Text(rosterRow.payload) !== game.rosterPackSha256) throw new Error("SAVE_ROSTER_MISSING_OR_DAMAGED");
      rosterPack = StagedRosterPackSchema.parse(JSON.parse(rosterRow.payload));
    } else if (game.rosterPackSha256) throw new Error("SAVE_ROSTER_VERSION_MISMATCH");
    let worldCopy: NewGameWorldCopy | null = null;
    if (base === PRESENTATION_SAVE_SCHEMA_VERSION) {
      if (!worldRow || !game.worldCopySha256 || await sha256Text(worldRow.payload) !== game.worldCopySha256) throw new Error("SAVE_WORLD_COPY_MISSING_OR_DAMAGED");
      worldCopy = await validateStoredWorldCopy(JSON.parse(worldRow.payload));
    }
    const rosterWorldHash = rosterPack ? await sha256Text(canonicalJson(rosterPack.world)) : null;
    const ordered = rows.sort(
      (a, b) => b.checkpointSerial - a.checkpointSerial,
    );
    for (const row of ordered) {
      if ((await sha256Text(row.payload)) !== row.sha256) continue;
      try {
        const session = JSON.parse(row.payload);
        const setup = objectRecord(objectRecord(session).setup);
        if (rosterPack && (!["LC_T20_ROSTER_SETUP_V2", "LC_ODI_ROSTER_SETUP_V2", "LC_RED5_ROSTER_SETUP_V2"].includes(String(setup.setupVersion)) || setup.rosterPackHash !== game.rosterPackSha256 || objectRecord(setup.versions).worldHash !== rosterWorldHash)) continue;
        if (!rosterPack && ["LC_T20_ROSTER_SETUP_V2", "LC_ODI_ROSTER_SETUP_V2", "LC_RED5_ROSTER_SETUP_V2"].includes(String(setup.setupVersion))) continue;
        let delegationJournal: DelegationJournal | undefined;
        const checkpoint = delegationRows[row.generation]?.value as { checkpointSerial?: unknown; record?: unknown } | undefined;
        if (row.delegationTracked) {
          if (!checkpoint || checkpoint.checkpointSerial !== row.checkpointSerial) continue;
          delegationJournal = await readDelegationRecord(checkpoint.record, saveId);
          if (delegationJournal.changes.some(change => change.matchRevision > row.revision)) continue;
        } else if (checkpoint?.checkpointSerial === row.checkpointSerial) continue;
        const recovered = row.checkpointSerial !== game.checkpointSerial || (game.schemaVersion === DELEGATION_SAVE_SCHEMA_VERSION &&
          (activeJournalDamaged || !delegationJournal || canonicalJson(activeJournal) !== canonicalJson(delegationJournal)));
        return {
          summary: recovered
            ? recoveredSummary(game, session, row)
            : summaryFromGame(game),
          session,
          recovered,
          recoveredFromGeneration: recovered ? row.generation : null,
          worldCopy,
          rosterPack,
          ...(delegationJournal ? { delegationJournal } : {}),
        };
      } catch {
        /* try older generation */
      }
    }
    throw new Error("SAVE_CORRUPT: no valid checkpoint generation");
  }

  async delete(saveId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(
      ["games", "snapshots", "events", "commands", "projections", "settings"],
      "readwrite",
    );
    tx.objectStore("games").delete(saveId);
    for (const storeName of ["snapshots", "events", "commands"] as const) {
      const store = tx.objectStore(storeName);
      const index = store.index("saveId");
      const range = IDBKeyRange.only(saveId);
      await new Promise<void>((resolve, reject) => {
        const cursor = index.openKeyCursor(range);
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return resolve();
          store.delete(c.primaryKey);
          c.continue();
        };
      });
    }
    const active = (await req(
      tx.objectStore("settings").get(settingKey("activeSaveId")),
    )) as SettingRecord | undefined;
    if (active?.value === saveId)
      tx.objectStore("settings").delete(settingKey("activeSaveId"));
    tx.objectStore("settings").delete(leaseKey(saveId));
    tx.objectStore("settings").delete(delegationKey(saveId));
    for (const generation of [0, 1, 2]) tx.objectStore("settings").delete(delegationCheckpointKey(saveId, generation));
    await txDone(tx);
  }

  /** Test/recovery hook used only by browser verification to simulate damaged storage. */
  async corruptCurrentCheckpoint(saveId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots"], "readwrite");
    const game = (await req(tx.objectStore("games").get(saveId))) as
      | GameRecord
      | undefined;
    if (!game) throw new Error("SAVE_NOT_FOUND");
    const key: [string, number] = [saveId, game.checkpointGeneration];
    const row = (await req(
      tx.objectStore("snapshots").get(key),
    )) as SnapshotRecord;
    tx.objectStore("snapshots").put({ ...row, payload: `${row.payload} ` });
    await txDone(tx);
  }
}

export * from "./archive.js";
export * from "./season.js";
export * from "./binding.js";
