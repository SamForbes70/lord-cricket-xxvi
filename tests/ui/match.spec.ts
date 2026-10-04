import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const dir = "docs/verification-pass08";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Confirm XIs and start" }),
  ).toBeEnabled();
}
async function settle(page: Page) {
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function keyboardActivate(page: Page, target: Locator) {
  // Use actual sequential keyboard navigation, no DOM focus injection or mouse.
  for (let n = 0; n < 180; n++) {
    if (await target.evaluate((el) => document.activeElement === el)) {
      await page.keyboard.press("Enter");
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Target unreachable by keyboard");
}
async function advance(page: Page, keyOnly = false) {
  const phase = await page.locator("#decision").getAttribute("data-phase");
  const target =
    phase === "TOSS"
      ? page.getByRole("button", { name: "Call heads" })
      : phase === "AWAITING_INNINGS"
        ? page.getByRole("button", { name: "Bat first" })
        : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER"
          ? page.locator("button[data-candidate]:enabled").first()
          : page.getByRole("button", { name: "Finish over" });
  if (keyOnly) await keyboardActivate(page, target);
  else await target.click();
  await settle(page);
}
async function startReady(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await settle(page);
  while (
    (await page.locator("#decision").getAttribute("data-phase")) !== "READY"
  )
    await advance(page);
}
async function shot(page: Page, browser: string, name: string) {
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: `${dir}/${browser}-${name}.png`,
    fullPage: false,
  });
}

test("a full keyboard-only human-command match, replay identity and terminal controls", async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await keyboardActivate(
    page,
    page.getByRole("button", { name: "Confirm XIs and start" }),
  );
  await settle(page);
  let steps = 0,
    disabledBowlerSeen = false;
  while (
    (await page.locator("#decision").getAttribute("data-phase")) !== "COMPLETE"
  ) {
    if (
      (await page.locator("#decision").getAttribute("data-phase")) ===
      "AWAITING_BOWLER"
    ) {
      const disabled = page.locator("button[data-candidate]:disabled");
      expect(await disabled.count()).toBeGreaterThan(0);
      disabledBowlerSeen = true;
      await expect(
        page.getByText("Designated keeper", { exact: true }),
      ).toBeVisible();
    }
    await advance(page, true);
    if (steps % 10 === 0)
      console.log(
        browserName,
        "keyboard step",
        steps,
        await page.locator("#decision").getAttribute("data-phase"),
      );
    if (++steps > 450) throw new Error("Unfinished match");
  }
  expect(disabledBowlerSeen).toBe(true);
  await expect(
    page.getByRole("button", { name: "Next delivery" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Finish over" }),
  ).toBeDisabled();
  const revision = await page
    .locator("#decision")
    .getAttribute("data-revision");
  await keyboardActivate(
    page,
    page.getByRole("button", { name: "Verify replay and scorecard" }),
  );
  await settle(page);
  await expect(page.getByTestId("verification")).toBeVisible();
  const events = await page.getByTestId("events-hash").textContent(),
    card = await page.getByTestId("card-hash").textContent();
  // Presentation changes send no engine commands. Replay the same chain with different rendering preferences.
  await page.getByLabel("Commentary", { exact: true }).selectOption("off");
  await page.getByLabel("Layout", { exact: true }).selectOption("compact");
  await page.getByLabel("Text scale").selectOption("150");
  await page
    .getByRole("button", { name: "Verify replay and scorecard" })
    .click();
  await settle(page);
  await expect(page.getByTestId("events-hash")).toHaveText(events!);
  await expect(page.getByTestId("card-hash")).toHaveText(card!);
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  expect(errors).toEqual([]);
  await shot(page, browserName, "complete");
  writeFileSync(
    `${dir}/${browserName}-completion.json`,
    JSON.stringify(
      {
        status: "PASS",
        input: "keyboard-only until match completion and first replay",
        steps,
        revision,
        eventBytesHash: events,
        scorecardHash: card,
        renderModes: ["full/comfortable/100", "off/compact/150"],
        humanBrowserTester: false,
        automation:
          "Playwright keyboard navigation; production UI human-command route",
        disabledBowlerSeen,
      },
      null,
      2,
    ),
  );
});

test("desktop essential strip, 150% scale, reduced motion, narrow view and long names", async ({
  page,
  browserName,
}) => {
  await startReady(page);
  for (const scale of ["100", "150"]) {
    await page.getByLabel("Text scale").selectOption(scale);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const locator of [
      page.getByTestId("scorestrip"),
      page.getByTestId("active"),
      page.getByTestId("target"),
      page.locator(".decision-top"),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(768);
    }
    await shot(page, browserName, `desktop-${scale}`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "Next delivery" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next delivery" }).click();
  await settle(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shot(page, browserName, "narrow-150");
  // Presentation-only stress fixture: never changes the frozen world or worker session.
  await page
    .locator(".active strong")
    .first()
    .evaluate(
      (el) =>
        (el.textContent =
          "Alexanderson Montgomery-Wetherington Chandrasekhar van der Westhuizen"),
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shot(page, browserName, "long-name-150");
  await page
    .getByRole("button", { name: "Save match", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Save match", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Unavailable until M4 durability and recovery tests pass."),
  ).toBeVisible();
});

test("selection validity, tactics acceptance and explicit rejection of invalid named fields", async ({
  page,
  browserName,
}) => {
  await ready(page);
  await page.getByLabel("Opponent", { exact: true }).selectOption("team-01");
  await expect(
    page.getByRole("button", { name: "Confirm XIs and start" }),
  ).toBeDisabled();
  await expect(page.getByText("Choose two different teams.")).toBeVisible();
  await page.getByLabel("Opponent", { exact: true }).selectOption("team-02");
  const first = page.locator(".player-choice input").first();
  await first.uncheck();
  await expect(
    page.getByRole("button", { name: "Confirm XIs and start" }),
  ).toBeDisabled();
  await first.check();
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await settle(page);
  while (
    (await page.locator("#decision").getAttribute("data-phase")) !== "READY"
  )
    await advance(page);
  const before = await page.locator("#decision").getAttribute("data-revision");
  const fields = page.getByRole("combobox", { name: /Field for/ });
  const value = await fields.nth(1).inputValue();
  await fields.first().selectOption(value);
  await page.getByRole("button", { name: "Apply named field" }).click();
  await expect(page.getByRole("alert")).toContainText("FIELD");
  await expect(page.locator("#decision")).toHaveAttribute(
    "data-revision",
    before!,
  );
  await shot(page, browserName, "invalid-field");
  await fields.first().selectOption("slip-1");
  await page.getByRole("button", { name: "Apply named field" }).click();
  await settle(page);
  await page.getByLabel("Effort", { exact: true }).selectOption("MAXIMUM");
  await page.getByRole("button", { name: "Apply bowling plan" }).click();
  await settle(page);
  await expect(page.getByLabel("Effort", { exact: true })).toHaveValue(
    "MAXIMUM",
  );
  await expect(page.getByLabel("Variation", { exact: true })).toBeDisabled();
  await expect(
    page.getByText("Only stock is supported by this model."),
  ).toBeVisible();
  await page
    .locator(".tactic-grid>div")
    .first()
    .getByRole("combobox")
    .first()
    .selectOption("4");
  await settle(page);
  await expect(
    page.locator(".tactic-grid>div").first().getByRole("combobox").first(),
  ).toHaveValue("4");
});
