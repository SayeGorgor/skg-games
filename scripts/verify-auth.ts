import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    await mkdir("artifacts/auth", { recursive: true });
    const context = await browser.newContext(),
      page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
    for (const route of [
      "/auth/sign-up",
      "/auth/sign-in",
      "/auth/forgot-password",
      "/auth/reset-password?token=test",
      "/plus",
      "/games/alibi",
      "/games/perfect-stack?mode=practice&difficulty=hard&seed=auth-check",
    ]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      for (const theme of ["light", "dark"]) {
        await page
          .locator(".theme-switch")
          .getByRole("button", { name: theme.toUpperCase(), exact: true })
          .click();
        for (const width of [320, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${route} ${theme} ${width} overflows`,
          );
          for (const control of await page
            .locator(
              ".header-account a,.header-account button,.auth-form button,.auth-form input",
            )
            .all()) {
            const r = await control.boundingBox();
            assert(r && r.height >= 44);
          }
          if ([320, 1440].includes(width) && route.startsWith("/auth/sign-up"))
            await page.screenshot({
              path: `artifacts/auth/signup-${theme}-${width}.png`,
              fullPage: true,
            });
        }
      }
    }
    await page.goto(
      base +
        "/games/perfect-stack?mode=practice&difficulty=small&seed=auth-handoff",
      { waitUntil: "networkidle" },
    );
    await page.locator("[data-stack-cell]").first().waitFor();
    for (const cell of await page.locator("[data-stack-cell]").all()) {
      await cell.click();
      if (await page.locator(".piece-card.placed").count()) break;
    }
    assert.equal(await page.locator(".piece-card.placed").count(), 1);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/auth/sign-in?**");
    assert(
      new URL(page.url()).searchParams
        .get("returnTo")
        ?.includes("seed=auth-handoff"),
    );
    await page.getByRole("link", { name: "Continue playing free" }).click();
    await page.locator(".piece-card.placed").waitFor();
    assert.equal(await page.locator(".piece-card.placed").count(), 1);
    await page.goto(base + "/games/alibi", { waitUntil: "networkidle" });
    await page.locator(".suspect-card").first().click();
    const selection = await page.locator(".suspect-card.selected").innerText();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: "Continue playing free" }).click();
    await page.locator(".suspect-card.selected").waitFor();
    assert.equal(
      await page.locator(".suspect-card.selected").innerText(),
      selection,
    );
    await page.goto(base + "/account", { waitUntil: "networkidle" });
    assert(page.url().includes("/auth/sign-in"));
    await page.goto(base + "/plus/start", { waitUntil: "networkidle" });
    assert(page.url().includes("/auth/sign-up?intent=premium"));
    await page
      .getByRole("link", { name: "Already have an account? Sign in" })
      .click();
    assert(page.url().includes("intent=premium"));
    const forbidden = await context.request.post(
      base + "/api/auth/claim-anonymous",
      {
        headers: { origin: base },
        data: { anonymousId: "bad", userId: "fake", premium: true },
      },
    );
    assert.equal(forbidden.status(), 401);
    const crossOrigin = await context.request.post(
      base + "/api/auth/claim-anonymous",
      {
        headers: { origin: "https://evil.example" },
        data: { anonymousId: "bad" },
      },
    );
    assert.equal(crossOrigin.status(), 403);
    let posts = 0;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      posts++;
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          message: "This email is already registered.",
          code: "USER_ALREADY_EXISTS",
        }),
      });
    });
    await page.goto(
      base + "/auth/sign-up?intent=premium&returnTo=https://evil.example",
      { waitUntil: "networkidle" },
    );
    await page.getByLabel("Name", { exact: true }).fill("Test User");
    await page
      .getByLabel("Email", { exact: true })
      .fill("test@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Valid-test-password1");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("Different-password1");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Passwords must match" })
      .waitFor();
    assert.equal(posts, 0);
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("Valid-test-password1");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[role="alert"]')?.textContent !==
        "Passwords must match.",
    );
    assert(
      (await page.getByRole("alert").allTextContents()).some((text) =>
        text.includes("User already exists"),
      ),
    );
    assert.equal(posts, 1);
    const free = page.getByRole("link", { name: "Continue playing free" });
    assert.equal(await free.getAttribute("href"), "/");
    let googlePayload: Record<string, string> | undefined;
    await page.route("**/api/auth/sign-in/social", async (route) => {
      googlePayload = route.request().postDataJSON();
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Provider unavailable",
          code: "PROVIDER_ERROR",
        }),
      });
    });
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Google sign-in could not be started" })
      .waitFor();
    assert(googlePayload);
    assert.equal(googlePayload.provider, "google");
    assert(googlePayload.callbackURL.includes("intent=premium"));
    assert(googlePayload.callbackURL.includes("new=0"));
    assert(googlePayload.newUserCallbackURL.includes("new=1"));
    // Test the shared host with a mocked server viewer; this grants no server
    // session and does not exercise real Neon/Google credentials.
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.route("**/api/auth/viewer", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          name: "Test User",
          email: "test@example.invalid",
          authenticated: true,
          premium: false,
        }),
      }),
    );
    await page.evaluate(() => {
      history.replaceState(history.state, "", "/?welcome=plus");
      window.dispatchEvent(new Event("focus"));
    });
    const welcome = page.getByRole("dialog", { name: "Welcome to SKG Games" });
    await welcome.waitFor();
    assert(!page.url().includes("welcome="));
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      for (const [width, height] of [
        [320, 568],
        [390, 320],
        [768, 1024],
        [1024, 768],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        const rect = await welcome.boundingBox();
        assert(
          rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= width + 1 &&
            rect.y + rect.height <= height + 1,
        );
        await welcome.evaluate((el) => (el.scrollTop = el.scrollHeight));
        const close = await welcome
          .getByRole("button", { name: "Close welcome" })
          .boundingBox();
        assert(
          close &&
            close.y >= rect.y &&
            close.y + close.height <= rect.y + rect.height + 1,
        );
      }
    }
    await page.keyboard.press("Escape");
    assert(!(await welcome.isVisible()));
    await page.reload({ waitUntil: "networkidle" });
    assert(!(await welcome.isVisible()));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    await page.evaluate(() => {
      localStorage.setItem(
        "skg-anonymous-id",
        "12345678-1234-4123-8123-123456789abc",
      );
      localStorage.setItem(
        "skg-progress-v1",
        JSON.stringify({ alibiSolved: true }),
      );
    });
    const before = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => key.startsWith("skg-")),
      ),
    );
    await page.route("**/api/auth/sign-out", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      }),
    );
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.getByRole("button", { name: "Sign out", exact: true }).click(),
    ]);
    assert.deepEqual(
      await page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([key]) =>
            key.startsWith("skg-"),
          ),
        ),
      ),
      before,
    );
    const local = await page.evaluate(() => Object.keys(localStorage));
    assert(!local.some((k) => /password|token/i.test(k)));
    assert.deepEqual(errors, []);
    console.log(
      "PASS auth form layouts in both themes at 320/390/768/1024/1440; public games; protected Account; premium intent; safe redirects; invalid/cross-origin claims; password confirmation; provider errors; Google new/existing callback payloads",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
