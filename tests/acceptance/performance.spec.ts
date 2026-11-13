/** Records browser observations across all eight budgets without treating cloud hardware as reference acceptance. */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { measureTotalApplicationMemory } from "./memory-probe.js";

type Probe = {
  commands: { label: string; ms: number; startedAtMs: number; completedAtMs: number }[];
  longTasks: { startedAtMs: number; ms: number }[];
  longTaskSupported: boolean;
};
declare global {
  interface Window {
    acceptanceProbe: Probe;
  }
}

test("production browser command acknowledgement and long-task observations", async ({ page, browser, browserName }) => {
  await page.addInitScript(() => {
    window.acceptanceProbe = {
      commands: [],
      longTasks: [],
      longTaskSupported: PerformanceObserver.supportedEntryTypes.includes("longtask"),
    };
    let pending: { revision: string | null; label: string; start: number } | null = null;
    document.addEventListener(
      "click",
      event => {
        const button = event.target instanceof Element ? event.target.closest("button") : null,
          decision = document.querySelector("#decision");
        if (!button || !decision?.contains(button)) return;
        pending = {
          revision: decision.getAttribute("data-revision"),
          label: button.textContent?.trim() ?? "",
          start: performance.now(),
        };
      },
      true,
    );
    new MutationObserver(() => {
      const decision = document.querySelector("#decision");
      if (
        pending &&
        decision?.getAttribute("aria-busy") === "false" &&
        decision.getAttribute("data-revision") !== pending.revision
      ) {
        const completedAtMs = performance.now();
        window.acceptanceProbe.commands.push({
          label: pending.label,
          ms: completedAtMs - pending.start,
          startedAtMs: pending.start,
          completedAtMs,
        });
        pending = null;
      }
    }).observe(document, { subtree: true, attributes: true, childList: true });
    if (window.acceptanceProbe.longTaskSupported)
      new PerformanceObserver(list => {
        window.acceptanceProbe.longTasks.push(
          ...list.getEntries().map(e => ({ startedAtMs: e.startTime, ms: e.duration })),
        );
      }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  for (let step = 0; step < 80; step++) {
    await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");
    expect(await page.getByRole("alert").count()).toBe(0);
    const phase = await page.locator("#decision").getAttribute("data-phase");
    if (phase === "COMPLETE" || (await page.evaluate(() => window.acceptanceProbe.commands.length >= 30))) break;
    const target =
      phase === "TOSS"
        ? page.getByRole("button", { name: "Call heads" })
        : phase === "AWAITING_INNINGS"
          ? page.getByRole("button", { name: "Bat first" })
          : phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER"
            ? page.locator("button[data-candidate]:enabled").first()
            : page.getByRole("button", { name: "Next delivery", exact: true });
    await target.click();
  }
  await page.waitForTimeout(100);
  const observations = await page.evaluate(async () => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    };
    let uaSpecificBytes: number | null = null;
    if (typeof perf.measureUserAgentSpecificMemory === "function") {
      try {
        const ua = await perf.measureUserAgentSpecificMemory();
        uaSpecificBytes = ua.bytes;
      } catch {
        uaSpecificBytes = null;
      }
    }
    return {
      ...window.acceptanceProbe,
      jsHeapBytes: perf.memory?.usedJSHeapSize ?? null,
      userAgentSpecificBytes: uaSpecificBytes,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const totalMemory = measureTotalApplicationMemory({
    browserName,
    mainThreadJsHeapBytes: observations.jsHeapBytes,
    userAgentSpecificBytes: observations.userAgentSpecificBytes,
  });
  expect(observations.commands.length).toBeGreaterThanOrEqual(30);
  const timings = observations.commands.map(c => c.ms).sort((a, b) => a - b),
    p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
  const commandTasks = observations.longTasks.filter(task =>
    observations.commands.some(
      command => task.startedAtMs <= command.completedAtMs && task.startedAtMs + task.ms >= command.startedAtMs,
    ),
  );
  const directory = process.env.LCXXVI_ACCEPTANCE_DIR ?? "test-results/acceptance-observations";
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${browserName}-performance.json`),
    JSON.stringify(
      {
        version: "LC_BROWSER_ACCEPTANCE_OBSERVATIONS_V1",
        browser: browserName,
        browserVersion: browser.version(),
        observations,
        commandAcknowledgement: {
          samples: timings.length,
          p95Ms: p95,
          confirmedBudgetMs: 100,
          proposedBudgetMs: 100,
          observedWithinConfirmedBudget: p95 < 100,
          observedWithinProposedBudget: p95 < 100,
          scope: "Click dispatch to committed revision rendered without exhibition save; includes browser and worker scheduling.",
        },
        longTasks: {
          supported: observations.longTaskSupported,
          maximumPageLifetimeMs: observations.longTasks.length
            ? Math.max(...observations.longTasks.map(t => t.ms))
            : null,
          maximumDuringMeasuredCommandsMs: commandTasks.length
            ? Math.max(...commandTasks.map(t => t.ms))
            : null,
          confirmedMaximumMs: 50,
          proposedMaximumMs: 50,
          observedWithinConfirmedBudget:
            commandTasks.length === 0 || Math.max(...commandTasks.map(t => t.ms)) <= 50,
          scope: "Separate page-lifetime tasks from tasks overlapping measured command windows; entries expose tasks at least 50 ms.",
        },
        totalApplicationMemory: totalMemory,
        status: "OBSERVATIONS_ONLY_REFERENCE_HARDWARE_UNVERIFIED",
        remainingUnconfirmedThresholds: totalMemory.thresholdConfirmedByOwner
          ? []
          : ["Total application memory numeric threshold (LCXXVI_MEMORY_BUDGET_MB pending owner confirmation)"],
        referenceHardwareAccepted: false,
      },
      null,
      2,
    ) + "\n",
  );
});

test("engine-only matches, complete league, full-season IndexedDB save/load, and worker/native memory observations", async ({
  page,
  browser,
  browserName,
}) => {
  await page.goto("http://127.0.0.1:4192");
  await page.waitForFunction(() => typeof window.runReferenceEngineProbe === "function");
  const observations = (await page.evaluate(() => window.runReferenceEngineProbe())) as {
    t20Ms: number[];
    red5Ms: number[];
    leagueMs: number;
    eventHashes: string[];
    completedFixtures: number;
    saveMs: number[];
    loadMs: number[];
    finalHash: string;
    memoryScope: string;
  };
  const heapSnap = await page.evaluate(async () => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    };
    let uaSpecificBytes: number | null = null;
    if (typeof perf.measureUserAgentSpecificMemory === "function") {
      try {
        uaSpecificBytes = (await perf.measureUserAgentSpecificMemory()).bytes;
      } catch {
        uaSpecificBytes = null;
      }
    }
    return {
      jsHeapBytes: perf.memory?.usedJSHeapSize ?? null,
      userAgentSpecificBytes: uaSpecificBytes,
    };
  });
  const peakLeagueMemory = measureTotalApplicationMemory({
    browserName,
    mainThreadJsHeapBytes: heapSnap.jsHeapBytes,
    userAgentSpecificBytes: heapSnap.userAgentSpecificBytes,
  });
  expect(observations.completedFixtures).toBe(56);
  expect(observations.eventHashes).toHaveLength(40);
  for (const samples of [observations.t20Ms, observations.red5Ms, observations.saveMs, observations.loadMs]) {
    expect(samples).toHaveLength(20);
    expect(samples.every(ms => Number.isFinite(ms) && ms >= 0)).toBe(true);
  }
  const p95 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
  const t20P95 = p95(observations.t20Ms);
  const red5P95 = p95(observations.red5Ms);
  const saveP95 = p95(observations.saveMs);
  const loadP95 = p95(observations.loadMs);
  const directory = process.env.LCXXVI_ACCEPTANCE_DIR ?? "test-results/acceptance-observations";
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${browserName}-engine-performance.json`),
    JSON.stringify(
      {
        version: "LC_ENGINE_ACCEPTANCE_OBSERVATIONS_V1",
        browser: browserName,
        browserVersion: browser.version(),
        observations,
        budgets: {
          t20: { p95Ms: t20P95, confirmedMs: 1000, proposedMs: 1000, observedWithinConfirmedBudget: t20P95 <= 1000 },
          red5: { p95Ms: red5P95, confirmedMs: 5000, proposedMs: 5000, observedWithinConfirmedBudget: red5P95 <= 5000 },
          league: {
            elapsedMs: observations.leagueMs,
            confirmedMs: 60000,
            proposedMs: 60000,
            observedWithinConfirmedBudget: observations.leagueMs <= 60000,
          },
          save: { p95Ms: saveP95, confirmedMs: 500, proposedMs: 500, observedWithinConfirmedBudget: saveP95 <= 500 },
          load: { p95Ms: loadP95, confirmedMs: 2000, proposedMs: 2000, observedWithinConfirmedBudget: loadP95 <= 2000 },
          totalApplicationMemory: peakLeagueMemory,
        },
        scope:
          "Unchanged engines and full default-world league in a worker; save/load uses a completed 56-fixture season; totalApplicationMemory captures OS-level browser+worker+native allocations alongside JS heap.",
        referenceHardwareAccepted: false,
        totalApplicationMemoryMeasured: peakLeagueMemory.includesWorkersAndNativeAllocations,
        totalApplicationMemoryThresholdConfirmed: peakLeagueMemory.thresholdConfirmedByOwner,
      },
      null,
      2,
    ) + "\n",
  );
});
