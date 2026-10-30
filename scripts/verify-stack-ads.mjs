import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseline = process.argv.includes("--baseline");
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const sizes = [
  [360, 640],
  [360, 800],
  [375, 812],
  [390, 844],
  [430, 932],
  [440, 956],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [844, 390],
  [320, 568],
];
const directory = "artifacts/stack-ads";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
const measure = async (page) =>
  page.evaluate(() => {
    const rect = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
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
    return {
      board: rect(".stack-grid"),
      stats: rect(".stat-row"),
      tray: rect(".piece-tray"),
      controls: rect(".stack-controls"),
      gameplay: rect("#perfect-stack-play"),
      visible: [...grid.querySelectorAll(".piece-card")].filter((el) => {
        const c = el.getBoundingClientRect();
        return c.y >= r.y - 1 && c.bottom <= r.bottom + 1;
      }).length,
      cardSizes: [...grid.querySelectorAll(".piece-card")].map((el) => {
        const c = el.getBoundingClientRect();
        return [c.width, c.height];
      }),
      columns: getComputedStyle(grid).gridTemplateColumns,
      twoColumns:
        getComputedStyle(document.querySelector("#perfect-stack-play"))
          .gridTemplateColumns.trim()
          .split(/\s+/).length > 1,
      scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      ad: rect(".stack-ad-slot"),
      region: rect(".stack-ad-region"),
      stageDocumentTop:
        document.querySelector("#perfect-stack-play").getBoundingClientRect()
          .top + scrollY,
    };
  });
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ hasTouch: theme === "light" });
    await context.addInitScript(
      (t) => localStorage.setItem("skg-theme", t),
      theme,
    );
    let premium = false;
    await context.route("**/api/auth/viewer", (route) =>
      route.fulfill({
        json: {
          authenticated: true,
          premium,
          name: "Audit user",
          email: "audit@example.test",
        },
      }),
    );
    const page = await context.newPage();
    for (const difficulty of ["small", "medium", "hard"]) {
      await page.goto(
        `${base}/games/perfect-stack?mode=practice&difficulty=${difficulty}&seed=post-game-ads`,
        { waitUntil: "networkidle" },
      );
      await page.locator(".piece-card").first().waitFor();
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        premium = false;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page
          .locator(".header-account a")
          .filter({ hasText: "Account" })
          .first()
          .waitFor({ state: "attached" });
        if (!baseline) await page.locator(".stack-ad-slot").waitFor();
        if (width < 900)
          await page
            .locator("#perfect-stack-play")
            .evaluate((el) =>
              el.scrollIntoView({ block: "start", behavior: "instant" }),
            );
        else
          await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        await page.locator(".piece-grid").evaluate((el) => (el.scrollTop = 0));
        const standard = await measure(page);
        results.push({
          theme,
          difficulty,
          width,
          height,
          premium: false,
          ...standard,
        });
        if (baseline) continue;
        const label = `${theme} ${difficulty} ${width}x${height}`;
        assert(standard.ad && standard.region, label + " ad present");
        assert(
          standard.scrollWidth <= width,
          label + " no horizontal overflow",
        );
        assert(
          standard.ad.y >= standard.controls.bottom + 15,
          label + " clear separation after controls",
        );
        const twoColumns = standard.twoColumns;
        if (twoColumns) {
          assert(
            Math.abs(standard.ad.x - standard.controls.x) < 1 &&
              Math.abs(standard.ad.width - standard.controls.width) < 1,
            label + " ad follows sidebar",
          );
          assert.equal(standard.ad.height, 250);
        } else {
          assert(
            standard.region.y >= standard.gameplay.bottom,
            label + " ad outside mobile gameplay",
          );
          assert.equal(standard.ad.height, 100);
        }
        if (
          theme === "dark" &&
          difficulty === "hard" &&
          [390, 768, 1366, 1920].includes(width)
        )
          await page.screenshot({
            path: `${directory}/game-${width}x${height}.png`,
          });
        await page.locator(".stack-ad-slot").scrollIntoViewIfNeeded();
        const visibleAd = await page.locator(".stack-ad-slot").boundingBox();
        assert(
          visibleAd &&
            visibleAd.y >= -1 &&
            visibleAd.y + visibleAd.height <= height + 1,
          label + " ad reachable",
        );
        if (
          theme === "dark" &&
          difficulty === "hard" &&
          [390, 1366].includes(width)
        )
          await page.screenshot({
            path: `${directory}/ad-${width}x${height}.png`,
          });
        // Restore gameplay before comparing entitlement-dependent geometry.
        if (width < 900)
          await page
            .locator("#perfect-stack-play")
            .evaluate((el) =>
              el.scrollIntoView({ block: "start", behavior: "instant" }),
            );
        else
          await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        premium = true;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.locator(".stack-ad-region").waitFor({ state: "detached" });
        const adFree = await measure(page);
        results.push({
          theme,
          difficulty,
          width,
          height,
          premium: true,
          ...adFree,
        });
        for (const key of ["board", "stats", "tray", "controls", "gameplay"])
          for (const p of ["x", "y", "width", "height"])
            assert(
              Math.abs(adFree[key][p] - standard[key][p]) < 1,
              `${label} premium ${key} ${p} unchanged`,
            );
        assert.equal(
          adFree.visible,
          standard.visible,
          label + " premium inventory visibility unchanged",
        );
        assert.deepEqual(
          adFree.cardSizes,
          standard.cardSizes,
          label + " premium card sizes unchanged",
        );
        assert.equal(adFree.ad, null);
        assert.equal(adFree.region, null);
        // No region/margins left behind when ad-free; original viewport budget only.
        assert(
          adFree.scrollHeight < standard.scrollHeight,
          label + " no empty reserved ad space",
        );
      }
      console.log(
        `PASS ${theme} ${difficulty}: ${sizes.length} ad placements${baseline ? " baseline" : " + premium parity"}`,
      );
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
  for (const r of results.filter((r) => !r.premium)) {
    const old = before.find(
      (o) =>
        o.theme === r.theme &&
        o.difficulty === r.difficulty &&
        o.width === r.width &&
        o.height === r.height,
    );
    for (const key of ["board", "stats", "tray", "controls", "gameplay"])
      for (const p of ["x", "y", "width", "height"])
        assert(
          Math.abs(r[key][p] - old[key][p]) < 1,
          `${r.theme} ${r.width} ${key} ${p} matches pre-ad baseline`,
        );
    assert.equal(r.visible, old.visible);
    assert.deepEqual(r.cardSizes, old.cardSizes);
  }
  console.log(
    "PASS pre-ad baseline: gameplay sizes, positions and visible pieces unchanged",
  );
}
