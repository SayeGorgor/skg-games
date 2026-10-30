import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
const sizes = [
  [320, 568],
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [844, 390],
  [2560, 1440],
  [720, 450],
];
async function noOverflow(page: Page, label: string) {
  const audit = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll("body *"))
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
      })
      .slice(0, 12)
      .map((e) => ({
        tag: e.tagName,
        class: e.className,
        rect: [e.getBoundingClientRect().left, e.getBoundingClientRect().right],
      })),
  }));
  assert(audit.scroll <= audit.width + 1, `${label}: ${JSON.stringify(audit)}`);
}
async function modalFits(page: Page) {
  const modal = page.locator("dialog[open]");
  assert(await modal.isVisible());
  const r = await modal.boundingBox();
  const viewport = page.viewportSize()!;
  assert(
    r &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.x + r.width <= viewport.width + 1 &&
      r.y + r.height <= viewport.height + 1,
    "Modal must fit viewport",
  );
  assert(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await modal.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const close = modal.locator(".stack-help-close");
  const c = await close.boundingBox();
  assert(
    c && c.y >= r.y && c.y + c.height <= r.y + r.height + 1,
    "Modal close control must remain visible after scrolling",
  );
  assert(c.width >= 44 && c.height >= 44);
}
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    await mkdir("artifacts/responsive", { recursive: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.STACK_TEST_URL ?? "http://localhost:3000";
    for (const path of [
      "/",
      "/plus",
      "/games/alibi",
      ...["small", "medium", "hard"].map(
        (d) =>
          `/games/perfect-stack?mode=practice&difficulty=${d}&seed=responsive-check`,
      ),
    ]) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      if (path.includes("perfect-stack"))
        await page.locator(".stack-grid").waitFor();
      const label =
        path === "/"
          ? "home"
          : path === "/plus"
            ? "plus"
            : path.includes("alibi")
              ? "alibi"
              : "stack-" + new URL(base + path).searchParams.get("difficulty");
      for (const theme of ["light", "dark"]) {
        await page
          .locator(".theme-switch")
          .getByRole("button", { name: theme.toUpperCase(), exact: true })
          .click();
        for (const [width, height] of sizes) {
          await page.setViewportSize({ width, height });
          await noOverflow(page, `${path} ${theme} ${width}`);
          const navigationToggle = page.getByRole("button", {
            name: "Navigation menu",
            exact: true,
          });
          await navigationToggle.click();
          assert(await page.locator(".site-header nav").isVisible());
          assert.equal(
            await page.locator(".header-plus").isVisible(),
            width >= 768,
          );
          for (const button of await page
            .locator(
              ".theme-switch button:visible,.site-header nav a:visible,.header-plus:visible",
            )
            .all()) {
            const b = await button.boundingBox();
            assert(
              // WCAG 2.2 AA target minimum; the intentionally scaled header
              // uses ~37–41px controls and moves account actions into the menu.
              b && b.width >= 24 && b.height >= 24,
              `Small header target ${path} ${width}: ${JSON.stringify(b)}`,
            );
          }
          await navigationToggle.click();
          if (path === "/")
            assert(await page.locator(".today-panel").isVisible());
          if (path.includes("perfect-stack")) {
            const b = await page.locator(".stack-grid").boundingBox();
            assert(b && b.width <= 560.5);
            for (const card of await page.locator(".piece-card").all())
              assert(
                await card.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
                "Piece preview overflows card",
              );
            const stats = await page.locator(".stat-row").boundingBox(),
              board = await page.locator(".stack-board-card").boundingBox();
            assert(stats && board);
            if (width < 1024)
              assert(stats.y < board.y, "Mobile stats must precede board");
          }
          if ([320, 768, 1440].includes(width))
            await page.screenshot({
              path: `artifacts/responsive/${label}-${theme}-${width}.png`,
              fullPage: true,
            });
        }
      }
      console.log("PASS layout matrix", path);
    }
    const seed = "responsive-check".padEnd(64, "A");
    await page.goto(
      `${base}/games/perfect-stack?mode=practice&difficulty=small&seed=${seed}`,
      { waitUntil: "networkidle" },
    );
    await page.locator(".stack-grid").waitFor();
    assert((await page.locator(".date-label").innerText()).includes(seed));
    for (const theme of ["light", "dark"]) {
      await page
        .locator(".theme-switch")
        .getByRole("button", { name: theme.toUpperCase(), exact: true })
        .click();
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await noOverflow(page, `long seed ${width}`);
        await page.getByRole("button", { name: "How to play" }).click();
        await modalFits(page);
        if ([320, 1440, 844].includes(width))
          await page.screenshot({
            path: `artifacts/responsive/help-${theme}-${width}.png`,
          });
        await page.locator("dialog[open] .stack-help-close").click();
      }
    }
    console.log(
      "PASS 64-character Practice seed and illustrated instructions at all sizes, both themes, portrait/landscape, scroll-visible close button",
    );
    for (const correct of [true, false]) {
      const context = await browser.newContext();
      let posts = 0;
      await context.route("**/api/games/complete", async (route) => {
        posts++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"ok":true,"persisted":false}',
        });
      });
      const alibi = await context.newPage();
      alibi.on("pageerror", (e) => errors.push(e.message));
      await alibi.goto(base + "/games/alibi", { waitUntil: "networkidle" });
      await alibi
        .getByRole("button", {
          name: new RegExp(correct ? "Ava Chen" : "Marcus Bell"),
        })
        .click();
      for (const [width, height] of sizes) {
        await alibi.setViewportSize({ width, height });
        assert.equal(
          await alibi.locator(".suspect-card.selected strong").innerText(),
          correct ? "Ava Chen" : "Marcus Bell",
        );
        await noOverflow(alibi, "Alibi selection resize");
      }
      await alibi.getByRole("button", { name: "Make accusation" }).click();
      const modal = alibi.getByRole("dialog");
      await modal.waitFor();
      const result = await modal.innerText();
      for (const theme of ["light", "dark"]) {
        await modal.getByRole("button", { name: "Review evidence" }).click();
        await alibi
          .locator(".theme-switch")
          .getByRole("button", { name: theme.toUpperCase(), exact: true })
          .click();
        await alibi.getByRole("button", { name: "View result" }).click();
        for (const [width, height] of sizes) {
          await alibi.setViewportSize({ width, height });
          await modalFits(alibi);
          assert.equal(await modal.innerText(), result);
          if ([320, 768, 1440, 844].includes(width))
            await alibi.screenshot({
              path: `artifacts/responsive/alibi-${correct ? "success" : "failure"}-${theme}-${width}.png`,
            });
        }
      }
      await alibi.reload({ waitUntil: "networkidle" });
      await modal.waitFor();
      assert.equal(await modal.innerText(), result);
      assert.equal(posts, 1);
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS active/complete/restored Alibi resizing, success/failure modals, theme switching, no duplicate submissions",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
