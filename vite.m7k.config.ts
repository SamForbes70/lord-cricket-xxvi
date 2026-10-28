import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ plugins: [{ name: "research-index", generateBundle() {
  this.emitFile({ type: "asset", fileName: "index.html", source: `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'"><title>M7K research acceptance</title><script src="./m7k-browser.js"></script>` });
} }], build: { outDir: "tests/m7k/dist", emptyOutDir: true,
  lib: { entry: resolve("tests/m7k/research.browser.ts"), name: "M7KResearch", formats: ["iife"], fileName: () => "m7k-browser.js" }, minify: false } });
