import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readBuildId, startStaticServer } from "./tools/windows/static-server.mjs";

const root = fileURLToPath(new URL("./apps/web/dist/", import.meta.url));
const port = Number(process.env.PORT ?? 4180);
const openOnStart =
  process.argv.includes("--open") || process.env.LCXXVI_OPEN_BROWSER === "1";

try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error(
    "The prebuilt app is missing. From the source package, run npm ci and npm run build first, or double-click Play-Lord-Cricket.bat on Windows.",
  );
  process.exit(1);
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

startStaticServer({
  root,
  port,
  buildId: await readBuildId(root),
  onListening: (url) => {
    console.log(
      `Lord Cricket XXVI: ${url}\nLocal autosave enabled: reload resumes the last durable checkpoint. Keep this terminal open. Ctrl+C stops the server.`,
    );
    if (openOnStart) openBrowser(url);
  },
  onError: () => {
    console.error(
      `Cannot open port ${port}. Close another instance or set PORT to an unused local port.`,
    );
    process.exit(1);
  },
});
