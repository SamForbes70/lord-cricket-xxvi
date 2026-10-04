import { defineConfig } from "vite";
export default defineConfig({
  root: "tests/runtime",
  build: { outDir: "dist", emptyOutDir: true },
  worker: { format: "es" },
});
