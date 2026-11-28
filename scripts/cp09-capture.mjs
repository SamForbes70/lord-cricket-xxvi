/* global document, window */
/**
 * CP09 audio capture (Studio Production Directive 05). Sound cannot be heard in a headless browser, so this records
 * what can be seen and measured: the title screen on first launch (the sound question, CD-028) at 1366x768 and
 * 390x844 with the question's position, and an exhibition T20 with sound on, played over by over until the audio
 * caption reports a boundary, with the moment on screen and the audio panel's record of the moment's sting.
 * It changes nothing outside the browser profile it creates and needs a served build:
 *
 *   npm run build
 *   LCXXVI_PREVIEW_PORT=4201 node scripts/ui-preview-server.mjs &
 *   CP09_BASE=http://127.0.0.1:4201 CP09_OUT=/tmp/cp09 node scripts/cp09-capture.mjs
 *
 * Set LCXXVI_CHROMIUM_EXECUTABLE to use a particular Chromium.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.CP09_BASE ?? "http://127.0.0.1:4201";
const OUT = process.env.CP09_OUT ?? "cp09-out";
const SHOTS = join(OUT, "png");
mkdirSync(SHOTS, { recursive: true });
const metrics = { base: BASE, startedAt: new Date().toISOString(), title: {}, match: {}, pageErrors: [], consoleErrors: [] };

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  ...(process.env.LCXXVI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.LCXXVI_CHROMIUM_EXECUTABLE } : {}),
});

function watch(page) {
  page.on("pageerror", (e) => metrics.pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") metrics.consoleErrors.push(m.text().slice(0, 300)); });
}

try {
  for (const [w, h] of [[1366, 768], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    watch(page);
    await page.goto(`${BASE}/#title`);
    const question = page.getByTestId("sound-question");
    await question.waitFor();
    const box = await question.boundingBox();
    metrics.title[`${w}x${h}`] = {
      questionTop: box ? Math.round(box.y) : null,
      questionBottom: box ? Math.round(box.y + box.height) : null,
      viewportHeight: h,
      fullyInView: box ? box.y >= 0 && box.y + box.height <= h : false,
      overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
    await page.screenshot({ path: join(SHOTS, `01-title-first-launch_${w}x${h}.png`) });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  watch(page);
  const decision = page.locator("#decision");
  const idle = () => page.waitForFunction(() => document.querySelector("#decision")?.getAttribute("aria-busy") === "false", null, { timeout: 60_000 });
  await page.goto(`${BASE}/#exhibition`);
  await page.getByRole("button", { name: "Confirm XIs and start" }).waitFor();
  await page.getByRole("button", { name: "Sound: Muted" }).click();
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await page.getByRole("button", { name: "Call heads" }).click();
  await page.getByRole("button", { name: "Bat first" }).click();
  const caption = page.getByTestId("audio-caption-banner");
  let overs = 0;
  for (let guard = 0; guard < 60; guard++) {
    await idle();
    const phase = await decision.getAttribute("data-phase");
    if (phase === "COMPLETE") break;
    if (overs > 0 && /FOUR!|SIX!/.test((await caption.textContent()) ?? "")) break;
    if (phase === "AWAITING_BATTER" || phase === "AWAITING_BOWLER") {
      await page.locator("#decision button[data-candidate]:not([disabled])").first().click();
    } else if (phase === "READY") {
      await page.getByRole("button", { name: "Finish over", exact: true }).click();
      overs += 1;
    }
  }
  const moment = page.getByTestId("match-moment");
  if (await moment.isVisible().catch(() => false)) await moment.hover();
  metrics.match = {
    oversFinished: overs,
    caption: ((await caption.textContent()) ?? "").trim(),
    momentKind: await moment.getAttribute("data-kind").catch(() => null),
    momentSting: await page.getByTestId("match-audio-panel").getAttribute("data-moment-sting"),
    statusPill: ((await page.getByTestId("audio-status-pill").textContent()) ?? "").trim(),
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SHOTS, "10-boundary-moment-sound-on_1366x768.png") });
  await page.getByTestId("match-audio-panel").screenshot({ path: join(SHOTS, "11-crop-audio-panel_1366x768.png") });
  await context.close();
} finally {
  await browser.close();
  writeFileSync(join(OUT, "cp09-metrics.json"), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
}
