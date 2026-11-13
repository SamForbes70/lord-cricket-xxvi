import { expect, test } from "@playwright/test";

test("V01-027: precaches offline assets, starts offline, retains recovery build, and defers updates during active transactions", async ({
  context,
  page,
}) => {
  const manifestResp = await page.request.get("/offline-manifest.json");
  expect(manifestResp.ok()).toBe(true);
  const manifest = (await manifestResp.json()) as {
    manifestVersion: string;
    buildId: string;
    supportedEngines: string[];
    recoveryBuildPath: string;
    assets: string[];
  };
  expect(manifest.manifestVersion).toBe("LC_OFFLINE_ASSET_MANIFEST_V1");
  expect(manifest.supportedEngines).toEqual([
    "LC_T20_MATCH_V1",
    "LC_ODI_MATCH_V1",
    "LC_RED5_MATCH_V1",
  ]);
  expect(manifest.recoveryBuildPath).toBe("/engineering.html");
  expect(manifest.assets).toContain("/index.html");
  expect(manifest.assets).toContain("/engineering.html");

  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30000,
  });

  // Wait until the Service Worker has installed and precached the offline shell.
  await page.waitForFunction(
    () => Boolean(window.__lcxxviOfflineCoordinator?.getState().offlineReady),
    undefined,
    { timeout: 30000 },
  );
  // Reload once while online so the active Service Worker controls the client.
  await page.reload();
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30000,
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, {
    timeout: 15000,
  });

  // Sever network completely and verify cold navigation + worker execution + recovery build offline.
  await context.setOffline(true);
  try {
    await page.goto("/#exhibition");
    await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole("button", { name: "Confirm XIs and start" }).click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("button", { name: "Call heads" })).toBeVisible();

    // Verify staged update offers outside active transactions and defers during active transactions.
    await page.evaluate(() => {
      window.__lcxxviOfflineCoordinator?.simulateWaitingUpdate(true);
    });
    const banner = page.getByTestId("safe-update-banner");
    await expect(banner).toBeVisible();
    const applyButton = banner.getByRole("button", { name: "Apply update safely" });
    await expect(applyButton).toBeEnabled();

    await page.evaluate(() => {
      window.__lcxxviOfflineCoordinator?.setBusySource("simulated-idb-tx", true);
    });
    await expect(applyButton).toBeDisabled();
    await expect(banner).toContainText("Waiting for the current match or save transaction");

    await page.evaluate(() => {
      window.__lcxxviOfflineCoordinator?.setBusySource("simulated-idb-tx", false);
    });
    await expect(applyButton).toBeEnabled();

    // Verify explicit recovery build (/engineering.html) loads cleanly while offline.
    const recoveryPage = await context.newPage();
    await recoveryPage.goto("/engineering.html");
    await expect(recoveryPage.locator("body")).toBeVisible();
    await recoveryPage.close();
  } finally {
    await context.setOffline(false);
  }
});
