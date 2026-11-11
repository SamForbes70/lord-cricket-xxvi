import { canonicalJson } from "@lcxxvi/contracts";

/**
 * Durable association between a career fixture and the match that plays it.
 *
 * The match checkpoint is durable on its own; the link back to the career fixture used to live
 * only in sessionStorage. A binding is written before the match is launched and survives a closed
 * tab, so the match can be recovered and its result applied to the career exactly once.
 *
 * A binding is never used to infer a result. It is only an identity record: which career, which
 * fixture, which match, and the validated launch that produced it. Damaged records are reported and
 * ignored, never repaired or guessed.
 */
export const MANAGED_BINDING_VERSION = "LC_MANAGED_MATCH_BINDING_V1" as const;
export const MANAGED_BINDING_PREFIX = "managed-binding:";
const DB_NAME = "lord-cricket-xxvi";
const DB_VERSION = 1;

export type ManagedBindingStatus = "PENDING" | "APPLIED" | "ABANDONED";
export type ManagedBindingKind = "STANDARD" | "ROSTER";

export type ManagedBindingInput = {
  careerKind: ManagedBindingKind;
  careerSaveId: string;
  matchGameId: string;
  matchId: string;
  fixtureId: string;
  seasonId: string;
  scheduleSha256: string;
  careerStateSha256: string;
  /** The validated launch object. Opaque here; the application validates it with its own schema. */
  launch: unknown;
};

export type ManagedBinding = ManagedBindingInput & {
  bindingVersion: typeof MANAGED_BINDING_VERSION;
  status: ManagedBindingStatus;
  createdAt: string;
  updatedAt: string;
  resolution: string | null;
  sha256: string;
};

export type ManagedBindingListing = {
  bindings: ManagedBinding[];
  /** Keys whose stored record failed validation. They are preserved untouched. */
  damaged: string[];
};

/** Storage seam so the rules can be tested without a browser. */
export interface ManagedBindingKv {
  get(key: string): Promise<unknown | undefined>;
  /** Writes only if the stored record's `sha256` equals `expectedSha256` (null means absent). */
  compareAndPut(key: string, expectedSha256: string | null, value: unknown): Promise<boolean>;
  delete(key: string): Promise<void>;
  listPrefix(prefix: string): Promise<{ key: string; value: unknown }[]>;
}

