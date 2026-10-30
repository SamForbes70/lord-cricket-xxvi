import { canonicalJson, SeasonPortableManifestSchema, SeasonPortableManifestV2Schema, SeasonSaveSummarySchema, SeasonArchiveSchema, type SeasonPortableManifest, type SeasonPortableManifestV2, type SeasonSaveSummary, type SeasonArchive, type T20SeasonState, type NewGameWorldCopy } from "@lcxxvi/contracts";
import { SAVE_SCHEMA_VERSION, PRESENTATION_SAVE_SCHEMA_VERSION, sha256Bytes, type SaveSummary } from "./index.js";
import { SEASON_SAVE_SCHEMA_VERSION, SEASON_PRESENTATION_SAVE_SCHEMA_VERSION, validateStoredWorldCopy, validateT20SeasonArchive, validateT20SeasonState } from "./season.js";

export const ARCHIVE_EXTENSION = ".lcxxvi";
export const ARCHIVE_VERSION = "LC_ARCHIVE_V1" as const;
export const PRESENTATION_ARCHIVE_VERSION = "LC_ARCHIVE_V2_PRESENTATION" as const;
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function u16(n: number) {
  return [n & 255, (n >>> 8) & 255];
}
function u32(n: number) {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}
function read16(b: Uint8Array, o: number) {
  return b[o]! | (b[o + 1]! << 8);
}
function read32(b: Uint8Array, o: number) {
  return (
    (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0
  );
}
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((n, p) => n + p.length, 0),
    out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of data) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function safePath(name: string): boolean {
  return (
    !!name &&
    !name.startsWith("/") &&
    !name.startsWith("\\") &&
    !/^[A-Za-z]:/.test(name) &&
    !name.split(/[\\/]/).some((p) => p === ".." || p === "")
  );
}

