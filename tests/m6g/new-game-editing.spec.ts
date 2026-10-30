import { test, expect, type Page } from "@playwright/test";

const editedTeam = "Harbour <script>window.editedWorldXss=1</script>";
const editedPlayer = "Rhea Harbour";

async function prepareEditedCareer(page: Page) {
  await page.getByRole("button", { name: "Edit names and colours" }).click();
  await page.getByLabel("Team name", { exact: true }).fill(editedTeam);
  await page.getByLabel("Ground name", { exact: true }).fill("New Quay");
  await page.getByLabel("Primary colour", { exact: true }).fill("#1177cc");
  await page.getByLabel("Secondary colour", { exact: true }).fill("#eeee11");
  await page.getByLabel("Name for p001").fill(editedPlayer);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download world copy" }).click();
  const savedCopy = await (await downloadPromise).path();
  expect(savedCopy).not.toBeNull();
  await page.getByLabel("Team name", { exact: true }).fill("Discarded draft");
  await page.getByLabel("Open a saved world copy").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"copyVersion":"unknown"}') });
  await expect(page.getByRole("alert")).toContainText("Unsupported world copy version");
  await page.getByLabel("Open a saved world copy").setInputFiles(savedCopy!);
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue(editedTeam);
  await page.getByRole("button", { name: "Use for new career" }).click();
  await expect(page.getByRole("status")).toContainText("Edited world ready");
  const teamCard = page.locator(".team-card").first();
  await expect(teamCard).toContainText(editedTeam);
  await expect(teamCard.locator(".team-colours i").first()).toHaveCSS("background-color", "rgb(17, 119, 204)");
  await teamCard.click();
  await expect(page.getByRole("heading", { name: editedTeam, exact: true })).toBeVisible();
  await expect(page.locator(".career-masthead h1 script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { editedWorldXss?: number }).editedWorldXss)).toBeUndefined();
}

test("edited career names and colours survive reload, switching and portable import", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("heading", { name: "Aster Harbour", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose career" }).click();
  await prepareEditedCareer(page);
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(page.getByRole("button", { name: `View ${editedPlayer}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: editedTeam, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose career" }).click();
  await page.getByRole("button", { name: /Aster Harbour 2027/ }).click();
  await expect(page.getByRole("heading", { name: "Aster Harbour", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose career" }).click();
  await page.getByRole("button", { name: /Harbour <script>/ }).click();
  await expect(page.getByRole("heading", { name: editedTeam, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate match" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".save-badge strong")).toHaveText("Saved", { timeout: 60_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .lcxxvi" }).click();
  const archive = await (await downloadPromise).path();
  expect(archive).not.toBeNull();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto(page.url());
    await imported.getByLabel("Choose .lcxxvi archive").setInputFiles(archive!);
    await expect(imported.getByRole("heading", { name: editedTeam, exact: true })).toBeVisible();
    await imported.getByRole("button", { name: "Squad", exact: true }).click();
    await expect(imported.getByRole("button", { name: `View ${editedPlayer}` })).toBeVisible();
    await imported.reload();
    await expect(imported.getByRole("heading", { name: editedTeam, exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("edited match presentation survives reload and portable import", async ({ page, browser }) => {
  await page.goto("/");
  await prepareEditedCareer(page);
  await page.getByRole("button", { name: "Play match" }).click();
  const scoreboard = page.getByTestId("scorestrip");
  await expect(scoreboard).toContainText(editedTeam, { timeout: 60_000 });
  await expect(scoreboard).toHaveCSS("box-shadow", /rgb\(17, 119, 204\)/);
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  await expect(page.getByText("Saved games (2)")).toBeVisible({ timeout: 30_000 });
  await page.getByText("Saved games (2)").click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(scoreboard).toContainText(editedTeam);
  await page.reload();
  await expect(scoreboard).toContainText(editedTeam, { timeout: 60_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current" }).click();
  const archive = await (await downloadPromise).path();
  expect(archive).not.toBeNull();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto(new URL("/#exhibition", page.url()).toString());
    await expect(imported.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
    await imported.getByLabel("Import saved game").setInputFiles(archive!);
    await expect(imported.getByTestId("scorestrip")).toContainText(editedTeam, { timeout: 60_000 });
    await expect(imported.getByTestId("scorestrip")).toHaveCSS("box-shadow", /rgb\(17, 119, 204\)/);
  } finally {
    await context.close();
  }
});

test("the editor supports keyboard focus and long names on a narrow screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text scale").selectOption("150");
  await page.getByRole("button", { name: "Choose career" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const edit = page.getByRole("button", { name: "Edit names and colours" });
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Edit a new-game world" })).toBeFocused();
  await page.getByLabel("Team name", { exact: true }).fill(" ");
  await page.getByRole("button", { name: "Use for new career" }).click();
  await expect(page.getByRole("alert")).toContainText("Names must have");
  const name = "N".repeat(80);
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Use for new career" }).click();
  await expect(edit).toBeFocused();
  await expect(page.locator(".team-card").first()).toContainText(name);
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    overflow: Array.from(document.querySelectorAll("body *")).filter(node => node.getBoundingClientRect().right > document.documentElement.clientWidth).map(node => `${node.tagName}.${node.className}`).slice(0, 10),
  }));
  expect(widths.content, widths.overflow.join(", ")).toBeLessThanOrEqual(widths.viewport);
  await page.locator(".team-card").first().click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.getByTestId("scorestrip")).toContainText(name, { timeout: 60_000 });
  await page.getByLabel("Text scale").selectOption("150");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(widths.viewport);
});
