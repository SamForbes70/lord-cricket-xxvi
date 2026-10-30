import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/m6f",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: { headless: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
});