type Entry = { name: string; data: Uint8Array };
function makeZip(entries: readonly Entry[]): Uint8Array {
  const locals: Uint8Array[] = [],
    centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = encoder.encode(e.name),
      crc = crc32(e.data);
    const local = Uint8Array.from([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(e.data.length),
      ...u32(e.data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
    ]);
    locals.push(local, e.data);
    const central = Uint8Array.from([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(e.data.length),
      ...u32(e.data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    ]);
    centrals.push(central);
    offset += local.length + e.data.length;
  }
  const central = concat(centrals),
    end = Uint8Array.from([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(entries.length),
      ...u16(entries.length),
      ...u32(central.length),
      ...u32(offset),
      ...u16(0),
    ]);
  return concat([...locals, central, end]);
}

function parseZip(input: Uint8Array): Map<string, Uint8Array> {
  if (
    !(input instanceof Uint8Array) ||
    input.length < 22 ||
    input.length > MAX_ARCHIVE_BYTES
  )
    throw new Error("ARCHIVE_SIZE_INVALID");
  const files = new Map<string, Uint8Array>();
  let offset = 0,
    expanded = 0;
  while (offset + 4 <= input.length && read32(input, offset) === 0x04034b50) {
    if (files.size >= MAX_FILES) throw new Error("ARCHIVE_TOO_MANY_FILES");
    if (offset + 30 > input.length) throw new Error("ARCHIVE_TRUNCATED");
    const flags = read16(input, offset + 6),
      method = read16(input, offset + 8),
      crc = read32(input, offset + 14),
      compressed = read32(input, offset + 18),
      size = read32(input, offset + 22),
      nameLen = read16(input, offset + 26),
      extraLen = read16(input, offset + 28);
    if (flags !== 0 || method !== 0 || compressed !== size)
      throw new Error("ARCHIVE_COMPRESSION_UNSUPPORTED");
    const nameStart = offset + 30,
      dataStart = nameStart + nameLen + extraLen,
      dataEnd = dataStart + size;
    if (dataEnd > input.length) throw new Error("ARCHIVE_TRUNCATED");
    const name = decoder.decode(input.slice(nameStart, nameStart + nameLen));
    if (!safePath(name) || files.has(name))
      throw new Error("ARCHIVE_PATH_INVALID");
    expanded += size;
    if (expanded > MAX_EXPANDED_BYTES)
      throw new Error("ARCHIVE_EXPANDED_SIZE_INVALID");
    const data = input.slice(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new Error("ARCHIVE_CRC_MISMATCH");
    files.set(name, data);
    offset = dataEnd;
  }
  if (files.size === 0) throw new Error("ARCHIVE_EMPTY");
  return files;
}

export type ArchivePins = {
  engine: string;
  eventChain: string;
  random: string;
  model: string;
  modelHash: string;
  rules: string;
  rulesHash: string;
  worldHash: string;
};
export type ArchiveManifest = {
  archiveVersion: typeof ARCHIVE_VERSION | typeof PRESENTATION_ARCHIVE_VERSION;
  saveSchema: typeof SAVE_SCHEMA_VERSION | typeof PRESENTATION_SAVE_SCHEMA_VERSION;
  exportedAt: string;
  summary: SaveSummary;
  pins: ArchivePins;
  files: Record<string, { bytes: number; sha256: string }>;
  embeddedPacks: string[];
  worldCopySha256?: string;
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}_INVALID`);
  return value as Record<string, unknown>;
}
function strictKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): void {
  const record = asRecord(value, label);
  const actual = Object.keys(record).sort(),
    expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((k, i) => k !== expected[i])
  )
    throw new Error(`${label}_FIELDS_INVALID`);
}
function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label}_INVALID`);
}
function requireNonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error(`${label}_INVALID`);
}
function validateSummary(value: unknown): asserts value is SaveSummary {
  strictKeys(
    value,
    [
      "saveId",
      "kind",
      "title",
      "matchGameId",
      "matchId",
      "teams",
      "ground",
      "phase",
      "revision",
      "eventCount",
      "lastEventHash",
      "updatedAt",
      "completed",
    ],
    "ARCHIVE_SUMMARY",
  );
  const summary = value as Record<string, unknown>;
  for (const key of [
    "saveId",
    "title",
    "matchGameId",
    "matchId",
    "ground",
    "phase",
    "updatedAt",
  ] as const)
    requireString(summary[key], `ARCHIVE_SUMMARY_${key}`);
  if (
    !(["AUTO", "MANUAL", "IMPORTED"] as const).includes(
      summary.kind as "AUTO" | "MANUAL" | "IMPORTED",
    )
  )
    throw new Error("ARCHIVE_SUMMARY_kind_INVALID");
  if (
    !Array.isArray(summary.teams) ||
    summary.teams.length !== 2 ||
    summary.teams.some((team) => typeof team !== "string" || team.length === 0)
  )
    throw new Error("ARCHIVE_SUMMARY_teams_INVALID");
  requireNonNegativeInteger(summary.revision, "ARCHIVE_SUMMARY_revision");
  requireNonNegativeInteger(summary.eventCount, "ARCHIVE_SUMMARY_eventCount");
  if (
    typeof summary.lastEventHash !== "string" ||
    typeof summary.completed !== "boolean" ||
    Number.isNaN(Date.parse(String(summary.updatedAt)))
  )
    throw new Error("ARCHIVE_SUMMARY_FIELDS_INVALID");
}
function validateFileManifest(
  value: unknown,
  names: readonly string[] = ["game.json", "events.ndjson"],
): asserts value is Record<string, { bytes: number; sha256: string }> {
  strictKeys(value, names, "ARCHIVE_FILES");
  const files = value as Record<string, unknown>;
  for (const name of names) {
    strictKeys(files[name], ["bytes", "sha256"], `ARCHIVE_FILE_${name}`);
    const meta = files[name] as Record<string, unknown>;
    requireNonNegativeInteger(meta.bytes, `ARCHIVE_FILE_${name}_bytes`);
    if (typeof meta.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(meta.sha256))
      throw new Error(`ARCHIVE_FILE_${name}_sha256_INVALID`);
  }
}

