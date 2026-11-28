/* global document, window, requestAnimationFrame, getComputedStyle */
/**
 * CP02B consistency pass capture (Studio Production Directive 05). Captures each screen the pass touches at 1366x768
 * and 390x844 from a served build, so the same script records the "before" (a build of `main`) and the "after":
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4212 node scripts/ui-preview-server.mjs &
 *   CP01_BASE=http://127.0.0.1:4212 CP01_OUT=/tmp/cp02b-after node scripts/cp02b-capture.mjs [modes] [career] [match] [season]
 *
 * `modes` covers the four mode mastheads (match setup, tournaments, scenarios, rain list and rain match); `career`
 * covers squad, academy, player page, settings, stories, office, statistics, the foot of the Clubhouse and the saved
 * career list; `match` plays a quick match against the computer for the tactics panel, the Text scale 150% match screen
 * and the completed scorecard; `season` simulates a season to the season review squad table. It also records
 * horizontal overflow, page errors and the computed size of tokenised text at Text scale 100% and 150%. It changes
 * nothing outside the browser profiles it creates.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP01_BASE ?? "http://127.0.0.1:4212";
const OUT = process.env.CP01_OUT ?? "cp02b-out";
const PARTS = process.argv.slice(2).length ? process.argv.slice(2) : ["modes", "career", "match"];
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });

const SIZES = [[1366, 768], [390, 844]];
const metrics = { base: BASE, startedAt: new Date().toISOString(), shots: [], overflow: {}, notCaptured: [], pageErrors: [], consoleErrors: [], textScale: {}, dashes: {}, ids: {} };
const browsers = [];
const launch = async () => { const b = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE } : {}) }); browsers.push(b); return b; };

function watch(page, label) {
  page.on("pageerror", (e) => metrics.pageErrors.push({ label, message: e.message }));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push({ label, text: m.text().slice(0, 300) }); });
}
async function settle(page, ms = 350) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
async function step(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("FAIL", label, e.message.split("\n")[0]); metrics.notCaptured.push({ name: label, error: String(e.message).split("\n")[0].slice(0, 300) }); }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Visible text on the page that contains an en or em dash, or an internal id pattern. */
const audit = (page) => page.evaluate(() => {
  const text = document.body.innerText;
  return {
    dashes: (text.match(/.{0,30}[–—].{0,30}/g) ?? []).slice(0, 12),
    ids: (text.match(/\b(p\d{3}|acad-[\w-]+|rev \d+|revision \d+)\b/g) ?? []).slice(0, 12),
  };
});

/** Screenshots of the viewport at each size; `before` runs after each resize (to scroll the subject into view). */
async function shot(page, name, before = undefined, sizes = SIZES) {
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page, 300);
    if (before) await before();
    await settle(page, 400);
    const file = join(SHOTS, `${name}_${w}x${h}.png`);
    await page.screenshot({ path: file });
    metrics.shots.push(file);
    metrics.overflow[`${name}_${w}x${h}`] = await overflow(page);
  }
  const found = await audit(page);
  if (found.dashes.length) metrics.dashes[name] = found.dashes;
  if (found.ids.length) metrics.ids[name] = found.ids;
  await page.setViewportSize({ width: 1366, height: 768 });
}
const top = (page) => () => page.evaluate(() => window.scrollTo(0, 0));
const scrollTo = (locator) => () => locator.first().evaluate((el) => el.scrollIntoView({ block: "start" }));

const decision = (page) => page.locator("#decision");
async function idle(page, timeout = 120_000) {
  await page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout });
}
async function phase(page) { return decision(page).getAttribute("data-phase"); }
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

/** Computed font size of a probe that asks for each type token, placed inside the match screen. */
const tokenSizes = (page) => page.evaluate(() => {
  const shell = document.querySelector(".match-shell");
  if (!shell) return null;
  const out = {};
  for (const token of ["--type-sm", "--type-md", "--type-xl"]) {
    const probe = document.createElement("span");
    probe.style.fontSize = `var(${token})`;
    shell.appendChild(probe);
    out[token] = getComputedStyle(probe).fontSize;
    probe.remove();
  }
  const score = document.querySelector("[data-testid='broadcast-stage'] .stage-score, .stage-score, .scoreboard strong");
  if (score) out.score = getComputedStyle(score).fontSize;
  return out;
});

async function modes() {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  watch(page, "modes");
  await step("match-setup", async () => {
    await page.goto(`${BASE}/#exhibition`);
    await page.getByLabel("Text scale").waitFor({ timeout: 30_000 });
    await shot(page, "01-match-setup", top(page));
  });
  await step("tournaments", async () => {
    await page.goto(`${BASE}/#tournaments`);
    await page.getByTestId("tournaments-screen").waitFor({ timeout: 30_000 });
    await shot(page, "02-tournaments", top(page));
  });
  await step("scenarios", async () => {
    await page.goto(`${BASE}/#scenarios`);
    await page.getByTestId("scenarios-screen").waitFor({ timeout: 30_000 });
    await shot(page, "03-scenarios", top(page));
  });
  await step("rain", async () => {
    await page.goto(`${BASE}/#rain`);
    await page.getByRole("button", { name: "Start match" }).waitFor({ timeout: 30_000 });
    await shot(page, "04-rain", top(page));
    await page.getByRole("button", { name: "Start match" }).click();
    await page.getByTestId("rain-scoreboard").waitFor({ timeout: 60_000 });
    await shot(page, "05-rain-match", top(page));
  });
  await browser.close();
}

