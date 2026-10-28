import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { dailyAlibi } from "../src/lib/games/alibi";
type Theme = "light" | "dark";
async function contrast(page: Page, selectors: string[]) {
  const ratios = await page.evaluate((selectors) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const rgba = (value: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v, i) =>
        i === 3 ? v / 255 : v,
      );
    };
    const over = (a: number[], b: number[]) => {
      const alpha = a[3] + b[3] * (1 - a[3]);
      return [
        ...a
          .slice(0, 3)
          .map((v, i) => (v * a[3] + b[i] * b[3] * (1 - a[3])) / (alpha || 1)),
        alpha,
      ];
    };
    const lum = (color: number[]) => {
      const c = color.slice(0, 3).map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    return selectors.map((selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, ratio: 0 };
      let bg = [0, 0, 0, 0];
      for (
        let node: Element | null = el;
        node && bg[3] < 0.999;
        node = node.parentElement
      )
        bg = over(bg, rgba(getComputedStyle(node).backgroundColor));
      bg = over(bg, [255, 255, 255, 1]);
      const fg = over(rgba(getComputedStyle(el).color), bg),
        a = lum(fg),
        b = lum(bg);
      return {
        selector,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  }, selectors);
  for (const { selector, ratio } of ratios)
    assert(
      ratio >= 4.5,
      `${selector} contrast ${ratio.toFixed(2)} must be >=4.5`,
    );
  return Math.min(...ratios.map((r) => r.ratio));
}
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    await mkdir("artifacts/alibi-theme", { recursive: true });
    const base = process.env.STACK_TEST_URL ?? "http://localhost:3000";
    let minContrast = 100;
    for (const [index, suspect] of dailyAlibi.suspects
      .filter((s) => s.key === "ava" || s.key === "marcus")
      .entries()) {
      const initial: Theme = index === 0 ? "dark" : "light";
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      // tsx preserves local function names inside serialized evaluate callbacks.
      await context.addInitScript({ content: "globalThis.__name = fn => fn;" });
      await context.addInitScript((theme) => {
        try {
          if (!localStorage.getItem("skg-theme"))
            localStorage.setItem("skg-theme", theme);
        } catch {
          /* The test's initial about:blank document has no storage origin. */
        }
      }, initial);
      let posts = 0;
      const errors: string[] = [];
      context.on("page", (page) =>
        page.on("pageerror", (error) => errors.push(error.message)),
      );
      await context.route("**/api/games/complete", async (route) => {
        posts++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, persisted: false }),
        });
      });
      const page = await context.newPage();
      await page.goto(base + "/games/alibi", { waitUntil: "networkidle" });
      await page.locator(".suspect-card").first().waitFor();
      const choose = async (theme: Theme, modalOpen = false) => {
        const button = page
          .locator(".theme-switch")
          .getByRole("button", { name: theme.toUpperCase(), exact: true });
        if (modalOpen)
          await button.evaluate((button) =>
            (button as HTMLButtonElement).click(),
          );
        else await button.click();
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.theme),
          theme,
        );
      };
      const pageColor = async () =>
        page
          .locator(".alibi-shell")
          .evaluate((el) => getComputedStyle(el).backgroundColor);
      const rootColor = (theme: Theme) =>
        theme === "light" ? "rgb(243, 239, 230)" : "rgb(15, 17, 21)";
      assert.equal(await pageColor(), rootColor(initial));
      if (index === 0)
        for (const theme of ["dark", "light"] as Theme[]) {
          await choose(theme);
          assert.equal(await pageColor(), rootColor(theme));
          for (const width of [1440, 1024, 768, 390]) {
            await page.setViewportSize({
              width,
              height: width === 390 ? 844 : 1000,
            });
            assert(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              `${theme} page overflow ${width}`,
            );
            await page.screenshot({
              path: `artifacts/alibi-theme/case-${theme}-${width}.png`,
              fullPage: true,
            });
          }
          minContrast = Math.min(
            minContrast,
            await contrast(page, [
              ".alibi-hero h1",
              ".alibi-hero > p",
              ".case-pill",
              ".alibi-brief p",
              ".alibi-brief .eyebrow.red",
              ".objective",
              ".clue span",
              ".clue b",
              ".suspect-card p",
              ".suspect-card > b",
              ".alibi-how p",
              ".alibi-stat small",
              ".alibi-footer",
              ".alibi-rail .ad-slot",
              ".accusation .alibi-button",
            ]),
          );
        }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const card = page.getByRole("button", { name: new RegExp(suspect.name) });
      await card.click();
      const handle = await card.elementHandle();
      assert(handle);
      const idle = await page
        .locator(".suspect-card:not(.selected)")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      for (const theme of ["light", "dark"] as Theme[]) {
        await choose(theme);
        assert(
          await handle.evaluate((el) => el.isConnected),
          "Theme switching must not remount the case",
        );
        assert.equal(await card.getAttribute("aria-pressed"), "true");
        assert(
          !(await page
            .getByRole("button", { name: "Make accusation" })
            .isDisabled()),
        );
        const selected = await card.evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          border: getComputedStyle(el).borderColor,
        }));
        assert(selected.border);
        if (theme === "light") assert.notEqual(selected.background, idle);
        minContrast = Math.min(
          minContrast,
          await contrast(page, [
            ".suspect-card.selected p",
            ".suspect-card.selected > b",
            ".accusation .alibi-button",
          ]),
        );
        const action = page.getByRole("button", { name: "Make accusation" });
        await action.hover();
        minContrast = Math.min(
          minContrast,
          await contrast(page, [".accusation .alibi-button"]),
        );
        await page.mouse.down();
        minContrast = Math.min(
          minContrast,
          await contrast(page, [".accusation .alibi-button"]),
        );
        await page.mouse.move(2, 2);
        await page.mouse.up();
        assert.equal(
          await page.getByRole("dialog").count(),
          0,
          "Testing active button styling must not submit an accusation",
        );
      }
      await choose(initial);
      await page.getByRole("button", { name: "Make accusation" }).click();
      const modal = page.getByRole("dialog", {
        name: suspect.correct ? "Case closed." : "That alibi holds up.",
        exact: true,
      });
      await modal.waitFor();
      const result = await modal.innerText();
      const saved = await page.evaluate(() =>
        localStorage.getItem("skg-progress-v1"),
      );
      assert(saved);
      assert(!/"theme"|"background"|"color"/.test(saved));
      for (const theme of ["light", "dark"] as Theme[]) {
        await choose(theme, true);
        assert(await modal.isVisible());
        assert.equal(await modal.innerText(), result);
        assert.equal(await pageColor(), rootColor(theme));
        assert.equal(
          await page.evaluate(() => localStorage.getItem("skg-progress-v1")),
          saved,
        );
        minContrast = Math.min(
          minContrast,
          await contrast(page, [
            ".alibi-result-heading h2",
            ".alibi-result-dialog .eyebrow",
            ".alibi-result-dialog .eyebrow.gold",
            ".alibi-result-suspect strong",
            ".alibi-result-explanation",
            ".alibi-result-actions > button",
            ".alibi-result-actions > a",
          ]),
        );
        for (const width of [1440, 1024, 768, 390]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 1000,
          });
          assert(
            await modal.evaluate((el) => el.scrollWidth <= el.clientWidth),
          );
          await page.screenshot({
            path: `artifacts/alibi-theme/${suspect.correct ? "success" : "failure"}-${theme}-${width}.png`,
          });
        }
      }
      const restoredTheme: Theme = initial === "dark" ? "light" : "dark";
      await choose(restoredTheme, true);
      await page.reload({ waitUntil: "networkidle" });
      await modal.waitFor();
      assert.equal(await modal.innerText(), result);
      assert.equal(await pageColor(), rootColor(restoredTheme));
      assert.equal(
        await page.evaluate(() => localStorage.getItem("skg-theme")),
        restoredTheme,
      );
      assert.equal(posts, 1);
      await modal.getByRole("button", { name: "Review evidence" }).click();
      minContrast = Math.min(
        minContrast,
        await contrast(page, [
          ".suspect-card.selected p",
          ".suspect-card.selected > b",
          ".suspect-card:not(.selected) p",
          ".accusation p",
          ".accusation .alibi-button",
        ]),
      );
      const disabled = page.locator(".suspect-card:not(.selected)").first();
      const before = await disabled.evaluate((el) => ({
        border: getComputedStyle(el).borderColor,
        transform: getComputedStyle(el).transform,
      }));
      await disabled.hover();
      assert.deepEqual(
        await disabled.evaluate((el) => ({
          border: getComputedStyle(el).borderColor,
          transform: getComputedStyle(el).transform,
        })),
        before,
      );
      await page.getByRole("button", { name: "View result" }).click();
      await modal.getByRole("link", { name: "Back to SKG Games" }).click();
      await page.waitForURL(base + "/");
      await choose(initial);
      await page.locator('a.game-card[href="/games/alibi"]').click();
      await modal.waitFor();
      assert.equal(await modal.innerText(), result);
      assert.equal(await pageColor(), rootColor(initial));
      assert.equal(posts, 1);
      assert.deepEqual(errors, []);
      console.log(
        "PASS",
        suspect.correct ? "success" : "failure",
        "live global toggle, selected-state preservation, 4 widths, modal theme, persisted result in opposite theme, no duplicate completion, disabled hover",
      );
      await context.close();
    }
    console.log(
      "PASS sampled Alibi text/metadata/disabled-control contrast >=4.5:1; minimum",
      minContrast.toFixed(2),
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
