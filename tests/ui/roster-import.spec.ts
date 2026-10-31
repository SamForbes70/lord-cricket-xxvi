import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("imported T20 roster survives match actions, reload and portable import", async ({ page, browser }) => {
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  for (const player of players) player.playerId = `custom-${player.playerId}`;
  for (const team of world.teams) {
    team.teamId = `custom-${team.teamId}`;
    team.squadIds = team.squadIds.map((id: string) => `custom-${id}`);
  }
  for (const ground of world.grounds) ground.groundId = `custom-${ground.groundId}`;
  world.teams[0].name = "Imported Harbour";
  players[0].name = "Imported Player";
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "test", world: { ...world, players } });
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import roster")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Import roster").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await expect(page.getByRole("status").filter({ hasText: "Imported roster ready" })).toBeVisible();
  await expect(page.getByLabel("Your team").locator("option:checked")).toHaveText("Imported Harbour");
  await expect(page.locator(".player-choice").filter({ hasText: "Imported Player" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  const scoreboard = page.getByTestId("scorestrip");
  await expect(scoreboard).toContainText("Imported Harbour", { timeout: 30_000 });
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "TOSS");
  await expect(page.getByTestId("save-status")).toContainText("Saved", { timeout: 30_000 });
  await page.reload();
  await expect(scoreboard).toContainText("Imported Harbour", { timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current" }).click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto(page.url());
    await expect(imported.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
    await imported.getByLabel("Import saved game").setInputFiles(file!);
    await expect(imported.getByTestId("scorestrip")).toContainText("Imported Harbour", { timeout: 60_000 });
  } finally {
    await context.close();
  }
});

test("an imported roster completes a T20 match and verifies its replay", async ({ page }) => {
  test.setTimeout(240_000);
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  world.teams[0].name = "Imported Harbour";
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "complete-match", world: { ...world, players } });
  await page.goto("/#exhibition");
  try { await expect(page.getByLabel("Import roster")).toBeEnabled({ timeout: 30_000 }); }
  catch (error) {
    console.error(`Roster import startup: ${page.url()} ${(await page.locator("body").innerText()).slice(0, 4000)}`);
    throw error;
  }
  await page.getByLabel("Import roster").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await expect(page.getByRole("status").filter({ hasText: "Imported roster ready" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(450);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over" });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Verify replay and scorecard" }).click();
  await expect(page.getByTestId("verification")).toBeVisible({ timeout: 60_000 });
});

test("imported ODI roster survives match actions, reload and portable import", async ({ page, browser }) => {
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  world.teams[0].name = "Imported ODI Club";
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "odi-test", world: { ...world, players } });
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import roster")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Import roster").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await expect(page.getByRole("status").filter({ hasText: "Imported roster ready" })).toBeVisible();
  await page.getByLabel("Format", { exact: true }).selectOption("ODI");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  const scoreboard = page.getByTestId("scorestrip");
  await expect(scoreboard).toContainText("Imported ODI Club", { timeout: 30_000 });
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "TOSS");
  await expect(page.getByTestId("save-status")).toContainText("Saved", { timeout: 30_000 });
  await page.reload();
  await expect(scoreboard).toContainText("Imported ODI Club", { timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current" }).click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto(page.url());
    await expect(imported.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
    await imported.getByLabel("Import saved game").setInputFiles(file!);
    await expect(imported.getByTestId("scorestrip")).toContainText("Imported ODI Club", { timeout: 60_000 });
  } finally {
    await context.close();
  }
});

test("imported red-ball roster survives match actions, reload and portable import", async ({ page, browser }) => {
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  world.teams[0].name = "Imported Red-ball Club";
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "red-ball-test", world: { ...world, players } });
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import roster")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Import roster").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await expect(page.getByRole("status").filter({ hasText: "Imported roster ready" })).toBeVisible();
  await page.getByLabel("Format", { exact: true }).selectOption("RED_BALL");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  const scoreboard = page.getByTestId("scorestrip");
  await expect(scoreboard).toContainText("Imported Red-ball Club", { timeout: 30_000 });
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).not.toHaveAttribute("data-phase", "TOSS");
  await expect(page.getByTestId("save-status")).toContainText("Saved", { timeout: 30_000 });
  await page.reload();
  await expect(scoreboard).toContainText("Imported Red-ball Club", { timeout: 30_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current" }).click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await imported.goto(page.url());
    await expect(imported.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
    await imported.getByLabel("Import saved game").setInputFiles(file!);
    await expect(imported.getByTestId("scorestrip")).toContainText("Imported Red-ball Club", { timeout: 60_000 });
  } finally {
    await context.close();
  }
});

test("roster import rejects executable fields and selects an available format", async ({ page }) => {
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  const source = { version: "LC_ROSTER_IMPORT_V1", sourceId: "format-test", world: { ...world, rulesIds: ["LC_ODI_01"], players } };
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import roster")).toBeEnabled({ timeout: 30_000 });
  const invalid = structuredClone(source);
  invalid.world.players[0].script = "alert(1)";
  await page.getByLabel("Import roster").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Import roster").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)) });
  await expect(page.getByRole("status").filter({ hasText: "Imported roster ready" })).toBeVisible();
  await expect(page.getByLabel("Format", { exact: true })).toHaveValue("ODI");
  await expect(page.getByLabel("Format", { exact: true }).locator('option[value="T20"]')).toHaveAttribute("disabled", "");
});

test("roster import fits a narrow screen at 150 percent text scale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import roster")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Text scale").selectOption("150");
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
    overflow: Array.from(document.querySelectorAll("body *")).filter(element => element.getBoundingClientRect().right > document.documentElement.clientWidth).map(element => ({ tag: element.tagName, className: element.className, text: (element.textContent ?? "").slice(0, 50), right: element.getBoundingClientRect().right })) }));
  expect(widths.content, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
});
