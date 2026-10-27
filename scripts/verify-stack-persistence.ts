import assert from "node:assert/strict";
import { chromium, type Page } from "@playwright/test";
import { getDailyStackPuzzle } from "../src/lib/games/perfect-stack/daily";
import { solveStackPuzzle } from "../src/lib/games/perfect-stack/solver";
import {
  STACK_DIFFICULTIES,
  getDragAnchor,
  oriented,
  type PublicStackPuzzle,
  type StackDifficulty,
  type StackPlacement,
} from "../src/lib/games/perfect-stack";

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(() => {
      const state = window as Window & { firstStackBoard?: string[] };
      new MutationObserver(() => {
        const cells = document.querySelectorAll("[data-stack-cell]");
        if (cells.length && !state.firstStackBoard)
          state.firstStackBoard = Array.from(cells, (cell) => cell.className);
      }).observe(document, { childList: true, subtree: true });
    });
    let submissions = 0;
    const errors: string[] = [];
    context.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/games/complete")
      )
        submissions++;
    });
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    const page = await context.newPage(),
      base = process.env.STACK_TEST_URL ?? "http://localhost:3000";
    const popup = (target = page) =>
      target.getByRole("dialog", { name: "Perfect stack!" });
    const reset = (target = page) =>
      target.getByRole("button", { name: "Reset", exact: true });
    const undo = (target = page) =>
      target.getByRole("button", { name: "Undo", exact: true });
    async function load(difficulty: StackDifficulty, target = page) {
      await target.goto(
        `${base}/games/perfect-stack?difficulty=${difficulty}`,
        { waitUntil: "networkidle" },
      );
      await target.locator(".stack-grid").waitFor();
    }
    async function switchTo(difficulty: StackDifficulty) {
      if (await popup().isVisible())
        await popup().getByRole("button", { name: "Back to board" }).click();
      await page
        .locator(".stack-difficulties a")
        .filter({ hasText: difficulty.toUpperCase() })
        .click();
      await page.waitForURL(
        (url) => url.searchParams.get("difficulty") === difficulty,
      );
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll("[data-stack-cell]").length === count,
        STACK_DIFFICULTIES[difficulty].rows ** 2,
      );
    }
    async function snapshot(target: Page = page) {
      await popup(target).waitFor();
      return {
        board: await target
          .locator("[data-stack-cell]")
          .evaluateAll((cells) => cells.map((cell) => cell.className)),
        stats: await target.locator(".stat-row").innerText(),
        result: await popup(target).locator("dd").allTextContents(),
        stars: await popup(target)
          .locator(".stack-victory-stars")
          .getAttribute("aria-label"),
        preview: await popup(target)
          .locator("svg rect")
          .evaluateAll((cells) =>
            cells.map((cell) => cell.getAttribute("fill")),
          ),
      };
    }
    async function assertLocked(target = page) {
      assert(await reset(target).isDisabled());
      assert(await undo(target).isDisabled());
      assert.equal(
        await target.locator(".piece-card:not(:disabled)").count(),
        0,
      );
    }
    async function place(
      puzzle: PublicStackPuzzle,
      placement: StackPlacement,
      rotations: Map<string, number>,
    ) {
      const piece = puzzle.pieces.find(
        (piece) => piece.id === placement.pieceId,
      )!;
      const card = page.getByRole("button", {
        name: `${piece.id}: drag`,
        exact: false,
      });
      const turns =
        (placement.rotation - (rotations.get(piece.id) ?? 0) + 4) % 4 || 4;
      for (let turn = 0; turn < turns; turn++) await card.press("Enter");
      rotations.set(piece.id, placement.rotation);
      const anchor = getDragAnchor(oriented(piece, placement.rotation));
      await page
        .locator(
          `[data-row="${placement.anchor[0] + anchor[0]}"][data-col="${placement.anchor[1] + anchor[1]}"]`,
        )
        .click();
    }
    const small = await getDailyStackPuzzle("small"),
      medium = await getDailyStackPuzzle("medium");
    const smallSolution = solveStackPuzzle(small),
      mediumSolution = solveStackPuzzle(medium);
    assert(smallSolution.solved && mediumSolution.solved);
    await load("small");
    assert(!(await reset().isDisabled()));
    assert(await undo().isDisabled());
    const rotations = new Map<string, number>();
    await place(small, smallSolution.placements[0], rotations);
    assert(!(await undo().isDisabled()));
    await undo().click();
    assert.equal(await page.locator(".piece-card.placed").count(), 0);
    await place(small, smallSolution.placements[0], rotations);
    await reset().click();
    rotations.clear();
    assert.equal(await page.locator(".piece-card.placed").count(), 0);
    // Deliberately use two extra commits so restored stars are also checked for a non-perfect run.
    for (let i = 0; i < 2; i++) {
      await place(small, smallSolution.placements[0], rotations);
      await undo().click();
    }
    const smallPosted = page.waitForResponse(
      (response) => response.url().endsWith("/api/games/complete"),
      { timeout: 45000 },
    );
    for (const placement of smallSolution.placements)
      await place(small, placement, rotations);
    const smallSnapshot = await snapshot();
    assert.equal((await smallPosted).status(), 200);
    assert.equal(smallSnapshot.stars, "2 out of 3 stars");
    await assertLocked();
    const storage = await page.evaluate(() =>
      localStorage.getItem("skg-stack-progress-v2"),
    );
    assert(storage);
    const saved = JSON.parse(storage);
    assert.equal(
      saved[small.challengeDate!].difficulties.small.puzzleSeed,
      small.seed,
    );
    assert.equal(
      saved[small.challengeDate!].difficulties.small.placements.length,
      5,
    );
    await switchTo("medium");
    assert(!(await reset().isDisabled()));
    assert.equal(await page.locator(".piece-card.placed").count(), 0);
    await switchTo("small");
    assert.deepEqual(await snapshot(), smallSnapshot);
    assert.equal(submissions, 1);
    await assertLocked();
    await switchTo("medium");
    rotations.clear();
    const mediumPosted = page.waitForResponse(
      (response) => response.url().endsWith("/api/games/complete"),
      { timeout: 45000 },
    );
    for (const placement of mediumSolution.placements)
      await place(medium, placement, rotations);
    const mediumSnapshot = await snapshot();
    assert.equal((await mediumPosted).status(), 200);
    await switchTo("hard");
    assert(!(await reset().isDisabled()));
    assert.equal(await page.locator(".piece-card.placed").count(), 0);
    await switchTo("medium");
    assert.deepEqual(await snapshot(), mediumSnapshot);
    await assertLocked();
    await switchTo("small");
    assert.deepEqual(await snapshot(), smallSnapshot);
    const completeStorage = await page.evaluate(() =>
      localStorage.getItem("skg-stack-progress-v2"),
    );
    assert(completeStorage);
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await snapshot(), smallSnapshot);
    await assertLocked();
    const firstPaint = await page.evaluate(
      () => (window as Window & { firstStackBoard?: string[] }).firstStackBoard,
    );
    assert.equal(firstPaint?.length, 25);
    assert(
      firstPaint?.every((classes) =>
        /\b(blue|gold|green|coral|violet|cyan|rose|lime)\b/.test(classes),
      ),
      "A restored board must never render empty first",
    );
    const reopened = await context.newPage();
    await load("small", reopened);
    assert.deepEqual(await snapshot(reopened), smallSnapshot);
    await assertLocked(reopened);
    await reopened.close();
    await page.waitForTimeout(1100);
    assert.deepEqual(
      await snapshot(),
      smallSnapshot,
      "A restored timer must remain stopped",
    );
    assert.equal(
      submissions,
      2,
      "Revisits and reloads must not post completion again",
    );
    console.log(
      "PASS: independent Small/Medium solved snapshots, original moves/time/stars, refresh/reopen, no empty-board flash, no duplicate submissions",
    );
    const all = JSON.parse(completeStorage),
      entry = all[small.challengeDate!].difficulties.small;
    const invalid = [
      { ...entry, placements: undefined },
      { ...entry, puzzleSeed: "stale-seed" },
      { ...entry, placements: entry.placements.slice(1) },
      { ...entry, placements: entry.placements.map(() => entry.placements[0]) },
    ];
    for (const result of invalid) {
      const changed = structuredClone(all);
      changed[small.challengeDate!].difficulties.small = result;
      await page.evaluate(
        (value) => localStorage.setItem("skg-stack-progress-v2", value),
        JSON.stringify(changed),
      );
      await load("small");
      assert(!(await reset().isDisabled()));
      assert.equal(await page.locator(".piece-card.placed").count(), 0);
      assert.equal(await popup().count(), 0);
    }
    const previousDay = new Date(small.challengeDate! + "T12:00:00Z");
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const yesterday = previousDay.toISOString().slice(0, 10);
    const rolled = structuredClone(all);
    delete rolled[small.challengeDate!].difficulties.small;
    rolled[yesterday] = { date: yesterday, difficulties: { small: entry } };
    await page.evaluate(
      (value) => localStorage.setItem("skg-stack-progress-v2", value),
      JSON.stringify(rolled),
    );
    await load("small");
    assert(!(await reset().isDisabled()));
    assert.equal(await page.locator(".piece-card.placed").count(), 0);
    await page.evaluate(
      (value) => localStorage.setItem("skg-stack-progress-v2", value),
      completeStorage,
    );
    await page.goto(
      base +
        "/games/perfect-stack?mode=practice&difficulty=small&seed=daily-snapshot-test",
      { waitUntil: "networkidle" },
    );
    await page.locator(".stack-grid").waitFor();
    assert(!(await reset().isDisabled()));
    assert.equal(await page.locator(".piece-card.placed").count(), 0);
    assert.equal(submissions, 2);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: legacy/stale/corrupt results stay playable, previous date is isolated, Practice never restores Daily placements",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
