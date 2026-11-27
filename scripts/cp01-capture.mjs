/* global document, window, performance, requestAnimationFrame, getComputedStyle, HTMLElement, innerHeight */
/**
 * CP01 creative audit capture (Studio Production Directive 05). Walks the current build's journeys in Chromium and
 * writes raw PNG screenshots, a metrics JSON and (optionally) videos. It changes no game state outside the browser
 * profile it creates and needs a served build, for example:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4185 node scripts/ui-preview-server.mjs &
 *   CP01_BASE=http://127.0.0.1:4185 CP01_OUT=/tmp/cp01 node scripts/cp01-capture.mjs [main|scale150|perf|a11y|video]
 *
 * Screenshots are taken at deviceScaleFactor 1 by resizing one page to each size (1366x768 and 1920x1080 for every
 * screen; 1280x720, 2560x1440 and 390x844 as well for the key screens). The `scale150` part opens a 1280x720 viewport
 * at deviceScaleFactor 1.5, which is what a 1920x1080 display at Windows 150% scaling presents to the page.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP01_BASE ?? "http://127.0.0.1:4185";
const OUT = process.env.CP01_OUT ?? "cp01-out";
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["main", "onboarding", "scale150", "perf", "a11y", "video"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

const FULL = [[1366, 768], [1920, 1080]];
const KEY = [[1366, 768], [1920, 1080], [1280, 720], [2560, 1440], [390, 844]];
const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, notCaptured: [], pageErrors: [], consoleErrors: [], perf: {}, a11y: {} };
const browsers = [];
const launch = async () => { const b = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info", "--no-sandbox"] }); browsers.push(b); return b; };

function watch(page, label) {
  page.on("pageerror", (e) => metrics.pageErrors.push({ label, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
}

async function settle(page, ms = 350) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}

/** Screenshots the page (or one element) at each size, then returns to 1366x768. */
async function shot(page, name, { sizes = FULL, fullPage = false, element = null, suffix = "" } = {}) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page);
    const file = join(SHOTS, `${name}${suffix}_${w}x${h}${fullPage ? "_full" : ""}.png`);
    try {
      if (element) await page.locator(element).first().screenshot({ path: file, timeout: 15_000 });
      else await page.screenshot({ path: file, fullPage });
      metrics.shots.push(file);
    } catch (e) { metrics.notCaptured.push({ name: `${name}_${w}x${h}`, error: String(e.message).slice(0, 200) }); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    metrics.overflow[`${name}_${w}x${h}`] = overflow;
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

async function step(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("FAIL", label, e.message.split("\n")[0]); metrics.notCaptured.push({ name: label, error: String(e.message).split("\n")[0].slice(0, 300) }); }
}

const decision = (page) => page.locator("#decision");
async function idle(page, timeout = 60_000) {
  await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout });
}
async function phase(page) { return decision(page).getAttribute("data-phase"); }

/** One step against the computer: the player's own decision when offered, otherwise the chosen advance. */
async function play(page, advance = "Finish over") {
  await idle(page);
  const p = await phase(page);
  if (p === "COMPLETE") return p;
  const d = decision(page);
  const revision = await d.getAttribute("data-revision");
  const target = p === "TOSS" ? d.getByRole("button", { name: "Call heads" })
    : p === "AWAITING_INNINGS" ? d.getByRole("button", { name: "Bat first" })
    : p === "AWAITING_BATTER" || p === "AWAITING_BOWLER" ? d.locator("button[data-candidate]:enabled").first()
    : d.getByRole("button", { name: advance, exact: true });
  if ((await target.count()) > 0 && (await target.isEnabled().catch(() => false))) await target.click();
  else await page.waitForFunction((r) => document.querySelector("#decision")?.getAttribute("data-revision") !== r, revision, { timeout: 60_000 }).catch(() => undefined);
  await idle(page);
  return phase(page);
}

async function oversText(page) { return (await page.locator(".scorestrip .over").first().textContent().catch(() => "")) ?? ""; }
function legalBalls(text) { const m = /(\d+)\.(\d)/.exec(text); return m ? Number(m[1]) * 6 + Number(m[2]) : null; }
async function heap(page) { return page.evaluate(() => (performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null)); }

async function playToEnd(page) {
  for (let n = 0; n < 400; n += 1) { if ((await play(page, "Finish innings")) === "COMPLETE") return true; }
  return false;
}

