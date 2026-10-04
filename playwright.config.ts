import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/smoke",
  projects: [
    { name: "chromium", use: { browserName: "chromium",
      ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { launchOptions: {
        executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE,
      } } : {}),
    } },
    {
      name: "firefox-determinism",
      testMatch: ["determinism.spec.ts", "probability.spec.ts", "generator.spec.ts", "world.spec.ts", "t20-corpus.spec.ts"],
      grep: /Node, browser/,
      use: { browserName: "firefox" },
    },
  ],
  use: { baseURL: "http://127.0.0.1:4173", headless: true },
  webServer: [
    {
      command:
        "npx vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
    {
      command:
        "npx vite preview --config vite.runtime.config.ts --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
