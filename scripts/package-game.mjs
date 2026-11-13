#!/usr/bin/env node
/**
 * Packages the built game into a zip that can be unpacked and run on a laptop.
 *
 *   npm run build
 *   node scripts/package-game.mjs [outputDirectory]
 *
 * Output (default: release-packages/):
 *   lord-cricket-xxvi-game-<commit>.zip     the built game, a tiny local web server and launchers
 *   lord-cricket-xxvi-source-<commit>.zip   `git archive` of the tested commit (needs a git checkout)
 *
 * The game must be served over http (it uses web workers), so the package carries `serve.mjs`, a dependency-free
 * static server, plus start-game.bat and start-game.sh. VERSION.txt records the commit, the model status, the
 * known limits and the recovery instructions from docs/release-v01/RELEASE_RECORD.json. No third-party packages.
 */
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dist = join(root, "apps", "web", "dist");
const outDir = resolve(process.argv[2] ?? join(root, "release-packages"));

if (!existsSync(join(dist, "index.html"))) {
  console.error("The built game is missing. Run `npm run build` first.");
  process.exit(1);
}

const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
const commit = git(["rev-parse", "HEAD"]).stdout?.trim() || "unknown";
const short = commit.slice(0, 7);
const dirty = (git(["status", "--porcelain"]).stdout ?? "").trim() !== "";

// ---- minimal ZIP writer (deflate), so the script needs no packages ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const chunks = []; const central = []; let offset = 0;
  for (const { name, data, mode } of entries) {
    const nameBytes = Buffer.from(name, "utf8"); const crc = crc32(data); const body = deflateRawSync(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, body);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(0x031e, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x21, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(((mode ?? 0o644) << 16) >>> 0, 38); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBytes); offset += local.length + nameBytes.length + body.length;
  }
  const cdBuf = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, end]);
}
function walk(dir) { return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }

// ---- the playable package ----
const folder = "lord-cricket-xxvi-game";
const files = walk(dist).sort().map((p) => ({ name: `${folder}/${relative(dist, p).split(sep).join("/")}`, data: readFileSync(p) }));

const serve = `// Tiny static server for Lord Cricket XXVI. No dependencies. Needs Node 18 or later.
// The game uses web workers, so it must be served over http, not opened from a file.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || process.argv[2] || 4180);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(root, normalize(path)));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end("Forbidden"); return; }
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    res.writeHead(200, { "Content-Type": types[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); }
}).listen(port, "127.0.0.1", () => {
  console.log(\`Lord Cricket XXVI is running at http://127.0.0.1:\${port}/\`);
  console.log("Leave this window open while you play. Press Ctrl+C to stop.");
});
`;
const startSh = `#!/usr/bin/env bash
# Starts Lord Cricket XXVI on http://127.0.0.1:4180/ and opens it in your browser if it can.
cd "$(dirname "$0")" || exit 1
PORT="\${PORT:-4180}"
URL="http://127.0.0.1:\${PORT}/"
(sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true) &
if command -v node >/dev/null 2>&1; then exec node serve.mjs "$PORT"
elif command -v python3 >/dev/null 2>&1; then echo "Serving $URL (Ctrl+C to stop)"; exec python3 -m http.server "$PORT" --bind 127.0.0.1
else echo "Install Node.js 18 or later (https://nodejs.org) or Python 3, then run this again."; exit 1; fi
`;
const startBat = ["@echo off", 'cd /d "%~dp0"', "set PORT=4180", "where node >nul 2>nul", "if %errorlevel%==0 (",
  '  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%PORT%/"', "  node serve.mjs %PORT%", "  goto :end", ")",
  "where python >nul 2>nul", "if %errorlevel%==0 (", '  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%PORT%/"',
  "  echo Serving http://127.0.0.1:%PORT%/ - leave this window open. Press Ctrl+C to stop.", "  python -m http.server %PORT% --bind 127.0.0.1", "  goto :end", ")",
  "echo Install Node.js 18 or later from https://nodejs.org or Python 3, then run this again.", ":end", "pause", ""].join("\r\n");

let record = null;
try { record = JSON.parse(readFileSync(join(root, "docs", "release-v01", "RELEASE_RECORD.json"), "utf8")); } catch { /* optional */ }
const list = (items) => (items ?? []).map((t) => `  - ${t}`).join("\n");
const version = `Lord Cricket XXVI playable build
Repository : https://github.com/SamForbes70/lord-cricket-xxvi
Commit     : ${commit}${dirty ? " (working tree had uncommitted changes when packaged)" : ""}
Model      : ${record?.modelStatus ?? "SYNTHETIC_ALPHA"} (not empirically calibrated)
Packaged by: node scripts/package-game.mjs

Known limits (from docs/release-v01/RELEASE_RECORD.json)
${list(record?.knownLimits)}

Recovery instructions
${list(record?.recoveryInstructions)}

Public deployment is not authorised by this package.
`;
const readme = `LORD CRICKET XXVI - playable build
===================================

An ALPHA with a synthetic model: a fictional eight-team, 14-round, 56-fixture T20 season plus T20, ODI and five-day
exhibitions. It is not calibrated to real cricket and it is not a finished game. See VERSION.txt for the commit,
the known limits and recovery instructions.

How to play (needs Node.js 18 or later, or Python 3)
  Windows   : double-click start-game.bat
  Mac/Linux : run  ./start-game.sh   (or: bash start-game.sh)
  Then open http://127.0.0.1:4180/ in Chrome, Edge or Firefox if it did not open by itself.
  Leave the window open while you play. Ctrl+C stops it. If the page is blank the first time, refresh once.

You cannot just double-click index.html: the game uses web workers, which browsers only allow over http, so it is
served by the small local server in this folder. Nothing is uploaded.

Your saves live in your browser (IndexedDB), tied to http://127.0.0.1:4180. A different port or address, or clearing
site data, hides or deletes them. Use the game's Export buttons to keep .lcxxvi backups.
`;
for (const [name, text, mode] of [["serve.mjs", serve, 0o644], ["start-game.sh", startSh, 0o755], ["start-game.bat", startBat, 0o644], ["README.txt", readme, 0o644], ["VERSION.txt", version, 0o644]])
  files.push({ name: `${folder}/${name}`, data: Buffer.from(text, "utf8"), mode });

mkdirSync(outDir, { recursive: true });
const gameZip = join(outDir, `lord-cricket-xxvi-game-${short}.zip`);
writeFileSync(gameZip, zip(files));
console.log(`Wrote ${gameZip}`);

// ---- the source package (git archive of the tested commit) ----
const sourceZip = join(outDir, `lord-cricket-xxvi-source-${short}.zip`);
const archive = git(["archive", "--format=zip", `--prefix=lord-cricket-xxvi-source/`, "-o", sourceZip, "HEAD"]);
if (archive.status === 0) console.log(`Wrote ${sourceZip}`);
else console.warn("Skipped the source zip (git archive failed; is this a git checkout?)");
if (dirty) console.warn("Warning: the working tree has uncommitted changes; the packages do not record a clean tested commit.");
