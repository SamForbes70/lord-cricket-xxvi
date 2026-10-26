import { test, expect, type Page } from "@playwright/test";

async function settle(page: Page) {
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function advanceDecision(page: Page) {
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const target =
    phase === "TOSS"
      ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS"
        ? page.getByRole("button", { name: "Bat first" })
        : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER"
          ? page.locator("button[data-candidate]:enabled").first()
          : page.getByRole("button", { name: "Next delivery" });
  await target.click();
  await settle(page);
}

test("red-ball exhibition exposes the five-day clock, declarations and durable resume", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  await page.getByLabel("Format").selectOption("RED_BALL");
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await settle(page);
  await expect(page.getByTestId("scorestrip")).toContainText("RED_BALL");
  await expect(page.getByTestId("save-status")).toContainText("Saved");

  for (let n = 0; n < 12; n++) {
    if (
      (await page.locator("#decision").getAttribute("data-phase")) === "READY"
    )
      break;
    await advanceDecision(page);
  }
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-phase",
    "READY",
  );
  await expect(page.getByTestId("active")).toContainText("Day 1");
  await expect(page.getByTestId("scorestrip")).toContainText("overs");
  await expect(
    page.getByRole("button", { name: "Declare innings" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Take new ball" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Next delivery" }).click();
  await settle(page);
  const before = await page.getByTestId("scorestrip").textContent();
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  await page.reload();
  await settle(page);
  await expect(page.getByTestId("scorestrip")).toHaveText(before!);
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await expect(page.getByTestId("active")).toContainText("Day 1");
  await expect(page.getByTestId("save-status")).toContainText("Saved");

  // Declaration is a real red-ball command and begins the opposing innings.
  if (
    (await page.locator("#decision").getAttribute("data-phase")) !== "READY"
  ) {
    for (let n = 0; n < 8; n++) {
      if (
        (await page.locator("#decision").getAttribute("data-phase")) === "READY"
      )
        break;
      await advanceDecision(page);
    }
  }
  await page.getByRole("button", { name: "Declare innings" }).click();
  await settle(page);
  await expect(page.getByTestId("scorestrip")).toContainText("Innings 2");
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-phase",
    "AWAITING_BATTER",
  );
  await expect(page.getByTestId("save-status")).toContainText("Saved");

  const storedFormat = await page.evaluate(async () => {
    const open = indexedDB.open("lord-cricket-xxvi", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(["settings", "snapshots", "games"], "readonly");
    const activeReq = tx.objectStore("settings").get("activeSaveId");
    const active = await new Promise<{ value: string }>((resolve, reject) => {
      activeReq.onsuccess = () =>
        resolve(activeReq.result as { value: string });
      activeReq.onerror = () => reject(activeReq.error);
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
  expect(storedFormat).toBe("RED_BALL");
});
