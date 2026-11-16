import { setTimeout } from "node:timers";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";

const root = fileURLToPath(new URL("./apps/web/dist/", import.meta.url));
const port = Number(process.env.PORT ?? 4180);
const openOnStart =
  process.argv.includes("--open") || process.env.LCXXVI_OPEN_BROWSER === "1";

const mime = {
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

try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error(
    "The prebuilt app is missing. From the source package, run npm ci and npm run build first, or double-click Play-Lord-Cricket.bat on Windows.",
  );
  process.exit(1);
}

let buildId = null;
try {
  const manifest = JSON.parse(
    await readFile(resolve(root, "offline-manifest.json"), "utf8"),
  );
  if (typeof manifest?.buildId === "string") buildId = manifest.buildId;
} catch {
  buildId = null;
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Non-fatal in headless environments
  }
}

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );

    if (
      pathname === "/__lcxxvi-health" &&
      (req.method === "GET" || req.method === "HEAD")
    ) {
      const payload = JSON.stringify({
        app: "lord-cricket-xxvi",
        status: "ok",
        port,
        pid: process.pid,
        buildId,
      });
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : payload);
      return;
    }

    if (pathname === "/__lcxxvi-shutdown" && req.method === "POST") {
      const remote = req.socket.remoteAddress ?? "";
      if (
        remote !== "127.0.0.1" &&
        remote !== "::1" &&
        remote !== "::ffff:127.0.0.1"
      ) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
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

    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    const rootWithSep = root.endsWith(sep) ? root : root + sep;
    if (path !== root && !path.startsWith(rootWithSep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type":
        mime[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.on("error", () => {
  console.error(
    `Cannot open port ${port}. Close another instance or set PORT to an unused local port.`,
  );
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `Lord Cricket XXVI: ${url}\nLocal autosave enabled: reload resumes the last durable checkpoint. Keep this terminal open. Ctrl+C stops the server.`,
  );
  if (openOnStart) openBrowser(url);
});
