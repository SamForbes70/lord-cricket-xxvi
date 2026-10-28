import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/acceptance", timeout: 300000, workers: 1,
  projects: [{ name: "chromium", use: { browserName: "chromium", ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE } } : {}) } }, { name: "firefox", use: { browserName: "firefox" } }],
  use: { headless: true, baseURL: "http://127.0.0.1:4191", viewport: { width: 1366, height: 768 } },
  webServer: [{ command: "npx vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 4191 --strictPort", url: "http://127.0.0.1:4191", reuseExistingServer: false }, { command: "npx vite preview --config vite.acceptance.config.ts --host 127.0.0.1 --port 4192 --strictPort", url: "http://127.0.0.1:4192", reuseExistingServer: false }], reporter: "list" });
