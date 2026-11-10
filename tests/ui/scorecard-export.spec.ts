import { expect, test } from "@playwright/test";

for (const format of ["T20", "ODI", "RED_BALL"]) test(`${format} completed match exports and prints its scorecard`, async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(2000);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : phase === "AWAITING_FOLLOW_ON" ? page.getByRole("button", { name: "Enforce follow-on" })
      : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over", exact: true });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const total = await page.locator(".details-grid section").filter({ has: page.getByRole("heading", { name: "Scorecard", exact: true }) }).locator("article h3").first().innerText();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download scorecard CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("lord-cricket-scorecard.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("synthetic-alpha-01 (SYNTHETIC_ALPHA)");
  expect(csv).toContain(format);
  expect(csv).toContain(total.match(/\d+\/\d+/)![0]);
  await page.evaluate(() => { window.print = () => { document.body.dataset.printRequested = "yes"; }; });
  await page.getByRole("button", { name: "Print scorecard" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-requested", "yes");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.getByRole("region", { name: "Printable scorecard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Printable scorecard" })).toContainText("SYNTHETIC_ALPHA");
});
