import { expect, test } from "@playwright/test";

test("a managed match can be recovered in a fresh browser tab", async ({ page, context }) => {
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const revision = await page.locator("#decision").getAttribute("data-revision");
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto("/#exhibition");
  await expect(fresh.locator("#decision")).toHaveAttribute("data-revision", revision!, { timeout: 60_000 });
  await expect(fresh.getByText(/this result will return to the management career only after the match is complete/i)).toBeVisible();
});
