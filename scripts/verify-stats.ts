import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { generateStackPuzzle } from "../src/lib/games/perfect-stack/generator";
import {
  getDragAnchor,
  getPracticeStackSeed,
  oriented,
} from "../src/lib/games/perfect-stack";
import {
  summarize,
  uniqueHistory,
  type HistoryResult,
} from "../src/lib/results/shared";
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    await mkdir("artifacts/stats", { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/stats", { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: "Your next game starts your story." })
      .waitFor();
    await page.goto(base + "/games/alibi", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Ava Chen/ }).click();
    await page.getByRole("button", { name: "Make accusation" }).click();
    await page
      .getByRole("dialog", { name: "Case closed.", exact: true })
      .waitFor();
    const entry = await page.evaluate(
      () => JSON.parse(localStorage.getItem("skg-results-v1")!).entries[0],
    );
    assert(entry.value.eventId);
    assert.equal(entry.synced, false);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("skg-results-v1")!).entries.length,
      ),
      1,
    );
    await page.goto(
      base +
        "/games/perfect-stack?mode=practice&difficulty=small&seed=stats-browser",
      { waitUntil: "networkidle" },
    );
    const generated = generateStackPuzzle(
      "small",
      getPracticeStackSeed("stats-browser", "small"),
    );
    for (const placement of generated.canonicalSolution) {
      const piece = generated.publicPuzzle.pieces.find(
        (p) => p.id === placement.pieceId,
      )!;
      const card = page.getByRole("button", {
        name: `${piece.id}: drag`,
        exact: false,
      });
      for (let i = 0; i < (placement.rotation || 4); i++)
        await card.press("Enter");
      const anchor = getDragAnchor(oriented(piece, placement.rotation));
      await page
        .locator(
          `[data-row="${placement.anchor[0] + anchor[0]}"][data-col="${placement.anchor[1] + anchor[1]}"]`,
        )
        .click();
    }
    await page.getByRole("dialog", { name: "Perfect stack!" }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("skg-results-v1")!).entries.length,
      ),
      2,
    );
    await page.goto(base + "/stats", { waitUntil: "networkidle" });
    await page.locator(".stats-history-list li").nth(1).waitFor();
    for (const theme of ["light", "dark"])
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page
          .locator(".theme-switch")
          .getByRole("button", { name: theme.toUpperCase(), exact: true })
          .click();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${theme} ${width} overflows`,
        );
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `artifacts/stats/${theme}-${width}.png`,
            fullPage: true,
          });
      }
    // Local history filtering and pagination with distinct replayable sessions.
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem("skg-results-v1")!);
      const practice = store.entries.find(
        (e: { value: { mode: string } }) => e.value.mode === "practice",
      );
      for (let i = 0; i < 27; i++)
        store.entries.push({
          ...practice,
          value: { ...practice.value, eventId: crypto.randomUUID() },
        });
      localStorage.setItem("skg-results-v1", JSON.stringify(store));
      window.dispatchEvent(new Event("skg-results-changed"));
    });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".stats-history-list li").length === 4,
    );
    await page
      .getByRole("combobox", { name: "Game" })
      .selectOption("daily-alibi");
    await page.waitForFunction(
      () => document.querySelectorAll(".stats-history-list li").length === 1,
    );
    // A valid session appearing anywhere triggers guest import, independent of auth route/provider.
    let key = "account-A",
      allowUploads = false;
    const saved = new Map<string, HistoryResult>();
    let writes = 0;
    await page.route("**/api/auth/viewer", (route) =>
      route.fulfill({
        json: {
          authenticated: true,
          premium: false,
          name: "Player",
          email: null,
          accountKey: key,
        },
      }),
    );
    await page.route("**/api/auth/claim-anonymous", (route) =>
      route.fulfill({ json: { persisted: true, claimed: true } }),
    );
    await page.route("**/api/games/complete", async (route) => {
      writes++;
      assert.equal(route.request().headers()["x-skg-account"], key);
      const body = route.request().postDataJSON();
      if (allowUploads) saved.set(body.eventId, { ...body, verified: true });
      await route.fulfill({
        status: allowUploads ? 200 : 503,
        json: { persisted: allowUploads },
      });
    });
    await page.route("**/api/stats*", (route) => {
      const query = new URL(route.request().url()).searchParams;
      const all = key === "account-A" ? uniqueHistory([...saved.values()]) : [];
      const filtered = query.get("game")
        ? all.filter((r) => r.gameSlug === query.get("game"))
        : all;
      const index = Number(query.get("page") ?? 1);
      return route.fulfill({
        json: {
          accountKey: key,
          summary: summarize(all),
          results: filtered.slice((index - 1) * 25, index * 25),
          total: filtered.length,
          pageSize: 25,
        },
      });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("button", { name: "Retry sync" }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("skg-results-v1")!).entries.filter(
            (e: { synced: boolean }) => !e.synced,
          ).length,
      ),
      29,
    );
    allowUploads = true;
    await page.getByRole("button", { name: "Retry sync" }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem("skg-results-v1")!).entries.every(
        (e: { synced: boolean }) => e.synced,
      ),
    );
    assert.equal(saved.size, 29);
    const settled = writes;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(1000);
    assert.equal(
      writes,
      settled,
      "Already synced history must not upload again",
    );
    key = "account-B";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("heading", { name: "Your next game starts your story." })
      .waitFor();
    assert.equal(
      writes,
      settled,
      "Another account must not inherit synced history",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS stats: both games, reload deduplication, guest stats, both themes at 320/390/768/1440, filtering/pagination, session-driven import, failed-upload retention, retries, account isolation.",
    );
    await context.close();
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
