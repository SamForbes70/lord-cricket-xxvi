import { expect, test } from "@playwright/test";

test("a managed match stays authoritative while inspecting career screens", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { matchWorkers: number };
    state.matchWorkers = 0;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (options?.name?.startsWith("tab-")) state.matchWorkers++;
      }
    };
  });
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  await expect(page.getByRole("navigation", { name: "Career navigation" })).toBeVisible();
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await page.getByLabel("Tactical captain").selectOption("");
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const revision = await page.locator("#decision").getAttribute("data-revision");
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const careerCheckpoint = async () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["settings", "games"], "readonly");
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const active = await get(tx.objectStore("settings").get("activeSeasonSaveId"));
    const game = await get(tx.objectStore("games").get(active.value));
    db.close(); return { saveId: active.value, revision: game.revision, serial: game.checkpointSerial };
  });
  const beforeInspection = await careerCheckpoint();
  await page.getByRole("button", { name: "Inspect career" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Career inspection only" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play match" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Simulate match" })).toBeDisabled();
  await page.getByLabel("Copy name").fill("Inspection copy");
  await expect(page.getByRole("button", { name: "Save career copy" })).toBeDisabled();
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(page.getByLabel(/^Training for /).first()).toBeDisabled();
  expect(await careerCheckpoint()).toEqual(beforeInspection);
  await page.getByRole("link", { name: "Return to match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!);
  await expect(page.locator("#decision")).toHaveAttribute("data-phase", phase!);
  expect(await page.evaluate(() => (window as unknown as { matchWorkers: number }).matchWorkers)).toBe(1);
  await page.getByRole("button", { name: "Inspect career" }).click();
  await expect(page.getByText(/Career inspection only/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Career inspection only/)).toBeVisible({ timeout: 30_000 });
  expect(await careerCheckpoint()).toEqual(beforeInspection);
  await page.getByRole("link", { name: "Return to match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!, { timeout: 60_000 });
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!, { timeout: 60_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Tactical captain").selectOption("");
  for (let steps = 0; await page.locator("#decision").getAttribute("data-phase") !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(450);
    const current = await page.locator("#decision").getAttribute("data-phase");
    const target = current === "TOSS" ? page.getByRole("button", { name: "Call heads" })
      : current === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
      : current === "AWAITING_BATTER" || current === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
      : page.getByRole("button", { name: "Finish over", exact: true });
    await target.click();
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Return result to career" }).click();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByText("1/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
});

test("an imported-roster match stays active while its career is inspected", async ({ page }) => {
  const { readFileSync } = await import("node:fs");
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "navigation-ui", world: { ...world, players } });
  await page.goto("/#roster-career");
  await page.getByLabel("Roster JSON").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await page.getByRole("button", { name: "Start roster career" }).click();
  await expect(page.getByText("0/56 fixtures")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play next managed match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });
  await page.getByLabel("Tactical captain").selectOption("");
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const revision = await page.locator("#decision").getAttribute("data-revision");
  await page.getByRole("button", { name: "Inspect career" }).click();
  await expect(page.getByText(/Career inspection only/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play next managed match" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Simulate next fixture" })).toBeDisabled();
  await expect(page.getByLabel("Copy name")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save career copy" })).toBeDisabled();
  await page.getByRole("link", { name: "Return to match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!);
  await page.reload();
  await expect(page.locator("#decision")).toHaveAttribute("data-revision", revision!, { timeout: 60_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
});
