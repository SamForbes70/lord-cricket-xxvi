/**
 * Summarises Chromium NetLog files written by the browser suite (see playwright.ui.config.ts) into one small JSON file,
 * then removes the raw logs, which are too large to keep as CI artifacts.
 *
 * This is a diagnostic for the intermittent hosted Windows `net::ERR_CONNECTION_FAILED` on http://127.0.0.1:4180
 * (docs/verification-pass07a/WINDOWS_CONNECTION_FAILED_2026-11-26.md). Chromium reports any connect error it does not
 * map to a named error as ERR_CONNECTION_FAILED; the NetLog keeps the underlying operating-system error code
 * (`os_error`), which is what the summary records. It changes no test outcome.
 *
 * A browser that is killed leaves its log without the closing brackets, so the reader works line by line and never
 * needs the whole file to be valid JSON.
 */
import { createReadStream, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Errors that are routine in a browser test suite (cancelled loads, closed pages) and say nothing about a connect. */
const ROUTINE = new Set([-1, -3, -400]); // ERR_IO_PENDING, ERR_ABORTED, ERR_CACHE_MISS
/** Disk-cache lookups and Chromium's UDP network-change probe fail routinely and involve no connection to the server. */
const routineEvent = named => String(named.type).startsWith("HTTP_CACHE_") || named.sourceType === "UDP_CLIENT_SOCKET";
const MAX_SAMPLES = 40;
const MAX_EVENTS_PER_SAMPLE = 80;

const invert = map => Object.fromEntries(Object.entries(map ?? {}).map(([name, value]) => [value, name]));

/** Reads one NetLog file and returns its failures, with every event of each failing source for context. */
export async function summariseNetLog(path) {
  let constants = null, eventTypes = {}, sourceTypes = {}, netErrors = {}, timeTickOffset = 0;
  let header = "", inEvents = false, events = 0, firstTime = null, lastTime = null, unparsed = 0, complete = false;
  const failures = [], bySource = new Map(), failingSources = new Set();
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const raw of lines) {
    if (!inEvents) {
      const at = raw.indexOf('"events": [');
      if (at < 0) { header += raw + "\n"; continue; }
      header += raw.slice(0, at);
      try {
        constants = JSON.parse(header.replace(/,\s*$/, "") + "}").constants ?? null;
      } catch { constants = null; }
      eventTypes = invert(constants?.logEventTypes); sourceTypes = invert(constants?.logSourceType); netErrors = invert(constants?.netError);
      timeTickOffset = Number(constants?.timeTickOffset ?? 0);
      inEvents = true;
      continue;
    }
    let line = raw.trim();
    // A closed log ends its events with `]` (on the last event's line or its own) and then `"polledData"`.
    if (line.startsWith('"polledData"') || line.startsWith("]")) { complete = true; break; }
    line = line.replace(/,$/, "");
    if (line.endsWith("}]")) { line = line.slice(0, -1); complete = true; }
    if (!line.startsWith("{")) continue;
    let event;
    try { event = JSON.parse(line); } catch { unparsed++; continue; }
    events++;
    const time = Number(event.time);
    if (Number.isFinite(time)) { firstTime ??= time; lastTime = time; }
    const sourceId = event.source?.id;
    const named = {
      wallTimeUtc: Number.isFinite(time) ? new Date(time + timeTickOffset).toISOString() : null,
      type: eventTypes[event.type] ?? event.type, phase: event.phase,
      sourceId, sourceType: sourceTypes[event.source?.type] ?? event.source?.type, params: event.params,
    };
    if (sourceId !== undefined && (bySource.has(sourceId) || bySource.size < 200_000)) {
      const list = bySource.get(sourceId) ?? [];
      if (list.length < MAX_EVENTS_PER_SAMPLE) list.push(named);
      bySource.set(sourceId, list);
    }
    const netError = event.params?.net_error;
    const osError = event.params?.os_error;
    if (!routineEvent(named) && ((typeof netError === "number" && netError < 0 && !ROUTINE.has(netError)) || (typeof osError === "number" && osError !== 0))) {
      failures.push({ ...named, netErrorName: netErrors[netError] ?? null, osError: osError ?? null });
      if (sourceId !== undefined) failingSources.add(sourceId);
    }
  }
  const counts = {};
  for (const failure of failures) {
    const key = `${failure.type} ${failure.netErrorName ?? failure.params?.net_error ?? ""} os_error=${failure.osError ?? "none"}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const samples = [...failingSources].slice(0, MAX_SAMPLES).map(id => ({ sourceId: id, events: bySource.get(id) ?? [] }));
  return {
    file: path, bytes: statSync(path).size, complete, events, unparsed,
    firstEventUtc: firstTime === null ? null : new Date(firstTime + timeTickOffset).toISOString(),
    lastEventUtc: lastTime === null ? null : new Date(lastTime + timeTickOffset).toISOString(),
    failureCounts: counts, failures: failures.slice(0, 200), failingSourceEvents: samples,
  };
}

/** Summarises every `*.netlog.json` in `directory` into `outFile`; removes the raw logs unless `keepRaw`. */
export async function summariseNetLogDirectory(directory, outFile, { keepRaw = false } = {}) {
  let names = [];
  try { names = readdirSync(directory).filter(name => name.endsWith(".netlog.json")).sort(); } catch { names = []; }
  const files = [];
  for (const name of names) {
    const path = join(directory, name);
    try { files.push(await summariseNetLog(path)); } catch (error) { files.push({ file: path, error: error.message }); }
  }
  const summary = {
    version: "LC_CHROMIUM_NETLOG_SUMMARY_V1",
    purpose: "Diagnostic only: records the operating-system error behind any failed Chromium connection in the browser suite.",
    generatedAtUtc: new Date().toISOString(), directory, rawLogsKept: keepRaw, files,
    totalFailures: files.reduce((sum, file) => sum + (file.failures?.length ?? 0), 0),
  };
  writeFileSync(outFile, JSON.stringify(summary, null, 2) + "\n");
  if (!keepRaw) for (const name of names) rmSync(join(directory, name), { force: true });
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, outFile, ...rest] = process.argv.slice(2);
  if (!directory || !outFile || rest.some(flag => flag !== "--keep-raw")) throw new Error("usage: chromium-netlog-summary.mjs <dir> <out.json> [--keep-raw]");
  const summary = await summariseNetLogDirectory(directory, outFile, { keepRaw: rest.includes("--keep-raw") });
  console.log(`Chromium NetLog summary: ${summary.files.length} file(s), ${summary.totalFailures} failed network event(s) -> ${outFile}`);
}
