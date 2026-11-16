#!/usr/bin/env node
/**
 * Packages the built game into a zip that can be unpacked and run on a laptop.
 *
 *   npm run build
 *   node scripts/package-game.mjs [outputDirectory]
 *
 * Output (default: release-packages/):
 *   lord-cricket-xxvi-game-<commit>.zip     the built game, local servers, and double-click Windows/POSIX launchers
 *   lord-cricket-xxvi-source-<commit>.zip   git archive of the tested commit (needs a git checkout)
 */
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = resolve(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
);
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

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data, mode } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const body = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x031e, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(((mode ?? 0o644) << 16) >>> 0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, end]);
}
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const folder = "lord-cricket-xxvi-game";
const files = walk(dist)
  .sort()
  .map((p) => ({
    name: `${folder}/${relative(dist, p).split(sep).join("/")}`,
    data: readFileSync(p),
  }));

const serve = readFileSync(
  join(root, "tools", "windows", "serve-portable.mjs"),
  "utf8",
);
const staticServer = readFileSync(
  join(root, "tools", "windows", "static-server.mjs"),
  "utf8",
);
const startWindowsPs1 = readFileSync(
  join(root, "tools", "windows", "start-windows.ps1"),
  "utf8",
).replace(/\r?\n/g, "\r\n");
const launcherCs = readFileSync(
  join(root, "tools", "windows", "LordCricketLauncher.cs"),
  "utf8",
).replace(/\r?\n/g, "\r\n");

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

const playBat = [
  "@echo off",
  "setlocal EnableExtensions",
  'cd /d "%~dp0"',
  "title Lord Cricket XXVI",
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1" %*',
  "if errorlevel 1 (",
  "  echo.",
  "  echo Launch failed. Review the message above before closing.",
  "  pause",
  "  exit /b 1",
  ")",
  "exit /b 0",
  "",
].join("\r\n");

const startBat = ["@echo off", 'call "%~dp0Play-Lord-Cricket.bat" %*', ""].join(
  "\r\n",
);

const stopBat = [
  "@echo off",
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1" -Stop',
  "",
].join("\r\n");

const buildExeBat = [
  "@echo off",
  "setlocal EnableExtensions",
  'cd /d "%~dp0"',
  'set "CSC=%WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"',
  'if not exist "%CSC%" set "CSC=%WINDIR%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"',
  'if not exist "%CSC%" ( echo .NET Framework 4.x csc.exe not found. & pause & exit /b 1 )',
  '"%CSC%" /nologo /optimize+ /target:winexe /out:"%~dp0LordCricketXXVI.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "%~dp0LordCricketLauncher.cs"',
  "if errorlevel 1 ( pause & exit /b 1 )",
  "echo Built LordCricketXXVI.exe successfully. Double-click LordCricketXXVI.exe to play.",
  "",
].join("\r\n");

let record = null;
try {
  record = JSON.parse(
    readFileSync(join(root, "docs", "release-v01", "RELEASE_RECORD.json"), "utf8"),
  );
} catch {
  // optional
}
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
const readme = `LORD CRICKET XXVI - playable build (Stages 1-10)
================================================

Offline cricket management game: persistent multi-season 8-club T20 career world (player lifecycle, youth academy,
contracts & budgets, tactical briefings, 2D live field, contextual commentary, optional procedural audio/narration,
historical statistics & leaderboards, and match/season awards) plus T20, ODI, and five-day red-ball exhibitions.

How to play on Windows (ZERO extra installs required on Windows 10/11)
  1. Extract this entire ZIP to a folder on your laptop (do not double-click inside the unextracted ZIP preview).
  2. Double-click Play-Lord-Cricket.bat (or start-game.bat).
     - Uses Node.js 18+ if installed, real Python 3 if installed, or automatically compiles and launches
       LordCricketXXVI.exe using Windows' built-in .NET Framework 4.x compiler (no downloads needed).
     - Opens http://127.0.0.1:4180/ in a standalone Edge/Chrome app window.
     - To stop a background server later, double-click Stop-Lord-Cricket.bat (or right-click the tray icon -> Quit Server).
     - Optional: double-click Build-Exe.bat to create LordCricketXXVI.exe directly.

How to play on Mac/Linux (needs Node.js 18+ or Python 3)
  Run ./start-game.sh (or: bash start-game.sh)

Your saves live in your browser (IndexedDB), tied to http://127.0.0.1:4180. Use the game's Export buttons to keep
.lcxxvi backups.
`;

for (const [name, text, mode] of [
  ["serve.mjs", serve, 0o644],
  ["static-server.mjs", staticServer, 0o644],
  ["start-game.sh", startSh, 0o755],
  ["Play-Lord-Cricket.bat", playBat, 0o644],
  ["start-game.bat", startBat, 0o644],
  ["Stop-Lord-Cricket.bat", stopBat, 0o644],
  ["Build-Exe.bat", buildExeBat, 0o644],
  ["start-windows.ps1", startWindowsPs1, 0o644],
  ["LordCricketLauncher.cs", launcherCs, 0o644],
  ["README.txt", readme, 0o644],
  ["VERSION.txt", version, 0o644],
]) {
  files.push({ name: `${folder}/${name}`, data: Buffer.from(text, "utf8"), mode });
}

mkdirSync(outDir, { recursive: true });
const gameZip = join(outDir, `lord-cricket-xxvi-game-${short}.zip`);
writeFileSync(gameZip, zip(files));
console.log(`Wrote ${gameZip}`);

const sourceZip = join(outDir, `lord-cricket-xxvi-source-${short}.zip`);
const archive = git([
  "archive",
  "--format=zip",
  "--prefix=lord-cricket-xxvi-source/",
  "-o",
  sourceZip,
  "HEAD",
]);
if (archive.status === 0) console.log(`Wrote ${sourceZip}`);
else console.warn("Skipped the source zip (git archive failed; is this a git checkout?)");
if (dirty)
  console.warn(
    "Warning: the working tree has uncommitted changes; the packages do not record a clean tested commit.",
  );