export async function createPortableArchive(
  session: unknown,
  summary: SaveSummary,
  pins: ArchivePins,
  exportedAt: string,
  worldCopyRaw: unknown | null = null,
): Promise<Uint8Array> {
  const gameText = canonicalJson(session);
  const events = asRecord(session, "ARCHIVE_SESSION").events;
  if (!Array.isArray(events)) throw new Error("ARCHIVE_SESSION_EVENTS_INVALID");
  const eventsText =
    events.map((e: unknown) => canonicalJson(e)).join("\n") +
    (events.length ? "\n" : "");
  const payloads: Entry[] = [
    { name: "game.json", data: encoder.encode(gameText) },
    { name: "events.ndjson", data: encoder.encode(eventsText) },
  ];
  const worldCopy = worldCopyRaw === null ? null : await validateStoredWorldCopy(worldCopyRaw);
  if (worldCopy) payloads.push({ name: "world-copy.json", data: encoder.encode(canonicalJson(worldCopy)) });
  const files: Record<string, { bytes: number; sha256: string }> = {};
  for (const p of payloads)
    files[p.name] = {
      bytes: p.data.length,
      sha256: await sha256Bytes(p.data),
    };
  const manifest: ArchiveManifest = {
    archiveVersion: worldCopy ? PRESENTATION_ARCHIVE_VERSION : ARCHIVE_VERSION,
    saveSchema: worldCopy ? PRESENTATION_SAVE_SCHEMA_VERSION : SAVE_SCHEMA_VERSION,
    exportedAt,
    summary,
    pins,
    files,
    embeddedPacks: worldCopy ? ["world-copy.json"] : [],
    ...(worldCopy ? { worldCopySha256: files["world-copy.json"]!.sha256 } : {}),
  };
  const manifestData = encoder.encode(canonicalJson(manifest));
  return makeZip([{ name: "manifest.json", data: manifestData }, ...payloads]);
}

