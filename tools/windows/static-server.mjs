import { setTimeout } from "node:timers";
// The one static server for Lord Cricket XXVI (audit Phase 5): used by start.mjs in the source tree and by
// serve.mjs in the portable package. No dependencies; needs Node 18 or later. The C# launcher has its own.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

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
  const originOk =
    origin === undefined || allowed.has(String(origin).toLowerCase().replace(/^http:\/\//, ""));
  const headerOk = !isShutdown || req.headers["x-lcxxvi-shutdown"] === "1";
  if (allowed.has(host) && originOk && headerOk) return false;
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end("Forbidden");
  return true;
}

/** The build id from offline-manifest.json, or null when the build has none. */
export async function readBuildId(root) {
  try {
    const manifest = JSON.parse(await readFile(resolve(root, "offline-manifest.json"), "utf8"));
    return typeof manifest?.buildId === "string" ? manifest.buildId : null;
  } catch {
    return null;
  }
}

/**
 * Serves `root` on 127.0.0.1:`port`, with the health and shutdown endpoints the launchers use.
 * Only GET and HEAD are served; a path ending in "/" serves its index.html; nothing outside `root`.
 */
export function startStaticServer({ root, port, buildId = null, onListening, onError }) {
  const rootPath = resolve(root);
  const rootWithSep = rootPath.endsWith(sep) ? rootPath : rootPath + sep;
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      if (rejectNonLocal(req, res, port, pathname === "/__lcxxvi-shutdown")) return;

      if (pathname === "/__lcxxvi-health" && (req.method === "GET" || req.method === "HEAD")) {
        const payload = JSON.stringify({ app: "lord-cricket-xxvi", status: "ok", port, pid: process.pid, buildId });
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? undefined : payload);
        return;
      }

      if (pathname === "/__lcxxvi-shutdown" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ stopping: true }));
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 250).unref();
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }

      const path = resolve(rootPath, "." + (pathname.endsWith("/") ? `${pathname}index.html` : pathname));
      if (path !== rootPath && !path.startsWith(rootWithSep)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
      const info = await stat(path);
      if (!info.isFile()) throw new Error("not a file");
      const bytes = await readFile(path);
      res.writeHead(200, {
        "Content-Type": types[extname(path).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });
  server.on("error", (error) => {
    if (onError) onError(error);
    else throw error;
  });
  server.listen(port, "127.0.0.1", () => onListening?.(`http://127.0.0.1:${port}`));
  return server;
}
