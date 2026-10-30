import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const sizes = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [393, 852],
  [412, 915],
  [430, 932],
  [440, 956],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [844, 390],
  [720, 450],
  [568, 320],
];
const results = [];
await mkdir("artifacts/stack-viewport", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ hasTouch: theme === "light" });
    await context.addInitScript(
      (theme) => localStorage.setItem("skg-theme", theme),
      theme,
    );
    const page = await context.newPage();
    for (const difficulty of ["small", "medium", "hard"]) {
      await page.goto(
        `${base}/games/perfect-stack?mode=practice&difficulty=${difficulty}&seed=viewport-budget`,
        { waitUntil: "networkidle" },
      );
      await page.locator(".stack-grid").waitFor();
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        if (width < 900)
          await page
            .locator("#perfect-stack-play")
            .evaluate((el) =>
              el.scrollIntoView({ block: "start", behavior: "instant" }),
            );
        else
          await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        const metrics = await page.evaluate(() => {
          const rect = (selector) => {
            const el = document.querySelector(selector),
              r = el.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              bottom: r.bottom,
              right: r.right,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
            };
          };
          return {
            viewport: [innerWidth, innerHeight],
            page: [
              document.documentElement.scrollWidth,
              document.documentElement.scrollHeight,
            ],
            scrollY,
            header: rect(".site-header"),
            primary: rect(".stack-primary"),
            gameplay: rect("#perfect-stack-play"),
            board: rect(".stack-grid"),
            stats: rect(".stat-row"),
            message: rect(".board-message"),
            tray: rect(".piece-tray"),
            pieces: rect(".piece-grid"),
            controls: rect(".stack-controls"),
            cells: [...document.querySelectorAll(".stack-cell")].map((el) => {
              const r = el.getBoundingClientRect();
              return [r.width, r.height, r.left, r.top, r.right, r.bottom];
            }),
            buttonHeights: [
              ...document.querySelectorAll(".stack-controls button"),
            ].map((el) => el.getBoundingClientRect().height),
            statLabelSize: getComputedStyle(
              document.querySelector(".stat-row small"),
            ).fontSize,
            pieceCellSize: parseFloat(
              getComputedStyle(
                document.querySelector(".piece-shape i:not(.empty)"),
              ).width,
            ),
            mode: getComputedStyle(document.querySelector(".stack-layout"))
              .gridTemplateColumns,
          };
        });
        results.push({ theme, difficulty, width, height, ...metrics });
        const label = `${theme} ${difficulty} ${width}x${height}`;
        assert(
          metrics.page[0] <= width + 1,
          `${label} page overflow ${JSON.stringify(metrics)}`,
        );
        if (width >= 900) {
          assert.equal(metrics.scrollY, 0, label + " page scroll");
          assert(
            Math.abs(metrics.primary.height - height) < 1,
            label + " primary viewport",
          );
        } else
          assert(
            metrics.scrollY > 0 &&
              Math.abs(metrics.gameplay.y) < 1 &&
              Math.abs(metrics.gameplay.height - height) < 1,
            label + " dedicated gameplay viewport",
          );
        for (const name of [
          "board",
          "stats",
          "message",
          "tray",
          "pieces",
          "controls",
        ]) {
          const r = metrics[name];
          assert(
            r.width > 0 &&
              r.height > 0 &&
              r.x >= -1 &&
              r.y >= -1 &&
              r.right <= width + 1 &&
              r.bottom <= height + 1,
            `${label} ${name} outside viewport ${JSON.stringify(r)}`,
          );
        }
        assert(
          Math.abs(metrics.board.width - metrics.board.height) < 1,
          label + " board square",
        );
        assert(
          metrics.board.width >= (height < 390 ? 140 : 180),
          label + " usable board size",
        );
        assert(
          metrics.cells.every(([w, h]) => Math.abs(w - h) < 1),
          label + " cells square",
        );
        assert(
          metrics.cells.every(
            ([, , left, top, right, bottom]) =>
              left >= metrics.board.x - 1 &&
              top >= metrics.board.y - 1 &&
              right <= metrics.board.right + 1 &&
              bottom <= metrics.board.bottom + 1,
          ),
          label + " all rows/columns inside board",
        );
        assert(
          metrics.buttonHeights.every((h) => h >= 44),
          label + " controls >=44px",
        );
        assert(
          parseFloat(metrics.statLabelSize) >= 12,
          label + " stat labels >=12px",
        );
        assert(metrics.pieceCellSize >= 14, label + " piece cells >=14px");
        assert(
          metrics.pieces.scrollWidth <= metrics.pieces.clientWidth + 1,
          label + " horizontal tray clipping",
        );
        if (
          ["small", "hard"].includes(difficulty) &&
          [320, 390, 768, 1366, 1920, 844].includes(width)
        )
          await page.screenshot({
            path: `artifacts/stack-viewport/${theme}-${difficulty}-${width}x${height}.png`,
          });
      }
      console.log(
        `PASS ${theme} ${difficulty}: ${sizes.length} viewport budgets`,
      );
      if (page.viewportSize().width < 900)
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.locator(".stack-options > summary").click();
      assert(
        await page
          .getByRole("navigation", { name: "Game mode", exact: true })
          .isVisible(),
      );
      assert(
        await page
          .getByRole("navigation", { name: "Difficulty", exact: true })
          .isVisible(),
      );
      const panel = await page.locator(".stack-options-panel").boundingBox();
      const viewport = page.viewportSize();
      assert(
        panel &&
          panel.x >= 0 &&
          panel.y >= 0 &&
          panel.x + panel.width <= viewport.width + 1 &&
          panel.y + panel.height <= viewport.height + 1,
        "Options fit the short viewport",
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".stack-options").getAttribute("open"),
        null,
      );
      assert(
        await page
          .locator(".stack-options > summary")
          .evaluate((el) => el === document.activeElement),
      );
      await page.locator(".piece-card").last().focus();
      assert.equal(
        await page.evaluate(() => scrollY),
        0,
        "Keyboard tray navigation does not move the page",
      );
    }
    for (const difficulty of ["small", "medium", "hard"]) {
      await page.goto(
        `${base}/games/perfect-stack?mode=daily&difficulty=${difficulty}`,
        { waitUntil: "networkidle" },
      );
      await page.locator(".stack-grid").waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .locator("#perfect-stack-play")
        .evaluate((el) =>
          el.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      const board = await page.locator(".stack-grid").boundingBox();
      assert(
        board &&
          board.y >= 0 &&
          board.y + board.height <= 844 &&
          Math.abs(board.width - board.height) < 1,
      );
      assert.equal(
        await page.locator(".stack-cell").count(),
        { small: 25, medium: 36, hard: 64 }[difficulty],
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    "artifacts/stack-viewport/layout.json",
    JSON.stringify(results, null, 2),
  );
}
console.log(
  `PASS ${results.length} layouts: full board, stats, status, tray and 44px controls; stationary desktop and scroll-to-gameplay mobile`,
);
