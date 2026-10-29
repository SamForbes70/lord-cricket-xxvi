import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ worker: { format: "es" }, plugins: [{ name: "acceptance-index", generateBundle() {
  this.emitFile({ type: "asset", fileName: "index.html", source: `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self'"><title>Acceptance engine probe</title><script type="module" src="./engine-browser.js"></script>` });
} }], build: { outDir: "tests/acceptance/dist", emptyOutDir: true, lib: { entry: resolve("tests/acceptance/engine.browser.ts"), name: "AcceptanceEngine", formats: ["es"], fileName: () => "engine-browser.js" }, minify: false } });
