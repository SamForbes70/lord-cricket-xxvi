import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/m6f",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: { headless: true, launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