async function main() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watch(page, "main");
  metrics.heap = {};

  await step("title", async () => {
    await page.goto(`${BASE}/#title`);
    await page.getByRole("button", { name: /Quick match/ }).waitFor({ timeout: 30_000 });
    await shot(page, "01-title-first-launch", { sizes: KEY });
    metrics.heap.title = await heap(page);
    await page.getByRole("button", { name: "Keep sound off" }).click();
    await shot(page, "02-title-main-menu", { sizes: KEY });
  });
  await step("exhibition-setup", async () => {
    await page.goto(`${BASE}/#exhibition`);
    await page.getByRole("button", { name: "Confirm XIs and start" }).waitFor({ timeout: 30_000 });
    await shot(page, "03-exhibition-setup");
    await shot(page, "03-exhibition-setup", { sizes: [[1366, 768]], fullPage: true });
  });
  for (const [hash, name, ready] of [["#tournaments", "04-tournaments", "h2"], ["#scenarios", "05-scenarios", "h2"], ["#rain", "06-rain", "h2"]]) {
    await step(name, async () => {
      await page.goto(`${BASE}/${hash}`);
      await page.locator(ready).first().waitFor({ timeout: 30_000 });
      await settle(page, 800);
      await shot(page, name);
    });
  }
  await step("club-selection", async () => {
    await page.goto(`${BASE}/#career`);
    await page.getByRole("button", { name: /Aster Harbour/i }).first().waitFor({ timeout: 30_000 });
    await shot(page, "07-new-career-club-selection");
    await shot(page, "07-new-career-club-selection", { sizes: [[1366, 768]], fullPage: true });
  });
  const club = page.getByRole("navigation", { name: "Career navigation" });
  await step("clubhouse", async () => {
    await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
    await club.waitFor({ timeout: 30_000 });
    await settle(page, 800);
    await shot(page, "08-clubhouse", { sizes: KEY });
    await shot(page, "08-clubhouse", { sizes: FULL, fullPage: true });
    metrics.heap.clubhouse = await heap(page);
  });
  await step("squad", async () => {
    await club.getByRole("button", { name: "Squad" }).click();
    await page.getByTestId("training-presets").waitFor({ timeout: 30_000 });
    await shot(page, "09-squad");
    await shot(page, "09-squad", { sizes: [[1366, 768]], fullPage: true });
    await page.getByTestId("training-presets").scrollIntoViewIfNeeded();
    await shot(page, "10-training", { sizes: [[1366, 768]] });
    await page.getByTestId("youth-academy-panel").scrollIntoViewIfNeeded();
    await shot(page, "11-youth-academy", { sizes: [[1366, 768]] });
  });
  await step("player-page", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const link = page.locator("main table tbody tr button, main table tbody tr a").first();
    await link.click();
    await settle(page, 800);
    await shot(page, "12-player-page");
    await shot(page, "12-player-page", { sizes: [[1366, 768]], fullPage: true });
  });
  await step("office", async () => {
    await club.getByRole("button", { name: "Office" }).click();
    await page.locator("#contracts-heading").waitFor({ timeout: 30_000 });
    await settle(page, 600);
    await shot(page, "13-office-contracts-recruitment");
    await shot(page, "13-office-contracts-recruitment", { sizes: [[1366, 768]], fullPage: true });
  });
  await step("season", async () => {
    await club.getByRole("button", { name: "Season" }).click();
    const sections = page.getByRole("navigation", { name: "Season sections" });
    await sections.waitFor({ timeout: 30_000 });
    await settle(page, 600);
    await shot(page, "14-season-fixtures");
    await sections.getByRole("button", { name: "Statistics" }).click();
    await settle(page, 1200);
    await shot(page, "15-season-statistics-league-table");
    await shot(page, "15-season-statistics-league-table", { sizes: [[1366, 768]], fullPage: true });
    await sections.getByRole("button", { name: "Stories" }).click();
    await settle(page, 800);
    await shot(page, "16-season-stories");
  });
  await step("settings-save-load", async () => {
    await club.getByRole("button", { name: "Settings" }).click();
    await settle(page, 800);
    await shot(page, "17-settings-save-load");
    await shot(page, "17-settings-save-load", { sizes: [[1366, 768]], fullPage: true });
  });
  await step("match-preparation", async () => {
    await club.getByRole("button", { name: "Clubhouse" }).click();
    const advance = page.getByRole("button", { name: "Advance to match day" });
    if (await advance.isVisible().catch(() => false)) {
      await advance.click();
      await page.getByRole("button", { name: "Play match" }).waitFor({ state: "visible", timeout: 60_000 });
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Play match" && !b.disabled), null, { timeout: 60_000 });
    }
    await settle(page, 800);
    await shot(page, "18-match-day-team-selection", { sizes: FULL });
    await shot(page, "18-match-day-team-selection", { sizes: [[1366, 768]], fullPage: true });
  });
  await step("toss", async () => {
    await page.getByRole("button", { name: "Play match" }).click();
    await idle(page);
    await settle(page, 800);
    await shot(page, "19-career-match-toss", { sizes: KEY });
  });
  await step("live-match", async () => {
    for (let n = 0; n < 6; n += 1) {
      const p = await phase(page);
      if (p === "AWAITING_BATTER" || p === "AWAITING_BOWLER") { await settle(page, 400); await shot(page, "20-decision-panel-selection", { sizes: FULL }); }
      if (p !== "TOSS" && p !== "AWAITING_INNINGS" && n > 1 && legalBalls(await oversText(page)) >= 6) break;
      await play(page, "Next delivery");
    }
    for (let n = 0; n < 30 && (legalBalls(await oversText(page)) ?? 0) < 24; n += 1) await play(page, "Finish over");
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 800);
    await shot(page, "21-live-match", { sizes: KEY });
    await shot(page, "21-live-match", { sizes: FULL, fullPage: true });
    metrics.heap.liveMatch = await heap(page);
    await page.locator("#decision").scrollIntoViewIfNeeded();
    await shot(page, "22-decision-panel-and-tactics", { sizes: FULL });
    await shot(page, "23-live-field", { sizes: FULL, element: "[data-testid='live-field-panel']" });
    await page.locator("#dugout-tactics").scrollIntoViewIfNeeded();
    await shot(page, "24-tactical-controls", { sizes: FULL });
    await page.locator("#dugout-scorecard").scrollIntoViewIfNeeded();
    await shot(page, "25-scorecard-analysis", { sizes: FULL });
    await shot(page, "26-analytics-panel", { sizes: [[1366, 768]], element: ".analytics-overs" });
  });
  await step("match-conclusion", async () => {
    const done = await playToEnd(page);
    if (!done) throw new Error("match did not finish");
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 1000);
    await shot(page, "27-match-conclusion", { sizes: KEY });
    await shot(page, "27-match-conclusion", { sizes: FULL, fullPage: true });
    const pma = page.getByTestId("post-match-analysis");
    await pma.scrollIntoViewIfNeeded();
    await shot(page, "28-post-match-analysis", { sizes: KEY });
    await shot(page, "28-post-match-analysis", { sizes: [[1366, 768]], element: "[data-testid='post-match-analysis']", suffix: "-panel" });
    metrics.heap.postMatch = await heap(page);
  });
  await step("return-to-career", async () => {
    await page.getByRole("button", { name: "Return result to career" }).click();
    await club.waitFor({ timeout: 60_000 });
    await settle(page, 1200);
    await shot(page, "29-clubhouse-after-match", { sizes: FULL });
    await shot(page, "29-clubhouse-after-match", { sizes: [[1366, 768]], fullPage: true });
  });
  await step("season-to-review", async () => {
    for (let round = 2; round <= 14; round += 1) {
      const advance = page.getByRole("button", { name: "Advance to match day" });
      if (await advance.isVisible().catch(() => false)) {
        await advance.click();
        await page.locator(".save-badge strong", { hasText: "Saved" }).waitFor({ timeout: 60_000 });
      }
      await page.getByRole("button", { name: "Simulate match" }).click();
      await page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true }).waitFor({ timeout: 90_000 });
      await page.locator(".save-badge strong", { hasText: "Saved" }).waitFor({ timeout: 60_000 });
    }
    const finale = page.getByTestId("season-finale");
    await finale.waitFor({ timeout: 60_000 });
    for (let s = 1; s <= 6; s += 1) {
      await settle(page, 800);
      await shot(page, `30-season-review-step${s}`, { sizes: s === 1 ? KEY : FULL });
      const next = page.getByTestId("season-finale-continue");
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
    }
    for (let s = 0; s < 6 && (await finale.isVisible().catch(() => false)); s += 1) await page.getByTestId("season-finale-continue").click().catch(() => undefined);
  });
  await step("league-table-final", async () => {
    await club.getByRole("button", { name: "Season" }).click();
    await page.getByRole("navigation", { name: "Season sections" }).getByRole("button", { name: "Statistics" }).click();
    await settle(page, 1500);
    await shot(page, "31-league-table-season-end");
    await club.getByRole("button", { name: "Clubhouse" }).click();
    await settle(page, 800);
    await shot(page, "32-clubhouse-season-complete");
  });
  await step("career-progression", async () => {
    await page.getByTestId("rollover-next-season-btn").click();
    await page.getByTestId("career-masthead-subtitle").filter({ hasText: "Season 2" }).waitFor({ timeout: 90_000 });
    await settle(page, 1000);
    await shot(page, "33-career-progression-season2");
  });
  await step("choose-career-load", async () => {
    await page.getByRole("button", { name: "Choose career" }).click();
    await settle(page, 1200);
    await shot(page, "34-load-existing-career", { sizes: [[1366, 768]], fullPage: true });
  });
  await browser.close();
}

