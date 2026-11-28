/* global document, window, requestAnimationFrame */
/**
 * CP12 onboarding and first-session capture (Studio Production Directive 05). Walks the first-launch path from a served
 * build at 1366x768 and 390x844, so the same script records the "before" (a build of `main`) and the "after":
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4221 node scripts/ui-preview-server.mjs &
 *   CP01_BASE=http://127.0.0.1:4221 CP01_OUT=/tmp/cp12-after node scripts/cp12-capture.mjs [first] [returning] [settings]
 *
 * `first` is a new player: the bare address, the title screen with the sound question, the title after answering, the
 * custom match setup copy, the guided first match coach, the first career's club selection and its first Home screen.
 * `returning` keeps that browser profile: the title with a career saved, Continue, then one more ball in the guided
 * match (so the match is the most recent save) and the title again. `settings` opens the Settings route with and
 * without a career. Every part runs with reduced motion requested, records the heading order and the keyboard (Tab)
 * order of the title screen, horizontal overflow, page and console errors, and the running animations on each screen.
 * Steps a build does not have (such as Continue on `main`) are recorded as not captured. It changes nothing outside the browser profiles it creates.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP01_BASE ?? "http://127.0.0.1:4221";
const OUT = process.env.CP01_OUT ?? "cp12-out";
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["first", "returning", "settings"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

const SIZES = [[1366, 768], [390, 844]];
const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, headings: {}, tabOrder: {}, animations: {}, soundQuestion: {}, notCaptured: [], pageErrors: [], consoleErrors: [] };
const browsers = [];
const launch = async () => { const b = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE } : {}) }); browsers.push(b); return b; };
const newPage = async (browser, label) => {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" })).newPage();
  page.on("pageerror", (e) => metrics.pageErrors.push({ label, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
  return page;
};
async function settle(page, ms = 350) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
async function step(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("FAIL", label, e.message.split("\n")[0]); metrics.notCaptured.push({ name: label, error: String(e.message).split("\n")[0].slice(0, 300) }); }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Headings in document order, as "h1 Lord Cricket XXVI". */
const headings = (page) => page.evaluate(() => [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
  .filter((h) => h.getClientRects().length > 0)
  .map((h) => `${h.tagName.toLowerCase()} ${h.textContent.replace(/\s+/g, " ").trim().slice(0, 60)}`));
/** Animations running on the page (reduced motion is requested, so there should be none that move anything). */
const animations = (page) => page.evaluate(() => document.getAnimations().map((a) => `${a.animationName ?? a.constructor.name} on ${a.effect?.target?.className ?? "?"}`.slice(0, 120)));
/** The first `count` stops of the Tab key from the top of the page, as role-ish names. */
async function tabOrder(page, count = 16) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await page.locator("body").focus().catch(() => undefined);
  const stops = [];
  for (let n = 0; n < count; n += 1) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "(body)";
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
      return `${el.tagName.toLowerCase()}${el.getAttribute("href") ? `[${el.getAttribute("href")}]` : ""} ${name}`;
    }));
  }
  return stops;
}

/** Screenshots of the viewport at each size; `before` runs after each resize. */
async function shot(page, name, before = undefined) {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page, 300);
    if (before) await before();
    await settle(page, 400);
    const file = join(SHOTS, `${name}_${w}x${h}.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_${w}x${h}`] = await overflow(page);
  }
  metrics.headings[name] = await headings(page);
  const running = await animations(page);
  if (running.length) metrics.animations[name] = running;
  await page.setViewportSize({ width: 1366, height: 768 });
}
const top = (page) => () => page.evaluate(() => window.scrollTo(0, 0));
const scrollTo = (locator) => () => locator.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
const title = (page) => page.getByTestId("title-screen").waitFor({ timeout: 30_000 });

