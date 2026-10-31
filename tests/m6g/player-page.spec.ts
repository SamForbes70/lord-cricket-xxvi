import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")) as {
  grounds: Array<{ name: string; pitchPrior: { seamBp: number; turnBp: number } }>;
};

async function startCareer(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible();
}

test("player profiles preserve format across players and reload without changing the career", async ({ page }) => {
  await startCareer(page);
  const initialRevision = await page.locator(".save-badge small").innerText();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.getByRole("button", { name: "View Ulen Elmcroft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Player: Ulen Elmcroft" })).toBeVisible();
  for (const name of ["Base skills", "Current condition", "Recorded performance"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  const format = page.getByLabel("Player format");
  await expect(format).toHaveValue("T20");
  const defence = page.getByText("Defence", { exact: true }).locator("xpath=following-sibling::dd[1]");
  await expect(defence).toHaveText("55");
  await expect(page.getByText("No T20 career statistics are available yet.")).toBeVisible();
  await format.selectOption("ODI");
  await expect(defence).toHaveText("42");
  await expect(page.getByText("No ODI career statistics are available in this T20 season.")).toBeVisible();
  await page.getByRole("button", { name: "Back to squad" }).click();
  await expect(page.getByRole("button", { name: "View Ulen Elmcroft", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "View Caro Harden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Player: Caro Harden" })).toBeVisible();
  await expect(format).toHaveValue("ODI");
  await expect(defence).toHaveText("56");
  await format.selectOption("RED_BALL");
  await expect(defence).toHaveText("61");
  await expect(page.getByText("No red-ball career statistics are available in this T20 season.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.getByRole("button", { name: "View Ulen Elmcroft", exact: true }).click();
  await expect(format).toHaveValue("RED_BALL");
  await expect(page.locator(".save-badge small")).toHaveText(initialRevision);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a completed career match links statistics to the correct player profile", async ({ page }) => {
  await startCareer(page);
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 60_000 });
  const savedRevision = await page.locator(".save-badge small").innerText();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  const playerButton = page.getByRole("button", { name: /^View / }).first();
  const label = (await playerButton.getAttribute("aria-label")) ?? (await playerButton.textContent()) ?? "";
  const name = label.trim().replace(/^View /, "");
  const row = await playerButton.locator("xpath=ancestor::tr").locator("td").allTextContents();
  expect(name.length).toBeGreaterThan(0);
  await playerButton.click();
  await expect(page.getByRole("heading", { name: `Player: ${name}`, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recorded performance", exact: true })).toBeVisible();
  await expect(page.getByText("No T20 career statistics are available yet.")).toHaveCount(0);
  for (const [label, value] of [["Matches", row[2]], ["Runs", row[3]], ["Wickets", row[6]]]) {
    await expect(page.getByText(label!, { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText(value!);
  }
  await expect(page.locator(".save-badge small")).toHaveText(savedRevision);
  await page.getByRole("button", { name: "Back to statistics" }).click();
  await expect(page.getByRole("button", { name: `View ${name}`, exact: true })).toBeFocused();
});

test("pitch inspection keeps the primary match action in view at 150 percent", async ({ page }) => {
  await startCareer(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text scale").selectOption("150");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const action = page.getByRole("button", { name: "Simulate match", exact: true });
  await expect(action).toBeVisible();
  const box = await action.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.getByRole("region", { name: "Pitch and conditions" })).toBeVisible();
  await expect(page.getByText("Seam assistance", { exact: true })).toBeVisible();
  const fixture = page.getByRole("heading", { name: "Next required action" }).locator("xpath=..");
  const fixtureSummary = await fixture.locator(":scope > p").nth(2).innerText();
  const ground = world.grounds.find(candidate => fixtureSummary.includes(candidate.name));
  expect(ground).toBeDefined();
  const pitch = page.getByRole("region", { name: "Pitch and conditions" });
  await expect(pitch).toContainText(ground!.name);
  await expect(pitch).toContainText(`${(ground!.pitchPrior.seamBp / 100).toFixed(2)} / 100`);
  await expect(pitch).toContainText(`${(ground!.pitchPrior.turnBp / 100).toFixed(2)} / 100`);
});

test("player profiles fit a narrow viewport at 150 percent text scale", async ({ page }) => {
  await startCareer(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text scale").selectOption("150");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.getByRole("button", { name: "View Ulen Elmcroft", exact: true }).click();
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  for (const name of ["Base skills", "Current condition", "Recorded performance"]) {
    const section = page.getByRole("region", { name });
    const box = await section.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(widths.viewport);
  }
});

test("keyboard navigation retains player format and reduced motion", async ({ page }) => {
  await startCareer(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Reduced motion").check();
  await expect(page.locator("main.career-shell")).toHaveClass(/reduced-motion/);
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const player = page.getByRole("button", { name: "View Ulen Elmcroft", exact: true });
  await player.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Player: Ulen Elmcroft" })).toBeFocused();
  await page.getByLabel("Player format").selectOption("ODI");
  await page.getByRole("button", { name: "Back to squad" }).focus();
  await page.keyboard.press("Enter");
  await expect(player).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Player format")).toHaveValue("ODI");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Reduced motion")).toBeChecked();
  await expect(page.locator("main.career-shell")).toHaveClass(/reduced-motion/);
});
