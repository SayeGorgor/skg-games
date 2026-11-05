import assert from "node:assert/strict";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { getDailyStackPuzzle } from "../src/lib/games/perfect-stack/daily";
import { solveStackPuzzle } from "../src/lib/games/perfect-stack/solver";
import {
  getStackStars,
  type StackDifficulty,
  type StackPlacement,
} from "../src/lib/games/perfect-stack";
import {
  validCompletedStackPlacements,
  type AccountStackProgress,
} from "../src/lib/games/perfect-stack/completion";
import { summarize, type HistoryResult } from "../src/lib/results/shared";

// Two isolated browser storage contexts exercise the real UI; account APIs are
// mocked rather than creating Auth users or writing test attempts into Neon.
// Actual persistence/ownership/backfill SQL is covered by account-progress.test.
async function main() {
  const base = process.env.STACK_TEST_URL ?? "http://localhost:3000";
  const puzzles = {
    small: await getDailyStackPuzzle("small"),
    medium: await getDailyStackPuzzle("medium"),
  };
  const date = puzzles.small.challengeDate!;
  const server = new Map<string, AccountStackProgress>();
  const history = new Map<string, HistoryResult[]>();
  const empty = (accountKey: string): AccountStackProgress => ({
    accountKey,
    challengeDate: date,
    difficulties: { small: null, medium: null, hard: null },
  });
  server.set("account-A", empty("account-A"));
  const posts: string[] = [];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const contexts: BrowserContext[] = [];
  const switches = new Map<BrowserContext, (next: string) => void>();
  async function device(account: string, width: number, fail = false) {
    const context = await browser.newContext({
      viewport: { width, height: width < 900 ? 844 : 1000 },
    });
    contexts.push(context);
    switches.set(context, (next) => {
      account = next;
    });
    // tsx's serialized callback helper is needed by Playwright evaluate.
    await context.addInitScript({ content: "globalThis.__name = fn => fn;" });
    await context.route("**/api/auth/viewer", (r) =>
      r.fulfill({
        json: {
          authenticated: true,
          accountKey: account,
          premium: false,
          name: null,
          email: null,
        },
      }),
    );
    await context.route("**/api/auth/claim-anonymous", (r) =>
      r.fulfill({ json: { persisted: true, claimed: true, associated: 0 } }),
    );
    await context.route("**/api/stats*", (r) =>
      r.fulfill({
        json: {
          accountKey: account,
          summary: summarize(history.get(account) ?? []),
          results: history.get(account) ?? [],
          total: history.get(account)?.length ?? 0,
          page: 1,
          pageSize: 25,
        },
      }),
    );
    await context.route(
      "**/api/games/perfect-stack/daily-progress*",
      async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await r.fulfill(
          fail
            ? { status: 503, json: { error: "Test outage" } }
            : { json: server.get(account) ?? empty(account) },
        );
      },
    );
    await context.route("**/api/games/complete", async (r) => {
      const body = r.request().postDataJSON();
      posts.push(account);
      const difficulty = body.difficulty as "small" | "medium";
      const puzzle = puzzles[difficulty];
      assert(
        puzzle && validCompletedStackPlacements(puzzle, body.result.placements),
      );
      const data = server.get(account) ?? empty(account);
      const prior = data.difficulties[difficulty];
      if (prior) {
        if (!prior.placements) prior.placements = body.result.placements;
      } else
        data.difficulties[difficulty] = {
          completed: true,
          eventId: body.eventId,
          challengeNumber: puzzle.challengeNumber!,
          puzzleSeed: puzzle.seed,
          generatorVersion: puzzle.generatorVersion,
          moves: body.moves,
          durationMs: body.durationMs,
          completedAt: body.completedAt,
          stars: getStackStars(body.moves, puzzle.pieceCount),
          placements: body.result.placements,
        };
      server.set(account, data);
      if (!prior)
        history.set(account, [
          ...(history.get(account) ?? []),
          { ...body, verified: true },
        ]);
      await r.fulfill({ json: { ok: true, persisted: true } });
    });
    return context;
  }
  async function signedIn(page: Page, difficulty: StackDifficulty = "small") {
    await page.goto(`${base}/games/perfect-stack?difficulty=${difficulty}`, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .locator('.header-actions a[href="/account"]')
      .waitFor({ state: "attached" });
  }
  async function board(page: Page) {
    return page
      .locator("[data-stack-cell]")
      .evaluateAll((cells) =>
        cells.map((c) => [
          c.getAttribute("data-row"),
          c.getAttribute("data-col"),
          c.getAttribute("data-stack-piece"),
        ]),
      );
  }
  async function frozen(
    page: Page,
    placements: StackPlacement[],
    expected?: {
      moves: number | null;
      durationMs: number | null;
      stars: number | null;
    },
  ) {
    await page.getByRole("button", { name: "Clear", exact: true }).waitFor();
    assert(
      await page
        .getByRole("button", { name: "Clear", exact: true })
        .isDisabled(),
    );
    assert(
      await page
        .getByRole("button", { name: "Undo", exact: true })
        .isDisabled(),
    );
    assert.equal(await page.locator(".piece-card:not(:disabled)").count(), 0);
    if (expected) {
      const counters = await page.locator(".stat-row strong").allTextContents();
      assert.equal(counters[1], String(expected.moves));
      const seconds = Math.floor((expected.durationMs ?? 0) / 1000);
      assert.equal(
        counters[0],
        `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
      );
      assert.equal(
        await page
          .locator(
            `[aria-label="Difficulty"] a[aria-current="page"] [aria-label="${expected.stars} stars"]`,
          )
          .count(),
        1,
      );
    }
    const occupied = new Map<string, string>(
      placements.flatMap((p) =>
        p.cells.map(([r, c]) => [`${r}:${c}`, p.pieceId] as const),
      ),
    );
    for (const [r, c, piece] of await board(page))
      assert.equal(piece, occupied.get(`${r}:${c}`));
    const before = await board(page),
      stats = await page.locator(".stat-row").innerText();
    await page.locator("[data-stack-cell]").first().dispatchEvent("click");
    await page.waitForTimeout(1100);
    assert.deepEqual(await board(page), before);
    assert.equal(await page.locator(".stat-row").innerText(), stats);
  }
  async function solve(page: Page, difficulty: "small" | "medium") {
    await page.locator(".stack-grid").waitFor();
    const puzzle = puzzles[difficulty];
    const solution = solveStackPuzzle(puzzle, 200000);
    assert(solution.solved);
    let placed = 0;
    for (const placement of solution.placements) {
      const piece = page.getByRole("button", {
        name: `${placement.pieceId}: drag to place, or click to select and rotate`,
        exact: true,
      });
      // Tray clicks rotate; four clicks select a zero-rotation piece unchanged.
      for (let i = 0; i < (placement.rotation || 4); i++) await piece.click();
      const first = [...placement.cells].sort(
        (x, y) => x[0] - y[0] || x[1] - y[1],
      )[0];
      await page
        .locator(`[data-row="${first[0]}"][data-col="${first[1]}"]`)
        .click();
      placed++;
      await page.waitForFunction(
        (n) => document.querySelectorAll(".piece-card.placed").length === n,
        placed,
      );
    }
    await page.locator(".stack-victory-dialog[open]").waitFor();
  }
  try {
    const a = await device("account-A", 1440),
      desktop = await a.newPage();
    await signedIn(desktop);
    for (const difficulty of ["small", "medium"] as const) {
      if (difficulty !== "small") {
        await desktop
          .locator(
            `[aria-label="Difficulty"] a[href*="difficulty=${difficulty}"]`,
          )
          .click();
      }
      await desktop
        .locator(
          `[aria-label="Difficulty"] a[aria-current="page"][href*="difficulty=${difficulty}"]`,
        )
        .waitFor();
      await solve(desktop, difficulty);
      await desktop.waitForTimeout(1400);
      assert(
        await desktop.locator(".stack-victory-dialog[open]").isVisible(),
        "Sync must not dismiss a fresh solve result",
      );
      await desktop
        .getByRole("button", { name: "Close victory popup" })
        .click();
      assert(server.get("account-A")!.difficulties[difficulty]?.placements);
    }
    assert.equal(posts.filter((p) => p === "account-A").length, 2);
    const b = await device("account-A", 390),
      mobile = await b.newPage();
    await signedIn(mobile);
    // The account response is deliberately delayed: no playable board while unknown.
    await mobile.getByText("Loading your board...", { exact: true }).waitFor();
    assert.equal(await mobile.locator(".stack-grid").count(), 0);
    await mobile.locator(".stack-grid").waitFor();
    const saved = server.get("account-A")!;
    await frozen(
      mobile,
      saved.difficulties.small!.placements!,
      saved.difficulties.small!,
    );
    assert.equal(
      await mobile.locator(".stack-victory-dialog[open]").count(),
      0,
    );
    await mobile.reload({ waitUntil: "networkidle" });
    await mobile.evaluate(() => window.dispatchEvent(new Event("focus")));
    await mobile.locator(".stack-grid").waitFor();
    await frozen(
      mobile,
      saved.difficulties.small!.placements!,
      saved.difficulties.small!,
    );
    await mobile
      .locator('[aria-label="Difficulty"] a[href*="difficulty=medium"]')
      .click();
    await mobile
      .locator(
        '[aria-label="Difficulty"] a[aria-current="page"][href*="difficulty=medium"]',
      )
      .waitFor();
    await frozen(
      mobile,
      saved.difficulties.medium!.placements!,
      saved.difficulties.medium!,
    );
    await mobile
      .locator('[aria-label="Difficulty"] a[href*="difficulty=hard"]')
      .click();
    await mobile
      .locator(
        '[aria-label="Difficulty"] a[aria-current="page"][href*="difficulty=hard"]',
      )
      .waitFor();
    await mobile.getByRole("button", { name: "Clear", exact: true }).waitFor();
    assert(
      !(await mobile
        .getByRole("button", { name: "Clear", exact: true })
        .isDisabled()),
    );
    assert.equal(
      posts.filter((p) => p === "account-A").length,
      2,
      "Restoration must not post another completion",
    );
    await mobile
      .locator('[aria-label="Difficulty"] a[href*="difficulty=small"]')
      .click();
    await mobile
      .locator(
        '[aria-label="Difficulty"] a[aria-current="page"][href*="difficulty=small"]',
      )
      .waitFor();
    await frozen(
      mobile,
      saved.difficulties.small!.placements!,
      saved.difficulties.small!,
    );
    switches.get(b)!("account-B");
    await mobile.evaluate(() => window.dispatchEvent(new Event("focus")));
    await mobile
      .locator(".stack-controls button:last-child:not(:disabled)")
      .waitFor();
    assert.equal(
      await mobile.locator("[data-stack-piece]").count(),
      0,
      "Switching accounts must not leak the previous board",
    );
    switches.get(b)!("account-A");
    await mobile.evaluate(() => window.dispatchEvent(new Event("focus")));
    await mobile
      .locator(".stack-controls button:last-child:disabled")
      .waitFor();
    await frozen(
      mobile,
      saved.difficulties.small!.placements!,
      saved.difficulties.small!,
    );

    const original = structuredClone(saved.difficulties.small!);
    saved.difficulties.small!.placements = null;
    await signedIn(desktop);
    await desktop.locator(".stack-grid").waitFor();
    await frozen(desktop, original.placements!, original);
    assert.deepEqual(
      saved.difficulties.small,
      original,
      "Backfill must restore only the missing board",
    );
    assert.equal(
      posts.filter((p) => p === "account-A").length,
      3,
      "Exactly one missing-snapshot backfill",
    );
    const other = await device("account-B", 390),
      otherPage = await other.newPage();
    await signedIn(otherPage);
    await otherPage.locator(".stack-grid").waitFor();
    assert(
      !(await otherPage
        .getByRole("button", { name: "Clear", exact: true })
        .isDisabled()),
    );
    assert.equal(await otherPage.locator("[data-stack-piece]").count(), 0);
    server.set("legacy-A", {
      ...structuredClone(saved),
      accountKey: "legacy-A",
      difficulties: {
        ...structuredClone(saved.difficulties),
        small: { ...saved.difficulties.small!, placements: null },
      },
    });
    const legacy = await device("legacy-A", 390),
      legacyPage = await legacy.newPage();
    await signedIn(legacyPage);
    await legacyPage
      .getByRole("region", { name: "Completed Daily result" })
      .waitFor();
    assert.equal(await legacyPage.locator(".stack-grid").count(), 0);
    assert.equal(posts.filter((p) => p === "legacy-A").length, 0);
    const offline = await device("offline-A", 390, true),
      offlinePage = await offline.newPage();
    await signedIn(offlinePage);
    await offlinePage
      .getByRole("button", { name: "Retry saved board" })
      .waitFor();
    assert.equal(await offlinePage.locator(".stack-grid").count(), 0);
    const cached = await device("account-A", 390, true);
    await cached.addInitScript(
      ({ date, data }) =>
        localStorage.setItem(
          `skg-stack-account-results-v1:account-A:${date}`,
          JSON.stringify(data),
        ),
      { date, data: saved },
    );
    const cachedPage = await cached.newPage();
    await signedIn(cachedPage);
    await cachedPage.getByText(/Showing your cached completed board/).waitFor();
    await frozen(cachedPage, original.placements!, original);
    const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    contexts.push(guest);
    await guest.addInitScript({ content: "globalThis.__name = fn => fn;" });
    await guest.route("**/api/auth/viewer", (r) =>
      r.fulfill({
        json: {
          authenticated: false,
          accountKey: null,
          premium: false,
          name: null,
          email: null,
        },
      }),
    );
    let guestProgressRequests = 0;
    await guest.route("**/api/games/perfect-stack/daily-progress*", (r) => {
      guestProgressRequests++;
      return r.fulfill({ status: 401, json: {} });
    });
    const guestPage = await guest.newPage();
    await guestPage.goto(`${base}/games/perfect-stack?difficulty=small`, {
      waitUntil: "networkidle",
    });
    await solve(guestPage, "small");
    const guestSaved = await guestPage.evaluate(
      (date) =>
        JSON.parse(localStorage.getItem("skg-stack-progress-v2")!)[date]
          .difficulties.small,
      date,
    );
    await guestPage.reload({ waitUntil: "networkidle" });
    await guestPage
      .getByRole("button", { name: "Close victory popup" })
      .click();
    await frozen(guestPage, guestSaved.placements, guestSaved);
    assert.equal(
      guestProgressRequests,
      0,
      "Anonymous Daily play must not require an account lookup",
    );
    await guestPage.goto(
      `${base}/games/perfect-stack?mode=practice&difficulty=small&seed=account-regression`,
      { waitUntil: "networkidle" },
    );
    await guestPage.locator(".stack-grid").waitFor();
    assert(
      !(await guestPage
        .getByRole("button", { name: "Clear", exact: true })
        .isDisabled()),
    );
    assert.equal(await guestPage.locator("[data-stack-piece]").count(), 0);
    console.log(
      "PASS desktop solves Small + Medium; isolated mobile restores exact boards, score and frozen timer; Hard stays playable; refresh adds no POST; account B stays empty; legacy result stays complete; backfill preserves metadata; offline cache stays frozen; unknown server state blocks gameplay; anonymous restore and Practice pass.",
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
