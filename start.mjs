import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep, extname } from "node:path";
const root = fileURLToPath(new URL("./apps/web/dist/", import.meta.url));
const port = Number(process.env.PORT ?? 4180);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error(
    "The prebuilt app is missing. From the source package, run npm ci and npm run build first.",
  );
  process.exit(1);
}
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
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
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Lord Cricket XXVI: http://127.0.0.1:${port}\nLocal autosave enabled: reload resumes the last durable checkpoint. Keep this terminal open. Ctrl+C stops the server.`,
  ),
);