/** Quick match and the guided first match, each from a fresh profile (a career profile restores its own match). */
async function onboarding() {
  const browser = await launch();
  await step("quick-match-guided", async () => {
    const p2 = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
    watch(p2, "guided");
    await p2.goto(`${BASE}/#title`);
    await p2.getByRole("button", { name: /Guided first match/ }).click();
    await p2.getByTestId("guided-coach").waitFor({ timeout: 30_000 });
    await settle(p2, 800);
    await shot(p2, "35-guided-first-match-coach", { sizes: FULL });
    await p2.getByRole("button", { name: "Call heads" }).click();
    await idle(p2);
    await settle(p2, 600);
    await shot(p2, "36-guided-after-toss", { sizes: [[1366, 768]] });
    await p2.getByRole("button", { name: "End the guide" }).click().catch(() => undefined);
    await p2.close();
  });
  await step("quick-match", async () => {
    const p3 = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
    watch(p3, "quick");
    await p3.goto(`${BASE}/#title`);
    await p3.getByRole("button", { name: /Quick match/ }).click();
    await p3.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
    await settle(p3, 800);
    await shot(p3, "37-quick-match-toss", { sizes: FULL });
    await p3.close();
  });
  await browser.close();
}

/** 1280x720 at deviceScaleFactor 1.5 for the key screens. */
async function scale150() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  watch(page, "scale150");
  const s = async (name) => {
    await settle(page, 600);
    const file = join(SHOTS, `${name}_1280x720@1.5x.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_1280x720@1.5x`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  };
  await step("150-title", async () => { await page.goto(`${BASE}/#title`); await page.getByRole("button", { name: /Quick match/ }).waitFor(); await s("01-title-first-launch"); });
  await step("150-clubhouse", async () => {
    await page.goto(`${BASE}/#career`);
    await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
    await page.getByRole("navigation", { name: "Career navigation" }).waitFor({ timeout: 30_000 });
    await s("08-clubhouse");
  });
  await step("150-live-match", async () => {
    await page.goto(`${BASE}/#title`);
    await page.getByRole("button", { name: /Quick match/ }).click();
    await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
    for (let n = 0; n < 30 && (legalBalls(await oversText(page)) ?? 0) < 18; n += 1) await play(page, "Finish over");
    await page.evaluate(() => window.scrollTo(0, 0));
    await s("21-live-match");
    if (!(await playToEnd(page))) throw new Error("match did not finish");
    await page.evaluate(() => window.scrollTo(0, 0));
    await s("27-match-conclusion");
    await page.getByTestId("post-match-analysis").scrollIntoViewIfNeeded();
    await s("28-post-match-analysis");
  });
  await browser.close();
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function perf() {
  const browser = await launch();
  const title = [];
  for (let run = 0; run < 3; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    const t0 = Date.now();
    await page.goto(`${BASE}/#title`, { waitUntil: "commit" });
    await page.getByRole("button", { name: /Quick match/ }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !!document.querySelector(".title-play") && !document.querySelector(".title-play").disabled);
    const wall = Date.now() - t0;
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, transferKB: Math.round(performance.getEntriesByType("resource").reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) };
    });
    title.push({ run: run + 1, cold: true, wallMsToInteractiveTitle: wall, ...nav });
    await context.close();
  }
  metrics.perf.title = title;
  console.log("title perf", JSON.stringify(title));

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "perf");
  await page.goto(`${BASE}/#career`);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  const club = page.getByRole("navigation", { name: "Career navigation" });
  await club.waitFor({ timeout: 30_000 });
  await settle(page, 1500);
  const nav = {};
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (const [name, ready] of [["Squad", "[data-testid='training-presets']"], ["Office", "#contracts-heading"], ["Season", "nav[aria-label='Season sections']"], ["Settings", null], ["Clubhouse", "#home-heading"]]) {
      const btn = club.getByRole("button", { name });
      const t0 = Date.now();
      await btn.click();
      await page.waitForFunction((n) => [...document.querySelectorAll("nav[aria-label='Career navigation'] button")].some((b) => b.textContent?.trim() === n && b.hasAttribute("aria-current")), name);
      if (ready) await page.locator(ready).first().waitFor();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      (nav[name] ??= []).push(Date.now() - t0);
      console.log("nav", name, Date.now() - t0);
    }
  }
  metrics.perf.navigation = Object.fromEntries(Object.entries(nav).map(([k, v]) => [k, { samples: v, median: median(v) }]));
  metrics.perf.heapClubhouse = await heap(page);

  // Delivery timing in a quick match against the computer captain.
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).click();
  await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
  const over = [], single = [];
  for (let n = 0; n < 80 && (over.length < 8 || single.length < 12); n += 1) {
    await idle(page);
    const p = await phase(page);
    if (p === "COMPLETE") break;
    const before = legalBalls(await oversText(page));
    const wantSingle = single.length < 12 && over.length >= 4;
    const label = wantSingle ? "Next delivery" : "Finish over";
    const btn = decision(page).getByRole("button", { name: label, exact: true });
    if (p !== "READY" || !(await btn.isEnabled().catch(() => false))) { await play(page, "Finish over"); continue; }
    const t0 = Date.now();
    await btn.click();
    await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "true", null, { timeout: 2000 }).catch(() => undefined);
    await idle(page);
    const ms = Date.now() - t0;
    const after = legalBalls(await oversText(page));
    const balls = before != null && after != null ? after - before : null;
    console.log("delivery", p, label, before, after, ms);
    if (balls && balls > 0) (wantSingle ? single : over).push({ ms, balls, msPerBall: Math.round(ms / balls) });
  }
  metrics.perf.finishOver = { samples: over, medianMsPerBall: median(over.map((o) => o.msPerBall)) };
  metrics.perf.nextDelivery = { samples: single, medianMsPerBall: median(single.map((o) => o.msPerBall)) };
  metrics.perf.heapMidMatch = await heap(page);
  const t0 = Date.now();
  await playToEnd(page);
  metrics.perf.finishInningsToEndMs = Date.now() - t0;
  metrics.perf.heapAfterMatch = await heap(page);
  await browser.close();
}

