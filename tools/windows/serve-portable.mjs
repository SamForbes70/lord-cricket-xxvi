import { setTimeout } from "node:timers";
// Tiny static server for Lord Cricket XXVI. No dependencies. Needs Node 18 or later.
// The game uses web workers, so it must be served over http, not opened from a file.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || process.argv[2] || 4180);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
};

/**
 * Local-only request guard (audit 16 Nov 2026, Phase 2).
 * - Host must be this server's loopback address: blocks DNS-rebinding pages.
 * - A browser Origin, if present, must be this server's own origin.
 * - Shutdown also needs the X-LCXXVI-Shutdown header, which a cross-site page
 *   cannot send without a CORS preflight this server never approves.
 */
function rejectNonLocal(req, res, listenPort, isShutdown) {
  const allowed = new Set([`127.0.0.1:${listenPort}`, `localhost:${listenPort}`]);
  const host = String(req.headers.host ?? "").toLowerCase();
  const origin = req.headers.origin;
  const originOk = origin === undefined || allowed.has(String(origin).toLowerCase().replace(/^http:\/\//, ""));
  const headerOk = !isShutdown || req.headers["x-lcxxvi-shutdown"] === "1";
  if (allowed.has(host) && originOk && headerOk) return false;
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end("Forbidden");
  return true;
}

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    if (rejectNonLocal(req, res, port, path === "/__lcxxvi-shutdown")) return;
    if (
      path === "/__lcxxvi-health" &&
      (req.method === "GET" || req.method === "HEAD")
    ) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({
              app: "lord-cricket-xxvi",
              status: "ok",
              port,
              pid: process.pid,
            }),
      );
      return;
    }
    if (path === "/__lcxxvi-shutdown" && req.method === "POST") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ stopping: true }));
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 250).unref();
      return;
    }
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(root, normalize(path)));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type":
        types[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Lord Cricket XXVI is running at http://127.0.0.1:${port}/`);
  console.log("Leave this window open while you play. Press Ctrl+C to stop.");
});
