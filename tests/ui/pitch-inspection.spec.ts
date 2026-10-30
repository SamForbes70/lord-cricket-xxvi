import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8")) as {
  grounds: Array<{ groundId: string; name: string; pitchPrior: { seamBp: number; turnBp: number } }>;
};

test("shows the selected ground's effective pitch before the toss in every format", async ({ page }) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  const panel = page.getByRole("region", { name: "Pitch and conditions" });
  for (const index of [0, 1]) {
    const ground = world.grounds[index]!;
    await page.getByLabel("Ground", { exact: true }).selectOption(ground.groundId);
    for (const format of ["T20", "ODI", "RED_BALL"]) {
      await page.getByLabel("Format", { exact: true }).selectOption(format);
      await expect(panel).toContainText(ground.name);
      await expect(panel).toContainText(`${(ground.pitchPrior.seamBp / 100).toFixed(2)} / 100`);
      await expect(panel).toContainText(`${(ground.pitchPrior.turnBp / 100).toFixed(2)} / 100`);
      await expect(panel).toContainText("Moisture, bounce variability and outfield speed have no effect");
      await expect(panel).toContainText(format === "RED_BALL" ? "delays are not scheduled automatically" : "Rain interruptions are disabled");
      await expect(panel).toContainText("no forecast is available");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Text scale").selectOption("150");
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
