import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  outputDir: "test-results-ui",
  timeout: 180000,
  expect: { timeout: 10000 },
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4180",
    actionTimeout: 10000,
    headless: true,
    viewport: { width: 1366, height: 768 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npx vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 4180 --strictPort",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "docs/verification-pass08/browser-results.json" }],
  ],
});
