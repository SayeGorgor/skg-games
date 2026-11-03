import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Run against a server with NEXT_PUBLIC_ADS_ENABLED matching TEST_ADS_ENABLED.
async function main() {
  const enabled = process.env.TEST_ADS_ENABLED === "true";
  const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({ baseURL });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/",
        "/games/alibi",
        "/games/perfect-stack",
        "/auth/sign-up?intent=premium",
      ]) {
        const response = await page.goto(path, { waitUntil: "networkidle" });
        assert(response?.ok(), `Failed to load ${path}`);
        assert(
          !/Application error:|Internal Server Error/.test(
            await page.locator("body").innerText(),
          ),
        );
        if (width === 390)
          await page.getByRole("button", { name: "Navigation menu" }).click();
        const header = page.locator(".site-header");
        await header
          .getByRole("link", { name: "Sign in", exact: true })
          .waitFor();
        if (!enabled) {
          await header
            .getByRole("link", { name: "Sign up", exact: true })
            .waitFor();
          assert(
            !/\bads?\b|ad-free|SKG Plus|Subscribe|Subscription/i.test(
              await page.locator("body").innerText(),
            ),
          );
          assert.equal(
            await page
              .locator(
                '.ad-slot, .plus-banner, .auth-welcome, a[href="/plus/start"]',
              )
              .count(),
            0,
          );
        } else if (path === "/") {
          await page.getByRole("link", { name: "Explore SKG Plus" }).waitFor();
          assert.equal(await page.locator(".plus-banner").count(), 1);
          assert((await page.locator(".ad-slot").count()) > 0);
        }
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
    }
    if (!enabled) {
      for (const path of ["/plus", "/plus/start"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        assert.equal(new URL(page.url()).pathname, "/auth/sign-in");
      }
      await page.goto("/", { waitUntil: "networkidle" });
      await page.route("**/api/auth/viewer", (route) =>
        route.fulfill({
          json: {
            name: "Test player",
            email: "player@example.com",
            authenticated: true,
            premium: true,
          },
        }),
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page
        .locator(".header-actions")
        .getByRole("link", { name: "Account", exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole("link", { name: "Sign in", exact: true }).count(),
        0,
      );
      assert(
        !/SKG Plus|Account · Plus|\bads?\b|ad-free/i.test(
          await page.locator("body").innerText(),
        ),
      );
    }
    console.log(
      `Advertising ${enabled ? "enabled" : "disabled"}: responsive navigation, pages, and promotion checks passed.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
