import {
  canonicalJson,
  type ID,
  type MatchState,
  type EventEnvelope,
  type CommandReceipt,
} from "@lcxxvi/contracts";

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
  setActive?: boolean;
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
};

type GameRecord = SaveSummary & {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  checkpointSerial: number;
  checkpointGeneration: number;
};
type SnapshotRecord = {
  saveId: string;
  generation: number;
  checkpointSerial: number;
  revision: number;
  payload: string;
  sha256: string;
  createdAt: string;
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
      .filter((row) => (row as GameRecord & { recordType?: string }).recordType !== "SEASON")
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
    const payload = canonicalJson(input.session);
    const snapshotHash = await sha256Text(payload);
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
      ["games", "snapshots", "events", "commands", "settings", "projections"],
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
    if (initialHistory.length && existing) {
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
    } satisfies SnapshotRecord);
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
    games.put({
      ...summary,
      schemaVersion: SAVE_SCHEMA_VERSION,
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
      setActive: false,
      ownerId,
      now,
      updatedAt,
      metadata: {
        matchGameId: String(setup?.gameId ?? loaded.summary.matchGameId),
        matchId: String(setup?.matchId ?? loaded.summary.matchId),
        teams: [
          String(teams[0]?.name ?? loaded.summary.teams[0]),
          String(teams[1]?.name ?? loaded.summary.teams[1]),
        ],
        ground: String(ground.name ?? loaded.summary.ground),
        phase: String(core.phase ?? loaded.summary.phase),
        completed: core.phase === "COMPLETE",
      },
    });
  }

  async load(saveId: string): Promise<LoadResult | null> {
    const db = await this.open();
    const tx = db.transaction(["games", "snapshots"], "readonly");
    const game = (await req(tx.objectStore("games").get(saveId))) as
      | GameRecord
      | undefined;
    if (!game) {
      await txDone(tx);
      return null;
    }
    if (game.schemaVersion !== SAVE_SCHEMA_VERSION) {
      await txDone(tx);
      throw new Error(`SAVE_SCHEMA_UNSUPPORTED: ${String(game.schemaVersion)}`);
    }
    const rows = (await req(
      tx.objectStore("snapshots").index("saveId").getAll(saveId),
    )) as SnapshotRecord[];
    await txDone(tx);
    const ordered = rows.sort(
      (a, b) => b.checkpointSerial - a.checkpointSerial,
    );
    for (const row of ordered) {
      if ((await sha256Text(row.payload)) !== row.sha256) continue;
      try {
        const session = JSON.parse(row.payload);
        const recovered = row.checkpointSerial !== game.checkpointSerial;
        return {
          summary: recovered
            ? recoveredSummary(game, session, row)
            : summaryFromGame(game),
          session,
          recovered,
          recoveredFromGeneration: recovered ? row.generation : null,
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
