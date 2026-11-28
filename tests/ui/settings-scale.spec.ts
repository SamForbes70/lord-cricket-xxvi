import { expect, test } from "@playwright/test";

test("115 percent match text fits the narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#exhibition");
  await page.getByLabel("Text scale").selectOption("115");
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  await page.getByLabel("Commentary").selectOption("brief");
  await page.getByLabel("Layout").selectOption("compact");
  await page.reload();
  await expect(page.getByLabel("Text scale")).toHaveValue("115");
  await expect(page.getByLabel("Commentary")).toHaveValue("brief");
  await expect(page.getByLabel("Layout")).toHaveValue("compact");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("invalid saved match preferences fall back to supported values", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("lcxxvi-match-scale", "unsupported");
    localStorage.setItem("lcxxvi-match-commentary", "unsupported");
    localStorage.setItem("lcxxvi-match-density", "unsupported");
  });
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Text scale")).toHaveValue("100");
  await expect(page.getByLabel("Commentary")).toHaveValue("full");
  await expect(page.getByLabel("Layout")).toHaveValue("comfortable");
});

// CP02B: the type tokens used to resolve on :root, where --text-scale is 1, so the match screen's Text scale never
// reached tokenised text (it changed only the older em-based sizes). They now follow the setting on the whole screen.
test("the match Text scale reaches tokenised text across the match screen", async ({ page }) => {
  await page.goto("/#exhibition");
  const tokenSize = () =>
    page.evaluate(() => {
      const shell = document.querySelector(".match-shell");
      if (!shell) return null;
      const probe = document.createElement("span");
      probe.style.fontSize = "var(--type-md)";
      shell.appendChild(probe);
      const size = getComputedStyle(probe).fontSize;
      probe.remove();
      return size;
    });
  const title = page.getByTestId("mode-masthead").getByRole("heading", { level: 1 });
  await page.getByLabel("Text scale").selectOption("100");
  await expect.poll(tokenSize).toBe("16px");
  const titleAt100 = await title.evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
  await page.getByLabel("Text scale").selectOption("150");
  await expect.poll(tokenSize).toBe("24px");
  const titleAt150 = await title.evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
  expect(titleAt150 / titleAt100).toBeCloseTo(1.5, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
