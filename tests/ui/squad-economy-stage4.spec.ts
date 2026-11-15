import { expect, test } from "@playwright/test";

test("Stage 4 squad economy manages contracts, free-agent offers across reloads, negotiation rounds, off-season rollover, and V3 .lcxxvi round-trip", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 1 (2027)");

  // Navigate to Contracts screen and verify club budget, negotiation window, league caps, and ledger.
  await page.getByRole("button", { name: "Contracts", exact: true }).click();
  await expect(page.getByTestId("contracts-screen")).toBeVisible();
  await expect(page.getByTestId("club-budget-summary")).toContainText("$2500k");
  await expect(page.getByTestId("negotiation-window-panel")).toContainText("Open · Round 1 of 3");
  await expect(page.getByTestId("league-budgets-panel")).toBeVisible();
  await expect(page.getByTestId("economy-ledger-panel")).toContainText(
    "Auditable transaction ledger",
  );

  // Submit a Free Agent contract offer and verify reserved wage space.
  const faPanel = page.getByTestId("free-agent-market-panel");
  await expect(faPanel).toBeVisible();
  const firstFaRow = faPanel.locator("tbody tr").first();
  const firstFaName = (await firstFaRow.locator("button.player-link").innerText()).trim();
  await firstFaRow.locator("button[data-testid^='offer-free-agent-']").click();
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  await expect(page.getByTestId("contract-offers-panel")).toContainText(firstFaName);
  await expect(page.getByTestId("contract-offers-panel")).toContainText("PENDING_ROUND");

  // Reload mid-bidding and prove pending offer and reserved budget persist cleanly.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Contracts", exact: true }).click();
  await expect(page.getByTestId("contract-offers-panel")).toContainText(firstFaName);
  await expect(page.getByTestId("contract-offers-panel")).toContainText("PENDING_ROUND");

  // Resolve negotiation round 1 (including symmetrical AI club bids) and verify Round 2 + ledger update.
  await page.getByTestId("resolve-negotiation-round-btn").click();
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  await expect(page.getByTestId("negotiation-window-panel")).toContainText("Open · Round 2 of 3");
  await expect(page.getByTestId("contract-offers-panel")).toContainText(/SIGNED|COUNTERED|REJECTED/);
  await expect(page.getByTestId("economy-ledger-panel")).toContainText(
    /FREE AGENT SIGNED|INITIAL CONTRACT REGISTERED/,
  );

  // Open a contracted player's page and verify active contract summary is displayed.
  const firstManagedPlayerBtn = page
    .getByTestId("managed-contracts-panel")
    .locator("button.player-link")
    .first();
  await firstManagedPlayerBtn.click();
  await expect(page.getByTestId("player-contract-summary")).toBeVisible();
  await expect(page.getByTestId("player-contract-summary")).toContainText(/\$\d+k\s*\/\s*yr/);

  // Return Home and simulate all 14 rounds of Season 1.
  await page.getByRole("button", { name: "Home", exact: true }).click();
  for (let round = 1; round <= 14; round += 1) {
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) {
      await advance.click();
      await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
    }
    await page.getByRole("button", { name: "Simulate match" }).click();
    await expect(
      page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 30_000 });
  }

  // Roll over Season 1 -> Season 2 and verify off-season contracts & budget report + reopened window.
  await page.getByTestId("rollover-next-season-btn").click();
  await expect(page.getByTestId("career-masthead-subtitle")).toContainText("Season 2 (2028)", {
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Career", exact: true }).click();
  const economyReport = page.getByTestId("offseason-economy-report");
  await expect(economyReport).toBeVisible();
  await expect(economyReport).toContainText(
    "Off-season contracts & budget report · Season 1 to Season 2 (2028)",
  );
  await expect(economyReport).toContainText(/contracts expired to free agency/);

  await page.getByRole("button", { name: "Contracts", exact: true }).click();
  await expect(page.getByTestId("negotiation-window-panel")).toContainText("Open · Round 1 of 3");

  // Export V3 .lcxxvi portable archive and verify clean import in an isolated browser context.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export .lcxxvi" }).click(),
  ]);
  const archivePath = await download.path();
  expect(archivePath).not.toBeNull();

  const importedContext = await browser.newContext();
  try {
    const importedPage = await importedContext.newPage();
    importedPage.on("pageerror", (err) => pageErrors.push(err.message));
    await importedPage.goto("/#career");
    await importedPage.getByLabel("Choose .lcxxvi archive").setInputFiles(archivePath!);
    await expect(
      importedPage.getByRole("navigation", { name: "Career navigation" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(importedPage.getByTestId("career-masthead-subtitle")).toContainText(
      "Season 2 (2028)",
    );
    await importedPage.getByRole("button", { name: "Contracts", exact: true }).click();
    await expect(importedPage.getByTestId("club-budget-summary")).toContainText("$2500k");
    await expect(importedPage.getByTestId("economy-ledger-panel")).toBeVisible();
  } finally {
    await importedContext.close();
  }

  expect(pageErrors).toEqual([]);
});
