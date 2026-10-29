/** Records browser observations without treating cloud hardware or partial memory metrics as reference acceptance. */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
type Probe = { commands: { label: string; ms: number; startedAtMs: number; completedAtMs: number }[]; longTasks: { startedAtMs: number; ms: number }[]; longTaskSupported: boolean };
declare global { interface Window { acceptanceProbe: Probe } }
test("production browser command acknowledgement and long-task observations", async ({ page, browser, browserName }) => {
  await page.addInitScript(() => {
    window.acceptanceProbe = { commands: [], longTasks: [], longTaskSupported: PerformanceObserver.supportedEntryTypes.includes("longtask") };
    let pending: { revision: string | null; label: string; start: number } | null = null;
    document.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null, decision = document.querySelector("#decision");
      if (!button || !decision?.contains(button)) return;
      pending = { revision: decision.getAttribute("data-revision"), label: button.textContent?.trim() ?? "", start: performance.now() };
    }, true);
    new MutationObserver(() => {
      const decision = document.querySelector("#decision");
      if (pending && decision?.getAttribute("aria-busy") === "false" && decision.getAttribute("data-revision") !== pending.revision) {
        const completedAtMs = performance.now(); window.acceptanceProbe.commands.push({ label: pending.label, ms: completedAtMs - pending.start, startedAtMs: pending.start, completedAtMs }); pending = null;
      }
    }).observe(document, { subtree: true, attributes: true, childList: true });
    if (window.acceptanceProbe.longTaskSupported) new PerformanceObserver(list => { window.acceptanceProbe.longTasks.push(...list.getEntries().map(e => ({ startedAtMs: e.startTime, ms: e.duration }))); }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  for (let step = 0; step < 80; step++) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    expect(await page.getByRole("alert").count()).toBe(0);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    if (phase === "COMPLETE" || await page.evaluate(() => window.acceptanceProbe.commands.length >= 30)) break;
    const target = phase === "TOSS" ? page.getByRole("button", { name: "Call heads" }) : phase === "AWAITING_INNINGS" ? page.getByRole("button", { name: "Bat first" }) : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER" ? page.locator("button[data-candidate]:enabled").first() : page.getByRole("button", { name: "Next delivery", exact: true });
    await target.click();
  }
  await page.waitForTimeout(100);
  const observations = await page.evaluate(() => ({ ...window.acceptanceProbe,
    jsHeapBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
    userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight } }));
  expect(observations.commands.length).toBeGreaterThanOrEqual(30);
  const timings = observations.commands.map(c => c.ms).sort((a, b) => a - b), p95 = timings[Math.ceil(timings.length * .95) - 1]!;
  const commandTasks = observations.longTasks.filter(task => observations.commands.some(command => task.startedAtMs <= command.completedAtMs && task.startedAtMs + task.ms >= command.startedAtMs));
  const directory = process.env.LCXXVI_ACCEPTANCE_DIR ?? "test-results/acceptance-observations"; mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${browserName}-performance.json`), JSON.stringify({ version: "LC_BROWSER_ACCEPTANCE_OBSERVATIONS_V1", browser: browserName, browserVersion: browser.version(), observations,
    commandAcknowledgement: { samples: timings.length, p95Ms: p95, proposedBudgetMs: 100, observedWithinProposedBudget: p95 < 100, scope: "Click dispatch to committed revision rendered without exhibition save; includes browser and worker scheduling." },
    longTasks: { supported: observations.longTaskSupported, maximumPageLifetimeMs: observations.longTasks.length ? Math.max(...observations.longTasks.map(t => t.ms)) : null, maximumDuringMeasuredCommandsMs: commandTasks.length ? Math.max(...commandTasks.map(t => t.ms)) : null, proposedMaximumMs: 50, scope: "Separate page-lifetime tasks from tasks overlapping measured command windows; entries expose tasks at least 50 ms." },
    status: "OBSERVATIONS_ONLY_REFERENCE_HARDWARE_UNVERIFIED", remainingBudgets: ["T20 engine-only match p95", "Five-day match p95", "56-match league", "IndexedDB save p95", "Active-game load p95", "Total application memory including workers and native allocations"],
    referenceHardwareAccepted: false }, null, 2) + "\n");
});

test("engine-only matches, complete league and full-season IndexedDB save/load observations", async ({ page, browser, browserName }) => {
  await page.goto("http://127.0.0.1:4192");
  await page.waitForFunction(() => typeof window.runReferenceEngineProbe === "function");
  const observations = await page.evaluate(() => window.runReferenceEngineProbe()) as {
    t20Ms: number[]; red5Ms: number[]; leagueMs: number; eventHashes: string[]; completedFixtures: number; saveMs: number[]; loadMs: number[]; finalHash: string; memoryScope: string;
  };
  expect(observations.completedFixtures).toBe(56); expect(observations.eventHashes).toHaveLength(40);
  for (const samples of [observations.t20Ms, observations.red5Ms, observations.saveMs, observations.loadMs]) {
    expect(samples).toHaveLength(20); expect(samples.every(ms => Number.isFinite(ms) && ms >= 0)).toBe(true);
  }
  const p95 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * .95) - 1]!;
  const directory = process.env.LCXXVI_ACCEPTANCE_DIR ?? "test-results/acceptance-observations"; mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${browserName}-engine-performance.json`), JSON.stringify({ version: "LC_ENGINE_ACCEPTANCE_OBSERVATIONS_V1", browser: browserName, browserVersion: browser.version(), observations,
    budgets: { t20: { p95Ms: p95(observations.t20Ms), proposedMs: 1000 }, red5: { p95Ms: p95(observations.red5Ms), proposedMs: 5000 }, league: { elapsedMs: observations.leagueMs, proposedMs: 60000 }, save: { p95Ms: p95(observations.saveMs), proposedMs: 500 }, load: { p95Ms: p95(observations.loadMs), proposedMs: 2000 } },
    scope: "Unchanged engines and full default-world league in a worker; save/load uses a completed 56-fixture season. Setup validation and state sealing occur outside the individual match/save timers.",
    referenceHardwareAccepted: false, totalApplicationMemoryMeasured: false }, null, 2) + "\n");
});
