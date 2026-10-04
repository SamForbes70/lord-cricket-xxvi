import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
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