export function managedBindingKey(matchGameId: string): string {
  return `${MANAGED_BINDING_PREFIX}${matchGameId}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function bindingHash(binding: Omit<ManagedBinding, "sha256">): Promise<string> {
  return sha256Hex(canonicalJson(binding));
}

const HASH = /^[a-f0-9]{64}$/;
const STATUSES: readonly ManagedBindingStatus[] = ["PENDING", "APPLIED", "ABANDONED"];

/** Returns the validated binding or null when the stored value is not an intact binding. */
export async function readManagedBinding(value: unknown): Promise<ManagedBinding | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const text = (name: string) => typeof row[name] === "string" && (row[name] as string).length > 0 && (row[name] as string).length <= 256;
  if (row.bindingVersion !== MANAGED_BINDING_VERSION) return null;
  if (row.careerKind !== "STANDARD" && row.careerKind !== "ROSTER") return null;
  if (!STATUSES.includes(row.status as ManagedBindingStatus)) return null;
  if (!["careerSaveId", "matchGameId", "matchId", "fixtureId", "seasonId", "createdAt", "updatedAt"].every(text)) return null;
  if (typeof row.scheduleSha256 !== "string" || !HASH.test(row.scheduleSha256)) return null;
  if (typeof row.careerStateSha256 !== "string" || !HASH.test(row.careerStateSha256)) return null;
  if (typeof row.sha256 !== "string" || !HASH.test(row.sha256)) return null;
  if (row.resolution !== null && typeof row.resolution !== "string") return null;
  if (row.launch === null || typeof row.launch !== "object") return null;
  const { sha256, ...content } = row as Record<string, unknown> & { sha256: string };
  let expected: string;
  try {
    expected = await bindingHash(content as Omit<ManagedBinding, "sha256">);
  } catch {
    return null;
  }
  return expected === sha256 ? (row as unknown as ManagedBinding) : null;
}

export class ManagedBindingError extends Error {
  constructor(readonly code: "BINDING_CONFLICT" | "BINDING_ALREADY_APPLIED" | "BINDING_DAMAGED" | "BINDING_MISSING" | "BINDING_RACE", message: string) {
    super(`${code}: ${message}`);
    this.name = "ManagedBindingError";
  }
}

export class ManagedMatchBindings {
  /** The clock is injected: persistence packages hold no ambient time source. */
  constructor(private readonly kv: ManagedBindingKv, private readonly clock: () => string) {}

  /** Reads one binding. A damaged record throws; it is never silently treated as absent. */
  async get(matchGameId: string): Promise<ManagedBinding | null> {
    const raw = await this.kv.get(managedBindingKey(matchGameId));
    if (raw === undefined) return null;
    const binding = await readManagedBinding(raw);
    if (!binding || binding.matchGameId !== matchGameId) throw new ManagedBindingError("BINDING_DAMAGED", `Binding for ${matchGameId} failed validation and was preserved.`);
    return binding;
  }

  async list(): Promise<ManagedBindingListing> {
    const rows = await this.kv.listPrefix(MANAGED_BINDING_PREFIX);
    const bindings: ManagedBinding[] = [];
    const damaged: string[] = [];
    for (const row of rows) {
      const binding = await readManagedBinding(row.value);
      if (binding && managedBindingKey(binding.matchGameId) === row.key) bindings.push(binding);
      else damaged.push(row.key);
    }
    bindings.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.matchGameId.localeCompare(b.matchGameId));
    return { bindings, damaged };
  }

  async pendingForCareer(careerSaveId: string): Promise<ManagedBindingListing> {
    const { bindings, damaged } = await this.list();
    return { bindings: bindings.filter((b) => b.careerSaveId === careerSaveId && b.status === "PENDING"), damaged };
  }

  /**
   * Writes a PENDING binding before the match is launched. Repeating the same launch is a no-op.
   * A different pending binding for the same match is rejected, and an applied one cannot be reopened.
   * An abandoned binding may be reopened (the kept match save is then resumed, not replaced).
   */
  async create(input: ManagedBindingInput): Promise<ManagedBinding> {
    const key = managedBindingKey(input.matchGameId);
    const raw = await this.kv.get(key);
    let prior: ManagedBinding | null = null;
    if (raw !== undefined) {
      prior = await readManagedBinding(raw);
      if (!prior) throw new ManagedBindingError("BINDING_DAMAGED", `Binding for ${input.matchGameId} failed validation and was preserved.`);
      if (prior.status === "APPLIED") throw new ManagedBindingError("BINDING_ALREADY_APPLIED", `The result for ${input.fixtureId} was already applied.`);
      if (prior.status === "PENDING") {
        const same = canonicalJson(pick(prior)) === canonicalJson(pick(input));
        if (!same) throw new ManagedBindingError("BINDING_CONFLICT", `A different pending binding already exists for ${input.matchGameId}.`);
        return prior;
      }
    }
    const now = this.clock();
    const content: Omit<ManagedBinding, "sha256"> = {
      bindingVersion: MANAGED_BINDING_VERSION,
      ...pick(input),
      launch: input.launch,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
      resolution: null,
    };
    const binding: ManagedBinding = { ...content, sha256: await bindingHash(content) };
    if (!(await this.kv.compareAndPut(key, prior?.sha256 ?? null, binding))) throw new ManagedBindingError("BINDING_RACE", `Binding for ${input.matchGameId} changed while it was being written.`);
    return binding;
  }

  /** Moves a PENDING binding to APPLIED or ABANDONED. Terminal states are not changed again. */
  async resolve(matchGameId: string, status: "APPLIED" | "ABANDONED", resolution: string): Promise<ManagedBinding> {
    const prior = await this.get(matchGameId);
    if (!prior) throw new ManagedBindingError("BINDING_MISSING", `No binding exists for ${matchGameId}.`);
    if (prior.status === status) return prior;
    if (prior.status !== "PENDING") throw new ManagedBindingError("BINDING_CONFLICT", `Binding for ${matchGameId} is already ${prior.status}.`);
    const content = { ...prior, status, updatedAt: this.clock(), resolution: resolution.slice(0, 200) } as Partial<ManagedBinding>;
    delete content.sha256;
    const next: ManagedBinding = { ...(content as Omit<ManagedBinding, "sha256">), sha256: await bindingHash(content as Omit<ManagedBinding, "sha256">) };
    if (!(await this.kv.compareAndPut(managedBindingKey(matchGameId), prior.sha256, next))) throw new ManagedBindingError("BINDING_RACE", `Binding for ${matchGameId} changed while it was being resolved.`);
    return next;
  }

  async remove(matchGameId: string): Promise<void> {
    await this.kv.delete(managedBindingKey(matchGameId));
  }

  /** Removes every binding for a career that was deleted or replaced. Damaged records are left alone. */
  async removeForCareer(careerSaveId: string): Promise<number> {
    const { bindings } = await this.list();
    const owned = bindings.filter((b) => b.careerSaveId === careerSaveId);
    for (const binding of owned) await this.kv.delete(managedBindingKey(binding.matchGameId));
    return owned.length;
  }
}

function pick(input: ManagedBindingInput): ManagedBindingInput {
  return {
    careerKind: input.careerKind,
    careerSaveId: input.careerSaveId,
    matchGameId: input.matchGameId,
    matchId: input.matchId,
    fixtureId: input.fixtureId,
    seasonId: input.seasonId,
    scheduleSha256: input.scheduleSha256,
    careerStateSha256: input.careerStateSha256,
    launch: input.launch,
  };
}

/** In-memory store for tests and tools. */
export class MemoryManagedBindingKv implements ManagedBindingKv {
  readonly rows = new Map<string, unknown>();
  async get(key: string) {
    const value = this.rows.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }
  async compareAndPut(key: string, expectedSha256: string | null, value: unknown) {
    const current = this.rows.get(key) as { sha256?: unknown } | undefined;
    const currentSha = current === undefined ? null : typeof current.sha256 === "string" ? current.sha256 : "";
    if (currentSha !== expectedSha256) return false;
    this.rows.set(key, structuredClone(value));
    return true;
  }
  async delete(key: string) {
    this.rows.delete(key);
  }
  async listPrefix(prefix: string) {
    return [...this.rows.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) }));
  }
}

type SettingRow = { key: string; value: unknown };

/** IndexedDB adapter over the existing `settings` store. It does not change DB_VERSION. */
export class IndexedDbManagedBindingKv implements ManagedBindingKv {
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
  private static req<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
  }
  private static done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    });
  }

  async get(key: string): Promise<unknown | undefined> {
    const db = await this.open();
    const tx = db.transaction("settings", "readonly");
    const row = (await IndexedDbManagedBindingKv.req(tx.objectStore("settings").get(key))) as SettingRow | undefined;
    await IndexedDbManagedBindingKv.done(tx);
    return row?.value;
  }

  async compareAndPut(key: string, expectedSha256: string | null, value: unknown): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const row = (await IndexedDbManagedBindingKv.req(store.get(key))) as SettingRow | undefined;
    const stored = row?.value as { sha256?: unknown } | undefined;
    const currentSha = row === undefined ? null : typeof stored?.sha256 === "string" ? stored.sha256 : "";
    if (currentSha !== expectedSha256) {
      tx.abort();
      try {
        await IndexedDbManagedBindingKv.done(tx);
      } catch {
        /* expected abort */
      }
      return false;
    }
    store.put({ key, value } satisfies SettingRow);
    await IndexedDbManagedBindingKv.done(tx);
    return true;
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").delete(key);
    await IndexedDbManagedBindingKv.done(tx);
  }

  async listPrefix(prefix: string): Promise<{ key: string; value: unknown }[]> {
    const db = await this.open();
    const tx = db.transaction("settings", "readonly");
    const rows = (await IndexedDbManagedBindingKv.req(
      tx.objectStore("settings").getAll(IDBKeyRange.bound(prefix, `${prefix}￿`)),
    )) as SettingRow[];
    await IndexedDbManagedBindingKv.done(tx);
    return rows.map((row) => ({ key: row.key, value: row.value }));
  }
}

export function createManagedMatchBindings(clock: () => string, databaseName?: string): ManagedMatchBindings {
  return new ManagedMatchBindings(new IndexedDbManagedBindingKv(databaseName), clock);
}
