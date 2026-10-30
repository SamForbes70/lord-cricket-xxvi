import { test, expect } from "@playwright/test";

test("edited standalone exhibitions survive reload and import in every format", async ({ page, browser }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit names and colours" }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Harbour XI");
  await page.getByLabel("Ground name", { exact: true }).fill("New Quay");
  await page.getByLabel("Primary colour", { exact: true }).fill("#1177cc");
  await page.getByLabel("Name for p001").fill("Rhea Harbour");
  const worldDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download world copy" }).click();
  const worldFile = await (await worldDownload).path();
  expect(worldFile).not.toBeNull();
  await page.getByRole("button", { name: "Use for new exhibition" }).click();

  for (const [index, format] of ["T20", "ODI", "RED_BALL"].entries()) {
    if (index > 0) {
      await page.getByRole("button", { name: "New exhibition" }).click();
      await page.getByRole("button", { name: "Edit names and colours" }).click();
      await page.getByLabel("Open a saved world copy").setInputFiles(worldFile!);
      await expect(page.getByLabel("Team name", { exact: true })).toHaveValue("Harbour XI");
      await page.getByRole("button", { name: "Use for new exhibition" }).click();
    }
    await expect(page.getByLabel("Your team").locator("option:checked")).toHaveText("Harbour XI");
    await expect(page.locator(".player-choice").filter({ hasText: "Rhea Harbour" }).first()).toBeVisible();
    await page.getByLabel("Format", { exact: true }).selectOption(format);
    await page.getByRole("button", { name: "Confirm XIs and start" }).click();
    const scoreboard = page.getByTestId("scorestrip");
    await expect(scoreboard).toContainText("Harbour XI", { timeout: 30_000 });
    await expect(scoreboard).toContainText("New Quay");
    await expect(scoreboard).toHaveCSS("box-shadow", /rgb\(17, 119, 204\)/);
    await page.getByRole("button", { name: "Call heads" }).click();
    await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "TOSS");
    await expect(page.getByTestId("save-status")).toContainText("Saved", { timeout: 30_000 });
    await page.reload();
    await expect(scoreboard).toContainText("Harbour XI", { timeout: 30_000 });
    const matchDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export current" }).click();
    const matchFile = await (await matchDownload).path();
    expect(matchFile).not.toBeNull();
    const context = await browser.newContext();
    try {
      const imported = await context.newPage();
      await imported.goto(page.url());
      await expect(imported.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
      await imported.getByLabel("Import saved game").setInputFiles(matchFile!);
      await expect(imported.getByTestId("scorestrip")).toContainText("Harbour XI", { timeout: 60_000 });
      await expect(imported.getByTestId("scorestrip")).toContainText("New Quay");
    } finally {
      await context.close();
    }
  }
});
