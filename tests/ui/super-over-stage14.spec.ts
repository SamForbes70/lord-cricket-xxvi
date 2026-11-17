import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { executeT20Command, fixtureAutopilotStep } from "@lcxxvi/simulation";
import { createPortableArchive } from "@lcxxvi/persistence";
import { createMatchController } from "../../apps/web/src/match/controller.js";
import { ARCHIVE_PINS, UI_VERSION } from "../../apps/web/src/match/protocol.js";

// Stage 14 (owner decision 17 November 2026, answers 1a and 2a): a tied T20 exhibition goes to ICC-standard super overs.
// Exhibitions use a private random seed, so the spec builds a known tied match (seed lc-tie-469, which needs two super
// overs under the autopilot; see the unit test) in Node and loads it through the ordinary "Import saved game" control.
const root = resolve(import.meta.dirname, "../..");

async function tiedArchive(): Promise<string> {
  const worldBytes = new Uint8Array(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.json")));
  const manifest = JSON.parse(readFileSync(resolve(root, "packages/data/worlds/fictional-eight-01.manifest.json"), "utf8"));
  const ctl = createMatchController(worldBytes, manifest, () => "lc-tie-469", () => ({ gameId: "game-super-over-spec", matchId: "human-t20" }));
  const catalog = ctl.currentResponse("ui-0").catalog!;
  const pick = (id: string) => catalog.teams.find((t) => t.id === id)!.suggested;
  ctl.handle({ version: UI_VERSION, requestId: "ui-1", expectedRevision: 0, type: "START", format: "T20", selections: [pick("team-03"), pick("team-06")], groundId: "ground-03" });
  let s = ctl.snapshot()!;
  while (s.core.phase !== "COMPLETE") s = executeT20Command(s, fixtureAutopilotStep(s)).session;
  expect(s.core.result?.kind).toBe("TIE");
  const bytes = await createPortableArchive(
    s,
    {
      saveId: "auto:game-super-over-spec",
      kind: "AUTO",
      title: "Tied exhibition",
      matchGameId: s.setup.gameId,
      matchId: s.setup.matchId,
      teams: [s.setup.teams[0].teamId, s.setup.teams[1].teamId],
      ground: s.setup.ground.groundId,
      phase: s.core.phase,
      revision: s.revision,
      eventCount: s.events.length,
      lastEventHash: s.lastEventHash,
      updatedAt: "2026-11-17T00:00:00.000Z",
      completed: true,
    },
    ARCHIVE_PINS,
    "2026-11-17T00:00:00.000Z",
  );
  const file = join(mkdtempSync(join(tmpdir(), "lcxxvi-super-over-")), "tied.lcxxvi");
  writeFileSync(file, bytes);
  return file;
}

test("Stage 14 tied T20 exhibition goes to a super over, played by hand, and keeps the winner across a reload", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const archive = await tiedArchive();

  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Import saved game").setInputFiles(archive);
  const panel = page.getByTestId("super-over-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", "COMPLETE");

  // Both sides are played by hand here: choose the line-ups and bowl every ball.
  await panel.getByRole("button", { name: "Play super over" }).click();
  await expect(panel.getByRole("button", { name: "Play super over" })).toHaveCount(0, { timeout: 30_000 });
  for (let step = 0; step < 80; step += 1) {
    if (await page.getByTestId("super-over-result").isVisible().catch(() => false)) break;
    const confirmBatters = panel.getByRole("button", { name: "Confirm batters" });
    const confirmBowler = panel.getByRole("button", { name: "Confirm bowler" });
    const bowl = panel.getByRole("button", { name: "Bowl next ball" });
    const target = (await confirmBatters.isVisible().catch(() => false))
      ? confirmBatters
      : (await confirmBowler.isVisible().catch(() => false))
        ? confirmBowler
        : (await bowl.isVisible().catch(() => false))
          ? bowl
          : null;
    if (!target) continue;
    await target.click();
    // Wait for the request to finish: while it runs, the panel's controls are disabled.
    await expect(panel.locator("button:disabled, fieldset:disabled")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  const result = page.getByTestId("super-over-result");
  // The default choices (first three batters, first eligible bowler) make this deterministic.
  await expect(result).toHaveText("Northlight Ridge won the super over.");
  await expect(page.getByTestId("super-over-round-1")).toHaveText("Super over 1: Silver Fen 2/0 (6 balls) · Northlight Ridge 7/0 (2 balls)");
  const text = (await result.textContent())!;
  await expect(page.getByTestId("super-over-round-1")).toContainText("Super over 1:");

  // Durable: a reload shows the same result and rounds from the stored record.
  await page.reload();
  await expect(page.getByTestId("super-over-result")).toHaveText(text, { timeout: 30_000 });
  await expect(page.getByTestId("super-over-round-1")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Stage 14 the tactical captain makes its side's super-over choices", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const archive = await tiedArchive();
  await page.goto("/#exhibition");
  await expect(page.getByLabel("Import saved game")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Import saved game").setInputFiles(archive);
  const panel = page.getByTestId("super-over-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  // Silver Fen (team-06) bat first in the super over; make them the tactical captain's side.
  await page.locator("#ai-opponent-select").selectOption("team-06");
  await panel.getByRole("button", { name: "Play super over" }).click();
  // The captain names Silver Fen's batters; the player only has to choose Northlight Ridge's bowler.
  await expect(panel.getByRole("group", { name: "Choose Northlight Ridge's super-over bowler" })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("group", { name: /Silver Fen's super-over batters/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Confirm bowler" }).click();
  await expect(panel.getByRole("button", { name: "Bowl next ball" })).toBeEnabled({ timeout: 30_000 });
  // Silver Fen's batters are at the crease, so the player is not offered their batting intent.
  await expect(panel.getByLabel(/intent/)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
