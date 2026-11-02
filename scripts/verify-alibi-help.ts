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
    await page.goto(
      `${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/games/alibi`,
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .getByRole("heading", { name: "Daily Alibi", exact: true })
        .waitFor();
      await page.locator(".alibi-scenario h2").waitFor();
      const headingLayout = await page.evaluate(() => {
        const title = document
          .querySelector(".alibi-title-row h1")!
          .getBoundingClientRect();
        const scenario = document
          .querySelector(".alibi-scenario h2")!
          .getBoundingClientRect();
        const description = document
          .querySelector(".alibi-scenario p")!
          .getBoundingClientRect();
        return {
          aligned:
            Math.abs(title.left - scenario.left) < 1 &&
            Math.abs(scenario.left - description.left) < 1,
          grouped:
            scenario.top - title.bottom > description.top - scenario.bottom,
        };
      });
      assert(headingLayout.aligned, "Game and scenario text must align left");
      assert(
        headingLayout.grouped,
        "Scenario title and description must be grouped together",
      );
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        const runButton = page.getByRole("button", {
          name: "Your run",
          exact: true,
        });
        assert.equal(await runButton.isVisible(), width < 1024);
        assert.equal(
          await page.locator(".alibi-hero-layout > .alibi-stat").isVisible(),
          width >= 1024,
        );
        if (width < 1024) {
          await runButton.click();
          const runDialog = page.getByRole("dialog", {
            name: "Your run",
            exact: true,
          });
          await runDialog.waitFor({ state: "visible" });
          assert(
            await runDialog.getByText("14 days", { exact: true }).isVisible(),
          );
          assert(
            !(await runDialog.evaluate(
              (el) => el.scrollWidth > el.clientWidth,
            )),
          );
          await page.keyboard.press("Escape");
          await runDialog.waitFor({ state: "hidden" });
          assert(
            await runButton.evaluate((el) => el === document.activeElement),
          );
          await runButton.click();
          await runDialog
            .getByRole("button", { name: "Close your run" })
            .click();
          await runDialog.waitFor({ state: "hidden" });
        }
        const trigger = page.getByRole("button", {
          name: "How to play Daily Alibi",
        });
        await trigger.click();
        const dialog = page.getByRole("dialog", {
          name: "How to play",
          exact: true,
        });
        await dialog.waitFor({ state: "visible" });
        assert.equal(await dialog.locator("li").count(), 4);
        assert(
          !(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)),
          "Dialog must fit horizontally",
        );
        assert(
          !(await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )),
          "Page must fit horizontally",
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert(await trigger.evaluate((el) => el === document.activeElement));
        await trigger.click();
        await dialog
          .getByRole("button", { name: "Close instructions" })
          .click();
        await dialog.waitFor({ state: "hidden" });
        await trigger.click();
        await dialog.getByRole("button", { name: /investigate/ }).click();
        await dialog.waitFor({ state: "hidden" });
      }
    }
    console.log(
      "PASS Alibi help: both themes at 320/390/768/1440, four steps, no overflow, Escape, focus restoration, close and play buttons",
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