export async function readPortableArchive(
  bytes: Uint8Array,
  expected: ArchivePins | readonly ArchivePins[],
): Promise<{
  session: unknown;
  summary: SaveSummary;
  manifest: ArchiveManifest;
  worldCopy: NewGameWorldCopy | null;
}> {
  const files = parseZip(bytes);
  const allowed = new Set(["manifest.json", "game.json", "events.ndjson", "world-copy.json"]);
  for (const name of files.keys())
    if (!allowed.has(name)) throw new Error("ARCHIVE_FILE_NOT_ALLOWED");
  for (const required of ["manifest.json", "game.json", "events.ndjson"])
    if (!files.has(required)) throw new Error(`ARCHIVE_MISSING_${required}`);
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(
      decoder.decode(files.get("manifest.json")!),
    ) as unknown;
  } catch {
    throw new Error("ARCHIVE_MANIFEST_JSON_INVALID");
  }
  const version = asRecord(manifestValue, "ARCHIVE_MANIFEST").archiveVersion;
  if (version !== ARCHIVE_VERSION && version !== PRESENTATION_ARCHIVE_VERSION) throw new Error("ARCHIVE_VERSION_UNSUPPORTED");
  const presentation = version === PRESENTATION_ARCHIVE_VERSION;
  strictKeys(
    manifestValue,
    [
      "archiveVersion",
      "saveSchema",
      "exportedAt",
      "summary",
      "pins",
      "files",
      "embeddedPacks",
      ...(presentation ? ["worldCopySha256"] : []),
    ],
    "ARCHIVE_MANIFEST",
  );
  const manifest = manifestValue as ArchiveManifest;
  if (
    !(manifest.archiveVersion === ARCHIVE_VERSION && manifest.saveSchema === SAVE_SCHEMA_VERSION) &&
    !(manifest.archiveVersion === PRESENTATION_ARCHIVE_VERSION && manifest.saveSchema === PRESENTATION_SAVE_SCHEMA_VERSION)
  )
    throw new Error("ARCHIVE_VERSION_UNSUPPORTED");
  if (
    typeof manifest.exportedAt !== "string" ||
    Number.isNaN(Date.parse(manifest.exportedAt))
  )
    throw new Error("ARCHIVE_EXPORTED_AT_INVALID");
  validateSummary(manifest.summary);
  const payloadNames = presentation ? ["game.json", "events.ndjson", "world-copy.json"] : ["game.json", "events.ndjson"];
  if (files.has("world-copy.json") !== presentation) throw new Error("ARCHIVE_WORLD_COPY_FILE_MISMATCH");
  validateFileManifest(manifest.files, payloadNames);
  if (
    !Array.isArray(manifest.embeddedPacks) ||
    canonicalJson(manifest.embeddedPacks) !== canonicalJson(presentation ? ["world-copy.json"] : [])
  )
    throw new Error("ARCHIVE_EMBEDDED_PACKS_UNSUPPORTED");
  strictKeys(
    manifest.pins,
    [
      "engine",
      "eventChain",
      "random",
      "model",
      "modelHash",
      "rules",
      "rulesHash",
      "worldHash",
    ],
    "ARCHIVE_PINS",
  );
  const manifestPins = manifest.pins as unknown as Record<string, unknown>;
  if (Array.isArray(expected)) {
    const matches = expected.some((pins) =>
      Object.entries(pins).every(([key, value]) => manifestPins[key] === value),
    );
    if (!matches) throw new Error("ARCHIVE_PINS_UNSUPPORTED");
  } else {
    for (const [key, value] of Object.entries(expected)) {
      if (manifestPins[key] !== value)
        throw new Error(`ARCHIVE_PIN_UNSUPPORTED_${key}`);
    }
  }
  for (const name of payloadNames) {
    const data = files.get(name)!,
      meta = manifest.files[name];
    if (
      !meta ||
      meta.bytes !== data.length ||
      meta.sha256 !== (await sha256Bytes(data))
    )
      throw new Error(`ARCHIVE_HASH_MISMATCH_${name}`);
  }
  let worldCopy: NewGameWorldCopy | null = null;
  if (presentation) {
    const data = files.get("world-copy.json")!;
    if (await sha256Bytes(data) !== manifest.worldCopySha256) throw new Error("ARCHIVE_WORLD_COPY_HASH_MISMATCH");
    let raw: unknown;
    try { raw = JSON.parse(decoder.decode(data)); } catch { throw new Error("ARCHIVE_WORLD_COPY_JSON_INVALID"); }
    worldCopy = await validateStoredWorldCopy(raw);
  }
  let session: unknown;
  try {
    session = JSON.parse(decoder.decode(files.get("game.json")!)) as unknown;
  } catch {
    throw new Error("ARCHIVE_GAME_JSON_INVALID");
  }
  const eventText = decoder.decode(files.get("events.ndjson")!);
  const archiveEvents = eventText.trim()
    ? eventText
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
  const sessionEvents = asRecord(session, "ARCHIVE_GAME").events;
  if (
    !Array.isArray(sessionEvents) ||
    canonicalJson(sessionEvents) !== canonicalJson(archiveEvents)
  )
    throw new Error("ARCHIVE_EVENT_STREAM_MISMATCH");
  return { session, summary: manifest.summary, manifest, worldCopy };
}


export const SEASON_PORTABLE_ARCHIVE_VERSION = "LC_T20_SEASON_PORTABLE_V1" as const;
export const SEASON_PRESENTATION_ARCHIVE_VERSION = "LC_T20_SEASON_PORTABLE_V2" as const;

