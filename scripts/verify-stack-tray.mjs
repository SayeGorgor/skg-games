import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseline = process.argv.includes("--baseline");
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const directory = "artifacts/stack-tray";
const sizes = [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [440, 956],
  [430, 932],
  [390, 844],
  [375, 667],
  [360, 640],
  [320, 568],
  [768, 1024],
];
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ hasTouch: theme === "light" });
    await context.addInitScript(
      (theme) => localStorage.setItem("skg-theme", theme),
      theme,
    );
    const page = await context.newPage();
    await page.goto(
      `${base}/games/perfect-stack?mode=practice&difficulty=hard&seed=tray-density`,
      { waitUntil: "networkidle" },
    );
    await page.locator(".piece-card").first().waitFor();
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      if (width < 900)
        await page
          .locator("#perfect-stack-play")
          .evaluate((el) =>
            el.scrollIntoView({ block: "start", behavior: "instant" }),
          );
      else await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.locator(".piece-grid").evaluate((el) => (el.scrollTop = 0));
      const metrics = await page.evaluate(() => {
        const rect = (el) => {
          const r = el.getBoundingClientRect();
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
        const cards = [...grid.querySelectorAll(".piece-card")].map((el) => ({
          ...rect(el),
          id: el.getAttribute("aria-label"),
          shape: rect(el.querySelector(".piece-shape")),
          cells: [...el.querySelectorAll(".piece-shape i:not(.empty)")].map(
            rect,
          ),
        }));
        return {
          board: rect(document.querySelector(".stack-grid")),
          tray: rect(document.querySelector(".piece-tray")),
          stats: rect(document.querySelector(".stat-row")),
          controls: rect(document.querySelector(".stack-controls")),
          columns:
            getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
          visible: cards.filter(
            (c) => c.y >= r.y - 1 && c.bottom <= r.bottom + 1,
          ).length,
          cards,
          scrollHeight: grid.scrollHeight,
          clientHeight: grid.clientHeight,
          pageScroll: scrollY,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      results.push({ theme, width, height, ...metrics });
      if (!baseline) {
        assert(
          !metrics.overflow && (width < 900 || metrics.pageScroll === 0),
          "Viewport fit is preserved",
        );
        for (const c of metrics.cards) {
          assert(
            c.width >= 104.5 && c.height >= 103.5,
            "Useful card dimensions",
          );
          assert(
            c.shape.x >= c.x &&
              c.shape.y >= c.y &&
              c.shape.right <= c.right + 1 &&
              c.shape.bottom <= c.bottom + 1,
            "Shape fits card",
          );
          for (const cell of c.cells)
            assert(
              Math.abs(cell.width - cell.height) < 0.1 && cell.width >= 13.9,
              "Square recognizable cells",
            );
        }
        if (width >= 1366)
          assert(
            metrics.columns >= 3 && metrics.visible >= 9,
            "Desktop overview >=9 pieces",
          );
        await page.screenshot({
          path: `${directory}/${theme}-${width}x${height}.png`,
        });
        // Exercise both rotations of the longest supported straight piece,
        // independently of whether this seed happens to contain that shape.
        assert(
          await page
            .locator(".piece-card")
            .first()
            .evaluate((card) => {
              const shape = card.querySelector(".piece-shape");
              const oldStyle = shape.getAttribute("style"),
                oldHTML = shape.innerHTML;
              let fits = true;
              for (const [cols, rows] of [
                [6, 1],
                [1, 6],
              ]) {
                shape.style.setProperty("--piece-cols", String(cols));
                shape.style.setProperty("--piece-rows", String(rows));
                shape.style.gridTemplateColumns = `repeat(${cols},var(--tray-cell-size))`;
                shape.style.gridTemplateRows = `repeat(${rows},var(--tray-cell-size))`;
                shape.innerHTML = '<i class="blue"></i>'.repeat(6);
                const r = card.getBoundingClientRect(),
                  s = shape.getBoundingClientRect();
                fits &&=
                  s.x >= r.x &&
                  s.y >= r.y &&
                  s.right <= r.right + 1 &&
                  s.bottom <= r.bottom + 1 &&
                  [...shape.children].every((el) => {
                    const c = el.getBoundingClientRect();
                    return (
                      Math.abs(c.width - c.height) < 0.1 && c.width >= 13.9
                    );
                  });
              }
              shape.innerHTML = oldHTML;
              shape.setAttribute("style", oldStyle);
              return fits;
            }),
          "Horizontal and vertical six-cell pieces fit without distortion",
        );
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    `${directory}/${baseline ? "before" : "after"}.json`,
    JSON.stringify(results, null, 2),
  );
}
if (!baseline && process.argv.includes("--compare")) {
  const before = JSON.parse(await readFile(`${directory}/before.json`, "utf8"));
  for (const r of results) {
    if (r.width < 900) continue;
    const old = before.find(
      (o) =>
        o.theme === r.theme && o.width === r.width && o.height === r.height,
    );
    for (const key of ["board", "tray", "stats", "controls"])
      for (const p of ["x", "y", "width", "height"])
        assert(Math.abs(r[key][p] - old[key][p]) < 1, `${key} ${p} unchanged`);
  }
}
console.log(
  JSON.stringify(
    results.map(({ theme, width, height, columns, visible, cards }) => ({
      theme,
      viewport: `${width}x${height}`,
      columns,
      visible,
      card: [+cards[0].width.toFixed(1), +cards[0].height.toFixed(1)],
    })),
    null,
    2,
  ),
);