async function career() {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  watch(page, "career");
  const nav = (name) => page.getByRole("navigation", { name: "Career navigation" }).getByRole("button", { name, exact: true }).click();
  await step("career-start", async () => {
    await page.goto(`${BASE}/#career`);
    await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
    await page.getByRole("navigation", { name: "Career navigation" }).waitFor({ timeout: 30_000 });
    await settle(page, 600);
    await shot(page, "10-clubhouse-top", top(page));
    await shot(page, "11-clubhouse-foot", () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)));
  });
  await step("squad", async () => {
    await nav("Squad");
    await page.locator("select[id^='training-']").first().waitFor({ timeout: 30_000 });
    await shot(page, "12-squad", scrollTo(page.locator("select[id^='training-']")));
    await shot(page, "13-academy", scrollTo(page.getByTestId("youth-academy-panel")));
  });
  await step("player", async () => {
    await page.locator("button[id^='player-link-SQUAD-']").first().click();
    await page.locator("#player-heading").waitFor({ timeout: 30_000 });
    await shot(page, "14-player-page", top(page));
    await shot(page, "15-player-awards", () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)));
  });
  await step("office", async () => {
    await nav("Office");
    await page.locator("table").first().waitFor({ timeout: 30_000 });
    await shot(page, "16-office", scrollTo(page.locator("table.contracts-table, table").first()));
  });
  await step("statistics", async () => {
    await nav("Season");
    await page.getByRole("navigation", { name: "Season sections" }).getByRole("button", { name: "Statistics", exact: true }).click();
    await page.locator("table").first().waitFor({ timeout: 30_000 });
    await shot(page, "17-statistics", scrollTo(page.locator("table").first()));
  });
  await step("stories", async () => {
    await page.getByRole("navigation", { name: "Season sections" }).getByRole("button", { name: "Stories", exact: true }).click();
    await settle(page, 400);
    await shot(page, "18-stories", top(page));
  });
  await step("settings", async () => {
    await nav("Settings");
    await settle(page, 400);
    await shot(page, "19-settings", top(page));
    await shot(page, "20-settings-file", () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)));
  });
  await step("load-list", async () => {
    await page.getByRole("button", { name: "Choose career" }).click();
    await page.getByRole("heading", { name: /Continue career/i }).waitFor({ timeout: 30_000 });
    await shot(page, "21-load-career", top(page));
  });
  await browser.close();
}

async function match() {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  watch(page, "match");
  await step("quick-match", async () => {
    await page.goto(`${BASE}/#title`);
    await page.getByRole("button", { name: /Quick match/ }).click();
    await page.locator("#decision[data-phase='TOSS']").waitFor({ timeout: 30_000 });
    for (let n = 0; n < 12; n += 1) { const p = await phase(page); if (p === "READY") break; await play(page, "Next delivery"); }
    await play(page, "Finish over");
  });
  await step("tactics", async () => {
    const tactics = page.getByRole("heading", { name: /^Tactics$/i });
    await shot(page, "30-tactics", scrollTo(tactics));
  });
  await step("text-scale", async () => {
    metrics.textScale["100"] = await tokenSizes(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByLabel("Text scale", { exact: true }).selectOption("150");
    await settle(page, 500);
    metrics.textScale["150"] = await tokenSizes(page);
    await shot(page, "31-match-text-150", top(page));
    await page.getByLabel("Text scale", { exact: true }).selectOption("100");
  });
  await step("scorecard", async () => {
    for (let n = 0; n < 400; n += 1) { if ((await play(page, "Finish innings")) === "COMPLETE") break; }
    if ((await phase(page)) !== "COMPLETE") throw new Error("match did not finish");
    const card = page.locator("caption", { hasText: "Innings 1 batting" });
    await card.waitFor({ timeout: 30_000 });
    await shot(page, "32-scorecard", () => card.evaluate((c) => c.closest("article")?.scrollIntoView({ block: "start" })));
  });
  await browser.close();
}

async function season() {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  watch(page, "season");
  await page.goto(`${BASE}/#career`);
  await step("season-review", async () => {
    await page.getByRole("button", { name: /Aster Harbour/i }).first().click();
    for (let round = 1; round <= 14; round += 1) {
      const advance = page.getByRole("button", { name: "Advance to match day" });
      if (await advance.isVisible().catch(() => false)) {
        await advance.click();
        await page.locator(".save-badge strong", { hasText: "Saved" }).waitFor({ timeout: 60_000 });
      }
      await page.getByRole("button", { name: "Simulate match" }).click();
      await page.getByText(`${round}/14 managed-team fixtures complete.`, { exact: true }).waitFor({ timeout: 120_000 });
      await page.locator(".save-badge strong", { hasText: "Saved" }).waitFor({ timeout: 60_000 });
    }
    await page.getByTestId("season-finale").waitFor({ timeout: 60_000 });
    for (let s = 2; s <= 6; s += 1) {
      const next = page.getByTestId("season-finale-continue");
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await settle(page, 600);
      const squad = page.getByTestId("season-review-squad");
      if (await squad.isVisible().catch(() => false)) {
        await shot(page, "40-season-review-squad", scrollTo(squad));
        break;
      }
    }
  });
  await browser.close();
}

const parts = { modes, career, match, season };
for (const part of PARTS) {
  if (!parts[part]) { console.log("unknown part", part); continue; }
  try { await parts[part](); } catch (e) { console.log("PART FAIL", part, e.message); metrics.notCaptured.push({ name: `part:${part}`, error: String(e.message).split("\n")[0] }); }
}
metrics.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, `metrics-${PARTS.join("-")}.json`), JSON.stringify(metrics, null, 2));
console.log("done", metrics.shots.length, "shots;", metrics.notCaptured.length, "not captured");
for (const b of browsers) await b.close().catch(() => undefined);
process.exit(0);
