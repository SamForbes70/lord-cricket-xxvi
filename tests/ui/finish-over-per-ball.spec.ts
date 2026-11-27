import { expect, test, type Page } from "@playwright/test";

/**
 * Every advancement mode asks the computer captain before every ball (Directive 03, docs/pavilion/UNIFIED_ADVANCE.md).
 *
 * "Finish over" first did this from the page (#168, owner direction of 26 November 2026), one delivery and one AI_STEP
 * at a time. The match worker now plays the balls of every mode itself through ADVANCE_WITH_CAPTAINS: before each ball
 * and after the last it asks each computer seat until none has a command. The page's messages and the worker's replies
 * are recorded: no mode may send a bare ADVANCE command, each advance names the computer side, the worker reports that
 * it consulted that side before each ball it bowled and again after the last, and the saved command log holds one
 * delivery per ADVANCE.
 */
type Sent = { type: string; requestId?: string; kind?: string; scope?: string; aiTeamId?: string | null };
type Reply = { requestId: string; revision: number; error: string | null; advance?: { scope: string; stop: string; balls: number; seats: string[]; consultedBeforeBall: number[]; settledRevision: number | null } };

async function recordWorker(page: Page) {
  await page.addInitScript(() => {
    const target = window as unknown as { __sent: Sent[]; __replies: Reply[] };
    target.__sent = []; target.__replies = [];
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", event => {
          const r = event.data as Reply;
          if (r && typeof r.requestId === "string") target.__replies.push({ requestId: r.requestId, revision: r.revision, error: r.error, ...(r.advance ? { advance: r.advance } : {}) });
        });
      }
      override postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        const m = message as { type?: string; requestId?: string; scope?: string; aiTeamId?: string | null; command?: { kind?: string; payload?: { scope?: string } } } | null;
        if (m && typeof m.type === "string") {
          const scope = m.scope ?? m.command?.payload?.scope;
          target.__sent.push({ type: m.type, ...(m.requestId ? { requestId: m.requestId } : {}), ...(m.command?.kind ? { kind: m.command.kind } : {}),
            ...(scope ? { scope } : {}), ...("aiTeamId" in m ? { aiTeamId: m.aiTeamId ?? null } : {}) });
        }
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
}

async function savedCommands(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const get = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const active = await get(db.transaction("settings", "readonly").objectStore("settings").get("activeSaveId")) as { value: string };
    const rows = await get(db.transaction("commands", "readonly").objectStore("commands").getAll()) as { saveId: string; requestCanonical: string }[];
    db.close();
    return rows.filter(row => row.saveId === active.value).map(row => JSON.parse(row.requestCanonical) as { origin?: string; command?: { kind: string; actorId: string; payload: { scope?: string } } });
  });
}

test("every advancement mode asks the computer captain before every ball", async ({ page }) => {
  test.setTimeout(420_000);
  await recordWorker(page);
  await page.goto("/#title");
  await page.getByRole("button", { name: /Quick match/ }).click();
  const decision = page.locator("#decision");
  await expect(decision).toHaveAttribute("data-phase", "TOSS", { timeout: 60_000 });
  const computer = await page.locator("#ai-opponent-select").inputValue();
  expect(computer).not.toBe("");

  const modes = ["Next delivery", "Finish over", "Next key moment", "Next decision", "Finish innings", "Finish match"] as const;
  const pressed = new Set<string>();
  let mode = 0;
  for (let n = 0; n < 400 && (await decision.getAttribute("data-phase")) !== "COMPLETE"; n += 1) {
    await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 120_000 });
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    const candidates = decision.locator("button[data-candidate]:enabled");
    const name = modes[Math.min(mode, modes.length - 1)]!;
    const button = name === "Next key moment" ? decision.getByTestId("next-key-moment") : decision.getByRole("button", { name, exact: true });
    if (phase === "TOSS") await decision.getByRole("button", { name: "Call heads" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "AWAITING_INNINGS") await decision.getByRole("button", { name: "Bat first" }).click({ timeout: 2_000 }).catch(() => undefined);
    else if ((await candidates.count()) > 0) await candidates.first().click({ timeout: 2_000 }).catch(() => undefined);
    else if (phase === "READY" && (await button.isEnabled().catch(() => false))) {
      await page.evaluate(() => { const t = window as unknown as { __sent: unknown[]; __replies: unknown[] }; t.__sent.length = 0; t.__replies.length = 0; });
      await button.click();
      await expect(decision).toHaveAttribute("aria-busy", "false", { timeout: 300_000 });
      if ((await decision.getAttribute("data-phase")) !== "COMPLETE") await expect(decision.locator(".working")).toHaveText("Up to date", { timeout: 60_000 });
      const { sent, replies } = await page.evaluate(() => { const t = window as unknown as { __sent: Sent[]; __replies: Reply[] }; return { sent: [...t.__sent], replies: [...t.__replies] }; });
      // No mode sends a bare ADVANCE command any more: every advance goes through the worker's one path.
      expect(sent.filter(m => m.type === "COMMAND" && m.kind === "ADVANCE"), name).toEqual([]);
      const advances = sent.filter(m => m.type === "ADVANCE_WITH_CAPTAINS");
      expect(advances.length, name).toBeGreaterThanOrEqual(1);
      let balls = 0;
      for (const advance of advances) {
        expect(advance.aiTeamId, name).toBe(computer);
        expect(advance.scope, name).toBe(name === "Next delivery" || name === "Next key moment" ? "DELIVERY" : "OVER");
        const reply = replies.find(r => r.requestId === advance.requestId);
        expect(reply?.error ?? null, name).toBeNull();
        const report = reply!.advance!;
        expect(report.seats, name).toContain(`opponent:${computer}`);
        // The computer side was asked before every ball the worker bowled...
        expect(report.consultedBeforeBall, name).toHaveLength(report.balls);
        // ...and again after the last one, so its plans are in place for whatever comes next.
        expect(report.settledRevision, name).toBe(reply!.revision);
        balls += report.balls;
      }
      expect(balls, name).toBeGreaterThanOrEqual(1);
      pressed.add(name);
      mode += 1;
    } else await page.waitForTimeout(200);
  }
  expect([...pressed].sort()).toEqual([...modes].sort());
  await expect(decision).toHaveAttribute("data-phase", "COMPLETE");
  // The saved log: with a computer side every ADVANCE is a single delivery by the system actor, and the computer's
  // own commands are saved with origin AI, as AI_STEP saved them.
  const saved = await savedCommands(page);
  const advances = saved.filter(row => row.command?.kind === "ADVANCE");
  expect(advances.length).toBeGreaterThan(150);
  expect(advances.every(row => row.command!.payload.scope === "DELIVERY" && row.command!.actorId === "SYSTEM" && row.origin === "HUMAN")).toBe(true);
  const ai = saved.filter(row => row.origin === "AI");
  expect(ai.length).toBeGreaterThan(10);
  expect(ai.every(row => row.command!.actorId === `AI:${computer}`)).toBe(true);
});
