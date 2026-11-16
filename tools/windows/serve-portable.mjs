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

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
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
