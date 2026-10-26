import { test, expect, type Page } from "@playwright/test";

async function settle(page: Page) {
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function advance(page: Page) {
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const target =
    phase === "TOSS"
      ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS"
        ? page.getByRole("button", { name: "Bat first" })
        : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER"
          ? page.locator("button[data-candidate]:enabled").first()
          : page.getByRole("button", { name: "Finish over" });
  await target.click();
  await settle(page);
}

test("ODI exhibition starts, advances and resumes durably", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  await expect(
    page.getByRole("button", { name: "Confirm XIs and start" }),
  ).toBeEnabled();
  await page.getByLabel("Format").selectOption("ODI");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await settle(page);
  await expect(page.getByTestId("scorestrip")).toContainText("ODI");
  await expect(page.getByTestId("save-status")).toContainText("Saved");

  let readySeen = false;
  for (let step = 0; step < 22; step++) {
    await advance(page);
    if (
      (await page.locator("#decision").getAttribute("data-phase")) === "READY"
    ) {
      readySeen = true;
      await expect(page.getByTestId("scorestrip")).toContainText("50 overs");
    }
  }
  expect(readySeen).toBe(true);
  const before = await page.getByTestId("scorestrip").textContent();
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  await page.reload();
  await settle(page);
  await expect(page.getByTestId("scorestrip")).toContainText("ODI");
  await expect(page.getByTestId("scorestrip")).toHaveText(before!);
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await expect(page.getByTestId("save-status")).toContainText("Saved");

  const storedFormat = await page.evaluate(async () => {
    const open = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(["settings", "snapshots", "games"], "readonly");
    const settingReq = tx.objectStore("settings").get("activeSaveId");
    const active = await new Promise<{ value: string }>((resolve, reject) => {
      settingReq.onsuccess = () =>
        resolve(settingReq.result as { value: string });
      settingReq.onerror = () => reject(settingReq.error);
    });
    const gameReq = tx.objectStore("games").get(active.value);
    const game = await new Promise<{ checkpointGeneration: number }>(
      (resolve, reject) => {
        gameReq.onsuccess = () =>
          resolve(gameReq.result as { checkpointGeneration: number });
        gameReq.onerror = () => reject(gameReq.error);
      },
    );
    const snapReq = tx
      .objectStore("snapshots")
      .get([active.value, game.checkpointGeneration]);
    const snap = await new Promise<{ payload: string }>((resolve, reject) => {
      snapReq.onsuccess = () => resolve(snapReq.result as { payload: string });
      snapReq.onerror = () => reject(snapReq.error);
    });
    db.close();
    return JSON.parse(snap.payload).setup.format as string;
  });
  expect(storedFormat).toBe("ODI");
});
