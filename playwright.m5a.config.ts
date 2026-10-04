import { defineConfig } from "@playwright/test";
const executablePath = process.env.LCXXVI_CHROMIUM_PATH;
export default defineConfig({
  testDir: "./tests/m5",
  outputDir: "test-results-m5a",
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  projects: [
    {
      name: "chromium-m5a",
      use: {
        browserName: "chromium",
        ...(executablePath
          ? { launchOptions: { executablePath, args: ["--no-sandbox"] } }
          : {}),
      },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4200",
    headless: true,
    viewport: { width: 1366, height: 768 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npx vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 4200 --strictPort",
    url: "http://127.0.0.1:4200",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "docs/verification-pass10/m5a-browser-results.json" },
    ],
  ],
});
