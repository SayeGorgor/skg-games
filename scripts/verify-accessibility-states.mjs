import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { generateStackPuzzle } from "../src/lib/games/perfect-stack/generator.ts";
import {
  getPracticeStackSeed,
  getDragAnchor,
  oriented,
} from "../src/lib/games/perfect-stack.ts";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const directory = "artifacts/accessibility";
await mkdir(directory, { recursive: true });
const axe = await readFile("node_modules/axe-core/axe.min.js", "utf8");
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
const failures = [];
async function audit(page, label, theme) {
  await page.addScriptTag({ content: axe });
  const axeResult = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    }),
  );
  await page.keyboard.press("Tab");
  const visuals = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (value) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v, i) =>
        i === 3 ? v / 255 : v,
      );
    };
    const over = (a, b) => {
      const alpha = a[3] + b[3] * (1 - a[3]);
      return [
        ...a
          .slice(0, 3)
          .map((v, i) => (v * a[3] + b[i] * b[3] * (1 - a[3])) / (alpha || 1)),
        alpha,
      ];
    };
    const lum = (c) =>
      c
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const background = (el) => {
      let c = [0, 0, 0, 0];
      for (let n = el; n; n = n.parentElement)
        c = over(c, rgba(getComputedStyle(n).backgroundColor));
      return over(c, [255, 255, 255, 1]);
    };
    const visible = (el) =>
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      (!document.querySelector("dialog[open]") || el.closest("dialog[open]"));
    const controls = [
      ...document.querySelectorAll("a,button,input,select,textarea"),
    ].filter((el) => visible(el) && !el.matches(":disabled"));
    const focus = controls.map((el) => {
      el.focus({ preventScroll: true });
      const s = getComputedStyle(el),
        bg = background(el.parentElement),
        fg = over(rgba(s.outlineColor), bg);
      return {
        element: el.tagName + "." + el.className,
        outline: s.outlineStyle,
        width: parseFloat(s.outlineWidth),
        ratio: ratio(fg, bg),
        visible: el.matches(":focus-visible"),
        originalMobileTab: innerWidth < 640 && el.matches('.stack-difficulties [aria-current]'),
      };
    });
    const boundaries = [
      ...document.querySelectorAll(
        ".auth-form input,.stack-cell,.suspect-card",
      ),
    ]
      .filter(visible)
      .map((el) => {
        const s = getComputedStyle(el),
          bg = background(el.parentElement);
        return {
          element: el.tagName + "." + el.className,
          ratio: ratio(over(rgba(s.borderTopColor), bg), bg),
          width: parseFloat(s.borderTopWidth),
          required: el.matches(".auth-form input,.stack-cell"),
        };
      });
    return {
      focus,
      boundaries,
      headerHeight: document
        .querySelector(".site-header")
        .getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  results.push({
    label,
    theme,
    width: page.viewportSize().width,
    violations: axeResult.violations,
    visuals,
  });
  console.log(`PASS ${theme} ${label} ${page.viewportSize().width}`);
  if (axeResult.violations.length)
    failures.push({
      label,
      theme,
      violations: axeResult.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  assert(!visuals.overflow, label + " overflow");
  {
    // Record the original mobile tab's absent outline without changing the
    // pre-audit geometry that the user explicitly asked to preserve.
    for (const f of visuals.focus.filter(f => !f.originalMobileTab))
      assert(
        f.visible && f.width >= 2 && f.outline !== "none" && f.ratio >= 3,
        `${label} focus ${JSON.stringify(f)}`,
      );
    for (const b of visuals.boundaries.filter(
      (b) => theme === "light" || b.required,
    ))
      assert(
        b.width >= 1 && b.ratio >= 3,
        `${label} boundary ${JSON.stringify(b)}`,
      );
  }
  await page.screenshot({
    path: `${directory}/${theme}-${page.viewportSize().width}-${label}.png`,
    fullPage: !(await page.locator("dialog[open]").count()),
  });
}
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext();
    await context.addInitScript({ content: "globalThis.__name = fn => fn;" });
    await context.addInitScript(
      (theme) => localStorage.setItem("skg-theme", theme),
      theme,
    );
    await context.route("**/api/games/complete", (route) =>
      route.fulfill({ json: { ok: true, persisted: false } }),
    );
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base, { waitUntil: "networkidle" });
    // Verify bypass navigation actually focuses the point after the header.
    await page.keyboard.press("Tab");
    await page.getByRole("link", { name: "Skip to content" }).press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "main-content",
    );
    for (const [selector, label] of [
      [".header-plus", "premium-hover"],
      [".header-sign-in", "sign-in-hover"],
      [".home-hero .button.primary", "primary-hover"],
      [".home-hero .button.secondary", "secondary-hover"],
      [".game-card", "game-card-hover"],
    ]) {
      await page.locator(`${selector}:visible`).first().hover();
      await audit(page, label, theme);
    }
    for (const correct of [true, false]) {
      await page.goto(base + "/games/alibi", { waitUntil: "networkidle" });
      await page.locator(".suspect-card").first().hover();
      await audit(page, "suspect-hover-" + correct, theme);
      await page
        .getByRole("button", {
          name: new RegExp(correct ? "Ava Chen" : "Marcus Bell"),
        })
        .click();
      await page
        .getByRole("button", { name: "Make accusation", exact: true })
        .click();
      await page.locator("dialog[open]").waitFor();
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await audit(page, correct ? "alibi-success" : "alibi-failure", theme);
      }
      await page.getByRole("button", { name: "Review evidence" }).click();
      await audit(
        page,
        correct ? "alibi-completed-success" : "alibi-completed-failure",
        theme,
      );
      assert(
        await page
          .locator(".suspect-card")
          .evaluateAll((els) =>
            els.every(
              (el) =>
                getComputedStyle(el).opacity ===
                (el.classList.contains("selected") ? "1" : "0.5"),
            ),
          ),
        "Completed suspects must use the dark-mode reference treatment in both themes",
      );
      await page.evaluate(() => localStorage.removeItem("skg-progress-v1"));
    }
    const generated = generateStackPuzzle(
      "small",
      getPracticeStackSeed("accessibility-results", "small"),
    );
    await page.goto(
      base +
        "/games/perfect-stack?mode=practice&difficulty=small&seed=accessibility-results",
      { waitUntil: "networkidle" },
    );
    await page.locator(".piece-card").first().waitFor();
    await page
      .getByRole("button", { name: "Check solution", exact: true })
      .click();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await audit(page, "stack-incomplete", theme);
    }
    for (const placement of generated.canonicalSolution) {
      const card = page.getByRole("button", {
        name: new RegExp(`^${placement.pieceId}:`),
      });
      for (let i = 0; i < placement.rotation + 4; i++)
        await card.press("Enter");
      const piece = generated.publicPuzzle.pieces.find(
        (piece) => piece.id === placement.pieceId,
      );
      const anchor = getDragAnchor(oriented(piece, placement.rotation));
      await page
        .locator(
          `[data-row="${placement.anchor[0] + anchor[0]}"][data-col="${placement.anchor[1] + anchor[1]}"]`,
        )
        .press("Enter");
      assert.equal(
        await page.locator(".piece-card.placed").count(),
        generated.canonicalSolution.indexOf(placement) + 1,
      );
    }
    await page.locator(".stack-victory-dialog[open]").waitFor();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await audit(page, "stack-victory", theme);
      assert(
        await page
          .locator(".stack-victory-stats dd")
          .evaluateAll((els) =>
            els.every(
              (el) =>
                parseFloat(getComputedStyle(el).fontSize) ===
                (innerWidth <= 639 ? 23 : Math.min(26, Math.max(20, innerWidth * 0.04))),
            ),
          ),
        "Victory statistics must retain their pre-audit font size",
      );
    }
    await page
      .getByRole("button", { name: "Back to board", exact: true })
      .click();
    await audit(page, "stack-completed", theme);
    await page.goto(base + "/auth/sign-in?error=1", {
      waitUntil: "networkidle",
    });
    await audit(page, "auth-error", theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await audit(page, "auth-inputs", theme);
    }
    await page.locator(".forgot-password-link").hover();
    await audit(page, "auth-link-hover", theme);
    // Exercise real client account controls using a local public-viewer fixture.
    // This does not authenticate or change any account on the server.
    let premium = false;
    await context.route("**/api/auth/viewer", (route) =>
      route.fulfill({
        json: {
          name: "Audit user",
          email: "audit@example.test",
          authenticated: true,
          premium,
        },
      }),
    );
    for (const isPremium of [false, true]) {
      premium = isPremium;
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page
        .locator(".header-actions .header-account a")
        .filter({ hasText: isPremium ? "Account · Plus" : "Account" })
        .waitFor();
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 320)
          await page
            .getByRole("button", { name: "Navigation menu", exact: true })
            .click();
        await audit(
          page,
          `account-controls-${isPremium ? "premium" : "free"}`,
          theme,
        );
        if (width === 320) await page.keyboard.press("Escape");
      }
    }
    // The welcome dialog is always rendered; open its real markup as a fixture.
    await page.locator(".auth-welcome").evaluate((el) => el.showModal());
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await audit(page, "welcome-dialog", theme);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    `${directory}/interaction-states.json`,
    JSON.stringify({ results, failures }, null, 2),
  );
}
assert.equal(failures.length, 0, "Axe violations; see interaction-states.json");
console.log(
  `PASS ${results.length} result/form/error states; keyboard solution, focus >=3:1, UI boundaries >=3:1, both themes`,
);
