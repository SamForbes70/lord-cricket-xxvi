import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  build: {
    outDir: "tests/m6f/dist",
    emptyOutDir: true,
    lib: { entry: resolve(__dirname, "tests/m6f/season-persistence.browser.ts"), name: "LcxxviSeasonPersistenceM6F", formats: ["iife"], fileName: () => "season-persistence-browser.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false,
  },
});
