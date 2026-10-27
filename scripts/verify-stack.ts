import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { getGameDate } from "../src/lib/game-date";
import { getStackChallengeNumber } from "../src/lib/games/perfect-stack/daily";
import {
  generateDailyStackPuzzle,
  generateStackPuzzle,
} from "../src/lib/games/perfect-stack/generator";
import {
  getPracticeStackSeed,
  oriented,
  getDragAnchor,
  type StackDifficulty,
} from "../src/lib/games/perfect-stack";
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  const completionStatuses: number[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (response) => {
    if (response.url().endsWith("/api/games/complete"))
      completionStatuses.push(response.status());
  });
  const base = process.env.STACK_TEST_URL ?? "http://localhost:3000";
  await mkdir("artifacts/stack", { recursive: true });
  const cell = (r: number, c: number) =>
    page.locator(`[data-row="${r}"][data-col="${c}"]`);
  async function drag(
    source: ReturnType<Page["locator"]>,
    r: number,
    c: number,
    valid: boolean,
  ) {
    await source.scrollIntoViewIfNeeded();
    const from = await source.boundingBox();
    assert(from);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      from.x + from.width / 2 + 10,
      from.y + from.height / 2,
      { steps: 3 },
    );
    await page
      .locator(".stack-grid")
      .evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
    const to = await cell(r, c).boundingBox();
    assert(to);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 8,
    });
    const ghost = page.locator(".stack-drag-ghost");
    await ghost.waitFor();
    const tile = await ghost.locator("i:not(.empty)").first().boundingBox();
    assert(tile);
    assert(Math.abs(tile.width - to.width) < 1);
    assert(
      Math.abs(tile.x - to.x) < 1 && Math.abs(tile.y - to.y) < 1,
      "Pointer stays over the occupied anchor tile",
    );
    if (valid) assert((await page.locator(".drag-preview").count()) >= 4);
    assert.equal(
      (await ghost.getAttribute("class"))?.includes("invalid"),
      !valid,
    );
    await page.mouse.up();
    assert.equal(await ghost.count(), 0);
  }
  async function assertSolvedBoardFrozen() {
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const reset = page.getByRole("button", { name: "Reset", exact: true });
    assert(await undo.isDisabled());
    assert(await reset.isDisabled());
    const snapshot = async () =>
      Promise.all([
        page.locator(".stack-grid").innerHTML(),
        page.locator(".piece-grid").innerHTML(),
        page.locator(".stat-row").innerText(),
        page.locator(".stack-victory-dialog").innerText(),
      ]);
    const before = await snapshot();
    await undo.dispatchEvent("click");
    await reset.dispatchEvent("click");
    await page.locator(".piece-card").first().dispatchEvent("click");
    const square = page.locator("[data-stack-cell]").first();
    await square.click();
    const source = await square.boundingBox();
    assert(source);
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      source.x + source.width / 2 + 40,
      source.y + source.height / 2 + 40,
      { steps: 5 },
    );
    await page.mouse.up();
    assert.equal(await page.locator(".stack-drag-ghost").count(), 0);
    // Allow a full timer tick to confirm the result duration stays frozen too.
    await page.waitForTimeout(1100);
    assert.deepEqual(
      await snapshot(),
      before,
      "Solved placements, rotations, moves, stars and duration must remain unchanged",
    );
  }
  for (const difficulty of ["small", "medium", "hard"] as StackDifficulty[]) {
    const seed = "browser-check";
    const generated = generateStackPuzzle(
        difficulty,
        getPracticeStackSeed(seed, difficulty),
      ),
      p = generated.publicPuzzle;
    const response = await page.goto(
      `${base}/games/perfect-stack?mode=practice&difficulty=${difficulty}&seed=${seed}`,
      { waitUntil: "networkidle" },
    );
    assert.equal(response?.status(), 200);
    assert.equal(
      await page.locator("[data-stack-cell]").count(),
      p.rows * p.cols,
    );
    assert.equal(await page.locator(".piece-card").count(), p.pieceCount);
    assert.equal(
      await page
        .locator(".stack-cell.blue,.stack-cell.gold,.stack-cell.green")
        .count(),
      0,
    );
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${difficulty} overflow ${width}`,
      );
      await page.screenshot({
        path: `artifacts/stack/${difficulty}-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const first = generated.canonicalSolution[0],
      piece = p.pieces.find((x) => x.id === first.pieceId)!;
    const tray = page.getByRole("button", {
      name: `${piece.id}: drag`,
      exact: false,
    });
    for (let i = 0; i < first.rotation; i++) await tray.press("Enter");
    const anchor = getDragAnchor(oriented(piece, first.rotation)),
      r = first.anchor[0] + anchor[0],
      c = first.anchor[1] + anchor[1];
    await drag(tray, r, c, true);
    assert.equal(await page.locator(".piece-card.placed").count(), 1);
    await drag(cell(r, c), p.rows - 1, p.cols - 1, false);
    assert.equal(
      await page.locator(".piece-card.placed").count(),
      1,
      "invalid reposition preserves original",
    );
    const dr =
      Math.max(...first.cells.map((c) => c[0])) < p.rows - 1
        ? 1
        : Math.min(...first.cells.map((c) => c[0])) > 0
          ? -1
          : 0;
    const dc = dr
      ? 0
      : Math.max(...first.cells.map((c) => c[1])) < p.cols - 1
        ? 1
        : -1;
    await drag(cell(r, c), r + dr, c + dc, true);
    assert.equal(await page.locator(".piece-card.placed").count(), 1);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    const completionResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/games/complete"),
      { timeout: 45000 },
    );
    for (const placement of generated.canonicalSolution) {
      const piece = p.pieces.find((x) => x.id === placement.pieceId)!;
      const card = page.getByRole("button", {
        name: `${piece.id}: drag`,
        exact: false,
      });
      for (let i = 0; i < placement.rotation; i++) await card.press("Enter");
      const anchor = getDragAnchor(oriented(piece, placement.rotation));
      await drag(
        card,
        placement.anchor[0] + anchor[0],
        placement.anchor[1] + anchor[1],
        true,
      );
    }
    const victory = page.getByRole("dialog", { name: "Perfect stack!" });
    await victory.waitFor();
    assert.equal((await completionResponse).status(), 200);
    const time = await page
      .locator(".stat-row > div")
      .first()
      .locator("strong")
      .innerText();
    assert.deepEqual(await victory.locator("dd").allTextContents(), [
      time,
      String(p.pieceCount),
      String(p.pieceCount),
    ]);
    assert.equal(
      await victory.locator(".stack-victory-stars").getAttribute("aria-label"),
      "3 out of 3 stars",
    );
    const expectedColors = new Map(
      generated.canonicalSolution.flatMap((placement) =>
        placement.cells.map(
          ([r, c]) =>
            [
              `${r}:${c}`,
              p.pieces.find((piece) => piece.id === placement.pieceId)!.color,
            ] as const,
        ),
      ),
    );
    assert.deepEqual(
      await victory
        .locator("svg rect")
        .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("fill"))),
      Array.from(
        { length: p.rows * p.cols },
        (_, i) =>
          `var(--${expectedColors.get(`${Math.floor(i / p.cols)}:${i % p.cols}`)})`,
      ),
    );
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await victory.evaluate((el) => el.scrollWidth <= el.clientWidth));
      await page.screenshot({
        path: `artifacts/stack/victory-${difficulty}-${width}.png`,
      });
    }
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await page.screenshot({
      path: `artifacts/stack/victory-${difficulty}-dark.png`,
    });
    await page.keyboard.press("Escape");
    await victory.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Reset", exact: true })
        .isDisabled(),
      true,
      "Practice Reset is disabled after a solve",
    );
    await page.getByRole("button", { name: "View results" }).click();
    await victory.getByRole("button", { name: "Back to board" }).click();
    await victory.waitFor({ state: "hidden" });
    assert(
      await page
        .getByRole("button", { name: "View results" })
        .evaluate((el) => document.activeElement === el),
    );
    await assertSolvedBoardFrozen();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "light"),
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("skg-stack-progress-v2")),
      null,
      "Practice must not mark Daily",
    );
    console.log(
      difficulty,
      "pointer dragging, rotated placements, invalid restoration, completion, 4 responsive widths: passed",
    );
  }
  await page.getByRole("button", { name: "New puzzle", exact: true }).click();
  await page.waitForURL(
    (url) => url.searchParams.get("seed") !== "browser-check",
  );
  assert.equal(
    await page.getByRole("button", { name: "Reset", exact: true }).isDisabled(),
    false,
  );
  assert.equal(await page.locator(".piece-card.placed").count(), 0);
  const api = await page.request.get(
    `${base}/api/games/perfect-stack/practice?difficulty=medium&seed=api-check`,
  );
  assert.equal(api.status(), 200);
  const publicPuzzle = await api.json();
  assert.equal(publicPuzzle.pieceCount, 8);
  assert(!("canonicalSolution" in publicPuzzle));
  assert.equal(
    (
      await page.request.get(
        `${base}/api/games/perfect-stack/practice?seed=bad%20seed`,
      )
    ).status(),
    400,
  );
  const date = getGameDate(),
    daily = generateDailyStackPuzzle(
      date,
      "small",
      getStackChallengeNumber(date),
    );
  await page.goto(base + "/games/perfect-stack?difficulty=small", {
    waitUntil: "networkidle",
  });
  const dailyCompletionResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/games/complete"),
    { timeout: 45000 },
  );
  for (const placement of daily.canonicalSolution) {
    const piece = daily.publicPuzzle.pieces.find(
      (x) => x.id === placement.pieceId,
    )!;
    const card = page.getByRole("button", {
      name: piece.id + ": drag",
      exact: false,
    });
    for (let i = 0; i < placement.rotation; i++) await card.press("Enter");
    const anchor = getDragAnchor(oriented(piece, placement.rotation));
    await drag(
      card,
      placement.anchor[0] + anchor[0],
      placement.anchor[1] + anchor[1],
      true,
    );
  }
  await page.locator(".stack-victory-dialog[open]").waitFor();
  assert.equal((await dailyCompletionResponse).status(), 200);
  assert(
    (await page.locator(".stack-victory-dialog").innerText()).includes(
      "Small",
    ) ||
      (await page.locator(".stack-victory-dialog").innerText()).includes(
        "small",
      ),
  );
  assert(
    await page.evaluate(() => !!localStorage.getItem("skg-stack-progress-v2")),
  );
  await page
    .getByRole("dialog", { name: "Perfect stack!" })
    .getByRole("button", { name: "Back to board" })
    .click();
  await assertSolvedBoardFrozen();
  assert.equal(
    await page.getByRole("button", { name: "Reset", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isDisabled(),
    true,
  );
  await page.goto(base + "/games/perfect-stack?difficulty=medium", {
    waitUntil: "networkidle",
  });
  assert.equal(
    await page.getByRole("button", { name: "Reset", exact: true }).isDisabled(),
    false,
    "Completing Small must not lock Medium",
  );
  assert(
    (await page.locator(".stack-difficulties").innerText()).includes(
      String.fromCharCode(9733),
    ),
  );
  console.log("Daily solve and separate difficulty progress: passed");
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await touch.newPage();
  await mobile.goto(
    `${base}/games/perfect-stack?mode=practice&difficulty=hard&seed=touch-check`,
    { waitUntil: "networkidle" },
  );
  await mobile.locator(".piece-card").first().tap();
  assert.equal(
    await mobile.locator('.piece-card[aria-pressed="true"]').count(),
    1,
  );
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const touchCard = mobile.locator(".piece-card").first();
  await touchCard.scrollIntoViewIfNeeded();
  const touchBox = await touchCard.boundingBox();
  assert(touchBox);
  const session = await touch.newCDPSession(mobile);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: touchBox.x + touchBox.width / 2,
        y: touchBox.y + touchBox.height / 2,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: touchBox.x + touchBox.width / 2,
        y: touchBox.y + touchBox.height / 2 - 15,
      },
    ],
  });
  await mobile.locator(".stack-drag-ghost").waitFor();
  const before = await mobile.evaluate(() => window.scrollY);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 100, y: 20 }],
  });
  await mobile.waitForFunction((y) => window.scrollY < y, before);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 1, y: 20 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await mobile.locator(".piece-card.placed").count(), 0);
  console.log(
    "Practice API validation, mobile touch drag and edge scrolling: passed",
  );
  assert.deepEqual(errors, []);
  assert(
    completionStatuses.length >= 4,
    "Daily and Practice must reach completion API",
  );
  assert(
    completionStatuses.every((status) => status === 200),
    `Completion responses: ${completionStatuses.join(",")}`,
  );
  await browser.close();
}
void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
