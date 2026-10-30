import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const bundle = readFileSync("tests/m6f/dist/season-persistence-browser.js", "utf8");
const stateJson = readFileSync("tests/fixtures/season/persistence-active-state.json", "utf8");

test("M6F IndexedDB season commits are atomic and recover from previous generation", async ({ page }) => {
  await page.route("https://lcxxvi.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/bundle.js") return route.fulfill({ status: 200, contentType: "application/javascript", body: bundle });
    if (url.pathname === "/state.json") return route.fulfill({ status: 200, contentType: "application/json", body: stateJson });
    return route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><script src="/bundle.js"></script>' });
  });
  await page.goto("https://lcxxvi.test/");
  await page.waitForFunction(() => typeof window.runSeasonPersistenceBrowser === "function");
  const result = await page.evaluate(async () => {
    const state = await fetch("/state.json").then((response) => response.json());
    return window.runSeasonPersistenceBrowser!(state);
  });
  const record = result as Record<string, unknown>;
  expect(record).toMatchObject({
    acquired: true,
    beforeAbortRevision: 6,
    afterAbortRevision: 6,
    secondOwnerWhileLocked: false,
    recovered: true,
    recoveredRevision: 5,
    recoveredGeneration: 1,
    corruptedGenerations: [2],
    summaryCount: 1,
    activeSaveId: "season-browser-save",
    acquiredAfterRelease: true,
    copySaveAfterAbort: null,
    orphanPackAfterAbort: null,
    copyRecovered: true,
    copyRecoveredRevision: 4,
    copyRecoveredTeam: "Harbour XI",
  });
  expect(String(record.abortCode)).toContain("SEASON_SAVE_INJECTED_ABORT");
  expect(String(record.duplicateCode)).toContain("SEASON_SAVE_DUPLICATE_COMMAND_ALREADY_COMMITTED");
  expect(String(record.copyAbort)).toContain("SEASON_SAVE_INJECTED_ABORT");
  expect(String(record.immutableCode)).toContain("SEASON_WORLD_COPY_IMMUTABLE");
  expect(String(record.missingCopyCode)).toContain("SEASON_WORLD_COPY_REQUIRED");
  expect(String(record.damagedCopyCode)).toContain("SEASON_WORLD_COPY_MISSING_OR_DAMAGED");
  expect(String(record.damagedCopyCommitCode)).toContain("SEASON_WORLD_COPY_CONFLICT");
});
