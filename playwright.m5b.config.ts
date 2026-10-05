import { defineConfig } from "@playwright/test";
const executablePath = process.env.LCXXVI_CHROMIUM_PATH;
export default defineConfig({
  testDir: "./tests/m5",
  testMatch: "red5-ui.spec.ts",
  outputDir: "test-results-m5b",
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  projects: [
    {
      name: "chromium-m5b",
      use: {
        browserName: "chromium",
        ...(executablePath
          ? { launchOptions: { executablePath, args: ["--no-sandbox"] } }
          : {}),
      },
    },
    {
      name: "firefox-m5b",
      use: { browserName: "firefox" },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4201",
    headless: true,
    viewport: { width: 1366, height: 768 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npx vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 4201 --strictPort",
    url: "http://127.0.0.1:4201",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "docs/verification-pass11/m5b-browser-results.json" },
    ],
  ],
});
