import { expect, test } from "@playwright/test";

// CP12 (CD-046, CD-047, CD-052): the title screen is the front door, with Continue and Settings; the first-launch
// heading order; the custom match copy; the guided coach pointing at the control.

test("the bare address opens the title screen, with the wordmark as the first heading on first launch", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Lord Cricket/);
  // First launch: the sound question is shown, and its h2 comes after the page's one h1.
  await expect(page.getByTestId("sound-question")).toBeVisible();
  const headings = await page.locator("h1, h2, h3").evaluateAll((nodes) => nodes.map((node) => node.tagName));
  expect(headings[0]).toBe("H1");
  expect(headings).toContain("H2");
  // The question is still wholly in view at 1366 by 768.
  const box = (await page.getByTestId("sound-question").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(768);
  // Answering by keyboard moves focus to the first action rather than dropping it to the top of the page.
  await page.getByTestId("sound-question").getByRole("button", { name: "Keep sound off" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sound-question")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Quick match/ })).toBeFocused();
  // Nothing saved yet: no Continue. Settings is offered beside the sound switch, outside the five game modes.
  await expect(page.getByTestId("title-continue")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Game modes" }).getByRole("link")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("href", "#settings");
  expect(pageErrors).toEqual([]);
});

test("Continue resumes the career, then the match once it is the most recent save", async ({ page }) => {
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/");
  const resume = page.getByTestId("title-continue");
  await expect(resume).toHaveAttribute("data-kind", "CAREER", { timeout: 30_000 });
  await expect(resume).toContainText("Continue career");
  await expect(resume).toContainText("0/56 fixtures");
  await resume.click();
  await expect(page).toHaveURL(/#career$/);
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });

  // A quick match played past the toss is now the newest save, so Continue resumes it.
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await decision.getByRole("button", { name: "Call heads" }).click();
  await expect(decision).not.toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const revision = await decision.getAttribute("data-revision");
  await page.goto("/");
  await expect(resume).toHaveAttribute("data-kind", "MATCH", { timeout: 30_000 });
  await expect(resume).toContainText("Continue match");
  await resume.click();
  await expect(page).toHaveURL(/#exhibition$/);
  await expect(decision).toHaveAttribute("data-revision", revision!, { timeout: 30_000 });
  await expect(decision).not.toHaveAttribute("data-phase", "TOSS");
});

test("Settings opens from the title screen, with and without a career", async ({ page }) => {
  await page.goto("/#title");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByTestId("settings-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await page.getByLabel("Match commentary").selectOption("brief");
  expect(await page.evaluate(() => localStorage.getItem("lcxxvi-match-commentary"))).toBe("brief");
  await page.getByRole("link", { name: /Title screen/ }).click();
  await expect(page.getByTestId("title-screen")).toBeVisible();

  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/#title");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  // With a career loaded, the career's own Settings screen opens, file actions included.
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Match commentary")).toHaveValue("brief");
  await expect(page.getByRole("button", { name: "Export .lcxxvi" })).toBeVisible();
});

test("the custom match copy says who decides, and the guided coach points at the control", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  const note = page.getByTestId("setup-control-note");
  await expect(note).toContainText("A custom match starts with you deciding for both teams.");
  await expect(note).toContainText("Quick match");
  await expect(page.locator("section.intro")).not.toContainText("initially");

  await page.goto("/#title");
  await page.getByRole("button", { name: /Guided first match/ }).click();
  const coach = page.getByTestId("guided-coach");
  await expect(coach).toContainText("The toss", { timeout: 30_000 });
  await expect(coach.getByTestId("guided-move")).toHaveText(/Your move: Call heads or Call tails/);
  await expect(page.locator("#decision")).toHaveAttribute("data-coached", "true");
});