/** Contrast of visible text against the composited solid background colours; focus indicators; reduced motion. */
const CONTRAST_SCRIPT = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= 1) break; }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
    return base;
  };
  const out = { checked: 0, fails: [] };
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    const bg = bgOf(el);
    const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    out.checked += 1;
    if (ratio < (large ? 3 : 4.5)) {
      const key = `${text.slice(0, 40)}|${ratio.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.fails.push({ text: text.slice(0, 60), ratio: Number(ratio.toFixed(2)), fontPx: size, fg: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, cls: el.className?.toString().slice(0, 40) ?? "", tag: el.tagName });
    }
  }
  out.fontSizesPx = [...new Set([...document.querySelectorAll("body *")].filter((e) => e instanceof HTMLElement && e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontSize))].sort((a, b) => parseFloat(a) - parseFloat(b));
  return out;
};

async function focusWalk(page, label, tabs = 25) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = [];
  for (let i = 0; i < tabs; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visibleRing = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
      return { tag: el.tagName, name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow.slice(0, 60), visibleRing };
    });
    if (info) stops.push(info);
  }
  await page.screenshot({ path: join(SHOTS, `40-focus-${label}_1366x768.png`) });
  metrics.shots.push(join(SHOTS, `40-focus-${label}_1366x768.png`));
  return { stops: stops.length, withoutVisibleRing: stops.filter((s) => !s.visibleRing), sample: stops.slice(0, 6) };
}

async function a11y() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page, "a11y");
  const result = { contrast: {}, focus: {}, reducedMotion: {} };
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).waitFor();
  await settle(page, 800);
  result.contrast.title = await page.evaluate(CONTRAST_SCRIPT);
  result.focus.title = await focusWalk(page, "title", 12);
  await page.goto(`${BASE}/#career`);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().waitFor();
  result.contrast.clubSelection = await page.evaluate(CONTRAST_SCRIPT);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  const club = page.getByRole("navigation", { name: "Career navigation" });
  await club.waitFor({ timeout: 30_000 });
  await settle(page, 1000);
  result.contrast.clubhouse = await page.evaluate(CONTRAST_SCRIPT);
  result.focus.clubhouse = await focusWalk(page, "clubhouse", 25);
  await club.getByRole("button", { name: "Squad" }).click();
  await settle(page, 1000);
  result.contrast.squad = await page.evaluate(CONTRAST_SCRIPT);
  await club.getByRole("button", { name: "Office" }).click();
  await settle(page, 1000);
  result.contrast.office = await page.evaluate(CONTRAST_SCRIPT);
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).click();
  await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
  for (let n = 0; n < 30 && (legalBalls(await oversText(page)) ?? 0) < 12; n += 1) await play(page, "Finish over");
  await settle(page, 800);
  result.contrast.liveMatch = await page.evaluate(CONTRAST_SCRIPT);
  result.focus.liveMatch = await focusWalk(page, "live-match", 30);
  result.reducedMotion.defaultAnimationsAfterOver = await page.evaluate(() => document.getAnimations().map((a) => a.animationName ?? a.constructor.name));
  await playToEnd(page);
  await settle(page, 800);
  result.contrast.matchComplete = await page.evaluate(CONTRAST_SCRIPT);
  await context.close();

  // Reduced motion: count running animations and transitions on the same screens with the preference set.
  const sample = async (reducedMotion) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/#title`);
    await pg.getByRole("button", { name: /Quick match/ }).waitFor();
    await pg.waitForTimeout(300);
    const titleAnims = await pg.evaluate(() => document.getAnimations().map((a) => a.animationName ?? "transition"));
    await pg.getByRole("button", { name: /Quick match/ }).click();
    await pg.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
    const counts = [];
    for (let n = 0; n < 12; n += 1) {
      const p = await phase(pg);
      if (p === "READY") {
        await decision(pg).getByRole("button", { name: "Next delivery", exact: true }).click();
        await pg.waitForTimeout(120);
        counts.push(await pg.evaluate(() => document.getAnimations().map((a) => a.animationName ?? "transition")));
        await idle(pg);
      } else await play(pg, "Next delivery");
    }
    const scrollBehaviour = await pg.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    await ctx.close();
    const flat = counts.flat();
    return { titleAnimations: titleAnims, deliverySamples: counts.length, animationsSeenDuringDeliveries: [...new Set(flat)], totalAnimationInstances: flat.length, scrollBehaviour };
  };
  result.reducedMotion.noPreference = await sample("no-preference");
  result.reducedMotion.reduce = await sample("reduce");
  metrics.a11y = result;
  await browser.close();
}

