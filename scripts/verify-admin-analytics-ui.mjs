// Synthetic local fixtures only; no server, auth bypass, or Neon connection.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

mkdirSync("developer-docs", { recursive: true });
const fixture = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "src/components/analytics/dashboard.test.tsx",
  ],
  {
    env: { ...process.env, SKG_LOCAL_ANALYTICS_PREVIEW: "1" },
    windowsHide: true,
    stdio: "inherit",
  },
);
assert.equal(fixture.status, 0, "fixture generation must pass");
const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === "win32" ? "msedge" : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(channel ? { channel } : {}),
});
try {
  const page = await browser.newPage();
  await page.route(/^https?:/, (route) => route.abort());
  for (const days of [7, 30, 90]) {
    await page.goto(
      pathToFileURL(
        `${process.cwd()}/developer-docs/analytics-preview-${days}.html`,
      ).href,
    );
    assert.equal(
      await page.locator(".column").count(),
      days === 90 ? 14 : days,
    );
    const summary = page.getByText("How these metrics are calculated", {
      exact: true,
    });
    const definitions = page.locator("details").filter({ has: summary });
    assert.equal(await definitions.getAttribute("open"), null);
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await definitions.getAttribute("open"), "");
    await page.keyboard.press("Enter");
    assert.equal(await definitions.getAttribute("open"), null);
    for (const [width, height] of [
      [360, 800],
      [768, 1024],
      [1440, 1000],
    ]) {
      await page.setViewportSize({ width, height });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${days}/${width}/${theme}: page overflow`,
        );
        const region = page.getByRole("region", {
          name: "Perfect Stack measurements",
        });
        const size = await region.evaluate((el) => ({
          visible: el.clientWidth,
          total: el.scrollWidth,
          nowrap: getComputedStyle(el.querySelector("th")).whiteSpace,
        }));
        assert.equal(size.nowrap, "nowrap");
        if (width === 360) {
          assert(size.total > size.visible);
          await region.focus();
          await page.keyboard.press("ArrowRight");
          await page.waitForFunction(
            () =>
              document.querySelector(
                '[aria-label="Perfect Stack measurements"]',
              ).scrollLeft > 0,
          );
          await region.evaluate((el) => {
            el.scrollLeft = 0;
          });
        }
        await page.screenshot({
          path: `developer-docs/analytics-${days}-${width}-${theme}.png`,
          fullPage: true,
        });
      }
    }
    await page
      .getByText("Daily values and chart alternative", { exact: true })
      .click();
    const daily = page
      .locator("table")
      .filter({
        has: page.getByText("Verified results per New York calendar day", {
          exact: true,
        }),
      });
    assert.equal(await daily.locator("tbody tr").count(), days);
    if (days === 90) {
      const weekly = page.getByRole("region", {
        name: "Weekly activity values",
      });
      assert.equal(await weekly.locator("tbody tr").count(), 14);
      const total = await weekly
        .locator("tbody td")
        .evaluateAll((nodes) =>
          nodes.reduce(
            (sum, node) => sum + Number(node.textContent.replaceAll(",", "")),
            0,
          ),
        );
      assert.equal(total, 180);
    }
    console.log(
      `${days} days: responsive themes, keyboard disclosure/scrolling and original daily values passed`,
    );
  }
} finally {
  await browser.close();
}
