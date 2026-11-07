import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { generateStackPuzzle } from "../src/lib/games/perfect-stack/generator";
import {
  getPracticeStackSeed,
  getDragAnchor,
  oriented,
} from "../src/lib/games/perfect-stack";

async function main() {
  const boundariesOnly = process.argv.includes("--boundaries-only");
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  let checks = 0;
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const puzzle = generateStackPuzzle(
      "hard",
      getPracticeStackSeed("board-drag", "hard"),
    ).publicPuzzle;
    await page.goto(
      `${process.env.STACK_TEST_URL ?? "http://localhost:3000"}/games/perfect-stack?mode=practice&difficulty=hard&seed=board-drag`,
    );
    await page.locator(".piece-card").first().waitFor();
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    const cell = (r: number, c: number) =>
      page.locator(`[data-stack-cell][data-row="${r}"][data-col="${c}"]`);
    async function drag(
      source: ReturnType<typeof page.locator>,
      r: number,
      c: number,
    ) {
      await source.scrollIntoViewIfNeeded();
      const from = (await source.boundingBox())!;
      const fromX =
        boundariesOnly && (await source.getAttribute("data-stack-cell"))
          ? from.x - 1
          : from.x + from.width / 2;
      await page.mouse.move(fromX, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(fromX + 10, from.y + from.height / 2, { steps: 2 });
      await cell(r, c).scrollIntoViewIfNeeded();
      const to = (await cell(r, c).boundingBox())!;
      await page.mouse.move(
        boundariesOnly ? to.x - 1 : to.x + to.width / 2,
        to.y + to.height / 2,
        {
          steps: 3,
        },
      );
      await page.waitForTimeout(20);
      assert.equal(
        await page.locator(".stack-drag-ghost.valid").count(),
        1,
        `Valid drag to ${r},${c}: ${await page.locator(".board-message").innerText()}`,
      );
      await page.mouse.up();
    }
    for (const piece of boundariesOnly
      ? puzzle.pieces.slice(0, 1)
      : puzzle.pieces) {
      const card = page.getByRole("button", {
        name: `${piece.id}: drag`,
        exact: false,
      });
      for (let rotation = 0; rotation < 4; rotation++) {
        console.log(piece.id, rotation, checks);
        const shape = oriented(piece, rotation);
        const anchor = getDragAnchor(shape);
        await drag(card, anchor[0], anchor[1]);
        for (const [r, c] of shape) {
          await drag(cell(r, c), r, c + 1);
          await drag(cell(r, c + 1), r, c);
          checks += 2;
        }
        await card.press("Enter"); // Pick up before rotating.
        await card.press("Enter");
      }
    }
    const first = puzzle.pieces[0];
    const anchor = getDragAnchor(oriented(first, 0));
    await drag(
      page.getByRole("button", { name: `${first.id}: drag`, exact: false }),
      anchor[0],
      anchor[1],
    );
    await cell(anchor[0], anchor[1]).click();
    assert.equal(
      await page.locator(".piece-card.placed").count(),
      0,
      "Click still picks up a boarded piece",
    );
    console.log(
      `Passed ${checks} board drags across every piece cell and rotation.`,
    );
  } finally {
    await browser.close();
  }
}
void main();