async function video() {
  const dir = join(OUT, "video");
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir, size: { width: 1366, height: 768 } } });
  const page = await context.newPage();
  watch(page, "video");
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Keep sound off" }).click().catch(() => undefined);
  await page.getByRole("navigation", { name: "Game modes" }).getByRole("link", { name: /Career/ }).click();
  await page.getByRole("button", { name: /Aster Harbour/i }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
  const club = page.getByRole("navigation", { name: "Career navigation" });
  await club.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  for (const name of ["Squad", "Office", "Season", "Clubhouse"]) { await club.getByRole("button", { name }).click(); await page.waitForTimeout(1500); }
  await page.goto(`${BASE}/#title`);
  await page.getByRole("button", { name: /Quick match/ }).click();
  await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  let deliveries = 0, overs = 0;
  for (let n = 0; n < 60 && (deliveries < 10 || overs < 3); n += 1) {
    await idle(page);
    const p = await phase(page);
    if (p === "COMPLETE") break;
    if (p === "READY") {
      const label = deliveries < 10 ? "Next delivery" : "Finish over";
      await decision(page).getByRole("button", { name: label, exact: true }).click();
      if (label === "Next delivery") deliveries += 1; else overs += 1;
      await idle(page);
      await page.waitForTimeout(label === "Next delivery" ? 900 : 1200);
    } else { await play(page, "Next delivery"); await page.waitForTimeout(700); }
  }
  metrics.video = { deliveries, overs };
  await context.close();
  await browser.close();
}

const parts = { main, onboarding, scale150, perf, a11y, video };
for (const part of PARTS) {
  const t0 = Date.now();
  console.log("part", part);
  try { await parts[part](); } catch (e) { console.log("PART FAIL", part, e.message); metrics.notCaptured.push({ name: `part:${part}`, error: String(e.message).split("\n")[0] }); }
  metrics[`${part}Seconds`] = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
}
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
console.log("done", metrics.shots.length, "shots,", metrics.notCaptured.length, "not captured");
for (const b of browsers) await b.close().catch(() => undefined);
process.exit(0);
