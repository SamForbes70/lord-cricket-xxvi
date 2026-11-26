/** Checks the diagnostic NetLog summary used for the hosted Windows ERR_CONNECTION_FAILED investigation. */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summariseNetLogDirectory } from "../../scripts/chromium-netlog-summary.mjs";

const constants = {
  logEventTypes: { REQUEST_ALIVE: 1, TCP_CONNECT_ATTEMPT: 2, TCP_CONNECT: 3, HTTP_CACHE_OPEN_OR_CREATE_ENTRY: 4, SOCKET_OPEN: 5 },
  logSourceType: { URL_REQUEST: 1, TCP_CONNECT_JOB: 2, UDP_CLIENT_SOCKET: 3 },
  netError: { ERR_CONNECTION_FAILED: -104, ERR_ABORTED: -3, ERR_FAILED: -2, ERR_ADDRESS_UNREACHABLE: -109 },
  timeTickOffset: 1_795_000_000_000,
};
const event = (type: number, sourceId: number, sourceType: number, params?: Record<string, unknown>) =>
  JSON.stringify({ phase: 2, source: { id: sourceId, type: sourceType, start_time: "1" }, time: "1000", type, ...(params ? { params } : {}) });

describe("Chromium NetLog summary", () => {
  it("keeps the operating-system error of a failed connect, ignores routine events and removes the raw log", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lc-netlog-"));
    try {
      const lines = [
        event(2, 7, 2, { net_error: -104, os_error: 10049 }),
        event(3, 7, 2, { net_error: -104 }),
        event(1, 9, 1, { net_error: -3 }),
        event(4, 9, 1, { net_error: -2 }),
        event(5, 11, 3, { net_error: -109 }),
      ];
      // A browser killed mid-run leaves the log without its closing brackets.
      writeFileSync(join(directory, "a.netlog.json"), `{"constants": ${JSON.stringify(constants)},\n"events": [\n${lines.join(",\n")},\n`);
      const out = join(directory, "summary.json");
      const summary = await summariseNetLogDirectory(directory, out);
      expect(summary.totalFailures).toBe(2);
      const file = summary.files[0]!;
      expect(file.complete).toBe(false);
      expect(file.events).toBe(5);
      expect(file.failureCounts).toEqual({ "TCP_CONNECT_ATTEMPT ERR_CONNECTION_FAILED os_error=10049": 1, "TCP_CONNECT ERR_CONNECTION_FAILED os_error=none": 1 });
      expect(file.failingSourceEvents?.map(sample => sample.sourceId)).toEqual([7]);
      expect(JSON.parse(readFileSync(out, "utf8")).version).toBe("LC_CHROMIUM_NETLOG_SUMMARY_V1");
      expect(existsSync(join(directory, "a.netlog.json"))).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("reads a closed log to its end and writes an empty summary when no log exists", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lc-netlog-"));
    try {
      writeFileSync(join(directory, "b.netlog.json"), `{"constants": ${JSON.stringify(constants)},\n"events": [\n${event(1, 3, 1)}],\n"polledData": {}\n}\n`);
      const closed = await summariseNetLogDirectory(directory, join(directory, "s1.json"), { keepRaw: true });
      expect(closed.files[0]).toMatchObject({ complete: true, events: 1, unparsed: 0 });
      expect(existsSync(join(directory, "b.netlog.json"))).toBe(true);
      const empty = await summariseNetLogDirectory(join(directory, "missing"), join(directory, "s2.json"));
      expect(empty).toMatchObject({ files: [], totalFailures: 0 });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
