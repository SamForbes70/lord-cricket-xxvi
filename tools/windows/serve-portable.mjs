// Tiny static server for Lord Cricket XXVI. No dependencies. Needs Node 18 or later.
// The game uses web workers, so it must be served over http, not opened from a file.
// In the portable package this file is serve.mjs, next to static-server.mjs and the built game.
import { fileURLToPath } from "node:url";
import { readBuildId, startStaticServer } from "./static-server.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 4180);

startStaticServer({
  root,
  port,
  buildId: await readBuildId(root),
  onListening: (url) => {
    console.log(`Lord Cricket XXVI is running at ${url}/`);
    console.log("Leave this window open while you play. Press Ctrl+C to stop.");
  },
  onError: () => {
    console.error(`Cannot open port ${port}. Close another copy of the game or choose another port.`);
    process.exit(1);
  },
});
