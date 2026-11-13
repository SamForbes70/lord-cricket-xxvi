import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

function collectDistFiles(dir: string, rootDir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) found.push(...collectDistFiles(full, rootDir));
    else found.push("/" + relative(rootDir, full).replace(/\\/g, "/"));
  }
  return found.sort();
}

function offlineAssetsPlugin(): Plugin {
  return {
    name: "lcxxvi-offline-assets",
    closeBundle() {
      const outDir = join(process.cwd(), "apps/web/dist");
      // Vite resolves build.outDir relative to root ("apps/web") unless overridden.
      let targetDir = outDir;
      try {
        statSync(join(targetDir, "index.html"));
      } catch {
        targetDir = join(process.cwd(), "dist");
      }
      try {
        statSync(join(targetDir, "index.html"));
      } catch {
        return;
      }
      const files = collectDistFiles(targetDir, targetDir).filter(
        p => p !== "/sw.js" && p !== "/offline-manifest.json",
      );
      const hash = createHash("sha256");
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(targetDir, f.slice(1))));
      }
      const buildId = hash.digest("hex").slice(0, 16);
      const manifest = {
        manifestVersion: "LC_OFFLINE_ASSET_MANIFEST_V1",
        buildId,
        supportedEngines: ["LC_T20_MATCH_V1", "LC_ODI_MATCH_V1", "LC_RED5_MATCH_V1"],
        recoveryBuildPath: "/engineering.html",
        assets: ["/", ...files],
      };
      writeFileSync(
        join(targetDir, "offline-manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      const swSource = `// Auto-generated deterministic offline shell for Lord Cricket XXVI (${buildId})
const CACHE_PREFIX = "lcxxvi-offline-";
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(buildId)};
const MAX_RETAINED_ENGINE_CACHES = 2;
const PRECACHE_URLS = ${JSON.stringify(["/offline-manifest.json", ...manifest.assets])};

self.addEventListener("install", event => {
  // Never call skipWaiting() automatically: updates are offered outside active transactions.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((
    async () => {
      const keys = (await caches.keys()).filter(k => k.startsWith(CACHE_PREFIX)).sort();
      if (keys.length > MAX_RETAINED_ENGINE_CACHES) {
        const stale = keys.slice(0, keys.length - MAX_RETAINED_ENGINE_CACHES).filter(k => k !== CACHE_NAME);
        await Promise.all(stale.map(k => caches.delete(k)));
      }
      await self.clients.claim();
    }
  )());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "LCXXVI_APPLY_SAFE_UPDATE") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((
    async () => {
      const cached = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok && url.pathname.startsWith("/assets/")) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, net.clone());
        }
        return net;
      } catch (err) {
        if (req.mode === "navigate") {
          const fallback = await caches.match(url.pathname === "/engineering.html" ? "/engineering.html" : "/index.html");
          if (fallback) return fallback;
        }
        throw err;
      }
    }
  )());
});
`;
      writeFileSync(join(targetDir, "sw.js"), swSource);
    },
  };
}

export default defineConfig({
  root: "apps/web",
  plugins: [offlineAssetsPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "apps/web/index.html",
        engineering: "apps/web/engineering.html",
      },
    },
  },
  server: { host: "127.0.0.1" },
});