async function first(browser) {
  const page = await newPage(browser, "first");
  await step("bare-address", async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 });
    await settle(page, 800);
    metrics.bareAddress = { hash: await page.evaluate(() => window.location.hash), h1: await page.getByRole("heading", { level: 1 }).first().innerText() };
    await shot(page, "01-bare-address", top(page));
  });
  await step("title-first-launch", async () => {
    await page.goto(`${BASE}/#title`);
    await title(page);
    await settle(page, 800);
    await shot(page, "02-title-first-launch", top(page));
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await settle(page, 300);
      const box = await page.getByTestId("sound-question").boundingBox();
      metrics.soundQuestion[`${w}x${h}`] = box ? { top: Math.round(box.y), bottom: Math.round(box.y + box.height), viewport: h } : null;
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    metrics.tabOrder["02-title-first-launch"] = await tabOrder(page);
  });
  await step("title-after-sound", async () => {
    // Keyboard only: focus the answer and press Enter.
    const keepOff = page.getByTestId("sound-question").getByRole("button", { name: "Keep sound off" });
    await keepOff.focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("sound-question").waitFor({ state: "detached", timeout: 10_000 });
    metrics.focusAfterSoundAnswer = await page.evaluate(() => `${document.activeElement?.tagName.toLowerCase()} ${(document.activeElement?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}`);
    await shot(page, "03-title-after-sound", top(page));
    metrics.tabOrder["03-title-after-sound"] = await tabOrder(page);
  });
  await step("exhibition-setup", async () => {
    await page.goto(`${BASE}/#exhibition`);
    await page.getByRole("button", { name: "Confirm XIs and start" }).waitFor({ timeout: 30_000 });
    metrics.setupIntro = await page.locator("section.intro").innerText().catch(() => null);
    await shot(page, "04-exhibition-setup", top(page));
  });
  await step("guided-first-match", async () => {
    await page.goto(`${BASE}/#title`);
    await title(page);
    await page.getByRole("button", { name: /Guided first match/ }).focus();
    await page.keyboard.press("Enter");
    const coach = page.getByTestId("guided-coach");
    await coach.filter({ hasText: "The toss" }).waitFor({ timeout: 60_000 });
    await shot(page, "05-guided-toss", top(page));
    await page.getByRole("button", { name: "Call heads" }).click();
    const decision = page.locator("#decision");
    for (let n = 0; n < 30; n += 1) {
      await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout: 60_000 });
      const phase = await decision.getAttribute("data-phase");
      if (phase === "READY") break;
      if (phase === "AWAITING_INNINGS") { const bat = decision.getByRole("button", { name: "Bat first" }); if (await bat.isVisible().catch(() => false)) await bat.click(); else await page.waitForTimeout(300); }
      else if (phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") { const pick = decision.locator("button[data-candidate]:enabled").first(); if (await pick.count()) await pick.click(); else await page.waitForTimeout(300); }
      else await page.waitForTimeout(300);
    }
    await shot(page, "06-guided-first-ball", top(page));
    metrics.guidedTarget = await page.evaluate(() => [...document.querySelectorAll("[data-coach-target]")].map((el) => (el.textContent ?? "").trim().slice(0, 40)));
  });
  await step("career-first", async () => {
    await page.goto(`${BASE}/#career`);
    await page.getByRole("button", { name: /Aster Harbour/i }).first().waitFor({ timeout: 30_000 });
    await shot(page, "07-career-club-selection", top(page));
    await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
    await page.getByRole("navigation", { name: "Career navigation" }).waitFor({ timeout: 60_000 });
    await settle(page, 800);
    await shot(page, "08-career-home", top(page));
  });
  return page;
}

async function returning(page) {
  await step("title-returning-career", async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 });
    await settle(page, 1200);
    await shot(page, "09-title-returning-career", top(page));
    metrics.tabOrder["09-title-returning-career"] = await tabOrder(page);
    const resume = page.getByTestId("title-continue");
    await resume.waitFor({ timeout: 10_000 });
    metrics.continueCareer = await resume.innerText();
    await resume.click();
    await page.getByRole("navigation", { name: "Career navigation" }).waitFor({ timeout: 60_000 });
    await settle(page, 800);
    metrics.continueCareerLanded = await page.evaluate(() => window.location.hash);
    await shot(page, "10-continue-career", top(page));
  });
  await step("title-returning-match", async () => {
    // The guided match from the first part is still the active match. Play one ball in it, so it is saved after the
    // career and is now the most recent thing to continue.
    await page.goto(`${BASE}/#exhibition`);
    const decision = page.locator("#decision");
    await decision.waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout: 60_000 });
    const revision = await decision.getAttribute("data-revision");
    await decision.getByRole("button", { name: "Next delivery", exact: true }).click();
    await page.waitForFunction((r) => document.querySelector("#decision")?.getAttribute("data-revision") !== r && document.querySelector("#decision")?.getAttribute("aria-busy") === "false", revision, { timeout: 60_000 });
    await settle(page, 800);
    await page.goto(`${BASE}/#title`);
    await title(page);
    await page.getByTestId("title-continue").waitFor({ timeout: 10_000 });
    await settle(page, 600);
    metrics.continueMatch = await page.getByTestId("title-continue").innerText();
    await shot(page, "11-title-returning-match", top(page));
    await page.getByTestId("title-continue").click();
    await page.locator("#decision").waitFor({ timeout: 60_000 });
    await settle(page, 800);
    metrics.continueMatchLanded = { hash: await page.evaluate(() => window.location.hash), phase: await page.locator("#decision").getAttribute("data-phase") };
    await shot(page, "12-continue-match", top(page));
  });
  await step("settings-with-career", async () => {
    await page.goto(`${BASE}/#title`);
    await title(page);
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("heading", { name: "Settings" }).first().waitFor({ timeout: 60_000 });
    await settle(page, 600);
    await shot(page, "13-settings-with-career", scrollTo(page.getByRole("heading", { name: "Settings" })));
  });
}

async function settings(browser) {
  const page = await newPage(browser, "settings");
  await step("settings-no-career", async () => {
    await page.goto(`${BASE}/#title`);
    await title(page);
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("heading", { name: "Settings" }).first().waitFor({ timeout: 30_000 });
    await settle(page, 600);
    await shot(page, "14-settings-no-career", top(page));
  });
}

const browser = await launch();
try {
  let page = null;
  if (PARTS.includes("first") || PARTS.includes("returning")) page = await first(browser);
  if (PARTS.includes("returning") && page) await returning(page);
  if (PARTS.includes("settings")) await settings(browser);
} finally {
  for (const b of browsers) await b.close().catch(() => undefined);
  metrics.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
}
