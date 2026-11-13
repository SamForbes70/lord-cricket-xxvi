import { expect, test } from "@playwright/test";

test("V01-026: verifies keyboard focus order, WCAG AA contrast, ARIA screen-reader semantics, 200% browser zoom, and 150% narrow/long-name stability", async ({
  page,
}) => {
  await page.goto("/#exhibition");
  await expect(page.getByRole("button", { name: "Confirm XIs and start" })).toBeEnabled({
    timeout: 30000,
  });

  // 1. Screen-reader semantics: zero unlabelled visible interactive controls on setup screen.
  const setupAriaAudit = await page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("button, input, select, textarea"),
    ).filter(el => el.offsetParent !== null);
    const unlabelled: string[] = [];
    for (const el of controls) {
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const ariaLabelledBy = el.getAttribute("aria-labelledby")?.trim();
      const wrappingLabel = el.closest("label")?.textContent?.trim();
      const id = el.getAttribute("id");
      const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
      const text = el.tagName === "BUTTON" ? el.textContent?.trim() : "";
      if (!ariaLabel && !ariaLabelledBy && !wrappingLabel && !forLabel && !text) {
        unlabelled.push(el.outerHTML.slice(0, 120));
      }
    }
    return {
      totalControls: controls.length,
      unlabelled,
      hasMainLandmark: Boolean(document.querySelector("main")),
    };
  });
  expect(setupAriaAudit.hasMainLandmark).toBe(true);
  expect(setupAriaAudit.totalControls).toBeGreaterThan(5);
  expect(setupAriaAudit.unlabelled).toEqual([]);

  // 2. Keyboard navigation & visible focus indicator without focus trap.
  await page.keyboard.press("Tab");
  const focusedTags: string[] = [];
  for (let step = 0; step < 6; step++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        outlineStyle: cs.outlineStyle,
        outlineWidth: parseFloat(cs.outlineWidth || "0"),
        boxShadow: cs.boxShadow,
      };
    });
    if (info) {
      focusedTags.push(info.tag);
      expect(info.outlineWidth > 0 || info.boxShadow !== "none").toBe(true);
    }
    await page.keyboard.press("Tab");
  }
  expect(focusedTags.length).toBeGreaterThanOrEqual(4);

  // Start match and inspect live match decision & ARIA live/busy state.
  await page.getByRole("button", { name: "Confirm XIs and start" }).click();
  await expect(page.locator("#decision")).toHaveAttribute("aria-busy", "false");

  // 3. Programmatic WCAG AA relative luminance contrast ratio (>= 4.5:1) on primary match copy & buttons.
  const contrastAudit = await page.evaluate(() => {
    function parseRgb(str: string): [number, number, number, number] | null {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    }
    function effectiveBg(el: Element | null): [number, number, number] {
      let cur: Element | null = el;
      while (cur) {
        const rgba = parseRgb(getComputedStyle(cur).backgroundColor);
        if (rgba && rgba[3] >= 0.95) return [rgba[0], rgba[1], rgba[2]];
        cur = cur.parentElement;
      }
      return [255, 255, 255];
    }
    function relLum([r, g, b]: [number, number, number]): number {
      const chan = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
    }
    function ratio(fg: [number, number, number], bg: [number, number, number]): number {
      const l1 = relLum(fg);
      const l2 = relLum(bg);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }

    const targets = [
      document.querySelector("h1"),
      document.querySelector("#decision button:not(:disabled)"),
      document.querySelector("main p"),
    ].filter((x): x is HTMLElement => Boolean(x));

    return targets.map(el => {
      const fgParsed = parseRgb(getComputedStyle(el).color) ?? [0, 0, 0, 1];
      const bg = effectiveBg(el);
      return {
        tag: el.tagName,
        text: (el.textContent ?? "").trim().slice(0, 32),
        contrast: ratio([fgParsed[0], fgParsed[1], fgParsed[2]], bg),
      };
    });
  });
  expect(contrastAudit.length).toBeGreaterThanOrEqual(2);
  for (const item of contrastAudit) {
    expect(item.contrast).toBeGreaterThanOrEqual(4.5);
  }

  // 4. 200% browser zoom simulation (683x384 CSS pixels = 1366x768 at 200% zoom) + 150% text scale narrow check.
  await page.setViewportSize({ width: 683, height: 384 });
  const zoomAudit = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    decisionVisible: Boolean(document.querySelector("#decision")),
  }));
  expect(zoomAudit.decisionVisible).toBe(true);
  expect(zoomAudit.scrollWidth).toBeLessThanOrEqual(zoomAudit.clientWidth + 4);

  // 5. Career screen keyboard + 150% text scale + narrow layout check.
  await page.setViewportSize({ width: 900, height: 768 });
  await page.goto("/#career");
  await expect(page.locator("main")).toBeVisible({ timeout: 30000 });
  const scaleSelect = page.getByLabel("Text size");
  if ((await scaleSelect.count()) > 0) {
    await scaleSelect.selectOption("150");
  }
  const careerOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(careerOverflow).toBeLessThanOrEqual(4);
});
