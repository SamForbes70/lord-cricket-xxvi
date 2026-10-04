import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
test("production React shell validates commands without pretending to play", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/engineering.html");
  await expect(
    page.getByRole("heading", { name: "Lord Cricket XXVI" }),
  ).toBeVisible();
  await expect(page.getByText("M0 complete: verified world and immutable T20 setup")).toBeVisible();
  await expect(page.getByText(/SYNTHETIC_ALPHA/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play match (not available)" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Validate command" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Valid command structure",
  );
  await page.getByLabel("Command JSON").fill('{"evil":true}');
  await page.getByRole("button", { name: "Validate command" }).click();
  await expect(page.getByRole("status")).toContainText("Invalid command");
  for (const scale of ["100", "115", "125", "150"]) {
    await page.getByLabel("Text scale").selectOption(scale);
    await expect(
      page.getByRole("button", { name: "Validate command" }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByLabel("Text scale").selectOption("100");
  mkdirSync("docs/evidence", { recursive: true });
  await page.screenshot({ path: "docs/evidence/shell.png", fullPage: true });
});
test("compiled batch app reports accurate capabilities and rejects unsupported commands", () => {
  const status = JSON.parse(
    execFileSync(process.execPath, ["apps/batch/dist/index.js", "status"], {
      encoding: "utf8",
    }),
  );
  expect(status.playableMatches).toBe(false);
  expect(status.milestone).toBe("M2_HEADLESS_T20_COMPLETE_AFTER_ACCEPTANCE");
  expect(status.headlessT20Engine).toBe(true);
  expect(status.eventChainVersion).toBe("LC_T20_EVENT_CHAIN_V1");
  expect(status.fictionalWorldPlayers).toBe(160);
  expect(status.immutableT20Setup).toBe(true);
  expect(status.nextPass).toContain("M3");
  expect(status.integerProbabilityModel).toBe(true);
  expect(status.deliveryGenerator).toBe(true);
  expect(status.deliveryGeneratorVersion).toBe("LC_CONDITIONAL_DELIVERY_V1");
  const bad = spawnSync(
    process.execPath,
    ["apps/batch/dist/index.js", "simulate"],
    { encoding: "utf8" },
  );
  expect(bad.status).toBe(2);
  expect(
    execFileSync(
      process.execPath,
      [
        "apps/batch/dist/index.js",
        "validate-command",
        "tests/fixtures/command-valid.json",
      ],
      { encoding: "utf8" },
    ),
  ).toContain("Command structure valid");
  const missing = spawnSync(
    process.execPath,
    ["apps/batch/dist/index.js", "validate-command", "does-not-exist.json"],
    { encoding: "utf8" },
  );
  expect(missing.status).toBe(1);
});

test("compiled scoring CLI exercises production scorer and rejects malformed requests", () => {
  const good = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "apps/batch/dist/index.js",
        "score-delivery",
        "tests/fixtures/scoring/request-no-ball-four.json",
      ],
      { encoding: "utf8" },
    ),
  );
  expect(good.delta).toMatchObject({
    teamRuns: 5,
    batterRuns: 4,
    bowlerRuns: 5,
    legalBalls: 0,
    ballsFaced: 1,
  });
  expect(good.totals.runs).toBe(105);
  expect(good.freeHitPending).toBe(true);
  const bad = spawnSync(
    process.execPath,
    [
      "apps/batch/dist/index.js",
      "score-delivery",
      "tests/fixtures/command-valid.json",
    ],
    { encoding: "utf8" },
  );
  expect(bad.status).toBe(1);
});
