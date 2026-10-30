import { defineConfig } from "@playwright/test";
import base from "./playwright.m4.config.js";

export default defineConfig({
  ...base,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  use: { ...base.use, baseURL: "http://127.0.0.1:4173" },
  webServer: { command: "npx vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173", reuseExistingServer: false },
  reporter: "list",
});
