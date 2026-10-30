import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseline = process.argv.includes("--baseline");
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
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext();
    await context.addInitScript(
      (theme) => localStorage.setItem("skg-theme", theme),
      theme,
    );
    // Keep audit interaction local; never submit a real completion to the database.
    await context.route("**/api/games/complete", (route) =>
      route.fulfill({ json: { ok: true, persisted: false } }),
    );
    const page = await context.newPage();
    for (const path of [
      "/",
      "/plus",
      "/auth/sign-in",
      "/auth/sign-up",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/games/alibi",
      ...["small", "medium", "hard"].map(
        (d) =>
          `/games/perfect-stack?mode=practice&difficulty=${d}&seed=accessibility`,
      ),
    ]) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      if (path.includes("perfect-stack"))
        await page.locator(".stack-grid").waitFor();
      if (path.includes("alibi"))
        await page.locator(".suspect-card").first().waitFor();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const states = ["default", "menu"];
        if (path.includes("perfect-stack")) states.push("help", "selected");
        if (path.includes("alibi")) states.push("selected");
        for (const state of states) {
          if (state === "menu")
            await page
              .getByRole("button", { name: "Navigation menu", exact: true })
              .click();
          if (state === "help")
            await page
              .getByRole("button", { name: "How to play", exact: true })
              .click();
          if (state === "selected")
            await page
              .locator(path.includes("alibi") ? ".suspect-card" : ".piece-card")
              .first()
              .click();
          await page.addScriptTag({ content: axe });
          const audit = await page.evaluate(async () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            const rgba = (color) => {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, 1, 1);
              return Array.from(ctx.getImageData(0, 0, 1, 1).data).map(
                (v, i) => (i === 3 ? v / 255 : v),
              );
            };
            const over = (a, b) => {
              const alpha = a[3] + b[3] * (1 - a[3]);
              return [
                ...a
                  .slice(0, 3)
                  .map(
                    (v, i) =>
                      (v * a[3] + b[i] * b[3] * (1 - a[3])) / (alpha || 1),
                  ),
                alpha,
              ];
            };
            const luminance = (c) =>
              c
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) =>
                  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                )
                .reduce(
                  (sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i],
                  0,
                );
            const contrast = (a, b) =>
              (Math.max(luminance(a), luminance(b)) + 0.05) /
              (Math.min(luminance(a), luminance(b)) + 0.05);
            const visible = (el) =>
              el.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
              }) &&
              (!document.querySelector("dialog[open]") ||
                !!el.closest("dialog[open]"));
            const text = [];
            for (const el of document.querySelectorAll("body *")) {
              if (
                !(el instanceof HTMLElement) ||
                !visible(el) ||
                el.closest(
                  '.brand, [aria-hidden="true"], nextjs-portal, script, style',
                )
              )
                continue;
              const value = [...el.childNodes]
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent.trim())
                .join(" ")
                .trim();
              if (!value) continue;
              const style = getComputedStyle(el);
              let fg = rgba(style.color),
                bg = [0, 0, 0, 0],
                zoom = 1;
              for (
                let ancestor = el;
                ancestor;
                ancestor = ancestor.parentElement
              ) {
                const s = getComputedStyle(ancestor),
                  surface = rgba(s.backgroundColor),
                  opacity = Number(s.opacity);
                fg = over(fg, surface);
                bg = over(bg, surface);
                fg[3] *= opacity;
                bg[3] *= opacity;
                zoom *= Number(s.zoom) || 1;
              }
              fg = over(fg, [255, 255, 255, 1]);
              bg = over(bg, [255, 255, 255, 1]);
              const size = parseFloat(style.fontSize) * zoom;
              const required =
                size >= 24 ||
                (size >= 18.6667 && Number(style.fontWeight) >= 700)
                  ? 3
                  : 4.5;
              text.push({
                element: el.tagName + "." + el.className,
                text: value.slice(0, 100),
                foreground: fg,
                background: bg,
                ratio: contrast(fg, bg),
                required,
                disabled: !!el.closest(":disabled"),
              });
            }
            const axe = await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
              },
            });
            const root = getComputedStyle(document.documentElement);
            const tokens = Object.fromEntries(
              [
                "--text",
                "--text-2",
                "--muted",
                "--blue",
                "--gold",
                "--green",
                "--coral",
                "--border",
                "--bg-page",
                "--bg-surface",
                "--bg-raised",
              ].map((t) => [t, root.getPropertyValue(t).trim()]),
            );
            return {
              tokens,
              text,
              overflow: document.documentElement.scrollWidth > innerWidth,
              violations: axe.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.map((n) => ({
                  target: n.target,
                  summary: n.failureSummary,
                })),
              })),
              incomplete: axe.incomplete.map((v) => ({
                id: v.id,
                targets: v.nodes.map((n) => n.target),
              })),
            };
          });
          // axe measures a sliver of the underlying Daily link while the menu
          // covers it. Check the full target and actual overlay geometry before
          // classifying this known overlay warning as manually reviewed.
          const reviewedViolations = [];
          if (state === "menu") {
            for (const violation of audit.violations) {
              if (violation.id !== "target-size") continue;
              violation.nodes = await Promise.all(
                violation.nodes.map(async (node) => {
                  if (!node.summary.includes("partially obscured")) return node;
                  const reviewed = await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    const menu = document.querySelector(
                      ".header-menu nav:not([hidden])",
                    );
                    if (!el?.matches(".stack-heading nav a") || !menu)
                      return false;
                    const a = el.getBoundingClientRect(),
                      b = menu.getBoundingClientRect();
                    return (
                      a.width >= 44 &&
                      a.height >= 44 &&
                      a.left < b.right &&
                      a.right > b.left &&
                      a.top < b.bottom &&
                      a.bottom > b.top
                    );
                  }, node.target[0]);
                  if (!reviewed) return node;
                  reviewedViolations.push({
                    ...node,
                    reason:
                      "Full target is >=44px; transient dropdown covers part of it. Escape/outside click/focus leaving dismiss the dropdown (verify-header.ts).",
                  });
                  return null;
                }),
              );
              violation.nodes = violation.nodes.filter(Boolean);
            }
            audit.violations = audit.violations.filter((v) => v.nodes.length);
          }
          results.push({
            theme,
            path,
            width,
            state,
            ...audit,
            reviewedViolations,
          });
          if (width === 390 || width === 1440) {
            const slug =
              (path.split("?")[0].replaceAll("/", "-") || "home") +
              (new URL(base + path).searchParams.get("difficulty") ?? "");
            if (!baseline && ["default", "help", "selected"].includes(state))
              await page.screenshot({
                path: `${directory}/${theme}-${width}-${slug}-${state}.png`,
                fullPage: state !== "help",
              });
          }
          if (state === "menu" || state === "help")
            await page.keyboard.press("Escape");
        }
      }
      console.log(
        `${theme} ${path}: audited desktop/tablet/mobile and available states`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  `${directory}/${baseline ? "before" : "after"}.json`,
  JSON.stringify(results, null, 2),
);
const failures = results.flatMap((r) =>
  r.text
    .filter((t) => !t.disabled && t.ratio < t.required)
    .map((t) => ({
      theme: r.theme,
      path: r.path,
      width: r.width,
      state: r.state,
      ...t,
    })),
);
const violations = results
  .filter((r) => r.violations.length)
  .map((r) => ({
    theme: r.theme,
    path: r.path,
    width: r.width,
    state: r.state,
    violations: r.violations,
  }));
await writeFile(
  `${directory}/${baseline ? "before" : "after"}-failures.json`,
  JSON.stringify({ text: failures, violations }, null, 2),
);
console.log(
  JSON.stringify({
    states: results.length,
    textFailures: failures.length,
    axeStatesWithViolations: violations.length,
    overflow: results.filter((r) => r.overflow).length,
  }),
);
if (!baseline) {
  assert.equal(
    failures.filter((r) => r.theme === "light").length,
    0,
    "Light text contrast failures; see after-failures.json",
  );
  assert.equal(
    violations.filter((r) => r.theme === "light").length,
    0,
    "Light axe violations; see after-failures.json",
  );
  assert(!results.some((r) => r.overflow), "Responsive overflow");
}
