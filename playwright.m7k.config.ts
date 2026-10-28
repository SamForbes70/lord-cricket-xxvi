import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/m7k", timeout: 30000, workers: 1,
  projects: [{ name: "chromium", use: { browserName: "chromium", ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE } } : {}) } }, { name: "firefox", use: { browserName: "firefox" } }],
  use: { headless: true, baseURL: "http://127.0.0.1:4189" },
  webServer: { command: "npx vite preview --config vite.m7k.config.ts --host 127.0.0.1 --port 4189 --strictPort", url: "http://127.0.0.1:4189", reuseExistingServer: false }, reporter: "list" });
