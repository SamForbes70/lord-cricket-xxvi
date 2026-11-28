import { expect, test, type Page } from "@playwright/test";

// CP12B: Quick match and Custom match on the title screen start a new match. The unfinished match is not deleted or
// changed: it stays in Saved games, and Continue (or any other way into the exhibition) resumes the active match.

/** Starts a quick match from the title and plays it past the toss; returns its revision. */
async function unfinishedQuickMatch(page: Page) {
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await decision.getByRole("button", { name: "Call heads" }).click();
  await expect(decision).not.toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const revision = (await decision.getAttribute("data-revision"))!;
  const phase = (await decision.getAttribute("data-phase"))!;
  expect(Number(revision)).toBeGreaterThan(0);
  await expect(page.getByTestId("set-aside-note")).toHaveCount(0);
  return { revision, phase };
}

test("Quick match starts a new match; the unfinished one stays in Saved games and loads as it was", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const earlier = await unfinishedQuickMatch(page);

  // The title offers the unfinished match through Continue and says where it goes if a new match starts.
  await page.goto("/#title");
  const resume = page.getByTestId("title-continue");
  await expect(resume).toHaveAttribute("data-kind", "MATCH", { timeout: 30_000 });
  await expect(page.getByTestId("title-new-match-note")).toHaveText(
    "Quick match and Custom match start a new match. Your unfinished match stays in Saved games.",
  );

  // Quick match starts a fresh match at the toss instead of resuming the earlier one.
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  expect(Number(await decision.getAttribute("data-revision"))).toBeLessThan(Number(earlier.revision));
  const note = page.getByTestId("set-aside-note");
  await expect(note).toHaveAttribute("data-kind", "MATCH");
  await expect(note).toContainText("Your unfinished match, ");
  await expect(note).toContainText("is kept in Saved games below. Load it there to carry on.");
  // Two saves now: the new match (current) and the earlier one, unchanged.
  const saved = page.locator("details.saved-games");
  await expect(saved.locator("summary")).toHaveText("Saved games (2)");
  await saved.locator("summary").click();
  await expect(saved.locator(".save-card")).toHaveCount(2);
  await expect(saved.getByRole("button", { name: "Current" })).toHaveCount(1);
  await expect(saved.getByRole("button", { name: "Load" })).toHaveCount(1);

  // Continue now resumes the new match, the active one, at the toss.
  await page.goto("/#title");
  await expect(resume).toHaveAttribute("data-kind", "MATCH", { timeout: 30_000 });
  await expect(resume).toContainText("In progress: at the toss");
  await resume.click();
  await expect(page).toHaveURL(/#exhibition$/);
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 30_000 });
  await expect(page.getByTestId("set-aside-note")).toHaveCount(0);

  // Saved games still reach the earlier match exactly where it was left.
  await saved.locator("summary").click();
  await saved.getByRole("button", { name: "Load" }).click();
  await expect(decision).toHaveAttribute("data-revision", earlier.revision, { timeout: 30_000 });
  await expect(decision).toHaveAttribute("data-phase", earlier.phase);
  await expect(page.getByTestId("set-aside-note")).toHaveCount(0);

  // Loaded, it is the active match again, so Continue resumes it.
  await page.goto("/#title");
  await expect(resume).toHaveAttribute("data-kind", "MATCH", { timeout: 30_000 });
  await expect(resume).not.toContainText("at the toss");
  await resume.click();
  await expect(decision).toHaveAttribute("data-revision", earlier.revision, { timeout: 30_000 });
  expect(pageErrors).toEqual([]);
});

test("Custom match opens a new match's setup; the career's way in still resumes", async ({ page }) => {
  const earlier = await unfinishedQuickMatch(page);

  // A plain visit to the exhibition (as the career's Exhibition link makes) still resumes the active match.
  await page.goto("/#exhibition");
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-revision", earlier.revision, { timeout: 30_000 });
  await expect(page.getByTestId("set-aside-note")).toHaveCount(0);

  await page.goto("/#title");
  await expect(page.getByTestId("title-continue")).toHaveAttribute("data-kind", "MATCH", { timeout: 30_000 });
  await page.getByRole("navigation", { name: "Game modes" }).getByRole("link", { name: /Custom match/ }).click();
  await expect(page).toHaveURL(/#exhibition$/);
  // The setup for a new match, with the earlier match named and listed under Saved games, ready to load.
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  await expect(decision).toHaveCount(0);
  await expect(page.getByTestId("set-aside-note")).toContainText("is kept in Saved games below. Load it there to carry on.");
  const saved = page.locator("details.saved-games");
  await expect(saved).toHaveAttribute("open", "");
  await expect(saved.locator(".save-card")).toHaveCount(1);
  await saved.getByRole("button", { name: "Load" }).click();
  await expect(decision).toHaveAttribute("data-revision", earlier.revision, { timeout: 30_000 });
  await expect(decision).toHaveAttribute("data-phase", earlier.phase);
  await expect(page.getByTestId("set-aside-note")).toHaveCount(0);
});
