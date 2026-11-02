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
      `${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/games/perfect-stack?mode=practice&difficulty=hard&seed=spacing`,
    );
    await page.locator(".stack-grid").waitFor();
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [899, 700],
    ]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const board = document
          .querySelector(".stack-grid")!
          .getBoundingClientRect();
        const tray = document
          .querySelector(".piece-tray")!
          .getBoundingClientRect();
        const message = document.querySelector(".board-message")!;
        const range = document.createRange();
        range.selectNodeContents(message.lastChild!);
        const text = range.getBoundingClientRect();
        const label = document
          .querySelector(".piece-tray > .eyebrow")!
          .getBoundingClientRect();
        return {
          centerOffset: Math.abs(
            (text.top + text.bottom) / 2 - (board.bottom + tray.top) / 2,
          ),
          inset: label.left - tray.left,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert(
        layout.centerOffset < 2,
        `${width}: message off-center by ${layout.centerOffset}px`,
      );
      assert(layout.inset >= 10, `${width}: pieces label needs inset`);
      assert(!layout.overflow);
    }
    console.log(
      "PASS stacked board/message/tray centering and Pieces left spacing at 320/390/768/899px",
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