export async function createSeasonPortableArchive(
  stateRaw: unknown,
  summaryRaw: unknown,
  exportedAt: string,
  completedArchiveRaw: unknown | null = null,
  worldCopyRaw: unknown | null = null,
): Promise<Uint8Array> {
  const state = await validateT20SeasonState(stateRaw);
  const summary = SeasonSaveSummarySchema.parse(summaryRaw);
  if (summary.seasonId !== state.seasonId || summary.stateSha256 !== state.stateSha256 || summary.revision !== state.revision)
    throw new Error("SEASON_ARCHIVE_SUMMARY_STATE_MISMATCH");
  const completedArchive = completedArchiveRaw === null ? null : await validateT20SeasonArchive(completedArchiveRaw);
  if ((state.phase === "COMPLETE") !== Boolean(completedArchive))
    throw new Error("SEASON_ARCHIVE_COMPLETION_PAYLOAD_MISMATCH");
  if (completedArchive && completedArchive.stateSha256 !== state.stateSha256)
    throw new Error("SEASON_ARCHIVE_FINAL_STATE_MISMATCH");
  const payloads: Entry[] = [
    { name: "game.json", data: encoder.encode(canonicalJson(state)) },
    { name: "events.ndjson", data: encoder.encode(state.completedMatches.map((m) => canonicalJson(m)).join("\n") + (state.completedMatches.length ? "\n" : "")) },
    { name: "projection.json", data: encoder.encode(canonicalJson(state.projection)) },
  ];
  if (completedArchive) payloads.push({ name: "season-archive.json", data: encoder.encode(canonicalJson(completedArchive)) });
  const worldCopy = worldCopyRaw === null ? null : await validateStoredWorldCopy(worldCopyRaw);
  if (worldCopy) payloads.push({ name: "world-copy.json", data: encoder.encode(canonicalJson(worldCopy)) });
  const fileMeta: Record<string, { bytes: number; sha256: string }> = {};
  for (const payload of payloads) fileMeta[payload.name] = { bytes: payload.data.length, sha256: await sha256Bytes(payload.data) };
  const manifestValues = {
    exportedAt,
    summary,
    files: fileMeta,
  };
  const manifest = worldCopy ? SeasonPortableManifestV2Schema.parse({
    ...manifestValues,
    archiveVersion: SEASON_PRESENTATION_ARCHIVE_VERSION,
    saveSchema: SEASON_PRESENTATION_SAVE_SCHEMA_VERSION,
    worldCopySha256: fileMeta["world-copy.json"]!.sha256,
  }) : SeasonPortableManifestSchema.parse({
    ...manifestValues,
    archiveVersion: SEASON_PORTABLE_ARCHIVE_VERSION,
    saveSchema: SEASON_SAVE_SCHEMA_VERSION,
  });
  return makeZip([{ name: "manifest.json", data: encoder.encode(canonicalJson(manifest)) }, ...payloads]);
}

