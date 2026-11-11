import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, firefox, test, type Page } from "@playwright/test";

const BANNER = /this result will return to the management career only after the match is complete/i;
const COMPLETED = "1/14 managed-team fixtures complete.";

async function startStandardMatch(page: Page) {
  await page.goto("/#career");
  await page.getByRole("button", { name: /Aster Harbour/i }).click();
  const advance = page.getByRole("button", { name: "Advance to match day" });
  if (await advance.isVisible()) {
    await advance.click();
    await expect(page.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: "Play match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
  await page.getByLabel("Tactical captain").selectOption("");
}

async function startRosterMatch(page: Page) {
  const world = JSON.parse(readFileSync("packages/data/worlds/fictional-eight-01.json", "utf8"));
  const players = world.players.map((player: Record<string, unknown>) => Object.fromEntries(Object.entries(player).filter(([key]) => key !== "provenance")));
  const source = JSON.stringify({ version: "LC_ROSTER_IMPORT_V1", sourceId: "recovery-roster", world: { ...world, players } });
  await page.goto("/#roster-career");
  await page.getByLabel("Roster JSON").setInputFiles({ name: "roster.json", mimeType: "application/json", buffer: Buffer.from(source) });
  await page.getByRole("button", { name: "Start roster career" }).click();
  await expect(page.getByText("0/56 fixtures")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play next managed match" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });
  await page.getByLabel("Tactical captain").selectOption("");
}

async function playOne(page: Page) {
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" })
    : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" })
    : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first()
    : page.getByRole("button", { name: "Finish over", exact: true });
  await target.click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
}

async function playToEnd(page: Page) {
  for (let steps = 0; (await page.locator("#decision").getAttribute("data-phase")) !== "COMPLETE"; steps++) {
    expect(steps).toBeLessThan(450);
    await playOne(page);
  }
}

async function playSome(page: Page, steps: number) {
  for (let i = 0; i < steps; i++) {
    if ((await page.locator("#decision").getAttribute("data-phase")) === "COMPLETE") return;
    await playOne(page);
  }
}

/** The revision once the page has stopped changing, so a command still in flight is never read as final. */
async function settledRevision(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    const before = await page.locator("#decision").getAttribute("data-revision");
    await page.waitForTimeout(800);
    const after = await page.locator("#decision").getAttribute("data-revision");
    if (before === after && (await page.locator("#decision").getAttribute("aria-busy")) === "false") return after!;
  }
  throw new Error("The match revision did not settle.");
}

/**
 * A recovered career tab re-enables the AI opponent, exactly as a fresh launch does, so it may take its
 * pending decision as soon as the page opens. The restored revision is therefore at least the saved one.
 */
async function expectRestored(page: Page, savedRevision: string) {
  await expect.poll(async () => Number(await page.locator("#decision").getAttribute("data-revision")), { timeout: 60_000 }).toBeGreaterThanOrEqual(Number(savedRevision));
}

/**
 * The recovered tab re-enables the AI opponent, whose decisions leave the human candidate buttons disabled
 * until it has acted. The original tab played with manual control, so the spec takes it back before stepping.
 */
async function takeManualControl(page: Page) {
  await page.getByLabel("Tactical captain").selectOption("");
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await settledRevision(page);
}

async function awaitWritable(page: Page) {
  // The closed tab's writer lease lasts up to 12 s. The page retries on its own and must become writable.
  await expect(page.getByTestId("save-status")).not.toContainText("Read only", { timeout: 45_000 });
}

async function bindingStates(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("settings", "readonly");
    const rows = await new Promise<{ key: string; value: { status: string; fixtureId: string } }[]>((resolve, reject) => { const request = tx.objectStore("settings").getAll(IDBKeyRange.bound("managed-binding:", "managed-binding:￿")); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return rows.map((row) => row.value.status);
  });
}

test("a standard managed match is recovered in a fresh tab and its result applies exactly once", async ({ page, context }) => {
  test.setTimeout(600_000);
  await startStandardMatch(page);
  await playSome(page, 6);
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const revision = await settledRevision(page);
  expect(await bindingStates(page)).toEqual(["PENDING"]);
  await page.close();

  const fresh = await context.newPage();
  await fresh.goto("/#exhibition");
  await expectRestored(fresh, revision);
  await expect(fresh.getByText(BANNER)).toBeVisible();
  await expect(fresh.getByRole("button", { name: "New exhibition" })).toHaveCount(0);
  await awaitWritable(fresh);
  await takeManualControl(fresh);
  await playToEnd(fresh);
  await fresh.getByRole("button", { name: "Return result to career" }).click();
  await expect(fresh.getByText(COMPLETED, { exact: true })).toBeVisible({ timeout: 60_000 });
  await fresh.reload();
  await expect(fresh.getByText(COMPLETED, { exact: true })).toBeVisible({ timeout: 60_000 });
  expect(await bindingStates(fresh)).toEqual(["APPLIED"]);
});

test("a match completed in a lost tab is applied when the career opens, with no match page", async ({ page, context }) => {
  test.setTimeout(600_000);
  await startStandardMatch(page);
  await playToEnd(page);
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto("/#career");
  await expect(fresh.getByText(COMPLETED, { exact: true })).toBeVisible({ timeout: 60_000 });
  expect(await bindingStates(fresh)).toEqual(["APPLIED"]);
  await fresh.reload();
  await expect(fresh.getByText(COMPLETED, { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(fresh.getByRole("alert")).toHaveCount(0);
});

test("abandoning a career match keeps it as an exhibition, and playing the fixture again resumes it", async ({ page, context }) => {
  test.setTimeout(600_000);
  await startStandardMatch(page);
  await playSome(page, 4);
  const revision = await settledRevision(page);
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto("/#exhibition");
  await expectRestored(fresh, revision);
  await awaitWritable(fresh);
  const restoredRevision = await settledRevision(fresh);
  fresh.once("dialog", (dialog) => void dialog.accept());
  await fresh.getByRole("button", { name: "Abandon career match" }).click();
  await expect(fresh.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30_000 });
  expect(await bindingStates(fresh)).toEqual(["ABANDONED"]);
  await fresh.goto("/#career");
  await expect(fresh.getByText("0/14 managed-team fixtures complete.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(fresh.getByRole("button", { name: "Play match" })).toBeEnabled({ timeout: 45_000 });
  await fresh.getByRole("button", { name: "Play match" }).click();
  // Resuming returns the kept match at exactly the revision it had when it was abandoned.
  await expect(fresh.locator("#decision")).toHaveAttribute("data-revision", restoredRevision, { timeout: 60_000 });
  await expect(fresh.getByText(BANNER)).toBeVisible();
  expect(await bindingStates(fresh)).toEqual(["PENDING"]);
});

test("an imported-roster managed match is recovered in a fresh tab and applies exactly once", async ({ page, context }) => {
  test.setTimeout(600_000);
  await startRosterMatch(page);
  await playSome(page, 6);
  const revision = await settledRevision(page);
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto("/#exhibition");
  await expectRestored(fresh, revision);
  await expect(fresh.getByText(BANNER)).toBeVisible();
  await awaitWritable(fresh);
  await takeManualControl(fresh);
  await playToEnd(fresh);
  await fresh.getByRole("button", { name: "Return result to career" }).click();
  await expect(fresh.getByText(/\d+\/56 fixtures/)).toBeVisible({ timeout: 60_000 });
  await expect(fresh.getByText("0/56 fixtures")).toHaveCount(0);
  await fresh.reload();
  await expect(fresh.getByText("0/56 fixtures")).toHaveCount(0);
  expect(await bindingStates(fresh)).toEqual(["APPLIED"]);
});

test("a match survives closing the whole browser with a retained profile", async ({ browserName }, testInfo) => {
  test.setTimeout(600_000);
  const baseURL = testInfo.project.use.baseURL ?? "http://127.0.0.1:4180";
  const profile = mkdtempSync(join(tmpdir(), "lcxxvi-profile-"));
  // The acceptance harness rejects skipped tests, so the same run covers whichever browser this project uses.
  const launch = () => browserName === "firefox"
    ? firefox.launchPersistentContext(profile, { baseURL })
    : chromium.launchPersistentContext(profile, {
      baseURL,
      ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE } : {}),
    });
  try {
    const first = await launch();
    const page = await first.newPage();
    await startStandardMatch(page);
    await playSome(page, 6);
    const revision = await settledRevision(page);
    await first.close();

    const second = await launch();
    const reopened = await second.newPage();
    await reopened.goto("/#exhibition");
    // The previous browser may still hold the lease for up to 12 s; the page retries instead of staying read-only.
    await expectRestored(reopened, revision);
    await expect(reopened.getByText(BANNER)).toBeVisible();
    await expect(reopened.getByTestId("save-status")).not.toContainText("Read only", { timeout: 45_000 });
    await takeManualControl(reopened);
    await playToEnd(reopened);
    await reopened.getByRole("button", { name: "Return result to career" }).click();
    await expect(reopened.getByText(COMPLETED, { exact: true })).toBeVisible({ timeout: 60_000 });
    await second.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});
