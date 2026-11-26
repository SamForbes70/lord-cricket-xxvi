import { expect, test } from "@playwright/test";

/**
 * "Finish over" plays the rest of the over one delivery at a time, and the computer captain is asked for its step
 * before each ball (owner direction, 26 November 2026). Before this, one ADVANCE { scope: "OVER" } bowled the rest
 * of the over on the plans in force. The page's messages to the match worker are recorded to check the order.
 */
test("Finish over asks the computer captain before every ball of the over", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const log: Array<{ type: string; kind?: string; scope?: string }> = [];
    (window as unknown as { __workerLog: typeof log }).__workerLog = log;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
      const m = message as { type?: string; command?: { kind?: string; payload?: { scope?: string } } } | null;
      if (m && typeof m.type === "string")
        log.push({ type: m.type, kind: m.command?.kind, scope: m.command?.payload?.scope });
      return (original as (...args: unknown[]) => void).call(this, message, ...rest);
    } as typeof Worker.prototype.postMessage;
  });
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  const finishOver = decision.getByRole("button", { name: "Finish over", exact: true });

  let checked = 0;
  for (let n = 0; n < 80 && checked < 2; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
    const phase = await decision.getAttribute("data-phase");
    const candidates = decision.locator("button[data-candidate]:enabled");
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click();
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidates.count()) > 0) await candidates.first().click();
    else if (phase === "READY" && (await finishOver.isEnabled().catch(() => false))) {
      await page.evaluate(() => { (window as unknown as { __workerLog: unknown[] }).__workerLog.length = 0; });
      await finishOver.click();
      await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 60_000 });
      await expect(decision.locator(".working")).toHaveText("Up to date", { timeout: 60_000 });
      const log = await page.evaluate(() => (window as unknown as { __workerLog: Array<{ type: string; kind?: string; scope?: string }> }).__workerLog);
      const advances = log.flatMap((entry, index) => (entry.kind === "ADVANCE" ? [{ ...entry, index }] : []));
      expect(advances.length).toBeGreaterThanOrEqual(1);
      expect(advances.length).toBeLessThanOrEqual(40);
      // Every advance is a single delivery: never the whole over in one command.
      expect(advances.every(a => a.scope === "DELIVERY")).toBe(true);
      // Between one ball and the next, the computer captain was asked for its step.
      for (let k = 1; k < advances.length; k += 1)
        expect(log.slice(advances[k - 1]!.index + 1, advances[k]!.index).some(entry => entry.type === "AI_STEP")).toBe(true);
      // After the last ball it is asked again, so its plans are in place for whatever comes next.
      expect(log.slice(advances.at(-1)!.index + 1).some(entry => entry.type === "AI_STEP")).toBe(true);
      checked += 1;
    } else await page.waitForTimeout(200);
  }
  expect(checked).toBe(2);
});
