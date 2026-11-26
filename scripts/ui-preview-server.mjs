/**
 * Starts `vite preview` for the browser suite (playwright.ui.config.ts) and, when LCXXVI_PREVIEW_SERVER_LOG is set,
 * records the server's life in that file: start, process id, its own output, any exit code or signal, and a liveness
 * probe every 15 seconds that logs each failed probe with its error code.
 *
 * Diagnostic for the intermittent hosted Windows `net::ERR_CONNECTION_FAILED` on http://127.0.0.1:4180
 * (docs/verification-pass07a/WINDOWS_CONNECTION_FAILED_2026-11-26.md). It serves the same build with the same
 * arguments as before and changes no test outcome. Lines are appended as they happen, because Playwright stops the
 * server with a forced process-tree kill on Windows, which runs no exit handler.
 */
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { clearInterval, setInterval } from "node:timers";

const host = "127.0.0.1";
const port = Number(process.env.LCXXVI_PREVIEW_PORT ?? 4180);
const logPath = process.env.LCXXVI_PREVIEW_SERVER_LOG;
const record = (kind, detail = {}) => {
  if (!logPath) return;
  try { appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), kind, ...detail }) + "\n"); } catch { /* diagnostics must never stop the server */ }
};

const vite = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const args = [vite, "preview", "--config", "apps/web/vite.config.ts", "--host", host, "--port", String(port), "--strictPort"];
const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
record("start", { wrapperPid: process.pid, serverPid: child.pid, node: process.version, platform: process.platform, args: args.slice(1) });
child.stdout.on("data", chunk => { process.stdout.write(chunk); record("stdout", { text: String(chunk).slice(0, 4000) }); });
child.stderr.on("data", chunk => { process.stderr.write(chunk); record("stderr", { text: String(chunk).slice(0, 4000) }); });
child.on("error", error => { record("spawn-error", { message: error.message, code: error.code }); process.exitCode = 1; });

let probes = 0, probeFailures = 0;
const probe = () => {
  const started = Date.now();
  const req = request({ host, port, path: "/", method: "HEAD", agent: false, timeout: 10_000 }, response => {
    response.resume();
    probes++;
    if (response.statusCode !== 200) { probeFailures++; record("probe-status", { status: response.statusCode, ms: Date.now() - started }); }
  });
  req.on("timeout", () => req.destroy(Object.assign(new Error("probe timed out"), { code: "PROBE_TIMEOUT" })));
  req.on("error", error => { probes++; probeFailures++; record("probe-error", { code: error.code ?? null, errno: error.errno ?? null, syscall: error.syscall ?? null, message: error.message, ms: Date.now() - started }); });
  req.end();
};
// The first probe waits for the server to say it is listening; Playwright waits on its own URL check as before.
let timer = null;
const startProbes = () => { if (logPath && !timer) { timer = setInterval(probe, 15_000); timer.unref(); } };
child.stdout.once("data", startProbes);
const summary = setInterval(() => record("probe-summary", { probes, probeFailures }), 300_000);
summary.unref();

child.on("exit", (code, signal) => {
  record("server-exit", { code, signal, probes, probeFailures });
  if (timer) clearInterval(timer);
  process.exitCode = code ?? 1;
});
for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(name, () => { record("wrapper-signal", { signal: name, probes, probeFailures }); child.kill(name); });
}
