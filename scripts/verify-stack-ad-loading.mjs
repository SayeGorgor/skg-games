import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1366, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(
      `${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/games/perfect-stack?mode=practice&difficulty=hard&seed=ad-loading`,
      { waitUntil: "networkidle" },
    );
    await page.locator(".stack-ad-slot").waitFor();
    const measure = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [
            ".stack-grid",
            ".piece-tray",
            ".stat-row",
            ".stack-controls",
            ".stack-ad-slot",
          ].map((selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return [
              selector,
              [r.x + scrollX, r.y + scrollY, r.width, r.height],
            ];
          }),
        ),
      );
    const before = await measure();
    // Test-only oversized late content: no commercial creative or provider markup.
    await page.locator(".stack-ad-slot").evaluate((el) => {
      const link = document.createElement("a");
      link.href = "#test-ad";
      link.textContent = "Test ad link";
      link.id = "test-ad-link";
      link.style.cssText = "display:block;width:2000px;height:1000px";
      el.append(link);
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.deepEqual(
      await measure(),
      before,
      "Late content leaves gameplay and reserved slot unchanged",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Reset", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "test-ad-link",
      "Controls precede ad links in keyboard order",
    );
    if (viewport.width < 900) {
      await page.addStyleTag({
        content:
          ":root { --mobile-tab-bar-height: 50px; } .stack-ad-region { margin-bottom: 34px; }",
      });
      await page.evaluate(() =>
        scrollTo(0, document.documentElement.scrollHeight),
      );
      assert(
        await page
          .locator(".stack-ad-slot")
          .evaluate(
            (el) => el.getBoundingClientRect().bottom <= innerHeight - 50,
          ),
        "Ad clears optional bottom navigation",
      );
    }
    console.log(
      `PASS ${viewport.width}x${viewport.height}: late content geometry, keyboard order, overflow and bottom clearance`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
