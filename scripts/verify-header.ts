import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.TEST_BASE_URL ?? "http://localhost:3000", {
      waitUntil: "networkidle",
    });
    for (const theme of ["light", "dark"]) {
      await page
        .locator(".theme-switch")
        .getByRole("button", { name: theme.toUpperCase(), exact: true })
        .click();
      for (const width of [320, 390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const toggle = page.getByRole("button", {
            name: "Navigation menu",
            exact: true,
          }),
          nav = page.getByRole("navigation", { name: "Main navigation" });
        assert(!(await nav.isVisible()));
        const positions = await page.evaluate(() => {
          const [menu, logo, streak, inner, actions] = [
            ".header-menu-toggle",
            ".brand",
            ".header-streak",
            ".header-inner",
            ".header-actions",
          ].map((selector) => {
            const r = document.querySelector(selector)!.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              center: r.left + r.width / 2,
              centerY: r.top + r.height / 2,
            };
          });
          return {
            menu,
            logo,
            streak,
            inner,
            actions,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert(!positions.overflow);
        assert(positions.menu.right <= positions.logo.left);
        assert(
          Math.abs(positions.menu.centerY - positions.logo.centerY) < 1,
          "Menu and logo must share a vertical center",
        );
        if (width >= 1024)
          for (const item of [positions.menu, positions.logo, positions.actions])
            assert(
              Math.abs(item.centerY - positions.streak.centerY) < 1,
              "All header controls must share a vertical center",
            );
        assert(
          Math.abs(positions.streak.center - width / 2) < 1,
          "Streak must be centered on the page",
        );
        assert(
          Math.abs(positions.actions.right - positions.inner.right) < 1,
          "Actions must align to the right",
        );
        await toggle.click();
        assert.equal(await toggle.getAttribute("aria-expanded"), "true");
        for (const label of ["Games", "Archive", "Stats"])
          assert(
            await nav
              .getByRole("link", { name: label, exact: true })
              .isVisible(),
          );
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() => document.activeElement?.textContent),
          "Games",
        );
        await page.keyboard.press("Escape");
        assert(!(await nav.isVisible()));
        assert(await toggle.evaluate((el) => el === document.activeElement));
        await toggle.click();
        await page.locator(".brand").click();
        assert(!(await nav.isVisible()));
        await toggle.click();
        await nav.getByRole("link", { name: "Games", exact: true }).click();
        assert(!(await nav.isVisible()));
        if ([320, 1440].includes(width))
          await page.screenshot({
            path: `artifacts/header-${theme}-${width}.png`,
          });
      }
    }
    console.log(
      "PASS header left/center/right alignment, responsive overflow, menu links, keyboard navigation, Escape focus return, outside click and link dismissal in both themes at 320/390/768/1024/1440/1920",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