export async function readSeasonPortableArchive(bytes: Uint8Array): Promise<{
  state: T20SeasonState;
  summary: SeasonSaveSummary;
  manifest: SeasonPortableManifest | SeasonPortableManifestV2;
  seasonArchive: SeasonArchive | null;
  worldCopy: NewGameWorldCopy | null;
}> {
  const files = parseZip(bytes);
  const allowed = new Set(["manifest.json", "game.json", "events.ndjson", "projection.json", "season-archive.json", "world-copy.json"]);
  for (const name of files.keys()) if (!allowed.has(name)) throw new Error("SEASON_ARCHIVE_FILE_NOT_ALLOWED");
  for (const required of ["manifest.json", "game.json", "events.ndjson", "projection.json"])
    if (!files.has(required)) throw new Error(`SEASON_ARCHIVE_MISSING_${required}`);
  let manifestRaw: unknown;
  try { manifestRaw = JSON.parse(decoder.decode(files.get("manifest.json")!)); } catch { throw new Error("SEASON_ARCHIVE_MANIFEST_JSON_INVALID"); }
  const version = (manifestRaw as { archiveVersion?: unknown } | null)?.archiveVersion;
  if (version !== SEASON_PORTABLE_ARCHIVE_VERSION && version !== SEASON_PRESENTATION_ARCHIVE_VERSION) throw new Error("SEASON_ARCHIVE_VERSION_UNSUPPORTED");
  const manifest = version === SEASON_PRESENTATION_ARCHIVE_VERSION
    ? SeasonPortableManifestV2Schema.parse(manifestRaw)
    : SeasonPortableManifestSchema.parse(manifestRaw);
  if ((manifest.archiveVersion === SEASON_PRESENTATION_ARCHIVE_VERSION) !== files.has("world-copy.json")) throw new Error("SEASON_ARCHIVE_WORLD_COPY_FILE_MISMATCH");
  const actualPayloadNames = [...files.keys()].filter((name) => name !== "manifest.json").sort();
  const declaredNames = Object.keys(manifest.files).sort();
  if (canonicalJson(actualPayloadNames) !== canonicalJson(declaredNames)) throw new Error("SEASON_ARCHIVE_FILE_SET_MISMATCH");
  for (const name of declaredNames) {
    const data = files.get(name);
    if (!data) throw new Error(`SEASON_ARCHIVE_MISSING_${name}`);
    const meta = manifest.files[name]!;
    if (data.length !== meta.bytes || await sha256Bytes(data) !== meta.sha256) throw new Error(`SEASON_ARCHIVE_HASH_MISMATCH_${name}`);
  }
  let worldCopy: NewGameWorldCopy | null = null;
  if (manifest.archiveVersion === SEASON_PRESENTATION_ARCHIVE_VERSION) {
    const payload = files.get("world-copy.json")!;
    if (await sha256Bytes(payload) !== manifest.worldCopySha256) throw new Error("SEASON_ARCHIVE_WORLD_COPY_HASH_MISMATCH");
    let raw: unknown;
    try { raw = JSON.parse(decoder.decode(payload)); } catch { throw new Error("SEASON_ARCHIVE_WORLD_COPY_JSON_INVALID"); }
    worldCopy = await validateStoredWorldCopy(raw);
  }
  let stateRaw: unknown;
  try { stateRaw = JSON.parse(decoder.decode(files.get("game.json")!)); } catch { throw new Error("SEASON_ARCHIVE_GAME_JSON_INVALID"); }
  const state = await validateT20SeasonState(stateRaw);
  const summary = SeasonSaveSummarySchema.parse(manifest.summary);
  if (summary.seasonId !== state.seasonId || summary.stateSha256 !== state.stateSha256 || summary.revision !== state.revision) throw new Error("SEASON_ARCHIVE_SUMMARY_STATE_MISMATCH");
  const eventText = decoder.decode(files.get("events.ndjson")!);
  const eventLines = eventText.length ? eventText.split("\n").filter(Boolean) : [];
  if (eventLines.length !== state.completedMatches.length) throw new Error("SEASON_ARCHIVE_EVENT_COUNT_MISMATCH");
  for (let index = 0; index < eventLines.length; index += 1) {
    let parsed: unknown; try { parsed = JSON.parse(eventLines[index]!); } catch { throw new Error("SEASON_ARCHIVE_EVENT_JSON_INVALID"); }
    if (canonicalJson(parsed) !== canonicalJson(state.completedMatches[index])) throw new Error(`SEASON_ARCHIVE_EVENT_MISMATCH_${index}`);
  }
  let projectionRaw: unknown;
  try { projectionRaw = JSON.parse(decoder.decode(files.get("projection.json")!)); } catch { throw new Error("SEASON_ARCHIVE_PROJECTION_JSON_INVALID"); }
  if (canonicalJson(projectionRaw) !== canonicalJson(state.projection)) throw new Error("SEASON_ARCHIVE_PROJECTION_MISMATCH");
  let seasonArchive: SeasonArchive | null = null;
  if (files.has("season-archive.json")) {
    let raw: unknown; try { raw = JSON.parse(decoder.decode(files.get("season-archive.json")!)); } catch { throw new Error("SEASON_ARCHIVE_FINAL_JSON_INVALID"); }
    seasonArchive = await validateT20SeasonArchive(SeasonArchiveSchema.parse(raw));
    if (seasonArchive.stateSha256 !== state.stateSha256) throw new Error("SEASON_ARCHIVE_FINAL_STATE_MISMATCH");
  }
  if ((state.phase === "COMPLETE") !== Boolean(seasonArchive)) throw new Error("SEASON_ARCHIVE_COMPLETION_PAYLOAD_MISMATCH");
  return { state, summary, manifest, seasonArchive, worldCopy };
}
