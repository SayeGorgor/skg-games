import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { generateStackPuzzle } from "../src/lib/games/perfect-stack/generator";
import {
  getPracticeStackSeed,
  getDragAnchor,
  oriented,
} from "../src/lib/games/perfect-stack";

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const results: unknown[] = [];
  await mkdir("artifacts/stack-tray", { recursive: true });
  try {
    const generated = generateStackPuzzle(
      "hard",
      getPracticeStackSeed("tray-density", "hard"),
    );
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
    ]) {
      for (const theme of ["dark", "light"]) {
        const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: width === 390,
        });
        await context.addInitScript({
          content: "globalThis.__name = fn => fn;",
        });
        await context.addInitScript(
          (theme) => localStorage.setItem("skg-theme", theme),
          theme,
        );
        await context.route("**/api/games/complete", (route) =>
          route.fulfill({ json: { ok: true, persisted: false } }),
        );
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(
          `${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/games/perfect-stack?mode=practice&difficulty=hard&seed=tray-density`,
          { waitUntil: "networkidle" },
        );
        await page.locator(".piece-card").first().waitFor();
        if (width < 900)
          await page
            .locator("#perfect-stack-play")
            .evaluate((el) =>
              el.scrollIntoView({ block: "start", behavior: "instant" }),
            );
        const gameplayScroll = await page.evaluate(() => scrollY);
        const grid = page.locator(".piece-grid");
        const initial = await page.locator(".piece-card").evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height];
          }),
        );
        const scroll = await grid.evaluate(
          (el) =>
            (el.scrollTop = Math.min(80, el.scrollHeight - el.clientHeight)),
        );
        assert(scroll > 0);
        const assertScroll = async (label: string) =>
          assert.equal(
            await grid.evaluate((el) => el.scrollTop),
            scroll,
            `${theme} ${label} scroll stays put`,
          );
        const assertShapes = async () =>
          assert(
            await page.locator(".piece-card").evaluateAll((cards) =>
              cards.every((card) => {
                const r = card.getBoundingClientRect(),
                  shape = card
                    .querySelector(".piece-shape")!
                    .getBoundingClientRect();
                return (
                  shape.x >= r.x &&
                  shape.y >= r.y &&
                  shape.right <= r.right + 1 &&
                  shape.bottom <= r.bottom + 1 &&
                  [...card.querySelectorAll("i:not(.empty)")].every((el) => {
                    const c = el.getBoundingClientRect();
                    return (
                      Math.abs(c.width - c.height) < 0.1 && c.width >= 13.9
                    );
                  })
                );
              }),
            ),
            "All rotations fit with square cells",
          );
        const selected = page.locator(".piece-card").nth(3);
        const before = await selected.boundingBox();
        await selected.click();
        await assertScroll("select");
        for (let i = 0; i < 3; i++) {
          await selected.press("Enter");
          await assertShapes();
          await assertScroll("rotate");
        }
        assert.deepEqual(
          await selected.boundingBox(),
          before,
          "Selection/rotation do not resize cards",
        );
        await page.waitForTimeout(1200);
        await assertScroll("timer tick");
        const chosen = generated.publicPuzzle.pieces[3];
        const placement = generated.canonicalSolution.find(
          (p) => p.pieceId === chosen.id,
        )!;
        // Four prior activations return this piece to rotation zero.
        for (let i = 0; i < placement.rotation; i++)
          await selected.press("Enter");
        const anchor = getDragAnchor(oriented(chosen, placement.rotation));
        const target = await page
          .locator(
            `[data-row="${placement.anchor[0] + anchor[0]}"][data-col="${placement.anchor[1] + anchor[1]}"]`,
          )
          .boundingBox();
        const source = await selected.boundingBox();
        assert(source && target);
        await page.mouse.move(
          source.x + source.width / 2,
          source.y + source.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          source.x + source.width / 2 + 12,
          source.y + source.height / 2,
        );
        await page.locator(".stack-drag-ghost").waitFor();
        // Leave the tray directly: dwelling at its edge deliberately scrolls
        // during a drag, which verify-stack.ts covers as a separate interaction.
        await page.mouse.move(
          target.x + target.width / 2,
          target.y + target.height / 2,
        );
        await page.mouse.up();
        assert.equal(await page.locator(".piece-card.placed").count(), 1);
        await assertScroll("drag placement");
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        assert.equal(await page.locator(".piece-card.placed").count(), 0);
        await assertScroll("undo");
        await page.getByRole("button", { name: "Reset", exact: true }).click();
        await assertScroll("reset");
        const checkpoints = new Set([13, 10, 8, 5, 3, 0]);
        const record = async (remaining: number) => {
          await assertScroll(`${remaining} remaining`);
          await assertShapes();
          const positions = await page
            .locator(".piece-card")
            .evaluateAll((els) =>
              els.map((el) => {
                const r = el.getBoundingClientRect();
                return [
                  r.x,
                  r.y + el.closest(".piece-grid")!.scrollTop,
                  r.width,
                  r.height,
                ];
              }),
            );
          assert.deepEqual(
            positions,
            initial,
            "Slots/order remain stable after placement",
          );
          results.push({
            theme,
            width,
            height,
            remaining,
            scrollTop: await grid.evaluate((el) => el.scrollTop),
            cards: await page.locator(".piece-card").count(),
          });
        };
        await record(13);
        for (const [index, p] of generated.canonicalSolution.entries()) {
          const card = page.getByRole("button", {
            name: new RegExp(`^${p.pieceId}:`),
          });
          // Programmatic activation isolates React rerenders from native focus scrolling.
          // Real keyboard, pointer and native touch paths are covered by verify-stack.ts.
          for (let i = 0; i < p.rotation + 4; i++)
            await card.evaluate((el) => (el as HTMLButtonElement).click());
          const piece = generated.publicPuzzle.pieces.find(
            (piece) => piece.id === p.pieceId,
          )!;
          const a = getDragAnchor(oriented(piece, p.rotation));
          await page
            .locator(
              `[data-row="${p.anchor[0] + a[0]}"][data-col="${p.anchor[1] + a[1]}"]`,
            )
            .press("Enter");
          await page.waitForFunction(
            (count) =>
              document.querySelectorAll(".piece-card.placed").length === count,
            index + 1,
          );
          const remaining = generated.publicPuzzle.pieceCount - index - 1;
          if (checkpoints.has(remaining)) await record(remaining);
        }
        await page.locator(".stack-victory-dialog[open]").waitFor();
        await page
          .getByRole("button", { name: "Back to board", exact: true })
          .click();
        await assertScroll("results close");
        assert.equal(await page.evaluate(() => scrollY), gameplayScroll);
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${theme} ${width}x${height}: scroll/select/rotate/timer/drag/place/undo/reset, fixed slots, remaining counts 13/10/8/5/3/0`,
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await writeFile(
      "artifacts/stack-tray/interactions.json",
      JSON.stringify(results, null, 2),
    );
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
