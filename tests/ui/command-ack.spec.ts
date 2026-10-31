import { expect, test } from "@playwright/test";

for (const format of ["T20", "ODI", "RED_BALL"] as const) test(`${format} worker acknowledges committed commands and rejects stale commands`, async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as { matchRequests: unknown[]; matchResponses: unknown[]; matchWorker?: Worker };
    target.matchRequests = []; target.matchResponses = [];
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        target.matchWorker = this;
        this.addEventListener("message", event => target.matchResponses.push(event.data));
      }
      override postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        target.matchRequests.push(structuredClone(message));
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
  await page.goto("/#exhibition");
  await page.getByLabel("Format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Call heads" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
  const result = await page.evaluate(async () => {
    type Item = { type: string; requestId: string; expectedRevision: number; command: { commandId: string; expectedRevision: number } };
    type Reply = { requestId: string; revision: number; error: string | null; view: { lastEventHash: string }; persistence: { saveId: string }; acknowledgement?: { commandId: string; committedRevision: number; fromSequence: number; toSequence: number } };
    const target = window as unknown as { matchRequests: Item[]; matchResponses: Reply[]; matchWorker: Worker };
    const command = target.matchRequests.filter(item => item.type === "COMMAND").at(-1)!;
    const original = target.matchResponses.find(item => item.requestId === command.requestId)!;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("lord-cricket-xxvi"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const stored = await new Promise<{ committedRevision: number }>((resolve, reject) => { const request = db.transaction("commands", "readonly").objectStore("commands").get([original.persistence.saveId, command.requestId]); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    const count = target.matchResponses.length;
    target.matchWorker.postMessage(command);
    const wait = async (index: number) => { for (let n = 0; n < 200 && target.matchResponses.length <= index; n++) await new Promise(resolve => setTimeout(resolve, 25)); return target.matchResponses[index]!; };
    const duplicate = await wait(count);
    const stale = structuredClone(command); stale.requestId = "ui-999999"; stale.expectedRevision = 0; stale.command.commandId = stale.requestId; stale.command.expectedRevision = 0;
    target.matchWorker.postMessage(stale);
    const rejected = await wait(count + 1);
    return { original, duplicate, rejected, stored };
  });
  expect(result.original.acknowledgement).toMatchObject({ commandId: result.original.requestId, committedRevision: result.original.revision });
  expect(result.stored.committedRevision).toBe(result.original.revision);
  expect(result.original.acknowledgement!.fromSequence).toBeLessThanOrEqual(result.original.acknowledgement!.toSequence);
  expect(result.duplicate.acknowledgement).toEqual(result.original.acknowledgement);
  expect(result.rejected.error).toContain("Stale");
  expect(result.rejected.acknowledgement).toBeUndefined();
  expect(result.rejected.revision).toBe(result.original.revision);
  expect(result.rejected.view.lastEventHash).toBe(result.original.view.lastEventHash);
});
