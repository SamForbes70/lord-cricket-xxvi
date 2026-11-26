import { defineConfig } from "@playwright/test";
import { join } from "node:path";
const chromiumExecutable = process.env.LCXXVI_CHROMIUM_EXECUTABLE;
// Diagnostic for the intermittent hosted Windows net::ERR_CONNECTION_FAILED
// (docs/verification-pass07a/WINDOWS_CONNECTION_FAILED_2026-11-26.md): when the acceptance runner sets this folder,
// Chromium writes a NetLog there, which keeps the operating-system error behind a failed connection. Each test worker
// loads this file afresh, so a browser restarted after a failure writes a new file.
const netLogDirectory = process.env.LCXXVI_CHROMIUM_NETLOG_DIR;
const chromiumArgs = [
  ...(chromiumExecutable ? ["--no-sandbox"] : []),
  ...(netLogDirectory
    ? [
        `--log-net-log=${join(netLogDirectory, `chromium-${process.pid}-${Date.now()}.netlog.json`)}`,
        "--net-log-capture-mode=Default",
      ]
    : []),
];
export default defineConfig({
  testDir: "./tests/ui",
  outputDir: "test-results-ui",
  timeout: 180000,
  expect: { timeout: 10000 },
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(chromiumExecutable || chromiumArgs.length
          ? {
              launchOptions: {
                ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
                args: chromiumArgs,
              },
            }
          : {}),
      },
    },
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
    // The same `vite preview` as before, through a wrapper that can log the server's exit and liveness.
    command: "node scripts/ui-preview-server.mjs",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "docs/verification-pass09/ui-browser-results.json" },
    ],
  ],
});
