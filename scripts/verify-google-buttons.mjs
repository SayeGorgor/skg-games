import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  await mkdir("artifacts/auth", { recursive: true });
  const page = await browser.newPage({
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
  });
  for (const mode of ["sign-in", "sign-up"]) {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/auth/${mode}`, { waitUntil: "networkidle" });
      const button = page.getByRole("button", {
        name: "Continue with Google",
        exact: true,
      });
      let previous;
      for (const theme of ["light", "dark"]) {
        await page
          .locator(".theme-switch")
          .getByRole("button", { name: theme.toUpperCase(), exact: true })
          .click();
        const visible = button.locator(`.google-auth-icon-${theme}`);
        await visible.waitFor({ state: "visible" });
        assert.equal(await button.locator("img:visible").count(), 1);
        assert(
          await visible.evaluate(
            (img) => img.complete && img.naturalWidth === 40,
          ),
        );
        const metrics = await button.evaluate((element) => {
          const image = element.querySelector("img:not([hidden])");
          const icon = element
            .querySelector(".google-auth-icon")
            .getBoundingClientRect();
          const text = element
            .querySelector(".google-auth-content > span:last-child")
            .getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            gap: text.left - (icon.right - 10),
            border: getComputedStyle(image).borderWidth,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(metrics.gap, 10);
        assert.equal(metrics.border, "0px");
        assert(!metrics.overflow);
        assert(metrics.height >= 48 && metrics.height <= 51);
        if (previous) assert.deepEqual(metrics, previous);
        previous = metrics;
        await button.focus();
        assert(
          await button.evaluate(
            (element) => element === document.activeElement,
          ),
        );
        if (width !== 768)
          await page.screenshot({
            path: `artifacts/auth/google-${mode}-${theme}-${width}.png`,
            fullPage: true,
          });
      }
    }
    let release;
    let payload;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/sign-in/social", async (route) => {
      payload = route.request().postDataJSON();
      await pending;
      await route.fulfill({
        status: 400,
        json: { message: "Test provider error" },
      });
    });
    await page
      .getByRole("button", { name: "Continue with Google", exact: true })
      .click();
    const connecting = page.getByRole("button", {
      name: "Connecting…",
      exact: true,
    });
    await connecting.waitFor();
    assert(await connecting.isDisabled());
    release();
    await page
      .getByText("Google sign-in could not be started. Please try again.", {
        exact: true,
      })
      .waitFor();
    assert.equal(payload.provider, "google");
    assert(payload.callbackURL.includes("/auth/complete"));
    assert(
      await page
        .getByRole("button", { name: "Continue with Google", exact: true })
        .isEnabled(),
    );
    await page.unroute("**/api/auth/sign-in/social");
  }
  console.log(
    "Google buttons: both forms, themes, responsive sizing, icon spacing, keyboard focus, and mocked OAuth loading/error states passed.",
  );
} finally {
  await browser.close();
}
