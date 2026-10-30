import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const sizes = [
  [320, 568],
  [360, 640],
  [360, 800],
  [375, 667],
  [375, 812],
  [390, 844],
  [393, 852],
  [412, 915],
  [430, 932],
  [440, 956],
  [768, 1024],
  [844, 390],
  [568, 320],
];
const results = [];
await mkdir("artifacts/stack-mobile", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ hasTouch: true });
    await context.addInitScript(
      (theme) => localStorage.setItem("skg-theme", theme),
      theme,
    );
    const page = await context.newPage();
    for (const difficulty of ["small", "medium", "hard"]) {
      await page.goto(
        `${base}/games/perfect-stack?mode=practice&difficulty=${difficulty}&seed=mobile-refine`,
        { waitUntil: "networkidle" },
      );
      await page.locator(".stack-grid").waitFor();
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        assert(
          (await page.locator(".site-header").boundingBox()).y >= 0,
          "Navigation initially reachable",
        );
        await page
          .locator("#perfect-stack-play")
          .evaluate((el) =>
            el.scrollIntoView({ block: "start", behavior: "instant" }),
          );
        await page.locator(".piece-grid").evaluate((el) => (el.scrollTop = 0));
        const m = await page.evaluate(() => {
          const rect = (s) => {
            const el = document.querySelector(s),
              r = el.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom,
            };
          };
          const grid = document.querySelector(".piece-grid"),
            r = grid.getBoundingClientRect();
          return {
            scrollY,
            header: rect(".site-header"),
            context: rect(".stack-heading"),
            stage: rect("#perfect-stack-play"),
            board: rect(".stack-grid"),
            stats: rect(".stat-row"),
            status: rect(".board-message"),
            tray: rect(".piece-tray"),
            pieces: rect(".piece-grid"),
            controls: rect(".stack-controls"),
            overflow: document.documentElement.scrollWidth > innerWidth,
            visible: [...grid.querySelectorAll(".piece-card")].filter((el) => {
              const c = el.getBoundingClientRect();
              return c.y >= r.y - 1 && c.bottom <= r.bottom + 1;
            }).length,
            total: grid.querySelectorAll(".piece-card").length,
            columns:
              getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
            scrollHeight: grid.scrollHeight,
            clientHeight: grid.clientHeight,
            cells: [...document.querySelectorAll(".stack-cell")].map((el) => {
              const c = el.getBoundingClientRect();
              return [c.x, c.y, c.right, c.bottom, c.width, c.height];
            }),
            controlHeights: [
              ...document.querySelectorAll(".stack-controls button"),
            ].map((el) => el.getBoundingClientRect().height),
          };
        });
        results.push({ theme, difficulty, width, height, ...m });
        const label = `${theme} ${difficulty} ${width}x${height}`;
        assert(
          m.scrollY > 0 && m.header.bottom <= 1 && m.context.bottom <= 1,
          `${label} chrome scrolls away`,
        );
        assert(
          Math.abs(m.stage.y) < 1 && Math.abs(m.stage.height - height) < 1,
          `${label} gameplay takes dynamic viewport ${JSON.stringify(m)}`,
        );
        assert(!m.overflow, label + " horizontal overflow");
        for (const k of [
          "board",
          "stats",
          "status",
          "tray",
          "pieces",
          "controls",
        ]) {
          const r = m[k];
          assert(
            r.x >= -1 &&
              r.y >= -1 &&
              r.width > 0 &&
              r.height > 0 &&
              r.right <= width + 1 &&
              r.bottom <= height + 1,
            `${label} ${k} clipped ${JSON.stringify(r)}`,
          );
        }
        assert(
          Math.abs(m.board.width - m.board.height) < 1,
          label + " square board",
        );
        assert(
          m.cells.every(
            ([x, y, right, bottom, w, h]) =>
              x >= m.board.x - 1 &&
              y >= m.board.y - 1 &&
              right <= m.board.right + 1 &&
              bottom <= m.board.bottom + 1 &&
              Math.abs(w - h) < 1,
          ),
          label + " every cell visible",
        );
        assert(
          m.controlHeights.every((h) => h >= 44),
          label + " controls >=44px",
        );
        if (
          difficulty === "small" &&
          width >= 360 &&
          height >= 640 &&
          height > width
        )
          assert(
            m.visible === 5 && m.scrollHeight <= m.clientHeight + 1,
            `${label} all small pieces fit ${JSON.stringify(m)}`,
          );
        if (difficulty === "medium" && height >= 800 && height > width)
          assert(
            m.visible === 8 && m.scrollHeight <= m.clientHeight + 1,
            `${label} all medium pieces fit ${JSON.stringify(m)}`,
          );
        if ([320, 360, 390, 440, 768, 844].includes(width))
          await page.screenshot({
            path: `artifacts/stack-mobile/${theme}-${difficulty}-${width}x${height}.png`,
          });
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        assert(
          (await page.locator(".site-header").boundingBox()).y >= 0,
          "Can freely return to navigation",
        );
      }
      console.log(
        `PASS ${theme} ${difficulty}: ${sizes.length} mobile viewport/scroll budgets`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `${base}/games/perfect-stack?mode=practice&difficulty=hard&seed=mobile-refine`,
      { waitUntil: "networkidle" },
    );
    await page.locator(".stack-grid").waitFor();
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    const session = await context.newCDPSession(page);
    const touchAt = (type, x = 0, y = 0) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    const empty = await page
      .locator('[data-row="2"][data-col="2"]')
      .boundingBox();
    const x = empty.x + empty.width / 2,
      y = empty.y + empty.height / 2;
    await touchAt("touchStart", x, y);
    for (let i = 1; i <= 8; i++) await touchAt("touchMove", x, y - i * 20);
    await touchAt("touchEnd");
    await page.waitForFunction(
      () =>
        scrollY > 0 &&
        document.querySelector(".site-header").getBoundingClientRect().bottom <
          0,
    );
    // Natural scrolling can continue beyond gameplay into the advertisement.
    // Align the test driver before checking the reverse gesture.
    await page
      .locator("#perfect-stack-play")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    assert.equal(
      await page.locator(".piece-card.placed").count(),
      0,
      "Page pan never places a piece",
    );
    assert.equal(
      await page.locator(".stack-drag-ghost").count(),
      0,
      "Page pan never starts a drag",
    );
    await touchAt("touchStart", 100, 20);
    for (let i = 1; i <= 8; i++) await touchAt("touchMove", 100, 20 + i * 20);
    await touchAt("touchEnd");
    await page.waitForFunction(() => scrollY < 1);
    assert(
      (await page.locator(".site-header").boundingBox()).y >= 0,
      "Native swipe returns to site navigation",
    );
    console.log(
      `PASS ${theme}: native page swipe into gameplay and back, no accidental moves`,
    );
    await context.close();
  }
  // Desktop must retain the pre-change geometry to subpixel rounding tolerance.
  if (process.argv.includes("--compare-desktop")) {
    const before = JSON.parse(
      await readFile("artifacts/stack-mobile/desktop-before.json", "utf8"),
    );
    const page = await browser.newPage();
    for (const old of before) {
      await page.setViewportSize({ width: old.width, height: old.height });
      await page.goto(
        `${base}/games/perfect-stack?mode=practice&difficulty=hard&seed=mobile-refine`,
        { waitUntil: "networkidle" },
      );
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        old.theme,
      );
      await page.locator(".piece-card").first().waitFor();
      for (const [s, expected] of Object.entries(old.boxes)) {
        const r = await page.locator(s).boundingBox();
        assert(
          [r.x, r.y, r.width, r.height].every(
            (v, i) => Math.abs(v - expected[i]) < 1,
          ),
          `${old.theme} desktop ${old.width} ${s} unchanged`,
        );
      }
    }
    console.log(
      "PASS desktop baseline: board, sidebar, stats, header, title and controls unchanged",
    );
  }
} finally {
  await browser.close();
  await writeFile(
    "artifacts/stack-mobile/layout.json",
    JSON.stringify(results, null, 2),
  );
}
